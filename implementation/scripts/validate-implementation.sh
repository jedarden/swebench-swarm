#!/bin/bash

# SWE-Bench Swarm Implementation Validation Script
# Checks implementation completion and quality

echo "🔍 SWE-Bench Swarm Implementation Validation"
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMPL_DIR="$(dirname "$SCRIPT_DIR")"

# Initialize counters
TOTAL_CHECKS=0
PASSED_CHECKS=0

# Helper function to check file existence
check_file() {
    local file_path="$1"
    local description="$2"
    local is_critical="${3:-false}"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    if [ -f "$file_path" ]; then
        echo -e "${GREEN}✓${NC} $description"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        
        # Check if file has meaningful content (more than just comments/imports)
        local content_lines=$(grep -v '^\s*#\|^\s*//\|^\s*$\|^\s*import\|^\s*from' "$file_path" | wc -l)
        if [ "$content_lines" -lt 5 ] && [ "$is_critical" = "true" ]; then
            echo -e "${YELLOW}  ⚠ Warning: File appears to have minimal implementation${NC}"
        fi
    else
        if [ "$is_critical" = "true" ]; then
            echo -e "${RED}✗${NC} $description ${RED}(CRITICAL)${NC}"
        else
            echo -e "${YELLOW}⚠${NC} $description ${YELLOW}(MISSING)${NC}"
        fi
    fi
}

# Helper function to check directory existence
check_directory() {
    local dir_path="$1"
    local description="$2"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    if [ -d "$dir_path" ]; then
        echo -e "${GREEN}✓${NC} $description"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        echo -e "${RED}✗${NC} $description"
    fi
}

echo -e "\n${BLUE}1. Checking Project Structure${NC}"
echo "-----------------------------"

# Core directories
check_directory "$IMPL_DIR/coordinator" "Coordinator directory exists"
check_directory "$IMPL_DIR/worker" "Worker directory exists"
check_directory "$IMPL_DIR/tests" "Tests directory exists"
check_directory "$IMPL_DIR/scripts" "Scripts directory exists"

echo -e "\n${BLUE}2. Checking Coordinator Implementation${NC}"
echo "-------------------------------------"

# Coordinator package and config
check_file "$IMPL_DIR/coordinator/package.json" "Coordinator package.json" true
check_file "$IMPL_DIR/coordinator/tsconfig.json" "Coordinator TypeScript config" true
check_file "$IMPL_DIR/coordinator/Dockerfile" "Coordinator Dockerfile" true

# Coordinator source files
check_file "$IMPL_DIR/coordinator/src/index.ts" "Coordinator main entry point" true
check_file "$IMPL_DIR/coordinator/src/types/index.ts" "Coordinator type definitions" true
check_file "$IMPL_DIR/coordinator/src/services/SwarmCoordinator.ts" "SwarmCoordinator service" true
check_file "$IMPL_DIR/coordinator/src/services/TaskOrchestrator.ts" "TaskOrchestrator service" true
check_file "$IMPL_DIR/coordinator/src/services/AgentManager.ts" "AgentManager service" true
check_file "$IMPL_DIR/coordinator/src/services/ClaudeFlowIntegration.ts" "Claude-Flow integration" true
check_file "$IMPL_DIR/coordinator/src/services/PerformanceMonitor.ts" "Performance monitoring" false

# Coordinator routes and middleware
check_file "$IMPL_DIR/coordinator/src/routes/index.ts" "Route configuration" true
check_file "$IMPL_DIR/coordinator/src/routes/swarmRoutes.ts" "Swarm API routes" true
check_file "$IMPL_DIR/coordinator/src/middleware/errorHandler.ts" "Error handling middleware" false
check_file "$IMPL_DIR/coordinator/src/utils/Logger.ts" "Logging utility" true

# Coordinator tests
check_file "$IMPL_DIR/coordinator/tests/SwarmCoordinator.test.ts" "SwarmCoordinator tests" false

echo -e "\n${BLUE}3. Checking Worker Implementation${NC}"
echo "--------------------------------"

# Worker package and config
check_file "$IMPL_DIR/worker/requirements.txt" "Worker Python requirements" true
check_file "$IMPL_DIR/worker/Dockerfile" "Worker Dockerfile" true

# Worker source files
check_file "$IMPL_DIR/worker/src/models/types.py" "Worker type definitions" true
check_file "$IMPL_DIR/worker/src/agents/base_agent.py" "Base agent class" true
check_file "$IMPL_DIR/worker/src/agents/researcher_agent.py" "Researcher agent" true
check_file "$IMPL_DIR/worker/src/agents/coder_agent.py" "Coder agent" true
check_file "$IMPL_DIR/worker/src/agents/tester_agent.py" "Tester agent" true
check_file "$IMPL_DIR/worker/src/services/claude_code_integration.py" "Claude Code integration" true
check_file "$IMPL_DIR/worker/src/utils/logger.py" "Worker logging utility" true

# Worker tests
check_file "$IMPL_DIR/worker/tests/test_researcher_agent.py" "Researcher agent tests" false

echo -e "\n${BLUE}4. Checking Infrastructure & Deployment${NC}"
echo "--------------------------------------"

# Docker and deployment
check_file "$IMPL_DIR/docker-compose.yml" "Docker Compose configuration" true
check_file "$IMPL_DIR/coordinator/Dockerfile" "Coordinator Dockerfile" true
check_file "$IMPL_DIR/worker/Dockerfile" "Worker Dockerfile" true

