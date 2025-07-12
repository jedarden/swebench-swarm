#!/bin/bash
# SWE-Bench Swarm Runner - One-line execution script

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Function to print status
status() {
    echo -e "${BLUE}[SWE-Bench]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    local missing=()
    
    command -v docker >/dev/null 2>&1 || missing+=("docker")
    command -v docker-compose >/dev/null 2>&1 || missing+=("docker-compose")
    command -v git >/dev/null 2>&1 || missing+=("git")
    command -v gh >/dev/null 2>&1 || missing+=("gh")
    command -v curl >/dev/null 2>&1 || missing+=("curl")
    command -v jq >/dev/null 2>&1 || missing+=("jq")
    
    if [ ${#missing[@]} -ne 0 ]; then
        echo -e "${YELLOW}Missing prerequisites: ${missing[*]}${NC}"
        echo "Please install them and try again."
        exit 1
    fi
    
    # Check GitHub CLI auth
    if ! gh auth status >/dev/null 2>&1; then
        echo -e "${YELLOW}GitHub CLI not authenticated. Running 'gh auth login'...${NC}"
        gh auth login
    fi
}

# Get random problem from SWE-Bench
get_random_problem() {
    status "Fetching random problem from SWE-Bench..."
    
    # Using SWE-Bench lite dataset for better success rates
    local DATASET_URL="https://raw.githubusercontent.com/princeton-nlp/SWE-bench/main/swebench/test_lite_300.json"
    
    # Download dataset and select random problem
    local PROBLEMS=$(curl -sL "$DATASET_URL" | jq -r '.[] | "\(.instance_id)|\(.repo)"')
    
    if [ -z "$PROBLEMS" ]; then
        echo -e "${YELLOW}Failed to fetch problems from SWE-Bench${NC}"
        exit 1
    fi
    
    # Count problems and select random one
    local PROBLEM_COUNT=$(echo "$PROBLEMS" | wc -l)
    local RANDOM_INDEX=$((RANDOM % PROBLEM_COUNT + 1))
    local SELECTED=$(echo "$PROBLEMS" | sed -n "${RANDOM_INDEX}p")
    
    # Parse problem ID and repo
    PROBLEM_ID=$(echo "$SELECTED" | cut -d'|' -f1)
    REPO_NAME=$(echo "$SELECTED" | cut -d'|' -f2)
    
    echo -e "${GREEN}Selected random problem: $PROBLEM_ID from $REPO_NAME${NC}"
}

# Main execution
main() {
    local PROBLEM_ID="${1:-}"
    local REPO_NAME="${2:-}"
    
    status "Checking prerequisites..."
    check_prerequisites
    
    # If no arguments provided, get random problem
    if [ -z "$PROBLEM_ID" ]; then
        get_random_problem
    elif [ -z "$REPO_NAME" ]; then
        echo "Usage: $0 [problem_id repo_name]"
        echo "Examples:"
        echo "  $0                    # Random problem"
        echo "  $0 django__django-12345 django/django  # Specific problem"
        exit 1
    fi
    
    # Setup working directory
    WORK_DIR="/tmp/swebench-swarm-$$"
    mkdir -p "$WORK_DIR"
    cd "$WORK_DIR"
    
    status "Cloning SWE-Bench Swarm..."
    git clone https://github.com/jedarden/swebench-swarm.git
    cd swebench-swarm
    
    # Create .env file
    status "Setting up environment..."
    cat > implementation/.env << EOF
PROBLEM_ID=$PROBLEM_ID
REPO_NAME=$REPO_NAME
CLAUDE_API_KEY=${CLAUDE_API_KEY:-}
GITHUB_TOKEN=$(gh auth token)
EOF
    
    # Start services
    status "Starting swarm services..."
    cd implementation
    docker-compose up -d
    
    # Wait for services to be ready
    status "Waiting for services to initialize..."
    sleep 10
    
    # Submit the problem
    status "Submitting problem: $PROBLEM_ID"
    TASK_RESPONSE=$(curl -s -X POST http://localhost:3000/api/tasks \
        -H "Content-Type: application/json" \
        -d "{\"problem_id\": \"$PROBLEM_ID\", \"repo\": \"$REPO_NAME\"}")
    
    TASK_ID=$(echo "$TASK_RESPONSE" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
    
    if [ -z "$TASK_ID" ]; then
        echo -e "${YELLOW}Failed to submit task. Response: $TASK_RESPONSE${NC}"
        docker-compose down
        exit 1
    fi
    
    status "Task submitted with ID: $TASK_ID"
    
    # Poll for completion
    status "Solving problem (this may take several minutes)..."
    while true; do
        STATUS_RESPONSE=$(curl -s http://localhost:3000/api/tasks/$TASK_ID)
        STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"status":"[^"]*' | cut -d'"' -f4)
        
        case "$STATUS" in
            "completed")
                echo -e "${GREEN}✓ Problem solved successfully!${NC}"
                break
                ;;
            "failed")
                echo -e "${YELLOW}✗ Problem solving failed${NC}"
                docker-compose down
                exit 1
                ;;
            *)
                echo -n "."
                sleep 5
                ;;
        esac
    done
    
    # Get results
    status "Collecting results..."
    RESULTS_DIR="results_${PROBLEM_ID}_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$RESULTS_DIR"
    
    # Download solution and logs
    curl -s http://localhost:3000/api/tasks/$TASK_ID > "$RESULTS_DIR/solution.json"
    curl -s http://localhost:3000/api/tasks/$TASK_ID/logs > "$RESULTS_DIR/execution.log"
    curl -s http://localhost:3000/api/performance/report > "$RESULTS_DIR/performance.json"
    
    # Generate patch file
    PATCH_FILE="$RESULTS_DIR/solution.patch"
    jq -r '.solution.patch' "$RESULTS_DIR/solution.json" > "$PATCH_FILE"
    
    # Stop services
    status "Stopping services..."
    docker-compose down
    
    # Fork repository if needed
    status "Preparing GitHub submission..."
    GITHUB_USER=$(gh api user -q .login)
    
    if ! gh repo view "$GITHUB_USER/swebench-swarm" >/dev/null 2>&1; then
        status "Forking repository..."
        gh repo fork jedarden/swebench-swarm --clone=false
    fi
    
    # Clone fork and create branch
    cd "$WORK_DIR"
    git clone "https://github.com/$GITHUB_USER/swebench-swarm.git" fork
    cd fork
    
    BRANCH_NAME="results/${PROBLEM_ID}_$(date +%Y%m%d_%H%M%S)"
    git checkout -b "$BRANCH_NAME"
    
    # Add results
    mkdir -p results
    cp -r "$WORK_DIR/swebench-swarm/$RESULTS_DIR" "results/"
    
    # Commit and push
    git add results/
    git commit -m "Add results for $PROBLEM_ID

Problem: $PROBLEM_ID
Repository: $REPO_NAME
Status: $(jq -r '.status' "$WORK_DIR/swebench-swarm/$RESULTS_DIR/solution.json")
Success: $(jq -r '.validation.all_tests_passed' "$WORK_DIR/swebench-swarm/$RESULTS_DIR/solution.json")
Time: $(jq -r '.metrics.total_time' "$WORK_DIR/swebench-swarm/$RESULTS_DIR/solution.json")
"
    
    git push origin "$BRANCH_NAME"
    
    # Create pull request
    status "Creating pull request..."
    PR_URL=$(gh pr create \
        --repo jedarden/swebench-swarm \
        --title "Results: $PROBLEM_ID" \
        --body "## SWE-Bench Results Submission

**Problem ID**: $PROBLEM_ID
**Repository**: $REPO_NAME
**Branch**: $BRANCH_NAME

### Summary
$(jq -r '.summary' "$WORK_DIR/swebench-swarm/$RESULTS_DIR/solution.json")

### Metrics
- **Success**: $(jq -r '.validation.all_tests_passed' "$WORK_DIR/swebench-swarm/$RESULTS_DIR/solution.json")
- **Time**: $(jq -r '.metrics.total_time' "$WORK_DIR/swebench-swarm/$RESULTS_DIR/solution.json")
- **Tokens**: $(jq -r '.metrics.tokens_used' "$WORK_DIR/swebench-swarm/$RESULTS_DIR/solution.json")

### Files
- 📄 \`solution.json\` - Complete solution details
- 📋 \`solution.patch\` - Git patch file
- 📊 \`performance.json\` - Performance metrics
- 📝 \`execution.log\` - Detailed execution logs
" \
        --head "$GITHUB_USER:$BRANCH_NAME")
    
    # Cleanup
    status "Cleaning up temporary files..."
    cd /
    rm -rf "$WORK_DIR"
    
    echo -e "${GREEN}✅ Success! Pull request created: $PR_URL${NC}"
}

# Run main function
main "$@"