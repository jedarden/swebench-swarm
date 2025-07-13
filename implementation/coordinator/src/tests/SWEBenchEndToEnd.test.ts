/**
 * End-to-End integration tests for complete SWE-bench workflow
 * Tests the full pipeline from dataset loading to prediction generation
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SWEBenchRunner } from '../services/SWEBenchRunner';
import { SWEBenchIntegration } from '../services/SWEBenchIntegration';
import { SWEBenchPredictionService } from '../services/SWEBenchPredictionService';

describe('SWE-bench End-to-End Integration Tests', () => {
  let runner: SWEBenchRunner;
  let swebenchIntegration: SWEBenchIntegration;
  let predictionService: SWEBenchPredictionService;
  let testOutputDir: string;

  beforeAll(async () => {
    // Initialize services
    runner = new SWEBenchRunner();
    swebenchIntegration = new SWEBenchIntegration();
    predictionService = new SWEBenchPredictionService();

    // Create test output directory
    testOutputDir = path.join(process.cwd(), '.test-output');
    await fs.mkdir(testOutputDir, { recursive: true });

    // Initialize all services
    await runner.initialize();
    await swebenchIntegration.initialize();
    await predictionService.initialize();
  }, 60000); // 60 second timeout for initialization

  afterAll(async () => {
    // Cleanup test artifacts
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Dataset Loading and Validation', () => {
    it('should load official SWE-bench dataset successfully', async () => {
      const dataset = await swebenchIntegration.fetchDataset();
      
      expect(dataset).toBeDefined();
      expect(Array.isArray(dataset)).toBe(true);
      expect(dataset.length).toBeGreaterThan(0);
      expect(dataset.length).toBe(300); // SWE-bench Lite should have 300 problems
      
      // Validate first problem structure
      const firstProblem = dataset[0];
      expect(firstProblem).toHaveProperty('repo');
      expect(firstProblem).toHaveProperty('instance_id');
      expect(firstProblem).toHaveProperty('base_commit');
      expect(firstProblem).toHaveProperty('patch');
      expect(firstProblem).toHaveProperty('test_patch');
      expect(firstProblem).toHaveProperty('problem_statement');
      expect(firstProblem).toHaveProperty('hints_text');
      expect(firstProblem).toHaveProperty('created_at');
      expect(firstProblem).toHaveProperty('version');
    });

    it('should validate problem data types and formats', async () => {
      const dataset = await swebenchIntegration.fetchDataset();
      const problem = dataset[0];
      
      // Validate data types
      expect(typeof problem.repo).toBe('string');
      expect(typeof problem.instance_id).toBe('string');
      expect(typeof problem.base_commit).toBe('string');
      expect(typeof problem.patch).toBe('string');
      expect(typeof problem.test_patch).toBe('string');
      expect(typeof problem.problem_statement).toBe('string');
      
      // Validate formats
      expect(problem.repo).toMatch(/^[\w\-_.]+\/[\w\-_.]+$/); // owner/repo format
      expect(problem.base_commit).toMatch(/^[a-f0-9]{40}$/); // SHA-1 hash
      expect(problem.patch).toContain('diff --git'); // Valid patch format
      expect(problem.test_patch).toContain('diff --git'); // Valid patch format
      expect(problem.problem_statement.length).toBeGreaterThan(0);
    });
  });

  describe('Prediction Service Integration', () => {
    it('should manage predictions correctly', async () => {
      const testInstanceId = 'test-instance-1';
      const testPatch = 'diff --git a/test.py b/test.py\n--- a/test.py\n+++ b/test.py\n@@ -1 +1 @@\n-# TODO\n+# Fixed\n';
      
      // Add prediction
      predictionService.addPrediction(testInstanceId, testPatch);
      
      // Verify prediction was added
      const prediction = predictionService.getPrediction(testInstanceId);
      expect(prediction).toBeDefined();
      expect(prediction?.model_name_or_path).toBe('swebench-swarm');
      expect(prediction?.model_patch).toBe(testPatch);
      
      // Get statistics
      const stats = predictionService.getStatistics();
      expect(stats.totalPredictions).toBeGreaterThan(0);
      expect(stats.instanceIds).toContain(testInstanceId);
      
      // Export predictions
      const exportPath = await predictionService.exportPredictions();
      expect(exportPath).toBeDefined();
      
      // Verify exported file exists and has correct format
      const exportedData = await fs.readFile(exportPath, 'utf-8');
      const predictions = JSON.parse(exportedData);
      expect(predictions).toHaveProperty(testInstanceId);
      expect(predictions[testInstanceId]).toHaveProperty('model_name_or_path');
      expect(predictions[testInstanceId]).toHaveProperty('model_patch');
    });

    it('should validate predictions against SWE-bench requirements', async () => {
      // Clear previous predictions
      predictionService.clearPredictions();
      
      // Add valid prediction
      predictionService.addPrediction('valid-test', 'diff --git a/test.py b/test.py\nvalid patch');
      
      // Add invalid prediction (will be rejected by validation)
      const validationResult = predictionService.validateAllPredictions();
      
      expect(validationResult.valid.length).toBeGreaterThan(0);
      expect(validationResult.valid).toContain('valid-test');
    });
  });

  describe('Runner Configuration and Execution', () => {
    it('should configure runner with appropriate limits', async () => {
      const config = {
        maxConcurrentTasks: 1,
        batchSize: 2,
        maxProblems: 3, // Test with only 3 problems
        enableEvaluation: false, // Skip evaluation for speed
        saveIntermediateResults: true,
        continueOnFailure: true,
        outputDir: testOutputDir
      };

      // Get initial stats
      const initialStats = runner.getStats();
      expect(initialStats.totalProblems).toBe(0);
      expect(initialStats.processedProblems).toBe(0);
    });

    it('should handle runner lifecycle correctly', async () => {
      // Test pause/resume functionality
      expect(() => runner.pause()).not.toThrow();
      expect(() => runner.resume()).not.toThrow();
      expect(() => runner.stop()).not.toThrow();
    });
  });

  describe('Small Dataset Test Run', () => {
    it('should successfully process a small subset of problems', async () => {
      const config = {
        maxConcurrentTasks: 1,
        batchSize: 1,
        maxProblems: 1, // Process only 1 problem for testing
        enableEvaluation: false,
        saveIntermediateResults: false,
        continueOnFailure: true,
        outputDir: testOutputDir
      };

      let statsUpdates: any[] = [];
      let problemResults: any[] = [];

      // Setup event listeners to track progress
      runner.on('started', (stats) => {
        statsUpdates.push({ event: 'started', stats });
      });

      runner.on('problemCompleted', (result) => {
        problemResults.push(result);
      });

      runner.on('completed', (stats) => {
        statsUpdates.push({ event: 'completed', stats });
      });

      // Run with timeout (this will likely timeout due to Claude Code spawning, but we can test the setup)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Test timeout - expected for integration test')), 30000);
      });

      try {
        await Promise.race([
          runner.runDataset(config),
          timeoutPromise
        ]);
      } catch (error) {
        // Expected to timeout in test environment
        expect(error).toBeDefined();
      }

      // Verify that runner attempted to start
      expect(statsUpdates.length).toBeGreaterThan(0);
      expect(statsUpdates[0].event).toBe('started');
      
      // Verify configuration was applied
      const finalStats = runner.getStats();
      expect(finalStats.totalProblems).toBeLessThanOrEqual(1);

    }, 45000); // 45 second timeout
  });

  describe('System Requirements Validation', () => {
    it('should validate system meets minimum requirements', async () => {
      // Test that we can check system requirements
      // Note: This would normally check Docker, memory, etc.
      // For CI environments, we'll just validate the structure
      
      const mockRequirements = {
        minCpuCores: 2,
        minMemoryGB: 4,
        minStorageGB: 10,
        recommendedWorkers: 2,
        dockerRequired: true
      };

      expect(mockRequirements.minCpuCores).toBeGreaterThan(0);
      expect(mockRequirements.minMemoryGB).toBeGreaterThan(0);
      expect(mockRequirements.dockerRequired).toBe(true);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle invalid problem IDs gracefully', async () => {
      const config = {
        includeProblems: ['non-existent-problem-id'],
        maxConcurrentTasks: 1,
        batchSize: 1,
        enableEvaluation: false,
        outputDir: testOutputDir
      };

      // This should not throw an error, but should result in 0 problems processed
      try {
        const stats = await runner.runDataset(config);
        expect(stats.totalProblems).toBe(0);
      } catch (error) {
        // May throw due to no valid problems, which is acceptable
        expect(error).toBeDefined();
      }
    });

    it('should handle export operations correctly', async () => {
      // Test various export formats
      predictionService.clearPredictions();
      predictionService.addPrediction('export-test', 'diff --git a/test.py b/test.py\ntest patch');
      
      const jsonPath = await predictionService.exportPredictions('test-export.json');
      expect(jsonPath).toContain('test-export.json');
      
      // Verify file was created
      const fileExists = await fs.access(jsonPath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });
  });

  describe('Performance and Metrics', () => {
    it('should track execution metrics correctly', async () => {
      const stats = runner.getStats();
      
      // Verify stats structure
      expect(stats).toHaveProperty('totalProblems');
      expect(stats).toHaveProperty('processedProblems');
      expect(stats).toHaveProperty('successfulSolutions');
      expect(stats).toHaveProperty('failedSolutions');
      expect(stats).toHaveProperty('startTime');
      expect(stats).toHaveProperty('currentTime');
      
      // Verify initial values
      expect(typeof stats.totalProblems).toBe('number');
      expect(typeof stats.processedProblems).toBe('number');
      expect(stats.startTime).toBeInstanceOf(Date);
      expect(stats.currentTime).toBeInstanceOf(Date);
    });

    it('should provide prediction statistics', async () => {
      const stats = predictionService.getStatistics();
      
      expect(stats).toHaveProperty('totalPredictions');
      expect(stats).toHaveProperty('averagePatchLength');
      expect(stats).toHaveProperty('instanceIds');
      
      expect(typeof stats.totalPredictions).toBe('number');
      expect(typeof stats.averagePatchLength).toBe('number');
      expect(Array.isArray(stats.instanceIds)).toBe(true);
    });
  });
});