# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records documenting key design decisions made during the Retune project specification phase. ADRs help future maintainers understand the rationale behind architectural choices.

## Index

| ID | Title | Status | Date |
|:---|:------|:-------|:-----|
| [ADR-001](0001-mulberry32-prng.md) | Mulberry32 PRNG for Shuffle | Accepted | 2024-12-31 |
| [ADR-002](0002-no-hls-js.md) | Native HLS Instead of HLS.js | Accepted | 2024-12-31 |
| [ADR-003](0003-virtualized-epg.md) | Virtualized EPG Rendering | Accepted | 2024-12-31 |
| [ADR-004](0004-localstorage-persistence.md) | localStorage for Persistence | Accepted | 2024-12-31 |

## ADR Format

Each ADR follows this structure:

```markdown
# ADR-XXX: Title

## Status
Accepted | Proposed | Deprecated | Superseded

## Context
The issue or force motivating this decision.

## Decision
The change we're proposing or have made.

## Consequences
What becomes easier or harder because of this change.

## Alternatives Considered
Other options evaluated and why they were rejected.
```
