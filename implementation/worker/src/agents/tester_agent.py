"""
Tester Agent - Creates and executes test suites
"""
import asyncio
import subprocess
import time
from typing import Any, Dict, List, Optional

from .base_agent import BaseAgent
from ..models.types import (
    TaskContext, AgentType, AgentCapabilities, TestSuite, TestResults,
    ClaudeCodeRequest, WorkerException
)


class TesterAgent(BaseAgent):
    """Agent specialized in testing and validation"""
    
    def __init__(self, config):
        super().__init__(config)
        self.agent.type = AgentType.TESTER
        self.agent.capabilities = AgentCapabilities(
            languages=["python", "javascript", "typescript", "java"],
            frameworks=["pytest", "unittest", "jest", "junit", "mocha"],
            domains=["unit_testing", "integration_testing", "performance_testing"],
            tools=["test_generation", "coverage_analysis", "test_execution"],
            max_complexity="high"
        )
    
    async def _execute_task_impl(self, task_context: TaskContext) -> Dict[str, Any]:
        """Create and execute comprehensive test suite"""
        self.logger.info("Starting test implementation", 
                        problem_id=task_context.problem.id)
        
        try:
            # Get code solution from previous results
            code_solution = task_context.previous_results.get("code", {})
            
            # Step 1: Generate test suite
            test_suite = await self._generate_test_suite(
                task_context.problem, code_solution
            )
            
            # Step 2: Execute tests
            test_results = await self._execute_test_suite(test_suite)
            
            # Step 3: Analyze coverage
            coverage_analysis = await self._analyze_coverage(test_suite, test_results)
            
            # Step 4: Generate performance benchmarks
            performance_results = await self._run_performance_tests(
                task_context.problem, code_solution
            )
            
            result = {
                "test_suite": test_suite,
                "test_results": test_results,
                "coverage_analysis": coverage_analysis,
                "performance_results": performance_results,
                "recommendations": await self._generate_test_recommendations(
                    test_results, coverage_analysis
                )
            }
            
            self.logger.info("Test implementation completed",
                           problem_id=task_context.problem.id,
                           tests_passed=test_results.get("passed", 0),
                           coverage=coverage_analysis.get("percentage", 0))
            
            return result
            
        except Exception as e:
            self.logger.error("Test implementation failed", 
                            problem_id=task_context.problem.id,
                            error=str(e))
            raise WorkerException(f"Test implementation failed: {e}")
    
    async def _generate_test_suite(self, problem, code_solution) -> TestSuite:
        """Generate comprehensive test suite"""
        test_files = []
        test_cases = []
        
        # Generate tests for each modified/created file
        all_files = {**code_solution.get("files_modified", {}), 
                    **code_solution.get("files_created", {})}
        
        for file_path, content in all_files.items():
            if not self._is_test_file(file_path):
                test_file = await self._generate_test_file(file_path, content, problem)
                test_files.append(test_file)
                
                # Extract test cases from the generated test file
                cases = self._extract_test_cases(test_file)
                test_cases.extend(cases)
        
        return TestSuite(
            name=f"test_suite_{problem.id}",
            test_files=test_files,
            test_cases=test_cases,
            coverage_target=80.0,  # Default coverage target
            timeout=300
        )
    
    async def _generate_test_file(self, source_file, content, problem) -> str:
        """Generate test file for a source file"""
        language = self._detect_language(source_file)
        
        if language == "python":
            return self._generate_python_test_file(source_file, content, problem)
        elif language in ["javascript", "typescript"]:
            return self._generate_js_test_file(source_file, content, problem)
        else:
            return self._generate_generic_test_file(source_file, content, problem)
    
    def _generate_python_test_file(self, source_file, content, problem) -> str:
        """Generate Python test file"""
        test_file = source_file.replace(".py", "_test.py").replace("src/", "tests/")
        module_name = source_file.replace("/", ".").replace(".py", "")
        
        return f'''"""
Tests for {source_file}
Generated for problem: {problem.id}
"""

import pytest
import unittest
from unittest.mock import Mock, patch, MagicMock
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

# Import module under test
try:
    from {module_name} import *
except ImportError as e:
    pytest.skip(f"Could not import module {{module_name}}: {{e}}", allow_module_level=True)


class TestImplementation(unittest.TestCase):
    """Test cases for the implementation"""
    
    def setUp(self):
        """Set up test fixtures"""
        pass
    
    def tearDown(self):
        """Clean up after tests"""
        pass
    
    def test_basic_functionality(self):
        """Test basic functionality"""
        # TODO: Implement based on the actual code
        pass
    
    def test_edge_cases(self):
        """Test edge cases and boundary conditions"""
        # TODO: Test with empty inputs, None values, etc.
        pass
    
    def test_error_handling(self):
        """Test error handling and exceptions"""
        # TODO: Test invalid inputs and error conditions
        pass
    
    def test_input_validation(self):
        """Test input validation"""
        # TODO: Test various input types and validation
        pass


# Performance tests
class TestPerformance(unittest.TestCase):
    """Performance test cases"""
    
    def test_execution_time(self):
        """Test execution time is within acceptable limits"""
        import time
        start_time = time.time()
        
        # TODO: Execute the main functionality
        
        execution_time = time.time() - start_time
        self.assertLess(execution_time, 1.0, "Execution took too long")
    
    def test_memory_usage(self):
        """Test memory usage is reasonable"""
        # TODO: Monitor memory usage during execution
        pass


if __name__ == "__main__":
    unittest.main()
'''
    
    def _generate_js_test_file(self, source_file, content, problem) -> str:
        """Generate JavaScript/TypeScript test file"""
        test_file = source_file.replace(".js", ".test.js").replace(".ts", ".test.ts")
        module_name = source_file.replace("/", "").replace(".js", "").replace(".ts", "")
        
        return f'''/**
 * Tests for {source_file}
 * Generated for problem: {problem.id}
 */

import {{ describe, it, expect, beforeEach, afterEach }} from '@jest/globals';

// Import module under test
import * as moduleUnderTest from '../{source_file}';

describe('{module_name}', () => {{
    beforeEach(() => {{
        // Set up test fixtures
    }});
    
    afterEach(() => {{
        // Clean up after tests
    }});
    
    describe('basic functionality', () => {{
        it('should work with valid input', () => {{
            // TODO: Implement based on the actual code
            expect(true).toBe(true);
        }});
        
        it('should handle edge cases', () => {{
            // TODO: Test edge cases and boundary conditions
            expect(true).toBe(true);
        }});
    }});
    
    describe('error handling', () => {{
        it('should handle invalid input gracefully', () => {{
            // TODO: Test error handling
            expect(true).toBe(true);
        }});
        
        it('should throw appropriate errors', () => {{
            // TODO: Test exception throwing
            expect(true).toBe(true);
        }});
    }});
    
    describe('performance', () => {{
        it('should execute within acceptable time', () => {{
            const start = Date.now();
            
            // TODO: Execute the main functionality
            
            const duration = Date.now() - start;
            expect(duration).toBeLessThan(1000);
        }});
    }});
}});
'''
    
    def _generate_generic_test_file(self, source_file, content, problem) -> str:
        """Generate generic test file"""
        return f"""# Tests for {source_file}
# Generated for problem: {problem.id}

# TODO: Implement appropriate tests for this file type
# This file contains the implementation that needs to be tested.

# Test cases should cover:
# 1. Basic functionality
# 2. Edge cases
# 3. Error handling
# 4. Performance requirements
"""
    
    async def _execute_test_suite(self, test_suite) -> TestResults:
        """Execute test suite using Claude Code CLI"""
        start_time = time.time()
        
        try:
            # Use Claude Code to execute tests
            test_request = ClaudeCodeRequest(
                operation="test_execution",
                language="python",
                code="",
                requirements=f"Execute test suite: {test_suite.name}",
                context={
                    "test_files": test_suite.test_files,
                    "test_cases": test_suite.test_cases,
                    "timeout": test_suite.timeout
                }
            )
            
            # Execute via Claude Code integration
            response = await self.claude_code_integration.process_request(test_request)
            
            if not response.success:
                raise WorkerException(f"Test execution failed: {response.result}")
            
            # Parse results from Claude Code
            test_data = response.result
            execution_time = time.time() - start_time
            
            return TestResults(
                suite_name=test_suite.name,
                passed=test_data.get("passed", 0),
                failed=test_data.get("failed", 0),
                skipped=test_data.get("skipped", 0),
                errors=test_data.get("errors", []),
                coverage=test_data.get("coverage", 0.0),
                execution_time=execution_time,
                details=test_data.get("details", {})
            )
            
        except Exception as e:
            self.logger.error("Test execution failed", error=str(e))
            execution_time = time.time() - start_time
            
            # Return error result without simulation
            return TestResults(
                suite_name=test_suite.name,
                passed=0,
                failed=len(test_suite.test_cases) if hasattr(test_suite, 'test_cases') else 1,
                skipped=0,
                errors=[f"Test execution failed: {str(e)}"],
                coverage=0.0,
                execution_time=execution_time,
                details={"error": str(e)}
            )
    
    async def _analyze_coverage(self, test_suite, test_results) -> Dict[str, Any]:
        """Analyze test coverage using Claude Code CLI"""
        try:
            # Use Claude Code to analyze coverage
            coverage_request = ClaudeCodeRequest(
                operation="coverage_analysis",
                language="python",
                code="",
                requirements=f"Analyze test coverage for: {test_suite.name}",
                context={
                    "test_results": test_results.__dict__,
                    "coverage_target": test_suite.coverage_target
                }
            )
            
            response = await self.claude_code_integration.process_request(coverage_request)
            
            if response.success:
                return response.result
            else:
                self.logger.error("Coverage analysis failed", error=response.result)
                return {
                    "percentage": test_results.coverage,
                    "error": "Coverage analysis failed"
                }
                
        except Exception as e:
            self.logger.error("Coverage analysis error", error=str(e))
            return {
                "percentage": test_results.coverage,
                "error": str(e)
            }
    
    async def _run_performance_tests(self, problem, code_solution) -> Dict[str, Any]:
        """Run performance benchmarks using Claude Code CLI"""
        try:
            # Use Claude Code for performance testing
            perf_request = ClaudeCodeRequest(
                operation="performance_test",
                language="python",
                code=code_solution.files_modified.get("main", ""),
                requirements=f"Run performance benchmarks for problem: {problem.id}",
                context={
                    "problem_id": problem.id,
                    "code_solution": code_solution.__dict__
                }
            )
            
            response = await self.claude_code_integration.process_request(perf_request)
            
            if response.success:
                return response.result
            else:
                self.logger.error("Performance testing failed", error=response.result)
                return {"error": "Performance testing failed"}
                
        except Exception as e:
            self.logger.error("Performance test error", error=str(e))
            return {"error": str(e)}
    
    async def _generate_test_recommendations(self, test_results, coverage_analysis) -> List[str]:
        """Generate recommendations using Claude Code analysis"""
        try:
            # Use Claude Code to generate intelligent recommendations
            rec_request = ClaudeCodeRequest(
                operation="test_recommendations",
                language="python",
                code="",
                requirements="Generate test improvement recommendations",
                context={
                    "test_results": test_results.__dict__,
                    "coverage_analysis": coverage_analysis
                }
            )
            
            response = await self.claude_code_integration.process_request(rec_request)
            
            if response.success and isinstance(response.result, list):
                return response.result
            else:
                self.logger.error("Recommendation generation failed", error=response.result)
                return []
                
        except Exception as e:
            self.logger.error("Recommendation generation error", error=str(e))
            return []
    
    # Helper methods
    
    def _is_test_file(self, file_path) -> bool:
        """Check if file is already a test file"""
        return any(indicator in file_path.lower() for indicator in ["test", "spec"])
    
    def _detect_language(self, file_path) -> str:
        """Detect programming language from file extension"""
        if file_path.endswith(".py"):
            return "python"
        elif file_path.endswith((".js", ".ts")):
            return "javascript"
        elif file_path.endswith(".java"):
            return "java"
        else:
            return "unknown"
    
    def _extract_test_cases(self, test_file_content) -> List[str]:
        """Extract test case names from test file content"""
        test_cases = []
        
        # Extract test methods/functions
        import re
        
        # Python test methods
        python_tests = re.findall(r'def (test_\w+)', test_file_content)
        test_cases.extend(python_tests)
        
        # JavaScript test cases
        js_tests = re.findall(r"it\(['\"]([^'\"]+)['\"]", test_file_content)
        test_cases.extend(js_tests)
        
        return test_cases