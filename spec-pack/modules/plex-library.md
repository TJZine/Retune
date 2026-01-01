# Module: Plex Library Access

## Metadata

- **ID**: `plex-library`
- **Path**: `src/modules/plex/library/`
- **Primary File**: `PlexLibrary.ts`
- **Test File**: `PlexLibrary.test.ts`
- **Dependencies**: `plex-auth`, `plex-server-discovery`
- **Complexity**: high
- **Estimated LoC**: 500

## API Reference

> [!TIP]
> **Official Documentation**: Use Context7 with `/websites/developer_plex_tv_pms` for latest API specs.  
> **Local Examples**: See `spec-pack/artifact-9-plex-api-examples.md` for JSON response samples.

| Endpoint | Purpose |
|----------|---------|
| `GET /library/sections` | List all library sections |
| `GET /library/sections/{id}/all` | Get library contents (paginated) |
| `GET /library/metadata/{ratingKey}` | Get item metadata with Media/Part info |
| `GET /library/metadata/{key}/children` | Get seasons/episodes |
| `GET /library/sections/{id}/collections` | Get library collections |
| `GET /hubs/search?query={term}` | Global search across libraries |

## Purpose

Provides access to Plex media libraries, enabling enumeration of library sections, browsing content (movies, shows, episodes), retrieving metadata, handling pagination for large libraries, and generating authenticated URLs for images and thumbnails.

## Public Interface

```typescript
/**
 * Plex Library Access Interface
 */
export interface IPlexLibrary {
  // Library Sections
  getLibraries(): Promise<PlexLibrary[]>;
  getLibrary(libraryId: string): Promise<PlexLibrary | null>;
  
  // Content Browsing
  getLibraryItems(libraryId: string, options?: LibraryQueryOptions): Promise<PlexMediaItem[]>;
  getItem(ratingKey: string): Promise<PlexMediaItem | null>;
  
  // TV Show Hierarchy
  getShows(libraryId: string): Promise<PlexMediaItem[]>;
  getShowSeasons(showKey: string): Promise<PlexSeason[]>;
  getSeasonEpisodes(seasonKey: string): Promise<PlexMediaItem[]>;
  getShowEpisodes(showKey: string): Promise<PlexMediaItem[]>;
  
  // Collections/Playlists
  getCollections(libraryId: string): Promise<PlexCollection[]>;
  getCollectionItems(collectionKey: string): Promise<PlexMediaItem[]>;
  getPlaylists(): Promise<PlexPlaylist[]>;
  getPlaylistItems(playlistKey: string): Promise<PlexMediaItem[]>;
  
  // Search
  search(query: string, options?: SearchOptions): Promise<PlexMediaItem[]>;
  
  // Image URLs
  getImageUrl(imagePath: string, width?: number, height?: number): string;
  
  // Refresh
  refreshLibrary(libraryId: string): Promise<void>;
}
```

## Required Exports

```typescript
// src/modules/plex/library/index.ts
export { PlexLibrary } from './PlexLibrary';
export type { IPlexLibrary } from './interfaces';
export type {
  PlexLibrary,
  PlexMediaItem,
  PlexMediaFile,
  PlexMediaPart,
  PlexStream,
  PlexCollection,
  PlexPlaylist,
  PlexSeason,
  LibraryQueryOptions,
  SearchOptions
} from './types';
```

## Implementation Requirements

### MUST Implement:

1. **Library Section Enumeration**

   ```text
   GET /library/sections
   Returns all library sections with type, id, title
   ```

2. **Paginated Content Retrieval**
   - Default page size: 100 items
   - Use `X-Plex-Container-Start` and `X-Plex-Container-Size` headers
   - Fetch all pages transparently for caller

3. **TV Show Hierarchy Navigation**

   ```text
   Shows: GET /library/sections/{id}/all?type=2
   Seasons: GET /library/metadata/{showKey}/children
   Episodes: GET /library/metadata/{seasonKey}/children
   ```

4. **Image URL Generation**
   - Append auth token to image URLs
   - Support optional resize parameters
   - Handle relative paths from Plex API

