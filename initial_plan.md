# LG webOS Plex Virtual Channels Application

## Software Architecture & Implementation Specifications

---

## App Name Ideas

Here are naming suggestions organized by theme:

**Linear/Broadcast Theme:**

- **PlexLive** - Simple, implies live TV experience
- **StreamCast** - Casting streams like broadcast
- **LinearPlex** - Direct description of function
- **ChannelFlow** - Suggests continuous flow of content
- **PlexAir** - Like "on air" broadcasting

**Retro/Nostalgia Theme:**

- **RetroPlex** - Nostalgic TV experience
- **ChannelSurf** - Classic channel surfing
- **TuneIn** - Like tuning into channels
- **PlexClassic** - Classic TV feel
- **CableBox** - Nostalgic cable reference

**Virtual/Simulated Theme:**

- **VirtualPlex** - Virtual channels from Plex
- **SimuChannel** - Simulated channels
- **PseudoTV** - Following PseudoTV naming (established in space)
- **QuasiPlex** - Nod to QuasiTV

**Creative/Unique:**

- **Continuum** - Continuous playback
- **PlexFlow** - Content flowing continuously
- **Meridian** - TV channels like time zones
- **Carousel** - Content rotating through
- **Anthology** - Curated collections playing
- **PlexWave** - Broadcast waves
- **Streamline** - Linear streaming
- **Cadence** - Rhythmic, scheduled playback

**Short & Punchy:**

- **Drift** - Content drifting by passively
- **Loop** - Continuous looping channels
- **Slate** - Like a TV slate/schedule
- **Grid** - EPG grid reference
- **Dial** - Channel dial

**Personal Favorites:**

- **PlexLive** - Clean, professional, descriptive
- **ChannelFlow** - Evocative of the experience
- **Continuum** - Unique, suggests unbroken playback
- **Drift** - Captures passive viewing experience

---

## 1. Executive Summary

### 1.1 Project Overview

This specification defines a webOS application that transforms a user's Plex media library into simulated linear television channels. The application creates a passive, scheduled viewing experience reminiscent of traditional broadcast television, where content plays according to a deterministic schedule rather than on-demand selection.

### 1.2 Core Concept

```text
┌─────────────────────────────────────────────────────────────────────┐
│                         CONCEPTUAL MODEL                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   PLEX LIBRARY              VIRTUAL CHANNELS           TV OUTPUT    │
│   ┌─────────┐               ┌─────────────┐           ┌─────────┐  │
│   │ Movies  │──┐            │ Channel 1:  │           │         │  │
│   │ Library │  │            │ "80s Action"│───────────│  NOW:   │  │
│   └─────────┘  │            └─────────────┘           │ Die Hard│  │
│   ┌─────────┐  │  Schedule  ┌─────────────┐           │  1:23:45│  │
│   │TV Shows │──┼──Generate──│ Channel 2:  │           │         │  │
│   │ Library │  │            │ "Sitcoms"   │           │  NEXT:  │  │
│   └─────────┘  │            └─────────────┘           │ Lethal  │  │
│   ┌─────────┐  │            ┌─────────────┐           │ Weapon  │  │
│   │ Music/  │──┘            │ Channel 3:  │           │         │  │
│   │ Other   │               │ "Documentaries"         └─────────┘  │
│   └─────────┘               └─────────────┘                        │
│                                                                     │
│   User-owned content    Deterministic schedules    Linear playback │
│   from Plex server      based on wall-clock time   like real TV    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.3 Key Requirements Summary

| Category | Requirement |
|----------|-------------|
| **Platform** | LG webOS 6.0+ (2021+ LG Smart TVs) |
| **Backend** | Plex Media Server (user-authenticated) |
| **Playback** | HLS preferred, direct play when possible |
| **Schedule** | Deterministic, time-based, reproducible |
| **UI** | 10-foot interface, D-pad navigation, EPG grid |
| **Performance** | 60fps UI, <3s channel switch, <300MB memory |
| **Reliability** | 24+ hour continuous operation without degradation |

### 1.4 Target User Experience

```text
User turns on TV → Opens app → Immediately sees content playing
                              ↓
              Channel 3: "Comedy Classics" - Seinfeld S04E11 (started 12 min ago)
                              ↓
         Press CH+ → Channel 4: "Sci-Fi Marathon" - Blade Runner (47 min in)
                              ↓
              Press GUIDE → See 8-channel grid with current/upcoming programs
                              ↓
                    Navigate to 8PM slot on Channel 2 → See what's scheduled
                              ↓
                         Press BACK → Return to live viewing
```

---

## 2. Module Specifications

### 2.1 Plex Integration Module

#### 2.1.1 Module Overview

The Plex Integration Module handles all communication with the Plex ecosystem, including OAuth authentication, server discovery, library enumeration, metadata retrieval, and stream URL resolution. It abstracts Plex API complexity from other modules.

#### 2.1.2 Assumptions & Constraints

```yaml
Assumptions:
  - User has an active Plex account (free or Plex Pass)
  - User has at least one Plex Media Server with accessible content
  - Server may be local (LAN) or remote (relay/direct)
  - Content is properly organized with metadata (titles, durations, artwork)
  - Direct play is preferred; transcoding is fallback only

Constraints:
  - OAuth PIN-based flow required (no keyboard-heavy input on TV)
  - API rate limits: ~100 requests/minute to plex.tv
  - Token expiration: typically long-lived but must handle refresh
  - Mixed content security: hosted HTTPS app may struggle with HTTP LAN servers
  - Some streams may require Plex relay (bandwidth limitations apply)
  - Image URLs require token injection for authenticated access

External Dependencies:
  - plex.tv OAuth endpoints
  - Plex Media Server XML/JSON API
  - Plex image transcoding service (for artwork)
```

#### 2.1.3 Technical Specification

```typescript
// ============================================
// PLEX INTEGRATION - TYPE DEFINITIONS
// ============================================

// --- Authentication Types ---

interface PlexAuthConfig {
  clientIdentifier: string;     // Unique app instance ID (UUID)
  product: string;              // App name shown in Plex
  version: string;              // App version
  platform: string;             // "webOS"
  platformVersion: string;      // e.g., "4.0"
  device: string;               // e.g., "LG Smart TV"
  deviceName: string;           // User-friendly device name
}

interface PlexPinRequest {
  id: number;
  code: string;                 // 4-character PIN for user
  expiresAt: Date;
  authToken: string | null;     // Populated when claimed
  clientIdentifier: string;
}

interface PlexAuthToken {
  token: string;
  userId: string;
  username: string;
  email: string;
  thumb: string;                // Avatar URL
  expiresAt: Date | null;       // Usually null (long-lived)
  issuedAt: Date;
}

interface PlexAuthData {
  token: PlexAuthToken;
  selectedServerId: string | null;
  selectedServerUri: string | null;
}

// --- Server & Connection Types ---

interface PlexServer {
  id: string;                   // Machine identifier
  name: string;                 // User-defined server name
  sourceTitle: string;          // Owner username
  ownerId: string;
  owned: boolean;               // Does current user own this server?
  connections: PlexConnection[];
  capabilities: string[];
  preferredConnection: PlexConnection | null;
}

interface PlexConnection {
  uri: string;                  // Full URL (e.g., "http://192.168.1.5:32400")
  protocol: 'http' | 'https';
  address: string;
  port: number;
  local: boolean;               // Is this a LAN connection?
  relay: boolean;               // Is this a Plex relay?
  latencyMs: number | null;     // Measured latency (after testing)
}

// --- Library Types ---

interface PlexLibrary {
  id: string;                   // Library section ID
  uuid: string;
  title: string;                // e.g., "Movies", "TV Shows"
  type: PlexLibraryType;
  agent: string;                // Metadata agent
  scanner: string;
  contentCount: number;
  lastScannedAt: Date;
  art: string | null;           // Background art URL
  thumb: string | null;         // Thumbnail URL
}

type PlexLibraryType = 
  | 'movie' 
  | 'show' 
  | 'artist' 
  | 'photo';

interface PlexMediaItem {
  ratingKey: string;            // Unique item ID
  key: string;                  // API path to item
  type: PlexMediaType;
  title: string;
  originalTitle?: string;
  sortTitle: string;
  summary: string;
  year: number;
  durationMs: number;
  addedAt: Date;
  updatedAt: Date;
  
  // Visual assets
  thumb: string | null;         // Poster
  art: string | null;           // Background
  banner?: string | null;
  
  // Ratings
  rating?: number;              // Plex rating
  audienceRating?: number;
  contentRating?: string;       // e.g., "PG-13"
  
  // For TV episodes
  grandparentTitle?: string;    // Show name
  parentTitle?: string;         // Season name
  seasonNumber?: number;
  episodeNumber?: number;
  
  // Playback info
  viewOffset?: number;          // Resume position (ms)
  viewCount?: number;
  lastViewedAt?: Date;
  
  // Media details (for stream selection)
  media: PlexMediaFile[];
}

type PlexMediaType = 
  | 'movie' 
  | 'episode' 
  | 'track' 
  | 'clip';

interface PlexMediaFile {
  id: string;
  duration: number;
  bitrate: number;
  width: number;
  height: number;
  aspectRatio: number;
  videoCodec: string;
  audioCodec: string;
  audioChannels: number;
  container: string;            // e.g., "mkv", "mp4"
  videoResolution: string;      // e.g., "1080", "4k"
  parts: PlexMediaPart[];
}

interface PlexMediaPart {
  id: string;
  key: string;                  // Path for streaming
  duration: number;
  file: string;                 // Original filename
  size: number;
  container: string;
  videoProfile?: string;
  audioProfile?: string;
  streams: PlexStream[];
}

interface PlexStream {
  id: string;
  streamType: 1 | 2 | 3;        // 1=video, 2=audio, 3=subtitle
  codec: string;
  language?: string;
  languageCode?: string;
  title?: string;
  selected?: boolean;
  default?: boolean;
  forced?: boolean;
  
  // Video-specific
  width?: number;
  height?: number;
  bitrate?: number;
  frameRate?: number;
  
  // Audio-specific
  channels?: number;
  samplingRate?: number;
  
  // Subtitle-specific
  format?: string;              // srt, vtt, pgs, ass
  key?: string;                 // URL to fetch subtitle file
}

// --- Stream Resolution Types ---

interface StreamRequest {
  itemKey: string;              // ratingKey of media
  partId?: string;              // Specific part if multi-part
  startOffsetMs?: number;       // For resume
  audioStreamId?: string;       // Preferred audio track
  subtitleStreamId?: string;    // Preferred subtitle track
  maxBitrate?: number;          // For quality selection
  directPlay?: boolean;         // Prefer direct play
  directStream?: boolean;       // Prefer direct stream
}

interface StreamDecision {
  playbackUrl: string;          // Final URL for playback
  protocol: 'hls' | 'dash' | 'http';
  isDirectPlay: boolean;
  isTranscoding: boolean;
  container: string;
  videoCodec: string;
  audioCodec: string;
  subtitleDelivery: 'embed' | 'sidecar' | 'burn' | 'none';
  sessionId: string;            // For tracking/cleanup
  
  // Selected streams
  selectedAudioStream: PlexStream | null;
  selectedSubtitleStream: PlexStream | null;
  
  // Quality info
  width: number;
  height: number;
  bitrate: number;
}

// --- Errors ---

interface PlexApiError {
  code: PlexErrorCode;
  message: string;
  httpStatus?: number;
  retryable: boolean;
}

type PlexErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'SERVER_UNREACHABLE'
  | 'SERVER_UNAUTHORIZED'
  | 'RESOURCE_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR'
  | 'UNKNOWN';
```

#### 2.1.4 Interface Contract

```typescript
// ============================================
// PLEX INTEGRATION - PUBLIC INTERFACES
// ============================================

// --- Authentication Interface ---

interface IPlexAuth {
  // PIN-based OAuth flow
  requestPin(): Promise<PlexPinRequest>;
  checkPinStatus(pinId: number): Promise<PlexPinRequest>;
  cancelPin(pinId: number): Promise<void>;
  
  // Token management
  validateToken(token: string): Promise<boolean>;
  getStoredCredentials(): Promise<PlexAuthData | null>;
  storeCredentials(auth: PlexAuthData): Promise<void>;
  clearCredentials(): Promise<void>;
  
  // Convenience
  isAuthenticated(): boolean;
  getCurrentUser(): PlexAuthToken | null;
  getAuthHeaders(): Record<string, string>;
}

// --- Server Discovery Interface ---

interface IPlexServerDiscovery {
  // Fetch available servers for authenticated user
  getAvailableServers(): Promise<PlexServer[]>;
  
  // Test and rank connections
  testConnection(uri: string): Promise<{ success: boolean; latencyMs: number }>;
  findBestConnection(server: PlexServer): Promise<PlexConnection | null>;
  
  // Server selection
  selectServer(serverId: string): Promise<void>;
  getSelectedServer(): PlexServer | null;
  getActiveConnectionUri(): string | null;
}

// --- Library Access Interface ---

interface IPlexLibrary {
  // Library enumeration
  getLibraries(): Promise<PlexLibrary[]>;
  getLibrary(libraryId: string): Promise<PlexLibrary>;
  
  // Content retrieval
  getLibraryItems(
    libraryId: string, 
    options?: LibraryQueryOptions
  ): Promise<PlexMediaItem[]>;
  
  getItem(ratingKey: string): Promise<PlexMediaItem>;
  
  // TV-specific
  getSeasons(showRatingKey: string): Promise<PlexSeason[]>;
  getEpisodes(seasonRatingKey: string): Promise<PlexMediaItem[]>;
  getAllEpisodes(showRatingKey: string): Promise<PlexMediaItem[]>;
  
