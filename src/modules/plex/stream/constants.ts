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
 * Strictly limited to formats with high native compatibility assurance.
 * Usage of legacy containers (AVI, WMV) generally triggers transcoding.
 */
export const SUPPORTED_CONTAINERS: readonly string[] = [
    'mp4',
    'm4v',
    'mkv',
    'ts',    // MPEG-TS
    'm2ts',  // MPEG-TS
    'mov',   // QuickTime
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
    'vp9',      // Supported in modern webOS (MP4/MKV/WebM)
    'mpeg2video',
    'av1',      // Supported in webOS 22+
] as const;

/**
 * Supported audio codecs for direct play on webOS.
 * See `WEBOS_COMPETITOR_BEST_PRACTICES.md` for webOS playback notes and caveats.
 * Note: DTS and MP3 are often problematic in Generic profiles.
 */
export const SUPPORTED_AUDIO_CODECS: readonly string[] = [
    'aac',
    'ac3',
    'eac3',
    'flac',
    'vorbis',
    'opus',
    'mp3', // Kept but may transcode if bitrate conditional fails
    'pcm',
    'dts',  // DTS Core - supported via passthrough on LG C-series and newer
    'dca',  // DTS alias used by some media files
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

// Re-export from shared module for backward compatibility
export { BURN_IN_SUBTITLE_FORMATS, TEXT_SUBTITLE_FORMATS as SIDECAR_SUBTITLE_FORMATS } from '../../../shared/subtitle-formats';

// ============================================
// Client Profile
// ============================================

/**
 * webOS client profile for Plex transcode decisions.
 * Tells the server what formats the client can handle.
 * Strictly adheres to Plex profile syntax.
 */
export const WEBOS_CLIENT_PROFILE_PARTS: readonly string[] = [
    'add-limitation(scope=videoCodec&scopeName=*&type=upperBound&name=video.bitrate&value=100000)',
    'add-limitation(scope=videoAudioCodec&scopeName=*&type=match&name=audio.channels&list=2|6|8)',
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
 * MIME type mapping for stream protocols and containers.
 * Uses official IANA types where possible and robust defaults for native players.
 */
export const MIME_TYPES: Record<string, string> = {
    // Protocols
    hls: 'application/vnd.apple.mpegurl', // Preferred for native players
    dash: 'application/dash+xml',

    // Video Containers
    mp4: 'video/mp4',
    m4v: 'video/mp4',
    mkv: 'video/x-matroska',
    ts: 'video/mp2t',
    m2ts: 'video/mp2t',
    mov: 'video/quicktime',
    webm: 'video/webm',

    // Audio Containers
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    flac: 'audio/flac',
    aac: 'audio/aac',

    // Fallback
    direct: 'video/mp4',
    http: 'video/mp4',
} as const;
