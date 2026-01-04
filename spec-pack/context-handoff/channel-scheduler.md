# Context Handoff: Channel Scheduler

## SSOT References

| Concept | SSOT File | How to locate (from repo root) |
| :--- | :--- | :--- |
| Interface | [artifact-2-shared-types.ts](../artifact-2-shared-types.ts) | `rg -n "^export interface IChannelScheduler\\b" spec-pack/artifact-2-shared-types.ts` |
| Types | [artifact-2-shared-types.ts](../artifact-2-shared-types.ts) | `rg -n \"^export interface ScheduledProgram\\b|^export interface SchedulerState\\b\" spec-pack/artifact-2-shared-types.ts` |
| Algorithm | [modules/channel-scheduler.md](../modules/channel-scheduler.md) | Search for `## Schedule Calculation Algorithm` |
| Module Spec | [modules/channel-scheduler.md](../modules/channel-scheduler.md) | Open the file (single-module SSOT) |
| Implementation Prompt | [artifact-7-implementation-prompts.md](../artifact-7-implementation-prompts.md) | `rg -n \"^## Prompt 3: Channel Scheduler Module\\b\" spec-pack/artifact-7-implementation-prompts.md` |

## Active Assumptions

1. **PRNG**: Use Mulberry32 for deterministic shuffle
2. **Lookup complexity**: O(log n) via binary search
3. **Timer sync**: Every 1 second
4. **Clock drift tolerance**: Up to 500ms gracefully handled
5. **Decision**: See [0001-mulberry32-prng.md](../decisions/0001-mulberry32-prng.md)

## Scope Boundaries

| IN Scope | OUT of Scope |
| :--- | :--- |
| Schedule generation | Content resolution |
| Time-based program queries | Video playback |
| Program transition events | Stream resolution |
| Deterministic shuffle | UI rendering |
| Schedule window for EPG | Plex API calls |

## Verification Commands

```bash
npx tsc --noEmit
npm test -- --testPathPattern="ChannelScheduler"
npm test -- --testPathPattern="ShuffleGenerator"
```

## Rollback Procedure

```bash
git checkout -- src/modules/scheduler/scheduler/
```
