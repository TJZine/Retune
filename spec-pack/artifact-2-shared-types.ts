/**
 * @module SharedTypes
 * @description Central type definitions for Retune - webOS Plex Virtual Channels Application
 * @version 1.0.0
 * @platform webOS 4.0+ (Chromium 68)
 */

// ============================================
// UTILITY TYPES
// ============================================

/**
 * Result type for operations that can fail.
 * Use this pattern for error handling instead of throwing exceptions.
 */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Generic event handler type
 */
export type EventHandler<T> = (payload: T) => void;

/**
 * Disposable interface for cleanup
 */
export interface IDisposable {
  dispose(): void;
}

/**
 * Type-safe event emitter with error isolation.
 * One handler's error does not prevent other handlers from executing.
 * 
 * @template TEventMap - A record type mapping event names to payload types
 * 
 * @example
 * ```typescript
 * interface MyEvents {
 *   userLogin: { userId: string };
 *   userLogout: { userId: string; reason: string };
 * }
 * 
 * const emitter = new TypedEventEmitter<MyEvents>();
 * emitter.on('userLogin', (payload) => console.log(payload.userId));
 * emitter.emit('userLogin', { userId: '123' });
 * ```
 */
export class TypedEventEmitter<TEventMap extends Record<string, unknown>> {
  private handlers: Map<keyof TEventMap, Set<(payload: unknown) => void>> = new Map();
  
  /**
   * Register an event handler
   * @returns A disposable to remove the handler
   */
  on<K extends keyof TEventMap>(
    event: K,
    handler: (payload: TEventMap[K]) => void
  ): IDisposable {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as (payload: unknown) => void);
    
    return {
      dispose: () => this.off(event, handler)
    };
  }
  
  /**
   * Unregister an event handler
   */
  off<K extends keyof TEventMap>(
    event: K,
    handler: (payload: TEventMap[K]) => void
  ): void {
    this.handlers.get(event)?.delete(handler as (payload: unknown) => void);
  }
  
  /**
   * Emit an event to all registered handlers.
   * CRITICAL: Errors in handlers are caught and logged, NOT propagated.
   * This ensures one faulty handler doesn't crash the entire app.
   */
  emit<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): void {
    const eventHandlers = this.handlers.get(event);
    if (!eventHandlers) return;
    
    eventHandlers.forEach(handler => {
      try {
        handler(payload);
      } catch (error) {
        // Error isolation: log but don't propagate
        console.error(
          `[EventEmitter] Handler error for event '${String(event)}':`,
          error
        );
        // Optionally report to error tracking service
        // ErrorReporter.captureException(error);
      }
    });
  }
  
  /**
   * Remove all handlers for a specific event or all events
   */
  removeAllListeners(event?: keyof TEventMap): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }
  
  /**
   * Get the count of handlers for an event
   */
  listenerCount(event: keyof TEventMap): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get MIME type for a stream decision's protocol.
 * Used when creating video source elements.
 * 
 * @param protocol - The stream protocol (hls, dash, or direct/http)
 * @returns The appropriate MIME type string
 * 
 * @example
 * ```typescript
 * const descriptor: StreamDescriptor = {
 *   url: decision.playbackUrl,
 *   protocol: decision.protocol,
 *   mimeType: getMimeType(decision.protocol),
 *   // ...
 * };
 * ```
 */
export function getMimeType(protocol: 'hls' | 'dash' | 'direct' | 'http'): string {
  const mimeTypes: Record<string, string> = {
    hls: 'application/x-mpegURL',
    dash: 'application/dash+xml',
    direct: 'video/mp4',
    http: 'video/mp4',
  };
  return mimeTypes[protocol] ?? 'video/mp4';
}

// ============================================
// LOGGING INFRASTRUCTURE
// ============================================

/**
 * Log levels for structured logging
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Structured log entry
 */
export interface LogEntry {
  /** Timestamp of log entry */
  timestamp: number;
  /** Log level */
  level: LogLevel;
  /** Module that generated the log */
  module: string;
  /** Log message */
  message: string;
  /** Optional structured data */
  data?: Record<string, unknown>;
  /** Error if applicable */
  error?: Error;
}

/**
 * Logger interface for consistent logging across modules
 */
export interface ILogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error, data?: Record<string, unknown>): void;
}

// ============================================
// DOMAIN: Plex Authentication
// ============================================

/**
 * Configuration for Plex API client identification.
 * These values are sent with every Plex API request.
 */
export interface PlexAuthConfig {
  /** Unique app instance ID (UUID v4) - persisted across sessions */
  clientIdentifier: string;
  /** App name shown in Plex dashboard (e.g., "Retune") */
  product: string;
  /** App version string (e.g., "1.0.0") */
  version: string;
  /** Platform identifier - always "webOS" */
  platform: string;
  /** webOS version (e.g., "4.0", "5.0") */
  platformVersion: string;
  /** Device type (e.g., "LG Smart TV") */
  device: string;
  /** User-friendly device name (e.g., "Living Room TV") */
  deviceName: string;
}

/**
 * Represents a PIN request for OAuth flow.
 * User navigates to plex.tv/link and enters the code.
 */
