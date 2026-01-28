/**
 * @fileoverview Type definitions for Plex Library module.
 * @module modules/plex/library/types
 * @version 1.0.0
 */

import { AppErrorCode } from '../../../types/app-errors';
import type { PlexMediaFile } from '../shared/types';

// ============================================
// Shared Types (repo-local)
// These types are maintained in-repo for runtime use.
// ============================================

/**
 * Plex library section types
 */
export type PlexLibraryType = 'movie' | 'show' | 'artist' | 'photo';

/**
 * Plex media item types
 */
export type PlexMediaType = 'movie' | 'show' | 'episode' | 'track' | 'clip';

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
    genres?: string[];
    directors?: string[];
    actors?: string[];
    studios?: string[];
    actorRoles?: PlexMediaRole[];
    grandparentTitle?: string;
    parentTitle?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    viewOffset?: number;
    viewCount?: number;
    lastViewedAt?: Date;
    grandparentRatingKey?: string;
    parentRatingKey?: string;
    media: PlexMediaFile[];
}

/**
 * Shared media file/part/stream types.
 */
export type { PlexMediaFile, PlexMediaPart, PlexStream } from '../shared/types';

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
 * Parsed Plex tag directory entry (actors/studios).
 */
export interface PlexTagDirectoryItem {
    key: string;
    title: string;
    count: number;
    fastKey?: string;
    thumb?: string;
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
    signal?: AbortSignal | null;
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
export enum PlexLibraryErrorCode {
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

export function mapPlexLibraryErrorCodeToAppErrorCode(
    code: PlexLibraryErrorCode
): AppErrorCode {
    switch (code) {
        case PlexLibraryErrorCode.AUTH_REQUIRED:
            return AppErrorCode.AUTH_REQUIRED;
        case PlexLibraryErrorCode.AUTH_EXPIRED:
            return AppErrorCode.AUTH_EXPIRED;
        case PlexLibraryErrorCode.AUTH_INVALID:
            return AppErrorCode.AUTH_INVALID;
        case PlexLibraryErrorCode.NETWORK_TIMEOUT:
            return AppErrorCode.NETWORK_TIMEOUT;
        case PlexLibraryErrorCode.SERVER_UNREACHABLE:
            return AppErrorCode.SERVER_UNREACHABLE;
        case PlexLibraryErrorCode.SERVER_ERROR:
            return AppErrorCode.SERVER_ERROR;
        case PlexLibraryErrorCode.ITEM_NOT_FOUND:
            return AppErrorCode.ITEM_NOT_FOUND;
        case PlexLibraryErrorCode.RATE_LIMITED:
            return AppErrorCode.RATE_LIMITED;
        case PlexLibraryErrorCode.PARSE_ERROR:
            return AppErrorCode.PARSE_ERROR;
        default:
            return AppErrorCode.UNKNOWN;
    }
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
    Genre?: RawTag[];
    Director?: RawTag[];
    Role?: RawRole[];
    Studio?: RawTag[];
    grandparentTitle?: string;
    parentTitle?: string;
    parentIndex?: number;
    index?: number;
    viewOffset?: number;
    viewCount?: number;
    lastViewedAt?: number;
    grandparentRatingKey?: string;
    parentRatingKey?: string;
    Media?: RawMediaFile[];
}

/**
 * Raw metadata tag from Plex API.
 */
export interface RawTag {
    id?: number;
    tag?: string;
}

/**
 * Raw role tag from Plex API (actors).
 */
export interface RawRole {
    id?: number;
    tag?: string;
    role?: string;
    thumb?: string;
}

/**
 * Parsed role/actor entry for media items.
 */
export interface PlexMediaRole {
    name: string;
    role?: string | null;
    thumb?: string | null;
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
    displayTitle?: string;
    extendedDisplayTitle?: string;
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
    profile?: string;
    colorTrc?: string;
    colorSpace?: string;
    colorPrimaries?: string;
    bitDepth?: number;
    hdr?: string;
    dynamicRange?: string;
    DOVIProfile?: string;
    DOVIPresent?: boolean | number | string;
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

/**
 * Raw directory tag entry from Plex tag endpoints (actors/studios).
 */
export interface RawDirectoryTag {
    key: string;
    title: string;
    count?: number;
    fastKey?: string;
    thumb?: string;
}
