# Module: Channel Manager

## Metadata
- **ID**: `channel-manager`
- **Path**: `src/modules/scheduler/channel-manager/`
- **Primary File**: `ChannelManager.ts`
- **Test File**: `ChannelManager.test.ts`
- **Dependencies**: `plex-library`
- **Complexity**: high
- **Estimated LoC**: 600

## Purpose

Manages the creation, editing, deletion, and persistence of virtual channel configurations. Handles content resolution from various Plex sources (libraries, collections, shows, playlists, manual lists) and applies filtering/sorting rules to produce a final ordered content list for scheduling.

## Public Interface

```typescript
/**
 * Channel Manager Interface
 * CRUD operations and content resolution for channels
 */
export interface IChannelManager {
  // Channel CRUD
  createChannel(config: Partial<ChannelConfig>): Promise<ChannelConfig>;
  updateChannel(id: string, updates: Partial<ChannelConfig>): Promise<ChannelConfig>;
  deleteChannel(id: string): Promise<void>;
  
  // Retrieval
  getChannel(id: string): ChannelConfig | null;
  getAllChannels(): ChannelConfig[];
  getChannelByNumber(number: number): ChannelConfig | null;
  
  // Content Resolution
  resolveChannelContent(channelId: string): Promise<ResolvedChannelContent>;
  refreshChannelContent(channelId: string): Promise<ResolvedChannelContent>;
  
  // Ordering
  reorderChannels(orderedIds: string[]): void;
  setCurrentChannel(channelId: string): void;
  getCurrentChannel(): ChannelConfig | null;
  getNextChannel(): ChannelConfig | null;
  getPreviousChannel(): ChannelConfig | null;
  
  // Import/Export
  exportChannels(): string;
  importChannels(data: string): Promise<ImportResult>;
  
  // Persistence
  saveChannels(): Promise<void>;
  loadChannels(): Promise<void>;
  
  // Events
  on<K extends keyof ChannelManagerEventMap>(
    event: K,
    handler: (payload: ChannelManagerEventMap[K]) => void
  ): void;
}
```

## Required Exports

```typescript
// src/modules/scheduler/channel-manager/index.ts
export { ChannelManager } from './ChannelManager';
export { ContentResolver } from './ContentResolver';
export type { IChannelManager } from './interfaces';
export type {
  ChannelConfig,
  ChannelContentSource,
  LibraryContentSource,
  CollectionContentSource,
  ShowContentSource,
  PlaylistContentSource,
  ManualContentSource,
  MixedContentSource,
  ContentFilter,
  ResolvedChannelContent,
  ResolvedContentItem,
  PlaybackMode,
  SortOrder,
  ImportResult
} from './types';
```

## Implementation Requirements

### MUST Implement:

1. **Channel Configuration Persistence**
   - Store to localStorage with key `retune_channels`
   - Include schema version for migrations
   - Auto-save on any channel change

2. **Content Source Resolution**
   - `library`: Fetch all items from Plex library section
   - `collection`: Fetch items from Plex collection
   - `show`: Fetch episodes from TV show (optionally filtered by season)
   - `playlist`: Fetch items from Plex playlist
   - `manual`: Use pre-selected items with cached metadata
   - `mixed`: Combine multiple sources

3. **Content Filtering**
   - Filter by year, rating, genre, duration, watched status
   - Support operators: eq, neq, gt, gte, lt, lte, contains
   - Apply all filters AND-style

4. **Content Sorting**
   - Sort options: title, year, added date, duration
   - Each in ascending/descending order
   - Special: `episode_order` for TV shows

5. **Content Caching**
   - Cache resolved content with timestamp
   - Refresh if stale (> 1 hour) or forced
   - Include cache status in resolved content

### MUST NOT:

1. Store full content items (only references + minimal cached data)
2. Block UI during content resolution (use async)
3. Allow duplicate channel numbers
4. Create channels with empty content sources

### State Management:

```typescript
interface ChannelManagerState {
  channels: Map<string, ChannelConfig>;
  resolvedContent: Map<string, ResolvedChannelContent>;
  currentChannelId: string | null;
  channelOrder: string[];  // Ordered list of channel IDs
}
```

- **Persistence**: `localStorage` with key `retune_channels`
- **Content Cache**: In-memory only (reconstructed on launch)

### Error Handling (CRITICAL)

All content resolution and persistence operations must handle errors gracefully with appropriate recovery strategies.