export interface PlexPinRequest {
  /** Plex-assigned PIN ID for polling */
  id: number;
  /** 4-character code for user to enter at plex.tv/link */
  code: string;
  /** PIN expiration time (typically 5 minutes) */
  expiresAt: Date;
  /** Populated when user claims the PIN - null until then */
  authToken: string | null;
  /** Client identifier used when requesting this PIN */
  clientIdentifier: string;
}

/**
 * Authenticated Plex user token and profile.
 * Stored in localStorage for session persistence.
 */
export interface PlexAuthToken {
  /** OAuth token for API requests - include in X-Plex-Token header */
  token: string;
  /** Plex user ID */
  userId: string;
  /** Plex username */
  username: string;
  /** User email address */
  email: string;
  /** Avatar URL */
  thumb: string;
  /** Token expiration - usually null (long-lived tokens) */
  expiresAt: Date | null;
  /** When token was issued */
  issuedAt: Date;
}

/**
 * Complete authentication data including selected server.
 * This is the root object persisted for auth state.
 */
export interface PlexAuthData {
  /** User authentication token and profile */
  token: PlexAuthToken;
  /** Currently selected Plex server machine ID */
  selectedServerId: string | null;
  /** Active connection URI for the selected server */
  selectedServerUri: string | null;
}

// ============================================
// DOMAIN: Plex Server & Connection
// ============================================

/**
 * Represents a Plex Media Server accessible to the user.
 * A user may have access to multiple servers (owned or shared).
 */
export interface PlexServer {
  /** Machine identifier - unique per server */
  id: string;
  /** User-defined server name */
  name: string;
  /** Owner's username */
  sourceTitle: string;
  /** Owner's Plex user ID */
  ownerId: string;
  /** true if current user owns this server */
  owned: boolean;
  /** Available connection endpoints (local, remote, relay) */
  connections: PlexConnection[];
  /** Server capabilities list */
  capabilities: string[];
  /** Best available connection after testing - null until tested */
  preferredConnection: PlexConnection | null;
}

/**
 * A single connection endpoint to a Plex server.
 * Servers typically have multiple connections (LAN, WAN, relay).
 */
export interface PlexConnection {
  /** Full URL (e.g., "http://192.168.1.5:32400" or "https://xxx.plex.direct:32400") */
  uri: string;
  /** Connection protocol */
  protocol: 'http' | 'https';
  /** IP address or hostname */
  address: string;
  /** Port number (typically 32400) */
  port: number;
  /** true for LAN connections */
  local: boolean;
  /** true for Plex relay connections (bandwidth limited) */
  relay: boolean;
  /** Measured latency in ms - null until tested */
  latencyMs: number | null;
}

// ============================================
// DOMAIN: Plex Library & Media
// ============================================

/**
 * Plex library section types
 */
export type PlexLibraryType = 'movie' | 'show' | 'artist' | 'photo';

/**
 * Plex media item types
 */
export type PlexMediaType = 'movie' | 'episode' | 'track' | 'clip';

/**
 * A library section in Plex (e.g., "Movies", "TV Shows")
 */
export interface PlexLibrary {
  /** Library section ID (numeric string) */
  id: string;
  /** Library UUID */
  uuid: string;
  /** Display title (e.g., "Movies", "TV Shows") */
  title: string;
  /** Library type */
  type: PlexLibraryType;
  /** Metadata agent used for this library */
  agent: string;
  /** Scanner used for this library */
  scanner: string;
  /** Number of items in library */
  contentCount: number;
  /** Last library scan time */
  lastScannedAt: Date;
  /** Background art URL path (requires token) */
  art: string | null;
  /** Thumbnail URL path (requires token) */
  thumb: string | null;
}

/**
 * A media item (movie, episode, etc.) from Plex.
 * Contains all metadata needed for display and playback.
 */
export interface PlexMediaItem {
  /** Unique item ID (ratingKey) - primary identifier */
  ratingKey: string;
  /** API path to item details */
  key: string;
  /** Item type */
  type: PlexMediaType;
  /** Display title */
  title: string;
  /** Original title (for foreign films) */
  originalTitle?: string;
  /** Sort title */
  sortTitle: string;
  /** Plot summary */
  summary: string;
  /** Release year */
  year: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** When item was added to library */
  addedAt: Date;
  /** Last metadata update time */
  updatedAt: Date;

  // Visual assets (URL paths - require token injection)
  /** Poster image path */
  thumb: string | null;
  /** Background art path */
  art: string | null;
  /** Banner image path (TV shows) */
  banner?: string | null;

  // Ratings
  /** Plex rating (0-10) */
  rating?: number;
  /** Audience rating (0-10) */
  audienceRating?: number;
  /** Content rating (e.g., "PG-13", "TV-MA") */
  contentRating?: string;

  // TV episode specific
  /** Show name (for episodes) */
  grandparentTitle?: string;
  /** Season name (for episodes) */
  parentTitle?: string;
  /** Season number (1-based) */
  seasonNumber?: number;
  /** Episode number (1-based) */
  episodeNumber?: number;

  // Playback state
  /** Resume position in ms (0 if not started) */
  viewOffset?: number;
  /** Number of times watched */
  viewCount?: number;
  /** Last watched time */
  lastViewedAt?: Date;

  // Media files for stream selection
  /** Available media files/versions */
  media: PlexMediaFile[];
}

