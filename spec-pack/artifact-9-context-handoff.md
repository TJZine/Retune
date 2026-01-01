# Context Handoff Protocol

This document provides context handoff information for AI coding agents implementing each module. Each section is self-contained with SSOT references, active assumptions, scope boundaries, and verification commands.

---

## Module: event-emitter

### SSOT References

| Concept | File | Section |
| :--- | :--- | :--- |
| Interface | artifact-2-shared-types.ts | `TypedEventEmitter` class |
| Requirements | artifact-7-implementation-prompts.md | Prompt 1 |

### Active Assumptions

1. Error isolation is critical - one handler's error MUST NOT crash other handlers
2. No external dependencies allowed (pure TypeScript)
3. Must work in Chromium 68 (webOS 4.0)

### Scope Boundaries

| IN Scope | OUT of Scope |
| :--- | :--- |
| Generic typed event emitter | Async event handling |
| on/off/emit/once methods | Event bubbling/capturing |
| Error isolation per handler | Wildcard event matching |

### Verification Commands

```bash
npx tsc --noEmit
npm test -- --grep "EventEmitter"
```

### Rollback Procedure

```bash
git checkout -- src/utils/EventEmitter.ts
```

---

## Module: plex-auth

### SSOT References

| Concept | File | Section |
| :--- | :--- | :--- |
| Interface | modules/plex-auth.md | `Public Interface` |
| Types | artifact-2-shared-types.ts | `PLEX AUTHENTICATION` section |
| Prompt | artifact-7-implementation-prompts.md | Prompt 2 |

### Active Assumptions

1. PIN polling interval: 1 second
2. PIN timeout: 5 minutes
3. Storage key: `retune_plex_auth`
4. Tokens are typically long-lived (no routine refresh needed)

### Scope Boundaries

| IN Scope | OUT of Scope |
| :--- | :--- |
| PIN-based OAuth flow | Server selection (discovery module) |
| Token storage/validation | Library access |
| Auth headers generation | Stream resolution |

### Verification Commands

```bash
npx tsc --noEmit
npm test -- --grep "PlexAuth"
```

### Rollback Procedure

```bash
git checkout -- src/modules/plex/auth/
```

---

## Module: plex-server-discovery

### SSOT References

| Concept | File | Section |
| :--- | :--- | :--- |
| Interface | modules/plex-server-discovery.md | `Public Interface` |
| Types | artifact-2-shared-types.ts | `PLEX SERVER & CONNECTION` section |

### Active Assumptions

1. Use plex.tv/api/v2/resources endpoint
2. Test connections with HEAD request + timeout
3. Prefer local connections over relay
4. Persist selected server to localStorage

### Scope Boundaries

| IN Scope | OUT of Scope |
| :--- | :--- |
| Fetch available servers | Authentication |
| Test connection latency | Library enumeration |
| Select/persist server | Stream resolution |

### Verification Commands

```bash
npx tsc --noEmit
npm test -- --grep "PlexServerDiscovery"
```

### Rollback Procedure

```bash
git checkout -- src/modules/plex/discovery/
```

---

## Module: plex-library

### SSOT References

| Concept | File | Section |
| :--- | :--- | :--- |
| Interface | modules/plex-library.md | `Public Interface` |
| Types | artifact-2-shared-types.ts | `PLEX LIBRARY & MEDIA` section |

### Active Assumptions

1. Handle pagination transparently (fetch all items)
2. Inject auth token into image URLs
3. Map Plex XML/JSON to TypeScript types
4. Rate limit: respect ~100 req/min to plex.tv

### Scope Boundaries

| IN Scope | OUT of Scope |
| :--- | :--- |
| Library enumeration | Playback |
| Content metadata fetch | Schedule generation |
| Image URL generation | Channel management |
| Collections/playlists | User preferences |

### Verification Commands

```bash
npx tsc --noEmit
npm test -- --grep "PlexLibrary"
```

