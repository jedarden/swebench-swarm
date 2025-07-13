import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../utils/Logger';
import { Task, TaskStatus, TaskPriority, SwarmException } from '../types';
import { SWEBenchIntegration, SWEBenchProblem } from './SWEBenchIntegration';
import { SWEBenchService } from './SWEBenchService';
import { SWEBenchPredictionService } from './SWEBenchPredictionService';
import { SWEBenchEvaluationService, EvaluationResult } from './SWEBenchEvaluationService';
import { EventBus } from './EventBus';

export interface RunnerConfig {
  maxConcurrentTasks: number;
  batchSize: number;
  includeProblems?: string[]; // Specific problem IDs to run
  excludeProblems?: string[]; // Problem IDs to skip
  maxProblems?: number; // Limit total problems for testing
  enableEvaluation: boolean;
  saveIntermediateResults: boolean;
  continueOnFailure: boolean;
  outputDir: string;
}

export interface RunnerStats {
  totalProblems: number;
  processedProblems: number;
  successfulSolutions: number;
  failedSolutions: number;
  skippedProblems: number;
  currentBatch: number;
  totalBatches: number;
  startTime: Date;
  currentTime: Date;
  estimatedCompletion?: Date;
  evaluationResult?: EvaluationResult;
}

export interface ProblemResult {
  problemId: string;
  status: 'success' | 'failed' | 'skipped';
  task?: Task;
  patch?: string;
  error?: string;
  executionTime: number;
  metrics?: {
    tokensUsed: number;
    agentsSpawned: number;
    coordinationCalls: number;
  };
}

/**
 * End-to-end SWE-bench runner for processing entire datasets
 */
export class SWEBenchRunner extends EventEmitter {
  private logger: Logger;
  private eventBus: EventBus;
  private swebenchIntegration: SWEBenchIntegration;
  private swebenchService: SWEBenchService;
  private predictionService: SWEBenchPredictionService;
  private evaluationService: SWEBenchEvaluationService;
  
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private currentStats: RunnerStats;
  private results: Map<string, ProblemResult> = new Map();
  private activeTasks: Map<string, Task> = new Map();
  
  constructor() {
    super();
    this.logger = new Logger('SWEBenchRunner');
    this.eventBus = new EventBus();
    this.swebenchIntegration = new SWEBenchIntegration();
    this.swebenchService = new SWEBenchService(this.eventBus);
    this.predictionService = new SWEBenchPredictionService();
    this.evaluationService = new SWEBenchEvaluationService();
    
    this.currentStats = this.createInitialStats();
    this.setupEventListeners();
  }

  /**
   * Initialize all services
   */
  async initialize(): Promise<void> {
    await this.eventBus.initialize();
    await this.swebenchIntegration.initialize();
    await this.swebenchService.initialize();
    await this.predictionService.initialize();
    await this.evaluationService.initialize();
    
    this.logger.info('SWE-bench runner initialized');
  }