/**
 * A specific media file/version for a Plex item.
 * Items may have multiple versions (4K, 1080p, etc.)
 */
export interface PlexMediaFile {
  /** Media file ID */
  id: string;
  /** Duration in ms */
  duration: number;
  /** Bitrate in kbps */
  bitrate: number;
  /** Video width in pixels */
  width: number;
  /** Video height in pixels */
  height: number;
  /** Aspect ratio (e.g., 1.78 for 16:9) */
  aspectRatio: number;
  /** Video codec (e.g., "h264", "hevc") */
  videoCodec: string;
  /** Audio codec (e.g., "aac", "ac3") */
  audioCodec: string;
  /** Audio channel count */
  audioChannels: number;
  /** Container format (e.g., "mkv", "mp4") */
  container: string;
  /** Resolution label (e.g., "1080", "4k") */
  videoResolution: string;
  /** File parts (for multi-part media) */
  parts: PlexMediaPart[];
}

/**
 * A part of a media file (most items have one part)
 */
export interface PlexMediaPart {
  /** Part ID */
  id: string;
  /** API path for streaming */
  key: string;
  /** Duration in ms */
  duration: number;
  /** Original filename */
  file: string;
  /** File size in bytes */
  size: number;
  /** Container format */
  container: string;
  /** Video profile */
  videoProfile?: string;
  /** Audio profile */
  audioProfile?: string;
  /** Available streams (video, audio, subtitle) */
  streams: PlexStream[];
}

/**
 * A stream within a media file (video, audio, or subtitle track)
 */
export interface PlexStream {
  /** Stream ID */
  id: string;
  /** Stream type: 1=video, 2=audio, 3=subtitle */
  streamType: 1 | 2 | 3;
  /** Codec name */
  codec: string;
  /** Language name (e.g., "English") */
  language?: string;
  /** ISO 639-1 language code (e.g., "en") */
  languageCode?: string;
  /** Track title/description */
  title?: string;
  /** Currently selected for playback */
  selected?: boolean;
  /** Default track */
  default?: boolean;
  /** Forced subtitles */
  forced?: boolean;

  // Video-specific
  /** Video width */
  width?: number;
  /** Video height */
  height?: number;
  /** Video bitrate in kbps */
  bitrate?: number;
  /** Frame rate */
  frameRate?: number;

  // Audio-specific
  /** Audio channels */
  channels?: number;
  /** Audio sampling rate */
  samplingRate?: number;

  // Subtitle-specific
  /** Subtitle format (srt, vtt, pgs, ass) */
  format?: string;
  /** URL to fetch subtitle file */
  key?: string;
}

/**
 * A Plex collection
 */
export interface PlexCollection {
  /** Collection ratingKey */
  ratingKey: string;
  /** Collection key/path */
  key: string;
  /** Collection title */
  title: string;
  /** Thumbnail path */
  thumb: string | null;
  /** Number of items in collection */
  childCount: number;
}

/**
 * A Plex playlist
 */
export interface PlexPlaylist {
  /** Playlist ratingKey */
  ratingKey: string;
  /** Playlist key/path */
  key: string;
  /** Playlist title */
  title: string;
  /** Thumbnail path */
  thumb: string | null;
  /** Total duration in ms */
  duration: number;
  /** Number of items */
  leafCount: number;
}

/**
 * A TV show season
 */
export interface PlexSeason {
  /** Season ratingKey */
  ratingKey: string;
  /** Season key/path */
  key: string;
  /** Season title (e.g., "Season 1") */
  title: string;
  /** Season number (1-based, 0 for specials) */
  index: number;
  /** Number of episodes */
  leafCount: number;
  /** Number of watched episodes */
  viewedLeafCount: number;
  /** Season thumbnail */
  thumb: string | null;
}

// ============================================
// DOMAIN: Plex Stream Resolution
// ============================================

/**
 * Request parameters for resolving a playback stream
 */
export interface StreamRequest {
  /** ratingKey of media item */
  itemKey: string;
  /** Specific part ID if multi-part */
  partId?: string;
  /** Resume position in ms */
  startOffsetMs?: number;
  /** Preferred audio track ID */
  audioStreamId?: string;
  /** Preferred subtitle track ID */
  subtitleStreamId?: string;
  /** Maximum bitrate in kbps */
  maxBitrate?: number;
  /** Prefer direct play (no transcoding) */
  directPlay?: boolean;
  /** Prefer direct stream (remux only) */
  directStream?: boolean;
}

/**
 * Resolved stream decision from Plex
 */
export interface StreamDecision {
  /** Final playback URL */
  playbackUrl: string;
  /** Stream protocol */
  protocol: 'hls' | 'dash' | 'http';
  /** true if playing original file directly */
  isDirectPlay: boolean;
  /** true if server is transcoding */
  isTranscoding: boolean;
  /** Container format */
  container: string;
  /** Video codec being delivered */
  videoCodec: string;
  /** Audio codec being delivered */
  audioCodec: string;
  /** How subtitles are delivered */
  subtitleDelivery: 'embed' | 'sidecar' | 'burn' | 'none';
  /** Plex session ID for tracking */
  sessionId: string;
  /** Selected audio stream */
  selectedAudioStream: PlexStream | null;
  /** Selected subtitle stream */
  selectedSubtitleStream: PlexStream | null;
  /** Output video width */
  width: number;
  /** Output video height */
  height: number;
  /** Output bitrate in kbps */
  bitrate: number;
}

