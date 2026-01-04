# Context Handoff: Plex Library

## SSOT References

| Concept | SSOT File | How to locate (from repo root) |
| :--- | :--- | :--- |
| Interface | [artifact-2-shared-types.ts](../artifact-2-shared-types.ts) | `rg -n \"^export interface IPlexLibrary\\b\" spec-pack/artifact-2-shared-types.ts` |
| Types | [artifact-2-shared-types.ts](../artifact-2-shared-types.ts) | `rg -n \"^export interface Plex(MediaItem|Library|MediaFile)\\b\" spec-pack/artifact-2-shared-types.ts` |
| Module Spec | [modules/plex-library.md](../modules/plex-library.md) | Open the file (single-module SSOT) |
| Implementation Prompt | [artifact-7-implementation-prompts.md](../artifact-7-implementation-prompts.md) | `rg -n \"^## Prompt 9 \\(V2\\): Plex Library Module\\b\" spec-pack/artifact-7-implementation-prompts.md` |

## Active Assumptions

1. **Pagination**: Handle transparently, fetch all items when needed
2. **Image URLs**: Inject auth token as query parameter
3. **Response format**: Always request JSON via `Accept: application/json` header
4. **Rate limiting**: Respect ~100 req/min to plex.tv (informal)
5. **Memory budget**: ~50MB maximum for library metadata cache

## Scope Boundaries

| IN Scope | OUT of Scope |
| :--- | :--- |
| Library enumeration | Playback |
| Content metadata fetch | Schedule generation |
| Image URL generation | Channel management |
| Collections/playlists | User preferences |
| TV show hierarchy | Stream resolution |

## Verification Commands

```bash
npx tsc --noEmit
npm test -- --testPathPattern="PlexLibrary"
```

## Rollback Procedure

```bash
git checkout -- src/modules/plex/library/
```
