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

### TEST-012: Expired Plex token mid-playback triggers re-auth + clears state
- **Area**: plex-auth / player
- **Risk**: BLOCKING
- **Why**: Plex tokens can expire/revoke; playback URLs include `X-Plex-Token` and should fail cleanly without looping or leaving stale credentials.
- **Setup**: webOS device/emulator; valid Plex account; ability to invalidate token (sign out from Plex, rotate token, or manually edit stored token in `localStorage`).
- **Steps**:
  1. Sign in and start playback of a channel.
  2. While playing, invalidate the token (e.g., edit `localStorage` token to a bad value and reload, or revoke token from Plex account page).
  3. Trigger any Plex API call: change channel (forces library/stream resolution) or wait for progress reporting.
  4. Relaunch app after failure.
- **Expected**: App exits playback gracefully; user is redirected to auth; no infinite retries; persisted auth data is cleared or replaced with a fresh token on re-auth.
- **Instrumentation**: console logs for auth failures; lifecycle phase transitions; `localStorage` keys `retune_plex_auth` and `retune_selected_server`.
- **Related Code**: `src/modules/plex/auth/PlexAuth.ts:188`

### TEST-018: Cold start honors PlexAuth + discovery SSOT
- **Area**: plex-auth / plex-server-discovery
- **Risk**: HIGH
- **Why**: Restart flows must use persisted auth and server selection without relying on app state.
- **Setup**: `localStorage` seeded with `retune_plex_auth` (valid token) and `retune_selected_server` (valid server ID); ensure `retune_app_state` is missing or has `plexAuth: null`.
- **Steps**:
  1. Set `retune_plex_auth` with a valid token and reload the app.
  2. Set `retune_selected_server` to a known server ID and reload.
  3. Remove `retune_selected_server` and reload.
- **Expected**: App validates token and bypasses auth UI; reconnects to saved server when selection exists; navigates to server select when selection is missing.
- **Instrumentation**: console logs for auth validation; network calls to `plex.tv/api/v2/resources`; `localStorage` values for `retune_plex_auth` and `retune_selected_server`.
- **Related Code**: `src/Orchestrator.ts:888`, `src/modules/plex/auth/PlexAuth.ts:233`, `src/modules/plex/discovery/PlexServerDiscovery.ts:454`

## 2. Server Selection / Mixed Content

### TEST-013: Mixed-content playback decision tree works for direct play and HLS transcode
- **Area**: plex-stream-resolver / plex-server-discovery
- **Risk**: BLOCKING
- **Why**: HTTPS-hosted webOS apps may block HTTP Plex servers (mixed content). Resolver must prefer HTTPS, then relay, else fail with actionable error.
- **Setup**: App served over HTTPS; a Plex server that exposes only LAN HTTP connection and (optionally) a relay/remote HTTPS connection; media that both direct-plays and requires transcode.
- **Steps**:
  1. Select the server and attempt to play a direct-play compatible item.
  2. Attempt to play an item that requires transcoding (forces `/video/:/transcode/universal/start.m3u8`).
  3. Disable remote access/relay and repeat step 2.
- **Expected**: Direct play and transcode both succeed via HTTPS connection when available; otherwise fall back to relay with a warning; if no HTTPS/relay exists, resolver throws `MIXED_CONTENT_BLOCKED` and UI offers a “Change Server”/recovery path.
- **Instrumentation**: network panel (blocked mixed content vs successful HTTPS); console warnings about relay; player error events.
- **Related Code**: `src/modules/plex/stream/PlexStreamResolver.ts:401`

### TEST-014: Relay-only server playback works and emits relay diagnostics
- **Area**: plex-server-discovery / plex-stream-resolver
- **Risk**: HIGH
- **Why**: Some users can only access servers via relay; app should still work and provide diagnostics when relay is used (bandwidth/latency constraints).
- **Setup**: Plex account with access to a server where only relay connection succeeds (disable LAN and direct remote connections if possible).
- **Steps**:
  1. Discover servers and select the relay-only server.
  2. Start playback of multiple items (direct-play + transcode).
  3. Observe buffering/latency behavior.
- **Expected**: Playback succeeds; relay selection does not silently masquerade as a direct HTTPS connection; diagnostic warning is present at least once (rate-limited if necessary).
- **Instrumentation**: console warnings; measured startup/buffer times; discovery-selected connection URI.
- **Related Code**: `src/Orchestrator.ts:233`

