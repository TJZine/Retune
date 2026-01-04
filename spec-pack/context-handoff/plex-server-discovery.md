# Context Handoff: Plex Server Discovery

## SSOT References

| Concept | SSOT File | How to locate (from repo root) |
| :--- | :--- | :--- |
| Interface | [artifact-2-shared-types.ts](../artifact-2-shared-types.ts) | `rg -n \"^export interface IPlexServerDiscovery\\b\" spec-pack/artifact-2-shared-types.ts` |
| Types | [artifact-2-shared-types.ts](../artifact-2-shared-types.ts) | `rg -n \"^export interface Plex(Server|Connection)\\b\" spec-pack/artifact-2-shared-types.ts` |
| Module Spec | [modules/plex-server-discovery.md](../modules/plex-server-discovery.md) | Open the file (single-module SSOT) |
| Implementation Prompt | [artifact-7-implementation-prompts.md](../artifact-7-implementation-prompts.md) | `rg -n \"^## Prompt 8 \\(V2\\): Plex Server Discovery Module\\b\" spec-pack/artifact-7-implementation-prompts.md` |

## Active Assumptions

1. **API endpoint**: `https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1`
2. **Connection test**: HEAD request with 5 second timeout
3. **Preference order**: Local HTTPS > Local HTTP > Remote HTTPS > Relay
4. **Storage key**: `retune_selected_server`

## Scope Boundaries

| IN Scope | OUT of Scope |
| :--- | :--- |
| Fetch available servers | Authentication |
| Test connection latency | Library enumeration |
| Select/persist server | Stream resolution |
| Find best connection | Playback |

## Verification Commands

```bash
npx tsc --noEmit
npm test -- --testPathPattern="PlexServerDiscovery"
```

## Rollback Procedure

```bash
git checkout -- src/modules/plex/discovery/
```
