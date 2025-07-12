import { Router, Request, Response } from 'express';
import { SwarmCoordinator } from '../services/SwarmCoordinator';
import { ApiResponse } from '../types';
import { Logger } from '../utils/Logger';

const logger = new Logger('TaskRoutes');

export function taskRoutes(coordinator: SwarmCoordinator): Router {
  const router = Router();

  /**
   * GET /tasks/:taskId/status
   * Get task status
   */
  router.get('/:taskId/status', async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      
      const status = await coordinator.monitorTaskProgress(taskId);
      
      const response: ApiResponse = {
        success: true,
        data: status,
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      };

      res.json(response);
    } catch (error) {
      logger.error('Failed to get task status via API', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      });
    }
  });

  return router;
}