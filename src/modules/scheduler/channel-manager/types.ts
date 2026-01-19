/**
 * @fileoverview Type definitions for Channel Manager module.
 * @module modules/scheduler/channel-manager/types
 * @version 1.0.0
 */

// ============================================
// Playback & Filter Types
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
    | 'director'
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
 * Plex media item types
 */
export type PlexMediaType = 'movie' | 'show' | 'episode' | 'track' | 'clip';

// ============================================
// Content Filter
// ============================================

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

// ============================================
// Content Source Types
// ============================================

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
    libraryType: 'movie' | 'show';
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
 * Manually selected content items
 */
export interface ManualContentSource extends BaseContentSource {
    type: 'manual';
    /** Selected items with cached metadata */
    items: ManualContentItem[];
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

// ============================================
// Channel Configuration
// ============================================

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
    /** Custom icon URL */
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
    /** Seed for deterministic per-channel phase offset (live drift) */
    phaseSeed?: number;
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

// ============================================
// Resolved Content
// ============================================

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
    // Filterable fields (Issue 8)
    /** Rating (0-10) */
    rating?: number;
    /** Content rating (e.g., "PG-13") */
    contentRating?: string;
    /** Genres */
    genres?: string[];
    /** Directors */
    directors?: string[];
    /** Whether item has been watched */
    watched?: boolean;
    /** When item was added to Plex */
    addedAt?: number;
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
    // Cache status fields (Issue 2)
    /** Whether this content came from cache */
    fromCache?: boolean;
    /** Whether cached content is stale */
    isStale?: boolean;
    /** Reason for using cache (if applicable) */
    cacheReason?: 'fresh' | 'network_error' | 'content_unavailable';
}

// ============================================
// Import/Export
// ============================================

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
// Events
// ============================================

/**
 * Channel manager events
 */
export interface ChannelManagerEventMap {
    channelCreated: ChannelConfig;
    channelUpdated: ChannelConfig;
    channelDeleted: string;
    channelSwitch: { channel: ChannelConfig; index: number };
    contentResolved: ResolvedChannelContent;
    [key: string]: unknown;
}

// ============================================
// Internal State
// ============================================

/**
 * Internal state for ChannelManager
 */
export interface ChannelManagerState {
    channels: Map<string, ChannelConfig>;
    resolvedContent: Map<string, ResolvedChannelContent>;
    currentChannelId: string | null;
    channelOrder: string[];
}

/**
 * Stored data format for localStorage
 */
export interface StoredChannelData {
    channels: ChannelConfig[];
    channelOrder: string[];
    currentChannelId: string | null;
    savedAt: number;
}
