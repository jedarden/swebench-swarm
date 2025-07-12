# SWE-Bench Swarm

A distributed system for running SWE-Bench evaluations using Claude Code with swarm coordination.

## Overview

SWE-Bench Swarm provides a scalable architecture for executing software engineering benchmark tasks across multiple agents coordinated through a swarm pattern.

## Architecture

- **Coordinator Service** (TypeScript/Node.js): Manages task distribution and agent coordination
- **Worker Agents** (Python): Execute individual SWE-Bench tasks with specialized roles
- **Docker Compose**: Orchestrates the distributed system

## Quick Start

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/swebench-swarm.git
   cd swebench-swarm
   ```

2. Start the services:
   ```bash
   cd implementation
   docker-compose up -d
   ```

3. The coordinator will be available at `http://localhost:3000`

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

## Development

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for local development)
- Python 3.9+ (for local development)

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

## License

MIT License - see LICENSE file for details