/**
 * @module SharedTypes
 * @description Central type definitions for Retune - webOS Plex Virtual Channels Application
 * @version 1.0.0
 * @platform webOS 6.0+ (Chromium 87)
 */

// ============================================
// UTILITY TYPES
// ============================================

/**
 * Result type for operations that can fail.
 * 
 * **Usage Policy (MINOR-003 Clarification)**:
 * - **Use Result<T,E>** for expected failure modes (network errors, validation failures,
 *   resource not found) where the caller is expected to handle the error explicitly.
 * - **Throw exceptions** only for programming errors (invalid arguments, illegal state)
 *   that indicate bugs rather than expected operational failures.
 * - **Module public interfaces** should prefer Result<T,E> for async operations.
 * - **Internal helpers** may throw for simplicity if the caller wraps in try/catch.
 * 
 * @example
 * ```typescript
 * // Good: Expected failure, use Result
 * async function fetchUser(id: string): Promise<Result<User, AppError>> { ... }
 * 
 * // Good: Programming error, throw
 * function parseConfig(json: string): Config {
 *   if (!json) throw new Error('Config JSON is required');
 *   ...
 * }
 * ```
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
 * Type-safe event emitter interface with error isolation.
 * One handler's error does not prevent other handlers from executing.
 * 
 * @template TEventMap - A record type mapping event names to payload types
 * 
 * @see spec-pack/modules/event-emitter.md for reference implementation
 */
export interface IEventEmitter<TEventMap extends Record<string, unknown>> {
  /**
   * Register an event handler
   * @returns A disposable to remove the handler
   */
  on<K extends keyof TEventMap>(
    event: K,
    handler: (payload: TEventMap[K]) => void
  ): IDisposable;

  /**
   * Unregister an event handler
   */
  off<K extends keyof TEventMap>(
    event: K,
    handler: (payload: TEventMap[K]) => void
  ): void;

  /**
   * Register a one-time event handler
   * @returns A disposable to remove the handler before it fires
   */
  once<K extends keyof TEventMap>(
    event: K,
    handler: (payload: TEventMap[K]) => void
  ): IDisposable;

  /**
   * Emit an event to all registered handlers.
   * Errors in handlers are caught and logged, NOT propagated.
   */
  emit<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): void;

  /**
   * Remove all handlers for a specific event or all events
   */
  removeAllListeners(event?: keyof TEventMap): void;

  /**
   * Get the count of handlers for an event
   */
  listenerCount(event: keyof TEventMap): number;
}

// ============================================
// UNIFIED ERROR CODES (SUGGEST-004)
// ============================================

/**
 * Unified error codes for consistent error handling across all modules.
 * Use these codes in error objects to enable centralized error handling.
 * 
 * @example
 * ```typescript
 * const error: AppError = {
 *   code: AppErrorCode.NETWORK_TIMEOUT,
 *   message: 'Request timed out',
 *   recoverable: true
 * };
 * return { success: false, error };
 * 
 * // In error handler:
 * if (error.code === AppErrorCode.AUTH_EXPIRED) {
 *   navigation.goTo('auth');
 * }
 * ```
 */
export enum AppErrorCode {
  // Authentication Errors (1xx)
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  AUTH_EXPIRED = 'AUTH_EXPIRED',
  AUTH_INVALID = 'AUTH_INVALID',
  AUTH_FAILED = 'AUTH_FAILED',
  AUTH_RATE_LIMITED = 'AUTH_RATE_LIMITED',

  // Network Errors (2xx)  
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  NETWORK_OFFLINE = 'NETWORK_OFFLINE',
  SERVER_UNREACHABLE = 'SERVER_UNREACHABLE',
  SERVER_SSL_ERROR = 'SERVER_SSL_ERROR',
  MIXED_CONTENT_BLOCKED = 'MIXED_CONTENT_BLOCKED',

