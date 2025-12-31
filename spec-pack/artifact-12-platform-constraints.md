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

## 12. Centralized Logging Interface

> [!NOTE]
> **Purpose**: Consistent log format across all modules for debugging on-device and in development.

```typescript
/**
 * Application Logger Interface
 * Use this instead of console.* for structured logging
 */
interface ILogger {
  debug(module: string, message: string, data?: unknown): void;
  info(module: string, message: string, data?: unknown): void;
  warn(module: string, message: string, data?: unknown): void;
  error(module: string, message: string, error?: Error, data?: unknown): void;
  performance(module: string, operation: string, durationMs: number): void;
}

class AppLogger implements ILogger {
  private readonly LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
  private currentLevel: number = 1; // Default: info
  
  private format(
    level: string, 
    module: string, 
    message: string, 
    data?: unknown
  ): string {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}${dataStr}`;
  }
  
  debug(module: string, message: string, data?: unknown): void {
    if (this.currentLevel <= 0) {
      console.debug(this.format('debug', module, message, data));
    }
  }
  
  info(module: string, message: string, data?: unknown): void {
    if (this.currentLevel <= 1) {
      console.info(this.format('info', module, message, data));
    }
  }
  
  warn(module: string, message: string, data?: unknown): void {
    if (this.currentLevel <= 2) {
      console.warn(this.format('warn', module, message, data));
    }
  }
  
  error(module: string, message: string, error?: Error, data?: unknown): void {
    console.error(this.format('error', module, message, { 
      ...data, 
      errorMessage: error?.message,
      stack: error?.stack 
    }));
  }
  
  performance(module: string, operation: string, durationMs: number): void {
    if (this.currentLevel <= 0) {
      console.debug(this.format('perf', module, `${operation}: ${durationMs}ms`));
    }
  }
  
  setLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
    this.currentLevel = this.LOG_LEVELS[level];
  }
}

// Global singleton
export const logger = new AppLogger();
```

**Usage**:

```typescript
import { logger } from './utils/logger';

logger.info('PlexAuth', 'PIN requested', { pinId: 12345 });
logger.error('VideoPlayer', 'Stream failed', error, { url: streamUrl });
logger.performance('ChannelScheduler', 'getProgramAtTime', 2.5);
```

---

## 13. Startup Time Budget

> [!IMPORTANT]
> **Constraint**: Cold start to playback must complete within 8 seconds for optimal user experience.

| Phase | Budget | Cumulative |
|-------|--------|------------|
| App shell render | 500ms | 500ms |
| Module initialization | 1000ms | 1500ms |
| Auth validation | 1500ms | 3000ms |
| Server connection | 2000ms | 5000ms |
| Channel load | 1500ms | 6500ms |
| First stream start | 1500ms | 8000ms |

**Measurement**:

```typescript
class StartupProfiler {
  private marks: Map<string, number> = new Map();
  
  mark(phase: string): void {
    this.marks.set(phase, performance.now());
    logger.performance('Startup', phase, this.getElapsed());
  }
  
  getElapsed(): number {
    return performance.now() - (this.marks.get('start') ?? 0);
  }
  
  checkBudget(): boolean {
    return this.getElapsed() < 8000;
  }
}
```

---

## 14. Unified Retry Policy

> [!TIP]
> **Purpose**: Consistent retry behavior across all network operations to reduce code duplication.

```typescript
interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryOn: (error: Error) => boolean;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryOn: (error) => {
    // Retry on network errors, not on 4xx client errors
    if (error instanceof TypeError && error.message.includes('fetch')) return true;
    if ('status' in error && typeof error.status === 'number') {
      return error.status >= 500 || error.status === 408 || error.status === 429;
    }
    return false;
  }
};

async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error;
  
  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (!cfg.retryOn(lastError) || attempt === cfg.maxAttempts) {
        throw lastError;
      }
      
      const delay = Math.min(
        cfg.baseDelayMs * Math.pow(cfg.backoffMultiplier, attempt - 1),
        cfg.maxDelayMs
      );
      
      logger.warn('Retry', `Attempt ${attempt} failed, retrying in ${delay}ms`, {
        error: lastError.message
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}
```

**Usage in modules**:

```typescript
// PlexAuth
const response = await withRetry(() => fetch(url, options));

// VideoPlayer - more aggressive retries
const stream = await withRetry(() => this.loadStream(url), {
  maxAttempts: 5,
  baseDelayMs: 500
});
```

---

## 15. Accessibility Test Commands

Add these commands to CI/CD for accessibility validation:

```bash
# Focus ring visibility check
npm run test:a11y:focus

# Color contrast audit (requires manual setup)
npm run test:a11y:contrast

# Keyboard navigation coverage
npm run test:a11y:keyboard
```

**Focus Visibility Test**:

```typescript
describe('Accessibility: Focus Visibility', () => {
  it('should have focus ring with minimum 4px outline', () => {
    const focusedElement = document.querySelector('.focused');
    const styles = window.getComputedStyle(focusedElement!);
    const outline = parseFloat(styles.outlineWidth || '0');
    const boxShadow = styles.boxShadow;
    
    expect(outline >= 4 || boxShadow !== 'none').toBe(true);
  });
  
  it('should have visible focus on all interactive elements', () => {
    const focusables = document.querySelectorAll('.focusable');
    focusables.forEach(el => {
      (el as HTMLElement).focus();
      const styles = window.getComputedStyle(el);
      expect(styles.outline !== 'none' || styles.boxShadow !== 'none').toBe(true);
    });
  });
  
  it('should have text contrast ratio >= 4.5:1', () => {
    // Note: Requires color contrast calculation library
    // Example assertion
    const ratio = calculateContrastRatio('#ffffff', '#000000');
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
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
- [x] Centralized logging interface
- [x] Startup time budget defined
- [x] Unified retry policy
- [x] Accessibility test commands
