# Context Handoff: Channel Manager

## SSOT References

| Concept | SSOT File | How to locate (from repo root) |
| :--- | :--- | :--- |
| Interface | [artifact-2-shared-types.ts](../artifact-2-shared-types.ts) | `rg -n "^export interface IChannelManager\\b" spec-pack/artifact-2-shared-types.ts` |
| Types | [artifact-2-shared-types.ts](../artifact-2-shared-types.ts) | `rg -n \"^export interface ChannelConfig\\b|^export type ContentSource\\b\" spec-pack/artifact-2-shared-types.ts` |
| Module Spec | [modules/channel-manager.md](../modules/channel-manager.md) | Open the file (single-module SSOT) |
| Implementation Prompt | [artifact-7-implementation-prompts.md](../artifact-7-implementation-prompts.md) | `rg -n \"^## Prompt 11 \\(V2\\): Channel Manager Module\\b\" spec-pack/artifact-7-implementation-prompts.md` |

## Active Assumptions

1. **Storage**: localStorage with key `retune_channels`
2. **Quota handling**: Gracefully handle QUOTA_EXCEEDED errors
3. **Validation**: Validate channel config before save
4. **Events**: Emit events on create/update/delete/content resolution
5. **Memory budget**: ~10MB maximum for channel configurations

## Scope Boundaries

| IN Scope | OUT of Scope |
| :--- | :--- |
| Channel CRUD operations | Schedule generation |
| Content source resolution | Playback control |
| localStorage persistence | EPG rendering |
| Import/export (JSON) | Video player |
| Content filter application | Stream resolution |

## Verification Commands

```bash
npx tsc --noEmit
npm test -- --grep "ChannelManager"
```

## Rollback Procedure

```bash
git checkout -- src/modules/scheduler/channel-manager/
```