  // Playback Errors (3xx)
  PLAYBACK_DECODE_ERROR = 'PLAYBACK_DECODE_ERROR',
  PLAYBACK_FORMAT_UNSUPPORTED = 'PLAYBACK_FORMAT_UNSUPPORTED',
  PLAYBACK_DRM_ERROR = 'PLAYBACK_DRM_ERROR',
  PLAYBACK_SOURCE_NOT_FOUND = 'PLAYBACK_SOURCE_NOT_FOUND',
  TRANSCODE_FAILED = 'TRANSCODE_FAILED',

  // Content Errors (4xx)
  SCHEDULER_EMPTY_CHANNEL = 'SCHEDULER_EMPTY_CHANNEL',
  SCHEDULER_INVALID_TIME = 'SCHEDULER_INVALID_TIME',
  CONTENT_UNAVAILABLE = 'CONTENT_UNAVAILABLE',
  LIBRARY_UNAVAILABLE = 'LIBRARY_UNAVAILABLE',

  // Storage Errors (5xx)
  STORAGE_QUOTA_EXCEEDED = 'STORAGE_QUOTA_EXCEEDED',
  STORAGE_CORRUPTED = 'STORAGE_CORRUPTED',

  // UI Errors (6xx)
  UI_RENDER_ERROR = 'UI_RENDER_ERROR',
  UI_NAVIGATION_BLOCKED = 'UI_NAVIGATION_BLOCKED',

  // System / Lifecycle / Module Errors (7xx)
  INITIALIZATION_FAILED = 'INITIALIZATION_FAILED',
  PLEX_UNREACHABLE = 'PLEX_UNREACHABLE',
  DATA_CORRUPTION = 'DATA_CORRUPTION',
  PLAYBACK_FAILED = 'PLAYBACK_FAILED',
  OUT_OF_MEMORY = 'OUT_OF_MEMORY',
  MODULE_INIT_FAILED = 'MODULE_INIT_FAILED',
  MODULE_CRASH = 'MODULE_CRASH',
  UNRECOVERABLE = 'UNRECOVERABLE',

  // Additional Network/API Errors (8xx) - Canonicalized from v2 review
  NETWORK_UNAVAILABLE = 'NETWORK_UNAVAILABLE',
  PARSE_ERROR = 'PARSE_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
  SERVER_UNAUTHORIZED = 'SERVER_UNAUTHORIZED',
  RATE_LIMITED = 'RATE_LIMITED',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  EMPTY_RESPONSE = 'EMPTY_RESPONSE',

  // Playback/Stream Errors (9xx) - Canonicalized from v2 review
  CODEC_UNSUPPORTED = 'CODEC_UNSUPPORTED',
  TRACK_NOT_FOUND = 'TRACK_NOT_FOUND',
  TRACK_SWITCH_FAILED = 'TRACK_SWITCH_FAILED',
  TRACK_SWITCH_TIMEOUT = 'TRACK_SWITCH_TIMEOUT',
  RENDER_ERROR = 'RENDER_ERROR',

  // Channel/Content Errors (10xx) - Canonicalized from v2 review
  CHANNEL_NOT_FOUND = 'CHANNEL_NOT_FOUND',
  EMPTY_CHANNEL = 'EMPTY_CHANNEL',
  ITEM_NOT_FOUND = 'ITEM_NOT_FOUND',

  // Navigation/UI Errors (11xx) - Canonicalized from v2 review
  NAV_BOUNDARY = 'NAV_BOUNDARY',
  SCROLL_TIMEOUT = 'SCROLL_TIMEOUT',
  POOL_EXHAUSTED = 'POOL_EXHAUSTED',

  // Generic
  UNKNOWN = 'UNKNOWN',
}

/**
 * Base application error structure (types-only).
 * Use this interface for error objects across all modules.
 * 
 * @example
 * ```typescript
 * const error: AppError = {
 *   code: AppErrorCode.NETWORK_TIMEOUT,
 *   message: 'Request timed out after 5000ms',
 *   recoverable: true,
 *   context: { endpoint: '/api/v2/resources' }
 * };
 * ```
 */