#### Error Types and Recovery Matrix

| Error Scenario | Error Code | Recoverable | User Message | Recovery Strategy |
|----------------|------------|-------------|--------------|-------------------|
| Channel not found | `CHANNEL_NOT_FOUND` | No | "Channel not found" | Return null, no action |
| Plex server offline | `NETWORK_ERROR` | Yes | "Cannot connect to Plex server" | Use cached content if available, queue retry |
| Library deleted in Plex | `CONTENT_UNAVAILABLE` | Partial | "Some content is no longer available" | Filter out missing items, log warning, continue with remaining |
| Collection deleted | `CONTENT_UNAVAILABLE` | Partial | "Collection not found" | Mark channel as stale, notify user |
| No content after filters | `CHANNEL_EMPTY` | No | "No playable content matches your filters" | Notify user, suggest adjusting filters |
| Storage quota exceeded | `STORAGE_FULL` | Yes | "Storage full, clearing old data" | Prune old content caches, retry save |
| Invalid import JSON | `IMPORT_INVALID` | No | "Import file is invalid" | Return ImportResult with errors array |
| Filter field missing | `FILTER_ERROR` | Partial | "Filter could not be applied" | Skip invalid filter, apply remaining |
| Shuffle seed invalid | `CONFIG_ERROR` | Yes | (Silent) | Generate new seed from Date.now() |

#### Error Handling Implementation

```typescript
/**
 * Comprehensive error handling for content resolution
 */
async resolveChannelContent(
  channelId: string, 
  forceRefresh: boolean = false
): Promise<ResolvedChannelContent> {
  const channel = this.getChannel(channelId);
  
  // Error: Channel not found
  if (!channel) {
    throw new ChannelError('CHANNEL_NOT_FOUND', `Channel ${channelId} not found`);
  }
  
  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = this.state.resolvedContent.get(channelId);
    if (cached && !this.isStale(cached)) {
      return cached;
    }
  }
  
  try {
    // Attempt to resolve content from source
    let items = await this.resolveContentSource(channel.contentSource);
    
    // Apply filters with error tolerance
    if (channel.contentFilters?.length) {
      items = this.applyFiltersWithFallback(items, channel.contentFilters);
    }
    
    // Validate we have playable content
    const validItems = items.filter(item => item && item.durationMs > 0);
    
    if (validItems.length === 0) {
      throw new ChannelError('CHANNEL_EMPTY', 'No playable content found after filtering');
    }
    
    // Build and cache result
    const result = this.buildResolvedContent(channelId, validItems, channel);
    this.state.resolvedContent.set(channelId, result);
    
    // Update channel metadata
    channel.lastContentRefresh = Date.now();
    channel.itemCount = validItems.length;
    channel.totalDurationMs = result.totalDurationMs;
    await this.saveChannels();
    
    this.emit('contentResolved', result);
    return result;
    
  } catch (error) {
    return this.handleResolutionError(channelId, error);
  }
}

/**
 * Handle errors during content resolution with fallback to cache
 */
private handleResolutionError(
  channelId: string, 
  error: unknown
): ResolvedChannelContent {
  // Check if we have cached content to fall back to
  const cached = this.state.resolvedContent.get(channelId);
  
  if (error instanceof ChannelError) {
    // CHANNEL_EMPTY has no fallback
    if (error.code === 'CHANNEL_EMPTY') {
      throw error;
    }
    
    // NETWORK_ERROR - use cache if available
    if (error.code === 'NETWORK_ERROR' && cached) {
      console.warn(`Using cached content for ${channelId} due to network error`);
      this.emit('contentCacheFallback', { channelId, reason: error.code });
      return {
        ...cached,
        isStale: true,
        cacheReason: 'network_error'
      };
    }
    
    // CONTENT_UNAVAILABLE - partial recovery
    if (error.code === 'CONTENT_UNAVAILABLE' && cached) {
      console.warn(`Content unavailable for ${channelId}, using stale cache`);
      return {
        ...cached,
        isStale: true,
        cacheReason: 'content_unavailable'
      };
    }
  }
  
  // No cache available or unrecoverable error
  throw error;
}

/**
 * Apply filters with error tolerance - skip invalid filters
 */
private applyFiltersWithFallback(
  items: ResolvedContentItem[],
  filters: ContentFilter[]
): ResolvedContentItem[] {
  const validFilters: ContentFilter[] = [];
  
  for (const filter of filters) {
    try {
      // Validate filter has required properties
      if (!filter.field || !filter.operator || filter.value === undefined) {
        console.warn(`Invalid filter skipped:`, filter);
        continue;
      }
      validFilters.push(filter);
    } catch (e) {
      console.warn(`Filter validation failed:`, e);
    }
  }
  
  return this.applyFilters(items, validFilters);
}

/**
 * Custom error class for channel operations
 */
class ChannelError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly recoverable: boolean = false
  ) {
    super(message);
    this.name = 'ChannelError';
  }
}
```