  // Search
  search(query: string, options?: SearchOptions): Promise<PlexMediaItem[]>;
  
  // Collections/Playlists
  getCollections(libraryId: string): Promise<PlexCollection[]>;
  getCollectionItems(collectionKey: string): Promise<PlexMediaItem[]>;
  getPlaylists(): Promise<PlexPlaylist[]>;
  getPlaylistItems(playlistKey: string): Promise<PlexMediaItem[]>;
  
  // Image URLs (with token injection)
  getImageUrl(imagePath: string, width?: number, height?: number): string;
}

interface LibraryQueryOptions {
  sort?: string;                // e.g., "titleSort:asc", "addedAt:desc"
  filter?: Record<string, string | number>;
  offset?: number;
  limit?: number;
  includeCollections?: boolean;
}

interface SearchOptions {
  types?: PlexMediaType[];
  libraryId?: string;
  limit?: number;
}

// --- Stream Resolution Interface ---

interface IPlexStreamResolver {
  // Get playback decision from Plex
  resolveStream(request: StreamRequest): Promise<StreamDecision>;
  
  // Direct URL construction (for simple cases)
  getDirectPlayUrl(partKey: string): string;
  getHlsUrl(itemKey: string, options?: HlsOptions): string;
  
  // Subtitle handling
  getSubtitleUrl(subtitleKey: string): string;
  
  // Session management
  reportPlaybackStart(sessionId: string, itemKey: string): Promise<void>;
  reportPlaybackProgress(
    sessionId: string, 
    itemKey: string, 
    positionMs: number
  ): Promise<void>;
  reportPlaybackStop(
    sessionId: string, 
    itemKey: string, 
    positionMs: number
  ): Promise<void>;
  
  // Cleanup
  terminateSession(sessionId: string): Promise<void>;
}

interface HlsOptions {
  maxBitrate?: number;
  subtitleSize?: number;
  audioBoost?: number;
}

// --- Composite Plex API Interface ---

interface IPlexAPI extends 
  IPlexAuth, 
  IPlexServerDiscovery, 
  IPlexLibrary, 
  IPlexStreamResolver {
  
  // Initialization
  initialize(config: PlexAuthConfig): Promise<void>;
  
  // Health check
  healthCheck(): Promise<{ 
    authenticated: boolean; 
    serverReachable: boolean; 
    latencyMs: number;
  }>;
  
  // Events
  on(event: 'authChange', handler: (isAuthenticated: boolean) => void): void;
  on(event: 'serverChange', handler: (server: PlexServer | null) => void): void;
  on(event: 'connectionChange', handler: (uri: string | null) => void): void;
  on(event: 'error', handler: (error: PlexApiError) => void): void;
}
```

#### 2.1.5 State Machine: Authentication Flow

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PLEX AUTHENTICATION STATE MACHINE                    │
└─────────────────────────────────────────────────────────────────────────────┘

States: UNAUTHENTICATED, PIN_REQUESTED, PIN_POLLING, VALIDATING, 
        AUTHENTICATED, AUTH_ERROR

                              App Start
                                  │
                                  ▼
                    ┌───────────────────────┐
                    │   UNAUTHENTICATED     │◄──────────────────────────┐
                    └───────────┬───────────┘                           │
                                │                                       │
             ┌──────────────────┼──────────────────┐                   │
             │                  │                  │                    │
             ▼                  ▼                  │                    │
    (has stored token)    (no token)               │                    │
             │                  │                  │                    │
             │                  ▼                  │                    │
             │         ┌───────────────┐           │                    │
             │         │ PIN_REQUESTED │           │                    │
             │         └───────┬───────┘           │                    │
             │                 │                   │                    │
             │                 │ start polling     │                    │
             │                 ▼                   │                    │
             │         ┌───────────────┐           │                    │
             │         │ PIN_POLLING   │───────────┘                    │
             │         └───────┬───────┘  (timeout/cancel)              │
             │                 │                                        │
             │                 │ PIN claimed                            │
             │                 ▼                                        │
             │         ┌───────────────┐                                │
             └────────►│  VALIDATING   │                                │
                       └───────┬───────┘                                │
                               │                                        │
              ┌────────────────┼────────────────┐                      │
              │                │                │                       │
              ▼                ▼                ▼                       │
        (token valid)   (token expired)   (validation error)           │
              │                │                │                       │
              ▼                │                ▼                       │
      ┌───────────────┐        │        ┌───────────────┐              │
      │ AUTHENTICATED │        │        │  AUTH_ERROR   │──────────────┘
      └───────────────┘        │        └───────────────┘   (retry)
              │                │
              │                └────────────────────────────────────────┘
              │                              (re-auth needed)
              │
              │ logout() or token revoked
              │
              └─────────────────────────────────────────────────────────►
                                                           (UNAUTHENTICATED)

PIN Polling Details:
  - Poll every 1 second
  - Timeout after 5 minutes
  - User sees: "Go to plex.tv/link and enter code: ABCD"
```

---

### 2.2 Channel Configuration & Management Module

#### 2.2.1 Module Overview

The Channel Configuration Module handles the creation, storage, and management of virtual channel definitions. A channel is a user-defined construct that maps to a set of content from Plex (libraries, collections, shows, or manual selections) with playback rules.

#### 2.2.2 Assumptions & Constraints

```yaml
Assumptions:
  - Users will create 1-20 channels typically
  - Each channel maps to a curated set of Plex content
  - Channel configurations persist across app sessions
  - Content availability may change (items deleted from Plex)
  - Users want "set and forget" channels that auto-update when library changes

Constraints:
  - LocalStorage limit: ~5MB (must be efficient in storage)
  - Channel count soft limit: 50 (UI performance)
  - Must handle missing content gracefully (removed from Plex)
  - Content lists should be refreshable without losing schedule position
  - No server-side storage (all config is local to TV)
```

#### 2.2.3 Technical Specification

```typescript
// ============================================
// CHANNEL CONFIGURATION - TYPE DEFINITIONS
// ============================================

interface ChannelConfig {
  id: string;                           // UUID
  number: number;                       // Display channel number (1-999)
  name: string;                         // User-defined name
  description?: string;
  icon?: string;                        // Custom icon URL or built-in icon ID
  color?: string;                       // Accent color for UI
  
  // Content source definition
  contentSource: ChannelContentSource;
  
  // Playback behavior
  playbackMode: PlaybackMode;
  shuffleSeed?: number;                 // For deterministic shuffle
  startTimeAnchor: number;              // Unix timestamp for schedule anchor
  
  // Filtering & ordering
  contentFilters?: ContentFilter[];
  sortOrder?: SortOrder;
  
  // Options
  skipIntros: boolean;
  skipCredits: boolean;
  maxEpisodeRunTimeMs?: number;         // Skip items longer than this
  minEpisodeRunTimeMs?: number;         // Skip items shorter than this
  
  // Metadata
  createdAt: number;
  updatedAt: number;
  lastContentRefresh: number;
  itemCount: number;                    // Cached count
  totalDurationMs: number;              // Cached total duration
}

type ChannelContentSource = 
  | LibraryContentSource
  | CollectionContentSource
  | ShowContentSource
  | PlaylistContentSource
  | ManualContentSource
  | MixedContentSource;

interface LibraryContentSource {
  type: 'library';
  libraryId: string;
  libraryType: PlexLibraryType;
  includeWatched: boolean;
}

interface CollectionContentSource {
  type: 'collection';
  collectionKey: string;
  collectionName: string;
}

interface ShowContentSource {
  type: 'show';
  showKey: string;
  showName: string;
  seasonFilter?: number[];              // Specific seasons, or all if undefined
}

interface PlaylistContentSource {
  type: 'playlist';
  playlistKey: string;
  playlistName: string;
}

interface ManualContentSource {
  type: 'manual';
  items: ManualContentItem[];
}

interface ManualContentItem {
  ratingKey: string;
  title: string;                        // Cached for display
  durationMs: number;                   // Cached
}

interface MixedContentSource {
  type: 'mixed';
  sources: ChannelContentSource[];
  mixMode: 'interleave' | 'sequential'; // How to combine sources
}

type PlaybackMode = 
  | 'sequential'                        // Play in order, loop
  | 'shuffle'                           // Deterministic shuffle, loop
  | 'random';                           // True random (not deterministic)

interface ContentFilter {
  field: FilterField;
  operator: FilterOperator;
  value: string | number | boolean;
}

type FilterField = 
  | 'year'
  | 'rating'
  | 'contentRating'
  | 'genre'
  | 'duration'
  | 'watched'
  | 'addedAt';

type FilterOperator = 
  | 'eq' | 'neq' 
  | 'gt' | 'gte' 
  | 'lt' | 'lte' 
  | 'contains' | 'notContains';

type SortOrder = 
  | 'title_asc' | 'title_desc'
  | 'year_asc' | 'year_desc'
  | 'added_asc' | 'added_desc'
  | 'duration_asc' | 'duration_desc'
  | 'episode_order';                    // Season/episode for TV

// --- Resolved Content (runtime) ---

interface ResolvedChannelContent {
  channelId: string;
  resolvedAt: number;
  items: ResolvedContentItem[];
  totalDurationMs: number;
  
  // For deterministic scheduling
  orderedItems: ResolvedContentItem[];  // After shuffle/sort applied
}

interface ResolvedContentItem {
  ratingKey: string;
  type: PlexMediaType;
  title: string;
  fullTitle: string;                    // "Show - S01E05 - Episode Name"
  durationMs: number;
  thumb: string | null;
  year: number;
  seasonNumber?: number;
  episodeNumber?: number;
  
  // For scheduling
  scheduledIndex: number;               // Position in ordered list
}
```

#### 2.2.4 Interface Contract

```typescript
// ============================================
// CHANNEL MANAGEMENT - PUBLIC INTERFACE
// ============================================

interface IChannelManager {
  // CRUD Operations
  createChannel(config: Omit<ChannelConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<ChannelConfig>;
  updateChannel(channelId: string, updates: Partial<ChannelConfig>): Promise<ChannelConfig>;
  deleteChannel(channelId: string): Promise<void>;
  duplicateChannel(channelId: string): Promise<ChannelConfig>;
  
  // Retrieval
  getChannel(channelId: string): ChannelConfig | null;
  getAllChannels(): ChannelConfig[];
  getChannelByNumber(number: number): ChannelConfig | null;
  
  // Ordering
  reorderChannels(orderedIds: string[]): Promise<void>;
  swapChannelNumbers(channelId1: string, channelId2: string): Promise<void>;
  
  // Content Resolution
  resolveChannelContent(channelId: string, forceRefresh?: boolean): Promise<ResolvedChannelContent>;
  refreshAllChannelContent(): Promise<void>;
  
  // Playback State
  getCurrentChannel(): ChannelConfig | null;
  getCurrentChannelIndex(): number;
  switchToChannel(channelId: string): Promise<void>;
  switchToChannelByNumber(number: number): Promise<void>;
  nextChannel(): Promise<void>;
  previousChannel(): Promise<void>;
  
  // Persistence
  exportChannels(): string;             // JSON export
  importChannels(json: string): Promise<ImportResult>;
  
  // Events
  on(event: 'channelCreated', handler: (channel: ChannelConfig) => void): void;
  on(event: 'channelUpdated', handler: (channel: ChannelConfig) => void): void;
  on(event: 'channelDeleted', handler: (channelId: string) => void): void;
  on(event: 'channelSwitch', handler: (channel: ChannelConfig, index: number) => void): void;
  on(event: 'contentResolved', handler: (content: ResolvedChannelContent) => void): void;
}

interface ImportResult {
  success: boolean;
  importedCount: number;
  skippedCount: number;
  errors: string[];
}
```

---

### 2.3 Channel Scheduler Module

#### 2.3.1 Module Overview

The Channel Scheduler is responsible for generating and maintaining deterministic playback schedules. Given a channel's content and the current wall-clock time, it calculates exactly which content item should be playing and at what offset. The schedule must be reproducible—the same channel configuration and time should always yield the same result.

#### 2.3.2 Assumptions & Constraints

```yaml
Assumptions:
  - Wall-clock time is the source of truth for scheduling
  - Device clock is reasonably accurate (within seconds)
  - Users expect to "tune in" to a program already in progress
  - Schedule should extend infinitely (via looping)
  - Content list may change; schedule should gracefully handle this

Constraints:
  - Must calculate current program in <50ms (for responsive channel switching)
  - Must handle content lists from 1 to 10,000+ items
  - Must not allocate excessive memory for schedule (calculate on-demand)
  - Shuffle must be deterministic (same seed = same order)
  - Must handle edge cases: empty channel, single item, very short items

Key Algorithm Requirements:
  - Deterministic: f(channel_config, time) → (item, offset) is pure function
  - Efficient: O(log n) or better for current item lookup
  - Stable: Adding/removing items should minimally disrupt schedule
```

#### 2.3.3 Technical Specification

