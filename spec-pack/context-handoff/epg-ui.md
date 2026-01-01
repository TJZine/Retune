# Context Handoff: EPG UI

## SSOT References

| Concept | SSOT File | How to locate (from repo root) |
| :--- | :--- | :--- |
| Interface | [artifact-2-shared-types.ts](../artifact-2-shared-types.ts) | `rg -n \"^export interface IEPG(Component|InfoPanel)\\b\" spec-pack/artifact-2-shared-types.ts` |
| Types | [artifact-2-shared-types.ts](../artifact-2-shared-types.ts) | `rg -n \"^export interface EPG(State|ProgramCell|VirtualizedGridState)\\b\" spec-pack/artifact-2-shared-types.ts` |
| Virtualization | [modules/epg-ui.md](../modules/epg-ui.md) | Search for `## Virtualization Strategy` |
| Module Spec | [modules/epg-ui.md](../modules/epg-ui.md) | Open the file (single-module SSOT) |
| Implementation Prompt | [artifact-7-implementation-prompts.md](../artifact-7-implementation-prompts.md) | `rg -n \"^## Prompt 6: EPG UI Module\\b\" spec-pack/artifact-7-implementation-prompts.md` |
| Decision | [decisions/0003-virtualized-epg.md](../decisions/0003-virtualized-epg.md) | Open and review entire ADR |

## Active Assumptions

1. **DOM limit**: Max 200 DOM elements for virtualization
2. **Row buffer**: 2 rows above/below visible area
3. **pixelsPerMinute**: 4 (default)
4. **rowHeight**: 80px (default)
5. **Performance target**: <100ms to render 5 channels × 3 hours

## Scope Boundaries

| IN Scope | OUT of Scope |
| :--- | :--- |
| Grid rendering | Schedule generation |
| DOM virtualization | Video playback |
| D-pad focus navigation | Channel CRUD |
| Info panel display | Authentication |
| Current time indicator | Plex API calls |

## Verification Commands

```bash
npx tsc --noEmit
npm test -- --grep "EPGComponent"
npm test -- --grep "EPGVirtualizer"
```

## Rollback Procedure

```bash
git checkout -- src/modules/ui/epg/
```