### Rollback Procedure

```bash
git checkout -- src/modules/plex/library/
```

---

## Module: plex-stream-resolver

### SSOT References

| Concept | File | Section |
| :--- | :--- | :--- |
| Interface | modules/plex-stream-resolver.md | `Public Interface` |
| Types | artifact-2-shared-types.ts | `STREAM RESOLUTION` section |

### Active Assumptions

1. Prefer direct play over transcoding
2. Generate unique session IDs for tracking
3. Report playback progress to Plex for continue watching
4. Clean up sessions on stream end

### Scope Boundaries

| IN Scope | OUT of Scope |
| :--- | :--- |
| Stream URL resolution | Actual video playback |
| Transcode requests | Subtitle rendering |
| Session lifecycle | Channel scheduling |
| Progress reporting | EPG display |

### Verification Commands

```bash
npx tsc --noEmit
npm test -- --grep "PlexStreamResolver"
```

### Rollback Procedure

```bash
git checkout -- src/modules/plex/stream/
```

---

## Module: channel-manager

### SSOT References

| Concept | File | Section |
| :--- | :--- | :--- |
| Interface | modules/channel-manager.md | `Public Interface` |
| Types | artifact-2-shared-types.ts | `CHANNEL CONFIGURATION` section |

### Active Assumptions

1. Store channels in localStorage
2. Handle quota exceeded gracefully
3. Validate channel config before save
4. Emit events on content resolution

### Scope Boundaries

| IN Scope | OUT of Scope |
| :--- | :--- |
| Channel CRUD | Schedule generation |
| Content source resolution | Playback control |
| Persistence | EPG rendering |
| Import/export | Video player |

### Verification Commands

```bash
npx tsc --noEmit
npm test -- --grep "ChannelManager"
```

### Rollback Procedure

```bash
git checkout -- src/modules/scheduler/channel-manager/
```

---

## Module: channel-scheduler

### SSOT References

| Concept | File | Section |
| :--- | :--- | :--- |
| Interface | modules/channel-scheduler.md | `Public Interface` |
| Algorithm | modules/channel-scheduler.md | `Schedule Calculation Algorithm` |
| Types | artifact-2-shared-types.ts | `SCHEDULE` section |
| Prompt | artifact-7-implementation-prompts.md | Prompt 3 |

### Active Assumptions

1. Use Mulberry32 PRNG for deterministic shuffle
2. Binary search for O(log n) program lookup
3. Timer syncs every 1 second
4. Handle clock drift up to 500ms gracefully

### Scope Boundaries

| IN Scope | OUT of Scope |
| :--- | :--- |
| Schedule generation | Content resolution |
| Time-based queries | Video playback |
| Program events | Stream resolution |
| Shuffle/order | UI rendering |

### Verification Commands

```bash
npx tsc --noEmit
npm test -- --grep "ChannelScheduler"
npm test -- --grep "ShuffleGenerator"
```

### Rollback Procedure

```bash
git checkout -- src/modules/scheduler/scheduler/
```

---

## Module: video-player

### SSOT References

| Concept | File | Section |
| :--- | :--- | :--- |
| Interface | modules/video-player.md | `Public Interface` |
| Types | artifact-2-shared-types.ts | `VIDEO PLAYER` section |
| Prompt | artifact-7-implementation-prompts.md | Prompt 4 |

### Active Assumptions

1. webOS has native HLS support - DO NOT use HLS.js
2. Keep-alive required every 30s to prevent suspension
3. Retry errors with exponential backoff (max 3 attempts)
4. Video element CSS: absolute positioning, 100% size

### Scope Boundaries

| IN Scope | OUT of Scope |
| :--- | :--- |
| HTML5 video abstraction | Stream URL resolution |
| Playback control | Schedule management |
| Subtitle management | Channel switching logic |
| Error retry | EPG rendering |

### Verification Commands

