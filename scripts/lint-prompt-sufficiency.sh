#!/usr/bin/env bash
#
# lint-prompt-sufficiency.sh (SUGGEST-003)
# Checks implementation prompts for self-sufficiency violations
#
# Usage: ./scripts/lint-prompt-sufficiency.sh
#
# Exit codes:
#   0 - All prompts are self-sufficient
#   1 - External references or missing verification sections found
#
# Checks:
#   1. No "see X file" external references to spec-pack files
#   2. All prompts have tsconfig inlined (not referenced)
#   3. Verification commands section exists
#
set -euo pipefail

PROMPTS_FILE="${PROMPTS_FILE:-spec-pack/artifact-7-implementation-prompts.md}"

echo "🔍 Checking prompt self-sufficiency in $PROMPTS_FILE..."

VIOLATIONS=0

# Check 1: External file references like "See `spec-pack/...`"
echo "   Checking for external spec-pack references..."
EXTERNAL_REFS=$(grep -n 'See.*spec-pack/' "$PROMPTS_FILE" 2>/dev/null | head -10 || true)
if [ -n "$EXTERNAL_REFS" ]; then
  echo "❌ External spec-pack references found (should be inlined):"
  echo "$EXTERNAL_REFS"
  VIOLATIONS=1
fi

# Check 2: tsconfig.template.json reference (should be inlined)
echo "   Checking for tsconfig.template.json references..."
if grep -q 'tsconfig\.template\.json' "$PROMPTS_FILE" 2>/dev/null; then
  echo "❌ tsconfig.template.json reference found (should be inlined)"
  VIOLATIONS=1
fi

# Check 3: Verification Commands section exists
echo "   Checking for Verification Commands section..."
if ! grep -q 'Verification Commands' "$PROMPTS_FILE" 2>/dev/null; then
  echo "❌ Missing 'Verification Commands' section"
  VIOLATIONS=1
fi

# Check 4: Test assertions warning exists (MAJOR-005)
echo "   Checking for test assertions guidance..."
if ! grep -q 'MAJOR-005.*Test Assertions' "$PROMPTS_FILE" 2>/dev/null; then
  echo "❌ Missing MAJOR-005 test assertions guidance"
  VIOLATIONS=1
fi

if [ "$VIOLATIONS" -eq 1 ]; then
  echo ""
  echo "❌ FAIL: Prompt self-sufficiency violations detected"
  echo ""
  echo "Prompts must be fully self-contained for AI agents."
  echo "Inline all referenced types, configs, and add verification commands."
  exit 1
else
  echo "✅ PASS: All prompts appear self-sufficient"
  exit 0
fi
