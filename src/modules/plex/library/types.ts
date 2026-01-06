/**
 * @fileoverview Type definitions for Plex Library module.
 * @module modules/plex/library/types
 * @version 1.0.0
 */

// ============================================
// Shared Types (Copied from artifact-2-shared-types.ts)
// Cannot import directly as spec-pack is outside rootDir
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
 * A library section in Plex
 */
export interface PlexLibrary {
    id: string;
    uuid: string;
    title: string;
    type: PlexLibraryType;
    agent: string;
    scanner: string;
    contentCount: number;
    lastScannedAt: Date;
    art: string | null;
    thumb: string | null;
}

/**
 * A media item from Plex
 */
export interface PlexMediaItem {
    ratingKey: string;
    key: string;
    type: PlexMediaType;
    title: string;
    originalTitle?: string;
    sortTitle: string;
    summary: string;
    year: number;
    durationMs: number;
    addedAt: Date;
    updatedAt: Date;
    thumb: string | null;
    art: string | null;
    banner?: string | null;
    rating?: number;
    audienceRating?: number;
    contentRating?: string;
    grandparentTitle?: string;
    parentTitle?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    viewOffset?: number;
    viewCount?: number;
    lastViewedAt?: Date;
    media: PlexMediaFile[];
}

/**
 * A specific media file/version
 */
export interface PlexMediaFile {
    id: string;
    duration: number;
    bitrate: number;
    width: number;
    height: number;
    aspectRatio: number;
    videoCodec: string;
    audioCodec: string;
    audioChannels: number;
    container: string;
    videoResolution: string;
    parts: PlexMediaPart[];
}

/**
 * A part of a media file
 */
export interface PlexMediaPart {
    id: string;
    key: string;
    duration: number;
    file: string;
    size: number;
    container: string;
    videoProfile?: string;
    audioProfile?: string;
    streams: PlexStream[];
}

/**
 * A stream within a media file
 */
export interface PlexStream {
    id: string;
    streamType: 1 | 2 | 3;
    codec: string;
    language?: string;
    languageCode?: string;
    title?: string;
    selected?: boolean;
    default?: boolean;
    forced?: boolean;
    width?: number;
    height?: number;
    bitrate?: number;
    frameRate?: number;
    channels?: number;
    samplingRate?: number;
    format?: string;
    key?: string;
}

/**
 * A TV show season
 */
export interface PlexSeason {
    ratingKey: string;
    key: string;
    title: string;
    index: number;
    leafCount: number;
    viewedLeafCount: number;
    thumb: string | null;
}

/**
 * A Plex collection
 */
export interface PlexCollection {
    ratingKey: string;
    key: string;
    title: string;
    thumb: string | null;
    childCount: number;
}

/**
 * A Plex playlist
 */
export interface PlexPlaylist {
    ratingKey: string;
    key: string;
    title: string;
    thumb: string | null;
    duration: number;
    leafCount: number;
}

/**
 * Options for querying Plex library content
 */
export interface LibraryQueryOptions {
    sort?: string;
    filter?: Record<string, string | number>;
    offset?: number;
    limit?: number;
    includeCollections?: boolean;
}

/**
 * Options for Plex search
 */
export interface SearchOptions {
    types?: PlexMediaType[];
    libraryId?: string;
    limit?: number;
}

/**
 * Unified error codes
 */
export enum AppErrorCode {
    AUTH_REQUIRED = 'AUTH_REQUIRED',
    AUTH_EXPIRED = 'AUTH_EXPIRED',
    AUTH_INVALID = 'AUTH_INVALID',
    NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
    SERVER_UNREACHABLE = 'SERVER_UNREACHABLE',
    SERVER_ERROR = 'SERVER_ERROR',
    ITEM_NOT_FOUND = 'ITEM_NOT_FOUND',
    RATE_LIMITED = 'RATE_LIMITED',
    PARSE_ERROR = 'PARSE_ERROR',
}

// ============================================
// Internal Types
// ============================================

/**
 * Internal state for PlexLibrary instance.
 */
export interface PlexLibraryState {
    libraryCache: Map<string, LibraryCacheEntry>;
    isRefreshing: boolean;
}

/**
 * Cache entry for a library.
 */
export interface LibraryCacheEntry {
    library: PlexLibrary;
    cachedAt: number;
}

/**
 * Event map for PlexLibrary EventEmitter.
 */
export interface PlexLibraryEvents {
    /** Emitted when authentication expires (401 response) */
    authExpired: undefined;
    libraryRefreshed: { libraryId: string };
    [key: string]: unknown;
}

/**
 * Plex API response container structure.
 */
export interface PlexMediaContainer<T> {
    MediaContainer: {
        size?: number;
        totalSize?: number;
        offset?: number;
        Directory?: T[];
        Metadata?: T[];
        Hub?: PlexSearchHub[];
    };
}

/**
 * Plex search hub structure.
 */
export interface PlexSearchHub {
    type: string;
    hubIdentifier: string;
    size: number;
    title: string;
    Metadata?: RawMediaItem[];
}

/**
 * Raw library section from Plex API.
 */
export interface RawLibrarySection {
    key: string;
    uuid: string;
    title: string;
    type: string;
    agent: string;
    scanner: string;
    art?: string;
    thumb?: string;
    updatedAt?: number;
    scannedAt?: number;
}

/**
 * Raw media item from Plex API.
 */
export interface RawMediaItem {
    ratingKey: string;
    key: string;
    type: string;
    title: string;
    originalTitle?: string;
    titleSort?: string;
    summary?: string;
    year?: number;
    duration?: number;
    addedAt?: number;
    updatedAt?: number;
    thumb?: string;
    art?: string;
    banner?: string;
    rating?: number;
    audienceRating?: number;
    contentRating?: string;
    grandparentTitle?: string;
    parentTitle?: string;
    parentIndex?: number;
    index?: number;
    viewOffset?: number;
    viewCount?: number;
    lastViewedAt?: number;
    Media?: RawMediaFile[];
}

/**
 * Raw media file from Plex API.
 */
export interface RawMediaFile {
    id: string;
    duration: number;
    bitrate: number;
    width: number;
    height: number;
    aspectRatio: number;
    videoCodec: string;
    audioCodec: string;
    audioChannels: number;
    container: string;
    videoResolution: string;
    Part?: RawMediaPart[];
}

/**
 * Raw media part from Plex API.
 */
export interface RawMediaPart {
    id: string;
    key: string;
    duration: number;
    file: string;
    size: number;
    container: string;
    videoProfile?: string;
    audioProfile?: string;
    Stream?: RawStream[];
}

/**
 * Raw stream from Plex API.
 */
export interface RawStream {
    id: string;
    streamType: number;
    codec: string;
    language?: string;
    languageCode?: string;
    title?: string;
    selected?: boolean;
    default?: boolean;
    forced?: boolean;
    width?: number;
    height?: number;
    bitrate?: number;
    frameRate?: number;
    channels?: number;
    samplingRate?: number;
    format?: string;
    key?: string;
}

/**
 * Raw season from Plex API.
 */
export interface RawSeason {
    ratingKey: string;
    key: string;
    title: string;
    index: number;
    leafCount: number;
    viewedLeafCount: number;
    thumb?: string;
}

/**
 * Raw collection from Plex API.
 */
export interface RawCollection {
    ratingKey: string;
    key: string;
    title: string;
    thumb?: string;
    childCount: number;
}

/**
 * Raw playlist from Plex API.
 */
export interface RawPlaylist {
    ratingKey: string;
    key: string;
    title: string;
    thumb?: string;
    duration: number;
    leafCount: number;
}
