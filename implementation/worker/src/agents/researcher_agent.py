"""
Researcher Agent - Analyzes problems and gathers context
"""
import re
import asyncio
from typing import Any, Dict, List, Optional
from pathlib import Path

from .base_agent import BaseAgent
from ..models.types import (
    TaskContext, AgentType, AgentCapabilities, CodeAnalysis,
    ClaudeCodeRequest, WorkerException
)
from ..utils.repository_analyzer import RepositoryAnalyzer
from ..utils.file_processor import FileProcessor


class ResearcherAgent(BaseAgent):
    """Agent specialized in problem analysis and context gathering"""
    
    def __init__(self, config):
        super().__init__(config)
        self.agent.type = AgentType.RESEARCHER
        self.agent.capabilities = AgentCapabilities(
            languages=["python", "javascript", "typescript", "java", "cpp", "rust"],
            frameworks=["django", "flask", "react", "vue", "spring", "express"],
            domains=["algorithms", "data_structures", "web_development", "api_design"],
            tools=["git", "static_analysis", "documentation", "requirements_analysis"],
            max_complexity="high"
        )
        self.repository_analyzer = RepositoryAnalyzer()
        self.file_processor = FileProcessor()
    
    async def _execute_task_impl(self, task_context: TaskContext) -> Dict[str, Any]:
        """Analyze problem and gather context"""
        self.logger.info("Starting problem analysis", 
                        problem_id=task_context.problem.id)
        
        try:
            # Step 1: Analyze problem description
            problem_analysis = await self._analyze_problem_description(task_context.problem)
            
            # Step 2: Analyze repository structure
            repo_analysis = await self._analyze_repository_structure(task_context.problem)
            
            # Step 3: Analyze affected files
            file_analysis = await self._analyze_affected_files(task_context.problem)
            
            # Step 4: Extract requirements and constraints
            requirements = await self._extract_requirements(task_context.problem)
            
            # Step 5: Identify dependencies and relationships
            dependencies = await self._analyze_dependencies(task_context.problem, file_analysis)
            
            # Step 6: Assess complexity and provide recommendations
            complexity_assessment = await self._assess_complexity(
                problem_analysis, file_analysis, requirements
            )
            
            # Compile comprehensive analysis
            analysis_result = {
                "problem_analysis": problem_analysis,
                "repository_analysis": repo_analysis,
                "file_analysis": file_analysis,
                "requirements": requirements,
                "dependencies": dependencies,
                "complexity_assessment": complexity_assessment,
                "recommendations": await self._generate_recommendations(
                    problem_analysis, complexity_assessment
                ),
                "metadata": {
                    "analyzer": "researcher_agent",
                    "analysis_version": "1.0",
                    "confidence_score": complexity_assessment.get("confidence", 0.8)
                }
            }
            
            self.logger.info("Problem analysis completed",
                           problem_id=task_context.problem.id,
                           complexity=complexity_assessment.get("level", "unknown"),
                           files_analyzed=len(file_analysis))
            
            return analysis_result
            
        except Exception as e:
            self.logger.error("Problem analysis failed", 
                            problem_id=task_context.problem.id,
                            error=str(e))
            raise WorkerException(f"Problem analysis failed: {e}")
    
    async def _analyze_problem_description(self, problem) -> Dict[str, Any]:
        """Analyze the problem description to extract key information"""
        description = problem.description
        
        # Extract key concepts and keywords
        keywords = self._extract_keywords(description)
        
        # Identify problem type
        problem_type = self._identify_problem_type(description)
        
        # Extract mentioned technologies
        technologies = self._extract_technologies(description)
        
        # Identify action words (fix, implement, optimize, etc.)
        actions = self._extract_action_words(description)
        
        # Use Claude Code for enhanced analysis if available
        enhanced_analysis = {}
        if self.claude_code:
            try:
                claude_request = ClaudeCodeRequest(
                    operation="analyze",
                    code=description,
                    context={"analysis_type": "problem_description"},
                    language="text"
                )
                claude_response = await self.claude_code.call_claude_code(claude_request)
                if claude_response.success:
                    enhanced_analysis = claude_response.result or {}
            except Exception as e:
                self.logger.warning("Claude Code analysis failed", error=str(e))
        
        return {
            "keywords": keywords,
            "problem_type": problem_type,
            "technologies": technologies,
            "required_actions": actions,
            "main_goal": self._extract_main_goal(description),
            "constraints_mentioned": self._extract_constraints(description),
            "enhanced_analysis": enhanced_analysis,
            "description_length": len(description),
            "complexity_indicators": self._find_complexity_indicators(description)
        }
    
    async def _analyze_repository_structure(self, problem) -> Dict[str, Any]:
        """Analyze repository structure and organization"""
        try:
            # Simulate repository analysis
            # In a real implementation, this would clone and analyze the actual repository
            
            structure_info = {
                "repository": problem.repository,
                "main_language": self._detect_main_language(problem.files),
                "project_type": self._identify_project_type(problem.files),
                "directory_structure": self._analyze_directory_structure(problem.files),
                "configuration_files": self._find_configuration_files(problem.files),
                "test_structure": self._analyze_test_structure(problem.files),
                "documentation": self._find_documentation_files(problem.files)
            }
            
            return structure_info
            
        except Exception as e:
            self.logger.error("Repository structure analysis failed", error=str(e))
            return {"error": str(e), "analysis_completed": False}
    
    async def _analyze_affected_files(self, problem) -> List[CodeAnalysis]:
        """Analyze files mentioned in the problem"""
        file_analyses = []
        
        for file_path in problem.files:
            try:
                analysis = CodeAnalysis(
                    file_path=file_path,
                    language=self._detect_file_language(file_path),
                    complexity="medium",  # Default
                    issues=[],
                    suggestions=[],
                    dependencies=[]
                )
                
                # Analyze file based on extension and path
                analysis.complexity = self._estimate_file_complexity(file_path)
                analysis.issues = self._identify_potential_issues(file_path, problem.description)
                analysis.suggestions = self._generate_file_suggestions(file_path, problem.description)
                analysis.dependencies = self._identify_file_dependencies(file_path)
                
                # Use Claude Code for detailed file analysis if available
                if self.claude_code:
                    try:
                        claude_request = ClaudeCodeRequest(
                            operation="analyze",
                            context={"file_path": file_path, "problem_context": problem.description},
                            language=analysis.language
                        )
                        claude_response = await self.claude_code.call_claude_code(claude_request)
                        if claude_response.success and claude_response.result:
                            # Merge Claude Code analysis
                            claude_analysis = claude_response.result
                            if isinstance(claude_analysis, dict):
                                analysis.issues.extend(claude_analysis.get("issues", []))
                                analysis.suggestions.extend(claude_analysis.get("suggestions", []))
                                analysis.metrics.update(claude_analysis.get("metrics", {}))
                    except Exception as e:
                        self.logger.warning("Claude Code file analysis failed", 
                                          file=file_path, error=str(e))
                
                file_analyses.append(analysis)
                
            except Exception as e:
                self.logger.error("File analysis failed", file=file_path, error=str(e))
                # Add error analysis
                file_analyses.append(CodeAnalysis(
                    file_path=file_path,
                    language="unknown",
                    complexity="unknown",
                    issues=[f"Analysis failed: {str(e)}"]
                ))
        
        return file_analyses
    
    async def _extract_requirements(self, problem) -> Dict[str, Any]:
        """Extract functional and non-functional requirements"""
        description = problem.description
        
        # Functional requirements
        functional_reqs = self._extract_functional_requirements(description)
        
        # Non-functional requirements
        non_functional_reqs = self._extract_non_functional_requirements(description, problem.constraints)
        
        # Test requirements
        test_reqs = self._extract_test_requirements(description, problem.test_cases)
        
        return {
            "functional": functional_reqs,
            "non_functional": non_functional_reqs,
            "testing": test_reqs,
            "constraints": problem.constraints,
            "acceptance_criteria": self._extract_acceptance_criteria(description)
        }
    
    async def _analyze_dependencies(self, problem, file_analysis) -> Dict[str, Any]:
        """Analyze dependencies between files and external libraries"""
        internal_deps = {}
        external_deps = set()
        
        for analysis in file_analysis:
            internal_deps[analysis.file_path] = analysis.dependencies
            # Extract import statements and external library usage
            external_deps.update(self._extract_external_dependencies(analysis.file_path))
        
        return {
            "internal_dependencies": internal_deps,
            "external_dependencies": list(external_deps),
            "dependency_graph": self._build_dependency_graph(internal_deps),
            "critical_dependencies": self._identify_critical_dependencies(internal_deps)
        }
    
    async def _assess_complexity(self, problem_analysis, file_analysis, requirements) -> Dict[str, Any]:
        """Assess overall complexity of the problem"""
        complexity_factors = []
        complexity_score = 0
        
        # Factor 1: Number of files involved
        file_count = len(file_analysis)
        if file_count == 1:
            complexity_score += 10
            complexity_factors.append("single_file")
        elif file_count <= 3:
            complexity_score += 30
            complexity_factors.append("few_files")
        else:
            complexity_score += 60
            complexity_factors.append("many_files")
        
        # Factor 2: Problem type complexity
        problem_type = problem_analysis.get("problem_type", "unknown")
        type_complexity = {
            "bug_fix": 20,
            "feature_addition": 40,
            "refactoring": 50,
            "optimization": 60,
            "architecture_change": 80
        }
        complexity_score += type_complexity.get(problem_type, 40)
        
        # Factor 3: Technology complexity
        technologies = problem_analysis.get("technologies", [])
        if len(technologies) > 2:
            complexity_score += 20
            complexity_factors.append("multiple_technologies")
        
        # Factor 4: Requirements complexity
        func_reqs = len(requirements.get("functional", []))
        if func_reqs > 5:
            complexity_score += 20
            complexity_factors.append("complex_requirements")
        
        # Determine complexity level
        if complexity_score <= 40:
            level = "low"
        elif complexity_score <= 80:
            level = "medium"
        else:
            level = "high"
        
        return {
            "level": level,
            "score": complexity_score,
            "factors": complexity_factors,
            "estimated_time": self._estimate_completion_time(complexity_score),
            "recommended_agents": self._recommend_agent_types(complexity_factors),
            "confidence": min(1.0, max(0.5, 1.0 - (complexity_score / 200)))
        }
    
    async def _generate_recommendations(self, problem_analysis, complexity_assessment) -> List[str]:
        """Generate recommendations for solving the problem"""
        recommendations = []
        
        complexity = complexity_assessment["level"]
        problem_type = problem_analysis.get("problem_type", "unknown")
        
        # General recommendations based on complexity
        if complexity == "high":
            recommendations.append("Break down into smaller subtasks")
            recommendations.append("Implement incremental changes with testing")
            recommendations.append("Consider pair programming or code review")
        
        # Specific recommendations based on problem type
        if problem_type == "bug_fix":
            recommendations.append("Start with reproducing the issue")
            recommendations.append("Add regression tests")
        elif problem_type == "feature_addition":
            recommendations.append("Design API/interface first")
            recommendations.append("Implement comprehensive test coverage")
        elif problem_type == "optimization":
            recommendations.append("Profile current performance")
            recommendations.append("Establish performance benchmarks")
        
        # Technology-specific recommendations
        technologies = problem_analysis.get("technologies", [])
        if "database" in technologies:
            recommendations.append("Consider database migration impacts")
        if "api" in technologies:
            recommendations.append("Ensure backward compatibility")
        
        return recommendations
    
    # Helper methods for analysis
    
    def _extract_keywords(self, description: str) -> List[str]:
        """Extract key technical terms from description"""
        # Simple keyword extraction - in production, use NLP
        tech_keywords = [
            "algorithm", "api", "database", "function", "class", "method",
            "performance", "optimization", "bug", "error", "exception",
            "test", "validation", "security", "authentication", "authorization"
        ]
        
        found_keywords = []
        description_lower = description.lower()
        
        for keyword in tech_keywords:
            if keyword in description_lower:
                found_keywords.append(keyword)
        
        return found_keywords
    
    def _identify_problem_type(self, description: str) -> str:
        """Identify the type of problem based on description"""
        description_lower = description.lower()
        
        if any(word in description_lower for word in ["fix", "bug", "error", "issue"]):
            return "bug_fix"
        elif any(word in description_lower for word in ["add", "implement", "create", "new"]):
            return "feature_addition"
        elif any(word in description_lower for word in ["refactor", "restructure", "reorganize"]):
            return "refactoring"
        elif any(word in description_lower for word in ["optimize", "improve", "performance"]):
            return "optimization"
        elif any(word in description_lower for word in ["design", "architecture", "structure"]):
            return "architecture_change"
        else:
            return "enhancement"
    
    def _extract_technologies(self, description: str) -> List[str]:
        """Extract mentioned technologies from description"""
        tech_patterns = {
            "python": r"\bpython\b|\.py\b",
            "javascript": r"\bjavascript\b|\.js\b",
            "typescript": r"\btypescript\b|\.ts\b",
            "react": r"\breact\b",
            "django": r"\bdjango\b",
            "flask": r"\bflask\b",
            "api": r"\bapi\b|endpoint|rest",
            "database": r"\bdatabase\b|sql|mongodb|redis",
            "web": r"\bweb\b|http|html|css"
        }
        
        found_techs = []
        description_lower = description.lower()
        
        for tech, pattern in tech_patterns.items():
            if re.search(pattern, description_lower):
                found_techs.append(tech)
        
        return found_techs
    
    def _extract_action_words(self, description: str) -> List[str]:
        """Extract action words from description"""
        action_words = [
            "fix", "implement", "create", "add", "remove", "update", "modify",
            "optimize", "improve", "refactor", "test", "validate", "debug"
        ]
        
        found_actions = []
        description_lower = description.lower()
        
        for action in action_words:
            if action in description_lower:
                found_actions.append(action)
        
        return found_actions
    
    def _extract_main_goal(self, description: str) -> str:
        """Extract the main goal from description"""
        sentences = description.split('.')
        if sentences:
            return sentences[0].strip()
        return description[:100] + "..." if len(description) > 100 else description
    
    def _extract_constraints(self, description: str) -> List[str]:
        """Extract constraints mentioned in description"""
        constraint_indicators = [
            "must", "should", "cannot", "required", "mandatory",
            "within", "timeout", "memory", "performance"
        ]
        
        constraints = []
        description_lower = description.lower()
        
        for indicator in constraint_indicators:
            if indicator in description_lower:
                # Extract sentence containing the constraint
                sentences = description.split('.')
                for sentence in sentences:
                    if indicator in sentence.lower():
                        constraints.append(sentence.strip())
                        break
        
        return constraints
    
    def _find_complexity_indicators(self, description: str) -> List[str]:
        """Find indicators of problem complexity"""
        complexity_indicators = []
        description_lower = description.lower()
        
        if any(word in description_lower for word in ["multiple", "several", "many"]):
            complexity_indicators.append("multiple_components")
        
        if any(word in description_lower for word in ["complex", "complicated", "intricate"]):
            complexity_indicators.append("inherent_complexity")
        
        if any(word in description_lower for word in ["integration", "compatibility", "migration"]):
            complexity_indicators.append("integration_complexity")
        
        if len(description.split()) > 100:
            complexity_indicators.append("detailed_specification")
        
        return complexity_indicators
    
    def _detect_main_language(self, files: List[str]) -> str:
        """Detect main programming language from file list"""
        language_counts = {}
        
        for file_path in files:
            lang = self._detect_file_language(file_path)
            language_counts[lang] = language_counts.get(lang, 0) + 1
        
        if language_counts:
            return max(language_counts, key=language_counts.get)
        return "unknown"
    
    def _detect_file_language(self, file_path: str) -> str:
        """Detect programming language from file extension"""
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
            ".php": "php",
            ".html": "html",
            ".css": "css",
            ".sql": "sql",
            ".json": "json",
            ".yaml": "yaml",
            ".yml": "yaml",
            ".xml": "xml"
        }
        
        file_path_lower = file_path.lower()
        for ext, lang in extension_map.items():
            if file_path_lower.endswith(ext):
                return lang
        
        return "unknown"
    
    def _identify_project_type(self, files: List[str]) -> str:
        """Identify project type based on files"""
        file_indicators = {
            "web_application": ["index.html", "app.py", "server.js", "package.json"],
            "library": ["__init__.py", "setup.py", "lib/", "src/"],
            "api": ["api/", "routes/", "endpoints/", "swagger.json"],
            "cli_tool": ["main.py", "cli.py", "bin/"],
            "desktop_application": ["main.py", "app.py", "gui/"]
        }
        
        file_list_str = " ".join(files).lower()
        
        for project_type, indicators in file_indicators.items():
            if any(indicator in file_list_str for indicator in indicators):
                return project_type
        
        return "unknown"
    
    def _analyze_directory_structure(self, files: List[str]) -> Dict[str, Any]:
        """Analyze directory structure from file list"""
        directories = set()
        file_count_by_dir = {}
        
        for file_path in files:
            path_parts = Path(file_path).parts[:-1]  # Exclude filename
            if path_parts:
                dir_path = "/".join(path_parts)
                directories.add(dir_path)
                file_count_by_dir[dir_path] = file_count_by_dir.get(dir_path, 0) + 1
        
        return {
            "directories": list(directories),
            "file_distribution": file_count_by_dir,
            "max_depth": max(len(Path(f).parts) for f in files) if files else 0
        }
    
    def _find_configuration_files(self, files: List[str]) -> List[str]:
        """Find configuration files in the file list"""
        config_patterns = [
            "config", "settings", ".env", "package.json", "requirements.txt",
            "Dockerfile", "docker-compose", "Makefile", "setup.py", "pyproject.toml"
        ]
        
        config_files = []
        for file_path in files:
            file_name = Path(file_path).name.lower()
            if any(pattern in file_name for pattern in config_patterns):
                config_files.append(file_path)
        
        return config_files
    
    def _analyze_test_structure(self, files: List[str]) -> Dict[str, Any]:
        """Analyze test file structure"""
        test_files = []
        test_directories = set()
        
        for file_path in files:
            path_lower = file_path.lower()
            if any(indicator in path_lower for indicator in ["test", "spec"]):
                test_files.append(file_path)
                test_dir = str(Path(file_path).parent)
                test_directories.add(test_dir)
        
        return {
            "test_files": test_files,
            "test_directories": list(test_directories),
            "has_tests": len(test_files) > 0,
            "test_coverage_estimate": min(100, len(test_files) * 20)  # Rough estimate
        }
    
    def _find_documentation_files(self, files: List[str]) -> List[str]:
        """Find documentation files"""
        doc_patterns = ["readme", "doc", "documentation", ".md", "changelog"]
        
        doc_files = []
        for file_path in files:
            file_name = Path(file_path).name.lower()
            if any(pattern in file_name for pattern in doc_patterns):
                doc_files.append(file_path)
        
        return doc_files
    
    def _estimate_file_complexity(self, file_path: str) -> str:
        """Estimate file complexity based on path and name"""
        path_lower = file_path.lower()
        
        # High complexity indicators
        if any(indicator in path_lower for indicator in [
            "algorithm", "engine", "core", "complex", "advanced"
        ]):
            return "high"
        
        # Low complexity indicators
        if any(indicator in path_lower for indicator in [
            "util", "helper", "simple", "basic", "config"
        ]):
            return "low"
        
        # Check file extension for complexity hints
        if file_path.endswith((".py", ".js", ".ts", ".java")):
            return "medium"
        elif file_path.endswith((".json", ".yaml", ".txt", ".md")):
            return "low"
        
        return "medium"
    
    def _identify_potential_issues(self, file_path: str, description: str) -> List[str]:
        """Identify potential issues based on file and problem description"""
        issues = []
        
        # Check for common problematic patterns
        if "test" in file_path.lower() and "bug" in description.lower():
            issues.append("May need test case updates")
        
        if file_path.endswith(".py") and "performance" in description.lower():
            issues.append("Consider algorithm efficiency")
        
        if "config" in file_path.lower() and "security" in description.lower():
            issues.append("Review security configurations")
        
        return issues
    
    def _generate_file_suggestions(self, file_path: str, description: str) -> List[str]:
        """Generate suggestions for file modification"""
        suggestions = []
        
        if file_path.endswith((".py", ".js", ".ts")):
            suggestions.append("Add comprehensive error handling")
            suggestions.append("Include input validation")
            suggestions.append("Add logging for debugging")
        
        if "test" in file_path.lower():
            suggestions.append("Cover edge cases")
            suggestions.append("Add performance tests if applicable")
        
        return suggestions
    
    def _identify_file_dependencies(self, file_path: str) -> List[str]:
        """Identify likely dependencies for a file"""
        dependencies = []
        
        # Based on common patterns
        if file_path.endswith(".py"):
            if "model" in file_path.lower():
                dependencies.extend(["database", "validation"])
            elif "view" in file_path.lower():
                dependencies.extend(["template", "form"])
            elif "test" in file_path.lower():
                dependencies.extend(["testing_framework", "fixtures"])
        
        return dependencies
    
    def _extract_functional_requirements(self, description: str) -> List[str]:
        """Extract functional requirements from description"""
        # Simple extraction - in production, use NLP
        requirements = []
        sentences = description.split('.')
        
        for sentence in sentences:
            sentence = sentence.strip()
            if any(word in sentence.lower() for word in [
                "must", "should", "shall", "will", "need to", "required to"
            ]):
                requirements.append(sentence)
        
        return requirements
    
    def _extract_non_functional_requirements(self, description: str, constraints: Dict) -> List[str]:
        """Extract non-functional requirements"""
        nf_requirements = []
        
        # Performance requirements
        if any(word in description.lower() for word in ["fast", "quick", "performance", "speed"]):
            nf_requirements.append("Performance optimization required")
        
        # Security requirements
        if any(word in description.lower() for word in ["secure", "security", "safe", "protect"]):
            nf_requirements.append("Security considerations required")
        
        # Scalability requirements
        if any(word in description.lower() for word in ["scale", "scalable", "large", "many users"]):
            nf_requirements.append("Scalability considerations required")
        
        # Add constraints as requirements
        for key, value in constraints.items():
            nf_requirements.append(f"{key}: {value}")
        
        return nf_requirements
    
    def _extract_test_requirements(self, description: str, test_cases: List[str]) -> List[str]:
        """Extract testing requirements"""
        test_reqs = []
        
        if test_cases:
            test_reqs.append(f"Must pass {len(test_cases)} existing test cases")
        
        if "test" in description.lower():
            test_reqs.append("Additional test cases may be required")
        
        return test_reqs
    
    def _extract_acceptance_criteria(self, description: str) -> List[str]:
        """Extract acceptance criteria from description"""
        criteria = []
        
        # Look for bullet points or numbered lists
        lines = description.split('\n')
        for line in lines:
            line = line.strip()
            if line.startswith(('-', '*', '•')) or re.match(r'^\d+\.', line):
                criteria.append(line)
        
        # If no explicit criteria, extract from "should" statements
        if not criteria:
            sentences = description.split('.')
            for sentence in sentences:
                if "should" in sentence.lower():
                    criteria.append(sentence.strip())
        
        return criteria
    
    def _extract_external_dependencies(self, file_path: str) -> List[str]:
        """Extract external dependencies based on file type"""
        # Simulate dependency extraction
        deps = []
        
        if file_path.endswith(".py"):
            deps.extend(["requests", "numpy", "pandas"])  # Common Python deps
        elif file_path.endswith(".js"):
            deps.extend(["axios", "lodash", "moment"])  # Common JS deps
        elif file_path.endswith(".ts"):
            deps.extend(["typescript", "@types/node"])  # Common TS deps
        
        return deps
    
    def _build_dependency_graph(self, internal_deps: Dict[str, List[str]]) -> Dict[str, Any]:
        """Build dependency graph from internal dependencies"""
        graph = {
            "nodes": list(internal_deps.keys()),
            "edges": []
        }
        
        for file_path, deps in internal_deps.items():
            for dep in deps:
                if dep in internal_deps:
                    graph["edges"].append({"from": file_path, "to": dep})
        
        return graph
    
    def _identify_critical_dependencies(self, internal_deps: Dict[str, List[str]]) -> List[str]:
        """Identify critical dependencies that many files depend on"""
        dependency_counts = {}
        
        for deps in internal_deps.values():
            for dep in deps:
                dependency_counts[dep] = dependency_counts.get(dep, 0) + 1
        
        # Critical dependencies are those used by multiple files
        critical = [dep for dep, count in dependency_counts.items() if count > 1]
        return critical
    
    def _estimate_completion_time(self, complexity_score: int) -> int:
        """Estimate completion time in minutes based on complexity"""
        base_time = 30  # 30 minutes base
        return base_time + (complexity_score * 2)  # 2 minutes per complexity point
    
    def _recommend_agent_types(self, complexity_factors: List[str]) -> List[str]:
        """Recommend agent types based on complexity factors"""
        agents = ["researcher"]  # Always include researcher
        
        if "many_files" in complexity_factors:
            agents.extend(["architect", "coder"])
        
        if "complex_requirements" in complexity_factors:
            agents.append("analyst")
        
        if "multiple_technologies" in complexity_factors:
            agents.extend(["coder", "tester"])
        
        # Always include reviewer for quality assurance
        agents.append("reviewer")
        
        return list(set(agents))  # Remove duplicates