#### Storage Error Handling

```typescript
/**
 * Save channels with quota management
 */
async saveChannels(): Promise<void> {
  const data = {
    version: 1,
    channels: Array.from(this.state.channels.values()),
    channelOrder: this.state.channelOrder,
    currentChannelId: this.state.currentChannelId,
    savedAt: Date.now()
  };
  
  const json = JSON.stringify(data);
  
  try {
    localStorage.setItem('retune_channels', json);
  } catch (e) {
    if (this.isQuotaExceeded(e)) {
      // Strategy 1: Prune content caches
      this.pruneContentCaches();
      
      try {
        localStorage.setItem('retune_channels', json);
      } catch (e2) {
        // Strategy 2: Remove oldest channels until it fits
        await this.compactStorage();
        localStorage.setItem('retune_channels', json);
      }
    } else {
      throw e;
    }
  }
}

/**
 * Check if error is storage quota exceeded
 */
private isQuotaExceeded(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.code === 22 || // Legacy
     error.code === 1014 || // Firefox
     error.name === 'QuotaExceededError' ||
     error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}

/**
 * Remove cached content to free storage space
 */
private pruneContentCaches(): void {
  // Clear in-memory resolved content
  // (this doesn't affect localStorage, just ensures we don't re-save it)
  this.state.resolvedContent.clear();
  console.log('Pruned content caches to free storage');
}
```

## Content Source Types

### Library Source
```typescript
interface LibraryContentSource {
  type: 'library';
  libraryId: string;
  libraryType: 'movie' | 'show';
  includeWatched: boolean;
}

// Resolution: Fetch all items from library, optionally exclude watched
```

### Collection Source
```typescript
interface CollectionContentSource {
  type: 'collection';
  collectionKey: string;
  collectionName: string;  // Cached for display
}

// Resolution: Fetch collection items via Plex API
```

### Show Source
```typescript
interface ShowContentSource {
  type: 'show';
  showKey: string;
  showName: string;  // Cached for display
  seasonFilter?: number[];  // Specific seasons, or all if undefined
}

// Resolution: Fetch episodes, filter by season if specified
```

### Mixed Source
```typescript
interface MixedContentSource {
  type: 'mixed';
  sources: ChannelContentSource[];
  mixMode: 'interleave' | 'sequential';
}

// Resolution: Resolve each source, then combine
// - interleave: alternate between sources
// - sequential: append sources in order
```

## Method Specifications

### `createChannel(config: Partial<ChannelConfig>): Promise<ChannelConfig>`

**Purpose**: Create a new channel with default values for missing fields.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| config | Partial<ChannelConfig> | Yes | Channel configuration (partial) |

**Returns**: Complete `ChannelConfig` with generated ID and defaults

**Side Effects**:
- Generates UUID for id
- Assigns next available channel number if not provided
- Sets timestamps (createdAt, updatedAt)
- Persists to storage
- Emits `channelCreated` event

**Implementation Notes**:
```typescript
async createChannel(config: Partial<ChannelConfig>): Promise<ChannelConfig> {
  const channel: ChannelConfig = {
    id: generateUUID(),
    number: config.number ?? this.getNextAvailableNumber(),
    name: config.name ?? `Channel ${this.getNextAvailableNumber()}`,
    contentSource: config.contentSource!, // Required
    playbackMode: config.playbackMode ?? 'sequential',
    shuffleSeed: config.shuffleSeed ?? Date.now(),
    startTimeAnchor: config.startTimeAnchor ?? this.getTodayMidnight(),
    skipIntros: config.skipIntros ?? false,
    skipCredits: config.skipCredits ?? false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastContentRefresh: 0,
    itemCount: 0,
    totalDurationMs: 0,
    ...config
  };
  
  // Validate
  if (!channel.contentSource) {
    throw new Error('Content source is required');
  }
  
  // Resolve content initially
  const content = await this.resolveChannelContent(channel.id, channel);
  channel.itemCount = content.items.length;
  channel.totalDurationMs = content.totalDurationMs;
  channel.lastContentRefresh = Date.now();
  
  // Store
  this.state.channels.set(channel.id, channel);
  this.state.channelOrder.push(channel.id);
  await this.saveChannels();
  
  // Emit event
  this.emit('channelCreated', channel);
  
  return channel;
}
```

