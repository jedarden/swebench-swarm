import { Router, Request, Response } from 'express';
import { SWEBenchService } from '../services/SWEBenchService';
import { EventBus } from '../services/EventBus';
import { asyncHandler } from '../middleware/asyncHandler';
import { TaskPriority } from '../types';

export function createSWEBenchRoutes(swebenchService: SWEBenchService): Router {
  const router = Router();

  // Submit a specific SWE-Bench problem
  router.post('/problems/:problemId/submit', asyncHandler(async (req: Request, res: Response) => {
    const { problemId } = req.params;
    const { repo } = req.body;
    
    const task = await swebenchService.submitSWEBenchProblem(problemId, repo);
    
    res.status(201).json({
      success: true,
      task
    });
  }));

  // Submit a random SWE-Bench problem
  router.post('/problems/random', asyncHandler(async (req: Request, res: Response) => {
    const task = await swebenchService.submitRandomProblem();
    
    res.status(201).json({
      success: true,
      task
    });
  }));

  // Get available problems
  router.get('/problems', asyncHandler(async (req: Request, res: Response) => {
    const { limit = 10, offset = 0 } = req.query;
    
    // This would ideally paginate through the dataset
    const problem = await swebenchService.getRandomProblem();
    
    res.json({
      success: true,
      problems: [problem], // Simplified for now
      total: 300 // SWE-Bench lite has 300 problems
    });
  }));

  // Get problem details
  router.get('/problems/:problemId', asyncHandler(async (req: Request, res: Response) => {
    const { problemId } = req.params;
    
    // This would fetch the specific problem
    // For now, return a placeholder
    res.json({
      success: true,
      problem: {
        instance_id: problemId,
        message: 'Problem details endpoint not fully implemented'
      }
    });
  }));

  // Get tasks filtered by SWE-Bench
  router.get('/tasks', asyncHandler(async (req: Request, res: Response) => {
    const tasks = await swebenchService.listTasks({
      tags: ['swebench']
    });
    
    res.json({
      success: true,
      tasks,
      count: tasks.length
    });
  }));

  // Submit a problem with analysis (from run-swebench.sh)
  router.post('/submit', asyncHandler(async (req: Request, res: Response) => {
    const { problem_id, repo, analysis } = req.body;
    
    if (!problem_id) {
      return res.status(400).json({
        success: false,
        error: 'problem_id is required'
      });
    }
    
    const task = await swebenchService.createTask({
      title: `SWE-Bench: ${problem_id}`,
      description: `Solve SWE-Bench problem ${problem_id}`,
      priority: TaskPriority.HIGH,
      metadata: {
        problem_id,
        repo: repo || '',
        type: 'swebench',
        analysis: analysis || {}
      },
      tags: ['swebench', 'automated', 'claude-code']
    });
    
    res.status(201).json({
      success: true,
      id: task.id,
      status: task.status
    });
  }));

  return router;
}

// Create a default instance for the main app
export function setupSWEBenchRoutes(app: any): void {
  const eventBus = new EventBus();
  const swebenchService = new SWEBenchService(eventBus);
  
  // Initialize the service
  swebenchService.initialize().catch(err => {
    console.error('Failed to initialize SWE-Bench service:', err);
  });
  
  // Mount the routes
  app.use('/api/swebench', createSWEBenchRoutes(swebenchService));
  app.use('/api', createSWEBenchRoutes(swebenchService)); // Also mount at /api for compatibility
}