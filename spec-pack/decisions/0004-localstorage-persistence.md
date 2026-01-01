# ADR-004: localStorage for State Persistence

## Status

Accepted

## Context

Retune needs to persist several types of data across app sessions:

1. **Authentication**: Plex tokens and user info
2. **Channel configurations**: User-defined virtual channels
3. **App state**: Current channel, volume, preferences
4. **Server selection**: Preferred Plex server and connection

webOS provides several storage options:

- `localStorage`: Web standard, synchronous, 5MB limit
- `sessionStorage`: Cleared on app close (unsuitable)
- `IndexedDB`: Async, complex API, more storage
- webOS Storage Service: Native API, requires Luna calls

## Decision

Use **localStorage** for all persistence needs with the following strategies:

1. **Compression**: Use LZ-string compression for large data (channels)
2. **Quota handling**: Monitor usage, evict non-critical data on pressure
3. **Versioned keys**: Include schema version in keys for migration

Storage keys:

```typescript
const STORAGE_KEYS = {
  AUTH: 'retune_plex_auth',           // ~1KB
  CHANNELS: 'retune_channels',         // ~50KB compressed
  APP_STATE: 'retune_app_state',       // ~500B
  SELECTED_SERVER: 'retune_server',    // ~200B
} as const;
```

## Consequences

### Positive

- **Simplicity**: Standard Web API, no dependencies
- **Synchronous**: No async complexity for basic reads
- **Reliable**: Well-tested across all webOS versions
- **Debug-friendly**: Can inspect in DevTools

### Negative

- **5MB limit**: Requires compression for larger datasets
- **Main thread blocking**: Large reads can block (mitigate with chunking)
- **No transactions**: Race conditions possible (mitigate with version stamps)
- **No encryption**: Sensitive data stored in plain text

## Implementation Details

### Compression Strategy

```typescript
import LZString from 'lz-string';

function saveChannels(channels: ChannelConfig[]): void {
  const json = JSON.stringify(channels);
  const compressed = LZString.compressToUTF16(json);
  
  try {
    localStorage.setItem(STORAGE_KEYS.CHANNELS, compressed);
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      // Evict old data and retry
      evictNonCriticalData();
      localStorage.setItem(STORAGE_KEYS.CHANNELS, compressed);
    }
  }
}
```

### Quota Monitoring

```typescript
function getStorageUsage(): { used: number; available: number } {
  let used = 0;
  for (const key of Object.keys(localStorage)) {
    used += localStorage.getItem(key)?.length ?? 0;
  }
  // localStorage uses UTF-16, so multiply by 2
  const usedBytes = used * 2;
  return {
    used: usedBytes,
    available: 5 * 1024 * 1024 - usedBytes
  };
}
```

### Migration Support

```typescript
interface StoredData<T> {
  version: number;
  data: T;
}

function loadWithMigration<T>(key: string, migrate: (old: any, v: number) => T): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  
  const stored: StoredData<T> = JSON.parse(raw);
  if (stored.version < CURRENT_VERSION) {
    return migrate(stored.data, stored.version);
  }
  return stored.data;
}
```

## Alternatives Considered

### 1. IndexedDB

**Rejected**: API complexity not justified for our data volumes. Async operations complicate initialization sequence. webOS 4.0 IndexedDB has known bugs.

### 2. webOS Storage Service

**Rejected**: Requires Luna Service Bridge integration. Adds platform-specific code path. Standard Web API preferred for portability.

### 3. Remote storage (Plex attrs)

**Rejected**: Adds server dependency. Round-trip latency affects startup time. Works offline is a requirement.

### 4. File System API

**Rejected**: Not available on webOS. Would require native bridge.

## Security Considerations

- Plex tokens stored in localStorage are accessible to anyone with physical device access
- This is acceptable for a TV app - no multi-user scenarios
- If security concerns arise, consider webOS's secure storage service

## References

- [localStorage MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
- [LZ-String compression](https://github.com/pieroxy/lz-string)
