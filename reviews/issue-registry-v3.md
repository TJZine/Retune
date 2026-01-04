# Issue Registry v3

## Summary

- **Total issues**: 5
- **Blocking**: 0
- **Major**: 0
- **Minor**: 2
- **Suggestions**: 3

---

## Blocking Issues

*None — all blocking issues from v1 have been resolved.*

---

## Major Issues

*None — all major issues from v1 have been resolved.*

---

## Minor Issues

### MINOR-001: Implementation State Version Drift

- **Location**: `spec-pack/artifact-10-implementation-state.json:4`
- **Current**: `"specPackVersion": "1.0.0"`
- **Expected**: `"specPackVersion": "1.0.2"`
- **Impact**: Low — cosmetic version mismatch between implementation state and spec pack
- **Fix Required**: Update line 4 to `"specPackVersion": "1.0.2"`
- **Effort**: Low (< 1 minute)

### MINOR-002: Stale lastUpdated Timestamp

- **Location**: `spec-pack/artifact-10-implementation-state.json:3`
- **Current**: `"lastUpdated": "2025-12-31T08:56:00.000Z"`
- **Issue**: Timestamp predates the 1.0.2 spec pack updates
- **Impact**: Low — informational only
- **Fix Required**: Update timestamp when implementation begins
- **Effort**: Low (< 1 minute)

---

## Suggestions

### SUGGEST-001: Add Code Style Linter Configuration

- **Description**: Consider adding ESLint/Prettier config to the spec-pack or repo root
- **Rationale**: Ensures consistent code style across modules during implementation
- **Files to Add**:
  - `.eslintrc.json`
  - `.prettierrc`
- **Effort**: Medium

### SUGGEST-002: Browser Agent Memory Template Enhancement

- **Location**: `spec-pack/artifact-11-agent-memory-template.md`
- **Description**: Add section for browser-specific debugging notes
- **Suggested Content**:

  ```markdown
  ## webOS Debugging Notes
  
  - Developer Mode connection URL: [...]
  - Remote DevTools session ID: [...]
  - Common webOS-specific issues encountered: [...]
  ```

- **Effort**: Low

### SUGGEST-003: Performance Baseline Script

- **Description**: Add automated performance budget check script
- **Rationale**: `artifact-8-verification-checklist.md` defines performance budgets but no automated enforcement
- **Suggested Script**: `scripts/perf-baseline.sh`

  ```bash
  #!/bin/bash
  # Run performance tests and compare against budgets
  npm run test:perf -- --reporter=json > perf-results.json
  # Compare against budgets in artifact-8
  ```

- **Effort**: Medium

---

## Resolution Status (v1 → v3)

### All v1 Issues Resolved ✅

| Issue ID | Description | Resolution |
| :--- | :--- | :--- |
| BLOCK-001 | Non-canonical error codes | AppErrorCode enum canonicalized |
| BLOCK-002 | Missing verification commands | Added to all 13 prompts |
| BLOCK-003 | Dependency metadata format | Corrected across all module specs |
| BLOCK-004 | OrchestratorErrorCode type | Removed (using canonical AppErrorCode) |
| MAJOR-001 | Missing CI/CD workflow | Created `.github/workflows/ci.yml` |
| MAJOR-002 | EPG virtualization not specified | Detailed pseudocode added |
| MAJOR-003 | Ambiguous language ("typically") | Removed/clarified |
| MAJOR-004 | Mock factories incomplete | Enhanced in `artifact-15-mock-factories.ts` |
| MAJOR-005 | Skeleton tests without assertions | All tests have explicit `expect()` calls |
| MAJOR-006 | Plex endpoint citations missing | SSOT created in `artifact-9-plex-api-examples.md` |
| MINOR-001 | Inconsistent version refs | Normalized to 1.0.2 |
| MINOR-002 | Review command pcre2 dependency | Documented |
| MINOR-003 | Result<T,E> usage unclear | Usage policy added to shared-types |
| MINOR-004 | Implementation state fields | Extended fields added |
| SUGGEST-001 | Error message SSOT | Created `supplements/error-messages.ts` |
| SUGGEST-002 | Taxonomy lint script | Created `scripts/lint-error-taxonomy.sh` |
| SUGGEST-003 | Prompt lint script | Created `scripts/lint-prompt-sufficiency.sh` |
| SUGGEST-004 | Event flow map | Created `artifact-17-event-flow-map.md` |

---

## Handoff Readiness

**Status**: ✅ READY FOR IMPLEMENTATION

The 2 remaining minor issues are cosmetic and can be addressed during the first implementation session. No blocking or major issues remain.
