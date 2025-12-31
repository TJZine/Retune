# Platform Constraints & Technical Guidelines

This document consolidates all platform-specific constraints, performance budgets, and technical guidelines for the Retune webOS application.

---

## 1. API Rate Limiting Strategy

> [!IMPORTANT]
> **Constraint**: plex.tv API allows ~100 requests/minute. Implement rate limiting to prevent 429 errors.

### Implementation

```typescript
/**
 * Rate limiter for Plex API calls
 * Uses token bucket algorithm with configurable rates
 */
class PlexRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms
  
  constructor(config: RateLimitConfig = {
    maxRequestsPerMinute: 80,  // 80% of limit for safety margin
    burstSize: 10
  }) {
    this.maxTokens = config.burstSize;
    this.tokens = this.maxTokens;
    this.refillRate = config.maxRequestsPerMinute / 60000;
    this.lastRefill = Date.now();
  }
  
  async acquire(): Promise<void> {
    this.refill();
    
    if (this.tokens < 1) {
      const waitTime = (1 - this.tokens) / this.refillRate;
      await this.sleep(waitTime);
      this.refill();
    }
    
    this.tokens -= 1;
  }
  
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Usage in PlexApiClient
class PlexApiClient {
  private readonly rateLimiter = new PlexRateLimiter();
  
  async fetch<T>(url: string, options?: RequestInit): Promise<T> {
    await this.rateLimiter.acquire();
    // ... existing fetch logic
  }
}
```

### Rate Limit Configuration

| Endpoint Type | Rate Limit | Burst |
| :--- | :--- | :--- |
| plex.tv (auth, resources) | 80/min | 10 |
| Local Plex Server | 200/min | 20 |
| Image transcoding | 50/min | 5 |

---

## 2. Mixed Content Security (HTTPS/HTTP)

> [!WARNING]
> **Issue**: The app is served over HTTPS but local Plex servers often use HTTP. Modern browsers block mixed content.

### Solution Strategy

1. **Prefer HTTPS connections** when available from server discovery
2. **CSP Header**: Configure Content Security Policy to allow upgrade-insecure-requests
3. **Relay fallback**: Use Plex relay (plex.direct) for servers without HTTPS
4. **Document limitation**: Local HTTP-only servers may not be fully accessible

### Implementation

```typescript
function selectBestConnection(connections: PlexConnection[]): PlexConnection | null {
  // Priority order:
  // 1. Local HTTPS
  // 2. Remote HTTPS (plex.direct)
  // 3. Relay HTTPS
  // 4. Local HTTP (may be blocked)
  
  const sorted = connections.sort((a, b) => {
    const scoreA = getConnectionScore(a);
    const scoreB = getConnectionScore(b);
    return scoreB - scoreA;
  });
  
  return sorted[0] ?? null;
}

function getConnectionScore(conn: PlexConnection): number {
  let score = 0;
  if (conn.protocol === 'https') score += 100;
  if (conn.local) score += 50;
  if (!conn.relay) score += 25;
  score -= conn.latencyMs ?? 0;
  return score;
}
```

### User Communication

When HTTPS unavailable:

```typescript
const ERROR_MESSAGES = {
  MIXED_CONTENT: 'This server requires a secure connection. Please enable HTTPS on your Plex server or use remote access.'
};
```

---

## 3. Memory Budget Per Module

**Total App Budget**: 300MB peak

| Module | Budget | Notes |
| :--- | :--- | :--- |
| Core (EventEmitter, Utils) | 5MB | Baseline |
| Plex Auth | 10MB | Token storage, user data |
| Plex Server Discovery | 15MB | Server list, connection testing |
| Plex Library | 50MB | Cached library metadata |
| Channel Manager | 30MB | Channel configs, resolved content |
| Channel Scheduler | 20MB | Active schedule index |
| Video Player | 80MB | Video buffer, element |
| EPG UI | 50MB | Virtualized grid, DOM pool |
| Navigation | 10MB | Focus state, screen stack |
| App Lifecycle | 5MB | State persistence |
| Orchestrator | 5MB | Event bindings |
| **Reserve** | 20MB | Headroom |

### Memory Monitoring

```typescript
// In AppLifecycle module
class MemoryMonitor {
  private readonly WARNING_THRESHOLD = 250 * 1024 * 1024; // 250MB
  private readonly CRITICAL_THRESHOLD = 280 * 1024 * 1024; // 280MB
  
  startMonitoring(intervalMs: number = 30000): void {
    setInterval(() => this.check(), intervalMs);
  }
  
  private check(): void {
    if (!performance.memory) return; // Not available in all contexts
    
    const used = performance.memory.usedJSHeapSize;
    
    if (used > this.CRITICAL_THRESHOLD) {
      console.error('[Memory] CRITICAL: Forcing garbage collection');
      this.emit('memoryWarning', { level: 'critical', used });
      this.forceCleanup();
    } else if (used > this.WARNING_THRESHOLD) {
      console.warn('[Memory] WARNING: Approaching limit');
      this.emit('memoryWarning', { level: 'warning', used });
    }
  }
  
  private forceCleanup(): void {
    // Clear caches
    this.emit('clearCaches');
    // Force DOM recycling
    this.emit('forceRecycle');
  }
}
```

