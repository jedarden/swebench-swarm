"""
Tests for ResearcherAgent
"""
import pytest
import asyncio
from unittest.mock import Mock, AsyncMock

from src.agents.researcher_agent import ResearcherAgent
from src.models.types import WorkerConfig, TaskContext, SWEBenchProblem, AgentType


@pytest.fixture
def config():
    return WorkerConfig(
        agent_type=AgentType.RESEARCHER,
        coordinator_url="http://localhost:3000",
        claude_code_enabled=False  # Disable for testing
    )


@pytest.fixture
def researcher_agent(config):
    return ResearcherAgent(config)


@pytest.fixture
def test_problem():
    return SWEBenchProblem(
        id="test-001",
        description="Fix the sorting function to handle duplicate elements correctly. The function should maintain stable sort order.",
        files=["src/sort.py", "tests/test_sort.py"],
        test_cases=["test_basic_sort", "test_duplicates"],
        repository="https://github.com/test/repo",
        difficulty="medium"
    )


@pytest.fixture
def task_context(test_problem):
    return TaskContext(
        task_id="task-001",
        problem=test_problem,
        agent_type=AgentType.RESEARCHER
    )


class TestResearcherAgent:
    """Test cases for ResearcherAgent"""

    def test_initialization(self, researcher_agent):
        """Test agent initialization"""
        assert researcher_agent.agent.type == AgentType.RESEARCHER
        assert "analysis" in researcher_agent.agent.capabilities.domains
        assert researcher_agent.agent.status.value == "idle"

    @pytest.mark.asyncio
    async def test_execute_task_basic(self, researcher_agent, task_context):
        """Test basic task execution"""
        # Mock the HTTP client to avoid network calls
        researcher_agent.http_client = Mock()
        researcher_agent.http_client.post = AsyncMock()
        researcher_agent.http_client.delete = AsyncMock()
        researcher_agent.http_client.aclose = AsyncMock()

        result = await researcher_agent._execute_task_impl(task_context)
        
        assert isinstance(result, dict)
        assert "problem_analysis" in result
        assert "file_analysis" in result
        assert "requirements" in result
        assert "complexity_assessment" in result

    def test_keyword_extraction(self, researcher_agent):
        """Test keyword extraction from problem description"""
        description = "Fix the algorithm bug in the sorting function for performance optimization"
        keywords = researcher_agent._extract_keywords(description)
        
        assert "algorithm" in keywords
        assert "function" in keywords
        assert "performance" in keywords
        assert "optimization" in keywords

    def test_problem_type_identification(self, researcher_agent):
        """Test problem type identification"""
        bug_description = "Fix the bug in the sorting function"
        feature_description = "Add new search functionality to the application"
        optimization_description = "Optimize the performance of the database queries"
        
        assert researcher_agent._identify_problem_type(bug_description) == "bug_fix"
        assert researcher_agent._identify_problem_type(feature_description) == "feature_addition"
        assert researcher_agent._identify_problem_type(optimization_description) == "optimization"

    def test_technology_extraction(self, researcher_agent):
        """Test technology extraction from description"""
        description = "Fix the Python Django API endpoint for React frontend"
        technologies = researcher_agent._extract_technologies(description)
        
        assert "python" in technologies
        assert "django" in technologies
        assert "api" in technologies

    def test_language_detection(self, researcher_agent):
        """Test programming language detection from file paths"""
        assert researcher_agent._detect_file_language("src/main.py") == "python"
        assert researcher_agent._detect_file_language("src/app.js") == "javascript"
        assert researcher_agent._detect_file_language("src/component.ts") == "typescript"
        assert researcher_agent._detect_file_language("src/App.java") == "java"
        assert researcher_agent._detect_file_language("README.md") == "unknown"

    def test_complexity_estimation(self, researcher_agent, test_problem):
        """Test complexity estimation"""
        # Test with simple problem
        simple_problem = SWEBenchProblem(
            id="simple",
            description="Fix small bug",
            files=["main.py"],
            test_cases=["test_basic"],
            repository="repo",
            difficulty="easy"
        )
        
        complexity = researcher_agent._estimate_complexity(simple_problem)
        assert complexity == "low"
        
        # Test with complex problem
        complex_problem = SWEBenchProblem(
            id="complex",
            description="Implement complex algorithm",
            files=["a.py", "b.py", "c.py", "d.py", "e.py", "f.py"],
            test_cases=["test1", "test2"],
            repository="repo",
            difficulty="hard"
        )
        
        complexity = researcher_agent._estimate_complexity(complex_problem)
        assert complexity == "high"

    def test_file_complexity_estimation(self, researcher_agent):
        """Test file complexity estimation"""
        assert researcher_agent._estimate_file_complexity("src/algorithm.py") == "high"
        assert researcher_agent._estimate_file_complexity("src/utils.py") == "low"
        assert researcher_agent._estimate_file_complexity("src/main.py") == "medium"
        assert researcher_agent._estimate_file_complexity("config.json") == "low"

    def test_project_type_identification(self, researcher_agent):
        """Test project type identification"""
        web_files = ["index.html", "app.py", "package.json"]
        api_files = ["api/users.py", "routes/auth.py"]
        library_files = ["__init__.py", "setup.py", "src/core.py"]
        
        assert researcher_agent._identify_project_type(web_files) == "web_application"
        assert researcher_agent._identify_project_type(api_files) == "api"
        assert researcher_agent._identify_project_type(library_files) == "library"

    def test_functional_requirements_extraction(self, researcher_agent):
        """Test functional requirements extraction"""
        description = "The function must handle duplicates. It should maintain order. Will need to process large datasets."
        requirements = researcher_agent._extract_functional_requirements(description)
        
        assert len(requirements) > 0
        assert any("must handle duplicates" in req for req in requirements)

    def test_dependency_analysis(self, researcher_agent):
        """Test dependency analysis"""
        deps = researcher_agent._extract_external_dependencies("src/main.py")
        assert isinstance(deps, list)
        assert "requests" in deps  # Common Python dependency

    def test_completion_time_estimation(self, researcher_agent):
        """Test completion time estimation"""
        low_time = researcher_agent._estimate_completion_time(20)
        high_time = researcher_agent._estimate_completion_time(100)
        
        assert low_time < high_time
        assert low_time >= 30  # Minimum base time
        assert high_time > 100

    @pytest.mark.asyncio
    async def test_error_handling(self, researcher_agent, task_context):
        """Test error handling in task execution"""
        # Mock to raise an exception
        researcher_agent._analyze_problem_description = Mock(side_effect=Exception("Test error"))
        
        with pytest.raises(Exception):
            await researcher_agent._execute_task_impl(task_context)

    def test_action_word_extraction(self, researcher_agent):
        """Test extraction of action words"""
        description = "Fix the bug and implement new feature, then optimize performance"
        actions = researcher_agent._extract_action_words(description)
        
        assert "fix" in actions
        assert "implement" in actions
        assert "optimize" in actions

    def test_main_goal_extraction(self, researcher_agent):
        """Test main goal extraction"""
        description = "Fix the sorting algorithm bug. This is causing performance issues. Need to maintain stability."
        goal = researcher_agent._extract_main_goal(description)
        
        assert "Fix the sorting algorithm bug" in goal

    def test_configuration_file_detection(self, researcher_agent):
        """Test configuration file detection"""
        files = ["package.json", "requirements.txt", ".env", "Dockerfile", "src/main.py"]
        config_files = researcher_agent._find_configuration_files(files)
        
        assert "package.json" in config_files
        assert "requirements.txt" in config_files
        assert ".env" in config_files
        assert "Dockerfile" in config_files
        assert "src/main.py" not in config_files


@pytest.mark.integration
class TestResearcherAgentIntegration:
    """Integration tests for ResearcherAgent"""

    @pytest.mark.asyncio
    async def test_full_analysis_workflow(self, researcher_agent, task_context):
        """Test complete analysis workflow"""
        # Mock external dependencies
        researcher_agent.http_client = Mock()
        researcher_agent.http_client.post = AsyncMock()
        researcher_agent.http_client.delete = AsyncMock()
        researcher_agent.http_client.aclose = AsyncMock()

        result = await researcher_agent._execute_task_impl(task_context)
        
        # Verify all major components are present
        assert "problem_analysis" in result
        assert "repository_analysis" in result
        assert "file_analysis" in result
        assert "requirements" in result
        assert "dependencies" in result
        assert "complexity_assessment" in result
        assert "recommendations" in result
        assert "metadata" in result
        
        # Verify analysis quality
        problem_analysis = result["problem_analysis"]
        assert "keywords" in problem_analysis
        assert "problem_type" in problem_analysis
        assert len(problem_analysis["keywords"]) > 0
        
        complexity = result["complexity_assessment"]
        assert complexity["level"] in ["low", "medium", "high"]
        assert "score" in complexity
        assert "confidence" in complexity