import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  SWEBenchProblem,
  TaskDistribution,
  SubTask,
  DependencyGraph,
  Agent,
  TaskStatus,
  CoordinationPlan,
  TaskFlow,
  SwarmConfig,
  SwarmException
} from '../types';
import { Logger } from '../utils/Logger';

/**
 * TaskOrchestrator - Manages task distribution and orchestration
 */
export class TaskOrchestrator extends EventEmitter {
  private activeTasks: Map<string, TaskStatus> = new Map();
  private taskDistributions: Map<string, TaskDistribution> = new Map();
  private logger: Logger;
  private config?: SwarmConfig;

  constructor() {
    super();
    this.logger = new Logger('TaskOrchestrator');
  }

  /**
   * Configure the orchestrator with swarm configuration
   */
  public async configure(config: SwarmConfig): Promise<void> {
    this.config = config;
    this.logger.info('TaskOrchestrator configured', { strategy: config.strategy });
  }

  /**
   * Create task distribution for a SWE-Bench problem
   */
  public async createDistribution(
    problem: SWEBenchProblem, 
    analysis: any
  ): Promise<TaskDistribution> {
    this.logger.info('Creating task distribution', { problemId: problem.id });

    const taskId = uuidv4();
    const subtasks = await this.createSubTasks(problem, analysis);
    const dependencies = this.buildDependencyGraph(subtasks);

    const distribution: TaskDistribution = {
      taskId,
      subtasks,
      agentAssignments: new Map(),
      dependencies,
      estimatedCompletion: this.calculateEstimatedCompletion(subtasks),
      priority: this.determinePriority(problem, analysis)
    };

    this.taskDistributions.set(taskId, distribution);
    
    // Initialize task status
    const taskStatus: TaskStatus = {
      taskId,
      status: 'pending',
      progress: 0,
      assignedAgents: [],
      startTime: new Date()
    };
    this.activeTasks.set(taskId, taskStatus);

    this.logger.info('Task distribution created', { 
      taskId, 
      subtaskCount: subtasks.length 
    });

    return distribution;
  }

  /**
   * Create coordination plan for agents working on a task
   */
  public async createCoordinationPlan(agents: Agent[], task: any): Promise<CoordinationPlan> {
    this.logger.info('Creating coordination plan', { 
      agentCount: agents.length,
      taskType: task.type 
    });

    const planId = uuidv4();
    const taskFlow = this.generateTaskFlow(agents, task);
    const communicationMatrix = this.buildCommunicationMatrix(agents);
    const resourceAllocation = this.allocateResources(agents);
    const monitoringPoints = this.defineMonitoringPoints(agents, task);

    return {
      id: planId,
      agents,
      taskFlow,
      communicationMatrix,
      resourceAllocation,
      monitoringPoints
    };
  }

  /**
   * Get current status of a task
   */
  public async getTaskStatus(taskId: string): Promise<TaskStatus> {
    const status = this.activeTasks.get(taskId);
    if (!status) {
      throw new SwarmException('TASK_NOT_FOUND', `Task ${taskId} not found`);
    }

    // Update progress based on subtask completion
    const distribution = this.taskDistributions.get(taskId);
    if (distribution) {
      const completedSubtasks = distribution.subtasks.filter(st => st.status === 'completed').length;
      status.progress = (completedSubtasks / distribution.subtasks.length) * 100;
    }

    return status;
  }

  /**
   * Update task status when subtask completes
   */
  public async updateSubTaskStatus(
    taskId: string, 
    subtaskId: string, 
    status: SubTask['status'],
    result?: any
  ): Promise<void> {
    const distribution = this.taskDistributions.get(taskId);
    if (!distribution) {
      throw new SwarmException('TASK_NOT_FOUND', `Task ${taskId} not found`);
    }

    const subtask = distribution.subtasks.find(st => st.id === subtaskId);
    if (!subtask) {
      throw new SwarmException('SUBTASK_NOT_FOUND', `Subtask ${subtaskId} not found`);
    }

    subtask.status = status;
    if (result) {
      subtask.result = result;
    }

    // Check if all subtasks are completed
    const allCompleted = distribution.subtasks.every(st => st.status === 'completed');
    const anyFailed = distribution.subtasks.some(st => st.status === 'failed');

    const taskStatus = this.activeTasks.get(taskId);
    if (taskStatus) {
      if (allCompleted) {
        taskStatus.status = 'completed';
        taskStatus.endTime = new Date();
        this.emit('taskCompleted', { taskId, distribution });
      } else if (anyFailed) {
        taskStatus.status = 'failed';
        taskStatus.endTime = new Date();
        this.emit('taskFailed', { taskId, distribution });
      }
    }

    this.logger.info('Subtask status updated', { 
      taskId, 
      subtaskId, 
      status,
      taskProgress: taskStatus?.progress 
    });
  }

