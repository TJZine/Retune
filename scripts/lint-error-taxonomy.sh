#!/usr/bin/env bash
#
# lint-error-taxonomy.sh (SUGGEST-002)
# Detects non-canonical error codes in spec pack files
#
# Usage: ./scripts/lint-error-taxonomy.sh [--fix-check]
#
# Exit codes:
#   0 - All error codes are canonical (AppErrorCode)
#   1 - Non-canonical error codes found
#
# This script greps for common patterns of non-canonical error codes:
#   - Type unions with string literals that look like error codes
#   - Error code assignments not using AppErrorCode enum
#
set -euo pipefail

SPEC_PACK_DIR="${SPEC_PACK_DIR:-spec-pack}"
SHARED_TYPES_FILE="${SHARED_TYPES_FILE:-spec-pack/artifact-2-shared-types.ts}"
export SHARED_TYPES_FILE

echo "🔍 Checking for non-canonical error codes in $SPEC_PACK_DIR..."

node - <<'NODE'
const fs = require('fs');
const path = require('path');

const sharedPath = process.env.SHARED_TYPES_FILE || 'spec-pack/artifact-2-shared-types.ts';
const shared = fs.readFileSync(sharedPath, 'utf8');

// Extract AppErrorCode string values from the enum
const appErrorValues = new Set();
let inEnum = false;
for (const line of shared.split(/\r?\n/)) {
  if (/export enum AppErrorCode\b/.test(line)) inEnum = true;
  if (!inEnum) continue;
  const m = line.match(/=\s*'([A-Z0-9_]+)'/);
  if (m) appErrorValues.add(m[1]);
  if (/^\s*}\s*$/.test(line)) inEnum = false;
}

// Build corpus of spec docs where raw tokens tend to appear
const files = [];
const specDir = 'spec-pack/modules';
for (const f of fs.readdirSync(specDir)) if (f.endsWith('.md')) files.push(path.join(specDir, f));
files.push('spec-pack/artifact-4-integration-contracts.md', 'spec-pack/artifact-7-implementation-prompts.md');
const supplementsDir = 'spec-pack/supplements';
if (fs.existsSync(supplementsDir)) {
  for (const f of fs.readdirSync(supplementsDir)) files.push(path.join(supplementsDir, f));
}

const corpus = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');

// Extract quoted/backticked ALLCAPS tokens (common failure mode for raw error codes)
const found = new Set();
const re = /[`']([A-Z][A-Z0-9_]{2,})[`']/g;
let m;
while ((m = re.exec(corpus))) found.add(m[1]);

const nonCanonical = [...found].filter(x => !appErrorValues.has(x)).sort();

if (nonCanonical.length) {
  console.error('❌ FAIL: Non-canonical quoted/backticked tokens detected (expected 0):');
  console.error(nonCanonical.join('\n'));
  process.exit(1);
}

console.log('✅ PASS: No non-canonical quoted/backticked tokens detected');
NODE
