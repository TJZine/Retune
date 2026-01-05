#!/bin/bash
# escalation-detector.sh - Detect spec gaps vs code bugs in Coding Agent output
#
# Analyzes log files or stdout for patterns indicating spec gaps that should
# be escalated to Phase 1, vs code bugs that should be retried.
#
# Usage: 
#   ./scripts/escalation-detector.sh <log-file>
#   echo "error output" | ./scripts/escalation-detector.sh -
#
# Exit codes:
#   0 - No escalation needed (code bug or success)
#   1 - Escalation required (spec gap detected)
#   2 - Unable to determine

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_escalate() { echo -e "${RED}[ESCALATE]${NC} $1"; }
log_retry() { echo -e "${GREEN}[RETRY]${NC} $1"; }
log_info() { echo -e "${CYAN}[INFO]${NC} $1"; }

# Input handling
INPUT_FILE="${1:--}"
if [[ "$INPUT_FILE" == "-" ]]; then
    INPUT=$(cat)
else
    INPUT=$(cat "$INPUT_FILE")
fi

echo "=========================================="
echo "  Escalation Detector"
echo "=========================================="
echo ""

# -----------------------------------------------------------------------------
# SPEC GAP PATTERNS - These indicate escalation to Phase 1 is required
# -----------------------------------------------------------------------------
SPEC_GAP_PATTERNS=(
    # Type/definition issues
    "type '.*' is not defined"
    "cannot find name"
    "not defined in shared-types"
    "missing type definition"
    "type .* is referenced but not exported"
    
    # Ambiguity issues
    "ambiguous behavior"
    "unclear specification"
    "multiple valid interpretations"
    "not specified in spec"
    "spec does not specify"
    "unclear how to"
    "conflicting requirements"
    "contradiction in spec"
    
    # Explicit escalation markers
    "HALT.*escalate"
    "escalate to Phase 1"
    "cannot determine correct implementation"
    "requires clarification"
    "blocking on spec"
    
    # Missing information
    "error code not specified"
    "recovery strategy not defined"
    "algorithm not specified"
    "edge case not defined"
)

# -----------------------------------------------------------------------------
# CODE BUG PATTERNS - These indicate retry is appropriate
# -----------------------------------------------------------------------------
CODE_BUG_PATTERNS=(
    # TypeScript/compile errors
    "TS[0-9]+:"
    "Cannot find module"
    "is not assignable to type"
    "Property .* does not exist"
    "Expected [0-9]+ arguments"
    "Duplicate identifier"
    
    # Test failures
    "FAIL.*\.test\."
    "Expected:.*Received:"
    "expect\(.*\)\.to"
    "AssertionError"
    "Test Suites:.*failed"
    
    # Runtime errors
    "TypeError:"
    "ReferenceError:"
    "SyntaxError:"
    "Cannot read properties of"
    "is not a function"
    
    # Lint errors
    "ESLint"
    "Parsing error"
    "no-unused-vars"
    "@typescript-eslint"
)

# -----------------------------------------------------------------------------
# Pattern Matching
# -----------------------------------------------------------------------------
SPEC_GAPS_FOUND=0
CODE_BUGS_FOUND=0
MATCHES=()

log_info "Scanning for escalation patterns..."
echo ""

# Check for spec gap patterns
for pattern in "${SPEC_GAP_PATTERNS[@]}"; do
    if echo "$INPUT" | grep -qiE "$pattern"; then
        MATCHED_LINE=$(echo "$INPUT" | grep -iE "$pattern" | head -1)
        MATCHES+=("SPEC_GAP: $MATCHED_LINE")
        ((SPEC_GAPS_FOUND++))
    fi
done

# Check for code bug patterns
for pattern in "${CODE_BUG_PATTERNS[@]}"; do
    if echo "$INPUT" | grep -qiE "$pattern"; then
        MATCHED_LINE=$(echo "$INPUT" | grep -iE "$pattern" | head -1)
        MATCHES+=("CODE_BUG: $MATCHED_LINE")
        ((CODE_BUGS_FOUND++))
    fi
done

# -----------------------------------------------------------------------------
# Output Results
# -----------------------------------------------------------------------------
echo "Findings:"
echo "---------"

if [[ ${#MATCHES[@]} -eq 0 ]]; then
    log_info "No recognizable patterns found"
else
    for match in "${MATCHES[@]}"; do
        if [[ "$match" == SPEC_GAP:* ]]; then
            log_escalate "${match#SPEC_GAP: }"
        else
            log_retry "${match#CODE_BUG: }"
        fi
    done
fi

echo ""
echo "=========================================="
echo "  Summary"
echo "=========================================="
echo ""
echo "Spec Gap Patterns: $SPEC_GAPS_FOUND"
echo "Code Bug Patterns: $CODE_BUGS_FOUND"
echo ""

# -----------------------------------------------------------------------------
# Decision Logic
# -----------------------------------------------------------------------------
if [[ $SPEC_GAPS_FOUND -gt 0 ]]; then
    log_escalate "SPEC GAP DETECTED - Escalate to Phase 1"
    echo ""
    echo "Action Required:"
    echo "  1. Update implementation-state.json with status='blocked'"
    echo "  2. Create escalation report per planning-agent.md format"
    echo "  3. Do NOT retry without spec clarification"
    
    # Update implementation state if module ID provided
    if [[ -n "$MODULE_ID" ]] && [[ -f "spec-pack/artifact-10-implementation-state.json" ]]; then
        echo ""
        echo "Suggested state update:"
        echo "  jq '.modules[\"$MODULE_ID\"].status = \"blocked\"' spec-pack/artifact-10-implementation-state.json"
    fi
    
    exit 1
elif [[ $CODE_BUGS_FOUND -gt 0 ]]; then
    log_retry "CODE BUG DETECTED - Safe to retry"
    echo ""
    echo "Action Required:"
    echo "  1. Analyze specific errors above"
    echo "  2. Fix code issues"
    echo "  3. Re-run verification"
    exit 0
else
    log_info "UNABLE TO CLASSIFY - Manual review recommended"
    echo ""
    echo "The output didn't match known patterns."
    echo "Review manually to determine if this is a spec gap or code bug."
    exit 2
fi
