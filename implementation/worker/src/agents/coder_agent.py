"""
Coder Agent - Generates and modifies code solutions
"""
import re
import ast
import asyncio
from typing import Any, Dict, List, Optional, Tuple
from pathlib import Path

from .base_agent import BaseAgent
from ..models.types import (
    TaskContext, AgentType, AgentCapabilities, CodeSolution,
    ClaudeCodeRequest, WorkerException
)
from ..utils.code_generator import CodeGenerator
from ..utils.syntax_validator import SyntaxValidator


class CoderAgent(BaseAgent):
    """Agent specialized in code generation and modification"""
    
    def __init__(self, config):
        super().__init__(config)
        self.agent.type = AgentType.CODER
        self.agent.capabilities = AgentCapabilities(
            languages=["python", "javascript", "typescript", "java", "cpp", "rust", "go"],
            frameworks=["django", "flask", "fastapi", "react", "vue", "express", "spring"],
            domains=["algorithms", "data_structures", "web_api", "database", "testing"],
            tools=["git", "static_analysis", "code_generation", "refactoring"],
            max_complexity="high"
        )
        self.code_generator = CodeGenerator()
        self.syntax_validator = SyntaxValidator()
        
        # Initialize Claude Max if available
        self.claude_max = None
        if config.claude_max_enabled:
            from ..services.claude_max_integration import ClaudeMaxIntegration
            self.claude_max = ClaudeMaxIntegration(
                max_instances=config.claude_max_instances or 5
            )
    
    async def _execute_task_impl(self, task_context: TaskContext) -> CodeSolution:
        """Generate code solution based on analysis and requirements"""
        self.logger.info("Starting code implementation", 
                        problem_id=task_context.problem.id)
        
        try:
            # Step 1: Get research analysis from previous results
            research_analysis = task_context.previous_results.get("research", {})
            
            # Step 2: Plan implementation approach
            implementation_plan = await self._create_implementation_plan(
                task_context.problem, research_analysis
            )
            
            # Step 3: Generate code for each file
            code_changes = await self._generate_code_changes(
                task_context.problem, implementation_plan, research_analysis
            )
            
            # Step 4: Validate syntax and basic correctness
            validation_results = await self._validate_generated_code(code_changes)
            
            # Step 5: Generate or update test cases
            test_cases = await self._generate_test_cases(
                task_context.problem, code_changes, implementation_plan
            )
            
            # Step 6: Create comprehensive solution
            solution = CodeSolution(
                problem_id=task_context.problem.id,
                files_modified=code_changes.get("modified", {}),
                files_created=code_changes.get("created", {}),
                test_cases=test_cases,
                explanation=implementation_plan.get("explanation", ""),
                validation_results=validation_results
            )
            
            self.logger.info("Code implementation completed",
                           problem_id=task_context.problem.id,
                           files_modified=len(solution.files_modified),
                           files_created=len(solution.files_created))
            
            return solution
            
        except Exception as e:
            self.logger.error("Code implementation failed", 
                            problem_id=task_context.problem.id,
                            error=str(e))
            raise WorkerException(f"Code implementation failed: {e}")
    
    async def _create_implementation_plan(self, problem, research_analysis) -> Dict[str, Any]:
        """Create detailed implementation plan"""
        
        # Extract key information from research
        problem_analysis = research_analysis.get("problem_analysis", {})
        file_analysis = research_analysis.get("file_analysis", [])
        requirements = research_analysis.get("requirements", {})
        complexity = research_analysis.get("complexity_assessment", {})
        
        # Determine implementation strategy
        strategy = self._determine_implementation_strategy(
            problem_analysis.get("problem_type", "enhancement"),
            complexity.get("level", "medium"),
            len(problem.files)
        )
        
        # Create step-by-step plan
        implementation_steps = self._create_implementation_steps(
            problem, file_analysis, problem_analysis
        )
        
        # Generate detailed explanation
        explanation = self._generate_implementation_explanation(
            problem, strategy, implementation_steps
        )
        
        return {
            "strategy": strategy,
            "steps": implementation_steps,
            "explanation": explanation,
            "estimated_difficulty": complexity.get("level", "medium"),
            "primary_language": research_analysis.get("repository_analysis", {}).get("main_language", "python"),
            "architectural_considerations": self._identify_architectural_considerations(file_analysis)
        }
    
    async def _generate_code_changes(self, problem, plan, research_analysis) -> Dict[str, Dict[str, str]]:
        """Generate code changes for each affected file"""
        code_changes = {"modified": {}, "created": {}}
        
        primary_language = plan.get("primary_language", "python")
        
        # Use Claude Max for parallel generation if available
        if self.claude_max and len(problem.files) > 1:
            self.logger.info("Using Claude Max for parallel code generation", 
                           file_count=len(problem.files))
            
            # Generate all files in parallel
            results = await self.claude_max.solve_problem_parallel(
                problem_id=problem.id,
                problem_description=problem.description,
                files=problem.files
            )
            
            # Process results
            for i, file_path in enumerate(problem.files):
                try:
                    fix = results["fixes"][i]
                    if fix.get("success"):
                        is_new_file = self._is_new_file(file_path, problem.description)
                        code_content = fix.get("code", "")
                        
                        if is_new_file:
                            code_changes["created"][file_path] = code_content
                        else:
                            code_changes["modified"][file_path] = code_content
                    else:
                        raise Exception(fix.get("error", "Unknown error"))
                        
                except Exception as e:
                    self.logger.error("Failed to process Claude Max result", 
                                    file=file_path, error=str(e))
                    error_comment = f"# ERROR: {str(e)}"
                    code_changes["modified"][file_path] = error_comment
            
            return code_changes
        
        # Fallback to sequential generation
        for file_path in problem.files:
            try:
                # Determine if this is a modification or creation
                is_new_file = self._is_new_file(file_path, problem.description)
                
                # Generate code for this file
                if is_new_file:
                    code_content = await self._generate_new_file_content(
                        file_path, problem, plan, research_analysis
                    )
                    code_changes["created"][file_path] = code_content
                else:
                    code_content = await self._generate_file_modifications(
                        file_path, problem, plan, research_analysis
                    )
                    code_changes["modified"][file_path] = code_content
                
                # Use Claude Code for enhancement if available
                if self.claude_code:
                    enhanced_code = await self._enhance_with_claude_code(
                        file_path, code_content, problem, plan
                    )
                    if enhanced_code:
                        if is_new_file:
                            code_changes["created"][file_path] = enhanced_code
                        else:
                            code_changes["modified"][file_path] = enhanced_code
                
            except Exception as e:
                self.logger.error("Failed to generate code for file", 
                                file=file_path, error=str(e))
                # Add error placeholder
                error_comment = f"# ERROR: Failed to generate code for {file_path}: {str(e)}"
                if file_path in code_changes["created"]:
                    code_changes["created"][file_path] = error_comment
                else:
                    code_changes["modified"][file_path] = error_comment
        
        return code_changes
    
    async def _generate_new_file_content(self, file_path, problem, plan, research_analysis) -> str:
        """Generate content for a new file"""
        file_language = self._detect_language_from_path(file_path)
        
        # Generate based on file type and language
        if file_language == "python":
            return await self._generate_python_file(file_path, problem, plan, research_analysis)
        elif file_language in ["javascript", "typescript"]:
            return await self._generate_js_ts_file(file_path, problem, plan, research_analysis)
        elif file_language == "java":
            return await self._generate_java_file(file_path, problem, plan, research_analysis)
        else:
            return await self._generate_generic_file(file_path, problem, plan, research_analysis)
    
    async def _generate_file_modifications(self, file_path, problem, plan, research_analysis) -> str:
        """Generate modifications for an existing file"""
        file_language = self._detect_language_from_path(file_path)
        
        # Create modification based on problem description and analysis
        modification_type = self._determine_modification_type(problem.description)
        
        if modification_type == "bug_fix":
            return await self._generate_bug_fix(file_path, problem, plan)
        elif modification_type == "feature_addition":
            return await self._generate_feature_addition(file_path, problem, plan)
        elif modification_type == "optimization":
            return await self._generate_optimization(file_path, problem, plan)
        else:
            return await self._generate_general_modification(file_path, problem, plan)
    
    async def _generate_python_file(self, file_path, problem, plan, research_analysis) -> str:
        """Generate Python file content"""
        
        # Determine file purpose from path and name
        file_name = Path(file_path).name
        is_test_file = "test" in file_name.lower()
        is_init_file = file_name == "__init__.py"
        is_main_file = file_name in ["main.py", "app.py", "server.py"]
        
        if is_init_file:
            return self._generate_python_init_file(file_path, problem)
        elif is_test_file:
            return self._generate_python_test_file(file_path, problem, plan)
        elif is_main_file:
            return self._generate_python_main_file(file_path, problem, plan)
        else:
            return self._generate_python_module_file(file_path, problem, plan)
    
    def _generate_python_init_file(self, file_path, problem) -> str:
        """Generate Python __init__.py file"""
        module_name = Path(file_path).parent.name
        return f'''"""
{module_name} module

{problem.description[:100]}...
"""

__version__ = "1.0.0"
__author__ = "SWE-Bench Swarm"

# Module exports
__all__ = []
'''
    
    def _generate_python_test_file(self, file_path, problem, plan) -> str:
        """Generate Python test file"""
        class_name = self._extract_class_name_from_description(problem.description)
        function_name = self._extract_function_name_from_description(problem.description)
        
        return f'''"""
Test cases for {problem.id}

{problem.description}
"""

import unittest
import pytest
from unittest.mock import Mock, patch

# Import the module being tested
# from your_module import {class_name or function_name or "YourClass"}


class Test{class_name or "Implementation"}(unittest.TestCase):
    """Test cases for {class_name or function_name or "the implementation"}"""
    
    def setUp(self):
        """Set up test fixtures before each test method."""
        pass
    
    def tearDown(self):
        """Clean up after each test method."""
        pass
    
    def test_basic_functionality(self):
        """Test basic functionality"""
        # TODO: Implement basic functionality test
        pass
    
    def test_edge_cases(self):
        """Test edge cases"""
        # TODO: Implement edge case tests
        pass
    
    def test_error_handling(self):
        """Test error handling"""
        # TODO: Implement error handling tests
        pass


if __name__ == "__main__":
    unittest.main()
'''
    
    def _generate_python_main_file(self, file_path, problem, plan) -> str:
        """Generate Python main file"""
        return f'''#!/usr/bin/env python3
"""
Main module for {problem.id}

{problem.description}
"""

import sys
import logging
from typing import Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def main() -> int:
    """Main entry point"""
    try:
        logger.info("Starting application")
        
        # TODO: Implement main functionality based on requirements
        
        logger.info("Application completed successfully")
        return 0
        
    except Exception as e:
        logger.error(f"Application failed: {{e}}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
'''
    
    def _generate_python_module_file(self, file_path, problem, plan) -> str:
        """Generate Python module file"""
        module_name = Path(file_path).stem
        class_name = self._to_class_name(module_name)
        
        return f'''"""
{module_name} module

{problem.description}
"""

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class {class_name}:
    """
    {class_name} implementation
    
    Handles: {problem.description[:100]}...
    """
    
    def __init__(self, **kwargs):
        """Initialize {class_name}"""
        self.config = kwargs
        logger.info(f"Initialized {{self.__class__.__name__}}")
    
    def process(self, data: Any) -> Any:
        """
        Main processing method
        
        Args:
            data: Input data to process
            
        Returns:
            Processed result
            
        Raises:
            ValueError: If input data is invalid
        """
        try:
            logger.debug(f"Processing data: {{type(data)}}")
            
            # TODO: Implement main processing logic
            result = self._process_impl(data)
            
            logger.debug("Processing completed successfully")
            return result
            
        except Exception as e:
            logger.error(f"Processing failed: {{e}}")
            raise
    
    def _process_impl(self, data: Any) -> Any:
        """Internal implementation of processing logic"""
        # TODO: Implement the core logic based on requirements
        return data
    
    def validate_input(self, data: Any) -> bool:
        """Validate input data"""
        if data is None:
            return False
        
        # TODO: Add specific validation logic
        return True
    
    def get_status(self) -> Dict[str, Any]:
        """Get current status"""
        return {{
            "class": self.__class__.__name__,
            "config": self.config,
            "status": "active"
        }}


# Module-level convenience functions
def create_{module_name}(**kwargs) -> {class_name}:
    """Create and return a new {class_name} instance"""
    return {class_name}(**kwargs)
'''
    
    async def _generate_js_ts_file(self, file_path, problem, plan, research_analysis) -> str:
        """Generate JavaScript/TypeScript file content"""
        is_typescript = file_path.endswith('.ts')
        is_test_file = "test" in Path(file_path).name.lower()
        
        if is_test_file:
            return self._generate_js_test_file(file_path, problem, is_typescript)
        else:
            return self._generate_js_module_file(file_path, problem, is_typescript)
    
    def _generate_js_module_file(self, file_path, problem, is_typescript) -> str:
        """Generate JavaScript/TypeScript module file"""
        module_name = Path(file_path).stem
        class_name = self._to_class_name(module_name)
        
        type_annotations = ""
        interface_def = ""
        
        if is_typescript:
            type_annotations = ": any"
            interface_def = f"""
interface {class_name}Config {{
    [key: string]: any;
}}

interface ProcessResult {{
    success: boolean;
    data?: any;
    error?: string;
}}
"""
        
        return f'''{interface_def}
/**
 * {class_name} implementation
 * 
 * {problem.description}
 */
export class {class_name} {{
    private config{type_annotations};
    
    constructor(config{type_annotations} = {{}}) {{
        this.config = config;
        console.log(`Initialized ${{this.constructor.name}}`);
    }}
    
    /**
     * Main processing method
     * @param data - Input data to process
     * @returns Processed result
     */
    async process(data{type_annotations}){": Promise<ProcessResult>" if is_typescript else ""} {{
        try {{
            console.log(`Processing data: ${{typeof data}}`);
            
            // TODO: Implement main processing logic
            const result = await this.processImpl(data);
            
            console.log('Processing completed successfully');
            return {{ success: true, data: result }};
            
        }} catch (error) {{
            console.error(`Processing failed: ${{error}}`);
            return {{ success: false, error: error.message }};
        }}
    }}
    
    /**
     * Internal implementation of processing logic
     * @param data - Input data
     * @returns Processed data
     */
    private async processImpl(data{type_annotations}){type_annotations} {{
        // TODO: Implement the core logic based on requirements
        return data;
    }}
    
    /**
     * Validate input data
     * @param data - Data to validate
     * @returns True if valid, false otherwise
     */
    validateInput(data{type_annotations}){": boolean" if is_typescript else ""} {{
        if (data === null || data === undefined) {{
            return false;
        }}
        
        // TODO: Add specific validation logic
        return true;
    }}
    
    /**
     * Get current status
     * @returns Status object
     */
    getStatus(){type_annotations} {{
        return {{
            class: this.constructor.name,
            config: this.config,
            status: 'active'
        }};
    }}
}}

/**
 * Create and return a new {class_name} instance
 * @param config - Configuration options
 * @returns New instance
 */
export function create{class_name}(config{type_annotations} = {}){": {class_name}" if is_typescript else ""} {{
    return new {class_name}(config);
}}

export default {class_name};
'''
    
    def _generate_js_test_file(self, file_path, problem, is_typescript) -> str:
        """Generate JavaScript/TypeScript test file"""
        module_name = Path(file_path).stem.replace('.test', '').replace('.spec', '')
        class_name = self._to_class_name(module_name)
        
        import_statement = f"import {{ {class_name} }} from './{module_name}';"
        if is_typescript:
            import_statement = f"import {{ {class_name} }} from './{module_name}.js';"
        
        return f'''/**
 * Test cases for {problem.id}
 * 
 * {problem.description}
 */

{import_statement}

describe('{class_name}', () => {{
    let instance: {class_name};
    
    beforeEach(() => {{
        instance = new {class_name}();
    }});
    
    afterEach(() => {{
        // Clean up after each test
    }});
    
    describe('constructor', () => {{
        it('should create instance with default config', () => {{
            expect(instance).toBeDefined();
            expect(instance.getStatus()).toBeDefined();
        }});
        
        it('should create instance with custom config', () => {{
            const config = {{ option: 'value' }};
            const customInstance = new {class_name}(config);
            expect(customInstance.getStatus().config).toEqual(config);
        }});
    }});
    
    describe('process', () => {{
        it('should process valid data successfully', async () => {{
            const testData = {{ test: 'data' }};
            const result = await instance.process(testData);
            
            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
        }});
        
        it('should handle invalid data gracefully', async () => {{
            const result = await instance.process(null);
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        }});
    }});
    
    describe('validateInput', () => {{
        it('should return false for null/undefined input', () => {{
            expect(instance.validateInput(null)).toBe(false);
            expect(instance.validateInput(undefined)).toBe(false);
        }});
        
        it('should return true for valid input', () => {{
            expect(instance.validateInput({{ valid: 'data' }})).toBe(true);
        }});
    }});
}});
'''
    
    async def _generate_java_file(self, file_path, problem, plan, research_analysis) -> str:
        """Generate Java file content"""
        package_name = self._extract_java_package(file_path)
        class_name = Path(file_path).stem
        
        return f'''package {package_name};

import java.util.*;
import java.util.logging.Logger;

/**
 * {class_name} implementation
 * 
 * {problem.description}
 * 
 * @author SWE-Bench Swarm
 * @version 1.0
 */
public class {class_name} {{
    private static final Logger logger = Logger.getLogger({class_name}.class.getName());
    
    private Map<String, Object> config;
    
    /**
     * Constructor
     */
    public {class_name}() {{
        this.config = new HashMap<>();
        logger.info("Initialized " + this.getClass().getSimpleName());
    }}
    
    /**
     * Constructor with configuration
     * @param config Configuration map
     */
    public {class_name}(Map<String, Object> config) {{
        this.config = config != null ? config : new HashMap<>();
        logger.info("Initialized " + this.getClass().getSimpleName());
    }}
    
    /**
     * Main processing method
     * @param data Input data to process
     * @return Processed result
     * @throws IllegalArgumentException if input is invalid
     */
    public Object process(Object data) throws IllegalArgumentException {{
        try {{
            logger.fine("Processing data: " + (data != null ? data.getClass().getSimpleName() : "null"));
            
            if (!validateInput(data)) {{
                throw new IllegalArgumentException("Invalid input data");
            }}
            
            // TODO: Implement main processing logic
            Object result = processImpl(data);
            
            logger.fine("Processing completed successfully");
            return result;
            
        }} catch (Exception e) {{
            logger.severe("Processing failed: " + e.getMessage());
            throw e;
        }}
    }}
    
    /**
     * Internal implementation of processing logic
     * @param data Input data
     * @return Processed data
     */
    private Object processImpl(Object data) {{
        // TODO: Implement the core logic based on requirements
        return data;
    }}
    
    /**
     * Validate input data
     * @param data Data to validate
     * @return true if valid, false otherwise
     */
    public boolean validateInput(Object data) {{
        if (data == null) {{
            return false;
        }}
        
        // TODO: Add specific validation logic
        return true;
    }}
    
    /**
     * Get current status
     * @return Status map
     */
    public Map<String, Object> getStatus() {{
        Map<String, Object> status = new HashMap<>();
        status.put("class", this.getClass().getSimpleName());
        status.put("config", this.config);
        status.put("status", "active");
        return status;
    }}
    
    // Getters and setters
    public Map<String, Object> getConfig() {{
        return new HashMap<>(config);
    }}
    
    public void setConfig(Map<String, Object> config) {{
        this.config = config != null ? config : new HashMap<>();
    }}
}}
'''
    
    async def _generate_generic_file(self, file_path, problem, plan, research_analysis) -> str:
        """Generate generic file content for unknown types"""
        file_extension = Path(file_path).suffix
        
        if file_extension in ['.json', '.yaml', '.yml']:
            return self._generate_config_file(file_path, problem)
        elif file_extension in ['.md', '.txt']:
            return self._generate_documentation_file(file_path, problem)
        else:
            return f"""# {Path(file_path).name}

# Problem: {problem.id}
# Description: {problem.description}

# TODO: Implement solution for {file_path}
# This file needs to be implemented according to the problem requirements.
"""
    
    def _generate_config_file(self, file_path, problem) -> str:
        """Generate configuration file content"""
        if file_path.endswith('.json'):
            return f'''{{
    "name": "{problem.id}",
    "description": "{problem.description[:100]}...",
    "version": "1.0.0",
    "configuration": {{
        "environment": "development",
        "debug": true
    }}
}}'''
        else:  # YAML
            return f'''name: {problem.id}
description: "{problem.description[:100]}..."
version: "1.0.0"
configuration:
  environment: development
  debug: true
'''
    
    def _generate_documentation_file(self, file_path, problem) -> str:
        """Generate documentation file content"""
        return f'''# {Path(file_path).stem.title()}

## Problem: {problem.id}

### Description
{problem.description}

### Solution
TODO: Document the implemented solution

### Usage
TODO: Provide usage examples

### Notes
- Implementation completed by SWE-Bench Swarm
- Generated automatically based on problem requirements
'''
    
    async def _validate_generated_code(self, code_changes) -> Dict[str, Any]:
        """Validate syntax and basic correctness of generated code"""
        validation_results = {
            "syntax_valid": {},
            "warnings": [],
            "errors": [],
            "overall_valid": True
        }
        
        # Validate each file
        all_files = {**code_changes.get("modified", {}), **code_changes.get("created", {})}
        
        for file_path, content in all_files.items():
            try:
                language = self._detect_language_from_path(file_path)
                is_valid = await self._validate_file_syntax(file_path, content, language)
                validation_results["syntax_valid"][file_path] = is_valid
                
                if not is_valid:
                    validation_results["overall_valid"] = False
                    validation_results["errors"].append(f"Syntax error in {file_path}")
                
            except Exception as e:
                validation_results["syntax_valid"][file_path] = False
                validation_results["overall_valid"] = False
                validation_results["errors"].append(f"Validation failed for {file_path}: {str(e)}")
        
        return validation_results
    
    async def _validate_file_syntax(self, file_path, content, language) -> bool:
        """Validate syntax for a specific file"""
        try:
            if language == "python":
                # Parse Python code
                ast.parse(content)
                return True
            elif language in ["javascript", "typescript"]:
                # Basic JavaScript/TypeScript validation
                return self._validate_js_syntax(content)
            else:
                # For other languages, do basic checks
                return len(content.strip()) > 0 and not content.strip().startswith("ERROR:")
                
        except SyntaxError:
            return False
        except Exception:
            return False
    
    def _validate_js_syntax(self, content) -> bool:
        """Basic JavaScript/TypeScript syntax validation"""
        # Check for balanced braces, brackets, and parentheses
        braces = content.count('{') - content.count('}')
        brackets = content.count('[') - content.count(']')
        parens = content.count('(') - content.count(')')
        
        return braces == 0 and brackets == 0 and parens == 0
    
    async def _generate_test_cases(self, problem, code_changes, plan) -> List[str]:
        """Generate test cases for the implementation"""
        test_cases = []
        
        # Basic test cases based on problem description
        test_cases.extend(problem.test_cases)
        
        # Generate additional test cases based on implementation
        generated_tests = self._generate_additional_test_cases(problem, code_changes, plan)
        test_cases.extend(generated_tests)
        
        return test_cases
    
    def _generate_additional_test_cases(self, problem, code_changes, plan) -> List[str]:
        """Generate additional test cases based on implementation"""
        test_cases = []
        
        # Add basic functionality tests
        test_cases.append("test_basic_functionality")
        test_cases.append("test_edge_cases")
        test_cases.append("test_error_handling")
        
        # Add specific tests based on problem type
        problem_type = plan.get("strategy", {}).get("type", "unknown")
        
        if problem_type == "bug_fix":
            test_cases.append("test_bug_regression")
        elif problem_type == "feature_addition":
            test_cases.append("test_new_feature_integration")
        elif problem_type == "optimization":
            test_cases.append("test_performance_improvement")
        
        return test_cases
    
    async def _enhance_with_claude_code(self, file_path, content, problem, plan) -> Optional[str]:
        """Enhance generated code using Claude Code if available"""
        if not self.claude_code:
            return None
        
        try:
            enhancement_request = ClaudeCodeRequest(
                operation="optimize",
                code=content,
                requirements=f"Enhance code for: {problem.description}",
                context={
                    "file_path": file_path,
                    "problem_id": problem.id,
                    "implementation_plan": plan
                },
                language=self._detect_language_from_path(file_path)
            )
            
            response = await self.claude_code.call_claude_code(enhancement_request)
            
            if response.success and response.result:
                self.logger.debug("Code enhanced with Claude Code", file=file_path)
                return response.result
            else:
                self.logger.warning("Claude Code enhancement failed", 
                                  file=file_path, error=response.error)
                return None
                
        except Exception as e:
            self.logger.error("Claude Code enhancement error", file=file_path, error=str(e))
            return None
    
    # Helper methods
    
    def _determine_implementation_strategy(self, problem_type, complexity, file_count) -> Dict[str, Any]:
        """Determine implementation strategy based on problem characteristics"""
        strategies = {
            "bug_fix": {
                "approach": "targeted_fix",
                "focus": "minimal_changes",
                "testing": "regression_focused"
            },
            "feature_addition": {
                "approach": "incremental_development",
                "focus": "clean_integration",
                "testing": "comprehensive_coverage"
            },
            "optimization": {
                "approach": "performance_focused",
                "focus": "algorithmic_improvement",
                "testing": "benchmark_driven"
            },
            "refactoring": {
                "approach": "structure_improvement",
                "focus": "maintainability",
                "testing": "behavior_preservation"
            }
        }
        
        base_strategy = strategies.get(problem_type, strategies["feature_addition"])
        
        # Adjust strategy based on complexity and scope
        if complexity == "high" or file_count > 3:
            base_strategy["approach"] = "phased_implementation"
            base_strategy["planning"] = "detailed_design_first"
        
        return base_strategy
    
    def _create_implementation_steps(self, problem, file_analysis, problem_analysis) -> List[Dict[str, Any]]:
        """Create step-by-step implementation plan"""
        steps = []
        
        # Step 1: Setup and preparation
        steps.append({
            "step": 1,
            "title": "Setup and Preparation",
            "description": "Set up development environment and dependencies",
            "files": [],
            "estimated_time": 10
        })
        
        # Step 2: Core implementation
        core_files = [f for f in problem.files if not any(x in f.lower() for x in ["test", "config", "doc"])]
        steps.append({
            "step": 2,
            "title": "Core Implementation",
            "description": "Implement main functionality",
            "files": core_files,
            "estimated_time": 60
        })
        
        # Step 3: Testing implementation
        test_files = [f for f in problem.files if "test" in f.lower()]
        if test_files:
            steps.append({
                "step": 3,
                "title": "Testing Implementation",
                "description": "Implement test cases",
                "files": test_files,
                "estimated_time": 30
            })
        
        # Step 4: Integration and validation
        steps.append({
            "step": 4,
            "title": "Integration and Validation",
            "description": "Integrate all components and validate solution",
            "files": problem.files,
            "estimated_time": 20
        })
        
        return steps
    
    def _generate_implementation_explanation(self, problem, strategy, steps) -> str:
        """Generate detailed explanation of implementation approach"""
        explanation = f"""
Implementation Plan for {problem.id}

Problem Summary:
{problem.description}

Implementation Strategy:
- Approach: {strategy.get('approach', 'standard')}
- Focus: {strategy.get('focus', 'functionality')}
- Testing: {strategy.get('testing', 'standard')}

Implementation Steps:
"""
        
        for step in steps:
            explanation += f"\n{step['step']}. {step['title']}\n"
            explanation += f"   - {step['description']}\n"
            explanation += f"   - Files: {', '.join(step['files']) if step['files'] else 'N/A'}\n"
            explanation += f"   - Estimated time: {step['estimated_time']} minutes\n"
        
        explanation += "\nKey Considerations:\n"
        explanation += "- Maintain backward compatibility where possible\n"
        explanation += "- Follow existing code style and patterns\n"
        explanation += "- Ensure comprehensive error handling\n"
        explanation += "- Add appropriate logging and documentation\n"
        
        return explanation
    
    def _identify_architectural_considerations(self, file_analysis) -> List[str]:
        """Identify architectural considerations from file analysis"""
        considerations = []
        
        # Check for common architectural patterns
        file_paths = [analysis.file_path for analysis in file_analysis]
        
        if any("model" in fp.lower() for fp in file_paths):
            considerations.append("Data model design")
        
        if any("controller" in fp.lower() or "view" in fp.lower() for fp in file_paths):
            considerations.append("MVC pattern compliance")
        
        if any("api" in fp.lower() or "endpoint" in fp.lower() for fp in file_paths):
            considerations.append("API design and versioning")
        
        if any("test" in fp.lower() for fp in file_paths):
            considerations.append("Test strategy and coverage")
        
        if len(file_paths) > 5:
            considerations.append("Module organization and dependencies")
        
        return considerations
    
    def _is_new_file(self, file_path, description) -> bool:
        """Determine if this should be treated as a new file"""
        # Simple heuristic - in a real implementation, this would check if file exists
        create_indicators = ["create", "add", "new", "implement"]
        return any(indicator in description.lower() for indicator in create_indicators)
    
    def _detect_language_from_path(self, file_path) -> str:
        """Detect programming language from file path"""
        extension_map = {
            ".py": "python",
            ".js": "javascript",
            ".ts": "typescript",
            ".java": "java",
            ".cpp": "cpp",
            ".c": "c",
            ".rs": "rust",
            ".go": "go",
            ".rb": "ruby",
            ".php": "php"
        }
        
        ext = Path(file_path).suffix.lower()
        return extension_map.get(ext, "unknown")
    
    def _determine_modification_type(self, description) -> str:
        """Determine type of modification needed"""
        desc_lower = description.lower()
        
        if any(word in desc_lower for word in ["fix", "bug", "error"]):
            return "bug_fix"
        elif any(word in desc_lower for word in ["add", "implement", "create"]):
            return "feature_addition"
        elif any(word in desc_lower for word in ["optimize", "improve", "performance"]):
            return "optimization"
        else:
            return "general_modification"
    
    def _extract_class_name_from_description(self, description) -> Optional[str]:
        """Extract class name from problem description"""
        # Look for class name patterns
        class_pattern = r'\b([A-Z][a-zA-Z]*(?:Class|Manager|Handler|Service))\b'
        match = re.search(class_pattern, description)
        if match:
            return match.group(1)
        
        # Look for general class-like words
        class_indicators = r'\bclass\s+([A-Z][a-zA-Z]*)\b'
        match = re.search(class_indicators, description, re.IGNORECASE)
        if match:
            return match.group(1)
        
        return None
    
    def _extract_function_name_from_description(self, description) -> Optional[str]:
        """Extract function name from problem description"""
        # Look for function name patterns
        func_pattern = r'\b([a-z_][a-z0-9_]*)\s*\('
        matches = re.findall(func_pattern, description.lower())
        if matches:
            return matches[0]
        
        # Look for function-like words
        func_indicators = r'\bfunction\s+([a-z_][a-z0-9_]*)\b'
        match = re.search(func_indicators, description, re.IGNORECASE)
        if match:
            return match.group(1)
        
        return None
    
    def _to_class_name(self, name) -> str:
        """Convert name to class name format"""
        # Remove file extension and convert to PascalCase
        name = Path(name).stem
        words = re.split(r'[_\-\s]+', name)
        return ''.join(word.capitalize() for word in words if word)
    
    def _extract_java_package(self, file_path) -> str:
        """Extract Java package name from file path"""
        path_parts = Path(file_path).parts
        
        # Find src/main/java or src/test/java
        java_index = -1
        for i, part in enumerate(path_parts):
            if part == "java" and i > 0 and path_parts[i-1] in ["main", "test"]:
                java_index = i
                break
        
        if java_index >= 0 and java_index < len(path_parts) - 1:
            package_parts = path_parts[java_index + 1:-1]  # Exclude filename
            return '.'.join(package_parts)
        
        return "com.example"