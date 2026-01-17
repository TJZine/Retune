# Retune - Post-MVP Todo List

## Technical Risks & Mitigations (Priority: High)

### 1. EPG Virtualization Performance

**Analysis:** Implementing a performant virtualized grid (5 channels x 3 hours) on generic TV hardware is the highest technical risk. DOM element count must stay under 200 to maintain 60fps.

**Configuration:** `EPG_CONFIG.MAX_DOM_ELEMENTS = 200`

#### Strategy A: CSS Containment (Recommended)

- **Pros:** Native browser optimization, minimal code complexity.
- **Cons:** Support varies on very old webOS versions (pre-4.0).
- **Implementation:** Apply `contain: strict` to grid cells to isolate layout reflows.

#### Strategy B: Object Pooling

- **Pros:** Nullifies garbage collection pauses, constant memory usage.
- **Cons:** High complexity to implement, harder to debug.
- **Implementation:** Recycle DOM nodes instead of destroying/creating them during scroll events.

#### Strategy C: Paginated Fallback

- **Pros:** Guaranteed performance, simple implementation.
- **Cons:** Worse user experience (page-by-page instead of smooth scroll).
- **Implementation:** Use as fallback if `requestAnimationFrame` drops below 30fps consistently.

### 2. Mixed Content Handling (HTTPS vs HTTP)

**Analysis:** The app will likely be served via HTTPS (locally or hosted), but Plex servers often run on HTTP (local IP) or HTTPS with self-signed certs (`plex.direct`). webOS may block mixed content requests.

#### Strategy A: Prioritize Secure Connections (Recommended)

- **Pros:** Compliant with modern browser security, no special config needed.
- **Cons:** May add latency if using public relay when local secure connection fails.
- **Implementation:** In `PlexServerDiscovery`, prioritize connections with `protocol: 'https'` and `local: true` (DNS rebinding relies on router support).

#### Strategy B: Relay Fallback

- **Pros:** Guaranteed to work via `relay.plex.tv` (HTTPS).
- **Cons:** Bandwidth limits (2Mbps for free users), high latency.
- **Implementation:** Fallback to `relay` connection type if local direct connection fails.

#### Strategy C: Local Proxy / Auth-less (Not Recommended)

- **Pros:** Works on old devices.
- **Cons:** Security risk, requires user to disable "Secure Connections" in PMS.

---

## Plex JWT Authentication (Future - Per ADR-006)

> Currently using legacy PIN flow. JWT is the recommended Plex auth flow.
> Track JWT auth work as a standalone doc under `docs/` when ready (flow + endpoints + rollback).

- [ ] JWK generation and persistence (Ed25519 key pair)
- [ ] Device JWT signing for PIN polling
- [ ] Token refresh flow (`/auth/nonce` → signed JWT → `/auth/token`)
- [ ] `/auth/jwk` registration endpoint (for migrating existing tokens)

---

## Future Enhancements

### Telemetry Module (Priority: Medium)

- [ ] Create opt-in telemetry module for error reporting
- [ ] Implement crash reporting (Sentry or similar)
- [ ] Add performance metrics collection
- [ ] Create privacy-compliant data handling
- [ ] Add user-facing opt-in toggle in settings
- [ ] Document in privacy policy for app store submission

### Storybook UI Testing (Priority: Low)

- [ ] Add Storybook configuration
- [ ] Create stories for main UI components
- [ ] Add visual regression testing

### Other Nice-to-Haves

- [ ] Memory diagnostics per module (`ModuleStatus.memoryUsageMB`) for testing and debugging
- [ ] EPG guide focus rule: preserve guide focus unless last change was channel up/down; decide number-entry behavior
- [ ] AbortController-based channel switching (abort previous resolve when user rapidly switches channels)
- [ ] Clear Cache feature (actual cache clearing via Settings screen - common QOL feature in Plex apps)
- [ ] Keyboard quick reference overlay (Info button)
- [ ] Rate limiting module (if Plex API issues arise)
- [ ] Favorite channels feature
- [ ] Channel reordering in settings
- [ ] Multiple user profile support

---

## webOS Device Testing Required

> These issues require empirical testing on actual webOS hardware before making code changes.

### Player: Retry Seek Position Preservation (#5)

**Background**: The `RetryManager._retryPlayback()` sets `currentTime` after `load()`. Per HTML5 spec, `load()` resets `currentTime` to 0. The correct pattern is to wait for `loadedmetadata` before seeking.

**Current Code** (RetryManager.ts:162-168):

```typescript
this._videoElement.load();
this._videoElement.currentTime = currentTime;  // May be overwritten by load() reset
this._videoElement.play();
```

**Test Procedure**:

1. Start playback, seek to 5+ minutes
2. Simulate network error (disconnect/reconnect WiFi or use Plex bandwidth limits)
3. Observe: Does playback resume at the same position or restart from 0?

**Expected Behavior**: Playback should resume at the position before the error.

**If Broken - Recommended Fix**:

```typescript
this._videoElement.load();
const seekPosition = currentTime;
const onMetadata = () => {
    this._videoElement.removeEventListener('loadedmetadata', onMetadata);
    this._videoElement.currentTime = seekPosition;
    this._videoElement.play();
};
this._videoElement.addEventListener('loadedmetadata', onMetadata);
```

---

### Player: Keep-Alive Mechanism Validation (#6)

**Background**: `KeepAliveManager` dispatches synthetic `click` events on `document` every 30s to prevent webOS app suspension. LG documentation confirms this is NOT an officially supported mechanism.

**Current Code** (KeepAliveManager.ts:36-37):

```typescript
document.dispatchEvent(new Event('click'));
```

**Test Procedure**:

1. Start playback of long content (2+ hours)
2. Leave TV idle (no remote input) for 30+ minutes
3. Observe: Does playback continue or does webOS suspend the app?

**Alternative Approaches to Test if Current Fails**:

- `document.dispatchEvent(new CustomEvent('__keepalive__', { bubbles: false }))`
- `document.body.focus()` (focus manipulation)
- `window.dispatchEvent(new Event('mousemove'))` (mouse simulation)
- webOS Luna Service API: `com.webos.service.power/setState`

**If All Fail**: May need to implement proper webOS media session via `webOS.service.request` to `com.webos.media`

---

## Notes

### Telemetry Implementation Plan

```text
Phase 1: Basic crash reporting (Sentry free tier)
- Capture unhandled exceptions
- Capture playback errors
- No user identification

Phase 2: Usage analytics (optional, opt-in)
- Feature usage counts
- Session duration
- Performance metrics
```
