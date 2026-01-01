# Context Handoff: Event Emitter

## SSOT References

| Concept | SSOT File | How to locate (from repo root) |
| :--- | :--- | :--- |
| Interface | [artifact-2-shared-types.ts](../artifact-2-shared-types.ts) | `rg -n \"^export interface IEventEmitter\\b\" spec-pack/artifact-2-shared-types.ts` |
| Module Spec | [modules/event-emitter.md](../modules/event-emitter.md) | Open the file (single-module SSOT) |
| Implementation Prompt | [artifact-7-implementation-prompts.md](../artifact-7-implementation-prompts.md) | `rg -n \"^## Prompt 1: Event Emitter Utility\\b\" spec-pack/artifact-7-implementation-prompts.md` |

## Active Assumptions

1. **Error isolation is critical** — one handler's error MUST NOT crash other handlers
2. **No external dependencies** — pure TypeScript only
3. **Chromium 68 compatibility** — no optional chaining (`?.`) or nullish coalescing (`??`)
4. **Synchronous handlers only** — no async event handling

## Scope Boundaries

| IN Scope | OUT of Scope |
| :--- | :--- |
| Generic typed event emitter | Async event handling |
| on/off/emit/once methods | Event bubbling/capturing |
| Error isolation per handler | Wildcard event matching |
| Disposable pattern for cleanup | Event priority ordering |

## Verification Commands

```bash
npx tsc --noEmit
npm test -- --grep "EventEmitter"
```

## Rollback Procedure

```bash
git checkout -- src/utils/EventEmitter.ts
```
