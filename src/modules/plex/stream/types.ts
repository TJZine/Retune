/**
 * @fileoverview Type definitions for Plex Stream Resolver module.
 * @module modules/plex/stream/types
 * @version 1.0.0
 */

import { AppErrorCode } from '../../../types/app-errors';

// ============================================
// Shared Types (Copied from artifact-2-shared-types.ts)
// Cannot import directly as spec-pack is outside rootDir
// ============================================

/**
 * Plex media item types
 */
export type PlexMediaType = 'movie' | 'episode' | 'track' | 'clip';

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
    /** Video width */
    width?: number;
    /** Video height */
    height?: number;
    /** Bitrate in kbps */
    bitrate?: number;
    /** Frame rate */
    frameRate?: number;
    /** Audio channels */
    channels?: number;
    /** Audio sampling rate */
    samplingRate?: number;
    /** Subtitle format (srt, vtt, pgs, ass) */
    format?: string;
    /** URL to fetch subtitle file */
    key?: string;
}

/**
 * A part of a media file
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
 * A specific media file/version for a Plex item
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
 * A media item from Plex (movie, episode, etc.)
 */
export interface PlexMediaItem {
    /** Unique item ID (ratingKey) */
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
    /** Poster image path */
    thumb: string | null;
    /** Background art path */
    art: string | null;
    /** Banner image path (TV shows) */
    banner?: string | null;
    /** Plex rating (0-10) */
    rating?: number;
    /** Audience rating (0-10) */
    audienceRating?: number;
    /** Content rating (e.g., "PG-13", "TV-MA") */
    contentRating?: string;
    /** Show name (for episodes) */
    grandparentTitle?: string;
    /** Season name (for episodes) */
    parentTitle?: string;
    /** Season number (1-based) */
    seasonNumber?: number;
    /** Episode number (1-based) */
    episodeNumber?: number;
    /** Resume position in ms (0 if not started) */
    viewOffset?: number;
    /** Number of times watched */
    viewCount?: number;
    /** Last watched time */
    lastViewedAt?: Date;
    /** Available media files/versions */
    media: PlexMediaFile[];
}

/**
 * Unified error codes
 */
export enum PlexStreamErrorCode {
    AUTH_REQUIRED = 'AUTH_REQUIRED',
    AUTH_EXPIRED = 'AUTH_EXPIRED',
    AUTH_INVALID = 'AUTH_INVALID',
    NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
    NETWORK_OFFLINE = 'NETWORK_OFFLINE',
    SERVER_UNREACHABLE = 'SERVER_UNREACHABLE',
    MIXED_CONTENT_BLOCKED = 'MIXED_CONTENT_BLOCKED',
    PLAYBACK_SOURCE_NOT_FOUND = 'PLAYBACK_SOURCE_NOT_FOUND',
    PLAYBACK_FORMAT_UNSUPPORTED = 'PLAYBACK_FORMAT_UNSUPPORTED',
    TRANSCODE_FAILED = 'TRANSCODE_FAILED',
    PARSE_ERROR = 'PARSE_ERROR',
    ITEM_NOT_FOUND = 'ITEM_NOT_FOUND',
    SERVER_ERROR = 'SERVER_ERROR',
    UNKNOWN = 'UNKNOWN',
}

export function mapPlexStreamErrorCodeToAppErrorCode(
    code: PlexStreamErrorCode
): AppErrorCode {
    switch (code) {
        case PlexStreamErrorCode.AUTH_REQUIRED:
            return AppErrorCode.AUTH_REQUIRED;
        case PlexStreamErrorCode.AUTH_EXPIRED:
            return AppErrorCode.AUTH_EXPIRED;
        case PlexStreamErrorCode.AUTH_INVALID:
            return AppErrorCode.AUTH_INVALID;
        case PlexStreamErrorCode.NETWORK_TIMEOUT:
            return AppErrorCode.NETWORK_TIMEOUT;
        case PlexStreamErrorCode.NETWORK_OFFLINE:
            return AppErrorCode.NETWORK_OFFLINE;
        case PlexStreamErrorCode.SERVER_UNREACHABLE:
            return AppErrorCode.SERVER_UNREACHABLE;
        case PlexStreamErrorCode.MIXED_CONTENT_BLOCKED:
            return AppErrorCode.MIXED_CONTENT_BLOCKED;
        case PlexStreamErrorCode.PLAYBACK_SOURCE_NOT_FOUND:
            return AppErrorCode.PLAYBACK_SOURCE_NOT_FOUND;
        case PlexStreamErrorCode.PLAYBACK_FORMAT_UNSUPPORTED:
            return AppErrorCode.PLAYBACK_FORMAT_UNSUPPORTED;
        case PlexStreamErrorCode.TRANSCODE_FAILED:
            return AppErrorCode.TRANSCODE_FAILED;
        case PlexStreamErrorCode.PARSE_ERROR:
            return AppErrorCode.PARSE_ERROR;
        case PlexStreamErrorCode.ITEM_NOT_FOUND:
            return AppErrorCode.ITEM_NOT_FOUND;
        case PlexStreamErrorCode.SERVER_ERROR:
            return AppErrorCode.SERVER_ERROR;
        default:
            return AppErrorCode.UNKNOWN;
    }
}

// ============================================
// Stream Resolution Types
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
// Local Types
// ============================================

/**
 * Active playback session tracking.
 */
export interface PlaybackSession {
    /** Unique session identifier (UUID) */
    sessionId: string;
    /** ratingKey of the media item */
    itemKey: string;
    /** Session start timestamp (ms since epoch) */
    startedAt: number;
    /** Duration of the media in ms */
    durationMs: number;
    /** Last reported playback position in ms */
    lastReportedPositionMs: number;
    /** Timestamp of last progress report */
    lastReportedAt: number;
    /** Whether this session is using transcoding */
    isTranscoding: boolean;
}

/**
 * Internal state for PlexStreamResolver.
 */
export interface StreamResolverState {
    /** Map of active sessions by sessionId */
    activeSessions: Map<string, PlaybackSession>;
}