---

## 4. Session Management & Cleanup

### Plex Session Lifecycle

```typescript
interface SessionManager {
  // Called when stream starts
  startSession(itemKey: string): string; // Returns sessionId
  
  // Called periodically (every 30s)
  updateProgress(sessionId: string, positionMs: number): void;
  
  // Called when stream ends or changes
  endSession(sessionId: string, positionMs: number): void;
  
  // Called on app backgrounding
  pauseAllSessions(): void;
  
  // Called on app foregrounding
  resumeActiveSession(): void;
  
  // Cleanup orphaned sessions (on app start)
  cleanupOrphanedSessions(): Promise<void>;
}
```

### Session Timeout Rules

| Event | Timeout | Action |
| :--- | :--- | :--- |
| No progress update | 5 minutes | Plex auto-terminates |
| Network disconnect | 30 seconds | Attempt reconnect |
| App backgrounded | Immediate | Pause session |
| App closed | Immediate | End session |

---

## 5. localStorage Quota Handling

**Limit**: ~5MB per origin

### Implementation

```typescript
const STORAGE_KEYS = {
  AUTH: 'retune_plex_auth',          // ~2KB
  CHANNELS: 'retune_channels',        // ~50KB (target)
  SETTINGS: 'retune_settings',        // ~1KB
  FOCUS_MEMORY: 'retune_focus',       // ~1KB
  LAST_CHANNEL: 'retune_last_channel' // ~100B
};

class StorageManager {
  private readonly QUOTA_BUFFER = 100 * 1024; // 100KB buffer
  
  async set(key: string, value: unknown): Promise<void> {
    const serialized = JSON.stringify(value);
    const size = new Blob([serialized]).size;
    
    try {
      localStorage.setItem(key, serialized);
    } catch (error) {
      if (this.isQuotaError(error)) {
        console.error('[Storage] Quota exceeded, attempting cleanup');
        await this.cleanup();
        
        try {
          localStorage.setItem(key, serialized);
        } catch (retryError) {
          throw new AppError(
            AppErrorCode.STORAGE_QUOTA_EXCEEDED,
            ERROR_MESSAGES.STORAGE.QUOTA_EXCEEDED,
            false
          );
        }
      }
      throw error;
    }
  }
  
  private isQuotaError(error: unknown): boolean {
    return error instanceof DOMException && (
      error.code === 22 || // Legacy
      error.code === 1014 || // Firefox
      error.name === 'QuotaExceededError'
    );
  }
  
  private async cleanup(): Promise<void> {
    // Remove non-critical data
    localStorage.removeItem(STORAGE_KEYS.FOCUS_MEMORY);
    // Compact channel data
    await this.compactChannels();
  }
}
```

---

## 6. CSS Custom Properties

Define in `public/css/main.css`:

```css
:root {
  /* Focus system */
  --focus-color: #00a8e1;
  --focus-ring-width: 4px;
  --focus-scale: 1.02;
  --focus-transition: 150ms ease-out;
  
  /* Colors */
  --primary-color: #e5a00d;
  --error-color: #ff4444;
  --success-color: #4caf50;
  --warning-color: #ff9800;
  
  /* Surfaces */
  --surface-primary: rgba(0, 0, 0, 0.95);
  --surface-secondary: rgba(255, 255, 255, 0.1);
  --surface-elevated: rgba(255, 255, 255, 0.15);
  
  /* Text */
  --text-primary: rgba(255, 255, 255, 1);
  --text-secondary: rgba(255, 255, 255, 0.7);
  --text-disabled: rgba(255, 255, 255, 0.4);
  
  /* Spacing */
  --safe-zone: 5%;
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  
  /* Typography */
  --font-family: 'LG Smart', 'Roboto', sans-serif;
  --font-size-sm: 18px;
  --font-size-md: 24px;
  --font-size-lg: 32px;
  --font-size-xl: 48px;
  
  /* EPG */
  --epg-row-height: 80px;
  --epg-channel-width: 200px;
  --epg-pixels-per-minute: 4;
  
  /* Player */
  --player-overlay-bg: linear-gradient(to top, rgba(0,0,0,0.9), transparent);
}
```

---

## 7. Timer Drift Handling

> [!NOTE]
> **Issue**: JavaScript timers (setInterval) drift over time. For 24-hour operation, drift can exceed several minutes.

### Threshold Rationale

```typescript
const TIMER_CONFIG = {
  // Normal timer interval
  SYNC_INTERVAL_MS: 1000,
  
  // Maximum acceptable drift before soft correction
  // 500ms allows for small variations without visible impact
  MAX_DRIFT_MS: 500,
  
  // Drift threshold triggering hard resync
  // 2000ms indicates system was likely suspended/resumed
  RESYNC_THRESHOLD_MS: 2000,
  
  // Rationale:
  // - 500ms drift: User won't notice program boundary off by 0.5s
  // - 2000ms drift: Likely app was backgrounded, needs full recalculation
  // - Soft correction adjusts next tick timing
  // - Hard resync recalculates current program from wall clock
};
```

