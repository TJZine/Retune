# Issue Registry (Static Review)

Centralized list of issues found during phase-by-phase static review.

## Entry Template

```markdown
### ISSUE-XXX: <Title>
- **Severity**: BLOCKING / WARNING / SUGGESTION
- **Category**: Security / Performance / Correctness / UX / Maintainability / Spec Drift
- **Location**: <file:line>
- **Description**: <what is wrong>
- **Impact**: <what breaks / risk>
- **Recommendation**: <specific fix>
- **Suggested Tests**: TEST-XXX (in `docs/review/WHAT-TO-TEST.md`)
```

### ISSUE-001: HLS transcode URL ignored mixed content fallback
- **Severity**: BLOCKING
- **Category**: Correctness / Security
- **Location**: `src/modules/plex/stream/PlexStreamResolver.ts:401`
- **Status**: Resolved (mixed-content fallback applied to transcode URLs)
- **Description**: `getTranscodeUrl()` previously returned `${serverUri}/video/:/transcode/...` without mixed-content mitigation; HTTPS-hosted apps cannot fetch HTTP server resources on webOS/Chromium.
- **Impact**: Playback fails when transcoding is required and the selected server connection is HTTP-only; can look like “random” playback failures depending on media compatibility.
- **Recommendation**: Apply the same mixed-content decision tree as direct-play (prefer HTTPS connection, then relay, else throw `MIXED_CONTENT_BLOCKED`). Implemented via `_selectBaseUriForMixedContent()`.
- **Suggested Tests**: TEST-013

### ISSUE-002: Server connection URIs were not normalized/validated (SSRF-like surface)
- **Severity**: HIGH
- **Category**: Security / Robustness
- **Location**: `src/modules/plex/discovery/PlexServerDiscovery.ts:552`
- **Status**: Resolved (connection URIs normalized to safe origins)
- **Description**: `connections[].uri` from `plex.tv/api/v2/resources` was stored and later used as a base for fetches without validating scheme/credentials or stripping paths/queries.
- **Impact**: A malicious/compromised resource entry could cause requests to unexpected origins (including sending Plex headers/token) and/or break URL construction.
- **Recommendation**: Parse with `new URL()`, allow only `http:`/`https:`, reject credentials, and normalize to `origin` before storing/using.
- **Suggested Tests**: TEST-016

### ISSUE-003: Direct-play URL token injection was not URL-safe
- **Severity**: HIGH
- **Category**: Correctness / Security
- **Location**: `src/modules/plex/stream/PlexStreamResolver.ts:508`
- **Status**: Resolved (URL/URLSearchParams used for token injection)
- **Description**: Direct-play URLs were built via string concatenation and appended `?X-Plex-Token=...`, which breaks when `partKey` already has query params and fails to encode tokens safely.
- **Impact**: Some items can fail to play; token could be malformed in URL, causing intermittent auth failures.
- **Recommendation**: Build with `new URL(partKey, baseUri)` and set token via `url.searchParams.set('X-Plex-Token', token)`.
- **Suggested Tests**: TEST-013

### ISSUE-004: PlexLibrary 429 handling could loop indefinitely
- **Severity**: HIGH
- **Category**: Correctness / Performance
- **Location**: `src/modules/plex/library/PlexLibrary.ts:593`
- **Status**: Resolved (429 retries bounded)
- **Description**: On repeated `429` responses, `_fetchWithRetry()` would back off and retry forever.
- **Impact**: Requests can hang indefinitely and accumulate user-facing stalls under rate limiting conditions.
- **Recommendation**: Cap 429 retries and surface `RATE_LIMITED` after max attempts.
- **Suggested Tests**: TEST-015

### ISSUE-005: Progress reporting timeout did not abort the underlying fetch
- **Severity**: MEDIUM
- **Category**: Performance / Robustness
- **Location**: `src/modules/plex/stream/PlexStreamResolver.ts:221`
- **Status**: Resolved (AbortController-based timeout)
- **Description**: `withTimeout()` returned a sentinel after 100ms but the underlying `fetch()` continued, potentially accumulating in-flight requests on slow networks.
- **Impact**: Timer/fetch buildup under poor connectivity; increased memory and network overhead.
- **Recommendation**: Use `AbortController` to abort progress requests at the 100ms budget and emit `progressTimeout` for diagnostics.
- **Suggested Tests**: TEST-017

### ISSUE-006: Plex token is persisted redundantly in localStorage
- **Severity**: WARNING
- **Category**: Security / Privacy
- **Location**: `src/modules/plex/auth/PlexAuth.ts:254`
- **Status**: Resolved (SSOT: `retune_plex_auth` for auth, `retune_selected_server` for server selection; app state ignores `plexAuth`)
- **Description**: Plex auth data is persisted in `retune_plex_auth` (PlexAuth) and also inside `retune_app_state` (AppLifecycle/StateManager).
- **Impact**: Increases exposure surface (more places to scrub on logout, more chances of accidental logging/serialization, larger persistence blob).
- **Recommendation**: Keep Plex auth persisted only in PlexAuth storage and ensure app state does not retain duplicate credentials.
- **Suggested Tests**: TEST-011, TEST-012

### ISSUE-007: HTTPS fallback selection could silently choose relay as “HTTPS connection”
- **Severity**: MEDIUM
- **Category**: Correctness / UX
- **Location**: `src/Orchestrator.ts:233`
- **Status**: Resolved (use discovery helpers for HTTPS/relay selection)
- **Description**: Stream resolver config previously chose the first `protocol === 'https'` connection, which could be a relay; this bypassed the “relay fallback” warning path.
- **Impact**: Relay usage (bandwidth-limited) could occur without diagnostic signal and be harder to explain to users.
- **Recommendation**: Use `PlexServerDiscovery.getHttpsConnection()` (non-relay) and `getRelayConnection()` for the intended decision tree.
- **Suggested Tests**: TEST-014

