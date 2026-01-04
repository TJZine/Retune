# Coding Session: Plex Stream Resolver

## Session Metadata

| Field | Value |
| :--- | :--- |
| **Module ID** | plex-stream-resolver |
| **Session ID** | phase2-plex-stream-resolver-001 |
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
| Implementation Prompt | [artifact-7-implementation-prompts.md#prompt-10-v2](../spec-pack/artifact-7-implementation-prompts.md#prompt-10-v2-plex-stream-resolver-module) | Complete implementation spec |
| Context Handoff | [spec-pack/context-handoff/plex-stream-resolver.md](../spec-pack/context-handoff/plex-stream-resolver.md) | Scope, assumptions, verification |
| Module Spec | [spec-pack/modules/plex-stream-resolver.md](../spec-pack/modules/plex-stream-resolver.md) | Reference implementation |
| Shared Types | [artifact-2-shared-types.ts](../spec-pack/artifact-2-shared-types.ts) | `IPlexStreamResolver`, `StreamRequest`, `StreamDecision` |

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

### webOS Codec Support (AUTHORITATIVE)

> [!IMPORTANT]
> Use this table for direct play decisions. Do NOT defer to external documentation.

| Container | Video Codec | Audio Codec | Direct Play |
| :--- | :--- | :--- | :---: |
| MP4 | H.264 (AVC) | AAC | ✅ |
| MP4 | H.265 (HEVC) | AAC | ✅ |
| MKV | H.264/H.265 | AAC/AC3/EAC3 | ✅ |
| MKV | H.264 | DTS | ❌ (transcode audio) |
| AVI/WMV | Any | Any | ❌ |
| Any | VP9/AV1/MPEG-2 | Any | ❌ |

### Mixed Content Handling

> [!WARNING]
> webOS HTTPS apps WILL block HTTP connections.

**Decision Tree:**

1. App HTTPS + Server HTTP? → Try HTTPS connection
2. No HTTPS available? → Try Plex relay
3. No relay? → Throw `MIXED_CONTENT_BLOCKED`

### Session Management

- Generate unique UUID per playback session
- Report progress every 10 seconds during playback
- Always call `endSession()` on playback stop or error

### Transcode URL

```
GET /video/:/transcode/universal/start.m3u8
  ?path=/library/metadata/{key}
  &protocol=hls
  &X-Plex-Token={token}
  &X-Plex-Client-Identifier={clientId}
  &X-Plex-Platform=webOS
```

---

## Verification Protocol

Run these commands after implementation:

```bash
# Type check
npx tsc --noEmit

# Lint
npm run lint

# Module-specific tests
npm test -- --testPathPattern="PlexStreamResolver"
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
     "plex-stream-resolver": {
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
     "plex-stream-resolver": {
       "status": "review",
       "completedAt": "[ISO timestamp]",
       "filesModified": [
         "src/modules/plex/stream/PlexStreamResolver.ts",
         "src/modules/plex/stream/interfaces.ts",
         "src/modules/plex/stream/types.ts",
         "src/modules/plex/stream/utils.ts",
         "src/modules/plex/stream/constants.ts",
         "src/modules/plex/stream/index.ts",
         "src/modules/plex/stream/__tests__/PlexStreamResolver.test.ts"
       ],
       "implementedBy": "coding-agent",
       "sessionId": "phase2-plex-stream-resolver-001"
     }
   }
   ```

---

## Quick Reference

### Files to Create

```text
src/modules/plex/stream/
├── index.ts                  # Public exports
├── PlexStreamResolver.ts     # Main class
├── interfaces.ts             # IPlexStreamResolver
├── types.ts                  # StreamRequest, StreamDecision
├── utils.ts                  # getMimeType helper
├── constants.ts              # Supported codecs, defaults
└── __tests__/
    └── PlexStreamResolver.test.ts
```

### getMimeType Utility

```typescript
// Must be implemented in src/modules/plex/stream/utils.ts
export function getMimeType(protocol: 'hls' | 'dash' | 'direct' | 'http'): string {
  const mimeTypes: Record<string, string> = {
    hls: 'application/x-mpegURL',
    dash: 'application/dash+xml',
    direct: 'video/mp4',
    http: 'video/mp4',
  };
  const result = mimeTypes[protocol];
  if (result === undefined) {
    return 'video/mp4';
  }
  return result;
}
```

### Code Style Reminders

- Explicit return types on all functions
- Maximum function length: 50 lines
- Maximum file length: 300 lines
- Use `_` prefix for private methods
- Use `I` prefix for interfaces
- JSDoc on all public methods
- **NO** optional chaining (`?.`) or nullish coalescing (`??`)

---

*Session document version: 1.0.0*
