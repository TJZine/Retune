# Spec Pack Changelog

All notable changes to the Retune spec pack will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.2] - 2026-01-03

### Fixed

- Phase 0 hard-gate compliance:
  - Removed legacy raw codes (NETWORK_ERROR, DECODE_ERROR, CHANNEL_EMPTY) in favor of existing canonical AppErrorCode values.
  - Removed `OrchestratorErrorCode` alias; orchestrator recovery APIs use `AppErrorCode` directly.
  - Updated implementation prompts to avoid external-file references per the prompt self-sufficiency grep gate.

## [1.0.1] - 2026-01-01

### Fixed

- **MINOR-001**: Added clarification that `isCurrent` in `ScheduledProgram` is computed at query time, not stored in schedule index
- **MINOR-002**: Expanded pagination test cases in P9-V2 (Plex Library) to cover edge cases:
  - Empty library (0 items)
  - Single item library
  - Last page with fewer items
  - Exact page boundary
- **MINOR-003**: Added timeout wrapper utility for progress reporting to enforce 100ms budget

### Added

- `spec-pack/CHANGELOG.md` (this file) per SUGGEST-001
- Per-module memory allocation table in platform constraints per SUGGEST-003

---

## [1.0.0] - 2025-12-31

### Added

- Initial spec pack with 11 required artifacts
- 12 module specifications
- 13 implementation prompts (including V2 rewrites)
- 12 context handoff documents
- 8 supplementary artifacts:
  - Platform constraints
  - Dependency visualization
  - Integration tests
  - Mock factories
  - Logging patterns
  - Plex API examples
  - Error messages catalog
  - Decisions log
- Orchestration infrastructure:
  - Gate check script
  - Escalation detector script
  - Progress dashboard script
  - Agent prompts (planning, coding, code-review)
  - Agent memory system

### Changed

- Removed legacy error taxonomy aliases; use `AppErrorCode` exclusively
- Removed original Prompts 7-11 (replaced by V2 versions)

---

## Review History

| Version | Date | Overall Score | Blocking | Major | Minor |
| :--- | :--- | :--- | :--- | :--- | :--- |
| v1 | 2026-01-01 | 94% → 97% | 0 | 0 | 4 → 0 |
