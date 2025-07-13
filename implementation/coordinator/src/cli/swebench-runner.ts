#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import { Logger } from '../utils/Logger';
import { SWEBenchRunner, RunnerConfig } from '../services/SWEBenchRunner';

const logger = new Logger('SWEBenchCLI');

/**
 * Command-line interface for running SWE-bench dataset
 */
class SWEBenchCLI {
  private runner: SWEBenchRunner;
  private program: Command;

  constructor() {
    this.runner = new SWEBenchRunner();
    this.program = new Command();
    this.setupCommands();
    this.setupEventListeners();
  }

  /**
   * Setup CLI commands
   */
  private setupCommands(): void {
    this.program
      .name('swebench-runner')
      .description('Run SWE-bench dataset with Claude Code + Swarm coordination')
      .version('1.0.0');

    // Main run command
    this.program
      .command('run')
      .description('Run the complete SWE-bench dataset')
      .option('-c, --concurrent <number>', 'Maximum concurrent tasks', '3')
      .option('-b, --batch-size <number>', 'Batch size for processing', '10')
      .option('-m, --max-problems <number>', 'Maximum problems to process (for testing)')
      .option('-i, --include <problems...>', 'Specific problem IDs to include')
      .option('-e, --exclude <problems...>', 'Problem IDs to exclude')
      .option('-o, --output <dir>', 'Output directory', './swebench-results')
      .option('--no-evaluation', 'Skip final evaluation')
      .option('--no-intermediate', 'Skip intermediate result saving')
      .option('--stop-on-failure', 'Stop on first failure')
      .action(async (options) => {
        await this.runDataset(options);
      });

    // Run single problem
    this.program
      .command('problem <problemId>')
      .description('Run a single SWE-bench problem')
      .option('-o, --output <dir>', 'Output directory', './swebench-results')
      .action(async (problemId, options) => {
        await this.runSingleProblem(problemId, options);
      });

    // Status command
    this.program
      .command('status')
      .description('Show current runner status')
      .action(() => {
        this.showStatus();
      });

    // List problems command
    this.program
      .command('list')
      .description('List available problems in dataset')
      .option('-f, --filter <pattern>', 'Filter problems by pattern')
      .option('-l, --limit <number>', 'Limit number of results', '20')
      .action(async (options) => {
        await this.listProblems(options);
      });

    // Results command
    this.program
      .command('results <runDir>')
      .description('Show results from a previous run')
      .option('-f, --format <type>', 'Output format (json|csv|html)', 'json')
      .action(async (runDir, options) => {
        await this.showResults(runDir, options);
      });

    // Evaluate command
    this.program
      .command('evaluate <predictionsFile>')
      .description('Run evaluation on existing predictions')
      .option('--run-id <id>', 'Custom run ID for evaluation')
      .option('--max-workers <number>', 'Maximum evaluation workers', '4')
      .action(async (predictionsFile, options) => {
        await this.evaluateExisting(predictionsFile, options);
      });
  }

  /**
   * Setup event listeners for progress reporting
   */
  private setupEventListeners(): void {
    this.runner.on('started', (stats) => {
      console.log('🚀 SWE-bench run started');
      console.log(`📊 Total problems: ${stats.totalProblems}`);
      console.log(`📦 Total batches: ${stats.totalBatches}`);
      console.log(`⏰ Started at: ${stats.startTime.toISOString()}`);
      console.log('');
    });

    this.runner.on('batchStarted', ({ batch, problems }) => {
      console.log(`📦 Starting batch ${batch} (${problems} problems)`);
    });

    this.runner.on('problemCompleted', (result) => {
      const status = result.status === 'success' ? '✅' : '❌';
      const time = (result.executionTime / 1000).toFixed(1);
      console.log(`${status} ${result.problemId} (${time}s)`);
      
      if (result.status === 'failed' && result.error) {
        console.log(`   Error: ${result.error.substring(0, 100)}...`);
      }
    });

    this.runner.on('batchCompleted', ({ batch, stats }) => {
      const successRate = stats.processedProblems > 0 
        ? (stats.successfulSolutions / stats.processedProblems * 100).toFixed(1)
        : '0';
      
      console.log(`📦 Batch ${batch} completed`);
      console.log(`📈 Progress: ${stats.processedProblems}/${stats.totalProblems} (${successRate}% success rate)`);
      
      if (stats.estimatedCompletion) {
        console.log(`⏱️  Estimated completion: ${stats.estimatedCompletion.toISOString()}`);
      }
      console.log('');
    });

    this.runner.on('completed', (stats) => {
      console.log('🎉 SWE-bench run completed!');
      console.log(`📊 Final results:`);
      console.log(`   Total processed: ${stats.processedProblems}`);
      console.log(`   Successful: ${stats.successfulSolutions}`);
      console.log(`   Failed: ${stats.failedSolutions}`);
      
      const successRate = stats.processedProblems > 0 
        ? (stats.successfulSolutions / stats.processedProblems * 100).toFixed(1)
        : '0';
      console.log(`   Success rate: ${successRate}%`);
      
      const duration = (stats.currentTime.getTime() - stats.startTime.getTime()) / 1000 / 60;
      console.log(`   Duration: ${duration.toFixed(1)} minutes`);
      
      if (stats.evaluationResult) {
        console.log(`   Evaluation resolve rate: ${(stats.evaluationResult.resolveRate * 100).toFixed(1)}%`);
      }
    });

    this.runner.on('error', (error) => {
      console.error('❌ Runner error:', error.message);
    });

    this.runner.on('paused', () => {
      console.log('⏸️  Runner paused');
    });

    this.runner.on('resumed', () => {
      console.log('▶️  Runner resumed');
    });

    this.runner.on('stopped', () => {
      console.log('⏹️  Runner stopped');
    });
  }

