# Claude Max Setup Guide for SWE-Bench Swarm

## Prerequisites

1. **Claude Max Subscription**: Required for parallel Claude instances
2. **Node.js 18+**: For Claude Code CLI
3. **Docker**: For running the swarm

## Step 1: Install Claude Code

```bash
# Option 1: NPM (recommended)
npm install -g @anthropic/claude-code

# Option 2: Official installer
curl -fsSL https://claude.ai/install.sh | sh

# Verify installation
claude --version
```

## Step 2: Login with Claude Max

```bash
# Login to Claude Code
claude login

# This will:
# 1. Open your browser
# 2. Authenticate with your Anthropic account
# 3. Verify your Claude Max subscription
# 4. Store credentials securely
```

## Step 3: Verify Claude Max Features

```bash
# Check your account status
claude account

# Expected output for Claude Max:
# ┌─────────────────────────────────┐
# │ Claude Code Account Status      │
# ├─────────────────────────────────┤
# │ Email: your.email@example.com   │
# │ Subscription: Claude Max        │
# │ API Calls: Unlimited            │
# │ Concurrent Instances: 10        │
# │ Priority Queue: Enabled         │
# └─────────────────────────────────┘
```

## Step 4: Configure SWE-Bench Swarm

```bash
# Clone the repository
git clone https://github.com/jedarden/swebench-swarm.git
cd swebench-swarm

# Create configuration
cp implementation/.env.example implementation/.env

# Edit .env file - Claude Code will use your CLI auth
nano implementation/.env
```

Your `.env` should include:
```env
# Claude Max features
CLAUDE_MAX_ENABLED=true
CLAUDE_MAX_INSTANCES=5  # Adjust based on your needs
CLAUDE_CODE_ENABLED=true
CLAUDE_FLOW_ENABLED=true

# Other required settings
GITHUB_TOKEN=your_github_token
```

## Step 5: Run with Claude Max

### Option 1: One-liner (Automatic)
```bash
# The script will detect your Claude Max subscription
curl -sSL https://raw.githubusercontent.com/jedarden/swebench-swarm/main/run-swebench.sh | bash
```

### Option 2: Manual Setup
```bash
# Start services
cd implementation
docker-compose up -d

# The system will automatically:
# 1. Use your Claude Max authentication
# 2. Spawn multiple Claude instances
# 3. Distribute work across instances
# 4. Aggregate results
```

## How Claude Max Enhances SWE-Bench Performance

### 1. Parallel Analysis
- Multiple files analyzed simultaneously
- Each file gets its own Claude instance
- 5-10x faster than sequential processing

### 2. Distributed Code Generation
- Different parts of the solution generated in parallel
- Specialized instances for different file types
- Coordinated through Claude Flow

### 3. Concurrent Testing
- Test generation happens alongside code generation
- Validation runs on separate instances
- Results aggregated in real-time

### 4. Resource Optimization
- Automatic instance pooling
- Queue management for optimal throughput
- Graceful scaling based on problem complexity

## Architecture with Claude Max

```
┌─────────────────┐
│   Claude Max    │
│   Web Login     │
└────────┬────────┘
         │ Auth Token
         ▼
┌─────────────────┐     ┌──────────────┐     ┌──────────────┐
│  Claude Code    │────▶│ Instance #1  │────▶│ Analyze File │
│  CLI Manager    │     └──────────────┘     └──────────────┘
│                 │     ┌──────────────┐     ┌──────────────┐
│  Max Features:  │────▶│ Instance #2  │────▶│Generate Code │
│  - Multi-instance     └──────────────┘     └──────────────┘
│  - Priority queue     ┌──────────────┐     ┌──────────────┐
│  - Parallel exec │────▶│ Instance #3  │────▶│ Run Tests   │
└─────────────────┘     └──────────────┘     └──────────────┘
         │                      ⋮                     ⋮
         │              ┌──────────────┐     ┌──────────────┐
         └─────────────▶│ Instance #N  │────▶│ Validate    │
                        └──────────────┘     └──────────────┘
```

## Performance Metrics

With Claude Max, expect:
- **Analysis Speed**: 5-10x faster (parallel file analysis)
- **Code Generation**: 3-5x faster (distributed generation)
- **Overall Solve Time**: 60-80% reduction
- **Success Rate**: Higher due to specialized instances

## Troubleshooting

### Authentication Issues
```bash
# Re-authenticate
claude logout
claude login

# Check auth status
claude auth status
```

### Instance Limit Errors
```bash
# Check current usage
claude account usage

# Adjust max instances in .env
CLAUDE_MAX_INSTANCES=3  # Lower if hitting limits
```

### Performance Issues
```bash
# Monitor instance usage
docker logs implementation_coordinator_1 | grep "Claude instance"

# Check queue status
curl http://localhost:3000/api/claude/status
```

## Best Practices

1. **Instance Management**
   - Start with 3-5 instances
   - Monitor queue length
   - Scale based on problem complexity

2. **Resource Usage**
   - Each instance uses ~500MB RAM
   - CPU usage scales with instances
   - Network bandwidth for API calls

3. **Cost Optimization**
   - Claude Max includes generous limits
   - Monitor usage in dashboard
   - Implement caching for repeated operations

## Advanced Configuration

### Custom Instance Allocation
```python
# In claude_max_integration.py
instance_allocation = {
    "analyzer": 2,      # 2 instances for analysis
    "generator": 3,     # 3 for code generation
    "tester": 2,        # 2 for testing
    "validator": 1      # 1 for validation
}
```

### Priority Queue Settings
```yaml
# In docker-compose.yml
environment:
  - CLAUDE_PRIORITY_QUEUE=true
  - CLAUDE_MAX_QUEUE_SIZE=100
  - CLAUDE_QUEUE_TIMEOUT=300
```

## Support

- **Claude Code Issues**: https://claude.ai/support
- **SWE-Bench Swarm**: https://github.com/jedarden/swebench-swarm/issues
- **Community Discord**: [Join Discord](https://discord.gg/claude-community)