import { Router, Request, Response } from 'express';
import { SwarmCoordinator } from '../services/SwarmCoordinator';
import { SwarmConfig, ApiResponse } from '../types';
import { Logger } from '../utils/Logger';

const logger = new Logger('SwarmRoutes');

export function swarmRoutes(coordinator: SwarmCoordinator): Router {
  const router = Router();

  /**
   * POST /swarm/initialize
   * Initialize a new swarm session
   */
  router.post('/initialize', async (req: Request, res: Response) => {
    try {
      const config: SwarmConfig = req.body;
      
      // Validate configuration
      if (!config.topology || !config.maxAgents) {
        return res.status(400).json({
          success: false,
          error: 'Invalid swarm configuration',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        });
      }

      const session = await coordinator.initializeSwarm(config);
      
      const response: ApiResponse = {
        success: true,
        data: session,
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      };

      logger.info('Swarm initialized via API', { sessionId: session.id });
      res.status(201).json(response);
    } catch (error) {
      logger.error('Failed to initialize swarm via API', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      });
    }
  });

  /**
   * DELETE /swarm/:sessionId/shutdown
   * Shutdown a swarm session
   */
  router.delete('/:sessionId/shutdown', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      
      await coordinator.shutdownSwarm(sessionId);
      
      const response: ApiResponse = {
        success: true,
        data: { sessionId, status: 'shutdown' },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      };

      logger.info('Swarm shutdown via API', { sessionId });
      res.json(response);
    } catch (error) {
      logger.error('Failed to shutdown swarm via API', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      });
    }
  });

  /**
   * GET /swarm/sessions
   * Get all active swarm sessions
   */
  router.get('/sessions', async (req: Request, res: Response) => {
    try {
      const sessions = coordinator.getActiveSessions();
      
      const response: ApiResponse = {
        success: true,
        data: sessions,
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      };

      res.json(response);
    } catch (error) {
      logger.error('Failed to get swarm sessions via API', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      });
    }
  });

  /**
   * GET /swarm/:sessionId
   * Get specific swarm session details
   */
  router.get('/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const session = coordinator.getSession(sessionId);
      
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Swarm session not found',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        });
      }

      const response: ApiResponse = {
        success: true,
        data: session,
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      };

      res.json(response);
    } catch (error) {
      logger.error('Failed to get swarm session via API', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      });
    }
  });

  /**
   * POST /swarm/:sessionId/problems/distribute
   * Distribute a SWE-Bench problem to the swarm
   */
  router.post('/:sessionId/problems/distribute', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const problem = req.body;
      
      const distribution = await coordinator.distributeProblem(problem, sessionId);
      
      const response: ApiResponse = {
        success: true,
        data: distribution,
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      };

      logger.info('Problem distributed via API', { sessionId, taskId: distribution.taskId });
      res.status(201).json(response);
    } catch (error) {
      logger.error('Failed to distribute problem via API', error);
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