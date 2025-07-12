import { Express } from 'express';
import { SwarmCoordinator } from '../services/SwarmCoordinator';
import { swarmRoutes } from './swarmRoutes';
import { agentRoutes } from './agentRoutes';
import { taskRoutes } from './taskRoutes';
import { performanceRoutes } from './performanceRoutes';

/**
 * Setup all API routes
 */
export function setupRoutes(app: Express, coordinator: SwarmCoordinator): void {
  // API prefix
  const apiPrefix = '/api/v1';
  
  // Route groups
  app.use(`${apiPrefix}/swarm`, swarmRoutes(coordinator));
  app.use(`${apiPrefix}/agents`, agentRoutes(coordinator));
  app.use(`${apiPrefix}/tasks`, taskRoutes(coordinator));
  app.use(`${apiPrefix}/performance`, performanceRoutes(coordinator));
  
  // Root API info
  app.get(apiPrefix, (req, res) => {
    res.json({
      name: 'SWE-Bench Swarm Coordinator API',
      version: '1.0.0',
      endpoints: {
        swarm: `${apiPrefix}/swarm`,
        agents: `${apiPrefix}/agents`,
        tasks: `${apiPrefix}/tasks`,
        performance: `${apiPrefix}/performance`
      }
    });
  });
}