/**
 * HLS stream options
 */
export interface HlsOptions {
  /** Maximum bitrate in kbps */
  maxBitrate?: number;
  /** Subtitle size (100 = normal) */
  subtitleSize?: number;
  /** Audio boost percentage */
  audioBoost?: number;
}

// ============================================
// DOMAIN: Plex API Errors
// ============================================

/**
 * Plex API error codes
 */
export type PlexErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'SERVER_UNREACHABLE'
  | 'SERVER_UNAUTHORIZED'
  | 'RESOURCE_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR'
  | 'UNKNOWN';

/**
 * Plex API error structure
 */
export interface PlexApiError {
  /** Error code for programmatic handling */
  code: PlexErrorCode;
  /** Human-readable error message */
  message: string;
  /** HTTP status code if applicable */
  httpStatus?: number;
  /** Whether this error can be retried */
  retryable: boolean;
}

// ============================================
// DOMAIN: Channel Configuration
// ============================================

/**
 * Playback mode for channel content
 */
export type PlaybackMode =
  | 'sequential'  // Play in defined order, loop
  | 'shuffle'     // Deterministic shuffle with seed, loop
  | 'random';     // True random (new order each time)

/**
 * Content filter operators
 */
export type FilterOperator =
  | 'eq' | 'neq'
  | 'gt' | 'gte'
  | 'lt' | 'lte'
  | 'contains' | 'notContains';

/**
 * Filterable content fields
 */
export type FilterField =
  | 'year'
  | 'rating'
  | 'contentRating'
  | 'genre'
  | 'duration'
  | 'watched'
  | 'addedAt';

/**
 * Sort order options
 */
export type SortOrder =
  | 'title_asc' | 'title_desc'
  | 'year_asc' | 'year_desc'
  | 'added_asc' | 'added_desc'
  | 'duration_asc' | 'duration_desc'
  | 'episode_order';

/**
 * Content filter specification
 */
export interface ContentFilter {
  /** Field to filter on */
  field: FilterField;
  /** Comparison operator */
  operator: FilterOperator;
  /** Value to compare against */
  value: string | number | boolean;
}

// --- Content Source Types ---

/**
 * Base interface for content sources
 */
export interface BaseContentSource {
  type: string;
}

/**
 * Content from an entire Plex library
 */
export interface LibraryContentSource extends BaseContentSource {
  type: 'library';
  /** Library section ID */
  libraryId: string;
  /** Library type */
  libraryType: PlexLibraryType;
  /** Include already-watched content */
  includeWatched: boolean;
}

/**
 * Content from a Plex collection
 */
export interface CollectionContentSource extends BaseContentSource {
  type: 'collection';
  /** Collection key */
  collectionKey: string;
  /** Cached collection name for display */
  collectionName: string;
}

/**
 * Content from a TV show (all or specific seasons)
 */
export interface ShowContentSource extends BaseContentSource {
  type: 'show';
  /** Show ratingKey */
  showKey: string;
  /** Cached show name for display */
  showName: string;
  /** Specific seasons to include (undefined = all) */
  seasonFilter?: number[];
}

/**
 * Content from a Plex playlist
 */
export interface PlaylistContentSource extends BaseContentSource {
  type: 'playlist';
  /** Playlist key */
  playlistKey: string;
  /** Cached playlist name for display */
  playlistName: string;
}

/**
 * Manually selected content items
 */
export interface ManualContentSource extends BaseContentSource {
  type: 'manual';
  /** Selected items with cached metadata */
  items: ManualContentItem[];
}

/**
 * A manually selected content item (minimal cached info)
 */
export interface ManualContentItem {
  /** Item ratingKey */
  ratingKey: string;
  /** Cached title for display */
  title: string;
  /** Cached duration in ms */
  durationMs: number;
}

/**
 * Mixed content from multiple sources
 */
export interface MixedContentSource extends BaseContentSource {
  type: 'mixed';
  /** Component sources */
  sources: ChannelContentSource[];
  /** How to combine sources */
  mixMode: 'interleave' | 'sequential';
}

/**
 * Union of all content source types
 */
export type ChannelContentSource =
  | LibraryContentSource
  | CollectionContentSource
  | ShowContentSource
  | PlaylistContentSource
  | ManualContentSource
  | MixedContentSource;

/**
 * Complete channel configuration - persisted to storage
 */
export interface ChannelConfig {
  /** Unique channel ID (UUID) */
  id: string;
  /** Display channel number (1-999) */
  number: number;
  /** User-defined channel name */
  name: string;
  /** Optional description */
  description?: string;
  /** Custom icon URL or built-in icon ID */
  icon?: string;
  /** Accent color for UI (hex string) */
  color?: string;

  // Content source definition
  /** Where content comes from */
  contentSource: ChannelContentSource;

  // Playback behavior
  /** How content is ordered */
  playbackMode: PlaybackMode;
  /** Seed for deterministic shuffle */
  shuffleSeed?: number;
  /** Unix timestamp (ms) - schedule reference point */
  startTimeAnchor: number;

  // Filtering & ordering
  /** Content filters to apply */
  contentFilters?: ContentFilter[];
  /** Content sort order */
  sortOrder?: SortOrder;