---

### `resolveChannelContent(channelId: string): Promise<ResolvedChannelContent>`

**Purpose**: Fetch and assemble content items for a channel.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| channelId | string | Yes | Channel to resolve content for |

**Returns**: `ResolvedChannelContent` with resolved items

**Implementation Notes**:
```typescript
async resolveChannelContent(channelId: string): Promise<ResolvedChannelContent> {
  const channel = this.getChannel(channelId);
  if (!channel) throw new Error('Channel not found');
  
  // Check cache
  const cached = this.state.resolvedContent.get(channelId);
  if (cached && !this.isStale(cached)) {
    return cached;
  }
  
  // Resolve based on source type
  let items: ResolvedContentItem[] = [];
  
  switch (channel.contentSource.type) {
    case 'library':
      items = await this.resolveLibrarySource(channel.contentSource);
      break;
    case 'collection':
      items = await this.resolveCollectionSource(channel.contentSource);
      break;
    case 'show':
      items = await this.resolveShowSource(channel.contentSource);
      break;
    case 'mixed':
      items = await this.resolveMixedSource(channel.contentSource);
      break;
    // ... other types
  }
  
  // Apply filters
  if (channel.contentFilters?.length) {
    items = this.applyFilters(items, channel.contentFilters);
  }
  
  // Apply sort
  if (channel.sortOrder) {
    items = this.applySort(items, channel.sortOrder);
  }
  
  // Apply playback mode (shuffle if needed)
  const orderedItems = this.applyPlaybackMode(
    items, 
    channel.playbackMode, 
    channel.shuffleSeed!
  );
  
  // Build result
  const result: ResolvedChannelContent = {
    channelId,
    resolvedAt: Date.now(),
    items,
    orderedItems,
    totalDurationMs: items.reduce((sum, i) => sum + i.durationMs, 0)
  };
  
  // Cache
  this.state.resolvedContent.set(channelId, result);
  this.emit('contentResolved', result);
  
  return result;
}
```

## Content Resolution Helpers

### `resolveLibrarySource(source: LibraryContentSource)`
```typescript
async resolveLibrarySource(source: LibraryContentSource): Promise<ResolvedContentItem[]> {
  const items = await this.plexLibrary.getLibraryItems(source.libraryId, {
    includeWatched: source.includeWatched
  });
  
  return items.map((item, index) => this.toResolvedItem(item, index));
}
```

### `resolveShowSource(source: ShowContentSource)`
```typescript
async resolveShowSource(source: ShowContentSource): Promise<ResolvedContentItem[]> {
  const episodes = await this.plexLibrary.getShowEpisodes(source.showKey);
  
  let filtered = episodes;
  if (source.seasonFilter?.length) {
    filtered = episodes.filter(ep => source.seasonFilter!.includes(ep.seasonNumber!));
  }
  
  return filtered.map((ep, index) => this.toResolvedItem(ep, index));
}
```

### `applyFilters(items, filters)`
```typescript
applyFilters(items: ResolvedContentItem[], filters: ContentFilter[]): ResolvedContentItem[] {
  return items.filter(item => 
    filters.every(filter => this.matchesFilter(item, filter))
  );
}

matchesFilter(item: ResolvedContentItem, filter: ContentFilter): boolean {
  const value = item[filter.field as keyof ResolvedContentItem];
  
  switch (filter.operator) {
    case 'eq': return value === filter.value;
    case 'neq': return value !== filter.value;
    case 'gt': return (value as number) > (filter.value as number);
    case 'gte': return (value as number) >= (filter.value as number);
    case 'lt': return (value as number) < (filter.value as number);
    case 'lte': return (value as number) <= (filter.value as number);
    case 'contains': return String(value).includes(String(filter.value));
    default: return true;
  }
}
```

## Events Emitted

