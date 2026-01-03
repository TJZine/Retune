# Issue Registry v1

## Summary

- Total issues: 16
- Blocking: 3
- Major: 6
- Minor: 3
- Suggestions: 4

---

## Blocking Issues

### BLOCK-001: Error Taxonomy Drift (Non-`AppErrorCode` Codes Used Throughout Specs)

- **Location**:
  - `spec-pack/modules/app-orchestrator.md:71` (separate `OrchestratorErrorCode` union)
  - `spec-pack/modules/video-player.md:160` (`NETWORK_ERROR`, `DECODE_ERROR`)
  - `spec-pack/modules/channel-manager.md:161` (`NETWORK_ERROR`, `CHANNEL_EMPTY`, `STORAGE_FULL`, etc.)
  - `spec-pack/artifact-4-integration-contracts.md:561` (error propagation matrix uses `NETWORK_ERROR`, `DECODE_ERROR`)
  - `spec-pack/artifact-7-implementation-prompts.md:210` (prompt uses `'NETWORK_ERROR'`)
- **Description**: The spec pack defines `AppErrorCode` as canonical (`spec-pack/artifact-2-shared-types.ts:107`), but many modules/contracts/prompts still use parallel string taxonomies.
- **Impact**: Coding agents cannot implement consistent recovery logic; cross-module error contracts become ambiguous; tests/assertions cannot be standardized.
- **Remediation**:
  1. Decide whether to (a) extend `AppErrorCode` to include all needed codes, or (b) map all non-canonical codes to existing values.
  2. Replace every error code mention in specs/contracts/prompts with `AppErrorCode.*`.
  3. Update all error matrices and test specs to assert on `AppErrorCode`.
- **Effort**: Medium

### BLOCK-002: Implementation Prompts Not Self-Sufficient Per Handoff Gate

- **Location**:
  - `spec-pack/artifact-7-implementation-prompts.md:6` (references `tsconfig.template.json`)
  - `spec-pack/artifact-7-implementation-prompts.md:2185` / `spec-pack/artifact-7-implementation-prompts.md:2236` (prompts 12/13 reference other spec-pack files instead of inlining)
- **Description**: Prompts include external-file references and omit required inline definitions for some modules, violating the “copy/paste sufficiency” requirement in the review prompt.
- **Impact**: Coding agent handoff is non-deterministic; agents must read other files to implement correctly, increasing drift risk.
- **Remediation**:
  - Inline all referenced interfaces/types/constants into each prompt.
  - Add “Verification Commands” to each prompt.
  - Remove “See …” and `spec-pack/...` references from prompts (or explicitly mark those prompts deprecated and exclude from canonical prompt set).
- **Effort**: Medium

### BLOCK-003: Orchestrator Dependencies Inconsistent Across Graph/Diagram/Spec

- **Location**:
  - `spec-pack/modules/app-orchestrator.md:9` (“Dependencies: All other modules”)
  - `spec-pack/module-interaction-architecture.md` (diagram shows orchestrator → all modules)
  - `spec-pack/artifact-1-dependency-graph.json` (`app-orchestrator.dependsOn` omits `plex-server-discovery`, `plex-stream-resolver`, `event-emitter`)
- **Description**: The dependency graph does not match the architectural diagrams or orchestrator module spec metadata.
- **Impact**: Incorrect implementation sequencing; orchestration docs and gate checks can allow invalid order; dependency enforcement becomes unreliable.
- **Remediation**: Choose the correct dependency model and update the other artifacts to match (graph + module spec metadata + diagram + integration contracts).
- **Effort**: Low/Medium

---

## Major Issues

### MAJOR-001: Mixed Content Handling Leaves Decision Criteria Ambiguous

- **Location**: `spec-pack/modules/plex-stream-resolver.md:182` and `spec-pack/modules/plex-stream-resolver.md:206`
- **Description**: Strategy includes “webOS may allow it” without deterministic selection criteria or explicit fallback ordering.
- **Impact**: Different implementations can make different choices, causing inconsistent playback behavior and hard-to-test outcomes.
- **Remediation**: Specify an ordered decision tree (e.g., prefer HTTPS > relay > explicit fail with `AppErrorCode.MIXED_CONTENT_BLOCKED`), including exact conditions and error outputs.
- **Effort**: Medium

### MAJOR-002: Codec Support Guidance Defers to External Docs Without Acceptance Criteria

- **Location**: `spec-pack/modules/plex-stream-resolver.md:625`
- **Description**: “Check webOS docs, test on device” is not a spec; it lacks an explicit supported codec matrix and deterministic behavior on unknown codecs.
- **Impact**: Implementers guess; tests cannot be authoritative.
- **Remediation**: Provide an explicit codec/container support table (or an explicit probing strategy) plus exact error codes/messages on unsupported media.
- **Effort**: Medium

