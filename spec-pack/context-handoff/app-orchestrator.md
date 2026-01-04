# Context Handoff: App Orchestrator

## SSOT References

| Concept | SSOT File | How to locate (from repo root) |
| :--- | :--- | :--- |
| Interface | [artifact-2-shared-types.ts](../artifact-2-shared-types.ts) | `rg -n "^export interface IAppOrchestrator\\b" spec-pack/artifact-2-shared-types.ts` |
| Dependencies | [artifact-1-dependency-graph.json](../artifact-1-dependency-graph.json) | `rg -n \"\\\"id\\\"\\s*:\\s*\\\"app-orchestrator\\\"\" spec-pack/artifact-1-dependency-graph.json` |
| Module Spec | [modules/app-orchestrator.md](../modules/app-orchestrator.md) | Open the file (single-module SSOT) |
| Implementation Prompt | [artifact-7-implementation-prompts.md](../artifact-7-implementation-prompts.md) | `rg -n "^## Prompt 13: App Orchestrator Module\\b" spec-pack/artifact-7-implementation-prompts.md` |
| Integration Contracts | [artifact-4-integration-contracts.md](../artifact-4-integration-contracts.md) | Open file and search for orchestrator contracts |

## Active Assumptions

1. **Central event hub**: Orchestrator mediates all cross-module events
2. **Initialization order**: Follow dependency graph (foundational → dependent)
3. **Error propagation**: Catch and route cross-module errors
4. **Startup/shutdown**: Manage application startup sequence and graceful shutdown

## Scope Boundaries

| IN Scope | OUT of Scope |
| :--- | :--- |
| Module coordination | Individual module implementation |
| Event routing | Plex API call details |
| Startup sequence | Schedule algorithm details |
| Shutdown cleanup | UI rendering specifics |
| Module health tracking | Storage implementation |

## Verification Commands

```bash
npx tsc --noEmit
npm test -- --testPathPattern="Orchestrator"
npm run build
```

## Rollback Procedure

```bash
git checkout -- src/Orchestrator.ts
```
