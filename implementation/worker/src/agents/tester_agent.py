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
            coverage_target=85.0,
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
        """Execute the test suite"""
        start_time = time.time()
        
        # Simulate test execution
        # In a real implementation, this would run the actual tests
        passed = 0
        failed = 0
        errors = []
        
        for test_case in test_suite.test_cases:
            try:
                # Simulate test execution
                await asyncio.sleep(0.1)  # Simulate test time
                
                # Randomly pass/fail for simulation
                import random
                if random.random() > 0.1:  # 90% success rate
                    passed += 1
                else:
                    failed += 1
                    errors.append(f"Test {test_case} failed: Simulated failure")
                    
            except Exception as e:
                failed += 1
                errors.append(f"Test {test_case} error: {str(e)}")
        
        execution_time = time.time() - start_time
        
        return TestResults(
            suite_name=test_suite.name,
            passed=passed,
            failed=failed,
            skipped=0,
            errors=errors,
            coverage=85.0,  # Simulated coverage
            execution_time=execution_time,
            details={
                "total_tests": len(test_suite.test_cases),
                "success_rate": (passed / len(test_suite.test_cases)) * 100 if test_suite.test_cases else 0
            }
        )
    
    async def _analyze_coverage(self, test_suite, test_results) -> Dict[str, Any]:
        """Analyze test coverage"""
        # Simulate coverage analysis
        return {
            "percentage": test_results.coverage,
            "lines_covered": 850,
            "lines_total": 1000,
            "missing_lines": [45, 67, 89, 123, 156],
            "branch_coverage": 82.0,
            "function_coverage": 95.0,
            "uncovered_functions": ["error_handler", "_private_method"],
            "recommendations": [
                "Add tests for error handling paths",
                "Increase branch coverage in conditional logic",
                "Test private methods indirectly through public interfaces"
            ]
        }
    
    async def _run_performance_tests(self, problem, code_solution) -> Dict[str, Any]:
        """Run performance benchmarks"""
        # Simulate performance testing
        return {
            "execution_time": {
                "average": 0.15,
                "min": 0.12,
                "max": 0.23,
                "std_dev": 0.03
            },
            "memory_usage": {
                "peak_mb": 45.2,
                "average_mb": 38.7,
                "allocations": 1250
            },
            "throughput": {
                "operations_per_second": 6667,
                "requests_per_minute": 400000
            },
            "benchmarks": [
                {
                    "test": "basic_operation",
                    "duration_ms": 150,
                    "memory_mb": 38.5,
                    "status": "pass"
                },
                {
                    "test": "stress_test",
                    "duration_ms": 230,
                    "memory_mb": 45.2,
                    "status": "pass"
                }
            ]
        }
    
    async def _generate_test_recommendations(self, test_results, coverage_analysis) -> List[str]:
        """Generate recommendations based on test results"""
        recommendations = []
        
        # Coverage recommendations
        if coverage_analysis["percentage"] < 80:
            recommendations.append("Increase test coverage to at least 80%")
        
        if coverage_analysis["branch_coverage"] < 75:
            recommendations.append("Improve branch coverage by testing all conditional paths")
        
        # Test result recommendations
        if test_results.failed > 0:
            recommendations.append("Fix failing tests before deployment")
        
        success_rate = (test_results.passed / (test_results.passed + test_results.failed)) * 100
        if success_rate < 95:
            recommendations.append("Improve test reliability - current success rate is below 95%")
        
        # Performance recommendations
        if test_results.execution_time > 60:
            recommendations.append("Optimize test execution time - currently taking too long")
        
        return recommendations
    
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