```bash
npx tsc --noEmit
npm test -- --grep "VideoPlayer"
```

### Rollback Procedure

```bash
git checkout -- src/modules/player/
```

---

## Module: navigation

### SSOT References

| Concept | File | Section |
| :--- | :--- | :--- |
| Interface | modules/navigation.md | `Public Interface` |
| Key codes | modules/navigation.md | `KEY_MAP` section |
| Types | artifact-2-shared-types.ts | `NAVIGATION` section |
| Prompt | artifact-7-implementation-prompts.md | Prompt 5 |

### Active Assumptions

1. webOS key code 461 = Back button (differs from standard)
2. Long press threshold: 500ms
3. Focus memory per screen enabled
4. Modal traps focus until closed

### Scope Boundaries

| IN Scope | OUT of Scope |
| :--- | :--- |
| Key event handling | Video playback |
| Focus management | Content fetching |
| Screen navigation | Schedule generation |
| Modal handling | EPG data |

### Verification Commands

```bash
npx tsc --noEmit
npm test -- --grep "NavigationManager"
npm test -- --grep "FocusManager"
```

### Rollback Procedure

```bash
git checkout -- src/modules/navigation/
```

---

## Module: epg-ui

### SSOT References

| Concept | File | Section |
| :--- | :--- | :--- |
| Interface | modules/epg-ui.md | `Public Interface` |
| Types | artifact-2-shared-types.ts | `EPG (ELECTRONIC PROGRAM GUIDE)` section |
| Prompt | artifact-7-implementation-prompts.md | Prompt 6 |

### Active Assumptions

1. Virtualization required: max 200 DOM elements
2. Buffer 2 rows above/below visible area
3. pixelsPerMinute: 4 (default)
4. rowHeight: 80px (default)

### Scope Boundaries

| IN Scope | OUT of Scope |
| :--- | :--- |
| Grid rendering | Schedule generation |
| Virtualization | Video playback |
| Focus navigation | Channel CRUD |
| Info panel | Authentication |

### Verification Commands

```bash
npx tsc --noEmit
npm test -- --grep "EPGComponent"
```

### Rollback Procedure

```bash
git checkout -- src/modules/ui/epg/
```

---

## Module: app-lifecycle

### SSOT References

| Concept | File | Section |
| :--- | :--- | :--- |
| Interface | modules/app-lifecycle.md | `Public Interface` |
| Types | artifact-2-shared-types.ts | `APP LIFECYCLE` section |

### Active Assumptions

1. webOS visibility API for background/foreground
2. Save state before any phase transition
3. Error recovery presents user options
4. Memory monitoring required

### Scope Boundaries

| IN Scope | OUT of Scope |
| :--- | :--- |
| Lifecycle events | Video playback |
| State persistence | Schedule generation |
| Error recovery | Authentication flow |
| Network monitoring | EPG rendering |

### Verification Commands

```bash
npx tsc --noEmit
npm test -- --grep "AppLifecycle"
```

### Rollback Procedure

```bash
git checkout -- src/modules/lifecycle/
```

---

## Module: app-orchestrator

### SSOT References

| Concept | File | Section |
| :--- | :--- | :--- |
| Interface | modules/app-orchestrator.md | `Public Interface` |
| Dependencies | artifact-1-dependency-graph.json | `app-orchestrator` node |

### Active Assumptions

1. Orchestrator is the central event hub
2. Initialize modules in dependency order
3. Handle cross-module error propagation
4. Manage application startup/shutdown

### Scope Boundaries

| IN Scope | OUT of Scope |
| :--- | :--- |
| Module coordination | Individual module implementation |
| Event routing | Plex API calls |
| Startup sequence | Schedule algorithms |
| Shutdown cleanup | UI rendering details |

### Verification Commands

```bash
npx tsc --noEmit
npm test -- --grep "Orchestrator"
npm run build
```

### Rollback Procedure

```bash
git checkout -- src/Orchestrator.ts
```