### TEST-015: plex.tv and PMS rate limiting (429) backs off and does not hang
- **Area**: plex-server-discovery / plex-library
- **Risk**: HIGH
- **Why**: Rate limiting is common on plex.tv and can also happen on PMS; retry loops must be bounded and respect `Retry-After`.
- **Setup**: Network proxy/devtools override to force 429 responses for `https://plex.tv/api/v2/resources` and for a PMS library endpoint (e.g., `/library/sections`).
- **Steps**:
  1. Force `resources` to respond 429 with `Retry-After: 2` for the first request, then 200.
  2. Launch app and observe server discovery behavior.
  3. Force PMS `library/sections` to respond 429 repeatedly.
  4. Trigger library browsing.
- **Expected**: Discovery waits and retries once then proceeds; library backs off a bounded number of times and ultimately surfaces a `RATE_LIMITED` error (no infinite hang).
- **Instrumentation**: request counts and timestamps; UI responsiveness; error overlays.
- **Related Code**: `src/modules/plex/library/PlexLibrary.ts:593`

### TEST-019: Direct-play partKey cannot override base origin
- **Area**: plex-stream-resolver
- **Risk**: HIGH
- **Why**: Prevents mixed-content bypass and token leakage if metadata contains absolute or malformed `partKey` values.
- **Setup**: Dev build with ability to stub media metadata for a stream (e.g., override part key in a local fixture or mock response).
- **Steps**:
  1. Return a `partKey` that is an absolute HTTP URL pointing to a different origin (e.g., `http://example.com/library/parts/1/file.mp4`).
  2. Start playback in an HTTPS-hosted app session.
  3. Inspect the resulting playback URL.
- **Expected**: Playback URL is built against the selected Plex server origin (or HTTPS/relay fallback), not the absolute origin from `partKey`; token is not sent to external origins.
- **Instrumentation**: network panel origins requested; console warnings/errors for mixed-content handling.
- **Related Code**: `src/modules/plex/stream/PlexStreamResolver.ts:515`

## 3. Library Browsing / Content Resolution

## 4. Channel Manager CRUD / Persistence

## 5. Scheduler Correctness / Drift / Pause-Resume

## 6. Player Playback / Tracks / Error Recovery

### TEST-017: Progress reporting budget aborts (no accumulating in-flight requests)
- **Area**: plex-stream-resolver / player
- **Risk**: MEDIUM
- **Why**: Progress reporting is “fire and forget” but must not leak requests under slow or blocked networks.
- **Setup**: webOS emulator with network throttling (high latency / packet loss); active playback.
- **Steps**:
  1. Start playback and enable extreme latency (e.g., 2s RTT).
  2. Let playback run for 2 minutes (multiple progress reports).
  3. Inspect the number of in-flight `/:/timeline` requests over time.
- **Expected**: Timeline requests abort quickly (<=100ms budget) and do not accumulate; playback continues.
- **Instrumentation**: network panel (pending requests); `progressTimeout` events/logs if surfaced.
- **Related Code**: `src/modules/plex/stream/PlexStreamResolver.ts:221`

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

### TEST-020: D-pad hold repeat (delay/interval) and boundary stop
- **Area**: navigation / focus
- **Risk**: HIGH
- **Why**: Hold-to-repeat is essential for TV UX; repeat must be bounded and stop at edges (no wrap unless configured).
- **Setup**: webOS device/emulator; screen with multiple focusables in a line/grid and at least one edge boundary.
- **Steps**:
  1. Navigate focus to the left/top edge of a focus group.
  2. Press and hold Left/Up for 2 seconds.
  3. Press and hold Right/Down for 2 seconds from a non-edge position.
  4. Release the button; confirm movement stops immediately.
- **Expected**: At edges, focus does not wrap and repeat stops once boundary is reached; away from edges, focus advances after the configured delay and continues at the configured interval until key-up.
- **Instrumentation**: console logs (if enabled); verify no runaway timers after release.
- **Related Code**: `src/modules/navigation/NavigationManager.ts:614`, `src/modules/navigation/FocusManager.ts:424`

### TEST-021: Channel number entry (timeout/partial/invalid channel feedback)
- **Area**: navigation / orchestrator
- **Risk**: HIGH
- **Why**: Direct channel entry is a core remote UX; partial input must timeout/commit, and invalid channels must produce user-visible feedback.
- **Setup**: webOS device/emulator; a known channel lineup with gaps (e.g., channels 1, 2, 5 exist; 999 does not).
- **Steps**:
  1. Enter a valid 1–3 digit channel number quickly (e.g., `1 0 5`), confirm immediate commit at max digits.
  2. Enter a 1–2 digit number and pause >2s, confirm commit on timeout.
  3. Enter an invalid channel number (e.g., `999`).
  4. Enter leading-zero numbers (e.g., `0 5`) and confirm consistent behavior (either normalize to `5` or reject with feedback).