5. **Response Parsing**
   - Parse Plex XML/JSON responses
   - Map to consistent TypeScript types
   - Handle missing optional fields gracefully

### Error Handling:

| Error Scenario | Error Type | Recovery Action | User Message |
|---------------|------------|-----------------|--------------|
| Network timeout | `NETWORK_TIMEOUT` | Retry with exponential backoff (max 3 attempts) | "Connection timed out. Retrying..." |
| Server unreachable | `SERVER_UNREACHABLE` | Trigger server re-discovery | "Server unavailable. Reconnecting..." |
| 401 Unauthorized | `AUTH_EXPIRED` | Emit `authExpired` event, redirect to auth | "Session expired. Please sign in again." |
| 404 Not Found | `ITEM_NOT_FOUND` | Return `null`, log warning | (Handle silently) |
| 500+ Server Error | `SERVER_ERROR` | Retry once after 2s delay | "Server error. Retrying..." |
| Empty response | `EMPTY_RESPONSE` | Return empty array, log warning | (Handle silently) |
| Parse error | `PARSE_ERROR` | Log error with response body, return empty | "Unable to load content." |
| Rate limited (429) | `RATE_LIMITED` | Backoff per `Retry-After` header | "Too many requests. Please wait." |

**Error Recovery Implementation**:

```typescript
private async fetchWithRetry<T>(
  url: string,
  options: FetchOptions = {},
  retries = 3
): Promise<T> {
  const delays = [1000, 2000, 4000]; // Exponential backoff
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const timeoutMs = typeof options.timeout === 'number' ? options.timeout : 10000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetch(url, {
          ...options,
          headers: { ...this.auth.getAuthHeaders(), ...options.headers },
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeoutId);
      }
      
      if (response.status === 401) {
        this.emit('authExpired');
        throw new PlexLibraryError('AUTH_EXPIRED', 'Authentication expired');
      }
      
      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('Retry-After');
        const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 5;
        await this.delay(retryAfter * 1000);
        continue;
      }
      
      if (response.status === 404) {
        return null as T;
      }
      
      if (!response.ok) {
        throw new PlexLibraryError('SERVER_ERROR', `HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      if (attempt === retries - 1) throw error;
      await this.delay(delays[attempt]);
    }
  }
  throw new PlexLibraryError('MAX_RETRIES', 'Max retries exceeded');
}
```

### MUST NOT:

1. Cache indefinitely (content can change)
2. Fetch all libraries on every call (cache briefly)
3. Block on large library fetches (stream/page)
4. Expose raw Plex API responses

### State Management:

```typescript
interface PlexLibraryState {
  serverUri: string;
  authHeaders: Record<string, string>;
  libraryCache: Map<string, { library: PlexLibrary; cachedAt: number }>;
  libraryCacheTtl: number; // 5 minutes
}
```

## API Endpoints Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/library/sections` | GET | List all libraries |
| `/library/sections/{id}/all` | GET | Get all items in library |
| `/library/sections/{id}/all?type=N` | GET | Filter by type (1=movie, 2=show, 4=episode) |
| `/library/metadata/{key}` | GET | Get item details |
| `/library/metadata/{key}/children` | GET | Get children (seasons/episodes) |
| `/library/sections/{id}/collections` | GET | Get collections in library |
| `/library/collections/{key}/children` | GET | Get items in collection |
| `/playlists` | GET | Get all playlists |
| `/playlists/{key}/items` | GET | Get playlist items |
| `/hubs/search` | GET | Search across libraries |

## Method Specifications

### `getLibraryItems(libraryId: string, options?: LibraryQueryOptions): Promise<PlexMediaItem[]>`

**Purpose**: Get all items from a library section with optional filtering.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| libraryId | string | Yes | Library section ID |
| options | LibraryQueryOptions | No | Filtering, sorting, pagination |

**Returns**: Array of `PlexMediaItem`

**Implementation Notes**:

```typescript
async getLibraryItems(
  libraryId: string, 
  options: LibraryQueryOptions = {}
): Promise<PlexMediaItem[]> {
  const items: PlexMediaItem[] = [];
  let offset = 0;
  const limit = typeof options.limit === 'number' ? options.limit : 100;
  let hasMore = true;
  
  while (hasMore) {
    const url = this.buildUrl(`/library/sections/${libraryId}/all`, {
      'X-Plex-Container-Start': offset,
      'X-Plex-Container-Size': limit,
      sort: options.sort,
      ...options.filter
    });
    
    const response = await this.fetch(url);
    const data = await response.json();
    
    const pageItems = this.parseMediaItems(data.MediaContainer.Metadata || []);
    items.push(...pageItems);
    
    offset += pageItems.length;
    hasMore = pageItems.length === limit && 
              (!options.limit || items.length < options.limit);
  }
  
  return items;
}
```

---

### `getShowEpisodes(showKey: string): Promise<PlexMediaItem[]>`

**Purpose**: Get all episodes for a TV show across all seasons.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| showKey | string | Yes | Show ratingKey |

**Returns**: All episodes in aired order

**Implementation Notes**:

```typescript
async getShowEpisodes(showKey: string): Promise<PlexMediaItem[]> {
  // Get all seasons
  const seasons = await this.getShowSeasons(showKey);
  
  // Fetch episodes for each season in parallel
  const episodePromises = seasons.map(season => 
    this.getSeasonEpisodes(season.ratingKey)
  );
  
  const episodeArrays = await Promise.all(episodePromises);
  
  // Flatten and sort by season/episode number
  const flattened = episodeArrays.reduce((acc, arr) => acc.concat(arr), [] as PlexMediaItem[]);
  return flattened
    .sort((a, b) => {
      const aSeason = typeof a.seasonNumber === 'number' ? a.seasonNumber : 0;
      const bSeason = typeof b.seasonNumber === 'number' ? b.seasonNumber : 0;
      const seasonDiff = aSeason - bSeason;
      if (seasonDiff !== 0) return seasonDiff;
      const aEpisode = typeof a.episodeNumber === 'number' ? a.episodeNumber : 0;
      const bEpisode = typeof b.episodeNumber === 'number' ? b.episodeNumber : 0;
      return aEpisode - bEpisode;
    });
}
```

---

### `getImageUrl(imagePath: string, width?: number, height?: number): string`

**Purpose**: Generate authenticated URL for Plex images.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| imagePath | string | Yes | Image path from Plex metadata |
| width | number | No | Resize width |
| height | number | No | Resize height |

**Returns**: Full URL with authentication token

**Implementation Notes**:

```typescript
getImageUrl(imagePath: string, width?: number, height?: number): string {
  if (!imagePath) return '';
  
  const user = this.auth.getCurrentUser();
  const token = user ? user.token : '';
  const params = new URLSearchParams({ 'X-Plex-Token': token });
  
  if (width) {
    params.set('width', String(width));
    params.set('height', String(typeof height === 'number' ? height : width));
    // Use photo transcoder for resizing
    const transcodeUrl = `/photo/:/transcode?url=${encodeURIComponent(imagePath)}&${params}`;
    return `${this.serverUri}${transcodeUrl}`;
  }
  
  // Direct image URL
  return `${this.serverUri}${imagePath}?${params}`;
}
```

## Response Parsing

### Parse Media Item

```typescript
private parseMediaItem(data: any): PlexMediaItem {
  return {
    ratingKey: data.ratingKey,
    key: data.key,
    type: this.mapMediaType(data.type),
    title: data.title,
    originalTitle: data.originalTitle,
    sortTitle: (data.titleSort !== undefined && data.titleSort !== null) ? data.titleSort : data.title,
    summary: (data.summary !== undefined && data.summary !== null) ? data.summary : '',
    year: data.year,
    durationMs: (data.duration !== undefined && data.duration !== null) ? data.duration : 0,
    addedAt: new Date(data.addedAt * 1000),
    updatedAt: new Date(data.updatedAt * 1000),
    thumb: (data.thumb !== undefined && data.thumb !== null) ? data.thumb : null,
    art: (data.art !== undefined && data.art !== null) ? data.art : null,
    rating: data.rating,
    audienceRating: data.audienceRating,
    contentRating: data.contentRating,
    
    // TV specific
    grandparentTitle: data.grandparentTitle,
    parentTitle: data.parentTitle,
    seasonNumber: data.parentIndex,
    episodeNumber: data.index,
    
    // Playback state
    viewOffset: (data.viewOffset !== undefined && data.viewOffset !== null) ? data.viewOffset : 0,
    viewCount: (data.viewCount !== undefined && data.viewCount !== null) ? data.viewCount : 0,
    lastViewedAt: data.lastViewedAt ? new Date(data.lastViewedAt * 1000) : undefined,
    
    // Media files
    media: (data.Media || []).map(this.parseMediaFile.bind(this))
  };
}
```