export interface AppError {
  /** Error code from canonical taxonomy */
  code: AppErrorCode;
  /** Technical error message */
  message: string;
  /** Whether recovery might succeed */
  recoverable: boolean;
  /** Additional context for debugging */
  context?: Record<string, unknown>;
}

// ============================================
// MIME TYPE CONSTANTS
// ============================================

/**
 * MIME types for stream protocols.
 * Use when creating video source elements.
 * 
 * NOTE: The getMimeType() helper function should be implemented
 * in the plex-stream-resolver module, not in shared types.
 */
export type StreamProtocol = 'hls' | 'dash' | 'direct' | 'http';

/**
 * MIME type mapping for reference (implementation in plex-stream-resolver)
 * - hls: 'application/x-mpegURL'
 * - dash: 'application/dash+xml'
 * - direct/http: 'video/mp4'
 */

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
export type PlexAuthMode = 'legacy' | 'jwt';

/**
 * Public JWK used for JWT-based Plex auth (Ed25519).
 * NOTE: This is only required for the JWT flow; legacy PIN auth does not use JWK.
 */
export interface PlexPublicJwk {
  kty: 'OKP';
  crv: 'Ed25519';
  x: string;
  alg: 'EdDSA';
  use?: 'sig';
  kid?: string;
}

/**
 * Device key metadata for JWT-based auth.
 * Private key material should be persisted securely when available.
 */
export interface PlexDeviceKey {
  kid: string;
  publicJwk: PlexPublicJwk;
  /** Base64url-encoded Ed25519 private key (store securely when possible) */
  privateKey: string;
  createdAt: Date;
}

export interface PlexAuthConfig {
  /** Unique app instance ID (UUID v4) - persisted across sessions */
  clientIdentifier: string;
  /** App name shown in Plex dashboard (e.g., "Retune") */
  product: string;
  /** App version string (e.g., "1.0.0") */
  version: string;
  /** Platform identifier - always "webOS" */
  platform: string;
  /** webOS version (e.g., "6.0", "23") */
  platformVersion: string;
  /** Device type (e.g., "LG Smart TV") */
  device: string;
  /** User-friendly device name (e.g., "Living Room TV") */
  deviceName: string;
  /** Auth flow selection (default: legacy PIN) */
  authMode?: PlexAuthMode;
}

/**
 * Represents a PIN request for OAuth flow.
 * User navigates to the Plex auth app (plex.tv/link or app.plex.tv/auth).
 */