  // Playback options
  /** Skip intro markers if available */
  skipIntros: boolean;
  /** Skip credit markers if available */
  skipCredits: boolean;
  /** Maximum item duration (skip longer items) */
  maxEpisodeRunTimeMs?: number;
  /** Minimum item duration (skip shorter items) */
  minEpisodeRunTimeMs?: number;

  // Metadata (auto-updated)
  /** Channel creation timestamp */
  createdAt: number;
  /** Last modification timestamp */
  updatedAt: number;
  /** Last content resolution timestamp */
  lastContentRefresh: number;
  /** Cached item count */
  itemCount: number;
  /** Cached total duration in ms */
  totalDurationMs: number;
}

/**
 * Resolved content ready for scheduling
 */
export interface ResolvedChannelContent {
  /** Channel ID this content belongs to */
  channelId: string;
  /** When content was resolved */
  resolvedAt: number;
  /** All resolved items */
  items: ResolvedContentItem[];
  /** Total duration of all items */
  totalDurationMs: number;
  /** Items after shuffle/sort applied */
  orderedItems: ResolvedContentItem[];
}

/**
 * A resolved content item with cached metadata
 */
export interface ResolvedContentItem {
  /** Plex ratingKey */
  ratingKey: string;
  /** Item type */
  type: PlexMediaType;
  /** Display title */
  title: string;
  /** Full title (e.g., "Show - S01E05 - Episode Name") */
  fullTitle: string;
  /** Duration in ms */
  durationMs: number;
  /** Poster thumbnail URL (with token) */
  thumb: string | null;
  /** Release year */
  year: number;
  /** Season number for episodes */
  seasonNumber?: number;
  /** Episode number for episodes */
  episodeNumber?: number;
  /** Position in ordered list */
  scheduledIndex: number;
}

/**
 * Channel import result
 */
export interface ImportResult {
  /** Overall success */
  success: boolean;
  /** Number of channels imported */
  importedCount: number;
  /** Number of channels skipped (e.g., duplicates) */
  skippedCount: number;
  /** Error messages for failed imports */
  errors: string[];
}

// ============================================
// DOMAIN: Channel Scheduler
// ============================================

/**
 * Configuration for schedule generation
 */
export interface ScheduleConfig {
  /** Channel ID */
  channelId: string;
  /** Schedule anchor timestamp (ms) */
  anchorTime: number;
  /** Ordered content items */
  content: ResolvedContentItem[];
  /** Playback mode */
  playbackMode: PlaybackMode;
  /** Shuffle seed for deterministic ordering */
  shuffleSeed: number;
  /** Whether to loop (always true for linear channels) */
  loopSchedule: boolean;
}

/**
 * A program in the schedule with timing information
 */
export interface ScheduledProgram {
  /** The content item */
  item: ResolvedContentItem;
  /** Scheduled start time (Unix ms) */
  scheduledStartTime: number;
  /** Scheduled end time (Unix ms) */
  scheduledEndTime: number;
  /** Time elapsed since program started (ms) */
  elapsedMs: number;
  /** Time remaining in program (ms) */
  remainingMs: number;
  /** Position in current loop */
  scheduleIndex: number;
  /** Which iteration of the content loop */
  loopNumber: number;
  /** Stream info for playback (resolved on demand) */
  streamDescriptor: StreamDescriptor | null;
}

/**
 * A window of scheduled programs (for EPG display)
 */
export interface ScheduleWindow {
  /** Window start time (Unix ms) */
  startTime: number;
  /** Window end time (Unix ms) */
  endTime: number;
  /** Programs in this window */
  programs: ScheduledProgram[];
}

/**
 * Current scheduler state
 */
export interface SchedulerState {
  /** Active channel ID */
  channelId: string;
  /** Whether scheduler is active */
  isActive: boolean;
  /** Currently playing program */
  currentProgram: ScheduledProgram | null;
  /** Next program to play */
  nextProgram: ScheduledProgram | null;
  /** Current position in schedule */
  schedulePosition: {
    /** Current loop iteration */
    loopNumber: number;
    /** Current item index */
    itemIndex: number;
    /** Offset within current item (ms) */
    offsetMs: number;
  };
  /** Last sync with wall clock */
  lastSyncTime: number;
}

/**
 * Pre-computed schedule index for efficient lookups
 */
export interface ScheduleIndex {
  /** Channel ID */
  channelId: string;
  /** When index was generated */
  generatedAt: number;
  /** Total duration of one complete loop (ms) */
  totalLoopDurationMs: number;
  /** Cumulative start offsets for each item within a loop */
  itemStartOffsets: number[];
  /** Ordered items (after shuffle) */
  orderedItems: ResolvedContentItem[];
}

/**
 * Result of a shuffle operation
 */
export interface ShuffleResult {
  /** Shuffled indices */
  shuffledIndices: number[];
  /** Seed used */
  seed: number;
}

// ============================================
// DOMAIN: Video Player
// ============================================

/**
 * Video player configuration
 */
