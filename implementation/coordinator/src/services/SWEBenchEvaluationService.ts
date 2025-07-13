import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../utils/Logger';
import { SwarmException } from '../types';
import { SWEBenchPredictions } from './SWEBenchIntegration';

const execAsync = promisify(exec);

export interface EvaluationConfig {
  datasetName: string;
  maxWorkers: number;
  runId: string;
  namespace?: string;
  modal?: boolean;
  timeout?: number;
}

export interface EvaluationResult {
  runId: string;
  success: boolean;
  totalProblems: number;
  resolvedProblems: number;
  failedProblems: number;
  resolveRate: number;
  logPath: string;
  resultsPath: string;
  executionTime: number;
  errors: string[];
}

/**
 * Service for running official SWE-bench evaluations using Docker harness
 */
export class SWEBenchEvaluationService {
  private logger: Logger;
  private swebenchPath: string;
  private workingDir: string;
  private resultsDir: string;

  constructor() {
    this.logger = new Logger('SWEBenchEvaluationService');
    this.swebenchPath = path.join(process.cwd(), '.swebench-harness');
    this.workingDir = path.join(process.cwd(), '.swebench-evaluations');
    this.resultsDir = path.join(this.workingDir, 'results');
  }

  /**
   * Initialize the evaluation service
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.workingDir, { recursive: true });
    await fs.mkdir(this.resultsDir, { recursive: true });
    
    // Check Docker availability
    await this.checkDockerAvailability();
    
    // Setup SWE-bench harness if not already present
    await this.setupSWEBenchHarness();
    
    this.logger.info('SWE-bench evaluation service initialized', {
      workingDir: this.workingDir,
      swebenchPath: this.swebenchPath
    });
  }

  /**
   * Run official SWE-bench evaluation
   */
  async runEvaluation(
    predictions: SWEBenchPredictions,
    config: Partial<EvaluationConfig> = {}
  ): Promise<EvaluationResult> {
    const startTime = Date.now();
    const runId = config.runId || `swebench-swarm-${Date.now()}`;
    const evaluationConfig: EvaluationConfig = {
      datasetName: 'princeton-nlp/SWE-bench_Lite',
      maxWorkers: Math.min(Math.floor(0.75 * require('os').cpus().length), 8), // Conservative worker count
      namespace: '', // For compatibility
      modal: false,
      timeout: 3600000, // 1 hour timeout
      ...config,
      runId
    };

    this.logger.info('Starting SWE-bench evaluation', { runId, config: evaluationConfig });

    try {
      // Save predictions to file
      const predictionsPath = await this.savePredictions(predictions, runId);
      
      // Run evaluation
      const result = await this.executeEvaluation(predictionsPath, evaluationConfig);
      
      // Parse results
      const evaluationResult = await this.parseEvaluationResults(runId, startTime);
      
      this.logger.info('Evaluation completed successfully', {
        runId,
        resolveRate: evaluationResult.resolveRate,
        executionTime: evaluationResult.executionTime
      });

      return evaluationResult;
    } catch (error) {
      this.logger.error('Evaluation failed', { runId, error });
      throw new SwarmException('EVALUATION_FAILED', `Evaluation failed: ${error}`);
    }
  }

  /**
   * Check if Docker is available and running
   */
  private async checkDockerAvailability(): Promise<void> {
    try {
      const { stdout } = await execAsync('docker --version');
      this.logger.info('Docker detected', { version: stdout.trim() });
      
      // Test Docker daemon
      await execAsync('docker info');
      this.logger.info('Docker daemon is running');
    } catch (error) {
      throw new SwarmException('DOCKER_NOT_AVAILABLE', 
        'Docker is not available. Please install Docker and ensure it is running.');
    }
  }

  /**
   * Setup SWE-bench harness repository
   */
  private async setupSWEBenchHarness(): Promise<void> {
    try {
      // Check if already exists
      await fs.access(this.swebenchPath);
      this.logger.info('SWE-bench harness already exists');
      return;
    } catch {
      // Clone the repository
      this.logger.info('Cloning SWE-bench harness repository');
      
      await execAsync(`git clone https://github.com/princeton-nlp/SWE-bench.git ${this.swebenchPath}`);
      
      // Install in virtual environment
      const venvPath = path.join(this.swebenchPath, 'venv');
      await execAsync(`python3 -m venv ${venvPath}`, { cwd: this.swebenchPath });
      
      const pipPath = path.join(venvPath, 'bin', 'pip');
      await execAsync(`${pipPath} install -e .`, { cwd: this.swebenchPath });
      
      this.logger.info('SWE-bench harness installed successfully');
    }
  }

  /**
   * Save predictions to file for evaluation
   */
  private async savePredictions(predictions: SWEBenchPredictions, runId: string): Promise<string> {
    const predictionsPath = path.join(this.workingDir, `${runId}_predictions.json`);
    
    // Validate all predictions before saving
    const validPredictions: SWEBenchPredictions = {};
    let validCount = 0;
    let invalidCount = 0;

    for (const [instanceId, prediction] of Object.entries(predictions)) {
      if (this.validatePrediction(prediction)) {
        validPredictions[instanceId] = prediction;
        validCount++;
      } else {
        this.logger.warn('Skipping invalid prediction', { instanceId });
        invalidCount++;
      }
    }

    if (validCount === 0) {
      throw new SwarmException('NO_VALID_PREDICTIONS', 'No valid predictions found for evaluation');
    }

    await fs.writeFile(predictionsPath, JSON.stringify(validPredictions, null, 2));
    
    this.logger.info('Predictions saved for evaluation', {
      path: predictionsPath,
      validCount,
      invalidCount
    });

    return predictionsPath;
  }