```typescript
// ============================================
// CHANNEL SCHEDULER - TYPE DEFINITIONS
// ============================================

interface ScheduleConfig {
  channelId: string;
  anchorTime: number;                   // Unix timestamp (ms) - schedule start
  content: ResolvedContentItem[];
  playbackMode: PlaybackMode;
  shuffleSeed: number;
  loopSchedule: boolean;                // Always true for linear channels
}

interface ScheduledProgram {
  item: ResolvedContentItem;
  
  // Absolute times
  scheduledStartTime: number;           // Unix timestamp (ms)
  scheduledEndTime: number;             // Unix timestamp (ms)
  
  // For seeking into the program
  elapsedMs: number;                    // How far into program at query time
  remainingMs: number;                  // Time left in program
  
  // Position in schedule
  scheduleIndex: number;                // Position in current loop
  loopNumber: number;                   // Which iteration of content loop
  
  // Stream info (for playback)
  streamDescriptor: StreamDescriptor | null;  // Resolved when needed
}

interface ScheduleWindow {
  startTime: number;                    // Window start (Unix ms)
  endTime: number;                      // Window end (Unix ms)
  programs: ScheduledProgram[];
}

interface SchedulerState {
  channelId: string;
  isActive: boolean;
  currentProgram: ScheduledProgram | null;
  nextProgram: ScheduledProgram | null;
  schedulePosition: {
    loopNumber: number;
    itemIndex: number;
    offsetMs: number;
  };
  lastSyncTime: number;
}

// For efficient lookup
interface ScheduleIndex {
  channelId: string;
  generatedAt: number;
  totalLoopDurationMs: number;
  itemStartOffsets: number[];           // Cumulative offsets within one loop
  orderedItems: ResolvedContentItem[];
}

// --- Shuffle Algorithm ---

interface ShuffleResult {
  shuffledIndices: number[];
  seed: number;
}
```

#### 2.3.4 Interface Contract

```typescript
// ============================================
// CHANNEL SCHEDULER - PUBLIC INTERFACE
// ============================================

interface IChannelScheduler {
  // Schedule Generation
  loadChannel(config: ScheduleConfig): void;
  unloadChannel(): void;
  
  // Time-based Queries (Core Algorithm)
  getProgramAtTime(time: number): ScheduledProgram;
  getCurrentProgram(): ScheduledProgram;
  getNextProgram(): ScheduledProgram;
  getPreviousProgram(): ScheduledProgram;
  
  // Window Queries (for EPG)
  getScheduleWindow(startTime: number, endTime: number): ScheduleWindow;
  getUpcoming(count: number): ScheduledProgram[];
  
  // Playback Sync
  syncToCurrentTime(): void;            // Align playback to wall clock
  isScheduleStale(currentTime: number): boolean;
  recalculateFromTime(time: number): void;
  
  // Navigation
  jumpToProgram(program: ScheduledProgram): void;
  skipToNext(): void;
  skipToPrevious(): void;
  
  // State
  getState(): SchedulerState;
  getScheduleIndex(): ScheduleIndex;
  
  // Events
  on(event: 'programStart', handler: (program: ScheduledProgram) => void): void;
  on(event: 'programEnd', handler: (program: ScheduledProgram) => void): void;
  on(event: 'scheduleSync', handler: (state: SchedulerState) => void): void;
}

// --- Deterministic Shuffle Utility ---

interface IShuffleGenerator {
  // Seeded shuffle that produces same result for same inputs
  shuffle<T>(items: T[], seed: number): T[];
  
  // Get just indices (more memory efficient for large lists)
  shuffleIndices(count: number, seed: number): number[];
  
  // Generate stable seed from channel config
  generateSeed(channelId: string, anchorTime: number): number;
}
```

#### 2.3.5 Core Scheduling Algorithm

```typescript
// ============================================
// SCHEDULING ALGORITHM - PSEUDOCODE
// ============================================

/**
 * DETERMINISTIC SCHEDULE ALGORITHM
 * 
 * Goal: Given a list of content items and a wall-clock time,
 *       determine exactly which item is playing and the offset within it.
 * 
 * Key Insight: Treat the schedule as an infinite loop of content.
 *              Position = (currentTime - anchorTime) % totalLoopDuration
 */

class ScheduleCalculator {
  private index: ScheduleIndex;
  
  buildIndex(config: ScheduleConfig): ScheduleIndex {
    // 1. Apply shuffle if needed (deterministic)
    const orderedItems = this.applyPlaybackMode(
      config.content,
      config.playbackMode,
      config.shuffleSeed
    );
    
    // 2. Calculate cumulative start offsets
    const itemStartOffsets: number[] = [];
    let cumulative = 0;
    
    for (const item of orderedItems) {
      itemStartOffsets.push(cumulative);
      cumulative += item.durationMs;
    }
    
    return {
      channelId: config.channelId,
      generatedAt: Date.now(),
      totalLoopDurationMs: cumulative,
      itemStartOffsets,
      orderedItems
    };
  }
  
  getProgramAtTime(queryTime: number, anchorTime: number): ScheduledProgram {
    const { totalLoopDurationMs, itemStartOffsets, orderedItems } = this.index;
    
    if (orderedItems.length === 0) {
      throw new Error('Cannot schedule empty channel');
    }
    
    // 1. Calculate position within the infinite schedule
    const elapsedSinceAnchor = queryTime - anchorTime;
    
    // 2. Determine which loop iteration we're in
    const loopNumber = Math.floor(elapsedSinceAnchor / totalLoopDurationMs);
    
    // 3. Position within current loop
    const positionInLoop = ((elapsedSinceAnchor % totalLoopDurationMs) + totalLoopDurationMs) % totalLoopDurationMs;
    
    // 4. Binary search for current item
    const itemIndex = this.binarySearchForItem(positionInLoop);
    
    // 5. Calculate offset within item
    const itemStartOffset = itemStartOffsets[itemIndex];
    const offsetInItem = positionInLoop - itemStartOffset;
    
    const item = orderedItems[itemIndex];
    const remainingMs = item.durationMs - offsetInItem;
    
    // 6. Calculate absolute times
    const absoluteStart = anchorTime + (loopNumber * totalLoopDurationMs) + itemStartOffset;
    const absoluteEnd = absoluteStart + item.durationMs;
    
    return {
      item,
      scheduledStartTime: absoluteStart,
      scheduledEndTime: absoluteEnd,
      elapsedMs: offsetInItem,
      remainingMs,
      scheduleIndex: itemIndex,
      loopNumber,
      streamDescriptor: null  // Resolved separately
    };
  }
  
  private binarySearchForItem(positionInLoop: number): number {
    const { itemStartOffsets } = this.index;
    let low = 0;
    let high = itemStartOffsets.length - 1;
    
    while (low < high) {
      const mid = Math.ceil((low + high + 1) / 2);
      if (itemStartOffsets[mid] <= positionInLoop) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    
    return low;
  }
  
  getScheduleWindow(startTime: number, endTime: number, anchorTime: number): ScheduleWindow {
    const programs: ScheduledProgram[] = [];
    
    // Start from the program at startTime
    let currentProgram = this.getProgramAtTime(startTime, anchorTime);
    programs.push(currentProgram);
    
    // Walk forward until we pass endTime
    while (currentProgram.scheduledEndTime < endTime) {
      currentProgram = this.getNextProgramAfter(currentProgram, anchorTime);
      programs.push(currentProgram);
    }
    
    return { startTime, endTime, programs };
  }
  
  private getNextProgramAfter(current: ScheduledProgram, anchorTime: number): ScheduledProgram {
    // Simply query for 1ms after current program ends
    return this.getProgramAtTime(current.scheduledEndTime + 1, anchorTime);
  }
  
  // Mulberry32 - fast, deterministic PRNG
  private applyPlaybackMode(
    items: ResolvedContentItem[],
    mode: PlaybackMode,
    seed: number
  ): ResolvedContentItem[] {
    switch (mode) {
      case 'sequential':
        return [...items];
        
      case 'shuffle':
        return this.deterministicShuffle(items, seed);
        
      case 'random':
        // Random mode still needs a seed for reproducibility within session
        return this.deterministicShuffle(items, Date.now());
        
      default:
        return items;
    }
  }
  
  private deterministicShuffle<T>(array: T[], seed: number): T[] {
    const result = [...array];
    const random = this.createSeededRandom(seed);
    
    // Fisher-Yates shuffle with seeded RNG
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    
    return result;
  }
  
  private createSeededRandom(seed: number): () => number {
    // Mulberry32 PRNG
    return function() {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
}
```

#### 2.3.6 Scheduler State Machine

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CHANNEL SCHEDULER STATE MACHINE                        │
└─────────────────────────────────────────────────────────────────────────────┘

States: IDLE, LOADING, READY, PLAYING, TRANSITIONING, ERROR

                              loadChannel()
        ┌───────────────────────────────────────────┐
        │                                           ▼
    ┌───────┐                                  ┌─────────┐
    │ IDLE  │                                  │ LOADING │
    └───────┘                                  └────┬────┘
        ▲                                           │
        │ unloadChannel()                           │ index built
        │                                           ▼
        │                                     ┌──────────┐
        │                    ┌────────────────│  READY   │
        │                    │                └────┬─────┘
        │                    │                     │
        │            sync fails                    │ syncToCurrentTime()
        │                    │                     ▼
        │                    │               ┌──────────┐
        │    ┌───────────────┼───────────────│ PLAYING  │◄────────────┐
        │    │               │               └────┬─────┘             │
        │    │               │                    │                   │
        │    ▼               │                    │ program ends      │
        │ ┌───────┐          │                    ▼                   │
        │ │ ERROR │          │          ┌───────────────────┐         │
        │ └───────┘          │          │  TRANSITIONING    │─────────┘
        │    │               │          │ (loading next)    │  next ready
        │    │ retry         │          └───────────────────┘
        │    │               │                    │
        │    └───────────────┼────────────────────┘
        │                    │           (error)
        │                    │
        └────────────────────┘

Timer Events (while PLAYING):
  - Every 1s: Check if current program has ended
  - If ended: Transition to TRANSITIONING, load next program
  - On sync: Verify playback position matches schedule, correct if drifted
```

---

### 2.4 EPG (Electronic Program Guide) UI Module

#### 2.4.1 Module Overview

The EPG module provides the visual program guide interface, displaying channels vertically and time horizontally in a grid format. It handles virtualized rendering for performance, focus management for D-pad navigation, and integration with the scheduler for real-time data.

#### 2.4.2 Assumptions & Constraints

```yaml
Assumptions:
  - Maximum 50 channels displayed
  - Time window: 24 hours of schedule visible (scrollable)
  - Grid cells represent 30-minute blocks
  - Users navigate with D-pad (Up/Down/Left/Right/OK/Back)
  - Guide can be overlaid on video or replace it

Constraints:
  - Must render at 60fps during navigation on low-end hardware
  - Only render visible elements (virtualization required)
  - Maximum DOM elements: ~200 (visible grid cells + chrome)
  - Must update current time indicator without full re-render
  - Focus must be clearly visible from 10 feet away
  - Guide data must be cached to avoid re-fetching on each open

TV UI Requirements:
  - Minimum touch target: 48x48 CSS pixels (for Magic Remote)
  - Focus ring: 4px minimum, high contrast color
  - Text size: 24px minimum for program titles
  - Safe zone: 5% margins on all edges
```

#### 2.4.3 Technical Specification

```typescript
// ============================================
// EPG UI - TYPE DEFINITIONS
// ============================================

interface EPGConfig {
  containerId: string;
  visibleChannels: number;              // Rows visible at once (e.g., 5)
  timeSlotMinutes: number;              // Grid granularity (e.g., 30)
  visibleHours: number;                 // Hours visible at once (e.g., 3)
  totalHours: number;                   // Total hours in schedule (e.g., 24)
  pixelsPerMinute: number;              // Width scaling
  rowHeight: number;                    // Pixels per channel row
  showCurrentTimeIndicator: boolean;
  autoScrollToNow: boolean;
}

interface EPGState {
  isVisible: boolean;
  focusedCell: EPGFocusPosition | null;
  scrollPosition: {
    channelOffset: number;              // Which channel is at top
    timeOffset: number;                 // Minutes from schedule start
  };
  viewWindow: {
    startTime: number;
    endTime: number;
    startChannelIndex: number;
    endChannelIndex: number;
  };
  currentTime: number;
}

interface EPGFocusPosition {
  channelIndex: number;
  programIndex: number;
  program: ScheduledProgram;
  cellElement: HTMLElement | null;
}

interface EPGChannelRow {
  channel: ChannelConfig;
  programs: EPGProgramCell[];
}

interface EPGProgramCell {
  program: ScheduledProgram;
  left: number;                         // Pixel position
  width: number;                        // Pixel width
  isPartial: boolean;                   // Extends beyond view
  isCurrent: boolean;                   // Currently airing
  isFocused: boolean;
}

// For virtualization
interface VirtualizedGridState {
  visibleRows: number[];                // Channel indices currently rendered
  visibleTimeRange: { start: number; end: number };
  recycledElements: Map<string, HTMLElement>;
}

// --- EPG Events ---

interface EPGEventMap {
  'open': void;
  'close': void;
  'focusChange': EPGFocusPosition;
  'channelSelected': { channel: ChannelConfig; program: ScheduledProgram };
  'programSelected': ScheduledProgram;
  'timeScroll': { direction: 'left' | 'right'; newOffset: number };
  'channelScroll': { direction: 'up' | 'down'; newOffset: number };
}
```

#### 2.4.4 Interface Contract

```typescript
// ============================================
// EPG UI - PUBLIC INTERFACE
// ============================================

interface IEPGComponent {
  // Lifecycle
  initialize(config: EPGConfig): void;
  destroy(): void;
  
  // Visibility
  show(): void;
  hide(): void;
  toggle(): void;
  isVisible(): boolean;
  
  // Data Loading
  loadChannels(channels: ChannelConfig[]): void;
  loadScheduleForChannel(
    channelId: string, 
    schedule: ScheduleWindow
  ): void;
  refreshCurrentTime(): void;           // Update "now" indicator
  
  // Navigation
  focusChannel(channelIndex: number): void;
  focusProgram(channelIndex: number, programIndex: number): void;
  focusNow(): void;                     // Jump to current time
  
  scrollToTime(time: number): void;
  scrollToChannel(channelIndex: number): void;
  
  // Input Handling (called by Navigation Manager)
  handleNavigation(direction: 'up' | 'down' | 'left' | 'right'): boolean;
  handleSelect(): boolean;              // OK button
  handleBack(): boolean;                // Returns false if should close
  
