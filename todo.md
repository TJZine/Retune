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
> See: `spec-pack/modules/plex-auth.md#jwt-authentication-flow`

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

- [ ] Keyboard quick reference overlay (Info button)
- [ ] Rate limiting module (if Plex API issues arise)
- [ ] Favorite channels feature
- [ ] Channel reordering in settings
- [ ] Multiple user profile support

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