---

## 8. Subtitle Burn-In Strategy

### When to Request Burn-In

```typescript
function determineSubtitleDelivery(
  track: SubtitleTrack,
  playerCapabilities: PlayerCapabilities
): SubtitleDelivery {
  // Image-based subtitles (PGS, VOBSUB) require burn-in
  if (['pgs', 'vobsub', 'dvdsub'].includes(track.format)) {
    return 'burn';
  }
  
  // ASS/SSA with styling may need burn-in for full fidelity
  if (track.format === 'ass' && track.hasComplexStyling) {
    return 'burn';
  }
  
  // Text-based subtitles can be delivered as sidecar
  if (['srt', 'vtt', 'webvtt'].includes(track.format)) {
    return 'sidecar';
  }
  
  // Default to embedded if supported
  return 'embed';
}
```

### Plex Transcode Parameters

```typescript
const SUBTITLE_PARAMS = {
  burn: {
    subtitles: 'burn',
    subtitleSize: 100,  // Percentage
    subtitleColor: '#FFFFFFFF'
  },
  sidecar: {
    subtitleStreamID: track.id
  },
  embed: {
    // No additional params, Plex embeds automatically
  }
};
```

---

## 9. Event Handler Error Isolation

### Error Recovery Strategy

```typescript
class RobustEventEmitter<EventMap> {
  private errorHandler: (event: string, error: Error) => void;
  
  constructor(options: { onHandlerError?: (event: string, error: Error) => void } = {}) {
    this.errorHandler = options.onHandlerError ?? this.defaultErrorHandler;
  }
  
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const handlers = this.handlers.get(event as string);
    if (!handlers) return;
    
    handlers.forEach(handler => {
      try {
        handler(payload);
      } catch (error) {
        // 1. Log error for debugging
        console.error(`[EventEmitter] Handler error for '${String(event)}':`, error);
        
        // 2. Report via error handler (can be customized)
        this.errorHandler(String(event), error as Error);
        
        // 3. Continue with other handlers (critical: don't break chain)
      }
    });
  }
  
  private defaultErrorHandler(event: string, error: Error): void {
    // Emit to global error tracking if available
    if (window.reportError) {
      window.reportError(error);
    }
  }
}
```

---

## 10. Magic Remote Pointer Mode

### Configuration

```typescript
interface PointerModeConfig {
  enabled: boolean;           // Default: true
  cursorHideDelayMs: number; // Default: 3000
  scrollSensitivity: number; // Default: 1.0
}
```

### Implementation

```typescript
class PointerModeHandler {
  private isActive: boolean = false;
  private hideTimer: number | null = null;
  
  initialize(config: PointerModeConfig): void {
    if (!config.enabled) return;
    
    // Detect pointer movement
    document.addEventListener('mousemove', this.handlePointerMove);
    
    // Detect clicks
    document.addEventListener('click', this.handlePointerClick);
  }
  
  private handlePointerMove = (event: MouseEvent): void => {
    if (!this.isActive) {
      this.isActive = true;
      this.emit('pointerModeChange', { active: true });
      document.body.classList.add('pointer-mode');
    }
    
    // Reset hide timer
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      this.isActive = false;
      this.emit('pointerModeChange', { active: false });
      document.body.classList.remove('pointer-mode');
    }, this.config.cursorHideDelayMs);
  };
  
  private handlePointerClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    const focusable = target.closest('.focusable');
    
    if (focusable) {
      // Trigger focus and selection
      this.navigation.setFocus(focusable.id);
      this.navigation.triggerSelect();
    }
  };
}
```

### CSS for Pointer Mode

```css
/* Hide focus ring when using pointer */
body.pointer-mode .focusable:focus {
  box-shadow: none;
  transform: none;
}

/* Show hover state instead */
body.pointer-mode .focusable:hover {
  background: var(--surface-elevated);
  cursor: pointer;
}
```

---

## 11. Verification Commands

Add to each module spec:

```bash
# TypeScript compilation
npx tsc --noEmit

# Module-specific tests
npm test -- --grep "ModuleName"

# Integration tests
npm run test:integration

# Performance check
npm run test:perf

# Memory snapshot
npm run test:memory
```

---

## Summary Checklist

- [x] Rate limiting implemented for Plex API calls
- [x] Mixed content strategy documented with fallback
- [x] Memory budgets defined per module
- [x] Session lifecycle management specified
- [x] localStorage quota handling with cleanup
- [x] CSS custom properties defined
- [x] Timer drift thresholds explained
- [x] Subtitle burn-in rules documented
- [x] Event handler error isolation pattern
- [x] Magic Remote pointer mode behavior
