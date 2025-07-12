import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  Agent,
  AgentPerformance,
  AgentResources,
  SwarmConfig,
  SubTask,
  SwarmException
} from '../types';
import { Logger } from '../utils/Logger';

/**
 * AgentManager - Manages agent lifecycle, assignment, and monitoring
 */
export class AgentManager extends EventEmitter {
  private agents: Map<string, Agent> = new Map();
  private agentPerformance: Map<string, AgentPerformance> = new Map();
  private agentTasks: Map<string, string[]> = new Map(); // agentId -> taskIds
  private logger: Logger;
  private config?: SwarmConfig;

  constructor() {
    super();
    this.logger = new Logger('AgentManager');
  }

  /**
   * Initialize agent manager with swarm configuration
   */
  public async initialize(config: SwarmConfig): Promise<void> {
    this.config = config;
    this.logger.info('AgentManager initialized', { maxAgents: config.maxAgents });
  }

  /**
   * Spawn a new agent with specified capabilities
   */
  public async spawnAgent(
    type: Agent['type'],
    capabilities: string[],
    sessionId?: string
  ): Promise<Agent> {
    this.logger.info('Spawning agent', { type, capabilities, sessionId });

    const agentId = uuidv4();
    const agent: Agent = {
      id: agentId,
      type,
      name: `${type}-${agentId.substring(0, 8)}`,
      capabilities,
      status: 'idle',
      performance: {
        tasksCompleted: 0,
        averageTime: 0,
        successRate: 100,
        qualityScore: 100,
        lastUpdated: new Date()
      },
      resources: {
        cpuUsage: 0,
        memoryUsage: 0,
        diskUsage: 0,
        networkUsage: 0
      }
    };

    this.agents.set(agentId, agent);
    this.agentPerformance.set(agentId, agent.performance);
    this.agentTasks.set(agentId, []);

    // Start monitoring agent resources
    this.startAgentMonitoring(agentId);

    this.emit('agentSpawned', agent);
    this.logger.info('Agent spawned successfully', { agentId, type });

    return agent;
  }

  /**
   * Remove an agent from the swarm
   */
  public async removeAgent(agentId: string): Promise<void> {
    this.logger.info('Removing agent', { agentId });

    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new SwarmException('AGENT_NOT_FOUND', `Agent ${agentId} not found`);
    }

    // Check if agent has active tasks
    const activeTasks = this.agentTasks.get(agentId) || [];
    if (activeTasks.length > 0) {
      this.logger.warn('Removing agent with active tasks', { 
        agentId, 
        activeTasks: activeTasks.length 
      });
      // Emit event for task reassignment
      this.emit('agentRemovedWithTasks', { agentId, activeTasks });
    }

    // Clean up agent data
    this.agents.delete(agentId);
    this.agentPerformance.delete(agentId);
    this.agentTasks.delete(agentId);

