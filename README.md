# SWE-Bench Swarm

Distributed swarm system for solving SWE-Bench problems using Claude Code with ruv-swarm and claude-flow MCP servers for coordination.

## 🚀 Overview

SWE-Bench Swarm creates new Claude Code instances for each SWE-Bench problem, providing the problem as context along with ruv-swarm and claude-flow MCP servers. This enables Claude Code to spawn multiple specialized agents that coordinate to solve complex software engineering problems.

## 🔧 How It Works

### 1. Problem Retrieval
- Fetches problems from the SWE-Bench dataset (300 problems from SWE-Bench Lite)
- Supports both specific problem IDs and random problem selection
- Caches problems locally for improved performance

### 2. Claude Code Problem Solving
- **Context Creation**: Formats the SWE-Bench problem as comprehensive context
- **MCP Integration**: Attaches ruv-swarm and claude-flow MCP servers
- **Agent Spawning**: Claude Code spawns specialized agents using swarm patterns
- **Coordination**: Agents coordinate through claude-flow memory and hooks
- **Solution Generation**: Multiple agents work together to create solutions

### 3. Solution Validation
- Applies the generated solution to the cloned repository
- Runs FAIL_TO_PASS tests to verify they now pass
- Ensures PASS_TO_PASS tests continue to pass (regression testing)
- Generates git patches and performance metrics

### 4. Results Submission
- Automatically creates pull requests with results
- Includes solution patches, logs, and performance metrics
- Tracks success rates and coordination effectiveness

## 🏗️ Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   SWE-Bench     │────▶│   Coordinator    │────▶│  Claude Code    │
│   Dataset       │     │   (TypeScript)   │     │   Instance      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                 │                         │
                                 ▼                         ▼
                        ┌──────────────────┐     ┌─────────────────┐
                        │ Problem Context  │     │ MCP Servers:    │
                        │ + Instructions   │     │ - claude-flow   │
                        │                  │     │ - ruv-swarm     │
                        └──────────────────┘     └─────────────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │ Swarm Agents:   │
                                                 │ - Researcher    │
                                                 │ - Coder         │
                                                 │ - Tester        │
                                                 │ - Coordinator   │
                                                 └─────────────────┘
```

### Key Components
- **Coordinator** (TypeScript/Node.js): Orchestrates problem submission to Claude Code
- **Claude Code**: Main AI engine that solves problems using swarm coordination
- **MCP Servers**: claude-flow and ruv-swarm provide coordination capabilities
- **SWE-Bench Integration**: Fetches problems, sets up repos, validates solutions

## ⚡ Quick Start

### One-Line Execution (Random Problem)
```bash
curl -sSL https://raw.githubusercontent.com/jedarden/swebench-swarm/main/run-swebench.sh | bash
```

### Specific Problem
```bash
./run-swebench.sh django__django-12345 django/django
```

### Prerequisites
- **Claude Max Subscription** (recommended for parallel execution)
- **Claude Code CLI** installed and authenticated
- **Docker & Docker Compose**
- **GitHub CLI** (`gh`) authenticated
- **Node.js 18+**

## 📋 Installation

### 1. Install Claude Code
```bash
# Install Claude Code CLI
npm install -g @anthropic/claude-code

# Authenticate (opens browser)
claude login
```

### 2. Verify Claude Max (Optional)
```bash
# Check subscription status
claude account

# Should show:
# Subscription: Claude Max
# Concurrent Instances: 10
```

### 3. Clone and Setup
```bash
git clone https://github.com/jedarden/swebench-swarm.git
cd swebench-swarm

# Configure environment
cp implementation/.env.example implementation/.env
# Edit .env with your GitHub token
```

### 4. Run
```bash
# Start services
cd implementation
docker-compose up -d

# Submit a problem (example)
curl -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{"problem_id": "django__django-12345", "repo": "django/django"}'
```

## 🔧 Configuration

### Environment Variables
```bash
# MCP Server Integration
CLAUDE_CODE_ENABLED=true
CLAUDE_FLOW_ENABLED=true

# Claude Max (for parallel execution)
CLAUDE_MAX_ENABLED=true
CLAUDE_MAX_INSTANCES=5

# GitHub Integration
GITHUB_TOKEN=your_github_token

# SWE-Bench Dataset
SWEBENCH_DATASET_URL=https://raw.githubusercontent.com/princeton-nlp/SWE-bench/main/swebench/test_lite_300.json
```

### Claude Code Spawning Process

For each SWE-Bench problem, the system:

1. **Fetches the problem** from SWE-Bench dataset
2. **Clones the repository** at the specified commit
3. **Creates problem context** with problem statement, hints, test info
4. **Spawns new Claude Code instance** with:
   - Problem context as input
   - ruv-swarm MCP server attached
   - claude-flow MCP server attached
   - Instructions to use swarm patterns
5. **Claude Code spawns agents** using Task tool and swarm coordination
6. **Agents coordinate** through claude-flow memory and hooks
7. **Solution is generated** and validated against tests

## 📊 API Endpoints

### Submit SWE-Bench Problem
```bash
POST /api/submit
{
  "problem_id": "django__django-12345",
  "repo": "django/django",
  "analysis": {}  # Optional Claude Code analysis
}
```

### Check Task Status
```bash
GET /api/v1/tasks/{task_id}
```

### Get Random Problem
```bash
POST /api/swebench/problems/random
```

### List SWE-Bench Tasks
```bash
GET /api/swebench/tasks
```

## 🎯 Performance

With Claude Max subscription:
- **Parallel Execution**: Multiple Claude Code instances
- **Faster Analysis**: Concurrent file processing
- **Better Coordination**: Swarm memory and neural patterns
- **Success Rate**: Higher through specialized agent coordination

## 📈 Results Format

Results are automatically submitted as pull requests:

```
results/
└── problem_id_timestamp/
    ├── solution.json      # Complete solution with validation
    ├── solution.patch     # Git diff patch
    ├── performance.json   # Metrics and timing
    └── execution.log      # Detailed Claude Code logs
```

### Solution JSON Structure
```json
{
  "problem_id": "django__django-12345",
  "success": true,
  "patch": "diff --git a/...",
  "validation": {
    "passed_tests": ["test1", "test2"],
    "failed_tests": [],
    "all_tests_passed": true
  },
  "metrics": {
    "tokensUsed": 15420,
    "timeElapsed": 245000,
    "agentsSpawned": 4
  }
}
```

## 🤝 Contributing

1. Fork the repository
2. Test with your Claude Code setup
3. Submit problems and solutions
4. Results automatically become pull requests

## 📄 License

MIT License - see LICENSE file for details.

---

**Note**: This system requires Claude Code with MCP server support. The actual problem-solving is performed by Claude Code instances using swarm coordination patterns provided by ruv-swarm and claude-flow MCP servers.