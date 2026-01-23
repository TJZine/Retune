/**
 * @fileoverview Constants for Video Player module.
 * @module modules/player/constants
 * @version 1.0.0
 */

// ============================================
// Keep-Alive Configuration
// ============================================

/**
 * Interval in milliseconds for keep-alive DOM touch.
 * Prevents webOS from suspending the app during long playback.
 */
export const KEEP_ALIVE_INTERVAL_MS = 30000;

// ============================================
// Retry Configuration
// ============================================

/**
 * Maximum number of retry attempts for recoverable errors.
 */
export const MAX_RETRY_ATTEMPTS = 3;

/**
 * Base delay in milliseconds for exponential backoff retry.
 */
export const RETRY_BASE_DELAY_MS = 1000;

/**
 * Synthetic error code key stored on the HTMLVideoElement to coordinate retries.
 */
export const SYNTHETIC_MEDIA_ERROR_CODE_KEY = '__retuneSyntheticMediaErrorCode';

// ============================================
// Video Element Configuration
// ============================================

/**
 * ID for the main video element.
 */
export const VIDEO_ELEMENT_ID = 'retune-video-player';

/**
 * CSS styles for the video element.
 */
export const VIDEO_ELEMENT_STYLES = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: #000;
    object-fit: contain;
`;

// ============================================
// Timing Constants
// ============================================

/**
 * Interval for timeUpdate events in milliseconds.
 */
export const TIME_UPDATE_INTERVAL_MS = 250;

/**
 * Timeout for audio track switch in milliseconds.
 */
export const AUDIO_TRACK_SWITCH_TIMEOUT_MS = 5000;

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG = {
    defaultVolume: 1.0,
    bufferAheadMs: 30000,
    seekIncrementSec: 10,
    hideControlsAfterMs: 5000,
    retryAttempts: MAX_RETRY_ATTEMPTS,
    retryDelayMs: RETRY_BASE_DELAY_MS,
} as const;

// ============================================
// MIME Types
// ============================================

/**
 * MIME type mappings for stream protocols.
 */
export const PROTOCOL_MIME_TYPES: Record<string, string> = {
    hls: 'application/x-mpegURL',
    dash: 'application/dash+xml',
    direct: 'video/mp4',
};

// ============================================
// Subtitle Formats
// ============================================

// Re-export from shared module for backward compatibility
export { BURN_IN_SUBTITLE_FORMATS, TEXT_SUBTITLE_FORMATS } from '../../shared/subtitle-formats';