export interface PlexPinRequest {
  /** Plex-assigned PIN ID for polling */
  id: number;
  /** PIN code for user to enter (length varies by flow) */
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
  /**
   * Token expiration time (if known).
   * Plex tokens may be short-lived (e.g., JWTs); treat `null` as "unknown" and revalidate on startup.
   */
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
  /** Device key metadata for JWT flow (optional) */
  deviceKey?: PlexDeviceKey | null;
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

/**
 * Stream resolver error structure
 * Uses canonical AppErrorCode for BLOCK-001 compliance
 */
export interface StreamResolverError {
  code: AppErrorCode;
  message: string;
  recoverable: boolean;
  retryAfterMs?: number;
}

// ============================================
// DOMAIN: Plex API Errors
// ============================================

/**
 * Plex API error structure
 */
export interface PlexApiError {
  /** Error code for programmatic handling */
  code: AppErrorCode;
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
  /** Whether this program is currently playing (computed: now >= start && now < end) */
  isCurrent: boolean;
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
 * Playback error info
 */
export interface PlaybackError {
  /** Error code */
  code: AppErrorCode;
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
 * Extended application error for lifecycle/UI surfaces.
 *
 * Best practice: keep a single canonical taxonomy (`AppErrorCode`) and
 * add UI-specific fields here rather than introducing a second taxonomy.
 */
export interface LifecycleAppError {
  /** Canonical error code */
  code: AppErrorCode;
  /** Technical error message */
  message: string;
  /** Whether recovery might succeed */
  recoverable: boolean;
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
  currentError: LifecycleAppError | null;
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
  id: string;
  name: string;
  status: 'pending' | 'initializing' | 'ready' | 'error' | 'disabled';
  loadTimeMs?: number;
  error?: AppError;
  memoryUsageMB?: number;
}

/**
 * Orchestrator configuration (module configs passed at initialization)
 */
export interface OrchestratorConfig {
  plexConfig: PlexAuthConfig;
  playerConfig: VideoPlayerConfig;
  navConfig: NavigationConfig;
  epgConfig: EPGConfig;
}

/**
 * Recovery action definition for error handling UI
 */
export interface ErrorRecoveryAction {
  label: string;
  action: () => void;
  isPrimary: boolean;
  requiresNetwork: boolean;
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
  error: LifecycleAppError;
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

// ============================================
// MODULE PUBLIC INTERFACES (Centralized Contracts)
// ============================================

/**
 * Plex Authentication Interface
 * Handles OAuth flow and token management
 */
export interface IPlexAuth {
  /** Initiate PIN-based OAuth flow */
  requestPin(): Promise<PlexPinRequest>;
  /** Check if PIN has been claimed */
  checkPinStatus(pinId: number): Promise<PlexPinRequest>;
  /** Cancel pending PIN request */
  cancelPin(pinId: number): Promise<void>;
  /** Validate an auth token */
  validateToken(token: string): Promise<boolean>;
  /** Get stored credentials from localStorage */
  getStoredCredentials(): Promise<PlexAuthData | null>;
  /** Store credentials to localStorage */
  storeCredentials(auth: PlexAuthData): Promise<void>;
  /** Clear all stored credentials */
  clearCredentials(): Promise<void>;
  /** Check if user is authenticated */
  isAuthenticated(): boolean;
  /** Get current user profile */
  getCurrentUser(): PlexAuthToken | null;
  /** Get headers required for Plex API requests */
  getAuthHeaders(): Record<string, string>;
}

/**
 * Plex Server Discovery Interface
 * Manages server discovery, connection testing, and selection
 */
export interface IPlexServerDiscovery {
  // Discovery
  discoverServers(): Promise<PlexServer[]>;
  refreshServers(): Promise<PlexServer[]>;

  // Connection Testing
  testConnection(server: PlexServer, connection: PlexConnection): Promise<number | null>;
  findFastestConnection(server: PlexServer): Promise<PlexConnection | null>;

  // Server Selection
  selectServer(serverId: string): Promise<boolean>;
  getSelectedServer(): PlexServer | null;
  getSelectedConnection(): PlexConnection | null;
  getServerUri(): string | null;

  // Mixed Content Fallback (used by plex-stream-resolver)
  /** Get an HTTPS connection for the selected server, if available */
  getHttpsConnection(): PlexConnection | null;
  /** Get a relay connection for the selected server, if available */
  getRelayConnection(): PlexConnection | null;
  /** Get the active connection URI (alias for getServerUri for compatibility) */
  getActiveConnectionUri(): string | null;

  // State
  getServers(): PlexServer[];
  isConnected(): boolean;

