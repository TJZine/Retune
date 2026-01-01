# Logging Patterns Guide

This document defines logging patterns and best practices for consistent, useful logging across all Retune modules.

## Logger Interface

The `ILogger` interface is defined in `artifact-2-shared-types.ts`:

```typescript
interface ILogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error, data?: Record<string, unknown>): void;
}
```

## Log Levels

| Level | When to Use | Production Behavior |
|:------|:------------|:--------------------|
| `debug` | Development details, function entry/exit, variable values | Suppressed in production |
| `info` | Significant events: module init, state changes, API calls | Logged to console |
| `warn` | Recoverable issues: retries, fallbacks, deprecated usage | Logged to console |
| `error` | Unrecoverable errors, exceptions, critical failures | Logged to console + error tracking |

## Module Tag Convention

Every log message MUST include a module tag prefix in brackets:

```typescript
// Good
logger.info('[PlexAuth] Token validated successfully');
logger.warn('[Scheduler] Schedule calculation took 150ms, exceeds 50ms budget');
logger.error('[VideoPlayer] Stream load failed', error);

// Bad - no module tag
logger.info('Token validated');
logger.error('Failed to load');
```

### Module Tags

| Module | Tag |
|:-------|:----|
| Event Emitter | `[EventEmitter]` |
| Plex Auth | `[PlexAuth]` |
| Plex Server Discovery | `[PlexDiscovery]` |
| Plex Library | `[PlexLibrary]` |
| Plex Stream Resolver | `[PlexStream]` |
| Channel Manager | `[ChannelManager]` |
| Channel Scheduler | `[Scheduler]` |
| Video Player | `[VideoPlayer]` |
| Navigation | `[Navigation]` |
| EPG UI | `[EPG]` |
| App Lifecycle | `[Lifecycle]` |
| App Orchestrator | `[Orchestrator]` |

## Structured Data

Always include relevant context as structured data in the second parameter:

```typescript
// Good - structured data
logger.info('[PlexLibrary] Fetching library items', {
  libraryId: '1',
  offset: 100,
  limit: 100
});

// Bad - string concatenation
logger.info(`[PlexLibrary] Fetching library 1 items offset 100 limit 100`);
```

## Performance Logging

Log operations that have performance budgets with timing:

```typescript
// Pattern: Log with duration when exceeding threshold
const start = performance.now();
const items = await this.fetchItems(libraryId);
const duration = performance.now() - start;

if (duration > 100) { // > 100ms threshold
  logger.warn('[PlexLibrary] Slow library fetch', {
    libraryId,
    durationMs: Math.round(duration),
    itemCount: items.length,
    threshold: 100
  });
}
```

## Error Logging

Always include the original error and context:

```typescript
// Good - includes error and context
try {
  await this.loadStream(descriptor);
} catch (error) {
  logger.error('[VideoPlayer] Failed to load stream', error as Error, {
    url: descriptor.url,
    protocol: descriptor.protocol,
    retryCount: this.retryCount
  });
  throw error; // Re-throw after logging
}

// Bad - losing error context
catch (error) {
  logger.error('[VideoPlayer] Stream error');
  throw new Error('Stream failed'); // Lost original error
}
```

## State Transition Logging

Log important state changes:

```typescript
// Pattern: Before/after state
logger.info('[Lifecycle] State transition', {
  from: previousState,
  to: newState,
  trigger: 'visibilitychange'
});

// Pattern: Module initialization
logger.info('[PlexAuth] Module initialized', {
  hasStoredCredentials: !!existingToken,
  clientIdentifier: this.config.clientIdentifier
});
```

## API Request/Response Logging

Log API calls with sanitized data (no tokens):

```typescript
// Pattern: Request logging
logger.debug('[PlexLibrary] API request', {
  endpoint: '/library/sections',
  method: 'GET'
  // DO NOT log: headers, tokens, full URLs with tokens
});

// Pattern: Response logging
logger.debug('[PlexLibrary] API response', {
  endpoint: '/library/sections',
  status: 200,
  itemCount: response.MediaContainer.size,
  durationMs: elapsed
});
```

