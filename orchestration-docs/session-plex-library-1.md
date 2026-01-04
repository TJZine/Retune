# Coding Session: Plex Library

## Session Metadata

| Field | Value |
| :--- | :--- |
| **Module ID** | plex-library |
| **Session ID** | phase2-plex-library-001 |
| **Planned** | 2026-01-04T14:58:00-05:00 |
| **Attempt** | 1 of 3 |
| **Planning Agent Version** | 1.0.0 |

---

## Pre-Flight Status

### Dependency Check

| Module | Required Status | Actual Status | Gate |
| :--- | :--- | :--- | :---: |
| plex-auth | `complete` | *check implementation-state.json* | ⏳ |
| plex-server-discovery | `complete` | *check implementation-state.json* | ⏳ |

### Gate Verification

- [ ] plex-auth marked `complete` in implementation-state.json
- [ ] plex-server-discovery marked `complete` in implementation-state.json
- [ ] Shared types compile: `npx tsc --noEmit`
- [x] Context handoff document accessible
- [ ] No unresolved blockers in implementation-state.json

**ALL GATES MUST PASS BEFORE PROCEEDING**

---

## Implementation Specification (SSOT)

> [!IMPORTANT]
> **READ ONLY — These documents are the source of truth. Do not modify.**

| Document | Location | Purpose |
| :--- | :--- | :--- |
| Implementation Prompt | [artifact-7-implementation-prompts.md#prompt-9-v2](../spec-pack/artifact-7-implementation-prompts.md#prompt-9-v2-plex-library-module) | Complete implementation spec |
| Context Handoff | [spec-pack/context-handoff/plex-library.md](../spec-pack/context-handoff/plex-library.md) | Scope, assumptions, verification |
| Module Spec | [spec-pack/modules/plex-library.md](../spec-pack/modules/plex-library.md) | Reference implementation |
| Shared Types | [artifact-2-shared-types.ts](../spec-pack/artifact-2-shared-types.ts) | `IPlexLibrary`, `PlexMediaItem`, `PlexLibrary` |

---

## Session Context

### Previous Attempts

*(First attempt — no previous attempts)*

### Blockers Cleared Since Last Attempt

- None

### Spec Updates Since Last Attempt

- None

---

## Key Implementation Notes

### Pagination

- Default page size: 100 items
- Use `X-Plex-Container-Start` and `X-Plex-Container-Size` headers
- Fetch all pages transparently for caller

### TV Show Hierarchy

```text
Shows: GET /library/sections/{id}/all?type=2
Seasons: GET /library/metadata/{showKey}/children
Episodes: GET /library/metadata/{seasonKey}/children
```

### Image URL Generation

```typescript
getImageUrl(imagePath: string, width?: number, height?: number): string {
  // Append X-Plex-Token to all image URLs
  // Use /photo/:/transcode for resizing
}
```

### Memory Budget

| Resource | Budget |
| :--- | :--- |
| Library cache | 2MB (5-min TTL, LRU eviction) |
| Pagination buffer | 1MB |
| Image URL cache | 50KB |
| **Total** | **~3MB** |

---

## Verification Protocol

Run these commands after implementation:

```bash
# Type check
npx tsc --noEmit

# Lint
npm run lint

# Module-specific tests
npm test -- --testPathPattern="PlexLibrary"
```

**All must pass before marking complete.**

---

## Failure Handling

| Failure Type | Indicator | Action | Escalation Target |
| :--- | :--- | :--- | :--- |
| Type error | `tsc` fails | Fix type mismatch | Self-fix |
| Test failure | `npm test` fails | Analyze assertion, fix code | Self-fix |
| Lint error | `npm run lint` fails | Apply lint fix | Self-fix |
| Missing type | Type referenced but not defined | HALT | → Planning Agent |
| Spec ambiguity | Multiple valid interpretations | HALT | → Phase 1 Review |
| Impossible assertion | Test requires unspecified behavior | HALT | → Phase 1 Review |

### On HALT

1. Update `implementation-state.json`:

   ```json
   {
     "plex-library": {
       "status": "blocked",
       "blockedReason": "[description]",
       "blockedAt": "[ISO timestamp]"
     }
   }
   ```

2. Create escalation report per `planning-agent.md` escalation format

---

## Deliverables

After successful implementation, provide:

1. **Implementation files** per spec structure
2. **Implementation report** per `coding-agent.md` output format
3. **Updated implementation-state.json**:

   ```json
   {
     "plex-library": {
       "status": "review",
       "completedAt": "[ISO timestamp]",
       "filesModified": [
         "src/modules/plex/library/PlexLibrary.ts",
         "src/modules/plex/library/ResponseParser.ts",
         "src/modules/plex/library/interfaces.ts",
         "src/modules/plex/library/types.ts",
         "src/modules/plex/library/constants.ts",
         "src/modules/plex/library/index.ts",
         "src/modules/plex/library/__tests__/PlexLibrary.test.ts",
         "src/modules/plex/library/__tests__/ResponseParser.test.ts"
       ],
       "implementedBy": "coding-agent",
       "sessionId": "phase2-plex-library-001"
     }
   }
   ```

---

## Quick Reference

### Files to Create

```text
src/modules/plex/library/
├── index.ts              # Public exports
├── PlexLibrary.ts        # Main class
├── ResponseParser.ts     # Plex response parsing
├── interfaces.ts         # IPlexLibrary interface
├── types.ts              # Library-specific types
├── constants.ts          # Page sizes, cache TTLs
└── __tests__/
    ├── PlexLibrary.test.ts
    └── ResponseParser.test.ts
```

### Code Style Reminders

- Explicit return types on all functions
- Maximum function length: 50 lines
- Maximum file length: 300 lines
- Use `_` prefix for private methods
- Use `I` prefix for interfaces
- JSDoc on all public methods
- **NO** optional chaining (`?.`) or nullish coalescing (`??`)
- Use explicit null checks: `if (data.summary !== undefined && data.summary !== null)`

---

*Session document version: 1.0.0*