  // State
  getState(): EPGState;
  getFocusedProgram(): ScheduledProgram | null;
  
  // Events
  on<K extends keyof EPGEventMap>(
    event: K, 
    handler: (payload: EPGEventMap[K]) => void
  ): void;
  off<K extends keyof EPGEventMap>(
    event: K, 
    handler: (payload: EPGEventMap[K]) => void
  ): void;
}

// --- Info Panel (Program Details) ---

interface IEPGInfoPanel {
  show(program: ScheduledProgram): void;
  hide(): void;
  update(program: ScheduledProgram): void;
}
```

#### 2.4.5 EPG Layout Specification

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                            EPG VISUAL LAYOUT                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ [App Logo]                      PROGRAM GUIDE                   12:45 PM    │
├─────────────────────────────────────────────────────────────────────────────┤
│              │  12:00 PM   │  12:30 PM   │   1:00 PM   │   1:30 PM   │  2:0 │
├──────────────┼─────────────┴─────────────┼─────────────┼─────────────┼──────┤
│ 1  Sci-Fi    │        Blade Runner       │  Total      │   The Matrix      │
│    Channel   │          (1982)           │  Recall     │     (1999)        │
├──────────────┼───────────────────────────┴─────────────┼───────────────────┤
│ 2  Comedy    │   The Office S03E12    │ The Office S03E13 │ The Office S03 │
│    Classics  │   "Traveling Salesman" │ "The Return"      │ "Ben Franklin" │
├──────────────┼────────────────────────┴───────────────────┴─────────────────┤
│ 3  80s       │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│    Action ◄──┼░░░░░░░░░ Die Hard (1988) ░░░░░░░[FOCUSED]░░░░░░░░░░░░░░░░░░░░│
│              │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
├──────────────┼─────────────────────────────────────────┬────────────────────┤
│ 4  Drama     │          The Godfather (1972)          │ The Godfather Part │
│    Greats    │                                        │      II (1974)     │
├──────────────┼────────────────────────────┬───────────┴────────────────────┤
│ 5  Kids      │  Toy Story   │  Toy Story 2  │        Finding Nemo          │
│    Movies    │    (1995)    │    (1999)     │           (2003)             │
├──────────────┴────────────────────────────┴────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  DIE HARD (1988)                                    ★★★★☆  R        │   │
│  │                                                                     │   │
│  │  12:15 PM - 2:27 PM (2h 12m)                                       │   │
│  │                                                                     │   │
│  │  NYPD cop John McClane goes on a Christmas vacation to visit his   │   │
│  │  wife Holly in Los Angeles where she works for a corporation...    │   │
│  │                                                                     │   │
│  │  [Watch Now]     [Record]     [More Info]                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                            ▲
                            │
                      Current Time
                       Indicator
                     (vertical line)

LEGEND:
  ░░░░░  = Focused cell (highlighted with accent color + glow)
  ◄      = Current channel indicator
  ▲      = Current time indicator (red/accent vertical line)
```

#### 2.4.6 Virtualization Strategy

```typescript
// ============================================
// EPG VIRTUALIZATION - IMPLEMENTATION NOTES
// ============================================

/**
 * VIRTUALIZATION STRATEGY
 * 
 * Problem: Full EPG grid could be 50 channels × 48 half-hours = 2400 cells
 * Solution: Only render visible cells + small buffer, recycle DOM elements
 */

class EPGVirtualizer {
  private config: EPGConfig;
  private elementPool: Map<string, HTMLElement> = new Map();
  private visibleCells: Map<string, EPGProgramCell> = new Map();
  
  // Render buffer: extra rows/columns beyond visible area
  private readonly ROW_BUFFER = 2;
  private readonly TIME_BUFFER_MINUTES = 60;
  
  calculateVisibleRange(state: EPGState): VirtualizedGridState {
    const { scrollPosition } = state;
    
    return {
      visibleRows: this.range(
        Math.max(0, scrollPosition.channelOffset - this.ROW_BUFFER),
        Math.min(
          this.totalChannels,
          scrollPosition.channelOffset + this.config.visibleChannels + this.ROW_BUFFER
        )
      ),
      visibleTimeRange: {
        start: scrollPosition.timeOffset - this.TIME_BUFFER_MINUTES,
        end: scrollPosition.timeOffset + 
             (this.config.visibleHours * 60) + 
             this.TIME_BUFFER_MINUTES
      },
      recycledElements: this.elementPool
    };
  }
  
  renderVisibleCells(
    channels: ChannelConfig[],
    schedules: Map<string, ScheduleWindow>,
    range: VirtualizedGridState
  ): void {
    const newVisibleCells = new Map<string, EPGProgramCell>();
    
    // Determine which cells are needed
    for (const rowIndex of range.visibleRows) {
      const channel = channels[rowIndex];
      const schedule = schedules.get(channel.id);
      
      if (!schedule) continue;
      
      for (const program of schedule.programs) {
        // Check if program overlaps visible time range
        if (this.overlapsTimeRange(program, range.visibleTimeRange)) {
          const cellKey = `${channel.id}-${program.scheduledStartTime}`;
          newVisibleCells.set(cellKey, this.createCell(program, rowIndex));
        }
      }
    }
    
    // Recycle cells no longer visible
    for (const [key, cell] of this.visibleCells) {
      if (!newVisibleCells.has(key)) {
        this.recycleElement(key, cell.cellElement);
      }
    }
    
    // Render new cells
    for (const [key, cell] of newVisibleCells) {
      if (!this.visibleCells.has(key)) {
        this.renderCell(key, cell);
      }
    }
    
    this.visibleCells = newVisibleCells;
  }
  
  private recycleElement(key: string, element: HTMLElement | null): void {
    if (element) {
      element.style.display = 'none';
      element.classList.remove('focused', 'current');
      this.elementPool.set(key, element);
    }
  }
  
  private getOrCreateElement(): HTMLElement {
    // Try to reuse from pool
    for (const [key, element] of this.elementPool) {
      this.elementPool.delete(key);
      return element;
    }
    
    // Create new element
    const el = document.createElement('div');
    el.className = 'epg-cell';
    return el;
  }
}
```

---

### 2.5 Navigation & Remote Control Module

#### 2.5.1 Module Overview

The Navigation Module handles all user input from the LG remote control, translates key codes to semantic actions, manages focus state across the application, and coordinates screen/modal transitions. It implements TV-appropriate navigation patterns including spatial navigation and focus memory.

#### 2.5.2 Assumptions & Constraints

```yaml
Assumptions:
  - Primary input is LG Magic Remote (pointer + D-pad) or standard IR remote
  - D-pad navigation is primary; pointer is supplementary
  - Users expect consistent navigation patterns (Back = go back, not close app)
  - Focus should be visually obvious at all times
  - Long-press and repeat keys should be supported

Constraints:
  - Key event handling must be <16ms to maintain 60fps
  - Must handle both keydown events and pointer/click events
  - Some remotes lack certain buttons (older remotes no color buttons)
  - WebOS may intercept some keys (Home, Settings)
  - Must implement focus trapping for modals
  - Must handle Magic Remote pointer mode enable/disable

Key Codes (webOS):
  - OK/Enter: 13
  - Back: 461
  - Up: 38, Down: 40, Left: 37, Right: 39
  - Play: 415, Pause: 19, Stop: 413
  - Rewind: 412, FastForward: 417
  - Red: 403, Green: 404, Blue: 405, Yellow: 406
  - Channel Up: 33, Channel Down: 34
  - Number keys: 48-57 (0-9)
```

#### 2.5.3 Technical Specification

```typescript
// ============================================
// NAVIGATION - TYPE DEFINITIONS
// ============================================

interface NavigationConfig {
  enablePointerMode: boolean;
  keyRepeatDelayMs: number;             // Initial delay before repeat
  keyRepeatIntervalMs: number;          // Interval between repeats
  focusMemoryEnabled: boolean;          // Remember focus per screen
  debugMode: boolean;                   // Log key events
}

type RemoteButton = 
  | 'ok' | 'back'
  | 'up' | 'down' | 'left' | 'right'
  | 'play' | 'pause' | 'stop'
  | 'rewind' | 'fastforward'
  | 'channelUp' | 'channelDown'
  | 'red' | 'green' | 'yellow' | 'blue'
  | 'num0' | 'num1' | 'num2' | 'num3' | 'num4'
  | 'num5' | 'num6' | 'num7' | 'num8' | 'num9'
  | 'info' | 'guide';

interface KeyEvent {
  button: RemoteButton;
  isRepeat: boolean;
  isLongPress: boolean;
  timestamp: number;
  originalEvent: KeyboardEvent;
}

type Screen = 
  | 'splash'
  | 'auth'
  | 'server-select'
  | 'home'
  | 'player'
  | 'guide'
  | 'channel-edit'
  | 'settings'
  | 'error';

interface NavigationState {
  currentScreen: Screen;
  screenStack: Screen[];                // For back navigation
  focusedElementId: string | null;
  modalStack: string[];                 // Active modals
  isPointerActive: boolean;
}

interface FocusableElement {
  id: string;
  element: HTMLElement;
  group?: string;                       // For grouped navigation
  neighbors: {
    up?: string;
    down?: string;
    left?: string;
    right?: string;
  };
  onFocus?: () => void;
  onBlur?: () => void;
  onSelect?: () => void;
}

interface FocusGroup {
  id: string;
  elements: string[];                   // FocusableElement IDs
  wrapAround: boolean;
  orientation: 'horizontal' | 'vertical' | 'grid';
  columns?: number;                     // For grid layout
}

// --- Navigation Events ---

interface NavigationEventMap {
  'keyPress': KeyEvent;
  'screenChange': { from: Screen; to: Screen };
  'focusChange': { from: string | null; to: string };
  'modalOpen': { modalId: string };
  'modalClose': { modalId: string };
  'pointerModeChange': { active: boolean };
}
```

#### 2.5.4 Interface Contract

```typescript
// ============================================
// NAVIGATION - PUBLIC INTERFACE
// ============================================

interface INavigationManager {
  // Initialization
  initialize(config: NavigationConfig): void;
  destroy(): void;
  
  // Screen Navigation
  goTo(screen: Screen, params?: Record<string, unknown>): void;
  goBack(): boolean;                    // Returns false if at root
  replaceScreen(screen: Screen): void;  // No stack push
  getScreenParams(): Record<string, unknown>;
  
  // Focus Management
  setFocus(elementId: string): void;
  getFocusedElement(): FocusableElement | null;
  moveFocus(direction: 'up' | 'down' | 'left' | 'right'): boolean;
  
  // Registration
  registerFocusable(element: FocusableElement): void;
  unregisterFocusable(elementId: string): void;
  registerFocusGroup(group: FocusGroup): void;
  unregisterFocusGroup(groupId: string): void;
  
  // Modals
  openModal(modalId: string): void;
  closeModal(modalId?: string): void;   // Close top if no ID
  isModalOpen(modalId?: string): boolean;
  
  // Input Blocking (during transitions)
  blockInput(): void;
  unblockInput(): void;
  isInputBlocked(): boolean;
  
  // State
  getCurrentScreen(): Screen;
  getState(): NavigationState;
  
  // Events
  on<K extends keyof NavigationEventMap>(
    event: K,
    handler: (payload: NavigationEventMap[K]) => void
  ): void;
  off<K extends keyof NavigationEventMap>(
    event: K,
    handler: (payload: NavigationEventMap[K]) => void
  ): void;
}

// --- Focus Manager (internal, used by Navigation) ---

interface IFocusManager {
  // Core operations
  focus(elementId: string): boolean;
  blur(): void;
  
  // Spatial navigation
  findNeighbor(
    fromId: string, 
    direction: 'up' | 'down' | 'left' | 'right'
  ): string | null;
  
  // Focus memory
  saveFocusState(screenId: string): void;
  restoreFocusState(screenId: string): boolean;
  
  // Visual updates
  updateFocusRing(elementId: string): void;
  hideFocusRing(): void;
}
```

#### 2.5.5 Key Mapping Implementation