- **Expected**: Valid entries switch channels; timeout commits partial input; invalid numbers do not crash and surface an actionable error (e.g., “Channel not found”) without leaving input “stuck”.
- **Instrumentation**: app error UI/logs; channel manager “current channel” state; any channel-input overlay if present.
- **Related Code**: `src/modules/navigation/NavigationManager.ts:723`, `src/Orchestrator.ts:1144`

### TEST-022: Modal focus trap + focus restoration after close
- **Area**: navigation / focus
- **Risk**: MEDIUM
- **Why**: Modals must not leak focus to underlying UI and must restore focus on close to avoid “lost focus” states.
- **Setup**: webOS device/emulator; any modal flow that opens on Back (e.g., exit confirmation).
- **Steps**:
  1. Focus a known element on the player screen.
  2. Open the modal (e.g., Back on root player to open exit confirm).
  3. Attempt to D-pad to focus elements outside the modal.
  4. Close the modal and confirm focus returns to the original element (or a sensible default if it no longer exists).
- **Expected**: While modal is open, focus cannot move outside modal scope; after close, focus restores reliably (no “stuck” focus ring).
- **Instrumentation**: navigation focusChange events; DOM focus ring/class state.
- **Related Code**: `src/modules/navigation/NavigationManager.ts:274`, `src/modules/navigation/FocusManager.ts:178`

## 8. EPG Overlay / Virtualization / Selection

### TEST-023: Guide toggle open/close restores focus without “lost focus”
- **Area**: epg / navigation
- **Risk**: HIGH
- **Why**: The guide is a primary navigation surface; opening/closing must be reliable and not strand focus.
- **Setup**: webOS device/emulator; active playback; at least one channel schedule loaded.
- **Steps**:
  1. While playing, press Guide to open EPG.
  2. Navigate within EPG (Up/Down/Left/Right) for 10–20 moves.
  3. Press Back to close EPG.
  4. Press Guide again to re-open; repeat 3 cycles quickly.
- **Expected**: EPG opens and closes deterministically; EPG always shows a visible focused cell when open; closing returns control to player UI (no stuck focus/ghost highlight).
- **Instrumentation**: EPG open/close events; navigation keyPress logs; DOM focus/highlight classes.
- **Related Code**: `src/modules/ui/epg/EPGComponent.ts:380`, `src/Orchestrator.ts:1144`

### TEST-024: EPG DOM cap under dense schedules (<=200 cells)
- **Area**: epg / performance
- **Risk**: HIGH
- **Why**: TV hardware needs strict DOM bounds; dense schedules (short programs) are a worst-case input.
- **Setup**: webOS device/emulator; test schedule data with very short programs (e.g., 5-minute slots) across many channels.
- **Steps**:
  1. Open EPG and load a dense schedule across enough channels to fill the viewport + buffers.
  2. Scroll vertically and horizontally for 60 seconds.
  3. Periodically inspect `.epg-cell` element count.
- **Expected**: The number of `.epg-cell` elements stays at or below `EPG_CONSTANTS.MAX_DOM_ELEMENTS` with stable performance; no unbounded growth in pooled elements.
- **Instrumentation**: DOM inspector element counts; performance panel for frame time and GC churn.
- **Related Code**: `src/modules/ui/epg/EPGVirtualizer.ts:187`

### TEST-025: EPG focus highlight persists across scroll-driven renders
- **Area**: epg / UX
- **Risk**: MEDIUM
- **Why**: Virtualized UIs often lose focus styling during recycling; highlight must persist so users can orient.
- **Setup**: webOS device/emulator; schedules covering a full day (or at least > visibleHours window).
- **Steps**:
  1. Open EPG and focus a program near the left edge of the visible time window.
  2. Navigate Left/Right until time scrolling occurs.
  3. Navigate Up/Down until channel scrolling occurs.
  4. After each scroll, verify the focused program cell remains highlighted.
- **Expected**: Focus highlight remains on the logically focused program after each virtualization re-render; OK selects the highlighted program/channel consistently.
- **Instrumentation**: DOM `.focused` class presence; EPG focusChange events.
- **Related Code**: `src/modules/ui/epg/EPGComponent.ts:844`, `src/modules/ui/epg/EPGVirtualizer.ts:187`

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

### TEST-008: Debounced persistence survives quota errors