  // Events
  on(event: 'serverChange', handler: (server: PlexServer | null) => void): void;
  on(event: 'connectionChange', handler: (uri: string | null) => void): void;
}

/**
 * Plex Library Interface
 * Provides access to Plex media libraries and content
 */
export interface IPlexLibrary {
  /** Get all libraries */
  getLibraries(): Promise<PlexLibrary[]>;
  /** Get a specific library */
  getLibrary(libraryId: string): Promise<PlexLibrary | null>;
  /** Get items from a library with optional filtering */
  getLibraryItems(libraryId: string, options?: LibraryQueryOptions): Promise<PlexMediaItem[]>;
  /** Get a specific media item */
  getItem(ratingKey: string): Promise<PlexMediaItem | null>;
  /** Get TV shows within a library */
  getShows(libraryId: string): Promise<PlexMediaItem[]>;
  /** Get seasons for a show */
  getShowSeasons(showKey: string): Promise<PlexSeason[]>;
  /** Get episodes for a season */
  getSeasonEpisodes(seasonKey: string): Promise<PlexMediaItem[]>;
  /** Get all episodes for a show (flattened) */
  getShowEpisodes(showKey: string): Promise<PlexMediaItem[]>;
  /** Search for content */
  search(query: string, options?: SearchOptions): Promise<PlexMediaItem[]>;
  /** Get collections in a library */
  getCollections(libraryId: string): Promise<PlexCollection[]>;
  /** Get items in a collection */
  getCollectionItems(collectionKey: string): Promise<PlexMediaItem[]>;
  /** Get user playlists */
  getPlaylists(): Promise<PlexPlaylist[]>;
  /** Get items in a playlist */
  getPlaylistItems(playlistKey: string): Promise<PlexMediaItem[]>;
  /** Generate image URL with auth token */
  getImageUrl(imagePath: string, width?: number, height?: number): string;
  /** Refresh cached library data */
  refreshLibrary(libraryId: string): Promise<void>;
}

/**
 * Plex Stream Resolver Interface
 * Resolves media items to playable stream URLs
 */
export interface IPlexStreamResolver {
  // Stream Resolution
  resolveStream(request: StreamRequest): Promise<StreamDecision>;

  // Session Management
  startSession(itemKey: string): Promise<string>;
  updateProgress(
    sessionId: string,
    itemKey: string,
    positionMs: number,
    state: 'playing' | 'paused' | 'stopped'
  ): Promise<void>;
  endSession(sessionId: string, itemKey: string): Promise<void>;

  // Direct Play Check
  canDirectPlay(item: PlexMediaItem): boolean;

  // Transcode Options
  getTranscodeUrl(itemKey: string, options: HlsOptions): string;

  // Events
  on(event: 'sessionStart', handler: (session: { sessionId: string; itemKey: string }) => void): void;
  on(
    event: 'sessionEnd',
    handler: (session: { sessionId: string; itemKey: string; positionMs: number }) => void
  ): void;
  on(event: 'error', handler: (error: StreamResolverError) => void): void;
}

/**
 * Channel Manager Interface
 * Manages virtual TV channel CRUD operations
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

  // Ordering / Current Channel
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

/**
 * Channel Scheduler Interface
 * Provides deterministic schedule generation for channels
 */
export interface IChannelScheduler {
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

  // Sync Timer Control (Lifecycle)
  pauseSyncTimer(): void;
  resumeSyncTimer(): void;

  // Playback Sync
  syncToCurrentTime(): void;
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

/**
 * Deterministic Shuffle Generator
 */
export interface IShuffleGenerator {
  shuffle<T>(items: T[], seed: number): T[];
  shuffleIndices(count: number, seed: number): number[];
  generateSeed(channelId: string, anchorTime: number): number;
}

/**
 * Video Player Interface
 * Wraps HTML5 video element for webOS
 */
export interface IVideoPlayer {
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
  seekRelative(deltaMs: number): Promise<void>;

  // Volume
  setVolume(level: number): void;
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
  on<K extends keyof PlayerEventMap>(event: K, handler: (payload: PlayerEventMap[K]) => void): void;
  off<K extends keyof PlayerEventMap>(event: K, handler: (payload: PlayerEventMap[K]) => void): void;

  // webOS Specific
  requestMediaSession(): void;
  releaseMediaSession(): void;
}

/**
 * EPG Component Interface
 * Electronic Program Guide UI component
 */
export interface IEPGComponent {
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
  loadScheduleForChannel(channelId: string, schedule: ScheduleWindow): void;
  refreshCurrentTime(): void;

  // Navigation
  focusChannel(channelIndex: number): void;
  focusProgram(channelIndex: number, programIndex: number): void;
  focusNow(): void;
  scrollToTime(time: number): void;
  scrollToChannel(channelIndex: number): void;

  // Input Handling
  handleNavigation(direction: 'up' | 'down' | 'left' | 'right'): boolean;
  handleSelect(): boolean;
  handleBack(): boolean;