# Scripts
check_file "$IMPL_DIR/scripts/validate-implementation.sh" "Validation script" false

echo -e "\n${BLUE}5. Checking Documentation${NC}"
echo "----------------------------"

# Documentation files
check_file "$IMPL_DIR/README.md" "Main README" false
check_file "$IMPL_DIR/01-tdd-strategy.md" "TDD Strategy document" false
check_file "$IMPL_DIR/02-component-specifications.md" "Component specifications" false

echo -e "\n${BLUE}6. Advanced Implementation Checks${NC}"
echo "----------------------------------"

# Check if TypeScript files have meaningful implementation
if [ -f "$IMPL_DIR/coordinator/src/services/SwarmCoordinator.ts" ]; then
    lines=$(wc -l < "$IMPL_DIR/coordinator/src/services/SwarmCoordinator.ts")
    if [ "$lines" -gt 100 ]; then
        echo -e "${GREEN}✓${NC} SwarmCoordinator has substantial implementation ($lines lines)"
        TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        echo -e "${YELLOW}⚠${NC} SwarmCoordinator implementation seems minimal ($lines lines)"
        TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    fi
fi

# Check if Python files have meaningful implementation
if [ -f "$IMPL_DIR/worker/src/agents/researcher_agent.py" ]; then
    lines=$(wc -l < "$IMPL_DIR/worker/src/agents/researcher_agent.py")
    if [ "$lines" -gt 100 ]; then
        echo -e "${GREEN}✓${NC} ResearcherAgent has substantial implementation ($lines lines)"
        TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        echo -e "${YELLOW}⚠${NC} ResearcherAgent implementation seems minimal ($lines lines)"
        TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    fi
fi

# Check for dependency configurations
if [ -f "$IMPL_DIR/coordinator/package.json" ]; then
    deps=$(grep -c '"' "$IMPL_DIR/coordinator/package.json" | head -1)
    if [ "$deps" -gt 20 ]; then
        echo -e "${GREEN}✓${NC} Coordinator has comprehensive dependencies"
        TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        echo -e "${YELLOW}⚠${NC} Coordinator dependencies may be incomplete"
        TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    fi
fi

if [ -f "$IMPL_DIR/worker/requirements.txt" ]; then
    deps=$(grep -v '^#' "$IMPL_DIR/worker/requirements.txt" | grep -v '^$' | wc -l)
    if [ "$deps" -gt 10 ]; then
        echo -e "${GREEN}✓${NC} Worker has comprehensive Python dependencies ($deps packages)"
        TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        echo -e "${YELLOW}⚠${NC} Worker dependencies may be incomplete ($deps packages)"
        TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    fi
fi

echo -e "\n${BLUE}7. Integration Checks${NC}"
echo "--------------------"

# Check for Claude-Flow integration points
if grep -r "claude.flow\|ClaudeFlow\|claude_flow" "$IMPL_DIR" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Claude-Flow integration references found"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    echo -e "${YELLOW}⚠${NC} Claude-Flow integration references not found"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
fi

# Check for SWE-Bench specific implementations
if grep -r "SWEBench\|swe.bench\|SWE-Bench" "$IMPL_DIR" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} SWE-Bench specific implementations found"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    echo -e "${RED}✗${NC} SWE-Bench specific implementations not found"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
fi

# Calculate completion percentage
if [ "$TOTAL_CHECKS" -gt 0 ]; then
    COMPLETION_PERCENT=$((PASSED_CHECKS * 100 / TOTAL_CHECKS))
else
    COMPLETION_PERCENT=0
fi

echo -e "\n${BLUE}8. Implementation Summary${NC}"
echo "========================"

echo -e "Total checks: $TOTAL_CHECKS"
echo -e "Passed checks: $PASSED_CHECKS"
echo -e "Failed checks: $((TOTAL_CHECKS - PASSED_CHECKS))"

if [ "$COMPLETION_PERCENT" -ge 80 ]; then
    echo -e "\n${GREEN}🎉 IMPLEMENTATION COMPLETE${NC}"
    echo -e "${GREEN}Completion rate: $COMPLETION_PERCENT%${NC}"
    echo -e "${GREEN}✓ Ready for deployment and testing${NC}"
elif [ "$COMPLETION_PERCENT" -ge 60 ]; then
    echo -e "\n${YELLOW}⚠ IMPLEMENTATION MOSTLY COMPLETE${NC}"
    echo -e "${YELLOW}Completion rate: $COMPLETION_PERCENT%${NC}"
    echo -e "${YELLOW}→ Some components need attention${NC}"
else
    echo -e "\n${RED}✗ IMPLEMENTATION INCOMPLETE${NC}"
    echo -e "${RED}Completion rate: $COMPLETION_PERCENT%${NC}"
    echo -e "${RED}→ Significant work remaining${NC}"
fi

echo -e "\n${BLUE}9. Next Steps${NC}"
echo "-------------"

if [ "$COMPLETION_PERCENT" -lt 80 ]; then
    echo "Priority items to complete:"
    echo "• Implement missing critical components"
    echo "• Add comprehensive test coverage"
    echo "• Complete integration tests"
    echo "• Finalize deployment configuration"
else
    echo "Recommended next steps:"
    echo "• Run integration tests"
    echo "• Deploy to staging environment"
    echo "• Conduct end-to-end testing"
    echo "• Performance benchmarking"
fi

echo -e "\n${BLUE}Validation complete!${NC}"
exit $((COMPLETION_PERCENT < 80 ? 1 : 0))