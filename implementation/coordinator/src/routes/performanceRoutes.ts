import { Router, Request, Response } from 'express';
import { SwarmCoordinator } from '../services/SwarmCoordinator';
import { ApiResponse } from '../types';
import { Logger } from '../utils/Logger';

const logger = new Logger('PerformanceRoutes');

export function performanceRoutes(coordinator: SwarmCoordinator): Router {
  const router = Router();

  /**
   * GET /performance/:sessionId/metrics
   * Get performance metrics for a session
   */
  router.get('/:sessionId/metrics', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      
      const metrics = await coordinator.getPerformanceMetrics(sessionId);
      
      const response: ApiResponse = {
        success: true,
        data: metrics,
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      };

      res.json(response);
    } catch (error) {
      logger.error('Failed to get performance metrics via API', error);
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