  // State
  getState(): EPGState;
  getFocusedProgram(): ScheduledProgram | null;

  // Events
  on<K extends keyof EPGEventMap>(event: K, handler: (payload: EPGEventMap[K]) => void): void;
  off<K extends keyof EPGEventMap>(event: K, handler: (payload: EPGEventMap[K]) => void): void;
}

/**
 * EPG Info Panel Interface
 * Program details overlay
 */
export interface IEPGInfoPanel {
  show(program: ScheduledProgram): void;
  hide(): void;
  update(program: ScheduledProgram): void;
}

/**
 * Navigation Manager Interface
 * Handles remote control input and focus management
 */
export interface INavigationManager {
  // Initialization
  initialize(config: NavigationConfig): void;
  destroy(): void;

  // Screen Navigation
  goTo(screen: Screen, params?: Record<string, unknown>): void;
  goBack(): boolean;
  replaceScreen(screen: Screen): void;
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
  closeModal(modalId?: string): void;
  isModalOpen(modalId?: string): boolean;

  // Input Blocking
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

  // Long-press handling
  handleLongPress(button: RemoteButton, callback: () => void): void;
  cancelLongPress(): void;
}

/**
 * Focus Manager Interface (internal)
 */
export interface IFocusManager {
  focus(elementId: string): boolean;
  blur(): void;
  findNeighbor(fromId: string, direction: 'up' | 'down' | 'left' | 'right'): string | null;
  saveFocusState(screenId: string): void;
  restoreFocusState(screenId: string): boolean;
  updateFocusRing(elementId: string): void;
  hideFocusRing(): void;
}

/**
 * App Lifecycle Interface
 * Manages application lifecycle and state persistence
 */
export interface IAppLifecycle {
  // Initialization
  initialize(): Promise<void>;
  shutdown(): Promise<void>;

  // State Persistence
  saveState(): Promise<void>;
  restoreState(): Promise<PersistentState | null>;
  clearState(): Promise<void>;

  // Lifecycle Callbacks
  onPause(callback: () => void | Promise<void>): void;
  onResume(callback: () => void | Promise<void>): void;
  onTerminate(callback: () => void | Promise<void>): void;

  // Network
  isNetworkAvailable(): boolean;
  checkNetworkStatus(): Promise<boolean>;

  // Memory
  getMemoryUsage(): { used: number; limit: number; percentage: number };
  performMemoryCleanup(): void;

  // State
  getPhase(): AppPhase;
  getState(): AppLifecycleState;
  setPhase(phase: AppPhase): void;

  // Error Handling
  reportError(error: AppError): void;
  getLastError(): AppError | null;

  // Events
  on<K extends keyof LifecycleEventMap>(
    event: K,
    handler: (payload: LifecycleEventMap[K]) => void
  ): void;
}

/**
 * Error Recovery Interface
 */
export interface IErrorRecovery {
  handleError(error: AppError): ErrorAction[];
  executeRecovery(action: ErrorAction): Promise<boolean>;
  createError(code: AppErrorCode, message: string, context?: Record<string, unknown>): AppError;
}

/**
 * App Orchestrator Interface
 * Central coordinator for all modules
 */
export interface IAppOrchestrator {
  // Lifecycle
  initialize(config: OrchestratorConfig): Promise<void>;
  start(): Promise<void>;
  shutdown(): Promise<void>;

  // Status
  getModuleStatus(): Map<string, ModuleStatus>;
  isReady(): boolean;

  // Actions
  switchToChannel(channelId: string): Promise<void>;
  switchToChannelByNumber(number: number): Promise<void>;
  openEPG(): void;
  closeEPG(): void;
  toggleEPG(): void;

  // Error Handling
  handleGlobalError(error: AppError, context: string): void;
  registerErrorHandler(moduleId: string, handler: (error: AppError) => boolean): void;
  getRecoveryActions(errorCode: AppErrorCode): ErrorRecoveryAction[];
}