  /**
   * Clean up completed or failed tasks
   */
  public async cleanup(sessionId?: string): Promise<void> {
    this.logger.info('Cleaning up task orchestrator', { sessionId });
    
    // Remove completed/failed tasks older than 1 hour
    const cutoffTime = new Date(Date.now() - 60 * 60 * 1000);
    
    for (const [taskId, status] of this.activeTasks.entries()) {
      if ((status.status === 'completed' || status.status === 'failed') && 
          status.endTime && status.endTime < cutoffTime) {
        this.activeTasks.delete(taskId);
        this.taskDistributions.delete(taskId);
      }
    }
  }

  // Private methods

  private async createSubTasks(problem: SWEBenchProblem, analysis: any): Promise<SubTask[]> {
    const subtasks: SubTask[] = [];

    // Research phase - analyze problem and gather context
    subtasks.push({
      id: uuidv4(),
      type: 'research',
      description: `Analyze problem requirements and repository context for ${problem.id}`,
      status: 'pending',
      dependencies: [],
      estimatedDuration: 60 // 1 minute
    });

    // Implementation phase - create solution for each file
    problem.files.forEach((file, index) => {
      subtasks.push({
        id: uuidv4(),
        type: 'implementation',
        description: `Implement solution for ${file}`,
        status: 'pending',
        dependencies: [subtasks[0].id], // Depends on research
        estimatedDuration: analysis.complexity === 'high' ? 180 : 120
      });
    });

    // Testing phase - create and run tests
    subtasks.push({
      id: uuidv4(),
      type: 'testing',
      description: `Create and execute tests for ${problem.id}`,
      status: 'pending',
      dependencies: subtasks.slice(1).map(st => st.id), // Depends on all implementations
      estimatedDuration: 90
    });

    // Review phase - quality assurance
    subtasks.push({
      id: uuidv4(),
      type: 'review',
      description: `Review and validate solution for ${problem.id}`,
      status: 'pending',
      dependencies: [subtasks[subtasks.length - 1].id], // Depends on testing
      estimatedDuration: 60
    });

    return subtasks;
  }

  private buildDependencyGraph(subtasks: SubTask[]): DependencyGraph {
    const nodes = subtasks.map(st => st.id);
    const edges: Array<{ from: string; to: string }> = [];

    subtasks.forEach(subtask => {
      subtask.dependencies.forEach(depId => {
        edges.push({ from: depId, to: subtask.id });
      });
    });

    return { nodes, edges };
  }

  private calculateEstimatedCompletion(subtasks: SubTask[]): number {
    // Calculate critical path through dependency graph
    const maxParallelDuration = this.calculateCriticalPath(subtasks);
    return Date.now() + (maxParallelDuration * 1000);
  }

  private calculateCriticalPath(subtasks: SubTask[]): number {
    // Simple implementation - find longest path considering dependencies
    const subtaskMap = new Map(subtasks.map(st => [st.id, st]));
    const durations = new Map<string, number>();

    const calculateDuration = (subtaskId: string): number => {
      if (durations.has(subtaskId)) {
        return durations.get(subtaskId)!;
      }

      const subtask = subtaskMap.get(subtaskId)!;
      let maxDepDuration = 0;

      for (const depId of subtask.dependencies) {
        maxDepDuration = Math.max(maxDepDuration, calculateDuration(depId));
      }

      const totalDuration = maxDepDuration + subtask.estimatedDuration;
      durations.set(subtaskId, totalDuration);
      return totalDuration;
    };

    let criticalPath = 0;
    for (const subtask of subtasks) {
      criticalPath = Math.max(criticalPath, calculateDuration(subtask.id));
    }

    return criticalPath;
  }

  private determinePriority(problem: SWEBenchProblem, analysis: any): TaskDistribution['priority'] {
    if (problem.difficulty === 'hard' || analysis.complexity === 'high') {
      return 'high';
    }
    if (problem.difficulty === 'medium' || analysis.complexity === 'medium') {
      return 'medium';
    }
    return 'low';
  }

