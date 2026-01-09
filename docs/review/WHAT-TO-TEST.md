# What To Test (Pre-Launch)

This document is the centralized backlog of runtime tests to execute later (emulator/TV/manual/automation), created during static review.

## How To Add Entries

Add new entries to the appropriate section using this template:

```markdown
### TEST-XXX: <Short Title>
- **Area**: <module/feature>
- **Risk**: BLOCKING / HIGH / MEDIUM / LOW
- **Why**: <what could break; user impact>
- **Setup**: <accounts, data, mocks, device, network>
- **Steps**:
  1. ...
  2. ...
- **Expected**: <exact observable behavior>
- **Instrumentation**: <logs/metrics to inspect>
- **Related Code**: <file:line>
```

## 0. Smoke / Build / Packaging

### TEST-001: webOS package smoke

- **Area**: packaging
- **Risk**: HIGH
- **Why**: Ensures the app can be packaged/launched on webOS.
- **Setup**: webOS emulator + `ares-*` tooling.
- **Steps**:
  1. `npm run build`
  2. Package and install on emulator
  3. Launch and open inspector
- **Expected**: App launches, no fatal errors, visible UI shell
- **Instrumentation**: browser console + webOS inspector
- **Related Code**: `dev-workflow.md:655`

## 1. Auth & Plex Connectivity

## 2. Server Selection / Mixed Content

## 3. Library Browsing / Content Resolution

## 4. Channel Manager CRUD / Persistence

## 5. Scheduler Correctness / Drift / Pause-Resume

## 6. Player Playback / Tracks / Error Recovery

### TEST-002: System media keys / media session behavior

- **Area**: video-player
- **Risk**: LOW
- **Why**: `IVideoPlayer` includes `requestMediaSession()` / `releaseMediaSession()` which are now implemented with feature detection; verify Media Session integration works on supported platforms and gracefully no-ops on others.
- **Setup**: webOS device/emulator with remote; also a desktop Chromium build to compare behavior.
- **Steps**:
  1. Start playback of a channel/program.
  2. Use any available system media controls (if present): play/pause/stop/seek.
  3. Verify "Now Playing" metadata appears (title, artwork) on platforms that support it.
  4. Background/foreground the app and repeat.
- **Expected**: On supported platforms, Media Session displays current media info and transport controls work. On unsupported platforms, no errors occur (graceful no-op).
- **Instrumentation**: app logs around player state changes; any platform media-session logs.
- **Related Code**: `src/modules/player/VideoPlayer.ts:631`

### TEST-003: Video playback start/pause/resume cycle

- **Area**: video-player
- **Risk**: HIGH
- **Why**: Core functionality; playback interruption can break user experience.
- **Setup**: webOS emulator or physical TV with valid Plex media.
- **Steps**:
  1. Launch app and start channel playback
  2. Press pause, wait 30 seconds, press play
  3. Repeat 5x
- **Expected**: Video resumes without buffering stall; audio syncs correctly.
- **Instrumentation**: Player state logs, buffered ranges
- **Related Code**: `src/modules/player/VideoPlayer.ts`

## 7. Navigation / Focus / Remote Input

### TEST-004: Remote key handling (all standard keys)

- **Area**: navigation
- **Risk**: HIGH
- **Why**: Remote is primary input; all keys must respond correctly.
- **Setup**: webOS device with physical remote.
- **Steps**:
  1. Navigate to EPG
  2. Test each key: Up, Down, Left, Right, OK, Back, Play, Pause, FF, REW, Stop
  3. Test color buttons (Red, Green, Yellow, Blue)
- **Expected**: Each key triggers expected action; no unhandled key codes.
- **Instrumentation**: Key event logs
- **Related Code**: `src/modules/navigation/RemoteHandler.ts`

## 8. EPG Overlay / Virtualization / Selection

## 9. Orchestrator Integration / Lifecycle

### TEST-005: App lifecycle pause/resume (backgrounding)

- **Area**: app-lifecycle
- **Risk**: BLOCKING
- **Why**: webOS suspends backgrounded apps; must handle visibility change.
- **Setup**: webOS device/emulator.
- **Steps**:
  1. Start playback
  2. Press HOME button (app goes to background)
  3. Wait 60 seconds, return to app
- **Expected**: Playback resumes from last position ±2s; no memory spike.
- **Instrumentation**: Visibility API logs, player position logs
- **Related Code**: `src/modules/lifecycle/AppLifecycle.ts`

### TEST-006: Keep-alive prevents suspension

- **Area**: app-lifecycle
- **Risk**: HIGH
- **Why**: webOS kills inactive apps after ~15 minutes; keep-alive must prevent this during playback.
- **Setup**: webOS device with playback running.
- **Steps**:
  1. Start channel playback
  2. Do not interact for 30 minutes
  3. Observe app status
- **Expected**: App remains active; playback continues uninterrupted.
- **Instrumentation**: Keep-alive heartbeat logs
- **Related Code**: `src/modules/player/KeepAliveManager.ts`

## 10. Security & Privacy

## 11. Performance / Memory / Long-Run Stability

### TEST-007: Memory profiling during long session

- **Area**: performance
- **Risk**: HIGH
- **Why**: webOS has strict memory limits (~300MB for 2021+ TVs).
- **Setup**: webOS device with Chrome DevTools attached.
- **Steps**:
  1. Take initial heap snapshot
  2. Navigate through EPG, switch channels 20x
  3. Take second heap snapshot after 1 hour
  4. Compare snapshots
- **Expected**: Memory growth < 10MB/hour; no obvious leaks.
- **Instrumentation**: Heap snapshots, performance.memory API
- **Related Code**: N/A (profiling)
