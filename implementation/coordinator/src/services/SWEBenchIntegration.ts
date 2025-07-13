import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../utils/Logger';
import { SwarmException } from '../types';

const execAsync = promisify(exec);

/**
 * Official SWE-bench problem format - matches princeton-nlp/SWE-bench_Lite schema exactly
 * @see https://huggingface.co/datasets/princeton-nlp/SWE-bench_Lite
 */
export interface SWEBenchProblem {
  /** Repository identifier (e.g., "django/django") */
  repo: string;
  /** Unique problem instance identifier */
  instance_id: string;
  /** Base commit hash (40 characters) */
  base_commit: string;
  /** Code patch that resolves the issue */
  patch: string;
  /** Test modifications associated with the patch */
  test_patch: string;
  /** Detailed description of the GitHub issue */
  problem_statement: string;
  /** Additional guidance for resolving the issue (optional) */
  hints_text: string;
  /** Timestamp of issue creation */
  created_at: string;
  /** Version identifier */
  version: string;
  /** Allow indexing for dynamic property access in tests */
  [key: string]: string;
}

/**
 * Official prediction format for SWE-bench evaluation harness
 * @see https://github.com/princeton-nlp/SWE-bench/blob/main/swebench/harness/run_evaluation.py
 */
export interface SWEBenchPrediction {
  /** Model name or path for identification */
  model_name_or_path: string;
  /** Generated patch content */
  model_patch: string;
}

/**
 * Collection of predictions keyed by instance_id
 */
export interface SWEBenchPredictions {
  [instance_id: string]: SWEBenchPrediction;
}

/**
 * Integration with SWE-Bench dataset and evaluation
 */
export class SWEBenchIntegration {
  private logger: Logger;
  private datasetUrl: string;
  private cacheDir: string;
  private workDir: string;

  constructor() {
    this.logger = new Logger('SWEBenchIntegration');
    // Use official dataset fetched by Python script
    this.datasetUrl = path.join(process.cwd(), '.swebench-cache', 'swebench_lite.json');
    this.cacheDir = path.join(process.cwd(), '.swebench-cache');
    this.workDir = path.join(process.cwd(), '.swebench-work');
  }

  /**
   * Initialize SWE-Bench integration
   */
  async initialize(): Promise<void> {
    // Create cache and work directories
    await fs.mkdir(this.cacheDir, { recursive: true });
    await fs.mkdir(this.workDir, { recursive: true });
    
    this.logger.info('SWE-Bench integration initialized', {
      cacheDir: this.cacheDir,
      workDir: this.workDir
    });
  }

  /**
   * Fetch a specific problem from SWE-Bench
   */
  async fetchProblem(instanceId: string): Promise<SWEBenchProblem> {
    try {
      // First try to get from cache
      const cached = await this.getCachedProblem(instanceId);
      if (cached) {
        this.logger.debug('Using cached problem', { instanceId });
        return cached;
      }

      // Fetch dataset
      const dataset = await this.fetchDataset();
      
      // Find problem
      const problem = dataset.find(p => p.instance_id === instanceId);
      if (!problem) {
        throw new SwarmException('PROBLEM_NOT_FOUND', `Problem ${instanceId} not found in dataset`);
      }

      // Cache it
      await this.cacheProblem(problem);
      
      return problem;
    } catch (error) {
      this.logger.error('Failed to fetch problem', { instanceId, error });
      throw new SwarmException('FETCH_FAILED', `Failed to fetch problem: ${error}`);
    }
  }

  /**
   * Fetch the entire dataset from official source
   */
  async fetchDataset(): Promise<SWEBenchProblem[]> {
    try {
      // Check if official dataset exists (fetched by Python script)
      try {
        await fs.access(this.datasetUrl);
        const data = await fs.readFile(this.datasetUrl, 'utf-8');
        const dataset = JSON.parse(data);
        
        this.logger.info('Loaded official SWE-Bench dataset', { 
          problems: dataset.length,
          source: 'princeton-nlp/SWE-bench_Lite'
        });
        
        return dataset;
      } catch (e) {
        this.logger.warn('Official dataset not found, attempting to fetch', { 
          expected: this.datasetUrl,
          error: e 
        });
      }

      // Fallback: try to run Python script to fetch official dataset
      this.logger.info('Attempting to fetch official dataset using Python script');
      try {
        const pythonScript = path.join(process.cwd(), 'scripts', 'fetch_swebench_data.py');
        const { stdout } = await execAsync(`source scripts/venv/bin/activate && python ${pythonScript} --split test`);
        this.logger.info('Dataset fetch script output', { stdout });
        
        // Try reading again
        const data = await fs.readFile(this.datasetUrl, 'utf-8');
        const dataset = JSON.parse(data);
        
        this.logger.info('Successfully fetched official dataset', { 
          problems: dataset.length 
        });
        
        return dataset;
      } catch (fetchError) {
        this.logger.error('Failed to fetch official dataset', { fetchError });
        throw new SwarmException('DATASET_FETCH_FAILED', 
          `Failed to fetch official SWE-Bench dataset. Please run: source scripts/venv/bin/activate && python scripts/fetch_swebench_data.py`);
      }
    } catch (error) {
      this.logger.error('Dataset loading failed', { error });
      throw new SwarmException('DATASET_LOAD_FAILED', `Failed to load dataset: ${error}`);
    }
  }

