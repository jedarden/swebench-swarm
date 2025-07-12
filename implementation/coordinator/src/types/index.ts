// Core type definitions for SWE-Bench Swarm Coordinator

export interface SwarmConfig {
  topology: "mesh" | "hierarchical" | "ring" | "star";
  maxAgents: number;
  strategy: "parallel" | "sequential" | "adaptive";
  resources: ResourceLimits;
  claudeFlowIntegration: boolean;
}

export interface ResourceLimits {
  cpu: number;
  memory: string;
  diskSpace: string;
  networkBandwidth?: string;
}

export interface SwarmSession {
  id: string;
  topology: string;
  maxAgents: number;
  activeAgents: number;
  strategy: string;
  status: "initializing" | "active" | "scaling" | "shutting_down" | "error";
  startTime: Date;
  claudeFlowSessionId?: string;
}

export interface SWEBenchProblem {
  id: string;
  description: string;
  files: string[];
  testCases: string[];
  constraints: {
    timeLimit: number;
    memoryLimit: string;
  };
  repository: string;
  branch?: string;
  difficulty: "easy" | "medium" | "hard";
}

export interface TaskDistribution {
  taskId: string;
  subtasks: SubTask[];
  agentAssignments: Map<string, string[]>;
  dependencies: DependencyGraph;
  estimatedCompletion: number;
  priority: "low" | "medium" | "high" | "critical";
}

export interface SubTask {
  id: string;
  type: "research" | "implementation" | "testing" | "review";
  description: string;
  assignedAgent?: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  dependencies: string[];
  estimatedDuration: number;
  result?: any;
}

export interface DependencyGraph {
  nodes: string[];
  edges: Array<{ from: string; to: string }>;
}

export interface Agent {
  id: string;
  type: "researcher" | "architect" | "coder" | "tester" | "reviewer" | "coordinator";
  name: string;
  capabilities: string[];
  status: "idle" | "busy" | "error" | "offline";
  currentTask?: string;
  performance: AgentPerformance;
  resources: AgentResources;
}

export interface AgentPerformance {
  tasksCompleted: number;
  averageTime: number;
  successRate: number;
  qualityScore: number;
  lastUpdated: Date;
}

export interface AgentResources {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkUsage: number;
}

export interface TaskStatus {
  taskId: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  progress: number;
  startTime?: Date;
  endTime?: Date;
  assignedAgents: string[];
  result?: TaskResult;
  errors?: string[];
}

export interface TaskResult {
  success: boolean;
  output: any;
  metrics: {
    executionTime: number;
    resourceUsage: AgentResources;
    qualityScore: number;
  };
  artifacts: string[];
}

export interface CoordinationPlan {
  id: string;
  agents: Agent[];
  taskFlow: TaskFlow[];
  communicationMatrix: CommunicationMatrix;
  resourceAllocation: ResourceAllocation;
  monitoringPoints: MonitoringPoint[];
}

export interface TaskFlow {
  step: number;
  agent: string;
  task: string;
  dependencies: string[];
  parallelizable: boolean;
}

export interface CommunicationMatrix {
  [agentId: string]: {
    [targetAgent: string]: {
      frequency: number;
      protocol: "websocket" | "http" | "queue";
      priority: "low" | "medium" | "high";
    };
  };
}

export interface ResourceAllocation {
  [agentId: string]: {
    cpu: number;
    memory: string;
    storage: string;
    priority: number;
  };
}

export interface MonitoringPoint {
  id: string;
  metric: string;
  threshold: number;
  action: "scale_up" | "scale_down" | "alert" | "redistribute";
}

export interface RecoveryPlan {
  replacementAgent: Agent | null;
  taskReassignment: TaskReassignment | null;
  estimatedDelay: number;
  impactAnalysis: ImpactAnalysis;
}

export interface TaskReassignment {
  originalAgent: string;
  newAgent: string;
  affectedTasks: string[];
  reschedulingRequired: boolean;
}

export interface ImpactAnalysis {
  criticalTasks: string[];
  dependentAgents: string[];
  estimatedCompletionDelay: number;
  alternativeStrategies: string[];
}

// Claude-Flow Integration Types
export interface ClaudeFlowConfig {
  enabled: boolean;
  endpoint?: string;
  apiKey?: string;
  topology: string;
  memoryNamespace: string;
}

export interface ClaudeFlowSession {
  swarmId: string;
  sessionId: string;
  agents: ClaudeFlowAgent[];
  memoryKeys: string[];
  status: "active" | "inactive" | "error";
}

export interface ClaudeFlowAgent {
  id: string;
  type: string;
  name: string;
  capabilities: string[];
  memoryNamespace: string;
}

// Performance and Monitoring Types
export interface PerformanceMetrics {
  swarmId: string;
  timestamp: Date;
  overallEfficiency: number;
  taskThroughput: number;
  resourceUtilization: number;
  communicationLatency: number;
  errorRate: number;
  scalabilityIndex: number;
}

export interface HealthStatus {
  swarmId: string;
  overall: "healthy" | "degraded" | "critical";
  components: ComponentHealth[];
  lastCheck: Date;
  recommendations: string[];
}

export interface ComponentHealth {
  component: string;
  status: "healthy" | "warning" | "critical";
  metrics: { [key: string]: number };
  issues: string[];
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
  requestId: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Error Types
export interface SwarmError {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
  swarmId?: string;
  agentId?: string;
  taskId?: string;
}

export class SwarmException extends Error {
  public readonly code: string;
  public readonly swarmId?: string;
  public readonly agentId?: string;
  public readonly timestamp: Date;

  constructor(code: string, message: string, swarmId?: string, agentId?: string) {
    super(message);
    this.name = 'SwarmException';
    this.code = code;
    this.swarmId = swarmId;
    this.agentId = agentId;
    this.timestamp = new Date();
  }
}

// Configuration Types
export interface DatabaseConfig {
  type: "postgresql" | "sqlite";
  host?: string;
  port?: number;
  database: string;
  username?: string;
  password?: string;
  ssl?: boolean;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
}

export interface ServerConfig {
  port: number;
  host: string;
  cors: {
    origin: string[];
    credentials: boolean;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
}

export interface LoggingConfig {
  level: "debug" | "info" | "warn" | "error";
  format: "json" | "simple";
  file?: string;
  console: boolean;
}