| Event Name | Payload Type | When Emitted |
|------------|--------------|--------------|
| `channelCreated` | `ChannelConfig` | New channel created |
| `channelUpdated` | `ChannelConfig` | Channel modified |
| `channelDeleted` | `string` | Channel removed (ID) |
| `channelSwitch` | `{ channel, index }` | Current channel changed |
| `contentResolved` | `ResolvedChannelContent` | Content fetched/updated |

## Events Consumed

| Event Name | Source Module | Handler Behavior |
|------------|---------------|------------------|
| (none) | - | - |

## Test Specification

### Unit Tests Required:

```typescript
describe('ChannelManager', () => {
  describe('createChannel', () => {
    it('should generate UUID for new channel', async () => {
      const channel = await manager.createChannel({
        name: 'Test',
        contentSource: mockLibrarySource
      });
      expect(channel.id).toMatch(/^[a-f0-9-]{36}$/);
    });
    
    it('should assign next available channel number', async () => {
      await manager.createChannel({ number: 1, contentSource: mockSource });
      const ch2 = await manager.createChannel({ contentSource: mockSource });
      expect(ch2.number).toBe(2);
    });
    
    it('should throw if content source missing', async () => {
      await expect(manager.createChannel({ name: 'Test' }))
        .rejects.toThrow('Content source is required');
    });
    
    it('should emit channelCreated event', async () => {
      const handler = jest.fn();
      manager.on('channelCreated', handler);
      await manager.createChannel({ contentSource: mockSource });
      expect(handler).toHaveBeenCalled();
    });
  });
  
  describe('resolveChannelContent', () => {
    it('should resolve library source', async () => {
      const channel = await createChannelWithSource({ type: 'library', libraryId: '1' });
      const content = await manager.resolveChannelContent(channel.id);
      expect(content.items.length).toBeGreaterThan(0);
    });
    
    it('should resolve show source with season filter', async () => {
      const channel = await createChannelWithSource({
        type: 'show',
        showKey: '123',
        seasonFilter: [1, 2]
      });
      const content = await manager.resolveChannelContent(channel.id);
      expect(content.items.every(i => [1, 2].includes(i.seasonNumber!))).toBe(true);
    });
    
    it('should apply content filters', async () => {
      const channel = await createChannelWithFilters([
        { field: 'year', operator: 'gte', value: 2000 }
      ]);
      const content = await manager.resolveChannelContent(channel.id);
      expect(content.items.every(i => i.year >= 2000)).toBe(true);
    });
    
    it('should cache resolved content', async () => {
      const channel = await createChannel();
      await manager.resolveChannelContent(channel.id);
      await manager.resolveChannelContent(channel.id);
      // plexLibrary.getLibraryItems should be called only once
    });
  });
  
  describe('persistence', () => {
    it('should save channels to localStorage', async () => {
      await manager.createChannel({ contentSource: mockSource });
      await manager.saveChannels();
      expect(localStorage.getItem('retune_channels')).toBeTruthy();
    });
    
    it('should restore channels from localStorage', async () => {
      await manager.createChannel({ name: 'Saved', contentSource: mockSource });
      
      const newManager = new ChannelManager();
      await newManager.loadChannels();
      expect(newManager.getAllChannels()).toHaveLength(1);
      expect(newManager.getAllChannels()[0].name).toBe('Saved');
    });
  });
});
```

## File Structure

```
src/modules/scheduler/channel-manager/
├── index.ts              # Public exports
├── ChannelManager.ts     # Main class
├── ContentResolver.ts    # Content resolution logic
├── interfaces.ts         # IChannelManager interface
├── types.ts              # Channel types
├── constants.ts          # Storage keys, thresholds
└── __tests__/
    ├── ChannelManager.test.ts
    └── ContentResolver.test.ts
```

## Implementation Checklist

- [ ] Create file structure
- [ ] Implement channel CRUD operations
- [ ] Implement content source resolution for all types
- [ ] Implement content filtering
- [ ] Implement content sorting
- [ ] Implement content caching
- [ ] Implement persistence to localStorage
- [ ] Implement import/export
- [ ] Write unit tests
- [ ] Add JSDoc comments
- [ ] Verify against acceptance criteria

## Acceptance Criteria

This module is COMPLETE when:
1. [ ] Can create channels from all source types
2. [ ] Content filters work correctly
3. [ ] Content sorting works correctly
4. [ ] Channels persist across app restarts
5. [ ] Content caches with proper staleness detection
6. [ ] Events emit for all channel operations
7. [ ] All unit tests pass
8. [ ] No TypeScript compilation errors
