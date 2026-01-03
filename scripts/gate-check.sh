#!/bin/bash
# gate-check.sh - Pre-flight validation for Coding Agent sessions
#
# Run before each module implementation to verify all dependencies are met.
# Usage: ./scripts/gate-check.sh <module-id>
#
# Exit codes:
#   0 - All gates passed, safe to proceed
#   1 - Gate check failed, do not proceed

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

MODULE_ID="${1:-}"
STATE_FILE="spec-pack/artifact-10-implementation-state.json"

log_pass() { echo -e "${GREEN}✓${NC} $1"; }
log_fail() { echo -e "${RED}✗${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_info() { echo -e "  $1"; }

echo "=========================================="
echo "  Gate Check: Pre-Flight Validation"
echo "=========================================="
echo ""

# Track overall status
GATES_PASSED=0
GATES_FAILED=0

#---------------------------------------
# Gate 1: Implementation state file exists
#---------------------------------------
echo "Gate 1: Implementation State File"
if [[ -f "$STATE_FILE" ]]; then
    log_pass "Found $STATE_FILE"
    ((GATES_PASSED++))
else
    log_fail "Missing $STATE_FILE"
    log_info "Create the implementation state file before proceeding."
    ((GATES_FAILED++))
fi

#---------------------------------------
# Gate 2: Module ID validation
#---------------------------------------
echo ""
echo "Gate 2: Module Identification"
if [[ -z "$MODULE_ID" ]]; then
    log_warn "No module ID provided, running general checks only"
else
    if jq -e ".modules[\"$MODULE_ID\"]" "$STATE_FILE" > /dev/null 2>&1; then
        log_pass "Module '$MODULE_ID' found in state file"
        ((GATES_PASSED++))
        
        # Check module status
        STATUS=$(jq -r ".modules[\"$MODULE_ID\"].status" "$STATE_FILE")
        if [[ "$STATUS" == "blocked" ]]; then
            REASON=$(jq -r ".modules[\"$MODULE_ID\"].blockedReason // \"Unknown\"" "$STATE_FILE")
            log_fail "Module is BLOCKED: $REASON"
            ((GATES_FAILED++))
        elif [[ "$STATUS" == "complete" ]]; then
            log_warn "Module already marked complete"
        else
            log_pass "Module status: $STATUS"
        fi
    else
        log_fail "Module '$MODULE_ID' not found in state file"
        ((GATES_FAILED++))
    fi
fi

#---------------------------------------
# Gate 3: Dependency check
#---------------------------------------
echo ""
echo "Gate 3: Dependency Verification"
if [[ -n "$MODULE_ID" ]] && [[ -f "$STATE_FILE" ]]; then
    DEPS=$(jq -r ".modules[\"$MODULE_ID\"].blockedBy // [] | .[]" "$STATE_FILE" 2>/dev/null)
    
    if [[ -z "$DEPS" ]]; then
        log_pass "No dependencies for this module"
        ((GATES_PASSED++))
    else
        DEP_FAILED=0
        for DEP in $DEPS; do
            DEP_STATUS=$(jq -r ".modules[\"$DEP\"].status // \"unknown\"" "$STATE_FILE")
            if [[ "$DEP_STATUS" == "complete" ]]; then
                log_pass "Dependency '$DEP' is complete"
            else
                log_fail "Dependency '$DEP' is not complete (status: $DEP_STATUS)"
                ((DEP_FAILED++))
            fi
        done
        
        if [[ $DEP_FAILED -eq 0 ]]; then
            ((GATES_PASSED++))
        else
            ((GATES_FAILED++))
        fi
    fi
else
    log_warn "Skipping dependency check (no module specified)"
fi

#---------------------------------------
# Gate 4: Shared types compile
#---------------------------------------
echo ""
echo "Gate 4: Shared Types Compilation"
if [[ -f "src/types/index.ts" ]]; then
    if npx tsc --noEmit src/types/index.ts 2>/dev/null; then
        log_pass "Shared types compile successfully"
        ((GATES_PASSED++))
    else
        log_fail "Shared types compilation failed"
        log_info "Run: npx tsc --noEmit src/types/index.ts"
        ((GATES_FAILED++))
    fi
elif [[ -f "spec-pack/artifact-2-shared-types.ts" ]]; then
    log_warn "Using spec-pack types (not yet in src/)"
    ((GATES_PASSED++))
else
    log_fail "No shared types file found"
    ((GATES_FAILED++))
fi

#---------------------------------------
# Gate 5: Context handoff exists
#---------------------------------------
echo ""
echo "Gate 5: Context Handoff Document"
if [[ -n "$MODULE_ID" ]]; then
    HANDOFF_FILE="context-handoff/$MODULE_ID.md"
    if [[ -f "$HANDOFF_FILE" ]]; then
        log_pass "Found $HANDOFF_FILE"
        ((GATES_PASSED++))
    else
        log_fail "No context handoff for '$MODULE_ID'"
        ((GATES_FAILED++))
    fi
else
    log_warn "Skipping context check (no module specified)"
fi

#---------------------------------------
# Gate 6: Orchestration document exists
#---------------------------------------
echo ""
echo "Gate 6: Orchestration Document"
if [[ -n "$MODULE_ID" ]]; then
    ORCH_PATTERN="orchestration-docs/session-${MODULE_ID}-*.md"
    ORCH_FILES=$(ls $ORCH_PATTERN 2>/dev/null | tail -1)
    
    if [[ -n "$ORCH_FILES" ]]; then
        log_pass "Found orchestration doc: $ORCH_FILES"
        ((GATES_PASSED++))
    else
        log_fail "No orchestration document for '$MODULE_ID'"
        log_info "Create: orchestration-docs/session-${MODULE_ID}-1.md"
        ((GATES_FAILED++))
    fi
else
    log_warn "Skipping orchestration check (no module specified)"
fi

#---------------------------------------
# Summary
#---------------------------------------
echo ""
echo "=========================================="
echo "  Summary"
echo "=========================================="
echo ""
log_info "Gates Passed: $GATES_PASSED"
log_info "Gates Failed: $GATES_FAILED"
echo ""

if [[ $GATES_FAILED -gt 0 ]]; then
    log_fail "PRE-FLIGHT CHECK FAILED"
    echo ""
    echo "Resolve the above issues before proceeding with implementation."
    exit 1
else
    log_pass "ALL GATES PASSED"
    echo ""
    echo "Safe to proceed with Coding Agent."
    exit 0
fi