export interface VideoPlayerConfig {
  /** DOM container ID for video element */
  containerId: string;
  /** Default volume (0.0 - 1.0) */
  defaultVolume: number;
  /** Target buffer ahead time (ms) */
  bufferAheadMs: number;
  /** Default seek increment (seconds) */
  seekIncrementSec: number;
  /** Auto-hide controls timeout (ms) */
  hideControlsAfterMs: number;
  /** Number of retry attempts on error */
  retryAttempts: number;
  /** Delay between retries (ms) */
  retryDelayMs: number;
}

/**
 * Descriptor for a stream to be played
 */
export interface StreamDescriptor {
  /** Playback URL */
  url: string;
  /** Stream protocol */
  protocol: 'hls' | 'dash' | 'direct';
  /** MIME type for source element */
  mimeType: string;
  /** Start position (ms) */
  startPositionMs: number;
  /** Media metadata for display */
  mediaMetadata: MediaMetadata;
  /** Available subtitle tracks */
  subtitleTracks: SubtitleTrack[];
  /** Available audio tracks */
  audioTracks: AudioTrack[];
  /** Total duration (ms) */
  durationMs: number;
  /** Whether this is live content */
  isLive: boolean;
}

/**
 * Media metadata for display during playback
 */
export interface MediaMetadata {
  /** Primary title */
  title: string;
  /** Secondary title (episode name, etc.) */
  subtitle?: string;
  /** Artwork URL */
  artworkUrl?: string;
  /** Release year */
  year?: number;
  /** Content rating */
  rating?: string;
  /** Plex ratingKey for Plex API calls */
  plexRatingKey: string;
}

/**
 * Subtitle track info
 */
export interface SubtitleTrack {
  /** Track ID */
  id: string;
  /** Language name */
  language: string;
  /** ISO 639-1 language code */
  languageCode: string;
  /** Track URL */
  url: string;
  /** Subtitle format */
  format: 'srt' | 'vtt' | 'pgs' | 'ass';
  /** Is default track */
  isDefault: boolean;
  /** Is forced subtitles */
  isForced: boolean;
  /** Requires Plex burn-in (image-based subs) */
  requiresBurnIn: boolean;
}

/**
 * Audio track info
 */
export interface AudioTrack {
  /** Track ID */
  id: string;
  /** Language name */
  language: string;
  /** ISO 639-1 language code */
  languageCode: string;
  /** Audio codec */
  codec: string;
  /** Channel count */
  channels: number;
  /** Is default track */
  isDefault: boolean;
}

/**
 * Player status
 */
export type PlayerStatus =
  | 'idle'
  | 'loading'
  | 'buffering'
  | 'playing'
  | 'paused'
  | 'seeking'
  | 'ended'
  | 'error';

/**
 * Current playback state
 */
export interface PlaybackState {
  /** Current player status */
  status: PlayerStatus;
  /** Current position (ms) */
  currentTimeMs: number;
  /** Total duration (ms) */
  durationMs: number;
  /** Buffer level (0-100) */
  bufferPercent: number;
  /** Volume level (0.0-1.0) */
  volume: number;
  /** Mute state */
  isMuted: boolean;
  /** Playback rate (1.0 = normal) */
  playbackRate: number;
  /** Active subtitle track ID */
  activeSubtitleId: string | null;
  /** Active audio track ID */
  activeAudioId: string | null;
  /** Current error if any */
  errorInfo: PlaybackError | null;
}

/**
 * Playback error codes
 */
export type PlaybackErrorCode =
  | 'NETWORK_ERROR'
  | 'DECODE_ERROR'
  | 'FORMAT_UNSUPPORTED'
  | 'DRM_ERROR'
  | 'SOURCE_NOT_FOUND'
  | 'UNKNOWN';

/**
 * Playback error info
 */
export interface PlaybackError {
  /** Error code */
  code: PlaybackErrorCode;
  /** Human-readable message */
  message: string;
  /** Whether recovery might succeed */
  recoverable: boolean;
  /** Number of retry attempts made */
  retryCount: number;
}

/**
 * A buffered time range
 */
export interface TimeRange {
  /** Range start (ms) */
  startMs: number;
  /** Range end (ms) */
  endMs: number;
}

// ============================================
// DOMAIN: Navigation & Remote Control
// ============================================

/**
 * Remote control button identifiers
 */
export type RemoteButton =
  | 'ok' | 'back'
  | 'up' | 'down' | 'left' | 'right'
  | 'play' | 'pause' | 'stop'
  | 'rewind' | 'fastforward'
  | 'channelUp' | 'channelDown'
  | 'red' | 'green' | 'yellow' | 'blue'
  | 'num0' | 'num1' | 'num2' | 'num3' | 'num4'
  | 'num5' | 'num6' | 'num7' | 'num8' | 'num9'
  | 'info' | 'guide';

/**
 * Processed key event
 */
export interface KeyEvent {
  /** Mapped button */
  button: RemoteButton;
  /** Is this a repeat event */
  isRepeat: boolean;
  /** Is this a long press */
  isLongPress: boolean;
  /** Event timestamp */
  timestamp: number;
  /** Original DOM event */
  originalEvent: KeyboardEvent;
}

/**
 * Application screens
 */
export type Screen =
  | 'splash'
  | 'auth'
  | 'server-select'
  | 'home'
  | 'player'
  | 'guide'
  | 'channel-edit'
  | 'settings'
  | 'error';

/**
 * Navigation manager configuration
 */
