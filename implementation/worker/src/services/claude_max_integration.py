"""
Claude Max Integration - Manages multiple Claude instances for parallel execution
"""
import asyncio
import subprocess
import json
import os
import tempfile
import uuid
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
import structlog
from concurrent.futures import ThreadPoolExecutor

@dataclass
class ClaudeInstance:
    """Represents a Claude Code instance"""
    instance_id: str
    work_dir: str
    active: bool = True
    current_task: Optional[str] = None

class ClaudeMaxIntegration:
    """Manages multiple Claude Code instances with Max subscription"""
    
    def __init__(self, max_instances: int = 5):
        self.logger = structlog.get_logger("claude_max_integration")
        self.max_instances = max_instances
        self.instances: Dict[str, ClaudeInstance] = {}
        self.instance_queue: asyncio.Queue = asyncio.Queue()
        self.auth_token: Optional[str] = None
        self.executor = ThreadPoolExecutor(max_workers=max_instances)
        
        # Initialize authentication
        asyncio.create_task(self._initialize_auth())
    
    async def _initialize_auth(self):
        """Get authentication from Claude Code CLI"""
        try:
            # Check if user is logged in
            result = subprocess.run(
                ["claude", "auth", "status"],
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0 and "Logged in" in result.stdout:
                # Get auth token
                token_result = subprocess.run(
                    ["claude", "auth", "token"],
                    capture_output=True,
                    text=True
                )
                
                if token_result.returncode == 0:
                    self.auth_token = token_result.stdout.strip()
                    self.logger.info("Claude Max authentication successful")
                    
                    # Check subscription type
                    account_result = subprocess.run(
                        ["claude", "account", "--json"],
                        capture_output=True,
                        text=True
                    )
                    
                    if account_result.returncode == 0:
                        account_info = json.loads(account_result.stdout)
                        if "max" in account_info.get("subscription", "").lower():
                            self.logger.info("Claude Max subscription confirmed", 
                                           limits=account_info.get("limits", {}))
                        else:
                            self.logger.warn("Not a Claude Max subscription", 
                                           subscription=account_info.get("subscription"))
            else:
                self.logger.warn("Claude Code not authenticated. Run 'claude login' first")
                
        except Exception as e:
            self.logger.error("Failed to initialize Claude authentication", error=str(e))
    
    async def get_instance(self) -> ClaudeInstance:
        """Get an available Claude instance or wait for one"""
        # Try to find an idle instance
        for instance_id, instance in self.instances.items():
            if instance.active and not instance.current_task:
                return instance
        
        # Create new instance if under limit
        if len(self.instances) < self.max_instances:
            return await self._create_instance()
        
        # Wait for an instance to become available
        return await self.instance_queue.get()
    
    async def _create_instance(self) -> ClaudeInstance:
        """Create a new Claude Code instance"""
        instance_id = f"claude-{uuid.uuid4().hex[:8]}"
        work_dir = tempfile.mkdtemp(prefix=f"claude-{instance_id}-")
        
        instance = ClaudeInstance(
            instance_id=instance_id,
            work_dir=work_dir,
            active=True
        )
        
        self.instances[instance_id] = instance
        self.logger.info("Created Claude instance", 
                        instance_id=instance_id,
                        total_instances=len(self.instances))
        
        return instance
    
    async def release_instance(self, instance: ClaudeInstance):
        """Release an instance back to the pool"""
        instance.current_task = None
        await self.instance_queue.put(instance)
        self.logger.debug("Released Claude instance", instance_id=instance.instance_id)
    
    async def execute_on_instance(
        self, 
        operation: str, 
        params: Dict[str, Any],
        timeout: int = 300
    ) -> Dict[str, Any]:
        """Execute operation on an available Claude instance"""
        instance = await self.get_instance()
        instance.current_task = operation
        
        try:
            # Run in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                self.executor,
                self._execute_claude_command,
                instance,
                operation,
                params,
                timeout
            )
            return result
            
        finally:
            await self.release_instance(instance)
    
    def _execute_claude_command(
        self, 
        instance: ClaudeInstance,
        operation: str,
        params: Dict[str, Any],
        timeout: int
    ) -> Dict[str, Any]:
        """Execute Claude command synchronously"""
        env = os.environ.copy()
        env.update({
            "CLAUDE_INSTANCE_ID": instance.instance_id,
            "CLAUDE_WORK_DIR": instance.work_dir,
            "CLAUDE_HEADLESS": "true",
            "CLAUDE_MAX_PARALLEL": "true"  # Enable parallel execution
        })
        
        if self.auth_token:
            env["CLAUDE_AUTH_TOKEN"] = self.auth_token
        
        try:
            if operation == "analyze":
                cmd = ["claude", "analyze", params["file"], "--json"]
                
            elif operation == "generate":
                # For code generation, use chat with context
                prompt = params["prompt"]
                context_file = os.path.join(instance.work_dir, "context.md")
                
                # Write context to file
                with open(context_file, "w") as f:
                    f.write(f"""# Code Generation Request

## Problem ID: {params.get('problem_id', 'unknown')}

## Requirements:
{prompt}

## Language: {params.get('language', 'python')}

## Context:
{params.get('context', 'No additional context')}

Generate clean, well-tested code that solves this problem.
""")
                
                cmd = ["claude", "chat", "--file", context_file, "--json"]
                
            elif operation == "fix":
                cmd = ["claude", "fix", params["file"], 
                       "--issue", params["issue"], "--json"]
                
            elif operation == "test":
                cmd = ["claude", "test", params["file"], 
                       "--framework", params.get("framework", "auto"), "--json"]
                
            elif operation == "solve":
                # Complex problem solving using Claude's solve command
                problem_file = os.path.join(instance.work_dir, "problem.md")
                with open(problem_file, "w") as f:
                    f.write(params["problem_description"])
                
                cmd = ["claude", "solve", problem_file, 
                       "--output-dir", instance.work_dir, "--json"]
                
            else:
                raise ValueError(f"Unknown operation: {operation}")
            
            # Execute command
            result = subprocess.run(
                cmd,
                env=env,
                capture_output=True,
                text=True,
                timeout=timeout
            )
            
            if result.returncode != 0:
                self.logger.error("Claude command failed", 
                                command=" ".join(cmd),
                                stderr=result.stderr)
                return {"error": result.stderr, "success": False}
            
            return json.loads(result.stdout) if result.stdout else {"success": True}
            
        except subprocess.TimeoutExpired:
            self.logger.error("Claude command timed out", operation=operation)
            return {"error": "Operation timed out", "success": False}
            
        except Exception as e:
            self.logger.error("Claude command failed", 
                            operation=operation, 
                            error=str(e))
            return {"error": str(e), "success": False}
    
    async def solve_problem_parallel(
        self,
        problem_id: str,
        problem_description: str,
        files: List[str]
    ) -> Dict[str, Any]:
        """Solve a problem using multiple Claude instances in parallel"""
        self.logger.info("Starting parallel problem solving", 
                        problem_id=problem_id,
                        file_count=len(files))
        
        # Phase 1: Analyze all files in parallel
        analysis_tasks = []
        for file_path in files:
            task = self.execute_on_instance("analyze", {"file": file_path})
            analysis_tasks.append(task)
        
        analyses = await asyncio.gather(*analysis_tasks)
        
        # Phase 2: Generate solution strategy
        strategy_prompt = f"""Based on the following analysis of {len(files)} files,
create a solution strategy for: {problem_description}

File analyses:
{json.dumps(analyses, indent=2)}
"""
        
        strategy = await self.execute_on_instance("generate", {
            "prompt": strategy_prompt,
            "problem_id": problem_id,
            "language": "markdown"
        })
        
        # Phase 3: Generate code fixes in parallel
        fix_tasks = []
        for i, file_path in enumerate(files):
            fix_task = self.execute_on_instance("fix", {
                "file": file_path,
                "issue": problem_description,
                "context": strategy
            })
            fix_tasks.append(fix_task)
        
        fixes = await asyncio.gather(*fix_tasks)
        
        # Phase 4: Generate tests
        test_tasks = []
        for file_path in files:
            test_task = self.execute_on_instance("test", {
                "file": file_path,
                "framework": "pytest"
            })
            test_tasks.append(test_task)
        
        tests = await asyncio.gather(*test_tasks)
        
        return {
            "problem_id": problem_id,
            "analyses": analyses,
            "strategy": strategy,
            "fixes": fixes,
            "tests": tests,
            "instance_count": len(self.instances)
        }
    
    def get_status(self) -> Dict[str, Any]:
        """Get current status of Claude instances"""
        return {
            "authenticated": bool(self.auth_token),
            "max_instances": self.max_instances,
            "active_instances": len(self.instances),
            "busy_instances": sum(1 for i in self.instances.values() if i.current_task),
            "queued_requests": self.instance_queue.qsize()
        }
    
    async def cleanup(self):
        """Clean up all instances"""
        for instance in self.instances.values():
            try:
                import shutil
                shutil.rmtree(instance.work_dir)
            except Exception as e:
                self.logger.warn("Failed to cleanup instance", 
                               instance_id=instance.instance_id,
                               error=str(e))
        
        self.executor.shutdown(wait=True)
        self.instances.clear()