### ISSUE-008: Server discovery lacked caching and could contribute to 429s
- **Severity**: MEDIUM
- **Category**: Performance / Spec Drift
- **Location**: `src/modules/plex/discovery/PlexServerDiscovery.ts:71`
- **Status**: Resolved (cache discovery results for 5 minutes)
- **Description**: `discoverServers()` previously called plex.tv on every invocation despite `SERVER_CACHE_DURATION_MS` existing.
- **Impact**: Extra plex.tv load, slower startup flows, increased likelihood of rate limiting.
- **Recommendation**: Cache discovery results for `SERVER_CACHE_DURATION_MS` and only refresh explicitly.
- **Suggested Tests**: TEST-015

### ISSUE-009: Direct-play partKey could override base origin
- **Severity**: HIGH
- **Category**: Security / Correctness
- **Location**: `src/modules/plex/stream/PlexStreamResolver.ts:515`
- **Status**: Resolved (partKey normalized to base origin)
- **Description**: `_buildUrlWithToken()` used `new URL(partKey, baseUri)` directly; if `partKey` were absolute (or included a different scheme/host), it could bypass mixed-content selection and send `X-Plex-Token` to an unexpected origin.
- **Impact**: Potential token leakage or mixed-content bypass if Plex metadata is malformed or malicious.
- **Recommendation**: Normalize `partKey` to path+query and always apply `baseUri` origin before appending the token.
- **Suggested Tests**: TEST-019

### ISSUE-010: EPG focus highlight can race virtualized rendering
- **Severity**: HIGH
- **Category**: UX / Correctness
- **Location**: `src/modules/ui/epg/EPGComponent.ts:380`
- **Status**: Resolved (focus re-applied post-render; focus-triggered renders ensured)
- **Description**: `focusProgram()` attempted to set focused cell immediately even when virtualization renders were RAF-throttled; on TV hardware this could leave the EPG with a “missing” focused cell (no highlight) or stale focus styling after scroll.
- **Impact**: Remote navigation feels broken/stuck; OK/Back work but user can’t see where focus is.
- **Recommendation**: Apply focus styling after `renderVisibleCells()` completes, and ensure a render occurs when scrolling is required or the target cell is not yet rendered.
- **Suggested Tests**: TEST-023, TEST-025

### ISSUE-011: EPGVirtualizer did not enforce `MAX_DOM_ELEMENTS`
- **Severity**: HIGH
- **Category**: Performance / Stability
- **Location**: `src/modules/ui/epg/EPGVirtualizer.ts:187`
- **Status**: Resolved (hard cap enforced; focused cell preserved)
- **Description**: Virtualization logic pooled/recycled elements but did not cap the number of simultaneously visible program cells; dense schedules (short programs) could exceed the `MAX_DOM_ELEMENTS` constraint.
- **Impact**: DOM bloat and frame drops on TV hardware; increased memory pressure and GC churn.
- **Recommendation**: Enforce an upper bound during cell selection (per-row and global cap) and guarantee the focused cell is included when present.
- **Suggested Tests**: TEST-024

### ISSUE-012: Retry metadata-timeout path could stall recovery/error reporting
- **Severity**: HIGH
- **Category**: Correctness / UX
- **Location**: `src/modules/player/RetryManager.ts:206`
- **Status**: Resolved (synthetic MediaError code hint consumed by VideoPlayerEvents)
- **Description**: On retry “zombie” states where neither `loadedmetadata` nor a real `MediaError` surfaced, RetryManager emitted an `error` event without `video.error`; VideoPlayerEvents ignored it and no retry/error emission occurred.
- **Impact**: Player can remain in “buffering” indefinitely with no user feedback and no bounded failure.
- **Recommendation**: Emit a recoverable synthetic MediaError code hint on timeout and teach the error handler to consume/clear it so existing retry/error flows remain consistent.
- **Suggested Tests**: TEST-003

### ISSUE-013: Remote navigation repeat + channel number entry were not end-to-end functional
- **Severity**: HIGH
- **Category**: UX / Correctness
- **Location**: `src/modules/navigation/NavigationManager.ts:614`
- **Status**: Resolved (D-pad repeat timers; channel entry validation; orchestrator wiring)
- **Description**: D-pad repeat config existed but navigation ignored repeated input; channel number entry emitted events but was not wired to channel switching, and commit could emit `NaN` under edge timing.
- **Impact**: Holding D-pad feels unresponsive; channel number entry appears to “do nothing” or can surface invalid channel errors inconsistently.
- **Recommendation**: Implement repeat using `keyRepeatDelayMs`/`keyRepeatIntervalMs`, validate channel commits, and wire `channelNumberEntered` to `switchToChannelByNumber()`.
- **Suggested Tests**: TEST-020, TEST-021

### ISSUE-014: Spatial focus fallback can trigger layout thrash in large focus maps
- **Severity**: WARNING
- **Category**: Performance
- **Location**: `src/modules/navigation/FocusManager.ts:424`
- **Status**: Resolved (single-rect-per-candidate + no sort)
- **Description**: Spatial fallback computed `getBoundingClientRect()` multiple times per candidate (directly and via `_isVisible()`), which can force repeated layout reads and scale poorly when many focusables are registered.
- **Impact**: Directional navigation can feel laggy in dense screens if explicit neighbor/group navigation isn’t configured.
- **Recommendation**: Keep explicit neighbors/groups for dense screens; spatial fallback now reuses a single `DOMRect` per candidate per navigation attempt and selects the best candidate without sorting.
- **Suggested Tests**: TEST-020