  /**
   * Run the complete dataset
   */
  private async runDataset(options: any): Promise<void> {
    try {
      console.log('🔧 Initializing SWE-bench runner...');
      await this.runner.initialize();
      
      const config: Partial<RunnerConfig> = {
        maxConcurrentTasks: parseInt(options.concurrent),
        batchSize: parseInt(options.batchSize),
        maxProblems: options.maxProblems ? parseInt(options.maxProblems) : undefined,
        includeProblems: options.include,
        excludeProblems: options.exclude,
        outputDir: path.resolve(options.output),
        enableEvaluation: options.evaluation !== false,
        saveIntermediateResults: options.intermediate !== false,
        continueOnFailure: !options.stopOnFailure
      };

      console.log('🚀 Configuration:');
      console.log(`   Concurrent tasks: ${config.maxConcurrentTasks}`);
      console.log(`   Batch size: ${config.batchSize}`);
      console.log(`   Output directory: ${config.outputDir}`);
      console.log(`   Evaluation enabled: ${config.enableEvaluation}`);
      console.log('');

      // Setup graceful shutdown
      process.on('SIGINT', () => {
        console.log('\n🛑 Received SIGINT, stopping runner gracefully...');
        this.runner.stop();
      });

      process.on('SIGTERM', () => {
        console.log('\n🛑 Received SIGTERM, stopping runner gracefully...');
        this.runner.stop();
      });

      const stats = await this.runner.runDataset(config);
      
      // Export final results
      const resultsFile = await this.runner.exportResults(config.outputDir!, 'json');
      console.log(`📄 Results exported to: ${resultsFile}`);
      
      const htmlFile = await this.runner.exportResults(config.outputDir!, 'html');
      console.log(`📄 HTML report: ${htmlFile}`);

    } catch (error) {
      logger.error('Failed to run dataset', { error });
      console.error('❌ Failed to run dataset:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  /**
   * Run a single problem
   */
  private async runSingleProblem(problemId: string, options: any): Promise<void> {
    try {
      console.log(`🔧 Initializing runner for problem: ${problemId}`);
      await this.runner.initialize();

      const config: Partial<RunnerConfig> = {
        includeProblems: [problemId],
        maxConcurrentTasks: 1,
        batchSize: 1,
        outputDir: path.resolve(options.output),
        enableEvaluation: false,
        saveIntermediateResults: false
      };

      await this.runner.runDataset(config);

      const results = this.runner.getResults();
      const result = results.get(problemId);

      if (result) {
        console.log(`\n📊 Problem ${problemId} results:`);
        console.log(`   Status: ${result.status}`);
        console.log(`   Execution time: ${(result.executionTime / 1000).toFixed(1)}s`);
        
        if (result.patch) {
          console.log(`   Patch length: ${result.patch.length} characters`);
        }
        
        if (result.error) {
          console.log(`   Error: ${result.error}`);
        }
      }

    } catch (error) {
      logger.error('Failed to run single problem', { problemId, error });
      console.error('❌ Failed to run problem:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  /**
   * Show current status
   */
  private showStatus(): void {
    const stats = this.runner.getStats();
    
    console.log('📊 SWE-bench Runner Status');
    console.log(`   Total problems: ${stats.totalProblems}`);
    console.log(`   Processed: ${stats.processedProblems}`);
    console.log(`   Successful: ${stats.successfulSolutions}`);
    console.log(`   Failed: ${stats.failedSolutions}`);
    console.log(`   Current batch: ${stats.currentBatch}/${stats.totalBatches}`);
    
    if (stats.estimatedCompletion) {
      console.log(`   Estimated completion: ${stats.estimatedCompletion.toISOString()}`);
    }
  }

  /**
   * List available problems
   */
  private async listProblems(options: any): Promise<void> {
    try {
      await this.runner.initialize();
      
      // This would need to be implemented in SWEBenchIntegration
      console.log('📋 Available SWE-bench problems:');
      console.log('   (Feature to be implemented - listing dataset problems)');
      
    } catch (error) {
      logger.error('Failed to list problems', { error });
      console.error('❌ Failed to list problems:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * Show results from previous run
   */
  private async showResults(runDir: string, options: any): Promise<void> {
    try {
      const resultsPath = path.resolve(runDir);
      console.log(`📊 Loading results from: ${resultsPath}`);
      
      // This would load and display results from the specified directory
      console.log('   (Feature to be implemented - loading previous results)');
      
    } catch (error) {
      logger.error('Failed to show results', { runDir, error });
      console.error('❌ Failed to show results:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * Evaluate existing predictions
   */
  private async evaluateExisting(predictionsFile: string, options: any): Promise<void> {
    try {
      console.log(`🔧 Loading predictions from: ${predictionsFile}`);
      
      // This would load predictions and run evaluation
      console.log('   (Feature to be implemented - evaluating existing predictions)');
      
    } catch (error) {
      logger.error('Failed to evaluate predictions', { predictionsFile, error });
      console.error('❌ Failed to evaluate predictions:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * Run the CLI
   */
  async run(args?: string[]): Promise<void> {
    await this.program.parseAsync(args);
  }
}

// Main execution
if (require.main === module) {
  const cli = new SWEBenchCLI();
  cli.run().catch(error => {
    console.error('CLI error:', error);
    process.exit(1);
  });
}

export { SWEBenchCLI };