# Agent Memory Template

This document defines the agent memory structure for persisting context across coding sessions.

> **Source**: This is Artifact 11 per `opus_spec_plan.md` requirements.

---

## Directory Structure

```
agent-memory/
├── coding-agent/
│   ├── event-emitter.md
│   ├── plex-auth.md
│   └── [module-id].md
├── planning-agent/
│   └── phase-[N]-planning.md
└── sessions/
    └── session-[uuid].json
```

---

## Session Log Format

After each Coding Agent session, create `agent-memory/coding-agent/[module-id].md`:

```markdown
# Agent Memory: [Module Name]

## Session History

### Session [N]: [ISO Timestamp]

**Status**: [complete | failed | blocked]
**Attempt**: [N] of 3
**Duration**: [minutes]

#### Decisions Made (within spec boundaries)
- [Decision with rationale]
- [Another decision]

#### Implementation Notes
- [Notable implementation details]
- [Edge cases encountered]

#### Blockers Encountered
- [Blocker description and resolution]

#### Files Modified
- [File path] - [brief description of changes]

#### Verification Results
| Check | Status | Notes |
| :--- | :--- | :--- |
| Type check | ✅/❌ | |
| Lint | ✅/❌ | |
| Tests | ✅/❌ | [X/Y passed] |

---

### Session [N-1]: [Previous Timestamp]
...
```

---

## Session JSON Format

For programmatic access, also create `agent-memory/sessions/session-[uuid].json`:

```json
{
  "sessionId": "uuid-v4",
  "moduleId": "plex-auth",
  "attempt": 1,
  "startedAt": "2025-01-01T14:00:00.000Z",
  "completedAt": "2025-01-01T14:45:00.000Z",
  "status": "complete",
  "decisions": [
    {
      "description": "Used requestAnimationFrame for timer precision",
      "rationale": "Better accuracy than setInterval per spec requirement",
      "specReference": "artifact-7 L234"
    }
  ],
  "blockers": [],
  "filesModified": [
    "src/modules/plex/auth/PlexAuth.ts",
    "src/modules/plex/auth/__tests__/PlexAuth.test.ts"
  ],
  "verification": {
    "typeCheck": { "passed": true, "errors": 0 },
    "lint": { "passed": true, "warnings": 0 },
    "tests": { "passed": true, "total": 12, "passed": 12, "failed": 0 }
  },
  "escalations": []
}
```

---

## Usage by Coding Agent

### At Session Start

Read previous session memory to understand:

1. What was tried before (if retry)
2. What decisions were made
3. What blockers were encountered

```typescript
// Pseudocode for Coding Agent
const previousSession = await readMemory(moduleId);
if (previousSession && previousSession.status === 'failed') {
  // Understand what went wrong
  applyLearnings(previousSession.blockers);
}
```

### At Session End

Write session memory:

```typescript
await writeMemory({
  sessionId,
  moduleId,
  decisions: collectDecisions(),
  blockers: collectBlockers(),
  filesModified: getModifiedFiles(),
  verification: runVerification()
});
```

---

## Memory Retention Policy

| Data Type | Retention | Rationale |
| :--- | :--- | :--- |
| Session JSON | Until module complete | Debugging across attempts |
| Session Markdown | Permanent | Historical record |
| Decision log | Permanent | Institutional knowledge |
| Blocker log | Permanent | Learning from failures |

---

## Integration Points

### Coding Agent

1. Read memory at session start
2. Write memory at session end
3. Reference previous decisions in implementation

### Planning Agent

1. Review memory when planning retries
2. Identify patterns in failures
3. Escalate systemic issues to Phase 1

### Code Review Agent

1. Reference decisions when reviewing
2. Verify decisions align with spec
3. Flag decisions that contradict spec