## Memory Budget

| Resource | Budget | Notes |
|----------|--------|-------|
| Library cache | 2MB | 5-minute TTL, LRU eviction |
| Pagination buffer | 1MB | Streaming, not storing entire library |
| Image URL cache | 50KB | URL strings only, not image data |
| **Total** | **~3MB** | |

## Events Emitted

| Event Name | Payload Type | When Emitted |
|------------|--------------|---------------|
| `authExpired` | `void` | When API returns 401 Unauthorized |
| `libraryRefreshed` | `{ libraryId: string }` | After library refresh completes |

## Events Consumed

| Event Name | Source Module | Handler Behavior |
|------------|---------------|------------------|
| `serverChange` | `plex-server-discovery` | Update server URI |

## Test Specification

### Unit Tests Required:

```typescript
describe('PlexLibrary', () => {
  describe('getLibraries', () => {
    it('should return all library sections', async () => {
      mockFetch('/library/sections', { MediaContainer: { Directory: [...] } });
      const libs = await library.getLibraries();
      expect(libs).toHaveLength(3);
    });
    
    it('should parse library types correctly', async () => {
      // movie, show, artist, photo
    });
  });
  
  describe('getLibraryItems', () => {
    it('should handle pagination transparently', async () => {
      // Mock 250 items across 3 pages
      mockFetchPages([100, 100, 50]);
      const items = await library.getLibraryItems('1');
      expect(items).toHaveLength(250);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
    
    it('should handle empty library', async () => {
      mockFetch('/library/sections/1/all', { MediaContainer: { Metadata: [] } });
      const items = await library.getLibraryItems('1');
      expect(items).toHaveLength(0);
      expect(items).toEqual([]);
    });
    
    it('should handle single-page result', async () => {
      mockFetch('/library/sections/1/all', { 
        MediaContainer: { 
          Metadata: [mockItem], 
          totalSize: 1 
        } 
      });
      const items = await library.getLibraryItems('1');
      expect(items).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
    
    it('should handle exact page boundary', async () => {
      // Exactly 100 items = 1 page, no extra request
      mockFetchPages([100]);
      const items = await library.getLibraryItems('1');
      expect(items).toHaveLength(100);
      // Should NOT make a second request to check for more
    });
    
    it('should apply filters', async () => {
      await library.getLibraryItems('1', { 
        filter: { year: 2020 } 
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('year=2020'),
        expect.any(Object)
      );
    });
  });
  
  describe('getShowEpisodes', () => {
    it('should fetch all episodes across seasons', async () => {
      mockSeasons(['s1', 's2']);
      mockEpisodes('s1', 10);
      mockEpisodes('s2', 10);
      
      const episodes = await library.getShowEpisodes('show1');
      expect(episodes).toHaveLength(20);
    });
    
    it('should sort episodes by season and episode number', async () => {
      const episodes = await library.getShowEpisodes('show1');
      for (let i = 1; i < episodes.length; i++) {
        expect(episodes[i].seasonNumber! >= episodes[i-1].seasonNumber! ||
               (episodes[i].seasonNumber === episodes[i-1].seasonNumber &&
                episodes[i].episodeNumber! >= episodes[i-1].episodeNumber!))
          .toBe(true);
      }
    });
  });
  
  describe('getImageUrl', () => {
    it('should append auth token', () => {
      const url = library.getImageUrl('/library/metadata/123/thumb');
      expect(url).toContain('X-Plex-Token=');
    });
    
    it('should use transcoder for resized images', () => {
      const url = library.getImageUrl('/library/metadata/123/thumb', 300, 450);
      expect(url).toContain('/photo/:/transcode');
      expect(url).toContain('width=300');
    });
  });
});
```