### MAJOR-003: Dependency Metadata Not Machine-Readable in Module Specs

- **Location**: `spec-pack/modules/app-orchestrator.md:9` (“All other modules”), plus “None (foundational …)” strings in other specs
- **Description**: Dependency metadata cannot be reliably parsed/validated by tooling because it contains descriptive prose instead of module IDs.
- **Impact**: Automation (gate scripts, dashboards) can drift or require bespoke parsing.
- **Remediation**: Standardize metadata values to a comma-separated list of module IDs (or `none`), matching dependency graph IDs exactly.
- **Effort**: Low

### MAJOR-004: Orchestrator Error Handling Specifies Non-Canonical Union Type

- **Location**: `spec-pack/modules/app-orchestrator.md:71`
- **Description**: Orchestrator defines `OrchestratorErrorCode` separate from `AppErrorCode`.
- **Impact**: Central error handler becomes incompatible with shared error taxonomy; duplicated code paths.
- **Remediation**: Remove the union and use `AppErrorCode` exclusively, with a single recovery-action map keyed by `AppErrorCode`.
- **Effort**: Medium

### MAJOR-005: Some Prompt/Test Sections Use “Comment-Only” Tests (Missing Assertions)

- **Location**: Example: `spec-pack/artifact-7-implementation-prompts.md:2211` (prompt 12 minimal tests lack assertions)
- **Description**: Several test specs state intent but do not include explicit assertions or expected values.
- **Impact**: Implementers can satisfy tests ambiguously; CI value reduced.
- **Remediation**: Convert comment-only cases into explicit `expect(...)` assertions with concrete sample data.
- **Effort**: Medium

### MAJOR-006: Plex PIN Flow and Resources Endpoints Lack Verified Official Citation in Pack

- **Location**: `spec-pack/modules/plex-auth.md:21` and references across prompts/specs
- **Description**: Spec relies on `/api/v2/pins` and `/api/v2/resources`, but the Context7 Plex docs available during review did not return authoritative snippets for those endpoints.
- **Impact**: Risk of endpoint drift or wrong request format; implementers may “fill gaps”.
- **Remediation**: Embed canonical request/response examples + headers (preferably from Plex official docs) directly into the relevant module spec or into an explicitly designated SSOT appendix, and reference that appendix deterministically.
- **Effort**: Medium

---

## Minor Issues

### MINOR-001: `IPlexLibrary` Interface Ordering Drift Between Shared Types and Module Spec

- **Location**:
  - `spec-pack/artifact-2-shared-types.ts:1917`
  - `spec-pack/modules/plex-library.md:38`
- **Description**: Same method set, different ordering (e.g., `search()` position).
- **Impact**: Low; but can create confusion when humans diff specs.
- **Remediation**: Normalize ordering in module specs to match shared-types.
- **Effort**: Low

### MINOR-002: Fail-Fast Grep Pattern Requires PCRE2

- **Location**: Review prompt Phase 0.4 pattern uses look-ahead; `rg` needs `--pcre2`.
- **Impact**: Low, but impacts repeatability of Phase 0 execution.
- **Remediation**: Document `--pcre2` requirement in review instructions or update patterns to avoid look-around.
- **Effort**: Low

### MINOR-003: `Result<T,E>` Guidance Conflicts With Throw-Based Examples

- **Location**:
  - `spec-pack/artifact-2-shared-types.ts:14` (“Use this pattern … instead of throwing”)
  - Throw-based examples exist across module specs (e.g., `spec-pack/modules/video-player.md:204`)
- **Impact**: Medium confusion; implementers may mix patterns inconsistently.
- **Remediation**: Clarify when `Result` is required vs when throwing is acceptable for public interfaces.
- **Effort**: Low

---

## Suggestions

### SUGGEST-001: Add a Single “Error Codes SSOT” Artifact

- **Description**: Create a dedicated artifact enumerating `AppErrorCode` values, user-facing message strings, and recovery actions.
- **Value**: Prevents drift; makes it easy to gate-check for non-canonical codes.

### SUGGEST-002: Add an Automated Taxonomy Lint Script

- **Description**: Add a script to fail CI if any quoted/backticked ALLCAPS code appears outside `AppErrorCode`.
- **Value**: Keeps error codes canonical over time.

### SUGGEST-003: Add Prompt Self-Sufficiency Lint

- **Description**: Script checks prompts for `spec-pack/` references and missing “Verification Commands”.
- **Value**: Keeps prompts mechanically actionable for coding agents.

### SUGGEST-004: Add Event Flow Map Artifact

- **Description**: Generate a table of event → emitter → consumers → handler spec location.
- **Value**: Improves integration determinism and testability.

