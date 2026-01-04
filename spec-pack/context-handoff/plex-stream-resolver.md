# Context Handoff: Plex Stream Resolver

## SSOT References

| Concept | SSOT File | How to locate (from repo root) |
| :--- | :--- | :--- |
| Interface | [artifact-2-shared-types.ts](../artifact-2-shared-types.ts) | `rg -n \"^export interface IPlexStreamResolver\\b\" spec-pack/artifact-2-shared-types.ts` |
| Types | [artifact-2-shared-types.ts](../artifact-2-shared-types.ts) | `rg -n \"^export interface Stream(Decision|Request|Descriptor)\\b\" spec-pack/artifact-2-shared-types.ts` |
| Module Spec | [modules/plex-stream-resolver.md](../modules/plex-stream-resolver.md) | Open the file (single-module SSOT) |
| Implementation Prompt | [artifact-7-implementation-prompts.md](../artifact-7-implementation-prompts.md) | `rg -n \"^## Prompt 10 \\(V2\\): Plex Stream Resolver Module\\b\" spec-pack/artifact-7-implementation-prompts.md` |

## Active Assumptions

1. **Direct play preference**: Always prefer direct play over transcoding
2. **Session IDs**: Generate unique UUID per playback session
3. **Progress reporting**: Report to Plex for "Continue Watching" feature
4. **Session cleanup**: Always call endPlaybackSession on stream end
5. **HLS native support**: webOS has native HLS, don't use HLS.js

## Scope Boundaries

| IN Scope | OUT of Scope |
| :--- | :--- |
| Stream URL resolution | Actual video playback |
| Transcode decision requests | Subtitle rendering |
| Session lifecycle management | Channel scheduling |
| Progress reporting | EPG display |
| MIME type determination | UI rendering |

## Verification Commands

```bash
npx tsc --noEmit
npm test -- --testPathPattern="PlexStreamResolver"
```

## Rollback Procedure

```bash
git checkout -- src/modules/plex/stream/
```
