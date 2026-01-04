# Context Handoff: Plex Authentication

## SSOT References

| Concept | SSOT File | How to locate (from repo root) |
| :--- | :--- | :--- |
| Interface | [artifact-2-shared-types.ts](../artifact-2-shared-types.ts) | `rg -n \"^export interface IPlexAuth\\b\" spec-pack/artifact-2-shared-types.ts` |
| Types | [artifact-2-shared-types.ts](../artifact-2-shared-types.ts) | `rg -n \"^export interface Plex(PinRequest|AuthToken|AuthData)\\b\" spec-pack/artifact-2-shared-types.ts` |
| Module Spec | [modules/plex-auth.md](../modules/plex-auth.md) | Open the file (single-module SSOT) |
| Implementation Prompt | [artifact-7-implementation-prompts.md](../artifact-7-implementation-prompts.md) | `rg -n \"^## Prompt 2: Plex Authentication Module\\b\" spec-pack/artifact-7-implementation-prompts.md` |

## Active Assumptions

1. **PIN polling interval**: 1 second
2. **PIN timeout**: 5 minutes
3. **Storage key**: `retune_plex_auth`
4. **Tokens may expire** — validate on startup and handle expiry (JWTs may be short-lived)
5. **Client ID persistence**: Generate UUIDv4 once and persist to `retune_client_id`

## Scope Boundaries

| IN Scope | OUT of Scope |
| :--- | :--- |
| PIN-based OAuth flow | Server selection (discovery module) |
| Token storage/validation | Library access |
| Auth headers generation | Stream resolution |
| Event emission on auth change | UI rendering |

## Verification Commands

```bash
npx tsc --noEmit
npm test -- --testPathPattern="PlexAuth"
```

## Rollback Procedure

```bash
git checkout -- src/modules/plex/auth/
```