- **Area**: app-lifecycle / persistence
- **Risk**: BLOCKING
- **Why**: `saveState()` schedules an async save; if `localStorage.setItem()` throws (quota / storage disabled), unhandled rejections can break lifecycle handling and silently drop state.
- **Setup**: webOS device/emulator; ability to fill `localStorage` near quota (or use devtools overrides).
- **Steps**:
  1. Launch app and reach `ready` phase.
  2. Fill `localStorage` to near-quota (or simulate `QuotaExceededError`).
  3. Trigger `saveState()` repeatedly (e.g., background/foreground; change settings).
  4. Observe whether any unhandled promise rejection occurs.
- **Expected**: App does not crash; state save failure is handled gracefully (user-visible warning or recoverable error path) and normal operation continues.
- **Instrumentation**: global `unhandledrejection` handler logs; lifecycle error overlay behavior; `localStorage` contents.
- **Related Code**: `src/modules/lifecycle/AppLifecycle.ts:165`

### TEST-009: Corrupt persisted state is detected and self-heals

- **Area**: app-lifecycle / state-manager
- **Risk**: HIGH
- **Why**: A malformed or partially-valid persisted blob can pass shallow validation and put the app into inconsistent states (e.g., treating invalid `plexAuth` as “has credentials”).
- **Setup**: webOS device/emulator; ability to edit `localStorage` keys.
- **Steps**:
  1. Write invalid JSON to `retune_app_state` (e.g., `{`).
  2. Relaunch app and observe startup path.
  3. Write valid JSON with wrong nested shapes (e.g., `"plexAuth": 0`, `"userPreferences": []`).
  4. Relaunch app and observe startup path and error handling.
- **Expected**: App falls back to defaults and/or clears corrupted state; does not get stuck or crash; lifecycle phase is coherent.
- **Instrumentation**: lifecycle phase transitions; error overlay; any storage reset behavior.
- **Related Code**: `src/modules/lifecycle/StateManager.ts:73`

### TEST-010: Network monitoring does not spam errors offline/CORS-blocked

- **Area**: app-lifecycle / network
- **Risk**: MEDIUM
- **Why**: Periodic connectivity checks can fail due to true offline, captive portals, or CORS behavior; this must not produce repeated error overlays or timer leaks.
- **Setup**: webOS device/emulator; ability to toggle network; captive portal / DNS blackhole if possible.
- **Steps**:
  1. Launch app online, observe initial network state.
  2. Toggle offline/online repeatedly; leave offline for > 2 intervals.
  3. If possible, simulate a request that fails fast (e.g., blocked by network policy) and observe timers.
- **Expected**: `networkChange` reflects online/offline; errors are rate-limited and do not produce repeated blocking UI; no accumulating timers.
- **Instrumentation**: network logs; error overlay frequency; devtools performance timeline for timers.
- **Related Code**: `src/modules/lifecycle/AppLifecycle.ts:234`

## 10. Security & Privacy

### TEST-011: No sensitive identifiers leak to logs or storage beyond necessity

- **Area**: logging / persistence
- **Risk**: HIGH
- **Why**: Plex auth tokens and user identifiers are stored in `localStorage` and errors are logged globally; ensure no token/email leaks via logs and persisted content remains minimal.
- **Setup**: webOS device/emulator with real Plex auth; inspector access to console + `localStorage`.
- **Steps**:
  1. Sign in and play content.
  2. Force common failure modes (server unreachable, auth expired) and observe logs.
  3. Inspect `localStorage` keys/values related to auth and lifecycle.
- **Expected**: No logs contain `X-Plex-Token` values or raw tokens; stored auth data is limited to what is required; sensitive fields are not unnecessarily persisted.
- **Instrumentation**: console output; `localStorage` inspection; captured error payloads.
- **Related Code**: `src/modules/plex/auth/PlexAuth.ts:249`

### TEST-016: Connection URI sanitization blocks unexpected schemes/credentials
- **Area**: plex-server-discovery
- **Risk**: HIGH
- **Why**: Prevent SSRF-like requests or malformed URL handling if discovery data is corrupted or malicious.
- **Setup**: Dev build with ability to stub/override the `resources` response (proxy, service worker, or devtools local overrides).
- **Steps**:
  1. Modify a resource’s `connections[].uri` to a non-http(s) scheme (e.g., `file://...`) and re-run discovery.
  2. Modify to include credentials (e.g., `https://user:pass@example.com:32400`) and re-run discovery.
  3. Modify to include a path/query (e.g., `https://example.com:32400/bad?x=1`) and re-run discovery.
  4. Attempt to select the server and play content.
- **Expected**: Invalid connection URIs are ignored/skipped; app never attempts fetches to non-http(s) or credentialed origins; selection either chooses a valid connection or fails gracefully.
- **Instrumentation**: console warnings about skipped connections; network panel origins requested.
- **Related Code**: `src/modules/plex/discovery/PlexServerDiscovery.ts:575`

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