## User Action Logging

Log meaningful user interactions for debugging:

```typescript
// Pattern: User action
logger.info('[Navigation] Screen change', {
  from: 'home',
  to: 'guide',
  trigger: 'keyPress'
});

logger.info('[EPG] Channel selected', {
  channelId: channel.id,
  channelNumber: channel.number,
  programTitle: program?.item.title
});
```

## What NOT to Log

| Do Not Log | Why | Alternative |
|:-----------|:----|:------------|
| Auth tokens | Security | Log `hasToken: true/false` |
| Full URLs with tokens | Security | Log endpoint path only |
| User emails | Privacy | Log `userId` only |
| Large objects | Memory/noise | Log summary (count, size) |
| Every loop iteration | Noise | Log start/end with count |
| In production: debug | Performance | Use log levels properly |

## Production Logger Implementation

```typescript
class AppLogger implements ILogger {
  private readonly isDebugEnabled: boolean;
  
  constructor(config: { debugEnabled?: boolean } = {}) {
    this.isDebugEnabled = config.debugEnabled ?? false;
  }
  
  debug(message: string, data?: Record<string, unknown>): void {
    if (this.isDebugEnabled) {
      console.debug(this.format(message, data));
    }
  }
  
  info(message: string, data?: Record<string, unknown>): void {
    console.info(this.format(message, data));
  }
  
  warn(message: string, data?: Record<string, unknown>): void {
    console.warn(this.format(message, data));
  }
  
  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    console.error(this.format(message, { ...data, error: error?.message }));
    
    // Report to error tracking in production
    if (typeof window !== 'undefined' && (window as any).ErrorReporter) {
      (window as any).ErrorReporter.captureException(error, { extra: data });
    }
  }
  
  private format(message: string, data?: Record<string, unknown>): string {
    if (!data || Object.keys(data).length === 0) {
      return message;
    }
    return `${message} ${JSON.stringify(data)}`;
  }
}

// Singleton instance
export const logger: ILogger = new AppLogger({
  debugEnabled: process.env.NODE_ENV !== 'production'
});
```

## Testing with Logs

Mock the logger in tests to verify logging behavior:

```typescript
describe('PlexAuth', () => {
  let mockLogger: jest.Mocked<ILogger>;
  
  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
  });
  
  it('should log successful authentication', async () => {
    const auth = new PlexAuth(config, mockLogger);
    await auth.claimPin('pin-123');
    
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[PlexAuth] PIN claimed successfully',
      expect.objectContaining({ pinId: 'pin-123' })
    );
  });
  
  it('should log errors with context', async () => {
    const auth = new PlexAuth(config, mockLogger);
    
    await expect(auth.claimPin('invalid')).rejects.toThrow();
    
    expect(mockLogger.error).toHaveBeenCalledWith(
      '[PlexAuth] PIN claim failed',
      expect.any(Error),
      expect.objectContaining({ pinId: 'invalid' })
    );
  });
});
```

## Log Volume Guidelines

| Event Type | Log Level | Frequency |
|:-----------|:----------|:----------|
| Module init/destroy | `info` | Once per lifecycle |
| API calls | `debug` | Every call |
| State transitions | `info` | On change |
| User actions | `info` | On action |
| Timer ticks | `debug` | Never (too frequent) |
| Frame renders | `debug` | Never |
| Error recovery | `warn` | Each attempt |
| Fatal errors | `error` | Each occurrence |

## Memory and Performance Considerations

1. **Avoid string concatenation in log calls** - use structured data
2. **Don't log in hot paths** (render loops, timer ticks)
3. **Use `debug` level for high-frequency events** - suppressed in production
4. **Keep structured data small** - log IDs not full objects
5. **Don't await log calls** - logging should be fire-and-forget
