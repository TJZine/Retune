/**
 * @fileoverview Retry manager for video playback errors.
 * Handles retry scheduling with exponential backoff.
 * @module modules/player/RetryManager
 * @version 1.0.0
 */

import type { StreamDescriptor, PlaybackError } from './types';
import { MAX_RETRY_ATTEMPTS, RETRY_BASE_DELAY_MS } from './constants';
import { mapMediaErrorCodeToPlaybackError } from './ErrorHandler';

const SYNTHETIC_MEDIA_ERROR_CODE_KEY = '__retuneSyntheticMediaErrorCode';

/**
 * Callback for retry error handling.
 */
export interface RetryErrorCallback {
    (error: PlaybackError): void;
}

/**
 * Manages retry logic for video playback with exponential backoff.
 */
export class RetryManager {
    /** Current retry count */
    private _retryCount = 0;

    /** Retry timer ID */
    private _retryTimer: ReturnType<typeof setTimeout> | null = null;

    /** Metadata wait timeout ID (for _retryPlayback) */
    private _metadataTimeoutId: ReturnType<typeof setTimeout> | null = null;

    /** Video element reference */
    private _videoElement: HTMLVideoElement | null = null;

    /** Current stream descriptor */
    private _descriptor: StreamDescriptor | null = null;

    /** Config retry delay */
    private _configRetryDelayMs: number = RETRY_BASE_DELAY_MS;

    /** Config retry attempts */
    private _configRetryAttempts: number = MAX_RETRY_ATTEMPTS;

    /**
     * Initialize the retry manager.
     */
    public initialize(
        videoElement: HTMLVideoElement,
        configRetryAttempts?: number,
        configRetryDelayMs?: number
    ): void {
        this._videoElement = videoElement;
        this._configRetryAttempts = configRetryAttempts ?? MAX_RETRY_ATTEMPTS;
        this._configRetryDelayMs = configRetryDelayMs ?? RETRY_BASE_DELAY_MS;
    }

    /**
     * Set current descriptor for retry.
     */
    public setDescriptor(descriptor: StreamDescriptor | null): void {
        this._descriptor = descriptor;
    }

    /**
     * Get current retry count.
     */
    public getRetryCount(): number {
        return this._retryCount;
    }

    /**
     * Handle a media error - determine if recoverable and schedule retry.
     * @returns The PlaybackError created from the media error
     */
    public handleMediaError(mediaErrorCode: number): PlaybackError {
        // Cap retry attempts to MAX_RETRY_ATTEMPTS (3) per spec
        const retryAttempts = Math.min(this._configRetryAttempts, MAX_RETRY_ATTEMPTS);

        const playbackError = mapMediaErrorCodeToPlaybackError(
            mediaErrorCode,
            this._retryCount,
            retryAttempts,
            this._configRetryDelayMs
        );

        if (playbackError.recoverable) {
            this._scheduleRetry(playbackError.retryAfterMs || this._configRetryDelayMs);
        }

        return playbackError;
    }

    /**
     * Reset retry state.
     */
    public reset(): void {
        this._retryCount = 0;
        this.clear();
    }

    /**
     * Clear pending retry timer.
     */
    public clear(): void {
        if (this._retryTimer) {
            clearTimeout(this._retryTimer);
            this._retryTimer = null;
        }
        if (this._metadataTimeoutId) {
            clearTimeout(this._metadataTimeoutId);
            this._metadataTimeoutId = null;
        }
    }

    /**
     * Destroy the manager.
     */
    public destroy(): void {
        this.clear();
        this._videoElement = null;
        this._descriptor = null;
        this._retryCount = 0;
    }

    // ========================================
    // Private Methods
    // ========================================

    /**
     * Schedule a retry after delay.
     */
    private _scheduleRetry(delayMs: number): void {
        this.clear();
        this._retryCount++;

        console.warn(`[RetryManager] Scheduling retry ${this._retryCount} in ${delayMs}ms`);

        this._retryTimer = setTimeout(() => {
            this._retryTimer = null;
            this._retryPlayback();
        }, delayMs);
    }

    /**
     * Retry loading the current stream.
     * Mirrors VideoPlayer.loadStream logic for protocol-specific source handling.
     */
    private _retryPlayback(): void {
        if (!this._videoElement || !this._descriptor) {
            return;
        }

        // Capture current time BEFORE calling load() which resets it
        const savedTime = this._videoElement.currentTime;
        const video = this._videoElement;

        // Clear existing sources
        while (video.firstChild) {
            video.removeChild(video.firstChild);
        }
        video.removeAttribute('src');

        // Set source based on protocol (mirror loadStream logic)
        if (this._descriptor.protocol === 'hls') {
            // Native HLS - set src directly
            video.src = this._descriptor.url;
        } else {
            // Direct play - use source element with type hint for webOS
            const source = document.createElement('source');
            source.src = this._descriptor.url;
            source.type = this._descriptor.mimeType;
            video.appendChild(source);
        }

        video.load();

        // Timeout to prevent indefinite hang if loadedmetadata/error never fires
        const METADATA_TIMEOUT_MS = 10000;

        const cleanup = (): void => {
            if (this._metadataTimeoutId) {
                clearTimeout(this._metadataTimeoutId);
                this._metadataTimeoutId = null;
            }
            video.removeEventListener('loadedmetadata', onMetadata);
            video.removeEventListener('error', onError);
        };

        // Wait for loadedmetadata before seeking, as load() resets currentTime
        // (VideoPlayer.loadStream uses canplay, but loadedmetadata is sufficient for seeking)
        const onMetadata = (): void => {
            cleanup();
            video.currentTime = savedTime;
            video.play().catch(() => {
                // Error will be handled by error event
            });
        };

        const onError = (): void => {
            cleanup();
            // Error propagates through VideoPlayerEvents error handler
        };

        const onTimeout = (): void => {
            cleanup();
            console.warn('[RetryManager] Metadata timeout after 10s, treating as error');
            // Trigger error path - the video element may be in a zombie state.
            // Emit a synthetic error event with a recoverable MediaError code hint (NETWORK)
            // so VideoPlayerEvents can schedule retries and emit errors consistently.
            (video as unknown as Record<string, unknown>)[SYNTHETIC_MEDIA_ERROR_CODE_KEY] = 2;
            video.dispatchEvent(new Event('error'));
        };

        this._metadataTimeoutId = setTimeout(onTimeout, METADATA_TIMEOUT_MS);
        video.addEventListener('loadedmetadata', onMetadata);
        video.addEventListener('error', onError);
    }
}
