#!/bin/bash
# progress-dashboard.sh - Display implementation progress from implementation-state.json
#
# Usage: ./scripts/progress-dashboard.sh
#
# Displays a visual overview of module implementation status

set -e

STATE_FILE="spec-pack/artifact-10-implementation-state.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m'

# Status icons
icon_pending="○"
icon_progress="◐"
icon_review="◑"
icon_complete="●"
icon_blocked="✗"

get_icon() {
    case "$1" in
        pending) echo -e "${GRAY}${icon_pending}${NC}" ;;
        in-progress) echo -e "${YELLOW}${icon_progress}${NC}" ;;
        review) echo -e "${BLUE}${icon_review}${NC}" ;;
        complete) echo -e "${GREEN}${icon_complete}${NC}" ;;
        blocked) echo -e "${RED}${icon_blocked}${NC}" ;;
        *) echo "?" ;;
    esac
}

if [[ ! -f "$STATE_FILE" ]]; then
    echo "Error: $STATE_FILE not found"
    exit 1
fi

# Header
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║              RETUNE IMPLEMENTATION PROGRESS                     ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Get phase info
CURRENT_PHASE=$(jq -r '.currentPhase' "$STATE_FILE")
TOTAL_PHASES=$(jq -r '.phases | length' "$STATE_FILE")

echo -e "Current Phase: ${CYAN}$CURRENT_PHASE${NC} of $TOTAL_PHASES"
echo ""

# Progress bar
TOTAL_MODULES=$(jq -r '.modules | length' "$STATE_FILE")
COMPLETE_MODULES=$(jq -r '[.modules[] | select(.status == "complete")] | length' "$STATE_FILE")
PROGRESS_PCT=$((COMPLETE_MODULES * 100 / TOTAL_MODULES))
PROGRESS_BAR_LEN=40
FILLED=$((PROGRESS_PCT * PROGRESS_BAR_LEN / 100))
EMPTY=$((PROGRESS_BAR_LEN - FILLED))

echo -n "Overall: ["
printf "${GREEN}%${FILLED}s${NC}" | tr ' ' '█'
printf "${GRAY}%${EMPTY}s${NC}" | tr ' ' '░'
echo -e "] ${PROGRESS_PCT}% ($COMPLETE_MODULES/$TOTAL_MODULES modules)"
echo ""

# Legend
echo "Legend: $(get_icon pending) Pending  $(get_icon in-progress) In Progress  $(get_icon review) In Review  $(get_icon complete) Complete  $(get_icon blocked) Blocked"
echo ""

# Phase breakdown
echo "─────────────────────────────────────────────────────────────────"
echo ""

for phase_num in $(jq -r '.phases | keys[]' "$STATE_FILE" | sort -n); do
    PHASE_NAME=$(jq -r ".phases[\"$phase_num\"].name" "$STATE_FILE")
    PHASE_MODULES=$(jq -r ".phases[\"$phase_num\"].modules[]" "$STATE_FILE")
    
    echo -e "${CYAN}Phase $phase_num: $PHASE_NAME${NC}"
    echo ""
    
    for module in $PHASE_MODULES; do
        STATUS=$(jq -r ".modules[\"$module\"].status" "$STATE_FILE")
        ICON=$(get_icon "$STATUS")
        LOC=$(jq -r ".modules[\"$module\"].estimatedLoC // \"?\"" "$STATE_FILE")
        BLOCKED_BY=$(jq -r ".modules[\"$module\"].blockedBy | if length > 0 then \"← \" + (. | join(\", \")) else \"\" end" "$STATE_FILE")
        BLOCKED_REASON=$(jq -r ".modules[\"$module\"].blockedReason // \"\"" "$STATE_FILE")
        
        # Format module name (pad to 25 chars)
        PADDED_MODULE=$(printf "%-22s" "$module")
        
        echo -e "  $ICON $PADDED_MODULE (~${LOC} LoC) ${GRAY}$BLOCKED_BY${NC}"
        
        if [[ -n "$BLOCKED_REASON" && "$BLOCKED_REASON" != "null" ]]; then
            echo -e "      ${RED}→ $BLOCKED_REASON${NC}"
        fi
    done
    echo ""
done

echo "─────────────────────────────────────────────────────────────────"

# Summary stats
IN_PROGRESS=$(jq -r '[.modules[] | select(.status == "in-progress")] | length' "$STATE_FILE")
IN_REVIEW=$(jq -r '[.modules[] | select(.status == "review")] | length' "$STATE_FILE")
BLOCKED=$(jq -r '[.modules[] | select(.status == "blocked")] | length' "$STATE_FILE")
PENDING=$((TOTAL_MODULES - COMPLETE_MODULES - IN_PROGRESS - IN_REVIEW - BLOCKED))

echo ""
echo "Summary:"
echo -e "  $(get_icon complete) Complete:    $COMPLETE_MODULES"
echo -e "  $(get_icon review) In Review:   $IN_REVIEW"
echo -e "  $(get_icon progress) In Progress: $IN_PROGRESS"
echo -e "  $(get_icon pending) Pending:     $PENDING"
echo -e "  $(get_icon blocked) Blocked:     $BLOCKED"
echo ""

# Estimate remaining
TOTAL_LOC=$(jq '[.modules[] | select(.status != "complete") | .estimatedLoC] | add' "$STATE_FILE")
echo -e "Estimated remaining: ${CYAN}~$TOTAL_LOC${NC} lines of code"
echo ""

# Last updated
LAST_UPDATED=$(jq -r '.lastUpdated' "$STATE_FILE")
echo -e "${GRAY}Last updated: $LAST_UPDATED${NC}"
echo ""