  /**
   * Run the complete SWE-bench dataset
   */
  async runDataset(config: Partial<RunnerConfig> = {}): Promise<RunnerStats> {
    if (this.isRunning) {
      throw new SwarmException('RUNNER_BUSY', 'Runner is already processing a dataset');
    }

    const runnerConfig: RunnerConfig = {
      maxConcurrentTasks: 3,
      batchSize: 10,
      enableEvaluation: true,
      saveIntermediateResults: true,
      continueOnFailure: true,
      outputDir: path.join(process.cwd(), '.swebench-results'),
      ...config
    };

    this.logger.info('Starting SWE-bench dataset run', { config: runnerConfig });
    
    try {
      this.isRunning = true;
      this.currentStats = this.createInitialStats();
      this.currentStats.startTime = new Date();
      
      // Create output directory
      await fs.mkdir(runnerConfig.outputDir, { recursive: true });
      
      // Load dataset
      const dataset = await this.loadDataset(runnerConfig);
      this.currentStats.totalProblems = dataset.length;
      this.currentStats.totalBatches = Math.ceil(dataset.length / runnerConfig.batchSize);
      
      this.emit('started', this.currentStats);
      
      // Process in batches
      const batches = this.createBatches(dataset, runnerConfig.batchSize);
      
      for (let i = 0; i < batches.length; i++) {
        if (!this.isRunning) break;
        
        while (this.isPaused) {
          await this.sleep(1000);
        }
        
        this.currentStats.currentBatch = i + 1;
        this.emit('batchStarted', { batch: i + 1, problems: batches[i].length });
        
        await this.processBatch(batches[i], runnerConfig);
        
        // Save intermediate results
        if (runnerConfig.saveIntermediateResults) {
          await this.saveIntermediateResults(runnerConfig.outputDir, i + 1);
        }
        
        this.emit('batchCompleted', { batch: i + 1, stats: this.currentStats });
      }
      
      // Generate final predictions
      if (this.isRunning) {
        await this.generateFinalPredictions(runnerConfig.outputDir);
        
        // Run evaluation if enabled
        if (runnerConfig.enableEvaluation) {
          await this.runFinalEvaluation(runnerConfig.outputDir);
        }
      }
      
      this.currentStats.currentTime = new Date();
      this.emit('completed', this.currentStats);
      
      this.logger.info('Dataset run completed', {
        processed: this.currentStats.processedProblems,
        successful: this.currentStats.successfulSolutions,
        failed: this.currentStats.failedSolutions
      });
      
    } catch (error) {
      this.logger.error('Dataset run failed', { error });
      this.emit('error', error);
      throw error;
    } finally {
      this.isRunning = false;
      this.isPaused = false;
    }
    
    return this.currentStats;
  }

  /**
   * Process a single SWE-bench problem
   */
  async processProblem(problem: SWEBenchProblem): Promise<ProblemResult> {
    const startTime = Date.now();
    const result: ProblemResult = {
      problemId: problem.instance_id,
      status: 'failed',
      executionTime: 0
    };

    try {
      this.logger.info('Processing problem', { problemId: problem.instance_id });
      
      // Create task for the problem
      const task = await this.swebenchService.submitSWEBenchProblem(
        problem.instance_id,
        problem.repo
      );
      
      this.activeTasks.set(problem.instance_id, task);
      result.task = task;
      
      // Wait for task completion (with timeout)
      const completedTask = await this.waitForTaskCompletion(task.id, 300000); // 5 minute timeout
      
      if (completedTask.status === TaskStatus.COMPLETED && completedTask.result?.success) {
        result.status = 'success';
        result.patch = completedTask.result.patch;
        
        // Add to predictions
        if (result.patch) {
          this.predictionService.addPrediction(problem.instance_id, result.patch);
        }
        
        this.currentStats.successfulSolutions++;
      } else {
        result.status = 'failed';
        result.error = completedTask.result?.error_message || 'Unknown error';
        this.currentStats.failedSolutions++;
      }
      
    } catch (error) {
      this.logger.error('Problem processing failed', { 
        problemId: problem.instance_id, 
        error 
      });
      result.status = 'failed';
      result.error = error instanceof Error ? error.message : String(error);
      this.currentStats.failedSolutions++;
    } finally {
      this.activeTasks.delete(problem.instance_id);
      result.executionTime = Date.now() - startTime;
      this.results.set(problem.instance_id, result);
      this.currentStats.processedProblems++;
      this.currentStats.currentTime = new Date();
      
      // Update estimated completion
      this.updateEstimatedCompletion();
      
      this.emit('problemCompleted', result);
    }

    return result;
  }

  /**
   * Pause the runner
   */
  pause(): void {
    if (this.isRunning && !this.isPaused) {
      this.isPaused = true;
      this.logger.info('Runner paused');
      this.emit('paused');
    }
  }

  /**
   * Resume the runner
   */
  resume(): void {
    if (this.isRunning && this.isPaused) {
      this.isPaused = false;
      this.logger.info('Runner resumed');
      this.emit('resumed');
    }
  }

  /**
   * Stop the runner
   */
  stop(): void {
    if (this.isRunning) {
      this.isRunning = false;
      this.isPaused = false;
      this.logger.info('Runner stopped');
      this.emit('stopped');
    }
  }

  /**
   * Get current statistics
   */
  getStats(): RunnerStats {
    return { ...this.currentStats };
  }

  /**
   * Get results for processed problems
   */
  getResults(): Map<string, ProblemResult> {
    return new Map(this.results);
  }

