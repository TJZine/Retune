# Orchestration Document Template

This template is used by the Planning Agent to create session-specific orchestration documents for the Coding Agent.

---

## Usage

For each module being implemented, create:

```
orchestration-docs/session-[module-id]-[attempt].md
```

Copy the template below and fill in the bracketed values:

---

```markdown
# Coding Session: [MODULE_NAME]

## Session Metadata

| Field | Value |
| :--- | :--- |
| **Module ID** | [module-id] |
| **Session ID** | [UUID-v4] |
| **Started** | [ISO timestamp] |
| **Attempt** | [N] of 3 |
| **Planning Agent Version** | [version] |

---

## Pre-Flight Status

### Dependency Check

| Module | Required Status | Actual Status | Gate |
| :--- | :--- | :--- | :---: |
| [dep-1] | complete | [status] | ✅/❌ |
| [dep-2] | complete | [status] | ✅/❌ |

### Gate Verification

- [ ] All dependencies marked `complete` in implementation-state.json
- [ ] Shared types compile: `npx tsc --noEmit src/types/index.ts`
- [ ] Context handoff document accessible
- [ ] No unresolved blockers in implementation-state.json

**ALL GATES MUST PASS BEFORE PROCEEDING**

---

## Implementation Specification (SSOT)

> [!IMPORTANT]
> **READ ONLY — These documents are the source of truth. Do not modify.**

| Document | Location | Purpose |
| :--- | :--- | :--- |
| Implementation Prompt | [`artifact-7-implementation-prompts.md#prompt-[N]`](../spec-pack/artifact-7-implementation-prompts.md) | Complete implementation spec |
| Context Handoff | `spec-pack/context-handoff/<module-id>.md` | Scope, assumptions, verification |
| Shared Types | [`artifact-2-shared-types.ts`](../spec-pack/artifact-2-shared-types.ts) | Type definitions (lines [X]-[Y]) |

---

## Session Context

### Previous Attempts (if applicable)

| Attempt | Outcome | Issue | Resolution |
| :--- | :--- | :--- | :--- |
| [N-1] | [passed/failed] | [description] | [what was fixed] |

### Blockers Cleared Since Last Attempt

- [List any blockers that were resolved]

### Spec Updates Since Last Attempt

- [List any spec changes, or "None"]

---

## Verification Protocol

Run these commands after implementation:

```bash
# Type check
npx tsc --noEmit

# Lint
npm run lint

# Module-specific tests
npm test -- --grep "[ModuleName]"
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
     "[module-id]": {
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
     "[module-id]": {
       "status": "review",
       "completedAt": "[ISO timestamp]",
       "filesModified": ["list of files"],
       "implementedBy": "coding-agent",
       "sessionId": "[session-id]"
     }
   }
   ```

---

## Quick Reference

### Files to Create

```text
src/modules/[module-name]/
├── index.ts              # Public exports
├── [ModuleName].ts       # Main class
├── interfaces.ts         # Module interfaces
├── types.ts              # Module-specific types (if any)
├── constants.ts          # Constants
├── helpers.ts            # Pure helper functions
└── __tests__/
    └── [ModuleName].test.ts
```

### Code Style Reminders

- Explicit return types on all functions
- Maximum function length: 50 lines
- Maximum file length: 300 lines
- Use `_` prefix for private methods
- Use `I` prefix for interfaces
- Use Result pattern for error handling
- JSDoc on all public methods

---

*Template version: 1.0.0*

```

---

## Template Field Reference

| Field | Description | Example |
| :--- | :--- | :--- |
| `[MODULE_NAME]` | Human-readable module name | `Plex Authentication` |
| `[module-id]` | Kebab-case module identifier | `plex-auth` |
| `[UUID-v4]` | Unique session identifier | `550e8400-e29b-41d4-a716-446655440000` |
| `[N]` | Attempt number | `1` |
| `[dep-1]` | Dependency module ID | `event-emitter` |
| `[status]` | Current status from implementation-state.json | `complete` |
| `[X]-[Y]` | Line range in source file | `262-334` |
| `[ModuleName]` | PascalCase module name for test grep | `PlexAuth` |
