import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/Logger';
import { 
  Task, 
  TaskStatus, 
  TaskPriority,
  CreateTaskDTO,
  UpdateTaskDTO,
  SwarmConfig,
  SwarmException
} from '../types';
import { EventBus } from './EventBus';
import { SWEBenchIntegration, SWEBenchProblem } from './SWEBenchIntegration';
import { ClaudeCodeSpawner } from './ClaudeCodeSpawner';
import * as path from 'path';
import * as fs from 'fs/promises';

export class SWEBenchService {
  private tasks: Map<string, Task>;
  private logger: Logger;
  private eventBus: EventBus;
  private swebenchIntegration: SWEBenchIntegration;
  private claudeCodeSpawner: ClaudeCodeSpawner;
  private workDir: string;

  constructor(eventBus: EventBus) {
    this.tasks = new Map();
    this.logger = new Logger('SWEBenchService');
    this.eventBus = eventBus;
    this.swebenchIntegration = new SWEBenchIntegration();
    this.claudeCodeSpawner = new ClaudeCodeSpawner();
    this.workDir = path.join(process.cwd(), '.swebench-tasks');
  }

  async initialize(): Promise<void> {
    await this.swebenchIntegration.initialize();
    await this.claudeCodeSpawner.initialize();
    await fs.mkdir(this.workDir, { recursive: true });
    this.logger.info('SWEBench service initialized');
  }

  async createTask(dto: CreateTaskDTO): Promise<Task> {
    const task: Task = {
      id: uuidv4(),
      name: dto.name,
      description: dto.description,
      type: dto.type,
      status: TaskStatus.PENDING,
      priority: dto.priority || TaskPriority.MEDIUM,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: dto.metadata || {},
      tags: dto.tags || [],
      assignedTo: dto.assignedTo,
      dependencies: dto.dependencies || [],
      logs: []
    };

    this.tasks.set(task.id, task);
    
    // Emit task created event
    this.eventBus.emitSwarmEvent('task.created', 'SWEBenchService', task);

    // Start processing the task asynchronously
    this.processTask(task).catch(error => {
      this.logger.error('Task processing failed', { 
        taskId: task.id, 
        error 
      });
    });

    return task;
  }

  async getTask(id: string): Promise<Task> {
    const task = this.tasks.get(id);
    if (!task) {
      throw new SwarmException('TASK_NOT_FOUND', `Task ${id} not found`);
    }
    return task;
  }

  async updateTask(id: string, updates: UpdateTaskDTO): Promise<Task> {
    const task = await this.getTask(id);
    
    Object.assign(task, {
      ...updates,
      updatedAt: new Date()
    });

    this.eventBus.emitSwarmEvent('task.updated', 'SWEBenchService', task);

    return task;
  }

  async deleteTask(id: string): Promise<void> {
    const task = await this.getTask(id);
    this.tasks.delete(id);

    this.eventBus.emitSwarmEvent('task.deleted', 'SWEBenchService', { id });
  }

  async listTasks(filters?: {
    status?: TaskStatus;
    priority?: TaskPriority;
    assigned_to?: string;
    tags?: string[];
  }): Promise<Task[]> {
    let tasks = Array.from(this.tasks.values());

    if (filters) {
      if (filters.status) {
        tasks = tasks.filter(t => t.status === filters.status);
      }
      if (filters.priority) {
        tasks = tasks.filter(t => t.priority === filters.priority);
      }
      if (filters.assigned_to) {
        tasks = tasks.filter(t => t.assignedTo === filters.assigned_to);
      }
      if (filters.tags && filters.tags.length > 0) {
        tasks = tasks.filter(t => 
          filters.tags!.some(tag => t.tags.includes(tag))
        );
      }
    }

    return tasks.sort((a, b) => 
      b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  private async processTask(task: Task): Promise<void> {
    try {
      // Update task status
      await this.updateTask(task.id, { 
        status: TaskStatus.IN_PROGRESS 
      });

      const problemId = task.metadata?.problem_id;
      if (!problemId) {
        throw new SwarmException('INVALID_TASK', 'No problem_id in task metadata');
      }

      // Fetch the problem from SWE-Bench
      this.addLog(task, 'Fetching problem from SWE-Bench...');
      const problem = await this.swebenchIntegration.fetchProblem(problemId);
      
      // Setup repository
      this.addLog(task, 'Setting up repository...');
      const repoPath = await this.swebenchIntegration.setupRepository(problem);
      
      // Create output directory for this task
      const taskDir = path.join(this.workDir, task.id);
      await fs.mkdir(taskDir, { recursive: true });
      const outputPath = path.join(taskDir, 'solution.patch');
      
      // Spawn Claude Code with the problem
      this.addLog(task, 'Spawning Claude Code to solve the problem...');
      const result = await this.claudeCodeSpawner.spawnForProblem({
        problem,
        repoPath,
        outputPath,
        mcpServers: ['claude-flow', 'ruv-swarm']
      });
      
      // Add Claude Code logs to task
      result.logs.forEach(log => this.addLog(task, log));
      
      if (!result.success) {
        throw new SwarmException('CLAUDE_CODE_FAILED', result.error || 'Unknown error');
      }
      
      // Validate the solution
      this.addLog(task, 'Validating solution...');
      const validation = await this.swebenchIntegration.validateSolution(
        problem,
        result.patch!
      );
      
      // Update task with results
      await this.updateTask(task.id, {
        status: validation.valid ? TaskStatus.COMPLETED : TaskStatus.FAILED,
        result: {
          problem_id: problemId,
          success: validation.valid,
          patch: result.patch,
          validation: {
            passed_tests: validation.passed,
            failed_tests: validation.failed,
            all_tests_passed: validation.valid,
            test_output: validation.output
          },
          // metrics: result.metrics, // Removed for type compatibility
          files_changed: this.extractFilesFromPatch(result.patch!)
        }
      });
      
      this.addLog(task, `Task completed. Success: ${validation.valid}`);
      
    } catch (error) {
      this.logger.error('Task processing error', { 
        taskId: task.id, 
        error 
      });
      
      this.addLog(task, `Error: ${error instanceof Error ? error.message : String(error)}`);
      
      await this.updateTask(task.id, {
        status: TaskStatus.FAILED,
        result: {
          success: false,
          error_message: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  private addLog(task: Task, message: string): void {
    task.logs.push({
      timestamp: new Date(),
      message,
      level: 'info'
    });
  }

  private extractFilesFromPatch(patch: string): string[] {
    const files: Set<string> = new Set();
    const lines = patch.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        const match = line.match(/b\/(.+)$/);
        if (match) {
          files.add(match[1]);
        }
      }
    }
    
    return Array.from(files);
  }

  // Additional methods for SWE-Bench specific operations

  async submitSWEBenchProblem(problemId: string, repo?: string): Promise<Task> {
    return this.createTask({
      name: `SWE-Bench: ${problemId}`,
      description: `Solve SWE-Bench problem ${problemId}`,
      type: 'swebench',
      priority: TaskPriority.HIGH,
      metadata: {
        problem_id: problemId,
        repo: repo,
        type: 'swebench'
      },
      tags: ['swebench', 'automated']
    });
  }

  async getRandomProblem(): Promise<SWEBenchProblem> {
    const dataset = await this.swebenchIntegration.fetchDataset();
    const randomIndex = Math.floor(Math.random() * dataset.length);
    return dataset[randomIndex];
  }

  async submitRandomProblem(): Promise<Task> {
    const problem = await this.getRandomProblem();
    return this.submitSWEBenchProblem(problem.instance_id, problem.repo);
  }
}