  /**
   * Load and filter dataset
   */
  private async loadDataset(config: RunnerConfig): Promise<SWEBenchProblem[]> {
    let dataset = await this.swebenchIntegration.fetchDataset();
    
    // Apply filters
    if (config.includeProblems && config.includeProblems.length > 0) {
      dataset = dataset.filter(p => config.includeProblems!.includes(p.instance_id));
    }
    
    if (config.excludeProblems && config.excludeProblems.length > 0) {
      dataset = dataset.filter(p => !config.excludeProblems!.includes(p.instance_id));
    }
    
    // Limit for testing
    if (config.maxProblems && config.maxProblems > 0) {
      dataset = dataset.slice(0, config.maxProblems);
    }
    
    this.logger.info('Dataset loaded and filtered', { 
      originalSize: (await this.swebenchIntegration.fetchDataset()).length,
      filteredSize: dataset.length 
    });
    
    return dataset;
  }

  /**
   * Create batches from dataset
   */
  private createBatches(dataset: SWEBenchProblem[], batchSize: number): SWEBenchProblem[][] {
    const batches: SWEBenchProblem[][] = [];
    
    for (let i = 0; i < dataset.length; i += batchSize) {
      batches.push(dataset.slice(i, i + batchSize));
    }
    
    return batches;
  }

  /**
   * Process a batch of problems
   */
  private async processBatch(batch: SWEBenchProblem[], config: RunnerConfig): Promise<void> {
    const promises: Promise<ProblemResult>[] = [];
    
    // Process problems with concurrency limit
    for (let i = 0; i < batch.length; i += config.maxConcurrentTasks) {
      const slice = batch.slice(i, i + config.maxConcurrentTasks);
      
      for (const problem of slice) {
        if (!this.isRunning) break;
        
        const promise = this.processProblem(problem);
        promises.push(promise);
        
        // Wait if we've reached concurrency limit
        if (promises.length >= config.maxConcurrentTasks) {
          await Promise.allSettled(promises.splice(0, config.maxConcurrentTasks));
        }
      }
    }
    
    // Wait for remaining promises
    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }

  /**
   * Wait for task completion
   */
  private async waitForTaskCompletion(taskId: string, timeout: number): Promise<Task> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const task = await this.swebenchService.getTask(taskId);
      