## Mock Requirements

### Required Mocks

```typescript
// Mock fetch for Plex API calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock dependencies
const mockPlexAuth: IPlexAuth = {
  getAuthHeaders: () => ({ 'X-Plex-Token': 'mock-token' }),
  getCurrentUser: () => ({ token: 'mock-token', userId: '123' }),
};

const mockPlexDiscovery: IPlexServerDiscovery = {
  getActiveConnectionUri: () => 'http://192.168.1.100:32400',
  getSelectedServer: () => mockServer,
};
```

### Mock Data Fixtures

```typescript
const mockLibrarySectionsResponse = {
  MediaContainer: {
    Directory: [
      { key: '1', title: 'Movies', type: 'movie', uuid: 'lib-1' },
      { key: '2', title: 'TV Shows', type: 'show', uuid: 'lib-2' }
    ]
  }
};

const mockMediaItemResponse = {
  MediaContainer: {
    Metadata: [{
      ratingKey: '12345',
      title: 'Test Movie',
      year: 2023,
      duration: 7200000,
      Media: [{ container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' }]
    }]
  }
};

const mockShowSeasonsResponse = {
  MediaContainer: {
    Metadata: [
      { ratingKey: 's1', title: 'Season 1', index: 1 },
      { ratingKey: 's2', title: 'Season 2', index: 2 }
    ]
  }
};
```

## File Structure

```text
src/modules/plex/library/
├── index.ts              # Public exports
├── PlexLibrary.ts        # Main class
├── ResponseParser.ts     # Plex response parsing
├── interfaces.ts         # IPlexLibrary interface
├── types.ts              # Library-specific types
├── constants.ts          # Page sizes, cache TTLs
└── __tests__/
    ├── PlexLibrary.test.ts
    └── ResponseParser.test.ts
```

## Implementation Checklist

- [ ] Create file structure
- [ ] Implement library section enumeration
- [ ] Implement paginated content retrieval
- [ ] Implement TV show hierarchy navigation
- [ ] Implement collection/playlist access
- [ ] Implement search
- [ ] Implement image URL generation
- [ ] Implement response parsing for all types
- [ ] Write unit tests with mocked responses
- [ ] Add JSDoc comments
- [ ] Verify against acceptance criteria

## Common Pitfalls

> [!CAUTION]
> **AI implementers: Avoid these common mistakes**

| Pitfall | Why It Happens | Correct Approach |
| :--- | :--- | :--- |
| Fetching all pages eagerly | Want complete data | Implement lazy pagination - only fetch when caller needs more |
| Ignoring pagination headers | Response seems complete | Check `totalSize` and fetch until all pages retrieved |
| Caching library contents indefinitely | Avoid API calls | Cache with TTL (5 min), invalidate on library refresh events |
| Not handling 401 gracefully | Unexpected auth failure | Emit `authExpired` event, let orchestrator handle re-auth |
| Exposing raw Plex response | Simpler implementation | Always parse to typed interfaces - hide API details |
| Blocking on large libraries | Fetch everything first | Use streaming/pagination, don't load 10K items into memory |
| Hardcoding page size | 100 works | Make configurable via `LibraryQueryOptions.limit` |
| Missing null checks on optional fields | Trust API response | Use explicit checks: `if (data.summary !== undefined && data.summary !== null)` |
| Image URLs without auth token | Forget authentication | Always append `X-Plex-Token` to image URLs |
| Fetching seasons/episodes per-request | Complete data | Use `getShowEpisodes()` with parallel season fetches |

---

## Acceptance Criteria

This module is COMPLETE when:

1. [ ] Can enumerate all library sections
2. [ ] Can fetch all items from any library with pagination
3. [ ] Can navigate TV show → seasons → episodes
4. [ ] Can fetch collection and playlist items
5. [ ] Search returns relevant results
6. [ ] Image URLs are properly authenticated
7. [ ] All unit tests pass
8. [ ] No TypeScript compilation errors