```typescript
// ============================================
// REMOTE KEY HANDLING - IMPLEMENTATION
// ============================================

class RemoteKeyHandler {
  private keyMap: Map<number, RemoteButton> = new Map([
    // Navigation
    [13, 'ok'],
    [461, 'back'],
    [38, 'up'],
    [40, 'down'],
    [37, 'left'],
    [39, 'right'],
    
    // Playback
    [415, 'play'],
    [19, 'pause'],
    [413, 'stop'],
    [412, 'rewind'],
    [417, 'fastforward'],
    
    // Channel
    [33, 'channelUp'],
    [34, 'channelDown'],
    
    // Color buttons
    [403, 'red'],
    [404, 'green'],
    [405, 'blue'],
    [406, 'yellow'],
    
    // Numbers
    [48, 'num0'], [49, 'num1'], [50, 'num2'], [51, 'num3'], [52, 'num4'],
    [53, 'num5'], [54, 'num6'], [55, 'num7'], [56, 'num8'], [57, 'num9'],
    
    // Info/Guide (may vary by remote model)
        [457, 'info'],
    [458, 'guide'],
  ]);
  
  private longPressThresholdMs = 500;
  private keyDownTimestamps: Map<number, number> = new Map();
  
  initialize(): void {
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    document.addEventListener('keyup', this.handleKeyUp.bind(this));
  }
  
  private handleKeyDown(event: KeyboardEvent): void {
    const button = this.keyMap.get(event.keyCode);
    if (!button) return;
    
    const now = Date.now();
    const isRepeat = event.repeat;
    
    if (!isRepeat) {
      this.keyDownTimestamps.set(event.keyCode, now);
    }
    
    const keyDownTime = this.keyDownTimestamps.get(event.keyCode) || now;
    const isLongPress = (now - keyDownTime) > this.longPressThresholdMs;
    
    const keyEvent: KeyEvent = {
      button,
      isRepeat,
      isLongPress,
      timestamp: now,
      originalEvent: event
    };
    
    this.dispatchKeyEvent(keyEvent);
    
    // Prevent default for navigation keys to avoid browser behavior
    if (['up', 'down', 'left', 'right', 'back'].includes(button)) {
      event.preventDefault();
    }
  }
  
  private handleKeyUp(event: KeyboardEvent): void {
    this.keyDownTimestamps.delete(event.keyCode);
  }
  
  private dispatchKeyEvent(event: KeyEvent): void {
    // Route to appropriate handler based on current app state
    // This is coordinated by NavigationManager
  }
}

// --- Context-Aware Key Routing ---

class ContextualKeyRouter {
  private navigationManager: INavigationManager;
  private epg: IEPGComponent;
  private videoPlayer: IVideoPlayer;
  private scheduler: IChannelScheduler;
  
  routeKey(event: KeyEvent): void {
    const screen = this.navigationManager.getCurrentScreen();
    
    // Modal has priority
    if (this.navigationManager.isModalOpen()) {
      this.handleModalKey(event);
      return;
    }
    
    // Route based on screen
    switch (screen) {
      case 'player':
        this.handlePlayerKey(event);
        break;
      case 'guide':
        this.handleGuideKey(event);
        break;
      default:
        this.handleDefaultKey(event);
    }
  }
  
  private handlePlayerKey(event: KeyEvent): void {
    switch (event.button) {
      case 'ok':
      case 'play':
        this.videoPlayer.isPlaying() 
          ? this.videoPlayer.pause() 
          : this.videoPlayer.play();
        break;
        
      case 'pause':
        this.videoPlayer.pause();
        break;
        
      case 'up':
      case 'guide':
        this.navigationManager.goTo('guide');
        break;
        
      case 'channelUp':
        this.scheduler.skipToNext();
        break;
        
      case 'channelDown':
        this.scheduler.skipToPrevious();
        break;
        
      case 'left':
      case 'rewind':
        this.videoPlayer.seekRelative(-10000); // -10 seconds
        break;
        
      case 'right':
      case 'fastforward':
        this.videoPlayer.seekRelative(10000); // +10 seconds
        break;
        
      case 'back':
        // Show exit confirmation or minimize
        this.showExitConfirm();
        break;
        
      case 'info':
        this.showInfoOverlay();
        break;
        
      default:
        // Number keys for direct channel input
        if (event.button.startsWith('num')) {
          this.handleChannelNumberInput(event.button);
        }
    }
  }
  
  private handleGuideKey(event: KeyEvent): void {
    switch (event.button) {
      case 'up':
      case 'down':
      case 'left':
      case 'right':
        const handled = this.epg.handleNavigation(event.button);
        if (!handled) {
          // At edge of EPG, could scroll or do nothing
        }
        break;
        
      case 'ok':
        this.epg.handleSelect();
        break;
        
      case 'back':
      case 'guide':
        this.epg.hide();
        this.navigationManager.goTo('player');
        break;
        
      case 'channelUp':
      case 'channelDown':
        // Quick channel change even in guide
        event.button === 'channelUp'
          ? this.scheduler.skipToNext()
          : this.scheduler.skipToPrevious();
        break;
    }
  }
  
  private channelNumberBuffer: string = '';
  private channelNumberTimeout: number | null = null;
  
  private handleChannelNumberInput(button: RemoteButton): void {
    const digit = button.replace('num', '');
    this.channelNumberBuffer += digit;
    
    // Clear previous timeout
    if (this.channelNumberTimeout) {
      clearTimeout(this.channelNumberTimeout);
    }
    
    // Show visual feedback of entered digits
    this.showChannelNumberOverlay(this.channelNumberBuffer);
    
    // Wait 1.5 seconds for more input, then tune
    this.channelNumberTimeout = window.setTimeout(() => {
      const channelNum = parseInt(this.channelNumberBuffer, 10);
      this.channelNumberBuffer = '';
      
      if (channelNum > 0) {
        this.tuneToChannel(channelNum);
      }
    }, 1500);
  }
}
```

#### 2.5.6 Focus Ring CSS Specification

```css
/* ============================================
   FOCUS RING STYLES FOR TV UI
   ============================================ */

:root {
  --focus-color: #00a8e1;           /* LG-style blue */
  --focus-glow-color: rgba(0, 168, 225, 0.5);
  --focus-ring-width: 4px;
  --focus-scale: 1.05;
  --focus-transition: 150ms ease-out;
}

/* Base focusable element */
.focusable {
  position: relative;
  transition: 
    transform var(--focus-transition),
    box-shadow var(--focus-transition);
  outline: none;
}

/* Focus state */
.focusable:focus,
.focusable.focused {
  transform: scale(var(--focus-scale));
  box-shadow: 
    0 0 0 var(--focus-ring-width) var(--focus-color),
    0 0 20px var(--focus-glow-color);
  z-index: 100;
}

/* EPG cell specific focus */
.epg-cell.focused {
  background-color: var(--focus-color);
  transform: scale(1.02);
  z-index: 10;
}

.epg-cell.focused .epg-cell-title {
  font-weight: bold;
}

/* Button focus */
.button.focused {
  background-color: var(--focus-color);
  color: white;
}

/* No focus ring when pointer is active */
.pointer-active .focusable:focus {
  box-shadow: none;
  transform: none;
}

/* Hover state for pointer mode */
.pointer-active .focusable:hover {
  background-color: rgba(255, 255, 255, 0.1);
  cursor: pointer;
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  :root {
    --focus-ring-width: 6px;
    --focus-color: #ffffff;
  }
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .focusable {
    transition: none;
  }
  
  .focusable:focus,
  .focusable.focused {
    transform: none;
  }
}
```

## 2.6 Video Player Abstraction Module

### 2.6.1 Module Overview

The Video Player Abstraction provides a unified interface for media playback on webOS, abstracting the underlying HTML5 video element and webOS-specific media APIs. This module handles stream initialization, playback control, subtitle management, and error recovery.

### 2.6.2 Assumptions & Constraints

```yaml
Assumptions:
  - webOS 6.0+ provides HTML5 video element with HLS support
  - Direct play streams from Plex are preferred (no transcoding)
  - Most content will be H.264/AAC in HLS or MP4 containers
  - Subtitle formats: SRT, VTT, PGS (image-based may require Plex burn-in)
  - TV hardware can decode up to 4K HEVC on newer models, 1080p H.264 baseline

Constraints:
  - Memory limit ~300MB for web apps; video buffer managed by system
  - No DRM support in base HTML5 (Widevine requires Luna API integration)
  - Audio codec support varies: AAC universal, AC3/EAC3 on most, TrueHD limited
  - Maximum simultaneous video elements: 1 (practical limit)
  - Seek operations may take 2-5 seconds on HLS streams
```

### 2.6.3 Technical Specification

```typescript
// ============================================
// VIDEO PLAYER ABSTRACTION - TYPE DEFINITIONS
// ============================================

interface VideoPlayerConfig {
  containerId: string;
  defaultVolume: number;           // 0.0 - 1.0
  bufferAheadMs: number;           // Target buffer size
  seekIncrementSec: number;        // Default seek step (e.g., 10)
  hideControlsAfterMs: number;     // Auto-hide UI timeout
  retryAttempts: number;           // On error, retry count
  retryDelayMs: number;            // Delay between retries
}

interface StreamDescriptor {
  url: string;                     // Playback URL (HLS or direct)
  protocol: 'hls' | 'dash' | 'direct';
  mimeType: string;                // e.g., 'application/x-mpegURL'
  startPositionMs: number;         // Resume position
  mediaMetadata: MediaMetadata;
  subtitleTracks: SubtitleTrack[];
  audioTracks: AudioTrack[];
  durationMs: number;
  isLive: boolean;                 // Live vs. VOD behavior
}

interface MediaMetadata {
  title: string;
  subtitle?: string;               // Episode name, etc.
  artworkUrl?: string;
  year?: number;
  rating?: string;
  plexRatingKey: string;
}

interface SubtitleTrack {
  id: string;
  language: string;
  languageCode: string;            // ISO 639-1
  url: string;
  format: 'srt' | 'vtt' | 'pgs' | 'ass';
  isDefault: boolean;
  isForced: boolean;
  requiresBurnIn: boolean;         // PGS/ASS may need transcoding
}

interface AudioTrack {
  id: string;
  language: string;
  languageCode: string;
  codec: string;
  channels: number;
  isDefault: boolean;
}

interface PlaybackState {
  status: PlayerStatus;
  currentTimeMs: number;
  durationMs: number;
  bufferPercent: number;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
  activeSubtitleId: string | null;
  activeAudioId: string | null;
  errorInfo: PlaybackError | null;
}

type PlayerStatus = 
  | 'idle'
  | 'loading'
  | 'buffering'
  | 'playing'
  | 'paused'
  | 'seeking'
  | 'ended'
  | 'error';

interface PlaybackError {
  code: PlaybackErrorCode;
  message: string;
  recoverable: boolean;
  retryCount: number;
}

type PlaybackErrorCode =
  | 'NETWORK_ERROR'
  | 'DECODE_ERROR'
  | 'FORMAT_UNSUPPORTED'
  | 'DRM_ERROR'
  | 'SOURCE_NOT_FOUND'
  | 'UNKNOWN';

// Player Events
interface PlayerEventMap {
  'stateChange': PlaybackState;
  'timeUpdate': { currentTimeMs: number; durationMs: number };
  'bufferUpdate': { percent: number; bufferedRanges: TimeRange[] };
  'trackChange': { type: 'audio' | 'subtitle'; trackId: string | null };
  'ended': void;
  'error': PlaybackError;
  'mediaLoaded': { durationMs: number; tracks: { audio: AudioTrack[]; subtitle: SubtitleTrack[] } };
}

interface TimeRange {
  startMs: number;
  endMs: number;
}
```

### 2.6.4 Interface Contract

```typescript
// ============================================
// VIDEO PLAYER ABSTRACTION - PUBLIC INTERFACE
// ============================================

interface IVideoPlayer {
  // Lifecycle
  initialize(config: VideoPlayerConfig): Promise<void>;
  destroy(): void;

  // Stream Management
  loadStream(descriptor: StreamDescriptor): Promise<void>;
  unloadStream(): void;

  // Playback Control
  play(): Promise<void>;
  pause(): void;
  stop(): void;
  seekTo(positionMs: number): Promise<void>;
  seekRelative(deltaMs: number): Promise<void>;  // +/- from current

  // Volume
  setVolume(level: number): void;   // 0.0 - 1.0
  getVolume(): number;
  mute(): void;
  unmute(): void;
  toggleMute(): void;

  // Tracks
  setSubtitleTrack(trackId: string | null): Promise<void>;
  setAudioTrack(trackId: string): Promise<void>;
  getAvailableSubtitles(): SubtitleTrack[];
  getAvailableAudio(): AudioTrack[];

  // State
  getState(): PlaybackState;
  getCurrentTimeMs(): number;
  getDurationMs(): number;
  isPlaying(): boolean;

  // Events
  on<K extends keyof PlayerEventMap>(
    event: K,
    handler: (payload: PlayerEventMap[K]) => void
  ): void;
  off<K extends keyof PlayerEventMap>(
    event: K,
    handler: (payload: PlayerEventMap[K]) => void
  ): void;

  // webOS Specific
  requestMediaSession(): void;      // For system media controls
  releaseMediaSession(): void;
}
```

### 2.6.5 State Machine Definition

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                        VIDEO PLAYER STATE MACHINE                          │
└─────────────────────────────────────────────────────────────────────────────┘

States: IDLE, LOADING, BUFFERING, PLAYING, PAUSED, SEEKING, ENDED, ERROR

                    loadStream()
        ┌──────────────────────────────────┐
        │                                  ▼
    ┌───────┐                         ┌─────────┐
    │ IDLE  │                         │ LOADING │
    └───────┘                         └─────────┘
        ▲                                  │
        │ stop() / unload()                │ canplay event
        │                                  ▼
        │                            ┌───────────┐
        │      ┌─────────────────────│ BUFFERING │◄────────────────┐
        │      │                     └───────────┘                 │
        │      │ buffer ready             │                        │
        │      ▼                          │ play()                 │
        │  ┌─────────┐                    ▼                        │
        │  │  ENDED  │◄──────────── ┌─────────┐ ──── waiting ──────┘
        │  └─────────┘   ended      │ PLAYING │      (buffer empty)
        │      │                    └─────────┘
        │      │ loadStream()            │ ▲
        │      └───────────────┐         │ │
        │                      │  pause()│ │play()
        │                      ▼         ▼ │
        │                   ┌───────┐  ┌────────┐
        │                   │LOADING│  │ PAUSED │
        │                   └───────┘  └────────┘
        │                                  │
        │                        seekTo()  │
        │                      ┌───────────┘
        │                      ▼
        │                 ┌─────────┐
        │                 │ SEEKING │
        │                 └─────────┘
        │                      │
        │                      │ seeked event
        │                      ▼
        │               (return to PLAYING or PAUSED)
        │
    ┌───────┐
    │ ERROR │◄─────── Any state on unrecoverable error
    └───────┘
        │
        │ retry() or loadStream()
        └──────────────────────────────────────────►(LOADING)

