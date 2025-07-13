import axios, { AxiosInstance } from 'axios';
import {
  SwarmConfig,
  ClaudeFlowSession,
  ClaudeFlowAgent,
  Agent,
  TaskDistribution,
  CoordinationPlan,
  SwarmException
} from '../types';
import { Logger } from '../utils/Logger';

/**
 * ClaudeFlowIntegration - Integrates with Claude-Flow MCP tools
 */
export class ClaudeFlowIntegration {
  private client: AxiosInstance;
  private logger: Logger;
  private isEnabled: boolean = false;
  private activeSessions: Map<string, ClaudeFlowSession> = new Map();

  constructor() {
    this.logger = new Logger('ClaudeFlowIntegration');
    this.client = axios.create({
      timeout: 10000, // 10 second timeout
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Check if Claude-Flow is available
    this.checkClaudeFlowAvailability();
  }

  /**
   * Initialize swarm through Claude-Flow MCP tools
   */
  public async initializeSwarm(config: SwarmConfig): Promise<ClaudeFlowSession> {
    if (!this.isEnabled) {
      throw new SwarmException('CLAUDE_FLOW_DISABLED', 'Claude-Flow integration is not available');
    }

    this.logger.info('Initializing Claude-Flow swarm', { config });

    try {
      // Initialize swarm through MCP tools
      const swarmResponse = await this.callMCPTool('swarm_init', {
        topology: config.topology,
        maxAgents: config.maxAgents,
        strategy: config.strategy
      });

      const swarmId = swarmResponse.swarmId;
      
      const session: ClaudeFlowSession = {
        swarmId,
        sessionId: `session-${Date.now()}`,
        agents: [],
        memoryKeys: [],
        status: 'active'
      };

      this.activeSessions.set(swarmId, session);

      this.logger.info('Claude-Flow swarm initialized', { swarmId });
      return session;
    } catch (error) {
      this.logger.error('Failed to initialize Claude-Flow swarm', error);
      throw new SwarmException('CLAUDE_FLOW_INIT_FAILED', 'Failed to initialize Claude-Flow swarm');
    }
  }

  /**
   * Register an agent with Claude-Flow
   */
  public async registerAgent(swarmId: string, agent: Agent): Promise<void> {
    if (!this.isEnabled) return;

    this.logger.info('Registering agent with Claude-Flow', { swarmId, agentId: agent.id });

    try {
      const agentResponse = await this.callMCPTool('agent_spawn', {
        type: agent.type,
        name: agent.name,
        capabilities: agent.capabilities,
        swarmId
      });

      const claudeFlowAgent: ClaudeFlowAgent = {
        id: agentResponse.agentId || agent.id,
        type: agent.type,
        name: agent.name,
        capabilities: agent.capabilities,
        memoryNamespace: `agent/${agent.type}/${agent.id}`
      };

      const session = this.activeSessions.get(swarmId);
      if (session) {
        session.agents.push(claudeFlowAgent);
      }

      this.logger.info('Agent registered with Claude-Flow', { 
        swarmId, 
        agentId: agent.id,
        claudeFlowAgentId: claudeFlowAgent.id 
      });
    } catch (error) {
      this.logger.error('Failed to register agent with Claude-Flow', error);
      // Don't throw - continue without Claude-Flow for this agent
    }
  }

  /**
   * Store task distribution in Claude-Flow memory
   */
  public async storeTaskDistribution(swarmId: string, distribution: TaskDistribution): Promise<void> {
    if (!this.isEnabled) return;

    this.logger.info('Storing task distribution in Claude-Flow memory', { 
      swarmId, 
      taskId: distribution.taskId 
    });

    try {
      await this.callMCPTool('memory_usage', {
        action: 'store',
        key: `swarm/${swarmId}/tasks/${distribution.taskId}`,
        value: JSON.stringify({
          taskId: distribution.taskId,
          subtasks: distribution.subtasks,
          estimatedCompletion: distribution.estimatedCompletion,
          priority: distribution.priority,
          timestamp: new Date().toISOString()
        }),
        namespace: 'swarm'
      });

      const session = this.activeSessions.get(swarmId);
      if (session) {
        session.memoryKeys.push(`swarm/${swarmId}/tasks/${distribution.taskId}`);
      }

      this.logger.info('Task distribution stored in Claude-Flow memory', { 
        swarmId, 
        taskId: distribution.taskId 
      });
    } catch (error) {
      this.logger.error('Failed to store task distribution in Claude-Flow memory', error);
    }
  }

  /**
   * Store coordination plan in Claude-Flow memory
   */
  public async storeCoordinationPlan(plan: CoordinationPlan): Promise<void> {
    if (!this.isEnabled) return;

    this.logger.info('Storing coordination plan in Claude-Flow memory', { planId: plan.id });

    try {
      await this.callMCPTool('memory_usage', {
        action: 'store',
        key: `coordination/plans/${plan.id}`,
        value: JSON.stringify({
          id: plan.id,
          agents: plan.agents.map(a => ({ id: a.id, type: a.type, name: a.name })),
          taskFlow: plan.taskFlow,
          resourceAllocation: plan.resourceAllocation,
          timestamp: new Date().toISOString()
        }),
        namespace: 'coordination'
      });

      this.logger.info('Coordination plan stored in Claude-Flow memory', { planId: plan.id });
    } catch (error) {
      this.logger.error('Failed to store coordination plan in Claude-Flow memory', error);
    }
  }

  /**
   * Orchestrate task through Claude-Flow
   */
  public async orchestrateTask(task: string, strategy: string = 'parallel'): Promise<any> {
    if (!this.isEnabled) {
      throw new SwarmException('CLAUDE_FLOW_DISABLED', 'Claude-Flow integration is not available');
    }

    this.logger.info('Orchestrating task through Claude-Flow', { task, strategy });

    try {
      const response = await this.callMCPTool('task_orchestrate', {
        task,
        strategy,
        priority: 'high'
      });

      this.logger.info('Task orchestrated through Claude-Flow', { taskId: response.taskId });
      return response;
    } catch (error) {
      this.logger.error('Failed to orchestrate task through Claude-Flow', error);
      throw new SwarmException('CLAUDE_FLOW_ORCHESTRATION_FAILED', 'Failed to orchestrate task');
    }
  }

  /**
   * Store agent coordination data
   */
  public async storeAgentCoordination(
    agentId: string, 
    step: string, 
    data: any
  ): Promise<void> {
    if (!this.isEnabled) return;

    try {
      await this.callMCPTool('memory_usage', {
        action: 'store',
        key: `agent/${agentId}/${step}`,
        value: JSON.stringify({
          ...data,
          timestamp: new Date().toISOString(),
          step
        }),
        namespace: 'agent_coordination'
      });
    } catch (error) {
      this.logger.error('Failed to store agent coordination data', error);
    }
  }

  /**
   * Retrieve coordination data from memory
   */
  public async getCoordinationData(key: string): Promise<any> {
    if (!this.isEnabled) return null;

    try {
      const response = await this.callMCPTool('memory_usage', {
        action: 'retrieve',
        key,
        namespace: 'coordination'
      });

      return response.value ? JSON.parse(response.value) : null;
    } catch (error) {
      this.logger.error('Failed to retrieve coordination data', error);
      return null;
    }
  }

  /**
   * Train neural patterns from coordination experience
   */
  public async trainNeuralPatterns(
    patternType: 'coordination' | 'optimization' | 'prediction',
    trainingData: string
  ): Promise<void> {
    if (!this.isEnabled) return;

    try {
      await this.callMCPTool('neural_train', {
        pattern_type: patternType,
        training_data: trainingData,
        epochs: 50
      });

      this.logger.info('Neural patterns trained', { patternType });
    } catch (error) {
      this.logger.error('Failed to train neural patterns', error);
    }
  }

  /**
   * Get swarm status from Claude-Flow
   */
  public async getSwarmStatus(swarmId: string): Promise<any> {
    if (!this.isEnabled) return null;

    try {
      const response = await this.callMCPTool('swarm_status', { swarmId });
      return response;
    } catch (error) {
      this.logger.error('Failed to get swarm status', error);
      return null;
    }
  }

  /**
   * Shutdown swarm in Claude-Flow
   */
  public async shutdownSwarm(swarmId: string): Promise<void> {
    if (!this.isEnabled) return;

    this.logger.info('Shutting down Claude-Flow swarm', { swarmId });

    try {
      await this.callMCPTool('swarm_destroy', { swarmId });
      this.activeSessions.delete(swarmId);
      
      this.logger.info('Claude-Flow swarm shutdown completed', { swarmId });
    } catch (error) {
      this.logger.error('Failed to shutdown Claude-Flow swarm', error);
    }
  }

  /**
   * Get performance report from Claude-Flow
   */
  public async getPerformanceReport(timeframe: string = '24h'): Promise<any> {
    if (!this.isEnabled) return null;

    try {
      const response = await this.callMCPTool('performance_report', {
        timeframe,
        format: 'summary'
      });

      return response;
    } catch (error) {
      this.logger.error('Failed to get performance report', error);
      return null;
    }
  }

  // Private methods

  private async checkClaudeFlowAvailability(): Promise<void> {
    try {
      // Try to detect if Claude-Flow MCP tools are available
      // This is a simplified check - in reality, we'd check MCP server status
      this.isEnabled = process.env.CLAUDE_FLOW_ENABLED === 'true' || false;
      
      if (this.isEnabled) {
        this.logger.info('Claude-Flow integration enabled');
      } else {
        this.logger.info('Claude-Flow integration disabled');
      }
    } catch (error) {
      this.logger.warn('Claude-Flow availability check failed, disabling integration');
      this.isEnabled = false;
    }
  }

  private async callMCPTool(toolName: string, parameters: any): Promise<any> {
    // Use actual MCP tools via Claude Code
    this.logger.debug('Calling MCP tool', { toolName, parameters });

    try {
      // Check if we have Claude Code available
      const claudeCommand = process.env.CLAUDE_CODE_COMMAND || 'claude';
      
      // Use Claude Code to call MCP tools
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // Build the MCP tool command
      const mcpCommand = `mcp__claude-flow__${toolName}`;
      const toolParams = JSON.stringify(parameters);
      
      // Execute via Claude Code
      const command = `${claudeCommand} mcp call ${mcpCommand} '${toolParams}'`;
      
      try {
        const { stdout } = await execAsync(command, {
          env: {
            ...process.env,
            ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY
          }
        });
        
        return JSON.parse(stdout);
      } catch (error) {
        this.logger.error('Claude Code MCP call failed', { toolName, error });
        throw new SwarmException('MCP_CALL_FAILED', `Claude Code MCP call failed for ${toolName}: ${error}`);
      }
    } catch (error) {
      this.logger.error('MCP tool execution failed', { toolName, error });
      throw new SwarmException('MCP_TOOL_FAILED', `Failed to execute MCP tool ${toolName}: ${error}`);
    }
  }

}