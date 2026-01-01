# Context Handoff: Video Player

## SSOT References

| Concept | SSOT File | How to locate (from repo root) |
| :--- | :--- | :--- |
| Interface | [artifact-2-shared-types.ts](../artifact-2-shared-types.ts) | `rg -n \"^export interface IVideoPlayer\\b\" spec-pack/artifact-2-shared-types.ts` |
| Types | [artifact-2-shared-types.ts](../artifact-2-shared-types.ts) | `rg -n \"^export type PlaybackState\\b|^export interface (Audio|Subtitle)Track\\b\" spec-pack/artifact-2-shared-types.ts` |
| Module Spec | [modules/video-player.md](../modules/video-player.md) | Open the file (single-module SSOT) |
| Implementation Prompt | [artifact-7-implementation-prompts.md](../artifact-7-implementation-prompts.md) | `rg -n \"^## Prompt 4: Video Player Module\\b\" spec-pack/artifact-7-implementation-prompts.md` |
| Platform Constraints | [artifact-12-platform-constraints.md](../artifact-12-platform-constraints.md) | `rg -n \"^## HLS Playback\\b\" spec-pack/artifact-12-platform-constraints.md` |

## Active Assumptions

1. **Native HLS**: webOS has native HLS support — DO NOT use HLS.js
2. **Keep-alive**: Touch DOM every 30s to prevent webOS suspension
3. **Retry strategy**: Exponential backoff (max 3 attempts)
4. **Video element**: Absolute positioning, 100% size, contain fit
5. **Decision**: See [0002-no-hls-js.md](../decisions/0002-no-hls-js.md)

## Scope Boundaries

| IN Scope | OUT of Scope |
| :--- | :--- |
| HTML5 video abstraction | Stream URL resolution |
| Playback control | Schedule management |
| Subtitle track management | Channel switching logic |
| Error retry with backoff | EPG rendering |
| Keep-alive mechanism | Plex session management |

## Verification Commands

```bash
npx tsc --noEmit
npm test -- --grep "VideoPlayer"
```

## Rollback Procedure

```bash
git checkout -- src/modules/player/
```
