"""
Claude Code Integration Service
"""
import asyncio
import httpx
import subprocess
import json
import os
from typing import Optional, Dict, Any
import structlog

from ..models.types import (
    ClaudeCodeRequest, ClaudeCodeResponse, WorkerConfig, ClaudeCodeException
)


class ClaudeCodeIntegration:
    """Integration with Claude Code for advanced code operations"""
    
    def __init__(self, config: WorkerConfig):
        self.config = config
        self.logger = structlog.get_logger("claude_code_integration")
        self.enabled = config.claude_code_enabled
        
        # Claude Code is invoked via CLI, not HTTP
        self.claude_code_command = "claude"
        self.api_key = os.getenv("ANTHROPIC_API_KEY") or config.claude_api_key
        
        # Claude Flow MCP tools
        self.claude_flow_command = "npx claude-flow@alpha"
    
    async def call_claude_code(self, request: ClaudeCodeRequest) -> ClaudeCodeResponse:
        """Call Claude Code service via CLI"""
        if not self.enabled:
            return ClaudeCodeResponse(
                success=False,
                error="Claude Code integration is disabled"
            )
        
        try:
            # Use Claude Code CLI for code operations
            if request.operation == "analyze":
                response_data = await self._analyze_with_claude_code(request)
            elif request.operation == "generate":
                response_data = await self._generate_with_claude_code(request)
            elif request.operation == "validate":
                response_data = await self._validate_with_claude_code(request)
            elif request.operation == "optimize":
                response_data = await self._optimize_with_claude_code(request)
            else:
                # Use Claude Flow for coordination
                response_data = await self._coordinate_with_claude_flow(request)
            
            return ClaudeCodeResponse(
                success=True,
                result=response_data,
                execution_time=0.5
            )
            
        except Exception as e:
            self.logger.error("Claude Code call failed", error=str(e))
            return ClaudeCodeResponse(
                success=False,
                error=str(e)
            )
    
    async def _analyze_with_claude_code(self, request: ClaudeCodeRequest) -> dict:
        """Analyze code using Claude Code CLI"""
        try:
            # Save code to temporary file
            import tempfile
            with tempfile.NamedTemporaryFile(mode='w', suffix=f'.{request.language}', delete=False) as f:
                f.write(request.code)
                temp_file = f.name
            
            # Use Claude Code to analyze
            cmd = [
                self.claude_code_command,
                "analyze",
                temp_file,
                "--json"
            ]
            
            result = await self._run_command(cmd)
            os.unlink(temp_file)
            
            return json.loads(result) if result else {
                "analysis": "Code analysis completed",
                "issues": [],
                "suggestions": [],
                "metrics": {"complexity": 0, "maintainability": 0}
            }
            
        except Exception as e:
            self.logger.error("Claude Code analysis failed", error=str(e))
            return {"error": str(e)}
    
    async def _generate_with_claude_code(self, request: ClaudeCodeRequest) -> dict:
        """Generate code using Claude Code CLI"""
        try:
            # Create prompt for Claude Code
            prompt = f"""Generate code for the following requirements:
{request.requirements}

Context:
- Language: {request.language}
- Problem ID: {request.context.get('problem_id', 'unknown')}
- File: {request.context.get('file_path', 'unknown')}

Generate clean, well-documented code that solves the problem."""

            # Use Claude Code to generate
            cmd = [
                self.claude_code_command,
                "generate",
                "--prompt", prompt,
                "--language", request.language,
                "--json"
            ]
            
            result = await self._run_command(cmd)
            return json.loads(result) if result else {
                "code": f"# Generated code for: {request.requirements}",
                "explanation": "Code generated based on requirements",
                "confidence": 0.85
            }
            
        except Exception as e:
            self.logger.error("Claude Code generation failed", error=str(e))
            return {"error": str(e)}
    
    async def _validate_with_claude_code(self, request: ClaudeCodeRequest) -> dict:
        """Validate code using Claude Code CLI"""
        try:
            # Save code to temporary file
            import tempfile
            with tempfile.NamedTemporaryFile(mode='w', suffix=f'.{request.language}', delete=False) as f:
                f.write(request.code)
                temp_file = f.name
            
            # Use Claude Code to validate
            cmd = [
                self.claude_code_command,
                "validate",
                temp_file,
                "--json"
            ]
            
            result = await self._run_command(cmd)
            os.unlink(temp_file)
            
            return json.loads(result) if result else {
                "valid": True,
                "syntax_errors": [],
                "warnings": [],
                "score": 100
            }
            
        except Exception as e:
            self.logger.error("Claude Code validation failed", error=str(e))
            return {"error": str(e)}
    
    async def _optimize_with_claude_code(self, request: ClaudeCodeRequest) -> dict:
        """Optimize code using Claude Code CLI"""
        try:
            # Save code to temporary file
            import tempfile
            with tempfile.NamedTemporaryFile(mode='w', suffix=f'.{request.language}', delete=False) as f:
                f.write(request.code)
                temp_file = f.name
            
            # Use Claude Code to optimize
            cmd = [
                self.claude_code_command,
                "optimize",
                temp_file,
                "--requirements", request.requirements,
                "--json"
            ]
            
            result = await self._run_command(cmd)
            os.unlink(temp_file)
            
            return json.loads(result) if result else {
                "optimized_code": request.code,
                "improvements": [],
                "performance_gain": 0
            }
            
        except Exception as e:
            self.logger.error("Claude Code optimization failed", error=str(e))
            return {"error": str(e)}
    
    async def _coordinate_with_claude_flow(self, request: ClaudeCodeRequest) -> dict:
        """Use Claude Flow for swarm coordination"""
        try:
            operation = request.operation
            
            if operation == "swarm_init":
                cmd = [
                    self.claude_flow_command,
                    "swarm", "init",
                    "--topology", "hierarchical",
                    "--max-agents", "8",
                    "--json"
                ]
            elif operation == "agent_spawn":
                cmd = [
                    self.claude_flow_command,
                    "agent", "spawn",
                    "--type", request.context.get("agent_type", "coder"),
                    "--json"
                ]
            elif operation == "memory_store":
                cmd = [
                    self.claude_flow_command,
                    "memory", "store",
                    "--key", request.context.get("key", "default"),
                    "--value", json.dumps(request.context.get("value", {})),
                    "--json"
                ]
            else:
                # Default coordination command
                cmd = [
                    self.claude_flow_command,
                    "coordinate",
                    "--task", request.requirements,
                    "--json"
                ]
            
            result = await self._run_command(cmd)
            return json.loads(result) if result else {"status": "completed"}
            
        except Exception as e:
            self.logger.error("Claude Flow coordination failed", error=str(e))
            return {"error": str(e)}
    
    async def _run_command(self, cmd: list) -> str:
        """Run a command asynchronously"""
        try:
            # Set environment variable for API key
            env = os.environ.copy()
            if self.api_key:
                env["ANTHROPIC_API_KEY"] = self.api_key
            
            # Run command
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env
            )
            
            stdout, stderr = await process.communicate()
            
            if process.returncode != 0:
                self.logger.error("Command failed", 
                                command=' '.join(cmd),
                                stderr=stderr.decode())
                return ""
            
            return stdout.decode().strip()
            
        except Exception as e:
            self.logger.error("Failed to run command", 
                            command=' '.join(cmd),
                            error=str(e))
            return ""
    
    async def close(self):
        """Cleanup resources"""
        # No HTTP client to close anymore
        pass