Transitions:
  IDLE → LOADING:        loadStream() called
  LOADING → BUFFERING:   Video metadata loaded, waiting for buffer
  BUFFERING → PLAYING:   Sufficient buffer, play() or autoplay
  PLAYING → PAUSED:      pause() called or system interrupt
  PLAYING → BUFFERING:   Buffer depleted during playback
  PLAYING → SEEKING:     seekTo() called
  PAUSED → PLAYING:      play() called
  PAUSED → SEEKING:      seekTo() called
  SEEKING → PLAYING:     Seek complete, was playing
  SEEKING → PAUSED:      Seek complete, was paused
  PLAYING → ENDED:       Playback reached end
  ENDED → LOADING:       loadStream() for next content
  ANY → ERROR:           Unrecoverable error occurred
  ERROR → LOADING:       Retry or new loadStream()
  ANY → IDLE:            stop() or unloadStream()
```

### 2.6.6 Implementation Notes

```typescript
// ============================================
// VIDEO PLAYER - IMPLEMENTATION GUIDANCE
// ============================================

/**
 * WebOS-Specific Considerations:
 * 
 * 1. Use HTML5 <video> element as primary playback mechanism
 * 2. For HLS, set video.src directly - webOS handles HLS natively
 * 3. Do NOT use third-party HLS.js - causes memory bloat on webOS
 * 4. Handle webOS-specific error codes from video element
 * 5. Implement keep-alive to prevent system from killing during long play
 */

class WebOSVideoPlayer implements IVideoPlayer {
  private videoElement: HTMLVideoElement;
  private state: PlaybackState;
  private config: VideoPlayerConfig;
  private eventEmitter: EventEmitter;
  private retryTimer: number | null = null;
  private keepAliveInterval: number | null = null;

  // webOS media object for Luna service integration (optional)
  private mediaId: string | null = null;

  async initialize(config: VideoPlayerConfig): Promise<void> {
    this.config = config;
    this.videoElement = document.createElement('video');
    this.videoElement.id = 'main-video-player';
    this.videoElement.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: #000;
      object-fit: contain;
    `;
    
    const container = document.getElementById(config.containerId);
    if (!container) throw new Error('Video container not found');
    container.appendChild(this.videoElement);

    this.setupEventListeners();
    this.startKeepAlive();
    
    this.state = this.createInitialState();
  }

  private setupEventListeners(): void {
    const v = this.videoElement;
    
    v.addEventListener('loadstart', () => this.updateStatus('loading'));
    v.addEventListener('waiting', () => this.updateStatus('buffering'));
    v.addEventListener('canplay', () => this.handleCanPlay());
    v.addEventListener('playing', () => this.updateStatus('playing'));
    v.addEventListener('pause', () => this.updateStatus('paused'));
    v.addEventListener('seeking', () => this.updateStatus('seeking'));
    v.addEventListener('seeked', () => this.handleSeeked());
    v.addEventListener('ended', () => this.handleEnded());
    v.addEventListener('error', (e) => this.handleError(e));
    v.addEventListener('timeupdate', () => this.emitTimeUpdate());
    v.addEventListener('progress', () => this.emitBufferUpdate());
  }

  private startKeepAlive(): void {
    // Prevent webOS from suspending the app during long playback
    // Touch the screen periodically (no-op paint) or use Luna service
    this.keepAliveInterval = window.setInterval(() => {
      if (this.state.status === 'playing') {
        // Minimal DOM operation to signal activity
        document.body.style.opacity = '1';
      }
    }, 30000); // Every 30 seconds
  }

  async loadStream(descriptor: StreamDescriptor): Promise<void> {
    this.unloadStream();
    
    this.updateStatus('loading');
    
    // Set source based on protocol
    if (descriptor.protocol === 'hls') {
      this.videoElement.src = descriptor.url;
    } else {
      // Direct play - may need type hint
      const source = document.createElement('source');
      source.src = descriptor.url;
      source.type = descriptor.mimeType;
      this.videoElement.appendChild(source);
    }

    // Set start position
    if (descriptor.startPositionMs > 0) {
      this.videoElement.currentTime = descriptor.startPositionMs / 1000;
    }

    // Load subtitles as text tracks
    this.loadSubtitleTracks(descriptor.subtitleTracks);

    // Store metadata for events
    this.state.durationMs = descriptor.durationMs;

    await this.videoElement.load();
  }

  private loadSubtitleTracks(tracks: SubtitleTrack[]): void {
    // Clear existing tracks
    while (this.videoElement.firstChild) {
      if (this.videoElement.firstChild.nodeName === 'TRACK') {
        this.videoElement.removeChild(this.videoElement.firstChild);
      }
    }

    tracks
      .filter(t => !t.requiresBurnIn)
      .forEach(track => {
        const trackEl = document.createElement('track');
        trackEl.kind = 'subtitles';
        trackEl.label = track.language;
        trackEl.srclang = track.languageCode;
        trackEl.src = track.url;
        trackEl.default = track.isDefault;
        trackEl.id = track.id;
        this.videoElement.appendChild(trackEl);
      });
  }

  private handleError(event: Event): void {
    const mediaError = this.videoElement.error;
    let code: PlaybackErrorCode = 'UNKNOWN';
    let message = 'Unknown playback error';
    let recoverable = false;

    if (mediaError) {
      switch (mediaError.code) {
        case MediaError.MEDIA_ERR_NETWORK:
          code = 'NETWORK_ERROR';
          message = 'Network error during playback';
          recoverable = true;
          break;
        case MediaError.MEDIA_ERR_DECODE:
          code = 'DECODE_ERROR';
          message = 'Media decode failed';
          recoverable = false;
          break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          code = 'FORMAT_UNSUPPORTED';
          message = 'Media format not supported';
          recoverable = false;
          break;
        default:
          code = 'UNKNOWN';
          message = mediaError.message || 'Unknown error';
      }
    }

    const error: PlaybackError = {
      code,
      message,
      recoverable,
      retryCount: (this.state.errorInfo?.retryCount || 0) + 1
    };

    if (recoverable && error.retryCount <= this.config.retryAttempts) {
      this.scheduleRetry();
    } else {
      this.updateStatus('error');
      this.state.errorInfo = error;
      this.eventEmitter.emit('error', error);
    }
  }

  // ... additional method implementations
}
```

---

## 2.7 Application Lifecycle & Error Handling Module

### 2.7.1 Module Overview

This module manages the webOS application lifecycle including initialization, visibility changes, system events, background/foreground transitions, and graceful error recovery. It ensures the app remains stable during extended operation and properly handles system interruptions.

### 2.7.2 Assumptions & Constraints

```yaml
Assumptions:
  - webOS will suspend/pause web apps when minimized or after inactivity
  - The app may be killed without warning if system needs resources
  - Network connectivity can change during runtime (WiFi drops, etc.)
  - Plex server may become unreachable at any time
  - User may leave app running for extended periods (24+ hours)

Constraints:
  - Must save critical state before potential termination
  - LocalStorage limit: ~5MB per origin
  - IndexedDB available but with limits (~50MB practical)
  - No background execution when app is not visible
  - System may throttle timers when app is backgrounded
```

### 2.7.3 Technical Specification

```typescript
// ============================================
// APPLICATION LIFECYCLE - TYPE DEFINITIONS
// ============================================

interface AppLifecycleState {
  phase: AppPhase;
  isVisible: boolean;
  isNetworkAvailable: boolean;
  lastActiveTime: number;
  plexConnectionStatus: ConnectionStatus;
  currentError: AppError | null;
}

type AppPhase = 
  | 'initializing'
  | 'authenticating'
  | 'loading_data'
  | 'ready'
  | 'backgrounded'
  | 'resuming'
  | 'error'
  | 'terminating';

type ConnectionStatus = 
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'unreachable';

interface AppError {
  type: AppErrorType;
  message: string;
  timestamp: number;
  context?: Record<string, unknown>;
  userMessage: string;
  actions: ErrorAction[];
}

type AppErrorType =
  | 'INITIALIZATION_FAILED'
  | 'AUTH_EXPIRED'
  | 'NETWORK_UNAVAILABLE'
  | 'PLEX_UNREACHABLE'
  | 'DATA_CORRUPTION'
  | 'PLAYBACK_FAILED'
  | 'OUT_OF_MEMORY'
  | 'UNKNOWN';

interface ErrorAction {
  label: string;
  action: () => void | Promise<void>;
  isPrimary: boolean;
}

interface PersistentState {
  version: number;
  plexAuth: PlexAuthData | null;
  channelConfigs: ChannelConfig[];
  currentChannelIndex: number;
  userPreferences: UserPreferences;
  lastUpdated: number;
}

interface UserPreferences {
  defaultStartTime: number;         // Hour of day for schedule start
  shuffleDefault: boolean;
  showClockOverlay: boolean;
  autoHideInfoMs: number;
  preferredSubtitleLanguage: string;
  preferredAudioLanguage: string;
}

// Lifecycle Events
interface LifecycleEventMap {
  'phaseChange': { from: AppPhase; to: AppPhase };
  'visibilityChange': { isVisible: boolean };
  'networkChange': { isAvailable: boolean };
  'plexConnectionChange': { status: ConnectionStatus };
  'error': AppError;
  'stateRestored': PersistentState;
  'beforeTerminate': void;
}
```

### 2.7.4 Interface Contract

```typescript
// ============================================
// APPLICATION LIFECYCLE - PUBLIC INTERFACE
// ============================================

interface IAppLifecycle {
  // Initialization
  initialize(): Promise<void>;
  getPhase(): AppPhase;
  getState(): AppLifecycleState;

  // State Persistence
  saveState(): Promise<void>;
  restoreState(): Promise<PersistentState | null>;
  clearAllData(): Promise<void>;

  // Error Handling
  reportError(error: AppError): void;
  clearError(): void;
  getCurrentError(): AppError | null;

  // Network Monitoring
  isNetworkAvailable(): boolean;
  checkPlexConnectivity(): Promise<boolean>;

  // Lifecycle Hooks
  onResume(callback: () => void): void;
  onPause(callback: () => void): void;
  onTerminate(callback: () => Promise<void>): void;

  // Events
  on<K extends keyof LifecycleEventMap>(
    event: K,
    handler: (payload: LifecycleEventMap[K]) => void
  ): void;
  off<K extends keyof LifecycleEventMap>(
    event: K,
    handler: (payload: LifecycleEventMap[K]) => void
  ): void;
}

// Error Recovery Strategies
interface IErrorRecovery {
  attemptRecovery(error: AppError): Promise<boolean>;
  getRecoveryOptions(error: AppError): ErrorAction[];
  registerRecoveryHandler(
    errorType: AppErrorType,
    handler: (error: AppError) => Promise<boolean>
  ): void;
}
```

### 2.7.5 State Machine Definition

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                    APPLICATION LIFECYCLE STATE MACHINE                      │
└─────────────────────────────────────────────────────────────────────────────┘

States: INITIALIZING, AUTHENTICATING, LOADING_DATA, READY, BACKGROUNDED, 
        RESUMING, ERROR, TERMINATING

                            App Launch
                                │
                                ▼
                        ┌───────────────┐
                        │ INITIALIZING  │
                        └───────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
              ▼                 ▼                 ▼
        (has saved auth)  (no auth)         (init failed)
              │                 │                 │
              ▼                 ▼                 ▼
      ┌──────────────┐  ┌───────────────┐   ┌─────────┐
      │ LOADING_DATA │  │AUTHENTICATING │   │  ERROR  │
      └──────────────┘  └───────────────┘   └─────────┘
              │                 │                 │
              │     ┌───────────┘                 │
              │     │                             │
              ▼     ▼                             │
           ┌──────────┐                           │
           │  READY   │◄──────────────────────────┘
           └──────────┘     (retry success)
              │     ▲
              │     │
   visibility │     │ visibility
   hidden     │     │ shown
              ▼     │
        ┌─────────────┐
        │ BACKGROUNDED│
        └─────────────┘
              │
              │ visibility shown
              ▼
         ┌──────────┐
         │ RESUMING │────────────────► READY (checks pass)
         └──────────┘                     │
              │                           │
              │ (stale data/auth)         │
              ▼                           │
        LOADING_DATA or                   │
        AUTHENTICATING                    │
                                          │
                                          ▼
                                 ┌─────────────┐
     Back/Exit key ─────────────►│ TERMINATING │
     or System Kill              └─────────────┘
                                          │
                                          ▼
                                    (App Closed)

ERROR State Transitions:
  - Any state can transition to ERROR on critical failure
  - ERROR → READY: Successful recovery
  - ERROR → AUTHENTICATING: Auth retry needed
  - ERROR → TERMINATING: User chooses to exit
```

### 2.7.6 Implementation Patterns

```typescript
// ============================================
// APPLICATION LIFECYCLE - IMPLEMENTATION
// ============================================

class WebOSAppLifecycle implements IAppLifecycle {
  private state: AppLifecycleState;
  private eventEmitter: EventEmitter;
  private pauseCallbacks: Array<() => void> = [];
  private resumeCallbacks: Array<() => void> = [];
  private terminateCallbacks: Array<() => Promise<void>> = [];
  private networkCheckInterval: number | null = null;
  private memoryMonitorInterval: number | null = null;

  async initialize(): Promise<void> {
    this.state = {
      phase: 'initializing',
      isVisible: true,
      isNetworkAvailable: navigator.onLine,
      lastActiveTime: Date.now(),
      plexConnectionStatus: 'disconnected',
      currentError: null
    };

    // Setup webOS-specific lifecycle handlers
    this.setupVisibilityHandlers();
    this.setupNetworkMonitoring();
    this.setupMemoryMonitoring();
    this.setupKeyHandlers();

    // Attempt state restoration
    const savedState = await this.restoreState();
    
    if (savedState?.plexAuth) {
      this.transitionTo('loading_data');
      // Validate token and load data...
    } else {
      this.transitionTo('authenticating');
    }
  }

  private setupVisibilityHandlers(): void {
    // Standard visibility API
    document.addEventListener('visibilitychange', () => {
      const isVisible = document.visibilityState === 'visible';
      this.handleVisibilityChange(isVisible);
    });

    // webOS-specific events (if using webOSTV.js library)
    if (typeof webOS !== 'undefined') {
      document.addEventListener('webOSRelaunch', (event: any) => {
        // App was relaunched while already running
        console.log('App relaunched with params:', event.detail);
        this.handleResume();
      });

      document.addEventListener('webOSLocaleChange', () => {
        // Handle locale changes if needed
      });
    }
  }

  private handleVisibilityChange(isVisible: boolean): void {
    this.state.isVisible = isVisible;
    this.eventEmitter.emit('visibilityChange', { isVisible });

    if (!isVisible) {
      // Going to background
      this.transitionTo('backgrounded');
      this.pauseCallbacks.forEach(cb => cb());
      this.saveState(); // Persist before backgrounding
    } else {
      // Coming to foreground
      this.handleResume();
    }
  }

  private async handleResume(): Promise<void> {
    this.transitionTo('resuming');
    this.state.lastActiveTime = Date.now();

    // Check if significant time has passed
    const savedState = await this.restoreState();
    const staleThresholdMs = 30 * 60 * 1000; // 30 minutes

    if (Date.now() - (savedState?.lastUpdated || 0) > staleThresholdMs) {
      // Data may be stale, need to resync schedules
      this.transitionTo('loading_data');
    } else {
      this.transitionTo('ready');
    }

    this.resumeCallbacks.forEach(cb => cb());
  }

  private setupNetworkMonitoring(): void {
    window.addEventListener('online', () => {
      this.state.isNetworkAvailable = true;
      this.eventEmitter.emit('networkChange', { isAvailable: true });
      this.checkPlexConnectivity();
    });

    window.addEventListener('offline', () => {
      this.state.isNetworkAvailable = false;
      this.eventEmitter.emit('networkChange', { isAvailable: false });
      this.state.plexConnectionStatus = 'disconnected';
    });

    // Periodic connectivity check
    this.networkCheckInterval = window.setInterval(() => {
      if (this.state.isVisible && this.state.phase === 'ready') {
        this.checkPlexConnectivity();
      }
    }, 60000); // Every minute
  }

  private setupMemoryMonitoring(): void {
    // Monitor memory usage to prevent OOM kills
    this.memoryMonitorInterval = window.setInterval(() => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        const usedMB = memory.usedJSHeapSize / (1024 * 1024);
        const limitMB = memory.jsHeapSizeLimit / (1024 * 1024);
        
        if (usedMB / limitMB > 0.8) {
          console.warn(`High memory usage: ${usedMB.toFixed(1)}MB / ${limitMB.toFixed(1)}MB`);
          this.attemptMemoryCleanup();
        }
      }
    }, 30000); // Every 30 seconds
  }