    this.emit('agentRemoved', agentId);
    this.logger.info('Agent removed successfully', { agentId });
  }

  /**
   * Get available agents of a specific type
   */
  public async getAvailableAgents(type?: Agent['type']): Promise<Agent[]> {
    const availableAgents = Array.from(this.agents.values()).filter(agent => {
      const typeMatch = !type || agent.type === type;
      const isAvailable = agent.status === 'idle';
      return typeMatch && isAvailable;
    });

    // Sort by performance score (best agents first)
    return availableAgents.sort((a, b) => 
      b.performance.qualityScore - a.performance.qualityScore
    );
  }

  /**
   * Get agent by ID
   */
  public async getAgent(agentId: string): Promise<Agent | undefined> {
    return this.agents.get(agentId);
  }

  /**
   * Get all agents in the swarm
   */
  public async getAllAgents(): Promise<Agent[]> {
    return Array.from(this.agents.values());
  }

  /**
   * Assign a task to an agent
   */
  public async assignTask(agentId: string, task: SubTask): Promise<void> {
    this.logger.info('Assigning task to agent', { agentId, taskId: task.id });

    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new SwarmException('AGENT_NOT_FOUND', `Agent ${agentId} not found`);
    }

    if (agent.status !== 'idle') {
      throw new SwarmException('AGENT_BUSY', `Agent ${agentId} is not available`);
    }

    // Update agent status
    agent.status = 'busy';
    agent.currentTask = task.id;

    // Track task assignment
    const agentTasks = this.agentTasks.get(agentId) || [];
    agentTasks.push(task.id);
    this.agentTasks.set(agentId, agentTasks);

    this.emit('taskAssigned', { agentId, taskId: task.id });
    this.logger.info('Task assigned successfully', { agentId, taskId: task.id });
  }

  /**
   * Complete a task for an agent
   */
  public async completeTask(
    agentId: string, 
    taskId: string, 
    success: boolean,
    executionTime: number,
    qualityScore?: number
  ): Promise<void> {
    this.logger.info('Completing task for agent', { 
      agentId, 
      taskId, 
      success, 
      executionTime 
    });

    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new SwarmException('AGENT_NOT_FOUND', `Agent ${agentId} not found`);
    }

    // Update agent status
    agent.status = 'idle';
    agent.currentTask = undefined;

    // Remove task from agent's task list
    const agentTasks = this.agentTasks.get(agentId) || [];
    const updatedTasks = agentTasks.filter(id => id !== taskId);
    this.agentTasks.set(agentId, updatedTasks);

    // Update performance metrics
    await this.updateAgentPerformance(agentId, success, executionTime, qualityScore);

    this.emit('taskCompleted', { agentId, taskId, success });
    this.logger.info('Task completed for agent', { agentId, taskId, success });
  }

  /**
   * Update agent performance metrics
   */
  private async updateAgentPerformance(
    agentId: string,
    success: boolean,
    executionTime: number,
    qualityScore?: number
  ): Promise<void> {
    const performance = this.agentPerformance.get(agentId);
    if (!performance) return;

    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Update metrics
    performance.tasksCompleted++;
    
    // Update average time
    const totalTime = performance.averageTime * (performance.tasksCompleted - 1) + executionTime;
    performance.averageTime = totalTime / performance.tasksCompleted;

    // Update success rate
    const totalSuccesses = Math.floor(performance.successRate * (performance.tasksCompleted - 1) / 100);
    const newSuccesses = totalSuccesses + (success ? 1 : 0);
    performance.successRate = (newSuccesses / performance.tasksCompleted) * 100;

    // Update quality score if provided
    if (qualityScore !== undefined) {
      const totalQuality = performance.qualityScore * (performance.tasksCompleted - 1) + qualityScore;
      performance.qualityScore = totalQuality / performance.tasksCompleted;
    }

    performance.lastUpdated = new Date();

    // Update agent's performance reference
    agent.performance = performance;

    this.logger.debug('Agent performance updated', {
      agentId,
      tasksCompleted: performance.tasksCompleted,
      successRate: performance.successRate,
      qualityScore: performance.qualityScore
    });
  }

  /**
   * Get agent performance metrics
   */
  public async getAgentPerformance(agentId: string): Promise<AgentPerformance | undefined> {
    return this.agentPerformance.get(agentId);
  }

  /**
   * Shutdown all agents in a session
   */
  public async shutdownAllAgents(sessionId?: string): Promise<void> {
    this.logger.info('Shutting down all agents', { sessionId });

    const shutdownPromises = Array.from(this.agents.keys()).map(agentId =>
      this.removeAgent(agentId)
    );

    await Promise.allSettled(shutdownPromises);
    this.logger.info('All agents shutdown completed', { sessionId });
  }

  /**
   * Scale agents based on workload
   */
  public async scaleAgents(targetCount: number, type?: Agent['type']): Promise<void> {
    this.logger.info('Scaling agents', { targetCount, type });

    const currentAgents = type ? 
      Array.from(this.agents.values()).filter(a => a.type === type) :
      Array.from(this.agents.values());

    const currentCount = currentAgents.length;

    if (targetCount > currentCount) {
      // Scale up
      const scaleUpCount = targetCount - currentCount;
      const spawnPromises = [];

      for (let i = 0; i < scaleUpCount; i++) {
        const agentType = type || this.selectOptimalAgentType();
        const capabilities = this.getDefaultCapabilities(agentType);
        spawnPromises.push(this.spawnAgent(agentType, capabilities));
      }

      await Promise.all(spawnPromises);
      this.logger.info('Scaled up agents', { added: scaleUpCount });

    } else if (targetCount < currentCount) {
      // Scale down
      const scaleDownCount = currentCount - targetCount;
      
      // Remove idle agents first, then least performing agents
      const agentsToRemove = this.selectAgentsForRemoval(currentAgents, scaleDownCount);
      
      const removePromises = agentsToRemove.map(agent => this.removeAgent(agent.id));
      await Promise.allSettled(removePromises);
      
      this.logger.info('Scaled down agents', { removed: scaleDownCount });
    }
  }

  /**
   * Get agent resource utilization
   */
  public async getResourceUtilization(): Promise<{ [agentId: string]: AgentResources }> {
    const utilization: { [agentId: string]: AgentResources } = {};
    
    for (const [agentId, agent] of this.agents.entries()) {
      utilization[agentId] = { ...agent.resources };
    }

    return utilization;
  }

  // Private methods

  private startAgentMonitoring(agentId: string): void {
    // Simulate resource monitoring
    const monitoringInterval = setInterval(() => {
      const agent = this.agents.get(agentId);
      if (!agent) {
        clearInterval(monitoringInterval);
        return;
      }

      // Simulate resource usage based on agent status
      if (agent.status === 'busy') {
        agent.resources.cpuUsage = Math.random() * 80 + 10; // 10-90%
        agent.resources.memoryUsage = Math.random() * 70 + 20; // 20-90%
        agent.resources.networkUsage = Math.random() * 50 + 10; // 10-60%
      } else {
        agent.resources.cpuUsage = Math.random() * 20; // 0-20%
        agent.resources.memoryUsage = Math.random() * 30 + 10; // 10-40%
        agent.resources.networkUsage = Math.random() * 10; // 0-10%
      }

      agent.resources.diskUsage = Math.random() * 50 + 10; // 10-60%

      // Alert if resources are too high
      if (agent.resources.cpuUsage > 90 || agent.resources.memoryUsage > 95) {
        this.emit('agentResourceAlert', { agentId, resources: agent.resources });
      }
    }, 5000); // Monitor every 5 seconds

    // Clean up monitoring when agent is removed
    this.once('agentRemoved', (removedAgentId) => {
      if (removedAgentId === agentId) {
        clearInterval(monitoringInterval);
      }
    });
  }

  private selectOptimalAgentType(): Agent['type'] {
    // Simple heuristic: balance agent types
    const typeCounts = this.getAgentTypeCounts();
    const minCount = Math.min(...Object.values(typeCounts));
    
    // Find type with minimum count
    for (const [type, count] of Object.entries(typeCounts)) {
      if (count === minCount) {
        return type as Agent['type'];
      }
    }

    return 'coder'; // Default fallback
  }

  private getAgentTypeCounts(): { [type: string]: number } {
    const counts = {
      researcher: 0,
      architect: 0,
      coder: 0,
      tester: 0,
      reviewer: 0,
      coordinator: 0
    };

    for (const agent of this.agents.values()) {
      counts[agent.type]++;
    }

    return counts;
  }

  private getDefaultCapabilities(type: Agent['type']): string[] {
    switch (type) {
      case 'researcher':
        return ['analysis', 'documentation', 'requirements'];
      case 'architect':
        return ['design', 'patterns', 'architecture'];
      case 'coder':
        return ['python', 'javascript', 'typescript', 'implementation'];
      case 'tester':
        return ['testing', 'validation', 'debugging'];
      case 'reviewer':
        return ['code_review', 'quality_assurance', 'security'];
      case 'coordinator':
        return ['coordination', 'management', 'monitoring'];
      default:
        return ['general'];
    }
  }

  private selectAgentsForRemoval(agents: Agent[], count: number): Agent[] {
    // Priority for removal: idle agents first, then by performance
    const idleAgents = agents.filter(a => a.status === 'idle');
    const busyAgents = agents.filter(a => a.status === 'busy');

    const toRemove: Agent[] = [];

    // Remove idle agents first, sorted by lowest performance
    const sortedIdle = idleAgents.sort((a, b) => 
      a.performance.qualityScore - b.performance.qualityScore
    );

    for (let i = 0; i < Math.min(count, sortedIdle.length); i++) {
      toRemove.push(sortedIdle[i]);
    }

    // If we need to remove more, remove busy agents (worst performers)
    if (toRemove.length < count) {
      const remaining = count - toRemove.length;
      const sortedBusy = busyAgents.sort((a, b) => 
        a.performance.qualityScore - b.performance.qualityScore
      );

      for (let i = 0; i < Math.min(remaining, sortedBusy.length); i++) {
        toRemove.push(sortedBusy[i]);
      }
    }

    return toRemove;
  }
}