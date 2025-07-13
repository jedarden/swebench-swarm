import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../utils/Logger';
import { SwarmException } from '../types';
import { SWEBenchProblem } from './SWEBenchIntegration';

const execAsync = promisify(exec);

export interface ClaudeCodeContext {
  problem: SWEBenchProblem;
  repoPath: string;
  outputPath: string;
  mcpServers?: string[];
}

export interface ClaudeCodeResult {
  success: boolean;
  patch?: string;
  logs: string[];
  error?: string;
  metrics?: {
    tokensUsed: number;
    timeElapsed: number;
    agentsSpawned: number;
  };
}

/**
 * Spawns new Claude Code instances with SWE-Bench problems as context
 */
export class ClaudeCodeSpawner {
  private logger: Logger;
  private workDir: string;

  constructor() {
    this.logger = new Logger('ClaudeCodeSpawner');
    this.workDir = path.join(process.cwd(), '.claude-code-work');
  }

  /**
   * Initialize the spawner
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.workDir, { recursive: true });
    
    // Verify Claude Code is installed
    try {
      await execAsync('claude --version');
      this.logger.info('Claude Code verified');
    } catch (error) {
      throw new SwarmException('CLAUDE_NOT_INSTALLED', 'Claude Code CLI not found. Please install it first.');
    }

    // Verify MCP servers are available
    try {
      await execAsync('npx claude-flow@alpha --version');
      this.logger.info('Claude Flow MCP server verified');
    } catch (error) {
      this.logger.warn('Claude Flow MCP server not found', { error });
    }
  }

  /**
   * Spawn a new Claude Code instance to solve a SWE-Bench problem
   */
  async spawnForProblem(context: ClaudeCodeContext): Promise<ClaudeCodeResult> {
    const { problem, repoPath, outputPath } = context;
    const sessionId = `swebench-${problem.instance_id}-${Date.now()}`;
    const sessionDir = path.join(this.workDir, sessionId);
    
    try {
      // Create session directory
      await fs.mkdir(sessionDir, { recursive: true });
      
      // Create problem context file
      const contextFile = path.join(sessionDir, 'problem_context.md');
      await this.createProblemContext(problem, repoPath, contextFile);
      
      // Create MCP configuration
      const mcpConfigFile = path.join(sessionDir, 'mcp.json');
      await this.createMCPConfig(mcpConfigFile, context.mcpServers);
      
      // Create the prompt for Claude Code
      const promptFile = path.join(sessionDir, 'prompt.md');
      await this.createPrompt(problem, repoPath, promptFile);
      
      // Spawn Claude Code with the problem context
      const result = await this.executeClaudeCode(
        sessionDir,
        contextFile,
        promptFile,
        mcpConfigFile,
        repoPath,
        outputPath
      );
      
      return result;
    } catch (error) {
      this.logger.error('Failed to spawn Claude Code', { 
        sessionId, 
        error 
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        logs: [`Error spawning Claude Code: ${error}`]
      };
    } finally {
      // Cleanup session directory
      try {
        await execAsync(`rm -rf ${sessionDir}`);
      } catch (e) {
        this.logger.warn('Failed to cleanup session', { sessionId, error: e });
      }
    }
  }

  /**
   * Create problem context file for Claude Code
   */
  private async createProblemContext(
    problem: SWEBenchProblem,
    repoPath: string,
    outputFile: string
  ): Promise<void> {
    const context = `# SWE-Bench Problem Context

## Problem ID: ${problem.instance_id}
## Repository: ${problem.repo}
## Base Commit: ${problem.base_commit}

## Problem Statement
${problem.problem_statement}

## Hints
${problem.hints_text || 'No hints provided'}

## Test Information
The test patch includes test modifications that will validate your solution:

\`\`\`diff
${problem.test_patch}
\`\`\`

## Repository Location
The repository has been cloned to: ${repoPath}

## Expected Changes
The solution should modify the necessary files to resolve the described problem. The test patch will be applied to validate your solution.

## Original Patch Reference
<details>
<summary>Original patch that fixed this issue (DO NOT COPY DIRECTLY - use as reference only)</summary>

\`\`\`diff
${problem.patch}
\`\`\`
</details>

## Test Patch
The following test patch will be applied to verify your solution:
\`\`\`diff
${problem.test_patch}
\`\`\`
`;

    await fs.writeFile(outputFile, context);
  }

  /**
   * Create MCP configuration
   */
  private async createMCPConfig(
    outputFile: string,
    servers: string[] = ['claude-flow', 'ruv-swarm']
  ): Promise<void> {
    const config = {
      mcpServers: {
        'claude-flow': {
          command: 'npx',
          args: ['claude-flow@alpha', 'mcp', 'start'],
          env: {}
        },
        'ruv-swarm': {
          command: 'npx',
          args: ['ruv-swarm', 'mcp', 'start'],
          env: {}
        }
      }
    };

    await fs.writeFile(outputFile, JSON.stringify(config, null, 2));
  }

  /**
   * Create the main prompt for Claude Code
   */
  private async createPrompt(
    problem: SWEBenchProblem,
    repoPath: string,
    outputFile: string
  ): Promise<void> {
    const prompt = `You are solving a SWE-Bench problem. You have access to ruv-swarm and claude-flow MCP servers.

IMPORTANT: You MUST use the swarm pattern to solve this problem:

1. Initialize a swarm using claude-flow:
   - Use \`mcp__claude-flow__swarm_init\` with topology "hierarchical" and maxAgents 8
   - This will set up coordination for multiple agents

2. Spawn multiple specialized agents using the Task tool:
   - Spawn a "researcher" agent to analyze the codebase and understand the problem
   - Spawn a "coder" agent to implement the solution
   - Spawn a "tester" agent to verify the fix works
   - Each agent should use claude-flow hooks for coordination

3. Use TodoWrite to track all tasks:
   - Create a comprehensive todo list with all subtasks
   - Update status as you progress
   - Include tasks for: analysis, implementation, testing, validation

4. Coordinate using claude-flow memory:
   - Store findings using \`mcp__claude-flow__memory_usage\`
   - Share context between agents
   - Track decisions and progress

The problem context is in problem_context.md. The repository is at: ${repoPath}

Your goal is to:
1. Understand the problem by reading problem_context.md
2. Analyze the codebase to find where changes are needed
3. Implement a fix that makes the tests pass
4. Ensure existing functionality continues to work
5. Generate a git patch with your changes

Start by reading the problem context and initializing the swarm.`;

    await fs.writeFile(outputFile, prompt);
  }

  /**
   * Execute Claude Code with the problem context
   */
  private async executeClaudeCode(
    sessionDir: string,
    contextFile: string,
    promptFile: string,
    mcpConfigFile: string,
    repoPath: string,
    outputPath: string
  ): Promise<ClaudeCodeResult> {
    const logs: string[] = [];
    const startTime = Date.now();
    
    try {
      // Change to repository directory
      process.chdir(repoPath);
      
      // Build the Claude Code command
      const claudeCommand = [
        'claude',
        'chat',
        '--mcp-config', mcpConfigFile,
        '--context', contextFile,
        '--prompt-file', promptFile,
        '--output', 'json',
        '--max-thinking-length', '50000',
        '--save-thinking'
      ];

      this.logger.info('Executing Claude Code', { 
        command: claudeCommand.join(' '),
        cwd: repoPath 
      });

      // Execute Claude Code
      const claudeProcess = spawn(claudeCommand[0], claudeCommand.slice(1), {
        cwd: repoPath,
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Capture output
      let stdout = '';
      let stderr = '';
      
      claudeProcess.stdout.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        logs.push(`[STDOUT] ${text}`);
      });

      claudeProcess.stderr.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        logs.push(`[STDERR] ${text}`);
      });

      // Wait for completion
      await new Promise<void>((resolve, reject) => {
        claudeProcess.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Claude Code exited with code ${code}`));
          }
        });

        claudeProcess.on('error', (err) => {
          reject(err);
        });

        // Timeout after 10 minutes
        setTimeout(() => {
          claudeProcess.kill();
          reject(new Error('Claude Code execution timeout'));
        }, 600000);
      });

      // Generate patch from changes
      const { stdout: patch } = await execAsync('git diff', { cwd: repoPath });
      
      if (!patch || patch.trim().length === 0) {
        throw new Error('No changes were made to the repository');
      }

      // Save patch to output
      await fs.writeFile(outputPath, patch);

      // Try to parse metrics from output
      const metrics = this.parseMetrics(stdout);

      return {
        success: true,
        patch,
        logs,
        metrics: {
          tokensUsed: metrics.tokensUsed || 0,
          timeElapsed: Date.now() - startTime,
          agentsSpawned: metrics.agentsSpawned || 0
        }
      };

    } catch (error) {
      this.logger.error('Claude Code execution failed', { error });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        logs
      };
    }
  }

  /**
   * Parse metrics from Claude Code output
   */
  private parseMetrics(output: string): any {
    try {
      // Try to find JSON output
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        return {
          tokensUsed: data.usage?.total_tokens || 0,
          agentsSpawned: data.agents?.length || 0
        };
      }
    } catch (e) {
      // Ignore parsing errors
    }

    return {
      tokensUsed: 0,
      agentsSpawned: 0
    };
  }

  /**
   * Spawn multiple Claude Code instances in parallel (for Claude Max)
   */
  async spawnParallel(
    contexts: ClaudeCodeContext[],
    maxConcurrent: number = 3
  ): Promise<ClaudeCodeResult[]> {
    const results: ClaudeCodeResult[] = [];
    const queue = [...contexts];
    const active: Promise<void>[] = [];

    while (queue.length > 0 || active.length > 0) {
      // Start new instances up to the limit
      while (active.length < maxConcurrent && queue.length > 0) {
        const context = queue.shift()!;
        
        const promise = this.spawnForProblem(context)
          .then(result => {
            results.push(result);
          })
          .catch(error => {
            results.push({
              success: false,
              error: String(error),
              logs: [`Failed to process: ${error}`]
            });
          });

        active.push(promise);
      }

      // Wait for at least one to complete
      if (active.length > 0) {
        await Promise.race(active);
        // Remove completed promises
        for (let i = active.length - 1; i >= 0; i--) {
          if (await this.isPromiseResolved(active[i])) {
            active.splice(i, 1);
          }
        }
      }
    }

    return results;
  }

  private async isPromiseResolved(promise: Promise<any>): Promise<boolean> {
    return Promise.race([
      promise.then(() => true),
      Promise.resolve(false)
    ]);
  }
}