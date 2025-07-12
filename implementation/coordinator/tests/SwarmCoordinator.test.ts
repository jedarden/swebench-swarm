import { SwarmCoordinator } from '../src/services/SwarmCoordinator';
import { SwarmConfig, SWEBenchProblem, AgentType } from '../src/types';

describe('SwarmCoordinator', () => {
  let coordinator: SwarmCoordinator;
  let testConfig: SwarmConfig;

  beforeEach(() => {
    coordinator = new SwarmCoordinator();
    testConfig = {
      topology: 'mesh',
      maxAgents: 5,
      strategy: 'parallel',
      resources: {
        cpu: 4,
        memory: '8GB',
        diskSpace: '100GB'
      },
      claudeFlowIntegration: false // Disable for testing
    };
  });

  afterEach(async () => {
    // Clean up any active sessions
    const sessions = coordinator.getActiveSessions();
    for (const session of sessions) {
      try {
        await coordinator.shutdownSwarm(session.id);
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
  });

  describe('initializeSwarm', () => {
    it('should initialize a swarm with correct configuration', async () => {
      const session = await coordinator.initializeSwarm(testConfig);

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.topology).toBe('mesh');
      expect(session.maxAgents).toBe(5);
      expect(session.strategy).toBe('parallel');
      expect(session.status).toBe('active');
    });

    it('should create unique session IDs', async () => {
      const session1 = await coordinator.initializeSwarm(testConfig);
      const session2 = await coordinator.initializeSwarm(testConfig);

      expect(session1.id).not.toBe(session2.id);
    });
  });

  describe('spawnAgent', () => {
    let sessionId: string;

    beforeEach(async () => {
      const session = await coordinator.initializeSwarm(testConfig);
      sessionId = session.id;
    });

    it('should spawn an agent with specified type and capabilities', async () => {
      const agent = await coordinator.spawnAgent(
        AgentType.RESEARCHER,
        ['analysis', 'documentation'],
        sessionId
      );

      expect(agent).toBeDefined();
      expect(agent.id).toBeDefined();
      expect(agent.type).toBe(AgentType.RESEARCHER);
      expect(agent.capabilities).toContain('analysis');
      expect(agent.capabilities).toContain('documentation');
      expect(agent.status).toBe('idle');
    });

    it('should update session agent count when spawning agents', async () => {
      const initialSession = coordinator.getSession(sessionId);
      const initialCount = initialSession?.activeAgents || 0;

      await coordinator.spawnAgent(AgentType.CODER, ['python'], sessionId);

      const updatedSession = coordinator.getSession(sessionId);
      expect(updatedSession?.activeAgents).toBe(initialCount + 1);
    });
  });

  describe('distributeProblem', () => {
    let sessionId: string;
    let testProblem: SWEBenchProblem;

    beforeEach(async () => {
      const session = await coordinator.initializeSwarm(testConfig);
      sessionId = session.id;

      testProblem = {
        id: 'test-problem-001',
        description: 'Fix the sorting function to handle duplicate elements correctly',
        files: ['src/sort.py', 'tests/test_sort.py'],
        testCases: ['test_basic_sort', 'test_duplicates', 'test_empty_list'],
        repository: 'https://github.com/test/repo',
        difficulty: 'medium',
        constraints: {
          timeLimit: 300,
          memoryLimit: '2GB'
        }
      };
    });

    it('should distribute a problem and create task distribution', async () => {
      const distribution = await coordinator.distributeProblem(testProblem, sessionId);

      expect(distribution).toBeDefined();
      expect(distribution.taskId).toBeDefined();
      expect(distribution.subtasks).toBeDefined();
      expect(distribution.subtasks.length).toBeGreaterThan(0);
      expect(distribution.priority).toBeDefined();
    });

    it('should create appropriate subtasks for problem', async () => {
      const distribution = await coordinator.distributeProblem(testProblem, sessionId);

      const subtaskTypes = distribution.subtasks.map(task => task.type);
      expect(subtaskTypes).toContain('research');
      expect(subtaskTypes).toContain('implementation');
      expect(subtaskTypes).toContain('testing');
    });
  });

  describe('monitorTaskProgress', () => {
    it('should throw error for non-existent task', async () => {
      await expect(coordinator.monitorTaskProgress('non-existent-task'))
        .rejects.toThrow('Task non-existent-task not found');
    });
  });

  describe('getActiveSessions', () => {
    it('should return empty array when no sessions exist', () => {
      const sessions = coordinator.getActiveSessions();
      expect(sessions).toEqual([]);
    });

    it('should return active sessions', async () => {
      await coordinator.initializeSwarm(testConfig);
      await coordinator.initializeSwarm(testConfig);

      const sessions = coordinator.getActiveSessions();
      expect(sessions).toHaveLength(2);
    });
  });

  describe('shutdownSwarm', () => {
    it('should shutdown an existing swarm session', async () => {
      const session = await coordinator.initializeSwarm(testConfig);
      
      await coordinator.shutdownSwarm(session.id);

      const retrievedSession = coordinator.getSession(session.id);
      expect(retrievedSession).toBeUndefined();
    });

    it('should throw error when shutting down non-existent session', async () => {
      await expect(coordinator.shutdownSwarm('non-existent-session'))
        .rejects.toThrow('Swarm session non-existent-session not found');
    });
  });

  describe('error handling', () => {
    it('should handle invalid configuration gracefully', async () => {
      const invalidConfig = {
        ...testConfig,
        maxAgents: 0 // Invalid
      };

      await expect(coordinator.initializeSwarm(invalidConfig))
        .rejects.toThrow();
    });
  });

  describe('performance', () => {
    it('should initialize swarm within reasonable time', async () => {
      const startTime = Date.now();
      
      await coordinator.initializeSwarm(testConfig);
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000); // 5 seconds
    });

    it('should handle multiple concurrent operations', async () => {
      const promises = Array.from({ length: 3 }, () => 
        coordinator.initializeSwarm(testConfig)
      );

      const sessions = await Promise.all(promises);
      
      expect(sessions).toHaveLength(3);
      sessions.forEach(session => {
        expect(session.status).toBe('active');
      });
    });
  });
});