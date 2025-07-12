import { exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from '../utils/Logger';
import { SwarmException } from '../types';

const execAsync = promisify(exec);

/**
 * Manages multiple Claude Code instances for parallel execution
 */
export class ClaudeCodeManager {
  private logger: Logger;
  private maxInstances: number;
  private activeInstances: Map<string, ClaudeCodeInstance>;
  private instanceQueue: Array<() => Promise<void>>;
  private authToken?: string;

  constructor(maxInstances: number = 5) {
    this.logger = new Logger('ClaudeCodeManager');
    this.maxInstances = maxInstances;
    this.activeInstances = new Map();
    this.instanceQueue = [];
    this.initializeAuth();
  }

  /**
   * Initialize authentication from Claude Code CLI
   */
  private async initializeAuth(): Promise<void> {
    try {
      // Get auth token from Claude Code CLI
      const { stdout } = await execAsync('claude auth token', {
        env: { ...process.env, CLAUDE_HEADLESS: 'true' }
      });
      
      this.authToken = stdout.trim();
      this.logger.info('Claude Code authentication initialized');
    } catch (error) {
      this.logger.warn('Could not retrieve Claude Code auth token', { error });
    }
  }

  /**
   * Create a new Claude Code instance
   */
  async createInstance(instanceId: string): Promise<ClaudeCodeInstance> {
    if (this.activeInstances.size >= this.maxInstances) {
      // Queue the request
      await new Promise<void>((resolve) => {
        this.instanceQueue.push(resolve);
      });
    }

    const instance = new ClaudeCodeInstance(instanceId, this.authToken);
    this.activeInstances.set(instanceId, instance);
    
    this.logger.info('Created Claude Code instance', { 
      instanceId, 
      activeCount: this.activeInstances.size 
    });
    
    return instance;
  }

  /**
   * Release a Claude Code instance
   */
  async releaseInstance(instanceId: string): Promise<void> {
    const instance = this.activeInstances.get(instanceId);
    if (instance) {
      await instance.cleanup();
      this.activeInstances.delete(instanceId);
      
      // Process queued requests
      if (this.instanceQueue.length > 0) {
        const next = this.instanceQueue.shift();
        if (next) next();
      }
      
      this.logger.info('Released Claude Code instance', { 
        instanceId, 
        activeCount: this.activeInstances.size 
      });
    }
  }

  /**
   * Execute code operation on available instance
   */
  async executeOnInstance(
    operation: string, 
    params: any
  ): Promise<any> {
    const instanceId = `instance-${Date.now()}`;
    const instance = await this.createInstance(instanceId);
    
    try {
      return await instance.execute(operation, params);
    } finally {
      await this.releaseInstance(instanceId);
    }
  }

  /**
   * Get current instance status
   */
  getStatus(): any {
    return {
      maxInstances: this.maxInstances,
      activeInstances: this.activeInstances.size,
      queuedRequests: this.instanceQueue.length,
      authenticated: !!this.authToken
    };
  }
}

/**
 * Individual Claude Code instance
 */
class ClaudeCodeInstance {
  private instanceId: string;
  private authToken?: string;
  private logger: Logger;
  private workDir: string;

  constructor(instanceId: string, authToken?: string) {
    this.instanceId = instanceId;
    this.authToken = authToken;
    this.logger = new Logger(`ClaudeCodeInstance-${instanceId}`);
    this.workDir = `/tmp/claude-code-${instanceId}`;
  }

  /**
   * Execute a Claude Code operation
   */
  async execute(operation: string, params: any): Promise<any> {
    const env = {
      ...process.env,
      CLAUDE_INSTANCE_ID: this.instanceId,
      CLAUDE_WORK_DIR: this.workDir,
      CLAUDE_HEADLESS: 'true'
    };

    if (this.authToken) {
      env.CLAUDE_AUTH_TOKEN = this.authToken;
    }

    try {
      let command: string;
      
      switch (operation) {
        case 'analyze':
          command = `claude analyze "${params.file}" --json`;
          break;
        
        case 'generate':
          command = `claude generate --prompt "${params.prompt}" --language ${params.language} --json`;
          break;
        
        case 'fix':
          command = `claude fix "${params.file}" --issue "${params.issue}" --json`;
          break;
        
        case 'test':
          command = `claude test "${params.file}" --framework ${params.framework || 'auto'} --json`;
          break;
        
        case 'chat':
          // For complex problems, use chat mode
          command = `claude chat --message "${params.message}" --context "${params.context}" --json`;
          break;
        
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      const { stdout, stderr } = await execAsync(command, { env });
      
      if (stderr) {
        this.logger.warn('Claude Code operation warning', { stderr });
      }
      
      return JSON.parse(stdout);
    } catch (error) {
      this.logger.error('Claude Code operation failed', { operation, error });
      throw new SwarmException('CLAUDE_CODE_FAILED', `Operation ${operation} failed: ${error}`);
    }
  }

  /**
   * Cleanup instance resources
   */
  async cleanup(): Promise<void> {
    try {
      // Clean up work directory
      await execAsync(`rm -rf ${this.workDir}`);
    } catch (error) {
      this.logger.warn('Cleanup failed', { error });
    }
  }
}