      if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.FAILED) {
        return task;
      }
      
      await this.sleep(5000); // Check every 5 seconds
    }
    
    throw new Error(`Task ${taskId} timed out after ${timeout}ms`);
  }

  /**
   * Save intermediate results
   */
  private async saveIntermediateResults(outputDir: string, batchNumber: number): Promise<void> {
    const resultsFile = path.join(outputDir, `batch_${batchNumber}_results.json`);
    const statsFile = path.join(outputDir, `batch_${batchNumber}_stats.json`);
    
    const results = Array.from(this.results.values());
    
    await fs.writeFile(resultsFile, JSON.stringify(results, null, 2));
    await fs.writeFile(statsFile, JSON.stringify(this.currentStats, null, 2));
    
    this.logger.info('Intermediate results saved', { batchNumber, resultsFile });
  }

  /**
   * Generate final predictions
   */
  private async generateFinalPredictions(outputDir: string): Promise<void> {
    const predictionsFile = path.join(outputDir, 'final_predictions.json');
    await this.predictionService.exportPredictions('final_predictions.json');
    
    // Copy to output directory
    const sourcePath = path.join(process.cwd(), '.swebench-predictions', 'final_predictions.json');
    await fs.copyFile(sourcePath, predictionsFile);
    
    this.logger.info('Final predictions generated', { predictionsFile });
  }

  /**
   * Run final evaluation
   */
  private async runFinalEvaluation(outputDir: string): Promise<void> {
    try {
      const predictions = this.predictionService.getPredictions();
      const runId = `final-eval-${Date.now()}`;
      
      const evaluationResult = await this.evaluationService.runEvaluation(predictions, { runId });
      
      this.currentStats.evaluationResult = evaluationResult;
      
      // Save evaluation results
      const evalFile = path.join(outputDir, 'evaluation_results.json');
      await fs.writeFile(evalFile, JSON.stringify(evaluationResult, null, 2));
      
      this.logger.info('Final evaluation completed', { 
        resolveRate: evaluationResult.resolveRate,
        evalFile 
      });
      
    } catch (error) {
      this.logger.error('Final evaluation failed', { error });
    }
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    this.on('problemCompleted', (result: ProblemResult) => {
      this.logger.debug('Problem completed', { 
        problemId: result.problemId, 
        status: result.status,
        executionTime: result.executionTime
      });
    });
  }

  /**
   * Create initial stats object
   */
  private createInitialStats(): RunnerStats {
    return {
      totalProblems: 0,
      processedProblems: 0,
      successfulSolutions: 0,
      failedSolutions: 0,
      skippedProblems: 0,
      currentBatch: 0,
      totalBatches: 0,
      startTime: new Date(),
      currentTime: new Date()
    };
  }

  /**
   * Update estimated completion time
   */
  private updateEstimatedCompletion(): void {
    if (this.currentStats.processedProblems > 0) {
      const elapsed = this.currentStats.currentTime.getTime() - this.currentStats.startTime.getTime();
      const averageTimePerProblem = elapsed / this.currentStats.processedProblems;
      const remaining = this.currentStats.totalProblems - this.currentStats.processedProblems;
      const estimatedRemaining = remaining * averageTimePerProblem;
      
      this.currentStats.estimatedCompletion = new Date(Date.now() + estimatedRemaining);
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Export results to various formats
   */
  async exportResults(outputDir: string, format: 'json' | 'csv' | 'html' = 'json'): Promise<string> {
    const results = Array.from(this.results.values());
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    switch (format) {
      case 'json':
        const jsonFile = path.join(outputDir, `swebench_results_${timestamp}.json`);
        await fs.writeFile(jsonFile, JSON.stringify({
          stats: this.currentStats,
          results
        }, null, 2));
        return jsonFile;
        
      case 'csv':
        const csvFile = path.join(outputDir, `swebench_results_${timestamp}.csv`);
        const csvContent = this.resultsToCSV(results);
        await fs.writeFile(csvFile, csvContent);
        return csvFile;
        
      case 'html':
        const htmlFile = path.join(outputDir, `swebench_results_${timestamp}.html`);
        const htmlContent = this.resultsToHTML(results);
        await fs.writeFile(htmlFile, htmlContent);
        return htmlFile;
        
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Convert results to CSV
   */
  private resultsToCSV(results: ProblemResult[]): string {
    const headers = ['problemId', 'status', 'executionTime', 'error', 'patchLength'];
    const rows = results.map(r => [
      r.problemId,
      r.status,
      r.executionTime.toString(),
      r.error || '',
      r.patch ? r.patch.length.toString() : '0'
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  /**
   * Convert results to HTML report
   */
  private resultsToHTML(results: ProblemResult[]): string {
    const successCount = results.filter(r => r.status === 'success').length;
    const failureCount = results.filter(r => r.status === 'failed').length;
    const successRate = results.length > 0 ? (successCount / results.length * 100).toFixed(1) : '0';
    
    return `
<!DOCTYPE html>
<html>
<head>
    <title>SWE-bench Results Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .summary { background: #f0f0f0; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
        .success { color: green; }
        .failed { color: red; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <h1>SWE-bench Results Report</h1>
    
    <div class="summary">
        <h2>Summary</h2>
        <p><strong>Total Problems:</strong> ${results.length}</p>
        <p><strong>Successful:</strong> <span class="success">${successCount}</span></p>
        <p><strong>Failed:</strong> <span class="failed">${failureCount}</span></p>
        <p><strong>Success Rate:</strong> ${successRate}%</p>
        <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
    </div>
    
    <h2>Problem Results</h2>
    <table>
        <tr>
            <th>Problem ID</th>
            <th>Status</th>
            <th>Execution Time (ms)</th>
            <th>Error</th>
        </tr>
        ${results.map(r => `
        <tr>
            <td>${r.problemId}</td>
            <td class="${r.status}">${r.status}</td>
            <td>${r.executionTime}</td>
            <td>${r.error || ''}</td>
        </tr>
        `).join('')}
    </table>
</body>
</html>
    `;
  }
}