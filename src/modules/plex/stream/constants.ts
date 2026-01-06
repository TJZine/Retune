/**
 * @fileoverview Plex Stream Resolver constants.
 * Codec support tables for webOS direct play detection.
 * @module modules/plex/stream/constants
 * @version 1.0.0
 */

// ============================================
// webOS Codec Support (MAJOR-002)
// ============================================

/**
 * Supported container formats for direct play on webOS.
 * All containers listed here can be played natively.
 * Per spec-pack/modules/plex-stream-resolver.md:463
 */
export const SUPPORTED_CONTAINERS: readonly string[] = [
    'mp4',
    'mkv',
    'ts', // HLS segments
] as const;

/**
 * Supported video codecs for direct play on webOS.
 * Includes both canonical and alias names.
 */
export const SUPPORTED_VIDEO_CODECS: readonly string[] = [
    'h264',
    'avc',      // Alias for H.264
    'hevc',
    'h265',     // Alias for HEVC
] as const;

/**
 * Supported audio codecs for direct play on webOS.
 * Per spec-pack/modules/plex-stream-resolver.md:463
 * Note: DTS and MP3 are NOT supported and must be transcoded.
 */
export const SUPPORTED_AUDIO_CODECS: readonly string[] = [
    'aac',
    'ac3',
    'eac3',
] as const;

/**
 * Maximum supported resolution for direct play.
 */
export const MAX_RESOLUTION = {
    width: 3840,
    height: 2160,
} as const;

// ============================================
// Retry Configuration
// ============================================

/**
 * Retry configuration for stream resolution.
 */
export const RETRY_CONFIG = {
    /** Maximum number of retry attempts */
    maxRetries: 3,
    /** Delay before each retry attempt (exponential backoff) */
    retryDelayMs: [1000, 2000, 4000] as readonly number[],
    /** Timeout for each request */
    timeoutMs: 10000,
} as const;

/**
 * Error codes that allow retry.
 */
export const RETRYABLE_ERROR_CODES: readonly string[] = [
    'SERVER_UNREACHABLE',
    'NETWORK_TIMEOUT',
] as const;

// ============================================
// Progress Reporting
// ============================================

/**
 * Maximum time allowed for progress reporting (per spec budget).
 */
export const PROGRESS_TIMEOUT_MS = 100;

/**
 * Recommended interval between progress reports.
 */
export const PROGRESS_REPORT_INTERVAL_MS = 10000;

// ============================================
// Subtitle Formats
// ============================================

/**
 * Subtitle formats that require burn-in (image-based or styled).
 */
export const BURN_IN_SUBTITLE_FORMATS: readonly string[] = [
    'pgs',
    'vobsub',
    'dvdsub',
    'ass',
] as const;

/**
 * Subtitle formats that can be delivered as sidecar (text-based).
 */
export const SIDECAR_SUBTITLE_FORMATS: readonly string[] = [
    'srt',
    'vtt',
    'webvtt',
    'subrip',
] as const;

// ============================================
// Client Profile
// ============================================

/**
 * webOS client profile for Plex transcode decisions.
 * Tells the server what formats the client can handle.
 */
export const WEBOS_CLIENT_PROFILE_PARTS: readonly string[] = [
    'add-limitation(scope=videoCodec&scopeName=*&type=upperBound&name=video.bitrate&value=20000)',
    'add-limitation(scope=videoAudioCodec&scopeName=*&type=match&name=audio.channels&list=2|6)',
    'append-transcode-target(type=videoProfile&context=streaming&protocol=hls&container=mpegts)',
    'append-transcode-target-codec(type=videoProfile&context=streaming&protocol=hls&videoCodec=h264)',
    'append-transcode-target-codec(type=videoProfile&context=streaming&protocol=hls&audioCodec=aac)',
    'append-transcode-target-codec(type=videoProfile&context=streaming&protocol=hls&audioCodec=ac3)',
] as const;

/**
 * Default HLS options when not specified.
 */
export const DEFAULT_HLS_OPTIONS = {
    maxBitrate: 20000,
    subtitleSize: 100,
    audioBoost: 100,
} as const;

// ============================================
// MIME Types
// ============================================

/**
 * MIME type mapping for stream protocols.
 */
export const MIME_TYPES: Record<string, string> = {
    hls: 'application/x-mpegURL',
    dash: 'application/dash+xml',
    direct: 'video/mp4',
    http: 'video/mp4',
} as const;
