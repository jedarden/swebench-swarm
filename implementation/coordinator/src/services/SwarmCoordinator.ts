import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  SwarmConfig,
  SwarmSession,
  SWEBenchProblem,
  TaskDistribution,
  Agent,
  TaskStatus,
  CoordinationPlan,
  RecoveryPlan,
  SwarmException,
  PerformanceMetrics,
  ClaudeFlowSession
} from '../types';
import { TaskOrchestrator } from './TaskOrchestrator';
import { AgentManager } from './AgentManager';
import { ClaudeFlowIntegration } from './ClaudeFlowIntegration';
import { PerformanceMonitor } from './PerformanceMonitor';
import { Logger } from '../utils/Logger';

/**
 * SwarmCoordinator - Central orchestration component for SWE-Bench swarm
 * Manages swarm lifecycle, task distribution, and agent coordination
 */
export class SwarmCoordinator extends EventEmitter {
  private sessions: Map<string, SwarmSession> = new Map();
  private taskOrchestrator: TaskOrchestrator;
  private agentManager: AgentManager;
  private claudeFlowIntegration: ClaudeFlowIntegration;
  private performanceMonitor: PerformanceMonitor;
  private logger: Logger;

  constructor() {
    super();
    this.taskOrchestrator = new TaskOrchestrator();
    this.agentManager = new AgentManager();
    this.claudeFlowIntegration = new ClaudeFlowIntegration();
    this.performanceMonitor = new PerformanceMonitor();
    this.logger = new Logger('SwarmCoordinator');

    // Set up event listeners
    this.setupEventListeners();
  }

  /**
   * Initialize a new swarm session with specified configuration
   */
  public async initializeSwarm(config: SwarmConfig): Promise<SwarmSession> {
    this.logger.info('Initializing swarm', { config });

    try {
      const sessionId = uuidv4();
      const session: SwarmSession = {
        id: sessionId,
        topology: config.topology,
        maxAgents: config.maxAgents,
        activeAgents: 0,
        strategy: config.strategy,
        status: 'initializing',
        startTime: new Date()
      };

      // Initialize Claude-Flow integration if enabled
      if (config.claudeFlowIntegration) {
        const claudeFlowSession = await this.claudeFlowIntegration.initializeSwarm(config);
        session.claudeFlowSessionId = claudeFlowSession.swarmId;
      }

      // Initialize agent manager with configuration
      await this.agentManager.initialize(config);

      // Set up task orchestrator
      await this.taskOrchestrator.configure(config);

      // Start performance monitoring
      await this.performanceMonitor.startMonitoring(sessionId);

      session.status = 'active';
      this.sessions.set(sessionId, session);

      this.emit('swarmInitialized', session);
      this.logger.info('Swarm initialized successfully', { sessionId });

      return session;
    } catch (error) {
      this.logger.error('Failed to initialize swarm', error);
      throw new SwarmException('INIT_FAILED', 'Failed to initialize swarm', undefined, undefined);
    }
  }

  /**
   * Shutdown a swarm session and clean up resources
   */
  public async shutdownSwarm(sessionId: string): Promise<void> {
    this.logger.info('Shutting down swarm', { sessionId });

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SwarmException('SESSION_NOT_FOUND', `Swarm session ${sessionId} not found`);
    }

