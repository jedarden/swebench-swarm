"""
Base agent class for SWE-Bench worker agents
"""
import asyncio
import time
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
import structlog
import httpx
from datetime import datetime

from ..models.types import (
    Agent, AgentType, AgentStatus, TaskContext, TaskResult, TaskStatus,
    CoordinationMessage, WorkerConfig, WorkerException, TaskExecutionException
)
from ..services.claude_code_integration import ClaudeCodeIntegration
from ..utils.logger import get_logger


class BaseAgent(ABC):
    """Base class for all specialized agents"""
    
    def __init__(self, config: WorkerConfig):
        self.config = config
        self.logger = get_logger(f"{config.agent_type.value}_agent")
        self.agent = Agent(
            type=config.agent_type,
            coordinator_url=config.coordinator_url
        )
        self.claude_code = ClaudeCodeIntegration(config) if config.claude_code_enabled else None
        self.current_task: Optional[TaskContext] = None
        self.http_client = httpx.AsyncClient(timeout=30.0)
        self._running = False
        self._heartbeat_task: Optional[asyncio.Task] = None
        
    async def start(self):
        """Start the agent"""
        self.logger.info("Starting agent", agent_id=self.agent.id, type=self.agent.type)
        self._running = True
        self.agent.status = AgentStatus.IDLE
        
        # Initialize Claude Flow coordination
        if self.claude_code:
            await self._initialize_claude_flow()
        
        # Register with coordinator
        await self._register_with_coordinator()
        
        # Start heartbeat
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        
        self.logger.info("Agent started successfully", agent_id=self.agent.id)
    
    async def stop(self):
        """Stop the agent"""
        self.logger.info("Stopping agent", agent_id=self.agent.id)
        self._running = False
        
        # Cancel current task if any
        if self.current_task:
            await self._report_task_cancelled(self.current_task.task_id)
        
        # Stop heartbeat
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass
        
        # Unregister from coordinator
        await self._unregister_from_coordinator()
        
        # Close HTTP client
        await self.http_client.aclose()
        
        self.logger.info("Agent stopped", agent_id=self.agent.id)
    
    async def execute_task(self, task_context: TaskContext) -> TaskResult:
        """Execute a task"""
        self.logger.info("Executing task", 
                        task_id=task_context.task_id, 
                        agent_id=self.agent.id,
                        problem_id=task_context.problem.id)
        
        if self.agent.status != AgentStatus.IDLE:
            raise TaskExecutionException(
                task_context.task_id,
                f"Agent {self.agent.id} is not idle (status: {self.agent.status})"
            )
        
        self.current_task = task_context
        self.agent.status = AgentStatus.BUSY
        self.agent.current_task = task_context.task_id
        
        start_time = time.time()
        
        try:
            # Report task started
            await self._report_task_started(task_context.task_id)
            
            # Execute the task using the specialized implementation
            result = await self._execute_task_impl(task_context)
            
            # Update performance metrics
            execution_time = time.time() - start_time
            await self._update_performance_metrics(True, execution_time)
            
            # Create successful result
            task_result = TaskResult(
                task_id=task_context.task_id,
                agent_id=self.agent.id,
                status=TaskStatus.COMPLETED,
                output=result,
                execution_time=execution_time
            )
            
            # Report task completed
            await self._report_task_completed(task_result)
            
            self.logger.info("Task completed successfully",
                           task_id=task_context.task_id,
                           execution_time=execution_time)
            
            return task_result
            
        except Exception as e:
            execution_time = time.time() - start_time
            await self._update_performance_metrics(False, execution_time)
            
            error_msg = str(e)
            self.logger.error("Task execution failed",
                            task_id=task_context.task_id,
                            error=error_msg,
                            execution_time=execution_time)
            
            # Create failed result
            task_result = TaskResult(
                task_id=task_context.task_id,
                agent_id=self.agent.id,
                status=TaskStatus.FAILED,
                error=error_msg,
                execution_time=execution_time
            )
            
            # Report task failed
            await self._report_task_failed(task_result)
            
            return task_result
            
        finally:
            # Reset agent state
            self.current_task = None
            self.agent.status = AgentStatus.IDLE
            self.agent.current_task = None
    
    @abstractmethod
    async def _execute_task_impl(self, task_context: TaskContext) -> Any:
        """Implement task execution logic in subclasses"""
        pass
    
    async def send_coordination_message(self, message: CoordinationMessage):
        """Send coordination message to other agents"""
        try:
            # Store message using Claude Flow hooks
            await self._store_coordination_data(
                f"coordination/messages/{message.from_agent}",
                {
                    "message": message,
                    "timestamp": message.timestamp.isoformat()
                }
            )
            
            self.logger.debug("Coordination message sent",
                            from_agent=message.from_agent,
                            to_agent=message.to_agent,
                            type=message.message_type)
                            
        except Exception as e:
            self.logger.error("Failed to send coordination message", error=str(e))
    
    async def get_coordination_messages(self, from_agent: Optional[str] = None) -> List[CoordinationMessage]:
        """Get coordination messages"""
        try:
            # Retrieve messages using Claude Flow hooks
            key_pattern = f"coordination/messages/{from_agent}" if from_agent else "coordination/messages/*"
            messages_data = await self._retrieve_coordination_data(key_pattern)
            
            # Convert to CoordinationMessage objects
            messages = []
            if messages_data:
                for data in messages_data:
                    if isinstance(data, dict) and 'message' in data:
                        messages.append(data['message'])
            
            return messages
            
        except Exception as e:
            self.logger.error("Failed to get coordination messages", error=str(e))
            return []
    
    # Private methods
    
    async def _register_with_coordinator(self):
        """Register agent with coordinator"""
        try:
            registration_data = {
                "agent_id": self.agent.id,
                "type": self.agent.type.value,
                "name": self.agent.name,
                "capabilities": {
                    "languages": self.agent.capabilities.languages,
                    "frameworks": self.agent.capabilities.frameworks,
                    "domains": self.agent.capabilities.domains,
                    "tools": self.agent.capabilities.tools
                },
                "status": self.agent.status.value
            }
            
            response = await self.http_client.post(
                f"{self.config.coordinator_url}/api/v1/agents/register",
                json=registration_data
            )
            response.raise_for_status()
            
            self.logger.info("Registered with coordinator", 
                           coordinator_url=self.config.coordinator_url)
            
        except Exception as e:
            self.logger.error("Failed to register with coordinator", error=str(e))
            raise WorkerException(f"Failed to register with coordinator: {e}")
    
    async def _unregister_from_coordinator(self):
        """Unregister agent from coordinator"""
        try:
            response = await self.http_client.delete(
                f"{self.config.coordinator_url}/api/v1/agents/{self.agent.id}"
            )
            response.raise_for_status()
            
            self.logger.info("Unregistered from coordinator")
            
        except Exception as e:
            self.logger.warning("Failed to unregister from coordinator", error=str(e))
    
    async def _heartbeat_loop(self):
        """Send periodic heartbeat to coordinator"""
        while self._running:
            try:
                await self._send_heartbeat()
                await asyncio.sleep(self.config.heartbeat_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error("Heartbeat failed", error=str(e))
                await asyncio.sleep(5)  # Wait before retry
    
    async def _send_heartbeat(self):
        """Send heartbeat to coordinator"""
        try:
            heartbeat_data = {
                "agent_id": self.agent.id,
                "status": self.agent.status.value,
                "current_task": self.agent.current_task,
                "timestamp": datetime.now().isoformat(),
                "performance": {
                    "tasks_completed": self.agent.performance.tasks_completed,
                    "success_rate": self.agent.performance.success_rate,
                    "average_time": self.agent.performance.average_time
                }
            }
            
            response = await self.http_client.post(
                f"{self.config.coordinator_url}/api/v1/agents/{self.agent.id}/heartbeat",
                json=heartbeat_data
            )
            response.raise_for_status()
            
        except Exception as e:
            self.logger.error("Failed to send heartbeat", error=str(e))
    
    async def _report_task_started(self, task_id: str):
        """Report task started to coordinator"""
        await self._run_claude_flow_hook("pre-task", f"Starting task {task_id}")
    
    async def _report_task_completed(self, result: TaskResult):
        """Report task completion to coordinator"""
        await self._run_claude_flow_hook("post-task", f"Completed task {result.task_id}")
        await self._store_coordination_data(
            f"tasks/{result.task_id}/result",
            {
                "result": result,
                "timestamp": datetime.now().isoformat()
            }
        )
    
    async def _report_task_failed(self, result: TaskResult):
        """Report task failure to coordinator"""
        await self._run_claude_flow_hook("post-task", f"Failed task {result.task_id}: {result.error}")
    
    async def _report_task_cancelled(self, task_id: str):
        """Report task cancellation to coordinator"""
        await self._run_claude_flow_hook("post-task", f"Cancelled task {task_id}")
    
    async def _update_performance_metrics(self, success: bool, execution_time: float):
        """Update agent performance metrics"""
        perf = self.agent.performance
        perf.tasks_completed += 1
        
        # Update success rate
        total_successes = int((perf.success_rate / 100) * (perf.tasks_completed - 1))
        if success:
            total_successes += 1
        perf.success_rate = (total_successes / perf.tasks_completed) * 100
        
        # Update average time
        total_time = perf.average_time * (perf.tasks_completed - 1) + execution_time
        perf.average_time = total_time / perf.tasks_completed
        
        perf.last_updated = datetime.now()
        
        self.logger.debug("Performance metrics updated",
                        tasks_completed=perf.tasks_completed,
                        success_rate=perf.success_rate,
                        average_time=perf.average_time)
    
    async def _initialize_claude_flow(self):
        """Initialize Claude Flow for this agent"""
        try:
            if not self.claude_code:
                return
                
            # Initialize swarm participation
            from ..models.types import ClaudeCodeRequest
            
            request = ClaudeCodeRequest(
                operation="agent_spawn",
                requirements=f"Initialize {self.agent.type.value} agent",
                context={
                    "agent_type": self.agent.type.value,
                    "agent_id": self.agent.id,
                    "capabilities": self.agent.capabilities.__dict__ if self.agent.capabilities else {}
                }
            )
            
            response = await self.claude_code.call_claude_code(request)
            if response.success:
                self.logger.info("Claude Flow agent initialized", result=response.result)
                
        except Exception as e:
            self.logger.error("Failed to initialize Claude Flow", error=str(e))
    
    async def _run_claude_flow_hook(self, hook_type: str, description: str):
        """Run Claude Flow coordination hook"""
        try:
            if not self.claude_code:
                return
                
            # Use actual Claude Flow hooks via command line
            import subprocess
            import json
            
            cmd = [
                "npx", "claude-flow@alpha", "hooks", hook_type,
                "--description", description,
                "--agent-id", self.agent.id,
                "--agent-type", self.agent.type.value,
                "--json"
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0:
                hook_result = json.loads(result.stdout) if result.stdout else {}
                self.logger.debug(f"Claude Flow hook executed: {hook_type}", result=hook_result)
            else:
                self.logger.error(f"Claude Flow hook failed: {hook_type}", error=result.stderr)
            
        except Exception as e:
            self.logger.error(f"Claude Flow hook failed: {hook_type}", error=str(e))
    
    async def _store_coordination_data(self, key: str, data: Dict[str, Any]):
        """Store coordination data in Claude Flow memory"""
        try:
            if not self.claude_code:
                return
                
            from ..models.types import ClaudeCodeRequest
            
            request = ClaudeCodeRequest(
                operation="memory_store",
                requirements="Store coordination data",
                context={
                    "key": f"agent/{self.agent.id}/{key}",
                    "value": data
                }
            )
            
            response = await self.claude_code.call_claude_code(request)
            if response.success:
                self.logger.debug("Stored coordination data", key=key)
            else:
                self.logger.error("Failed to store coordination data", key=key, error=response.error)
            
        except Exception as e:
            self.logger.error("Failed to store coordination data", key=key, error=str(e))
    
    async def _retrieve_coordination_data(self, key: str) -> Optional[Any]:
        """Retrieve coordination data from Claude Flow memory"""
        try:
            if not self.claude_code:
                return None
                
            # Use Claude Flow memory retrieval
            import subprocess
            import json
            
            cmd = [
                "npx", "claude-flow@alpha", "memory", "retrieve",
                "--key", f"agent/{self.agent.id}/{key}",
                "--json"
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0 and result.stdout:
                data = json.loads(result.stdout)
                return data.get("value")
            
            return None
            
        except Exception as e:
            self.logger.error("Failed to retrieve coordination data", key=key, error=str(e))
            return None