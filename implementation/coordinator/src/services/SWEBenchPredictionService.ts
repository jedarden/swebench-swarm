import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../utils/Logger';
import { SWEBenchPrediction, SWEBenchPredictions } from './SWEBenchIntegration';
import { Task, TaskStatus } from '../types';

/**
 * Service for generating and managing SWE-bench prediction files
 * Compliant with official evaluation harness format
 */
export class SWEBenchPredictionService {
  private logger: Logger;
  private outputDir: string;
  private predictions: SWEBenchPredictions;

  constructor() {
    this.logger = new Logger('SWEBenchPredictionService');
    this.outputDir = path.join(process.cwd(), '.swebench-predictions');
    this.predictions = {};
  }

  /**
   * Initialize the prediction service
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.outputDir, { recursive: true });
    this.logger.info('SWE-bench prediction service initialized', { outputDir: this.outputDir });
  }

  /**
   * Add a prediction for a specific instance
   */
  addPrediction(instanceId: string, patch: string): void {
    const prediction: SWEBenchPrediction = {
      model_name_or_path: 'swebench-swarm',
      model_patch: patch
    };

    this.predictions[instanceId] = prediction;
    this.logger.debug('Added prediction', { instanceId, patchLength: patch.length });
  }

  /**
   * Generate prediction from completed task
   */
  addPredictionFromTask(task: Task): void {
    if (task.status !== TaskStatus.COMPLETED || !task.result) {
      this.logger.warn('Cannot generate prediction from incomplete task', { 
        taskId: task.id, 
        status: task.status 
      });
      return;
    }

    const problemId = task.metadata?.problem_id;
    if (!problemId) {
      this.logger.error('Task missing problem_id in metadata', { taskId: task.id });
      return;
    }

    const patch = task.result.patch;
    if (!patch || typeof patch !== 'string') {
      this.logger.error('Task missing valid patch in result', { taskId: task.id });
      return;
    }

    this.addPrediction(problemId, patch);
    this.logger.info('Generated prediction from task', { 
      taskId: task.id, 
      problemId, 
      patchLength: patch.length 
    });
  }

  /**
   * Export predictions in official evaluation harness format
   */
  async exportPredictions(filename?: string): Promise<string> {
    const outputFile = filename || `predictions-${Date.now()}.json`;
    const outputPath = path.join(this.outputDir, outputFile);

    // Ensure predictions follow official format exactly
    const formattedPredictions: SWEBenchPredictions = {};
    
    for (const [instanceId, prediction] of Object.entries(this.predictions)) {
      // Validate prediction format
      if (!prediction.model_name_or_path || !prediction.model_patch) {
        this.logger.warn('Skipping invalid prediction', { instanceId, prediction });
        continue;
      }

      formattedPredictions[instanceId] = {
        model_name_or_path: prediction.model_name_or_path,
        model_patch: prediction.model_patch
      };
    }

    // Write to file with proper formatting
    await fs.writeFile(outputPath, JSON.stringify(formattedPredictions, null, 2));
    
    this.logger.info('Exported predictions', { 
      outputPath, 
      count: Object.keys(formattedPredictions).length 
    });

    return outputPath;
  }

  /**
   * Import existing predictions
   */
  async importPredictions(filePath: string): Promise<void> {
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const imported: SWEBenchPredictions = JSON.parse(data);
      
      // Validate and merge
      let importedCount = 0;
      for (const [instanceId, prediction] of Object.entries(imported)) {
        if (this.validatePrediction(prediction)) {
          this.predictions[instanceId] = prediction;
          importedCount++;
        } else {
          this.logger.warn('Skipped invalid prediction during import', { instanceId });
        }
      }
      
      this.logger.info('Imported predictions', { filePath, importedCount });
    } catch (error) {
      this.logger.error('Failed to import predictions', { filePath, error });
      throw new Error(`Failed to import predictions: ${error}`);
    }
  }

  /**
   * Get all current predictions
   */
  getPredictions(): SWEBenchPredictions {
    return { ...this.predictions };
  }

  /**
   * Get prediction for specific instance
   */
  getPrediction(instanceId: string): SWEBenchPrediction | undefined {
    return this.predictions[instanceId];
  }

  /**
   * Remove prediction for specific instance
   */
  removePrediction(instanceId: string): boolean {
    if (this.predictions[instanceId]) {
      delete this.predictions[instanceId];
      this.logger.debug('Removed prediction', { instanceId });
      return true;
    }
    return false;
  }

  /**
   * Clear all predictions
   */
  clearPredictions(): void {
    const count = Object.keys(this.predictions).length;
    this.predictions = {};
    this.logger.info('Cleared all predictions', { count });
  }

  /**
   * Get prediction statistics
   */
  getStatistics(): {
    totalPredictions: number;
    averagePatchLength: number;
    instanceIds: string[];
  } {
    const instanceIds = Object.keys(this.predictions);
    const totalPredictions = instanceIds.length;
    
    let totalPatchLength = 0;
    for (const prediction of Object.values(this.predictions)) {
      totalPatchLength += prediction.model_patch.length;
    }
    
    const averagePatchLength = totalPredictions > 0 ? totalPatchLength / totalPredictions : 0;
    
    return {
      totalPredictions,
      averagePatchLength: Math.round(averagePatchLength),
      instanceIds
    };
  }

  /**
   * Validate prediction format
   */
  private validatePrediction(prediction: any): prediction is SWEBenchPrediction {
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
   * Create batch predictions from multiple tasks
   */
  async createBatchPredictions(tasks: Task[]): Promise<string> {
    let successCount = 0;
    let errorCount = 0;

    for (const task of tasks) {
      try {
        this.addPredictionFromTask(task);
        successCount++;
      } catch (error) {
        this.logger.error('Failed to create prediction from task', { 
          taskId: task.id, 
          error 
        });
        errorCount++;
      }
    }

    this.logger.info('Batch prediction creation completed', { 
      successCount, 
      errorCount, 
      totalTasks: tasks.length 
    });

    // Export the batch
    return await this.exportPredictions(`batch-predictions-${Date.now()}.json`);
  }

  /**
   * Validate all predictions against SWE-bench requirements
   */
  validateAllPredictions(): {
    valid: string[];
    invalid: Array<{ instanceId: string; reason: string }>;
  } {
    const valid: string[] = [];
    const invalid: Array<{ instanceId: string; reason: string }> = [];

    for (const [instanceId, prediction] of Object.entries(this.predictions)) {
      if (!this.validatePrediction(prediction)) {
        invalid.push({ instanceId, reason: 'Invalid prediction format' });
        continue;
      }

      // Check for common patch format requirements
      if (!prediction.model_patch.includes('diff --git')) {
        invalid.push({ instanceId, reason: 'Patch does not contain git diff format' });
        continue;
      }

      valid.push(instanceId);
    }

    this.logger.info('Prediction validation completed', { 
      validCount: valid.length, 
      invalidCount: invalid.length 
    });

    return { valid, invalid };
  }
}