export interface NavigationConfig {
  /** Enable Magic Remote pointer mode */
  enablePointerMode: boolean;
  /** Key repeat initial delay (ms) */
  keyRepeatDelayMs: number;
  /** Key repeat interval (ms) */
  keyRepeatIntervalMs: number;
  /** Remember focus per screen */
  focusMemoryEnabled: boolean;
  /** Log key events to console */
  debugMode: boolean;
}

/**
 * Current navigation state
 */
export interface NavigationState {
  /** Active screen */
  currentScreen: Screen;
  /** Screen history for back navigation */
  screenStack: Screen[];
  /** Currently focused element ID */
  focusedElementId: string | null;
  /** Stack of open modals */
  modalStack: string[];
  /** Is Magic Remote pointer active */
  isPointerActive: boolean;
}

/**
 * A focusable UI element
 */
export interface FocusableElement {
  /** Unique element ID */
  id: string;
  /** DOM element reference */
  element: HTMLElement;
  /** Focus group membership */
  group?: string;
  /** Explicit neighbor mappings */
  neighbors: {
    up?: string;
    down?: string;
    left?: string;
    right?: string;
  };
  /** Called when element receives focus */
  onFocus?: () => void;
  /** Called when element loses focus */
  onBlur?: () => void;
  /** Called when element is selected (OK pressed) */
  onSelect?: () => void;
}

/**
 * A group of focusable elements
 */
export interface FocusGroup {
  /** Group ID */
  id: string;
  /** Member element IDs */
  elements: string[];
  /** Wrap around at edges */
  wrapAround: boolean;
  /** Layout orientation */
  orientation: 'horizontal' | 'vertical' | 'grid';
  /** Column count for grid layout */
  columns?: number;
}

// ============================================
// DOMAIN: EPG (Electronic Program Guide)
// ============================================

/**
 * EPG component configuration
 */
export interface EPGConfig {
  /** DOM container ID */
  containerId: string;
  /** Number of visible channel rows */
  visibleChannels: number;
  /** Grid time slot granularity (minutes) */
  timeSlotMinutes: number;
  /** Hours visible at once */
  visibleHours: number;
  /** Total hours in schedule (typically 24) */
  totalHours: number;
  /** Pixels per minute (width scaling) */
  pixelsPerMinute: number;
  /** Pixels per channel row */
  rowHeight: number;
  /** Show current time indicator */
  showCurrentTimeIndicator: boolean;
  /** Auto-scroll to current time on open */
  autoScrollToNow: boolean;
}

/**
 * EPG component state
 */
export interface EPGState {
  /** Is EPG visible */
  isVisible: boolean;
  /** Currently focused cell */
  focusedCell: EPGFocusPosition | null;
  /** Scroll position */
  scrollPosition: {
    /** First visible channel index */
    channelOffset: number;
    /** Minutes from schedule start */
    timeOffset: number;
  };
  /** Visible window bounds */
  viewWindow: {
    startTime: number;
    endTime: number;
    startChannelIndex: number;
    endChannelIndex: number;
  };
  /** Current wall-clock time */
  currentTime: number;
}

/**
 * EPG focus position
 */
export interface EPGFocusPosition {
  /** Channel row index */
  channelIndex: number;
  /** Program index within channel */
  programIndex: number;
  /** The focused program */
  program: ScheduledProgram;
  /** DOM element reference */
  cellElement: HTMLElement | null;
}

/**
 * EPG channel row data
 */
export interface EPGChannelRow {
  /** Channel config */
  channel: ChannelConfig;
  /** Programs to display */
  programs: EPGProgramCell[];
}

/**
 * EPG program cell data
 */
export interface EPGProgramCell {
  /** The scheduled program */
  program: ScheduledProgram;
  /** Left position in pixels */
  left: number;
  /** Cell width in pixels */
  width: number;
  /** Extends beyond visible area */
  isPartial: boolean;
  /** Currently airing */
  isCurrent: boolean;
  /** Has focus */
  isFocused: boolean;
}

/**
 * Virtualized grid state for EPG
 */
export interface VirtualizedGridState {
  /** Currently rendered channel indices */
  visibleRows: number[];
  /** Visible time window */
  visibleTimeRange: { start: number; end: number };
  /** Recycled DOM elements */
  recycledElements: Map<string, HTMLElement>;
}

// ============================================
// DOMAIN: Application Lifecycle
// ============================================

/**
 * Application phase
 */
export type AppPhase =
  | 'initializing'
  | 'authenticating'
  | 'loading_data'
  | 'ready'
  | 'backgrounded'
  | 'resuming'
  | 'error'
  | 'terminating';

/**
 * Connection status
 */
export type ConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'unreachable';

/**
 * Application error types
 */
export type AppErrorType =
  | 'INITIALIZATION_FAILED'
  | 'AUTH_EXPIRED'
  | 'NETWORK_UNAVAILABLE'
  | 'PLEX_UNREACHABLE'
  | 'DATA_CORRUPTION'
  | 'PLAYBACK_FAILED'
  | 'OUT_OF_MEMORY'
  | 'UNKNOWN';

/**
 * Application error with recovery options
 */
export interface AppError {
  /** Error type */
  type: AppErrorType;
  /** Technical error message */
  message: string;
  /** When error occurred */
  timestamp: number;
  /** Additional context */
  context?: Record<string, unknown>;
  /** User-facing message */
  userMessage: string;
  /** Available recovery actions */
  actions: ErrorAction[];
}