  private attemptMemoryCleanup(): void {
    // Release cached data that can be reloaded
    // This would call into other modules to clear caches
    this.eventEmitter.emit('memoryPressure', {});
    
    // Force GC if available (usually not in production)
    if ((window as any).gc) {
      (window as any).gc();
    }
  }

  private setupKeyHandlers(): void {
    document.addEventListener('keydown', (event) => {
      // Handle Back button for navigation/exit
      if (event.keyCode === 461) { // webOS Back key
        if (!this.handleBackNavigation()) {
          // At root - prompt exit
          this.showExitConfirmation();
        }
        event.preventDefault();
      }
    });
  }

  async saveState(): Promise<void> {
    const stateToSave: PersistentState = {
      version: 1,
      plexAuth: await PlexAuth.getStoredCredentials(),
      channelConfigs: ChannelManager.getConfigs(),
      currentChannelIndex: ChannelManager.getCurrentIndex(),
      userPreferences: PreferencesManager.getAll(),
      lastUpdated: Date.now()
    };

    try {
      localStorage.setItem('app_state', JSON.stringify(stateToSave));
    } catch (e) {
      // Storage full - try to clear old data
      console.error('Failed to save state:', e);
    }
  }

  async restoreState(): Promise<PersistentState | null> {
    try {
      const saved = localStorage.getItem('app_state');
      if (saved) {
        const parsed = JSON.parse(saved) as PersistentState;
        // Version migration if needed
        if (parsed.version < 1) {
          return this.migrateState(parsed);
        }
        this.eventEmitter.emit('stateRestored', parsed);
        return parsed;
      }
    } catch (e) {
      console.error('Failed to restore state:', e);
    }
    return null;
  }

  private transitionTo(phase: AppPhase): void {
    const from = this.state.phase;
    this.state.phase = phase;
    this.eventEmitter.emit('phaseChange', { from, to: phase });
  }
}
```

### 2.7.7 Error Recovery Patterns

```typescript
// ============================================
// ERROR RECOVERY STRATEGIES
// ============================================

class ErrorRecoveryManager implements IErrorRecovery {
  private recoveryHandlers: Map<AppErrorType, (error: AppError) => Promise<boolean>> = new Map();

  constructor() {
    this.registerDefaultHandlers();
  }

  private registerDefaultHandlers(): void {
    // Network errors - retry with backoff
    this.registerRecoveryHandler('NETWORK_UNAVAILABLE', async (error) => {
      const maxRetries = 3;
      let retries = 0;
      
      while (retries < maxRetries) {
        await this.delay(Math.pow(2, retries) * 1000);
        if (navigator.onLine) {
          return true;
        }
        retries++;
      }
      return false;
    });

    // Plex unreachable - attempt reconnection
    this.registerRecoveryHandler('PLEX_UNREACHABLE', async (error) => {
      // Try all available server URIs
      const connections = await PlexAPI.getAvailableConnections();
      for (const conn of connections) {
        try {
          await PlexAPI.testConnection(conn.uri);
          await PlexAPI.setActiveConnection(conn.uri);
          return true;
        } catch (e) {
          continue;
        }
      }
      return false;
    });

    // Auth expired - prompt re-authentication
    this.registerRecoveryHandler('AUTH_EXPIRED', async (error) => {
      // Cannot auto-recover - need user action
      return false;
    });

    // Playback failed - try different stream
    this.registerRecoveryHandler('PLAYBACK_FAILED', async (error) => {
      const context = error.context as { mediaKey: string } | undefined;
      if (context?.mediaKey) {
        // Request transcoded stream as fallback
        try {
          const fallbackUrl = await PlexAPI.getTranscodedStreamUrl(context.mediaKey);
          // VideoPlayer would need to retry with this URL
          return true;
        } catch (e) {
          return false;
        }
      }
      return false;
    });
  }

  async attemptRecovery(error: AppError): Promise<boolean> {
    const handler = this.recoveryHandlers.get(error.type);
    if (handler) {
      try {
        return await handler(error);
      } catch (e) {
        console.error('Recovery attempt failed:', e);
        return false;
      }
    }
    return false;
  }