  /**
   * Execute the SWE-bench evaluation
   */
  private async executeEvaluation(
    predictionsPath: string,
    config: EvaluationConfig
  ): Promise<void> {
    const pythonPath = path.join(this.swebenchPath, 'venv', 'bin', 'python');
    
    const command = [
      pythonPath,
      '-m', 'swebench.harness.run_evaluation',
      '--dataset_name', config.datasetName,
      '--predictions_path', predictionsPath,
      '--max_workers', config.maxWorkers.toString(),
      '--run_id', config.runId
    ];

    if (config.namespace !== undefined) {
      command.push('--namespace', config.namespace);
    }

    if (config.modal) {
      command.push('--modal', 'true');
    }

    this.logger.info('Executing evaluation command', { command: command.join(' ') });

    try {
      const { stdout, stderr } = await execAsync(command.join(' '), {
        cwd: this.swebenchPath,
        timeout: config.timeout,
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });

      this.logger.debug('Evaluation output', { stdout, stderr });
    } catch (error: any) {
      // Log the error but continue - evaluation might have partial results
      this.logger.warn('Evaluation command had issues', { 
        error: error.message,
        stdout: error.stdout,
        stderr: error.stderr
      });
    }
  }

  /**
   * Parse evaluation results
   */
  private async parseEvaluationResults(runId: string, startTime: number): Promise<EvaluationResult> {
    const endTime = Date.now();
    const executionTime = endTime - startTime;
    
    // Look for results in standard SWE-bench output locations
    const resultsPath = path.join(this.swebenchPath, 'evaluation_results', runId);
    const logPath = path.join(this.swebenchPath, 'logs', 'run_evaluation');

    const result: EvaluationResult = {
      runId,
      success: false,
      totalProblems: 0,
      resolvedProblems: 0,
      failedProblems: 0,
      resolveRate: 0,
      logPath,
      resultsPath,
      executionTime,
      errors: []
    };

    try {
      // Check if results directory exists
      await fs.access(resultsPath);
      
      // Look for summary files
      const summaryFiles = await fs.readdir(resultsPath);
      this.logger.info('Found evaluation results', { summaryFiles });

      // Parse results from files
      for (const file of summaryFiles) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(resultsPath, file);
            const data = await fs.readFile(filePath, 'utf-8');
            const parsed = JSON.parse(data);
            
            // Extract metrics from results
            if (parsed.resolved !== undefined) {
              result.resolvedProblems += parsed.resolved;
            }
            if (parsed.total !== undefined) {
              result.totalProblems = parsed.total;
            }
          } catch (parseError) {
            this.logger.warn('Failed to parse result file', { file, error: parseError });
          }
        }
      }

      result.failedProblems = result.totalProblems - result.resolvedProblems;
      result.resolveRate = result.totalProblems > 0 ? result.resolvedProblems / result.totalProblems : 0;
      result.success = true;

    } catch (error) {
      this.logger.error('Failed to parse evaluation results', { error });
      result.errors.push(`Failed to parse results: ${error}`);
    }

    return result;
  }

  /**
   * Validate prediction format
   */
  private validatePrediction(prediction: any): boolean {
    return (
      prediction &&
      typeof prediction === 'object' &&
      typeof prediction.model_name_or_path === 'string' &&
      typeof prediction.model_patch === 'string' &&
      prediction.model_name_or_path.length > 0 &&
      prediction.model_patch.length > 0
    );
  }

  /**
   * Get system requirements for evaluation
   */
  getSystemRequirements(): {
    minCpuCores: number;
    minMemoryGB: number;
    minStorageGB: number;
    recommendedWorkers: number;
    dockerRequired: boolean;
  } {
    const cpuCount = require('os').cpus().length;
    return {
      minCpuCores: 4,
      minMemoryGB: 8,
      minStorageGB: 50,
      recommendedWorkers: Math.min(Math.floor(0.75 * cpuCount), 24),
      dockerRequired: true
    };
  }

  /**
   * Cleanup evaluation artifacts
   */
  async cleanup(runId?: string): Promise<void> {
    try {
      if (runId) {
        // Clean specific run
        const runPath = path.join(this.workingDir, `${runId}_*`);
        await execAsync(`rm -rf ${runPath}`);
        this.logger.info('Cleaned up evaluation run', { runId });
      } else {
        // Clean all evaluations
        await execAsync(`rm -rf ${this.workingDir}/*`);
        this.logger.info('Cleaned up all evaluation artifacts');
      }
    } catch (error) {
      this.logger.warn('Cleanup failed', { error });
    }
  }

  /**
   * Check if evaluation is currently running
   */
  async isEvaluationRunning(): Promise<boolean> {
    try {
      // Check for running Docker containers with SWE-bench patterns
      const { stdout } = await execAsync('docker ps --filter name=swe-bench --format "{{.Names}}"');
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get evaluation history
   */
  async getEvaluationHistory(): Promise<Array<{ runId: string; date: Date; results?: EvaluationResult }>> {
    const history: Array<{ runId: string; date: Date; results?: EvaluationResult }> = [];
    
    try {
      const files = await fs.readdir(this.workingDir);
      
      for (const file of files) {
        if (file.endsWith('_predictions.json')) {
          const runId = file.replace('_predictions.json', '');
          const stats = await fs.stat(path.join(this.workingDir, file));
          
          history.push({
            runId,
            date: stats.mtime
          });
        }
      }
    } catch (error) {
      this.logger.warn('Failed to get evaluation history', { error });
    }

    return history.sort((a, b) => b.date.getTime() - a.date.getTime());
  }
}