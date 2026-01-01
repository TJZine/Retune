# Context Handoff: App Lifecycle

## SSOT References

| Concept | SSOT File | How to locate (from repo root) |
| :--- | :--- | :--- |
| Interface | [artifact-2-shared-types.ts](../artifact-2-shared-types.ts) | `rg -n "^export interface IAppLifecycle\\b" spec-pack/artifact-2-shared-types.ts` |
| Types | [artifact-2-shared-types.ts](../artifact-2-shared-types.ts) | `rg -n "^export type AppPhase\\b|^export type ConnectionStatus\\b|^export interface PersistentState\\b" spec-pack/artifact-2-shared-types.ts` |
| Module Spec | [modules/app-lifecycle.md](../modules/app-lifecycle.md) | Open the file (single-module SSOT) |
| Implementation Prompt | [artifact-7-implementation-prompts.md](../artifact-7-implementation-prompts.md) | `rg -n "^## Prompt 12: App Lifecycle Module\\b" spec-pack/artifact-7-implementation-prompts.md` |
| Storage Decision | [decisions/0004-localstorage-persistence.md](../decisions/0004-localstorage-persistence.md) | Open and review entire ADR |

## Active Assumptions

1. **Visibility API**: Use webOS visibility API for background/foreground detection
2. **State save**: Always save state before any phase transition
3. **Error recovery**: Present user with recovery options
4. **Memory monitoring**: Track memory usage for proactive cleanup
5. **Storage key**: `retune_app_state`

## Scope Boundaries

| IN Scope | OUT of Scope |
| :--- | :--- |
| Lifecycle phase management | Video playback |
| State persistence | Schedule generation |
| Error recovery UI | Authentication flow details |
| Network monitoring | EPG rendering |
| Memory tracking | Plex API calls |

## Verification Commands

```bash
npx tsc --noEmit
npm test -- --grep "AppLifecycle"
```

## Rollback Procedure

```bash
git checkout -- src/modules/lifecycle/
```
