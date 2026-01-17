/**
 * @fileoverview Type definitions for Video Player module.
 * @module modules/player/types
 * @version 1.0.0
 */

import { AppErrorCode } from '../../types/app-errors';

// ============================================
// Shared Types (repo-local)
// These types are maintained in-repo for runtime use.
// ============================================

/**
 * Unified error codes for consistent error handling.
 */
export enum PlayerErrorCode {
    // Playback Errors
    NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
    PLAYBACK_DECODE_ERROR = 'PLAYBACK_DECODE_ERROR',
    PLAYBACK_FORMAT_UNSUPPORTED = 'PLAYBACK_FORMAT_UNSUPPORTED',
    TRACK_NOT_FOUND = 'TRACK_NOT_FOUND',
    TRACK_SWITCH_FAILED = 'TRACK_SWITCH_FAILED',
    TRACK_SWITCH_TIMEOUT = 'TRACK_SWITCH_TIMEOUT',
    CODEC_UNSUPPORTED = 'CODEC_UNSUPPORTED',
    UNKNOWN = 'UNKNOWN',
}

/**
 * Base application error structure.
 */
export interface PlayerError {
    /** Player-module error code (maps to AppErrorCode via mapPlayerErrorCodeToAppErrorCode) */
    code: PlayerErrorCode;
    /** Technical error message */
    message: string;
    /** Whether recovery might succeed */
    recoverable: boolean;
    /** Additional context for debugging */
    context?: Record<string, unknown>;
}

export function mapPlayerErrorCodeToAppErrorCode(code: PlayerErrorCode): AppErrorCode {
    switch (code) {
        case PlayerErrorCode.NETWORK_TIMEOUT:
            return AppErrorCode.NETWORK_TIMEOUT;
        case PlayerErrorCode.PLAYBACK_DECODE_ERROR:
            return AppErrorCode.PLAYBACK_DECODE_ERROR;
        case PlayerErrorCode.PLAYBACK_FORMAT_UNSUPPORTED:
            return AppErrorCode.PLAYBACK_FORMAT_UNSUPPORTED;
        case PlayerErrorCode.TRACK_NOT_FOUND:
            return AppErrorCode.TRACK_NOT_FOUND;
        case PlayerErrorCode.TRACK_SWITCH_FAILED:
            return AppErrorCode.TRACK_SWITCH_FAILED;
        case PlayerErrorCode.TRACK_SWITCH_TIMEOUT:
            return AppErrorCode.TRACK_SWITCH_TIMEOUT;
        case PlayerErrorCode.CODEC_UNSUPPORTED:
            return AppErrorCode.CODEC_UNSUPPORTED;
        case PlayerErrorCode.UNKNOWN:
            return AppErrorCode.UNKNOWN;
        default:
            return AppErrorCode.UNKNOWN;
    }
}

// ============================================
// Player Configuration
// ============================================

/**
 * Configuration for video player instance.
 */
export interface VideoPlayerConfig {
    /** Container element ID to append video element */
    containerId: string;
    /** Default volume level (0.0 to 1.0) */
    defaultVolume: number;
    /** Buffer ahead target in milliseconds */
    bufferAheadMs: number;
    /** Seek increment in seconds for relative seek */
    seekIncrementSec: number;
    /** Time in ms before hiding controls */
    hideControlsAfterMs: number;
    /** Maximum retry attempts for recoverable errors */
    retryAttempts: number;
    /** Base delay between retries in milliseconds */
    retryDelayMs: number;
    /** Whether to run in Demo Mode (simulated playback) */
    demoMode?: boolean;
}

// ============================================
// Media Metadata
// ============================================

/**
 * Metadata about the currently playing media.
 */
export interface MediaMetadata {
    /** Media title */
    title: string;
    /** Media subtitle (e.g., episode name) */
    subtitle?: string;
    /** Duration in milliseconds */
    durationMs: number;
    /** Thumbnail URL */
    thumb?: string;
    /** Release year */
    year?: number;
    /** Content rating (e.g., "PG-13") */
    contentRating?: string;
}

/**
 * Represents a buffered time range.
 */
export interface TimeRange {
    /** Start time in milliseconds */
    startMs: number;
    /** End time in milliseconds */
    endMs: number;
}

// ============================================
// Track Types
// ============================================

/**
 * Subtitle track information.
 */
