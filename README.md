# SWE-Bench Swarm

A distributed system for running SWE-Bench evaluations using Claude Code with swarm coordination.

## Overview

SWE-Bench Swarm provides a scalable architecture for executing software engineering benchmark tasks across multiple agents coordinated through a swarm pattern. This system automates the process of pulling problems from SWE-Bench, solving them using AI agents, validating solutions, and tracking performance metrics.

## How It Works

### 1. Problem Retrieval
The system pulls problem instances from the SWE-Bench dataset, which contains real-world GitHub issues from popular Python repositories. Each problem includes:
- Repository information and specific commit hash
- Issue description and expected behavior
- Test cases that the solution must pass

### 2. Problem Solving Process
The swarm coordinator orchestrates multiple specialized agents:
- **Researcher Agent**: Analyzes the codebase and understands the problem context
- **Coder Agent**: Implements the solution based on research findings
- **Tester Agent**: Validates the implementation against test cases
- **Coordinator**: Manages agent collaboration and ensures solution quality

### 3. Solution Validation
Solutions are validated through:
- Running the original failing test cases
- Ensuring all tests pass after applying the patch
- Checking that no existing tests are broken
- Generating a patch file in the correct format

### 4. Score Updates
After successful validation:
- Performance metrics are collected (time taken, tokens used, etc.)
- Success rates are calculated and tracked
- Results are stored for leaderboard submission
- Detailed logs are maintained for analysis

## Architecture

- **Coordinator Service** (TypeScript/Node.js): Manages task distribution and agent coordination
- **Worker Agents** (Python): Execute individual SWE-Bench tasks with specialized roles
- **Docker Compose**: Orchestrates the distributed system
- **Claude-Flow Integration**: Provides neural coordination and memory persistence

## Quick Start

### One-Line Execution

Run SWE-Bench problems and submit results as a pull request:

```bash
# Run a random problem from SWE-Bench
curl -sSL https://raw.githubusercontent.com/jedarden/swebench-swarm/main/run-swebench.sh | bash

# Run a specific problem
curl -sSL https://raw.githubusercontent.com/jedarden/swebench-swarm/main/run-swebench.sh | bash -s -- <problem_id> <repo_name>
```

**Prerequisites**: Docker, Docker Compose, Git, GitHub CLI (`gh`), curl, and jq must be installed.

Examples:
```bash
# Random problem (automatically selected from SWE-Bench Lite)
curl -sSL https://raw.githubusercontent.com/jedarden/swebench-swarm/main/run-swebench.sh | bash

# Specific problem
curl -sSL https://raw.githubusercontent.com/jedarden/swebench-swarm/main/run-swebench.sh | bash -s -- django__django-12345 django/django
```

This command will:
1. Select a random problem from SWE-Bench Lite dataset (if no args provided)
2. Clone and set up SWE-Bench Swarm
3. Start the Docker services
4. Submit and solve the problem
5. Collect results and performance metrics
6. Fork the repository (if needed)
7. Create a pull request with prefix `results/`

### Manual Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/jedarden/swebench-swarm.git
   cd swebench-swarm
   ```

2. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

3. Start the services:
   ```bash
   cd implementation
   docker-compose up -d
   ```

4. The coordinator will be available at `http://localhost:3000`

5. Submit a SWE-Bench problem:
   ```bash
   curl -X POST http://localhost:3000/api/tasks \
     -H "Content-Type: application/json" \
     -d '{"problem_id": "django__django-12345", "repo": "django/django"}'
   ```

## Project Structure

```
implementation/
├── coordinator/          # TypeScript coordinator service
│   ├── src/
│   │   ├── services/    # Core coordination logic
│   │   ├── routes/      # API endpoints
│   │   └── types/       # TypeScript definitions
│   └── tests/           # Unit tests
├── worker/              # Python worker agents
│   ├── src/
│   │   ├── agents/      # Agent implementations
│   │   └── services/    # Integration services
│   └── tests/           # Python tests
└── docker-compose.yml   # Container orchestration
```

## API Endpoints

### Task Management
- `POST /api/tasks` - Submit a new SWE-Bench problem
- `GET /api/tasks/:id` - Get task status and results
- `GET /api/tasks/:id/logs` - View detailed execution logs

### Performance Monitoring
- `GET /api/performance/metrics` - View system performance metrics
- `GET /api/performance/report` - Generate performance report

### Swarm Control
- `GET /api/swarm/status` - Check swarm health
- `POST /api/swarm/scale` - Scale worker agents up/down

## Development

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for local development)
- Python 3.9+ (for local development)
- Claude-Flow MCP server (optional, for enhanced coordination)

### Running Tests

Coordinator tests:
```bash
cd implementation/coordinator
npm test
```

Worker tests:
```bash
cd implementation/worker
python -m pytest
```

### Performance Metrics

The system tracks:
- **Success Rate**: Percentage of problems solved correctly
- **Average Solve Time**: Time from problem submission to solution
- **Token Efficiency**: Tokens used per successful solution
- **Test Pass Rate**: Percentage of test cases passed

## Integration with SWE-Bench

This system is designed to work with the official SWE-Bench evaluation harness. Results can be submitted to the SWE-Bench leaderboard by:

1. Collecting results from `/api/performance/report`
2. Formatting according to SWE-Bench submission guidelines
3. Submitting through the official evaluation process

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details