    try {
      session.status = 'shutting_down';

      // Stop all agents in the swarm
      await this.agentManager.shutdownAllAgents(sessionId);

      // Stop performance monitoring
      await this.performanceMonitor.stopMonitoring(sessionId);

      // Clean up Claude-Flow session if exists
      if (session.claudeFlowSessionId) {
        await this.claudeFlowIntegration.shutdownSwarm(session.claudeFlowSessionId);
      }

      // Clean up task orchestrator
      await this.taskOrchestrator.cleanup(sessionId);

      this.sessions.delete(sessionId);
      this.emit('swarmShutdown', sessionId);
      this.logger.info('Swarm shutdown completed', { sessionId });
    } catch (error) {
      this.logger.error('Error during swarm shutdown', error);
      throw new SwarmException('SHUTDOWN_FAILED', 'Failed to shutdown swarm', sessionId);
    }
  }

  /**
   * Distribute a SWE-Bench problem across specialized agents
   */
  public async distributeProblem(problem: SWEBenchProblem, sessionId?: string): Promise<TaskDistribution> {
    this.logger.info('Distributing problem', { problemId: problem.id, sessionId });

    try {
      // Analyze problem complexity and requirements
      const analysis = await this.analyzeProblem(problem);

      // Create task distribution plan
      const distribution = await this.taskOrchestrator.createDistribution(problem, analysis);

      // Assign agents to tasks
      await this.assignAgentsToTasks(distribution, sessionId);

      // Store distribution in Claude-Flow memory if available
      if (sessionId) {
        const session = this.sessions.get(sessionId);
        if (session?.claudeFlowSessionId) {
          await this.claudeFlowIntegration.storeTaskDistribution(
            session.claudeFlowSessionId,
            distribution
          );
        }
      }

      this.emit('problemDistributed', distribution);
      this.logger.info('Problem distributed successfully', { 
        taskId: distribution.taskId,
        subtasks: distribution.subtasks.length 
      });

      return distribution;
    } catch (error) {
      this.logger.error('Failed to distribute problem', error);
      throw new SwarmException('DISTRIBUTION_FAILED', 'Failed to distribute problem', sessionId);
    }
  }

  /**
   * Monitor task progress and status
   */
  public async monitorTaskProgress(taskId: string): Promise<TaskStatus> {
    return await this.taskOrchestrator.getTaskStatus(taskId);
  }

  /**
   * Spawn a new agent with specified type and capabilities
   */
  public async spawnAgent(
    type: Agent['type'], 
    capabilities: string[], 
    sessionId?: string
  ): Promise<Agent> {
    this.logger.info('Spawning agent', { type, capabilities, sessionId });

    try {
      const agent = await this.agentManager.spawnAgent(type, capabilities, sessionId);

      // Register agent with Claude-Flow if session exists
      if (sessionId) {
        const session = this.sessions.get(sessionId);
        if (session?.claudeFlowSessionId) {
          await this.claudeFlowIntegration.registerAgent(
            session.claudeFlowSessionId,
            agent
          );
        }
        
        // Update session agent count
        session.activeAgents++;
      }

      this.emit('agentSpawned', agent);
      this.logger.info('Agent spawned successfully', { agentId: agent.id, type });

      return agent;
    } catch (error) {
      this.logger.error('Failed to spawn agent', error);
      throw new SwarmException('AGENT_SPAWN_FAILED', 'Failed to spawn agent', sessionId);
    }
  }

  /**
   * Remove an agent from the swarm
   */
  public async removeAgent(agentId: string, sessionId?: string): Promise<void> {
    this.logger.info('Removing agent', { agentId, sessionId });

    try {
      await this.agentManager.removeAgent(agentId);

      // Update session agent count
      if (sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
          session.activeAgents--;
        }
      }

      this.emit('agentRemoved', agentId);
      this.logger.info('Agent removed successfully', { agentId });
    } catch (error) {
      this.logger.error('Failed to remove agent', error);
      throw new SwarmException('AGENT_REMOVAL_FAILED', 'Failed to remove agent', sessionId, agentId);
    }
  }

  /**
   * Coordinate agents for a specific task
   */
  public async coordinateAgents(agents: Agent[], task: any): Promise<CoordinationPlan> {
    this.logger.info('Coordinating agents', { 
      agentCount: agents.length, 
      taskType: task.type 
    });

    try {
      const plan = await this.taskOrchestrator.createCoordinationPlan(agents, task);
      
      // Store coordination plan in Claude-Flow memory
      await this.claudeFlowIntegration.storeCoordinationPlan(plan);

      this.emit('agentsCoordinated', plan);
      this.logger.info('Agent coordination plan created', { planId: plan.id });

      return plan;
    } catch (error) {
      this.logger.error('Failed to coordinate agents', error);
      throw new SwarmException('COORDINATION_FAILED', 'Failed to coordinate agents');
    }
  }

  /**
   * Handle agent failure and implement recovery strategy
   */
  public async handleAgentFailure(agentId: string, sessionId?: string): Promise<RecoveryPlan> {
    this.logger.warn('Handling agent failure', { agentId, sessionId });

    try {
      // Analyze failure impact
      const failedAgent = await this.agentManager.getAgent(agentId);
      if (!failedAgent) {
        throw new SwarmException('AGENT_NOT_FOUND', `Agent ${agentId} not found`);
      }

      // Create recovery plan
      const recoveryPlan = await this.createRecoveryPlan(failedAgent, sessionId);

      // Execute recovery if possible
      if (recoveryPlan.replacementAgent) {
        await this.executeRecovery(recoveryPlan, sessionId);
      }

      this.emit('agentFailureHandled', { agentId, recoveryPlan });
      this.logger.info('Agent failure handled', { 
        agentId, 
        recoveryDelay: recoveryPlan.estimatedDelay 
      });

      return recoveryPlan;
    } catch (error) {
      this.logger.error('Failed to handle agent failure', error);
      throw new SwarmException('RECOVERY_FAILED', 'Failed to handle agent failure', sessionId, agentId);
    }
  }

  /**
   * Get performance metrics for the swarm
   */
  public async getPerformanceMetrics(sessionId: string): Promise<PerformanceMetrics> {
    return await this.performanceMonitor.getMetrics(sessionId);
  }

  /**
   * Get list of active swarm sessions
   */
  public getActiveSessions(): SwarmSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get specific swarm session by ID
   */
  public getSession(sessionId: string): SwarmSession | undefined {
    return this.sessions.get(sessionId);
  }

  // Private methods

  private setupEventListeners(): void {
    this.agentManager.on('agentError', this.handleAgentError.bind(this));
    this.taskOrchestrator.on('taskCompleted', this.handleTaskCompletion.bind(this));
    this.taskOrchestrator.on('taskFailed', this.handleTaskFailure.bind(this));
    this.performanceMonitor.on('performanceAlert', this.handlePerformanceAlert.bind(this));
  }

  private async analyzeProblem(problem: SWEBenchProblem): Promise<any> {
    // Analyze problem complexity, required skills, resource needs
    return {
      complexity: this.estimateComplexity(problem),
      requiredSkills: this.extractRequiredSkills(problem),
      estimatedTime: this.estimateCompletionTime(problem),
      resourceNeeds: this.calculateResourceNeeds(problem)
    };
  }

  private estimateComplexity(problem: SWEBenchProblem): 'low' | 'medium' | 'high' {
    const factors = {
      fileCount: problem.files.length,
      testCount: problem.testCases.length,
      descriptionLength: problem.description.length,
      difficulty: problem.difficulty
    };

    // Simple heuristic for complexity estimation
    if (factors.fileCount <= 2 && factors.difficulty === 'easy') return 'low';
    if (factors.fileCount >= 5 || factors.difficulty === 'hard') return 'high';
    return 'medium';
  }

  private extractRequiredSkills(problem: SWEBenchProblem): string[] {
    const skills: string[] = [];
    
    // Analyze file extensions for technology stack
    problem.files.forEach(file => {
      const ext = file.split('.').pop();
      switch (ext) {
        case 'py': skills.push('python'); break;
        case 'js': case 'ts': skills.push('javascript', 'typescript'); break;
        case 'java': skills.push('java'); break;
        case 'cpp': case 'c': skills.push('cpp'); break;
        case 'rs': skills.push('rust'); break;
      }
    });

    // Analyze description for domain knowledge
    const desc = problem.description.toLowerCase();
    if (desc.includes('algorithm')) skills.push('algorithms');
    if (desc.includes('database') || desc.includes('sql')) skills.push('database');
    if (desc.includes('web') || desc.includes('http')) skills.push('web');
    if (desc.includes('test')) skills.push('testing');

    return [...new Set(skills)];
  }

  private estimateCompletionTime(problem: SWEBenchProblem): number {
    const baseTime = 300; // 5 minutes base
    const complexity = this.estimateComplexity(problem);
    
    switch (complexity) {
      case 'low': return baseTime;
      case 'medium': return baseTime * 2;
      case 'high': return baseTime * 4;
      default: return baseTime;
    }
  }

  private calculateResourceNeeds(problem: SWEBenchProblem): any {
    return {
      cpu: 2,
      memory: '4GB',
      storage: '10GB',
      agents: Math.min(Math.ceil(problem.files.length / 2), 6)
    };
  }

  private async assignAgentsToTasks(distribution: TaskDistribution, sessionId?: string): Promise<void> {
    for (const subtask of distribution.subtasks) {
      const availableAgents = await this.agentManager.getAvailableAgents(subtask.type);
      if (availableAgents.length > 0) {
        subtask.assignedAgent = availableAgents[0].id;
        await this.agentManager.assignTask(availableAgents[0].id, subtask);
      }
    }
  }

  private async createRecoveryPlan(failedAgent: Agent, sessionId?: string): Promise<RecoveryPlan> {
    // Find replacement agent with similar capabilities
    const availableAgents = await this.agentManager.getAvailableAgents(failedAgent.type);
    const replacementAgent = availableAgents.find(agent => 
      agent.capabilities.some(cap => failedAgent.capabilities.includes(cap))
    );

    return {
      replacementAgent: replacementAgent || null,
      taskReassignment: failedAgent.currentTask ? {
        originalAgent: failedAgent.id,
        newAgent: replacementAgent?.id || '',
        affectedTasks: [failedAgent.currentTask],
        reschedulingRequired: true
      } : null,
      estimatedDelay: replacementAgent ? 30 : 120, // seconds
      impactAnalysis: {
        criticalTasks: failedAgent.currentTask ? [failedAgent.currentTask] : [],
        dependentAgents: [],
        estimatedCompletionDelay: 60,
        alternativeStrategies: ['redistribute_tasks', 'spawn_new_agent']
      }
    };
  }

  private async executeRecovery(plan: RecoveryPlan, sessionId?: string): Promise<void> {
    if (plan.replacementAgent && plan.taskReassignment) {
      await this.agentManager.assignTask(
        plan.replacementAgent.id,
        { id: plan.taskReassignment.affectedTasks[0] } as any
      );
    }
  }

  private async handleAgentError(error: any): Promise<void> {
    this.logger.error('Agent error occurred', error);
    await this.handleAgentFailure(error.agentId, error.sessionId);
  }

  private async handleTaskCompletion(task: any): Promise<void> {
    this.logger.info('Task completed', { taskId: task.id });
    this.emit('taskCompleted', task);
  }

  private async handleTaskFailure(task: any): Promise<void> {
    this.logger.error('Task failed', { taskId: task.id, error: task.error });
    this.emit('taskFailed', task);
  }

  private async handlePerformanceAlert(alert: any): Promise<void> {
    this.logger.warn('Performance alert', alert);
    this.emit('performanceAlert', alert);
  }
}