  private generateTaskFlow(agents: Agent[], task: any): TaskFlow[] {
    const flow: TaskFlow[] = [];
    let step = 1;

    // Assign roles based on agent types
    const researcher = agents.find(a => a.type === 'researcher');
    const architects = agents.filter(a => a.type === 'architect');
    const coders = agents.filter(a => a.type === 'coder');
    const testers = agents.filter(a => a.type === 'tester');
    const reviewers = agents.filter(a => a.type === 'reviewer');

    // Step 1: Research (sequential)
    if (researcher) {
      flow.push({
        step: step++,
        agent: researcher.id,
        task: 'Analyze problem and gather context',
        dependencies: [],
        parallelizable: false
      });
    }

    // Step 2: Architecture design (sequential, depends on research)
    architects.forEach(architect => {
      flow.push({
        step: step,
        agent: architect.id,
        task: 'Design solution architecture',
        dependencies: researcher ? [researcher.id] : [],
        parallelizable: false
      });
    });
    if (architects.length > 0) step++;

    // Step 3: Implementation (parallel, depends on architecture)
    const architectureDeps = architects.length > 0 ? architects.map(a => a.id) : 
                           (researcher ? [researcher.id] : []);
    
    coders.forEach(coder => {
      flow.push({
        step: step,
        agent: coder.id,
        task: 'Implement solution',
        dependencies: architectureDeps,
        parallelizable: true
      });
    });
    if (coders.length > 0) step++;

    // Step 4: Testing (parallel, depends on implementation)
    const implementationDeps = coders.map(c => c.id);
    testers.forEach(tester => {
      flow.push({
        step: step,
        agent: tester.id,
        task: 'Create and execute tests',
        dependencies: implementationDeps,
        parallelizable: true
      });
    });
    if (testers.length > 0) step++;

    // Step 5: Review (sequential, depends on testing)
    const testingDeps = testers.map(t => t.id);
    reviewers.forEach(reviewer => {
      flow.push({
        step: step,
        agent: reviewer.id,
        task: 'Review and validate solution',
        dependencies: testingDeps,
        parallelizable: false
      });
    });

    return flow;
  }

  private buildCommunicationMatrix(agents: Agent[]): any {
    const matrix: any = {};

    agents.forEach(agent => {
      matrix[agent.id] = {};
      
      agents.forEach(otherAgent => {
        if (agent.id !== otherAgent.id) {
          // Determine communication needs based on agent types
          const frequency = this.determineCommunicationFrequency(agent.type, otherAgent.type);
          const protocol = frequency === 'high' ? 'websocket' : 'http';
          const priority = this.determineCommunicationPriority(agent.type, otherAgent.type);

          matrix[agent.id][otherAgent.id] = {
            frequency,
            protocol,
            priority
          };
        }
      });
    });

    return matrix;
  }

  private determineCommunicationFrequency(type1: Agent['type'], type2: Agent['type']): number {
    // High frequency communications
    if ((type1 === 'coordinator' && type2 !== 'coordinator') ||
        (type2 === 'coordinator' && type1 !== 'coordinator')) {
      return 10; // High frequency with coordinator
    }
    
    if ((type1 === 'coder' && type2 === 'tester') ||
        (type1 === 'tester' && type2 === 'coder')) {
      return 8; // High frequency between coder and tester
    }

    if ((type1 === 'architect' && type2 === 'coder') ||
        (type1 === 'coder' && type2 === 'architect')) {
      return 7; // Medium-high frequency
    }

    return 3; // Low frequency for others
  }

  private determineCommunicationPriority(type1: Agent['type'], type2: Agent['type']): 'low' | 'medium' | 'high' {
    if (type1 === 'coordinator' || type2 === 'coordinator') {
      return 'high';
    }
    
    if ((type1 === 'coder' && type2 === 'tester') ||
        (type1 === 'tester' && type2 === 'coder') ||
        (type1 === 'architect' && type2 === 'coder') ||
        (type1 === 'coder' && type2 === 'architect')) {
      return 'medium';
    }

    return 'low';
  }

  private allocateResources(agents: Agent[]): any {
    const allocation: any = {};
    const totalAgents = agents.length;
    
    agents.forEach(agent => {
      // Allocate resources based on agent type and load
      let cpuWeight = 1;
      let memoryWeight = 1;
      
      switch (agent.type) {
        case 'coordinator':
          cpuWeight = 0.5; // Coordinator is less CPU intensive
          memoryWeight = 1.5; // But needs more memory for coordination
          break;
        case 'coder':
          cpuWeight = 1.5; // Coders need more CPU
          memoryWeight = 1.2;
          break;
        case 'tester':
          cpuWeight = 1.3; // Testers need CPU for test execution
          memoryWeight = 1.0;
          break;
        case 'researcher':
        case 'architect':
        case 'reviewer':
          cpuWeight = 0.8; // Analysis work
          memoryWeight = 1.1;
          break;
      }

      allocation[agent.id] = {
        cpu: Math.max(1, Math.floor((this.config?.resources.cpu || 4) * cpuWeight / totalAgents)),
        memory: `${Math.max(1, Math.floor(4 * memoryWeight / totalAgents))}GB`,
        storage: '5GB',
        priority: agent.type === 'coordinator' ? 10 : 5
      };
    });

    return allocation;
  }

  private defineMonitoringPoints(agents: Agent[], task: any): any[] {
    return [
      {
        id: uuidv4(),
        metric: 'task_progress',
        threshold: 90, // Alert if task takes longer than 90% of estimated time
        action: 'alert'
      },
      {
        id: uuidv4(),
        metric: 'agent_cpu_usage',
        threshold: 85,
        action: 'scale_up'
      },
      {
        id: uuidv4(),
        metric: 'agent_memory_usage',
        threshold: 90,
        action: 'alert'
      },
      {
        id: uuidv4(),
        metric: 'communication_latency',
        threshold: 1000, // 1 second
        action: 'redistribute'
      }
    ];
  }
}