  /**
   * Clone and setup repository for a problem
   */
  async setupRepository(problem: SWEBenchProblem): Promise<string> {
    const repoDir = path.join(this.workDir, problem.instance_id);
    
    try {
      // Clean up if exists
      await execAsync(`rm -rf ${repoDir}`);
      
      // Clone repository
      this.logger.info('Cloning repository', { 
        repo: problem.repo,
        commit: problem.base_commit 
      });
      
      const repoUrl = `https://github.com/${problem.repo}.git`;
      await execAsync(`git clone ${repoUrl} ${repoDir}`);
      
      // Checkout base commit
      await execAsync(`git checkout ${problem.base_commit}`, { cwd: repoDir });
      
      // Note: Official SWE-Bench schema doesn't include environment_setup_commit
      // Environment setup is handled through the repository state at base_commit
      
      // Install dependencies based on repository type
      await this.installDependencies(repoDir, problem.repo);
      
      this.logger.info('Repository setup complete', { 
        repo: problem.repo,
        dir: repoDir 
      });
      
      return repoDir;
    } catch (error) {
      this.logger.error('Failed to setup repository', { 
        repo: problem.repo,
        error 
      });
      throw new SwarmException('REPO_SETUP_FAILED', `Failed to setup repository: ${error}`);
    }
  }

  /**
   * Install dependencies based on repository type
   */
  private async installDependencies(repoDir: string, repo: string): Promise<void> {
    try {
      // Python projects
      if (await this.fileExists(path.join(repoDir, 'setup.py')) || 
          await this.fileExists(path.join(repoDir, 'pyproject.toml'))) {
        this.logger.info('Installing Python dependencies');
        
        // Create virtual environment
        await execAsync('python -m venv venv', { cwd: repoDir });
        
        // Install dependencies
        const pipCmd = path.join(repoDir, 'venv', 'bin', 'pip');
        await execAsync(`${pipCmd} install -e .`, { cwd: repoDir });
        
        // Install test dependencies if requirements-test.txt exists
        if (await this.fileExists(path.join(repoDir, 'requirements-test.txt'))) {
          await execAsync(`${pipCmd} install -r requirements-test.txt`, { cwd: repoDir });
        }
      }
      
      // Node.js projects
      else if (await this.fileExists(path.join(repoDir, 'package.json'))) {
        this.logger.info('Installing Node.js dependencies');
        await execAsync('npm install', { cwd: repoDir });
      }
      
      // Java projects
      else if (await this.fileExists(path.join(repoDir, 'pom.xml'))) {
        this.logger.info('Installing Maven dependencies');
        await execAsync('mvn install -DskipTests', { cwd: repoDir });
      }
      
    } catch (error) {
      this.logger.warn('Failed to install dependencies', { error });
      // Continue anyway - some repos might not need installation
    }
  }

  /**
   * Apply a patch to the repository
   */
  async applyPatch(repoDir: string, patch: string): Promise<void> {
    try {
      // Save patch to file
      const patchFile = path.join(repoDir, 'solution.patch');
      await fs.writeFile(patchFile, patch);
      
      // Apply patch
      await execAsync(`git apply ${patchFile}`, { cwd: repoDir });
      
      this.logger.info('Patch applied successfully');
    } catch (error) {
      this.logger.error('Failed to apply patch', { error });
      throw new SwarmException('PATCH_FAILED', `Failed to apply patch: ${error}`);
    }
  }