/**
 * An error recovery action
 */
export interface ErrorAction {
  /** Button label */
  label: string;
  /** Action handler */
  action: () => void | Promise<void>;
  /** Is this the primary/recommended action */
  isPrimary: boolean;
}

/**
 * Application lifecycle state
 */
export interface AppLifecycleState {
  /** Current phase */
  phase: AppPhase;
  /** App visibility */
  isVisible: boolean;
  /** Network availability */
  isNetworkAvailable: boolean;
  /** Last active timestamp */
  lastActiveTime: number;
  /** Plex connection status */
  plexConnectionStatus: ConnectionStatus;
  /** Current error if any */
  currentError: AppError | null;
}

/**
 * Persistent state saved to localStorage
 */
export interface PersistentState {
  /** State schema version for migrations */
  version: number;
  /** Plex authentication data */
  plexAuth: PlexAuthData | null;
  /** Channel configurations */
  channelConfigs: ChannelConfig[];
  /** Last viewed channel index */
  currentChannelIndex: number;
  /** User preferences */
  userPreferences: UserPreferences;
  /** Last save timestamp */
  lastUpdated: number;
}

/**
 * User preferences
 */
export interface UserPreferences {
  /** Default schedule start hour (0-23) */
  defaultStartTime: number;
  /** Default shuffle mode for new channels */
  shuffleDefault: boolean;
  /** Show clock overlay on player */
  showClockOverlay: boolean;
  /** Auto-hide info overlay after (ms) */
  autoHideInfoMs: number;
  /** Preferred subtitle language code */
  preferredSubtitleLanguage: string;
  /** Preferred audio language code */
  preferredAudioLanguage: string;
}

// ============================================
// DOMAIN: Application Orchestrator
// ============================================

/**
 * Module health status
 */
export interface ModuleStatus {
  /** Module name */
  name: string;
  /** Whether module is initialized */
  initialized: boolean;
  /** Whether module is healthy */
  healthy: boolean;
  /** Last error message if unhealthy */
  lastError?: string;
}

// ============================================
// EVENT MAPS (for typed event emitters)
// ============================================

/**
 * Plex API events
 */
export interface PlexApiEventMap {
  authChange: boolean;
  serverChange: PlexServer | null;
  connectionChange: string | null;
  error: PlexApiError;
}

/**
 * Channel manager events
 */
export interface ChannelManagerEventMap {
  channelCreated: ChannelConfig;
  channelUpdated: ChannelConfig;
  channelDeleted: string;
  channelSwitch: { channel: ChannelConfig; index: number };
  contentResolved: ResolvedChannelContent;
}

/**
 * Scheduler events
 */
export interface SchedulerEventMap {
  programStart: ScheduledProgram;
  programEnd: ScheduledProgram;
  scheduleSync: SchedulerState;
}

/**
 * Video player events
 */
export interface PlayerEventMap {
  stateChange: PlaybackState;
  timeUpdate: { currentTimeMs: number; durationMs: number };
  bufferUpdate: { percent: number; bufferedRanges: TimeRange[] };
  trackChange: { type: 'audio' | 'subtitle'; trackId: string | null };
  ended: void;
  error: PlaybackError;
  mediaLoaded: { durationMs: number; tracks: { audio: AudioTrack[]; subtitle: SubtitleTrack[] } };
}

/**
 * Navigation events
 */
export interface NavigationEventMap {
  keyPress: KeyEvent;
  screenChange: { from: Screen; to: Screen };
  focusChange: { from: string | null; to: string };
  modalOpen: { modalId: string };
  modalClose: { modalId: string };
  pointerModeChange: { active: boolean };
}

/**
 * EPG events
 */
export interface EPGEventMap {
  open: void;
  close: void;
  focusChange: EPGFocusPosition;
  channelSelected: { channel: ChannelConfig; program: ScheduledProgram };
  programSelected: ScheduledProgram;
  timeScroll: { direction: 'left' | 'right'; newOffset: number };
  channelScroll: { direction: 'up' | 'down'; newOffset: number };
}

/**
 * Lifecycle events
 */
export interface LifecycleEventMap {
  phaseChange: { from: AppPhase; to: AppPhase };
  visibilityChange: { isVisible: boolean };
  networkChange: { isAvailable: boolean };
  plexConnectionChange: { status: ConnectionStatus };
  error: AppError;
  stateRestored: PersistentState;
  beforeTerminate: void;
}

// ============================================
// LIBRARY QUERY OPTIONS
// ============================================

/**
 * Options for querying Plex library content
 */
export interface LibraryQueryOptions {
  /** Sort order (e.g., "titleSort:asc", "addedAt:desc") */
  sort?: string;
  /** Filters to apply */
  filter?: Record<string, string | number>;
  /** Pagination offset */
  offset?: number;
  /** Maximum results */
  limit?: number;
  /** Include collections in results */
  includeCollections?: boolean;
}

/**
 * Options for Plex search
 */
export interface SearchOptions {
  /** Types to search for */
  types?: PlexMediaType[];
  /** Limit to specific library */
  libraryId?: string;
  /** Maximum results */
  limit?: number;
}