  getRecoveryOptions(error: AppError): ErrorAction[] {
    const actions: ErrorAction[] = [];

    switch (error.type) {
      case 'NETWORK_UNAVAILABLE':
        actions.push({
          label: 'Retry',
          action: () => this.attemptRecovery(error),
          isPrimary: true
        });
        break;

      case 'AUTH_EXPIRED':
        actions.push({
          label: 'Sign In Again',
          action: () => NavigationManager.goTo('auth'),
          isPrimary: true
        });
        break;

      case 'PLEX_UNREACHABLE':
        actions.push({
          label: 'Retry Connection',
          action: () => this.attemptRecovery(error),
          isPrimary: true
        });
        actions.push({
          label: 'Change Server',
          action: () => NavigationManager.goTo('server-selection'),
          isPrimary: false
        });
        break;

      case 'PLAYBACK_FAILED':
        actions.push({
          label: 'Skip to Next',
          action: () => ChannelScheduler.skipToNext(),
          isPrimary: true
        });
        actions.push({
          label: 'Try Again',
          action: () => VideoPlayer.retry(),
          isPrimary: false
        });
        break;
    }

    // Always include exit option
    actions.push({
      label: 'Exit App',
      action: () => AppLifecycle.terminate(),
      isPrimary: false
    });

    return actions;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

## 2.8 Module Integration & Orchestration

### 2.8.1 Application Orchestrator

```typescript
// ============================================
// MAIN APPLICATION ORCHESTRATOR
// ============================================

interface IAppOrchestrator {
  start(): Promise<void>;
  shutdown(): Promise<void>;
  getModuleStatus(): Record<string, ModuleStatus>;
}

interface ModuleStatus {
  name: string;
  initialized: boolean;
  healthy: boolean;
  lastError?: string;
}

class AppOrchestrator implements IAppOrchestrator {
  private modules: {
    lifecycle: IAppLifecycle;
    plexAuth: IPlexAuth;
    plexLibrary: IPlexLibrary;
    channelManager: IChannelManager;
    scheduler: IChannelScheduler;
    videoPlayer: IVideoPlayer;
    epgUI: IEPGComponent;
    navigation: INavigationManager;
  };

  async start(): Promise<void> {
    console.log('[Orchestrator] Starting application...');

    // Phase 1: Core infrastructure
    await this.initializeLifecycle();
    await this.initializeNavigation();

    // Phase 2: Check for saved state and auth
    const savedState = await this.modules.lifecycle.restoreState();
    
    if (savedState?.plexAuth) {
      // Phase 3a: Restore existing session
      await this.initializePlexWithToken(savedState.plexAuth);
      await this.restoreChannels(savedState.channelConfigs);
      await this.resumePlayback(savedState.currentChannelIndex);
    } else {
      // Phase 3b: New session - show auth
      await this.modules.navigation.goTo('auth');
    }

    // Phase 4: Setup event bindings between modules
    this.setupInterModuleCommunication();

    console.log('[Orchestrator] Application started successfully');
  }

  private async initializeLifecycle(): Promise<void> {
    this.modules.lifecycle = new WebOSAppLifecycle();
    await this.modules.lifecycle.initialize();

    // Handle critical lifecycle events
    this.modules.lifecycle.onPause(() => {
      this.modules.videoPlayer.pause();
      this.modules.lifecycle.saveState();
    });

    this.modules.lifecycle.onResume(() => {
      // Check if schedule needs recalculation
      const now = Date.now();
      const scheduleStale = this.modules.scheduler.isScheduleStale(now);
      if (scheduleStale) {
        this.modules.scheduler.recalculateFromTime(now);
      }
      // Resume playback
      this.modules.scheduler.syncToCurrentTime();
    });

    this.modules.lifecycle.onTerminate(async () => {
      await this.shutdown();
    });
  }

  private setupInterModuleCommunication(): void {
    // Scheduler -> Video Player
    this.modules.scheduler.on('programStart', (program) => {
      this.modules.videoPlayer.loadStream(program.streamDescriptor);
      this.modules.videoPlayer.seekTo(program.startOffsetMs);
      this.modules.videoPlayer.play();
    });

    // Video Player -> Scheduler
    this.modules.videoPlayer.on('ended', () => {
      // Shouldn't normally happen in linear mode, but handle gracefully
      this.modules.scheduler.advanceToNextProgram();
    });

    this.modules.videoPlayer.on('error', (error) => {
      if (!error.recoverable) {
        // Skip to next program on unrecoverable error
        this.modules.scheduler.advanceToNextProgram();
      }
    });

    // Channel Manager -> Scheduler
    this.modules.channelManager.on('channelChange', (channelIndex) => {
      const schedule = this.modules.channelManager.getChannelSchedule(channelIndex);
      this.modules.scheduler.loadSchedule(schedule);
      this.modules.scheduler.syncToCurrentTime();
    });

    // EPG UI -> Channel Manager
    this.modules.epgUI.on('channelSelected', (channelIndex) => {
      this.modules.channelManager.switchToChannel(channelIndex);
    });

    this.modules.epgUI.on('programSelected', (program) => {
      // Jump to specific program
      this.modules.scheduler.jumpToProgram(program);
    });

    // Network changes
    this.modules.lifecycle.on('networkChange', ({ isAvailable }) => {
      if (!isAvailable) {
        this.modules.epgUI.showNetworkWarning();
      } else {
        this.modules.epgUI.hideNetworkWarning();
        // Re-validate Plex connection
        this.modules.plexAuth.validateToken();
      }
    });
  }

  async shutdown(): Promise<void> {
    console.log('[Orchestrator] Shutting down...');
    
    // Save state
    await this.modules.lifecycle.saveState();
    
    // Stop playback
    this.modules.videoPlayer.stop();
    
    // Cleanup resources
    this.modules.videoPlayer.destroy();
    this.modules.epgUI.destroy();
    
    console.log('[Orchestrator] Shutdown complete');
  }
}
```

---

## 3. Hosted App Deployment Structure

### 3.1 Directory Layout

```text
plex-virtual-channels/
├── dist/                           # Built application (for packaging)
│   ├── index.html
│   ├── appinfo.json               # webOS app manifest
│   ├── icon.png                   # App icon (80x80)
│   ├── largeIcon.png              # Large icon (130x130)
│   ├── splash.png                 # Splash screen (1920x1080)
│   ├── css/
│   │   ├── main.css
│   │   └── tv-focus.css           # Focus ring styles
│   ├── js/
│   │   ├── bundle.js              # Main application bundle
│   │   ├── vendor.js              # Third-party libraries
│   │   └── webos-polyfills.js     # Platform compatibility
│   └── assets/
│       ├── images/
│       └── fonts/
│
├── src/                            # Source code
│   ├── modules/
│   │   ├── plex/
│   │   │   ├── PlexAuth.ts
│   │   │   ├── PlexLibrary.ts
│   │   │   ├── PlexStreamResolver.ts
│   │   │   └── index.ts
│   │   ├── scheduler/
│   │   │   ├── ChannelManager.ts
│   │   │   ├── ChannelScheduler.ts
│   │   │   ├── ScheduleGenerator.ts
│   │   │   └── index.ts
│   │   ├── player/
│   │   │   ├── VideoPlayer.ts
│   │   │   ├── SubtitleManager.ts
│   │   │   └── index.ts
│   │   ├── ui/
│   │   │   ├── EPGComponent.ts
│   │   │   ├── PlayerOverlay.ts
│   │   │   ├── ChannelBanner.ts
│   │   │   ├── SettingsScreen.ts
│   │   │   └── index.ts
│   │   ├── navigation/
│   │   │   ├── NavigationManager.ts
│   │   │   ├── FocusManager.ts
│   │   │   └── RemoteHandler.ts
│   │   └── lifecycle/
│   │       ├── AppLifecycle.ts
│   │       ├── ErrorRecovery.ts
│   │       └── StateManager.ts
│   │
│   ├── App.ts                      # Main application entry
│   ├── Orchestrator.ts             # Module coordinator
│   └── index.ts                    # Bootstrap
│
├── hosted/                          # Hosted app server (dev/staging)
│   ├── server.js                   # Express server
│   └── nginx.conf                  # Production nginx config
│
├── tests/
│   ├── unit/
│   └── integration/
│
├── tools/
│   ├── build.js                    # Build script
│   ├── package-ipk.js              # IPK packaging
│   └── deploy-tv.js                # Deploy to TV in dev mode
│
├── appinfo.json                    # webOS app manifest source
├── package.json
├── tsconfig.json
└── README.md
```

### 3.2 appinfo.json (webOS Manifest)

```json
{
  "id": "com.example.plexchannels",
  "version": "1.0.0",
  "vendor": "Your Company",
  "type": "web",
  "main": "index.html",
  "title": "Plex Virtual Channels",
  "icon": "icon.png",
  "largeIcon": "largeIcon.png",
  "splashBackground": "splash.png",
  "bgColor": "#1a1a2e",
  "resolution": "1920x1080",
  "transparent": false,
  "handlesRelaunch": true,
  "disableBackHistoryAPI": false,
  "requiredPermissions": [
    "time.query",
    "activity.operation"
  ]
}
```

### 3.3 Build & Deployment Scripts

```javascript
// tools/build.js
const esbuild = require('esbuild');
const fs = require('fs-extra');

async function build() {
  // Clean dist
  await fs.emptyDir('./dist');

  // Bundle TypeScript
  await esbuild.build({
    entryPoints: ['./src/index.ts'],
    bundle: true,
    minify: process.env.NODE_ENV === 'production',
    sourcemap: process.env.NODE_ENV !== 'production',
    target: ['es2018'],  // webOS 6.0 Chromium level
    outfile: './dist/js/bundle.js',
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
    }
  });

  // Copy static assets
  await fs.copy('./public/index.html', './dist/index.html');
  await fs.copy('./public/css', './dist/css');
  await fs.copy('./public/assets', './dist/assets');
  await fs.copy('./appinfo.json', './dist/appinfo.json');
  await fs.copy('./icons', './dist');

  console.log('Build complete!');
}

build().catch(console.error);
```

```javascript
// tools/deploy-tv.js
const { exec } = require('child_process');
const path = require('path');

const APP_ID = 'com.example.plexchannels';
const TV_IP = process.env.TV_IP || '192.168.1.100';
const DIST_PATH = path.resolve('./dist');

async function deploy() {
  console.log(`Deploying to TV at ${TV_IP}...`);

  // Package the app
  await execAsync(`ares-package ${DIST_PATH} -o ./build`);

  // Find the generated IPK
  const ipkFile = `./build/${APP_ID}_1.0.0_all.ipk`;

  // Install on TV
  await execAsync(`ares-install --device ${TV_IP} ${ipkFile}`);

  // Launch the app
  await execAsync(`ares-launch --device ${TV_IP} ${APP_ID}`);

  console.log('Deployment complete!');
}

function execAsync(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

deploy().catch(console.error);
```

### 3.4 Hosted App Configuration (nginx)

```nginx
# hosted/nginx.conf - Production hosted app server

server {
    listen 443 ssl http2;
    server_name plexchannels.example.com;

    ssl_certificate /etc/ssl/certs/plexchannels.crt;
    ssl_certificate_key /etc/ssl/private/plexchannels.key;

    root /var/www/plexchannels/dist;
    index index.html;

    # Security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.plex.direct https://*.plex.tv; connect-src 'self' https://*.plex.tv https://*.plex.direct wss://*.plex.direct;";

    # Cache static assets aggressively
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Don't cache HTML (for updates)
    location = /index.html {
        expires -1;
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Health check endpoint
    location /health {
        return 200 'OK';
        add_header Content-Type text/plain;
    }
}
```

---

## 4. Sequence Diagrams

### 4.1 Application Startup Sequence

```text
┌──────────┐  ┌───────────┐  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌────────┐
│  webOS   │  │Orchestrator│ │Lifecycle│  │PlexAuth │  │ChannelMgr│  │Scheduler│
└────┬─────┘  └─────┬─────┘  └────┬────┘  └────┬────┘  └────┬─────┘  └───┬────┘
     │              │             │            │            │            │
     │ launch app   │             │            │            │            │
     │─────────────>│             │            │            │            │
     │              │             │            │            │            │
     │              │ initialize()│            │            │            │
     │              │────────────>│            │            │            │
     │              │             │            │            │            │
     │              │<────────────│            │            │            │
     │              │             │            │            │            │
     │              │ restoreState()           │            │            │
     │              │────────────>│            │            │            │
     │              │             │            │            │            │
     │              │<─ PersistentState ───────│            │            │
     │              │             │            │            │            │
     │              │             │            │            │            │
     │              ├─────────────┼───────────>│            │            │
     │              │             │ validateToken()         │            │
     │              │             │            │            │            │
     │              │             │<─ valid ───│            │            │
     │              │             │            │            │            │
     │              │             │            │            │            │
     │              ├─────────────┼───────────>│            │            │
     │              │             │   restoreChannels()     │            │
     │              │             │            │            │            │
     │              │             │            │<───────────│            │
     │              │             │            │            │            │
     │              │             │            │  loadSchedule()         │
     │              │             │            │ ───────────┼───────────>│
     │              │             │            │            │            │
     │              │             │            │            │            │
     │              │             │            │ syncToCurrentTime()     │
     │              │             │            │ ───────────┼───────────>│
     │              │             │            │            │            │
     │              │             │            │            │<── ready ──│
     │              │             │            │            │            │
     │<─ video ─────┼─────────────┼────────────┼────────────┼────────────│
     │  playback    │             │            │            │            │
     │              │             │            │            │            │
```

### 4.2 Channel Switch Sequence

```text
┌────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌────────┐
│ Remote │  │Navigation│  │ChannelMgr│  │Scheduler │  │VideoPlayer│  │PlexAPI │
└───┬────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬─────┘  └───┬────┘
    │            │             │             │              │            │
    │ CH+ key    │             │             │              │            │
    │───────────>│             │             │              │            │
    │            │             │             │              │            │
    │            │ nextChannel()             │              │            │
    │            │────────────>│             │              │            │
    │            │             │             │              │            │
    │            │             │ emit('channelChange')      │            │
    │            │             │────────────>│              │            │
    │            │             │             │              │            │
    │            │             │             │ stop()       │            │
    │            │             │             │─────────────>│            │
    │            │             │             │              │            │
    │            │             │ getSchedule()              │            │
    │            │             │<────────────│              │            │
    │            │             │             │              │            │
    │            │             │             │ getCurrentProgram()       │
    │            │             │             │──────────────┼───────────>│
    │            │             │             │              │            │
    │            │             │             │<── StreamDescriptor ─────│
    │            │             │             │              │            │
    │            │             │ loadStream()│              │            │
    │            │             │────────────>│              │            │
    │            │             │             │─────────────>│            │
    │            │             │             │              │            │
    │            │             │             │ seekTo(offset)            │
    │            │             │             │─────────────>│            │
    │            │             │             │              │            │
    │            │             │             │ play()       │            │
    │            │             │             │─────────────>│            │
    │            │             │             │              │            │
    │<── video ──┼─────────────┼─────────────┼──────────────│            │
    │  starts    │             │             │              │            │
    │            │             │             │              │            │
```

### 4.3 EPG Interaction Sequence

```text
┌────────┐  ┌──────────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐
│ Remote │  │Navigation│  │  EPG UI │  │ChannelMgr│  │Scheduler │
└───┬────┘  └────┬─────┘  └────┬────┘  └────┬─────┘  └────┬─────┘
    │            │             │            │             │
    │ GUIDE key  │             │            │             │
    │───────────>│             │            │             │
    │            │             │            │             │
    │            │ showEPG()   │            │             │
    │            │────────────>│            │             │
    │            │             │            │             │
    │            │             │ getChannelList()         │
    │            │             │───────────>│             │
    │            │             │            │             │
    │            │             │<── channels[]            │
    │            │             │            │             │
    │            │             │ getScheduleWindow()      │
    │            │             │────────────┼────────────>│
    │            │             │            │             │
    │            │             │<── programs[] ───────────│
    │            │             │            │             │
    │            │<─ render ───│            │             │
    │            │             │            │             │
    │ D-pad nav  │             │            │             │
    │───────────>│             │            │             │
    │            │ focusMove() │            │             │
    │            │────────────>│            │             │
    │            │             │            │             │
    │            │<─ update ───│            │             │
    │            │             │            │             │
    │ OK (select)│             │            │             │
    │───────────>│             │            │             │
    │            │             │            │             │
    │            │ selectProgram()          │             │
    │            │────────────>│            │             │
    │            │             │            │             │
    │            │             │ emit('channelSelected')  │
    │            │             │───────────>│             │
    │            │             │            │             │
    │            │<─ hideEPG() │            │             │
    │            │             │            │             │
    │            │             │            │ switchChannel()
    │            │             │            │────────────>│
    │            │             │            │             │
```

---

## 5. Component Dependency Graph

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                        APPLICATION ARCHITECTURE                             │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────┐
                              │  Orchestrator   │
                              │  (App Entry)    │
                              └────────┬────────┘
                                       │
           ┌───────────────────────────┼───────────────────────────┐
           │                           │                           │
           ▼                           ▼                           ▼
   ┌───────────────┐          ┌───────────────┐          ┌───────────────┐
   │  AppLifecycle │          │ NavigationMgr │          │  ErrorRecovery│
   │               │◄────────►│               │◄────────►│               │
   └───────────────┘          └───────┬───────┘          └───────────────┘
           │                          │
           │                          │
           ▼                          ▼
   ┌───────────────┐          ┌───────────────┐
   │ StateManager  │          │ FocusManager  │
   │ (Persistence) │          │ (Remote Input)│
   └───────────────┘          └───────────────┘
                                      │
                     ┌────────────────┼────────────────┐
                     │                │                │
                     ▼                ▼                ▼
             ┌───────────┐    ┌───────────┐    ┌───────────────┐
             │  EPG UI   │    │PlayerOver-│    │ SettingsScreen│
             │           │    │   lay     │    │               │
             └─────┬─────┘    └─────┬─────┘    └───────────────┘
                   │                │
                   │                │
                   ▼                ▼
           ┌───────────────────────────────────┐
           │         Channel Manager            │
           │  (Channel Config & State)          │
           └───────────────┬───────────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
      ┌────────────┐ ┌───────────┐ ┌────────────┐
      │ Schedule   │ │ Channel   │ │ Plex       │
      │ Generator  │ │ Scheduler │ │ Library    │
      └──────┬─────┘ └─────┬─────┘ └──────┬─────┘
             │             │              │
             │             │              │
             ▼             ▼              ▼
      ┌───────────────────────────────────────────┐
      │              Video Player                  │
      │       (WebOS Video Abstraction)           │
      └─────────────────────┬─────────────────────┘
                            │
                            ▼
      ┌───────────────────────────────────────────┐
      │         Plex Stream Resolver              │
      │     (URL Resolution, Token Injection)     │
      └─────────────────────┬─────────────────────┘
                            │
                            ▼
      ┌───────────────────────────────────────────┐
      │              Plex Auth                     │
      │    (OAuth, Token Storage, Validation)     │
      └───────────────────────────────────────────┘

LEGEND:
  ────► : Dependency (uses)
  ◄────► : Bidirectional communication
  │      : Composition/ownership
```

---

## 6. Key Implementation Priorities

### Phase 1: Core Playback (MVP)

1. **Plex Auth** - OAuth flow, token management
2. **Plex Library** - Fetch movies/shows
3. **Basic Scheduler** - Simple sequential playback
4. **Video Player** - HLS/direct play
5. **Minimal UI** - Channel banner, basic controls

### Phase 2: Full EPG Experience

1. **Schedule Generator** - Deterministic multi-day schedules
2. **EPG Grid UI** - Full program guide with navigation
3. **Channel Management** - Create/edit/delete channels
4. **Focus Management** - D-pad navigation throughout

### Phase 3: Polish & Robustness

1. **Error Recovery** - All failure scenarios
2. **Offline Tolerance** - Cached EPG, graceful degradation
3. **Performance Optimization** - Memory, rendering
4. **Settings & Preferences** - User customization

### Phase 4: Store Submission

1. **Compliance Testing** - LG guidelines checklist
2. **Soak Testing** - 24+ hour continuous operation
3. **Asset Preparation** - Icons, screenshots, descriptions
4. **Final QA** - All TV models, edge cases

---

This specification provides the architectural foundation for implementing the Plex Virtual Channels application on LG webOS. Each module is designed for independent development while maintaining clear integration contracts.
