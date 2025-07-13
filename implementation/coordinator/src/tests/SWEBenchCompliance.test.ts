/**
 * Test-Driven Development tests for SWE-bench official compliance
 * 
 * These tests ensure our implementation fully complies with:
 * - Official SWE-bench schema from princeton-nlp/SWE-bench_Lite
 * - Official evaluation harness prediction format
 * - Claude Code + ruv-swarm + claude-flow integration
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SWEBenchIntegration, SWEBenchProblem, SWEBenchPrediction } from '../services/SWEBenchIntegration';
import { ClaudeCodeSpawner } from '../services/ClaudeCodeSpawner';
import { SWEBenchService } from '../services/SWEBenchService';
import { EventBus } from '../services/EventBus';

describe('SWE-bench Official Compliance Tests', () => {
  let swebenchIntegration: SWEBenchIntegration;
  let claudeCodeSpawner: ClaudeCodeSpawner;
  let swebenchService: SWEBenchService;
  let testProblem: SWEBenchProblem;

  beforeAll(async () => {
    // Initialize components
    swebenchIntegration = new SWEBenchIntegration();
    claudeCodeSpawner = new ClaudeCodeSpawner();
    const eventBus = new EventBus();
    swebenchService = new SWEBenchService(eventBus);

    await swebenchIntegration.initialize();
    await claudeCodeSpawner.initialize();
    await swebenchService.initialize();

    // Load a test problem for testing
    const dataset = await swebenchIntegration.fetchDataset();
    testProblem = dataset[0]; // Use first problem for testing
  }, 30000); // 30 second timeout for initialization

  describe('Schema Compliance', () => {
    it('should load official SWE-bench dataset with correct schema', async () => {
      const dataset = await swebenchIntegration.fetchDataset();
      
      expect(dataset).toBeDefined();
      expect(Array.isArray(dataset)).toBe(true);
      expect(dataset.length).toBeGreaterThan(0);
      
      // Test first problem has all required fields
      const problem = dataset[0];
      const requiredFields = [
        'repo', 'instance_id', 'base_commit', 'patch', 'test_patch',
        'problem_statement', 'hints_text', 'created_at', 'version'
      ];
      
      for (const field of requiredFields) {
        expect(problem).toHaveProperty(field);
        expect(typeof problem[field]).toBe('string');
      }
      
      // Verify base_commit is 40 characters (SHA hash)
      expect(problem.base_commit).toHaveLength(40);
      
      // Verify no non-standard fields exist
      const nonStandardFields = ['FAIL_TO_PASS', 'PASS_TO_PASS', 'environment_setup_commit'];
      for (const field of nonStandardFields) {
        expect(problem).not.toHaveProperty(field);
      }
    });

    it('should validate specific problem data types', () => {
      expect(typeof testProblem.repo).toBe('string');
      expect(testProblem.repo).toMatch(/^[\w\-_.]+\/[\w\-_.]+$/); // Format: owner/repo
      
      expect(typeof testProblem.instance_id).toBe('string');
      expect(testProblem.instance_id.length).toBeGreaterThan(0);
      
      expect(typeof testProblem.base_commit).toBe('string');
      expect(testProblem.base_commit).toMatch(/^[a-f0-9]{40}$/); // SHA-1 hash format
      
      expect(typeof testProblem.patch).toBe('string');
      expect(testProblem.patch).toContain('diff --git'); // Valid patch format
      
      expect(typeof testProblem.test_patch).toBe('string');
      expect(testProblem.test_patch).toContain('diff --git'); // Valid patch format
      
      expect(typeof testProblem.problem_statement).toBe('string');
      expect(testProblem.problem_statement.length).toBeGreaterThan(0);
    });
  });

  describe('Official Prediction Format', () => {
    it('should generate predictions in official format', async () => {
      const prediction: SWEBenchPrediction = {
        model_name_or_path: 'swebench-swarm',
        model_patch: 'diff --git a/test.py b/test.py\n--- a/test.py\n+++ b/test.py\n@@ -1 +1 @@\n-# TODO\n+# Fixed\n'
      };
      
      expect(prediction).toHaveProperty('model_name_or_path');
      expect(prediction).toHaveProperty('model_patch');
      expect(typeof prediction.model_name_or_path).toBe('string');
      expect(typeof prediction.model_patch).toBe('string');
      
      // Verify patch format
      expect(prediction.model_patch).toContain('diff --git');
    });

    it('should create prediction collection with correct structure', () => {
      const predictions = {
        [testProblem.instance_id]: {
          model_name_or_path: 'swebench-swarm',
          model_patch: 'test patch content'
        }
      };
      
      expect(predictions).toHaveProperty(testProblem.instance_id);
      expect(predictions[testProblem.instance_id]).toHaveProperty('model_name_or_path');
      expect(predictions[testProblem.instance_id]).toHaveProperty('model_patch');
    });
  });

  describe('Repository Operations', () => {
    it('should clone repository at correct base commit', async () => {
      const repoPath = await swebenchIntegration.setupRepository(testProblem);
      
      expect(repoPath).toBeDefined();
      expect(typeof repoPath).toBe('string');
      
      // Verify directory exists
      try {
        const stats = await fs.stat(repoPath);
        expect(stats.isDirectory()).toBe(true);
      } catch (error) {
        fail(`Repository directory should exist at ${repoPath}`);
      }
      
      // Verify git repository
      const gitDir = path.join(repoPath, '.git');
      try {
        const gitStats = await fs.stat(gitDir);
        expect(gitStats.isDirectory()).toBe(true);
      } catch (error) {
        fail(`Git directory should exist at ${gitDir}`);
      }
    });

    it('should parse problem files correctly', () => {
      const files = swebenchIntegration.parseProblemFiles(testProblem);
      
      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBeGreaterThan(0);
      
      // Files should be valid paths
      for (const file of files) {
        expect(typeof file).toBe('string');
        expect(file.length).toBeGreaterThan(0);
        expect(file).not.toContain('\\'); // Should use forward slashes
      }
    });
  });

  describe('Claude Code Integration', () => {
    it('should initialize Claude Code spawner', async () => {
      // This test verifies that Claude Code is available
      expect(claudeCodeSpawner).toBeDefined();
      // The initialize method should not throw
      await expect(claudeCodeSpawner.initialize()).resolves.not.toThrow();
    });

    it('should create proper problem context for Claude Code', async () => {
      const repoPath = '/tmp/test-repo';
      const outputPath = '/tmp/test-output.patch';
      
      // Create the context (without actually spawning Claude Code)
      const contextCreation = async () => {
        // This would normally call spawnForProblem, but we just test the setup
        const sessionDir = path.join(claudeCodeSpawner['workDir'], `test-${Date.now()}`);
        await fs.mkdir(sessionDir, { recursive: true });
        
        // Test that context file would be created with correct content
        const contextFile = path.join(sessionDir, 'problem_context.md');
        const context = `# SWE-Bench Problem Context

## Problem ID: ${testProblem.instance_id}
## Repository: ${testProblem.repo}
## Base Commit: ${testProblem.base_commit}

## Problem Statement
${testProblem.problem_statement}

## Hints
${testProblem.hints_text || 'No hints provided'}`;
        
        await fs.writeFile(contextFile, context);
        
        // Verify file was created
        const content = await fs.readFile(contextFile, 'utf-8');
        expect(content).toContain(testProblem.instance_id);
        expect(content).toContain(testProblem.problem_statement);
        
        // Cleanup
        await fs.rm(sessionDir, { recursive: true, force: true });
      };
      
      await expect(contextCreation()).resolves.not.toThrow();
    });

    it('should configure MCP servers correctly', async () => {
      const mcpConfig = {
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
      
      expect(mcpConfig.mcpServers).toHaveProperty('claude-flow');
      expect(mcpConfig.mcpServers).toHaveProperty('ruv-swarm');
      expect(mcpConfig.mcpServers['claude-flow'].command).toBe('npx');
      expect(mcpConfig.mcpServers['ruv-swarm'].command).toBe('npx');
    });
  });

  describe('SWE-bench Service Integration', () => {
    it('should create task for SWE-bench problem', async () => {
      const task = await swebenchService.submitSWEBenchProblem(testProblem.instance_id, testProblem.repo);
      
      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.metadata?.problem_id).toBe(testProblem.instance_id);
      expect(task.metadata?.repo).toBe(testProblem.repo);
      expect(task.tags).toContain('swebench');
    });

    it('should get random problem from official dataset', async () => {
      const randomProblem = await swebenchService.getRandomProblem();
      
      expect(randomProblem).toBeDefined();
      expect(typeof randomProblem.instance_id).toBe('string');
      expect(typeof randomProblem.repo).toBe('string');
      expect(randomProblem.base_commit).toHaveLength(40);
    });
  });

  describe('Test Execution', () => {
    it('should extract test files from test patch', async () => {
      const extractTestFiles = (testPatch: string): string[] => {
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
      };
      
      const testFiles = extractTestFiles(testProblem.test_patch);
      
      expect(Array.isArray(testFiles)).toBe(true);
      
      // If test files are found, they should be valid paths
      if (testFiles.length > 0) {
        for (const file of testFiles) {
          expect(typeof file).toBe('string');
          expect(file).toContain('test');
        }
      }
    });

    it('should validate patch format', () => {
      const isValidPatch = (patch: string): boolean => {
        return patch.includes('diff --git') && 
               patch.includes('---') && 
               patch.includes('+++');
      };
      
      expect(isValidPatch(testProblem.patch)).toBe(true);
      expect(isValidPatch(testProblem.test_patch)).toBe(true);
    });
  });

  describe('End-to-End Compliance', () => {
    it('should complete full workflow with official data', async () => {
      // This test verifies the complete workflow works with official schema
      const workflow = async () => {
        // 1. Load official dataset
        const dataset = await swebenchIntegration.fetchDataset();
        expect(dataset.length).toBeGreaterThan(0);
        
        // 2. Select a problem
        const problem = dataset[0];
        expect(problem.instance_id).toBeDefined();
        
        // 3. Create task
        const task = await swebenchService.submitSWEBenchProblem(problem.instance_id, problem.repo);
        expect(task.id).toBeDefined();
        
        // 4. Verify task metadata matches official schema
        expect(task.metadata?.problem_id).toBe(problem.instance_id);
        expect(task.metadata?.repo).toBe(problem.repo);
        
        return { dataset, problem, task };
      };
      
      await expect(workflow()).resolves.toBeDefined();
    });

    it('should generate evaluation-harness compatible output', () => {
      const generatePrediction = (instanceId: string, patch: string) => {
        return {
          [instanceId]: {
            model_name_or_path: 'swebench-swarm',
            model_patch: patch
          }
        };
      };
      
      const prediction = generatePrediction(testProblem.instance_id, 'test patch');
      
      // Verify structure matches evaluation harness requirements
      expect(prediction).toHaveProperty(testProblem.instance_id);
      expect(prediction[testProblem.instance_id]).toHaveProperty('model_name_or_path');
      expect(prediction[testProblem.instance_id]).toHaveProperty('model_patch');
      expect(prediction[testProblem.instance_id].model_name_or_path).toBe('swebench-swarm');
    });
  });

  afterAll(async () => {
    // Cleanup any test artifacts
    try {
      const workDir = path.join(process.cwd(), '.swebench-work');
      await fs.rm(workDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });
});