  /**
   * Run tests for a problem using official SWE-bench methodology
   * Tests are extracted from test_patch and run to validate the solution
   */
  async runTests(problem: SWEBenchProblem, repoDir: string): Promise<{
    passed: string[];
    failed: string[];
    output: string;
  }> {
    try {
      // Apply test patch first
      const testPatchFile = path.join(repoDir, 'test.patch');
      await fs.writeFile(testPatchFile, problem.test_patch);
      await execAsync(`git apply ${testPatchFile}`, { cwd: repoDir });
      
      // Determine test runner based on repository
      let testCommand: string;
      const isPython = await this.fileExists(path.join(repoDir, 'setup.py')) || 
                      await this.fileExists(path.join(repoDir, 'pyproject.toml'));
      const isNode = await this.fileExists(path.join(repoDir, 'package.json'));
      
      if (isPython) {
        // Use virtual environment python if available
        const venvPython = path.join(repoDir, 'venv', 'bin', 'python');
        const pythonCmd = await this.fileExists(venvPython) ? venvPython : 'python3';
        testCommand = `${pythonCmd} -m pytest -xvs`;
      } else if (isNode) {
        testCommand = 'npm test';
      } else {
        throw new Error('Unknown project type for testing');
      }
      
      // Extract test files from test_patch to run specific tests
      const testFiles = this.extractTestFilesFromPatch(problem.test_patch);
      
      const passed: string[] = [];
      const failed: string[] = [];
      let output = '';
      
      // Run discovered test files
      for (const testFile of testFiles) {
        try {
          const result = await execAsync(`${testCommand} ${testFile}`, { 
            cwd: repoDir,
            timeout: 60000 // 60 second timeout per test file
          });
          passed.push(testFile);
          output += `\n✓ ${testFile}\n${result.stdout}\n`;
        } catch (error: any) {
          failed.push(testFile);
          output += `\n✗ ${testFile}\n${error.stdout || error.stderr}\n`;
        }
      }
      
      // If no specific test files found, run all tests in test directories
      if (testFiles.length === 0) {
        try {
          const result = await execAsync(testCommand, { 
            cwd: repoDir,
            timeout: 120000 // 2 minute timeout for full test suite
          });
          passed.push('all_tests');
          output += `\n✓ Full test suite\n${result.stdout}\n`;
        } catch (error: any) {
          failed.push('all_tests');
          output += `\n✗ Full test suite\n${error.stdout || error.stderr}\n`;
        }
      }
      
      return { passed, failed, output };
    } catch (error) {
      this.logger.error('Failed to run tests', { error });
      throw new SwarmException('TEST_FAILED', `Failed to run tests: ${error}`);
    }
  }

  /**
   * Generate a patch from current changes
   */
  async generatePatch(repoDir: string): Promise<string> {
    try {
      const { stdout } = await execAsync('git diff', { cwd: repoDir });
      return stdout;
    } catch (error) {
      this.logger.error('Failed to generate patch', { error });
      throw new SwarmException('PATCH_GENERATION_FAILED', `Failed to generate patch: ${error}`);
    }
  }

  /**
   * Extract test files from test patch
   */
  private extractTestFilesFromPatch(testPatch: string): string[] {
    const testFiles: Set<string> = new Set();
    
    const patchLines = testPatch.split('\n');
    for (const line of patchLines) {
      if (line.startsWith('diff --git')) {
        const match = line.match(/b\/(.+)$/);
        if (match && match[1].includes('test')) {
          testFiles.add(match[1]);
        }
      }
    }
    
    return Array.from(testFiles);
  }

  /**
   * Parse problem to extract file paths from official schema
   */
  parseProblemFiles(problem: SWEBenchProblem): string[] {
    const files: Set<string> = new Set();
    
    // Extract from main patch
    const patchLines = problem.patch.split('\n');
    for (const line of patchLines) {
      if (line.startsWith('diff --git')) {
        const match = line.match(/b\/(.+)$/);
        if (match) {
          files.add(match[1]);
        }
      }
    }
    
    // Extract from test patch
    const testPatchLines = problem.test_patch.split('\n');
    for (const line of testPatchLines) {
      if (line.startsWith('diff --git')) {
        const match = line.match(/b\/(.+)$/);
        if (match) {
          files.add(match[1]);
        }
      }
    }
    
    return Array.from(files);
  }

  /**
   * Validate a solution
   */
  async validateSolution(problem: SWEBenchProblem, solution: string): Promise<{
    valid: boolean;
    passed: string[];
    failed: string[];
    output: string;
  }> {
    let repoDir: string | null = null;
    
    try {
      // Setup repository
      repoDir = await this.setupRepository(problem);
      
      // Apply solution
      await this.applyPatch(repoDir, solution);
      
      // Run tests
      const testResults = await this.runTests(problem, repoDir);
      
      // Determine success based on test results
      // In official SWE-bench, success is determined by whether tests pass after applying the patch
      const allPassed = testResults.failed.length === 0 && testResults.passed.length > 0;
      
      return {
        valid: allPassed && testResults.failed.length === 0,
        ...testResults
      };
    } finally {
      // Cleanup
      if (repoDir) {
        try {
          await execAsync(`rm -rf ${repoDir}`);
        } catch (e) {
          this.logger.warn('Failed to cleanup repository', { error: e });
        }
      }
    }
  }

  // Helper methods
  
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async getCachedProblem(instanceId: string): Promise<SWEBenchProblem | null> {
    try {
      const cachePath = path.join(this.cacheDir, `${instanceId}.json`);
      const data = await fs.readFile(cachePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private async cacheProblem(problem: SWEBenchProblem): Promise<void> {
    const cachePath = path.join(this.cacheDir, `${problem.instance_id}.json`);
    await fs.writeFile(cachePath, JSON.stringify(problem, null, 2));
  }
}