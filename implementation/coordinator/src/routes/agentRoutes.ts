import { Router, Request, Response } from 'express';
import { SwarmCoordinator } from '../services/SwarmCoordinator';
import { Agent, ApiResponse } from '../types';
import { Logger } from '../utils/Logger';

const logger = new Logger('AgentRoutes');

export function agentRoutes(coordinator: SwarmCoordinator): Router {
  const router = Router();

  /**
   * POST /agents/spawn
   * Spawn a new agent
   */
  router.post('/spawn', async (req: Request, res: Response) => {
    try {
      const { type, capabilities, sessionId } = req.body;
      
      if (!type || !Array.isArray(capabilities)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid agent configuration',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string
        });
      }

      const agent = await coordinator.spawnAgent(type, capabilities, sessionId);
      
      const response: ApiResponse = {
        success: true,
        data: agent,
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      };

      logger.info('Agent spawned via API', { agentId: agent.id, type });
      res.status(201).json(response);
    } catch (error) {
      logger.error('Failed to spawn agent via API', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      });
    }
  });

  /**
   * DELETE /agents/:agentId
   * Remove an agent
   */
  router.delete('/:agentId', async (req: Request, res: Response) => {
    try {
      const { agentId } = req.params;
      const { sessionId } = req.query;
      
      await coordinator.removeAgent(agentId, sessionId as string);
      
      const response: ApiResponse = {
        success: true,
        data: { agentId, status: 'removed' },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string
      };

      logger.info('Agent removed via API', { agentId });
      res.json(response);
    } catch (error) {
      logger.error('Failed to remove agent via API', error);
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