# Module: Plex Library Access

## Metadata
- **ID**: `plex-library`
- **Path**: `src/modules/plex/library/`
- **Primary File**: `PlexLibrary.ts`
- **Test File**: `PlexLibrary.test.ts`
- **Dependencies**: `plex-auth`, `plex-server-discovery`
- **Complexity**: high
- **Estimated LoC**: 500

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
   ```
   GET /library/sections
   Returns all library sections with type, id, title
   ```

2. **Paginated Content Retrieval**
   - Default page size: 100 items
   - Use `X-Plex-Container-Start` and `X-Plex-Container-Size` headers
   - Fetch all pages transparently for caller

3. **TV Show Hierarchy Navigation**
   ```
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
  const limit = options.limit ?? 100;
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
  return episodeArrays
    .flat()
    .sort((a, b) => {
      const seasonDiff = (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0);
      if (seasonDiff !== 0) return seasonDiff;
      return (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0);
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
  
  const params = new URLSearchParams({
    'X-Plex-Token': this.auth.getCurrentUser()?.token ?? '',
  });
  
  if (width) {
    params.set('width', String(width));
    params.set('height', String(height ?? width));
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
    sortTitle: data.titleSort ?? data.title,
    summary: data.summary ?? '',
    year: data.year,
    durationMs: data.duration ?? 0,
    addedAt: new Date(data.addedAt * 1000),
    updatedAt: new Date(data.updatedAt * 1000),
    thumb: data.thumb ?? null,
    art: data.art ?? null,
    rating: data.rating,
    audienceRating: data.audienceRating,
    contentRating: data.contentRating,
    
    // TV specific
    grandparentTitle: data.grandparentTitle,
    parentTitle: data.parentTitle,
    seasonNumber: data.parentIndex,
    episodeNumber: data.index,
    
    // Playback state
    viewOffset: data.viewOffset ?? 0,
    viewCount: data.viewCount ?? 0,
    lastViewedAt: data.lastViewedAt ? new Date(data.lastViewedAt * 1000) : undefined,
    
    // Media files
    media: (data.Media || []).map(this.parseMediaFile.bind(this))
  };
}
```

## Events Emitted

None (pure data access module)

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
      const items = await library.getLibraryItems('1');
      expect(items).toHaveLength(250);
    });
    
    it('should apply filters', async () => {
      await library.getLibraryItems('1', { 
        filter: { year: 2020 } 
      });
      // Verify filter param in request
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

## File Structure

```
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
