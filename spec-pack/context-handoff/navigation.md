# Context Handoff: Navigation

## SSOT References

| Concept | SSOT File | How to locate (from repo root) |
| :--- | :--- | :--- |
| Interface | [artifact-2-shared-types.ts](../artifact-2-shared-types.ts) | `rg -n \"^export interface I(NavigationManager|FocusManager)\\b\" spec-pack/artifact-2-shared-types.ts` |
| Types | [artifact-2-shared-types.ts](../artifact-2-shared-types.ts) | `rg -n \"^export type Screen\\b|^export interface KeyEvent\\b|^export interface FocusableElement\\b\" spec-pack/artifact-2-shared-types.ts` |
| Key Codes | [modules/navigation.md](../modules/navigation.md) | Search for `## webOS Key Codes` |
| Spatial Algorithm | [modules/navigation.md](../modules/navigation.md) | Search for `## Spatial Navigation Algorithm` |
| Module Spec | [modules/navigation.md](../modules/navigation.md) | Open the file (single-module SSOT) |
| Implementation Prompt | [artifact-7-implementation-prompts.md](../artifact-7-implementation-prompts.md) | `rg -n \"^## Prompt 5: Navigation Module\\b\" spec-pack/artifact-7-implementation-prompts.md` |

## Active Assumptions

1. **webOS Back button**: Key code 461 (differs from standard 8)
2. **Long press threshold**: 500ms
3. **Focus memory**: Save/restore focus per screen
4. **Modal focus trap**: Modal must trap focus until closed
5. **Pointer mode**: Support Magic Remote pointer + D-pad

## Scope Boundaries

| IN Scope | OUT of Scope |
| :--- | :--- |
| Key event handling | Video playback |
| Focus management | Content fetching |
| Screen navigation | Schedule generation |
| Modal handling | EPG data management |
| Pointer mode support | Plex API calls |

## Verification Commands

```bash
npx tsc --noEmit
npm test -- --testPathPattern="NavigationManager"
npm test -- --testPathPattern="FocusManager"
```

## Rollback Procedure

```bash
git checkout -- src/modules/navigation/
```