export interface SubtitleTrack {
    /** Unique track identifier */
    id: string;
    /** Human-readable title */
    title: string;
    /** Language code (e.g., "en") */
    languageCode: string;
    /** Language name (e.g., "English") */
    language: string;
    /** Subtitle format (srt, vtt, pgs, ass) */
    format: string;
    /** URL to fetch subtitle file */
    url?: string;
    /** Whether this is the default track */
    default?: boolean;
    /** Whether these are forced subtitles */
    forced?: boolean;
}

/**
 * Audio track information.
 */
export interface AudioTrack {
    /** Unique track identifier */
    id: string;
    /** Human-readable title */
    title: string;
    /** Language code (e.g., "en") */
    languageCode: string;
    /** Language name (e.g., "English") */
    language: string;
    /** Audio codec (e.g., "aac") */
    codec: string;
    /** Number of audio channels */
    channels: number;
    /** Track index in the media */
    index: number;
    /** Whether this is the default track */
    default?: boolean;
}

// ============================================
// Stream Descriptor
// ============================================

/**
 * Describes a media stream to load.
 */
export interface StreamDescriptor {
    /** Playback URL */
    url: string;
    /** Stream protocol */
    protocol: 'hls' | 'dash' | 'direct';
    /** MIME type for the stream */
    mimeType: string;
    /** Start position in milliseconds */
    startPositionMs: number;
    /** Media metadata for display */
    mediaMetadata: MediaMetadata;
    /** Available subtitle tracks */
    subtitleTracks: SubtitleTrack[];
    /** Available audio tracks */
    audioTracks: AudioTrack[];
    /** Total duration in milliseconds */
    durationMs: number;
    /** Whether this is a live stream */
    isLive: boolean;
}

// ============================================
// Player State
// ============================================

/**
 * Player status states.
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
 * Current playback state.
 */
export interface PlaybackState {
    /** Current player status */
    status: PlayerStatus;
    /** Current playback position in milliseconds */
    currentTimeMs: number;
    /** Total duration in milliseconds */
    durationMs: number;
    /** Buffer percentage (0-100) */
    bufferPercent: number;
    /** Current volume (0.0 to 1.0) */
    volume: number;
    /** Whether audio is muted */
    isMuted: boolean;
    /** Playback rate (1.0 = normal) */
    playbackRate: number;
    /** ID of active subtitle track, null if disabled */
    activeSubtitleId: string | null;
    /** ID of active audio track */
    activeAudioId: string | null;
    /** Error info if status is 'error' */
    errorInfo: PlaybackError | null;
}

/**
 * Playback error with retry information.
 */
export interface PlaybackError extends PlayerError {
    /** Number of retry attempts made */
    retryCount: number;
    /** Suggested delay before retry in milliseconds */
    retryAfterMs?: number;
}

/**
 * Typed event map for player events.
 * Index signature required for EventEmitter<TEventMap extends Record<string, unknown>> constraint.
 */
export interface PlayerEventMap {
    /** Emitted on any state change */
    stateChange: PlaybackState;
    /** Emitted every ~250ms during playback */
    timeUpdate: { currentTimeMs: number; durationMs: number };
    /** Emitted when buffer level changes */
    bufferUpdate: { percent: number; bufferedRanges: TimeRange[] };
    /** Emitted when audio or subtitle track changes */
    trackChange: { type: 'audio' | 'subtitle'; trackId: string | null };
    /** Emitted when playback reaches the end */
    ended: undefined;
    /** Emitted on unrecoverable error */
    error: PlaybackError;
    /** Emitted when media metadata is loaded */
    mediaLoaded: { durationMs: number; tracks: { audio: AudioTrack[]; subtitle: SubtitleTrack[] } };
    /** Index signature for EventEmitter compatibility */
    [key: string]: unknown;
}

// ============================================
// Internal State (exported for related player modules only)
// ============================================

/**
 * Internal state for VideoPlayer class.
 */
export interface VideoPlayerInternalState {
    /** Current player status */
    status: PlayerStatus;
    /** Current playback position in milliseconds */
    currentTimeMs: number;
    /** Total duration in milliseconds */
    durationMs: number;
    /** Buffer percentage (0-100) */
    bufferPercent: number;
    /** Current volume (0.0 to 1.0) */
    volume: number;
    /** Whether audio is muted */
    isMuted: boolean;
    /** Playback rate (1.0 = normal) */
    playbackRate: number;
    /** ID of active subtitle track */
    activeSubtitleId: string | null;
    /** ID of active audio track */
    activeAudioId: string | null;
    /** Current error info */
    errorInfo: PlaybackError | null;
    /** Currently loaded stream descriptor */
    currentDescriptor: StreamDescriptor | null;
}
