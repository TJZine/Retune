/**
 * @fileoverview Error handling and retry logic for Video Player.
 * Extracted to reduce VideoPlayer.ts file length.
 * @module modules/player/ErrorHandler
 * @version 1.0.0
 */

import type { PlaybackError, AppErrorCode } from './types';
import { AppErrorCode as ErrorCode } from './types';
import { RETRY_BASE_DELAY_MS, MAX_RETRY_ATTEMPTS } from './constants';

/**
 * Map MediaError code to PlaybackError.
 * Exported for deterministic testing as required by spec.
 *
 * @param mediaErrorCode - MediaError.code value (1-4)
 * @param retryCount - Current retry count
 * @param retryAttempts - Maximum retry attempts
 * @param retryDelayMs - Base delay for retries (from config)
 * @returns PlaybackError with appropriate code and recoverable flag
 */
export function mapMediaErrorCodeToPlaybackError(
    mediaErrorCode: number,
    retryCount: number,
    retryAttempts: number,
    retryDelayMs: number = RETRY_BASE_DELAY_MS
): PlaybackError {
    let code: AppErrorCode;
    let message: string;
    let recoverable: boolean;

    switch (mediaErrorCode) {
        case 2: // MEDIA_ERR_NETWORK
            code = ErrorCode.NETWORK_TIMEOUT;
            message = 'Network error during playback';
            // Recoverable only if we haven't exhausted retries
            recoverable = retryCount < retryAttempts;
            break;

        case 3: // MEDIA_ERR_DECODE
            code = ErrorCode.PLAYBACK_DECODE_ERROR;
            message = 'Media decode error';
            recoverable = false;
            break;

        case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
            code = ErrorCode.PLAYBACK_FORMAT_UNSUPPORTED;
            message = 'Media format not supported';
            recoverable = false;
            break;

        default:
            code = ErrorCode.UNKNOWN;
            message = `Unknown media error (code: ${mediaErrorCode})`;
            recoverable = false;
    }

    const error: PlaybackError = {
        code,
        message,
        recoverable,
        retryCount,
    };

    // Only set retryAfterMs if recoverable
    if (recoverable) {
        error.retryAfterMs = retryDelayMs * Math.pow(2, retryCount);
    }

    return error;
}

/**
 * Calculate retry delay using exponential backoff.
 * @param attemptNumber - Current attempt number (0-based)
 * @param baseDelayMs - Base delay in milliseconds
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(attemptNumber: number, baseDelayMs: number): number {
    return baseDelayMs * Math.pow(2, attemptNumber);
}

/**
 * Get capped retry attempts (max 3 per spec).
 * @param configRetryAttempts - Config value
 * @returns Capped retry attempts
 */
export function getMaxRetryAttempts(configRetryAttempts: number): number {
    return Math.min(configRetryAttempts, MAX_RETRY_ATTEMPTS);
}
