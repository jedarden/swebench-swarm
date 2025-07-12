"""
Type definitions for SWE-Bench Worker components
"""
from typing import Dict, List, Optional, Union, Any
from enum import Enum
from dataclasses import dataclass, field
from datetime import datetime
import uuid


class AgentType(str, Enum):
    """Types of specialized agents"""
    RESEARCHER = "researcher"
    ARCHITECT = "architect"
    CODER = "coder"
    TESTER = "tester"
    REVIEWER = "reviewer"
    COORDINATOR = "coordinator"


class TaskStatus(str, Enum):
    """Task execution status"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AgentStatus(str, Enum):
    """Agent status"""
    IDLE = "idle"
    BUSY = "busy"
    ERROR = "error"
    OFFLINE = "offline"


@dataclass
class SWEBenchProblem:
    """SWE-Bench problem definition"""
    id: str
    description: str
    files: List[str]
    test_cases: List[str]
    repository: str
    branch: Optional[str] = None
    difficulty: str = "medium"
    constraints: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TaskContext:
    """Context information for task execution"""
    task_id: str
    problem: SWEBenchProblem
    agent_type: AgentType
    dependencies: List[str] = field(default_factory=list)
    environment: Dict[str, Any] = field(default_factory=dict)
    previous_results: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TaskResult:
    """Result of task execution"""
    task_id: str
    agent_id: str
    status: TaskStatus
    output: Any = None
    error: Optional[str] = None
    artifacts: List[str] = field(default_factory=list)
    metrics: Dict[str, Any] = field(default_factory=dict)
    execution_time: float = 0.0
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class AgentCapabilities:
    """Agent capabilities and specializations"""
    languages: List[str] = field(default_factory=list)
    frameworks: List[str] = field(default_factory=list)
    domains: List[str] = field(default_factory=list)
    tools: List[str] = field(default_factory=list)
    max_complexity: str = "medium"


@dataclass
class AgentPerformance:
    """Agent performance metrics"""
    tasks_completed: int = 0
    success_rate: float = 100.0
    average_time: float = 0.0
    quality_score: float = 100.0
    last_updated: datetime = field(default_factory=datetime.now)


@dataclass
class Agent:
    """Agent definition"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    type: AgentType = AgentType.CODER
    name: str = ""
    status: AgentStatus = AgentStatus.IDLE
    capabilities: AgentCapabilities = field(default_factory=AgentCapabilities)
    performance: AgentPerformance = field(default_factory=AgentPerformance)
    current_task: Optional[str] = None
    coordinator_url: Optional[str] = None
    
    def __post_init__(self):
        if not self.name:
            self.name = f"{self.type.value}-{self.id[:8]}"


@dataclass
class CodeAnalysis:
    """Code analysis result"""
    file_path: str
    language: str
    complexity: str
    issues: List[str] = field(default_factory=list)
    suggestions: List[str] = field(default_factory=list)
    dependencies: List[str] = field(default_factory=list)
    test_coverage: float = 0.0
    metrics: Dict[str, Any] = field(default_factory=dict)


@dataclass
class CodeSolution:
    """Code solution implementation"""
    problem_id: str
    files_modified: Dict[str, str] = field(default_factory=dict)
    files_created: Dict[str, str] = field(default_factory=dict)
    test_cases: List[str] = field(default_factory=list)
    explanation: str = ""
    validation_results: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TestSuite:
    """Test suite definition"""
    name: str
    test_files: List[str] = field(default_factory=list)
    test_cases: List[str] = field(default_factory=list)
    coverage_target: float = 80.0
    timeout: int = 300  # seconds


@dataclass
class TestResults:
    """Test execution results"""
    suite_name: str
    passed: int = 0
    failed: int = 0
    skipped: int = 0
    errors: List[str] = field(default_factory=list)
    coverage: float = 0.0
    execution_time: float = 0.0
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ReviewReport:
    """Code review report"""
    reviewer_id: str
    code_quality_score: float
    security_score: float
    maintainability_score: float
    issues: List[Dict[str, Any]] = field(default_factory=list)
    recommendations: List[str] = field(default_factory=list)
    approved: bool = False


@dataclass
class EnvironmentConfig:
    """Environment configuration for code execution"""
    python_version: str = "3.9"
    packages: List[str] = field(default_factory=list)
    environment_variables: Dict[str, str] = field(default_factory=dict)
    resource_limits: Dict[str, Any] = field(default_factory=dict)
    timeout: int = 300
    isolation_level: str = "container"  # container, virtual_env, or process


@dataclass
class CoordinationMessage:
    """Message for agent coordination"""
    from_agent: str
    to_agent: Optional[str] = None  # None for broadcast
    message_type: str = "info"
    content: Any = None
    timestamp: datetime = field(default_factory=datetime.now)
    correlation_id: Optional[str] = None


@dataclass
class ClaudeCodeRequest:
    """Request to Claude Code service"""
    operation: str  # analyze, generate, validate, optimize
    code: Optional[str] = None
    requirements: Optional[str] = None
    context: Dict[str, Any] = field(default_factory=dict)
    language: str = "python"
    timeout: int = 60


@dataclass
class ClaudeCodeResponse:
    """Response from Claude Code service"""
    success: bool
    result: Any = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    execution_time: float = 0.0


@dataclass
class WorkerConfig:
    """Worker configuration"""
    agent_type: AgentType
    coordinator_url: str
    max_concurrent_tasks: int = 1
    heartbeat_interval: int = 30  # seconds
    claude_code_enabled: bool = True
    claude_code_endpoint: Optional[str] = None
    memory_namespace: str = "default"
    logging_level: str = "INFO"
    environment: EnvironmentConfig = field(default_factory=EnvironmentConfig)


# Exception classes
class WorkerException(Exception):
    """Base exception for worker errors"""
    def __init__(self, message: str, code: str = "WORKER_ERROR", details: Optional[Dict] = None):
        super().__init__(message)
        self.code = code
        self.details = details or {}


class TaskExecutionException(WorkerException):
    """Exception during task execution"""
    def __init__(self, task_id: str, message: str, details: Optional[Dict] = None):
        super().__init__(message, "TASK_EXECUTION_ERROR", details)
        self.task_id = task_id


class ClaudeCodeException(WorkerException):
    """Exception with Claude Code integration"""
    def __init__(self, message: str, details: Optional[Dict] = None):
        super().__init__(message, "CLAUDE_CODE_ERROR", details)


class EnvironmentException(WorkerException):
    """Exception with environment setup"""
    def __init__(self, message: str, details: Optional[Dict] = None):
        super().__init__(message, "ENVIRONMENT_ERROR", details)