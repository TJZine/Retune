# Spec Pack Artifact Index

This index maps the 11 prompt-required artifacts (per `opus_spec_plan.md`) to their actual file paths in this repository, plus supplemental artifacts.

---

## Prompt-Required Artifacts (1-11)

| Artifact | Name | Path | Status |
| :---: | :--- | :--- | :---: |
| **1** | Module Dependency Graph (JSON) | [artifact-1-dependency-graph.json](./artifact-1-dependency-graph.json) | ✅ |
| **2** | Shared Types Package | [artifact-2-shared-types.ts](./artifact-2-shared-types.ts) | ✅ |
| **3** | Module Implementation Specs | [modules/*.md](./modules/) | ✅ |
| **4** | Integration Contract Specs | [artifact-4-integration-contracts.md](./artifact-4-integration-contracts.md) | ✅ |
| **5** | Configuration & Constants Spec | [artifact-5-config.ts](./artifact-5-config.ts) | ✅ |
| **6** | File Manifest | [artifact-6-file-manifest.json](./artifact-6-file-manifest.json) | ✅ |
| **7** | Implementation Prompts | [artifact-7-implementation-prompts.md](./artifact-7-implementation-prompts.md) | ✅ |
| **8** | Verification Checklist | [artifact-8-verification-checklist.md](./artifact-8-verification-checklist.md) | ✅ |
| **9** | Context Handoff Protocol | [context-handoff/*.md](./context-handoff/) | ✅ |
| **10** | Implementation State Machine | [artifact-10-implementation-state.json](./artifact-10-implementation-state.json) | ✅ |
| **11** | Agent Memory Template | [artifact-11-agent-memory-template.md](./artifact-11-agent-memory-template.md) | ✅ |

---

## Module Specs (Artifact 3)

| Module ID | Spec File | Implementation Prompt |
| :--- | :--- | :--- |
| `event-emitter` | [modules/event-emitter.md](./modules/event-emitter.md) | Prompt 1 |
| `plex-auth` | [modules/plex-auth.md](./modules/plex-auth.md) | Prompt 2 |
| `plex-server-discovery` | [modules/plex-server-discovery.md](./modules/plex-server-discovery.md) | Prompt 8 (V2) |
| `plex-library` | [modules/plex-library.md](./modules/plex-library.md) | Prompt 9 (V2) |
| `plex-stream-resolver` | [modules/plex-stream-resolver.md](./modules/plex-stream-resolver.md) | Prompt 10 (V2) |
| `channel-manager` | [modules/channel-manager.md](./modules/channel-manager.md) | Prompt 11 (V2) |
| `channel-scheduler` | [modules/channel-scheduler.md](./modules/channel-scheduler.md) | Prompt 3 |
| `video-player` | [modules/video-player.md](./modules/video-player.md) | Prompt 4 |
| `navigation` | [modules/navigation.md](./modules/navigation.md) | Prompt 5 |
| `epg-ui` | [modules/epg-ui.md](./modules/epg-ui.md) | Prompt 6 |
| `app-lifecycle` | [modules/app-lifecycle.md](./modules/app-lifecycle.md) | Prompt 12 |
| `app-orchestrator` | [modules/app-orchestrator.md](./modules/app-orchestrator.md) | Prompt 13 |

---

## Context Handoffs (Artifact 9)

Per-module handoff documents for coding agents:

| Module ID | Handoff File |
| :--- | :--- |
| `event-emitter` | [context-handoff/event-emitter.md](./context-handoff/event-emitter.md) |
| `plex-auth` | [context-handoff/plex-auth.md](./context-handoff/plex-auth.md) |
| `plex-server-discovery` | [context-handoff/plex-server-discovery.md](./context-handoff/plex-server-discovery.md) |
| `plex-library` | [context-handoff/plex-library.md](./context-handoff/plex-library.md) |
| `plex-stream-resolver` | [context-handoff/plex-stream-resolver.md](./context-handoff/plex-stream-resolver.md) |
| `channel-manager` | [context-handoff/channel-manager.md](./context-handoff/channel-manager.md) |
| `channel-scheduler` | [context-handoff/channel-scheduler.md](./context-handoff/channel-scheduler.md) |
| `video-player` | [context-handoff/video-player.md](./context-handoff/video-player.md) |
| `navigation` | [context-handoff/navigation.md](./context-handoff/navigation.md) |
| `epg-ui` | [context-handoff/epg-ui.md](./context-handoff/epg-ui.md) |
| `app-lifecycle` | [context-handoff/app-lifecycle.md](./context-handoff/app-lifecycle.md) |
| `app-orchestrator` | [context-handoff/app-orchestrator.md](./context-handoff/app-orchestrator.md) |

---

## Supplemental Artifacts (Non-Required)

These artifacts extend the spec pack with additional context but are not required by `opus_spec_plan.md`:

| ID | Name | Path | Purpose |
| :--- | :--- | :--- | :--- |
| S-1 | Error Messages Catalog | [supplements/error-messages.ts](./supplements/error-messages.ts) | User-facing error strings mapped to `AppErrorCode` |
| S-2 | Platform Constraints | [artifact-12-platform-constraints.md](./artifact-12-platform-constraints.md) | webOS-specific limitations and workarounds |
| S-3 | Dependency Visualization | [artifact-13-dependency-visualization.md](./artifact-13-dependency-visualization.md) | Mermaid diagrams of module dependencies |
| S-4 | Integration Tests | [artifact-14-integration-tests.md](./artifact-14-integration-tests.md) | End-to-end test specifications |
| S-5 | Mock Factories | [artifact-15-mock-factories.ts](./artifact-15-mock-factories.ts) | Test double generators for all interfaces |
| S-6 | Logging Patterns | [artifact-16-logging-patterns.md](./artifact-16-logging-patterns.md) | Structured logging guidelines |
| S-7 | Plex API Examples | [artifact-9-plex-api-examples.md](./artifact-9-plex-api-examples.md) | Real Plex API request/response examples |
| S-8 | Decisions Log | [decisions/](./decisions/) | Architectural decision records |

---

## Key References

| Document | Purpose |
| :--- | :--- |
| [tsconfig.template.json](./tsconfig.template.json) | TypeScript compiler configuration (target: ES2017) |
| [README.md](./README.md) | Spec pack overview and usage guide |
| [accessibility-guidelines.md](./accessibility-guidelines.md) | TV accessibility requirements |

---

## Version History

| Version | Date | Changes |
| :--- | :--- | :--- |
| 1.0.0 | 2026-01-01 | Initial remediation - artifact map created, numbering normalized |
