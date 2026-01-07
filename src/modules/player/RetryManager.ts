/**
 * @fileoverview Retry manager for video playback errors.
 * Handles retry scheduling with exponential backoff.
 * @module modules/player/RetryManager
 * @version 1.0.0
 */

import type { StreamDescriptor, PlaybackError } from './types';
import { MAX_RETRY_ATTEMPTS, RETRY_BASE_DELAY_MS } from './constants';
import { mapMediaErrorCodeToPlaybackError } from './ErrorHandler';

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

        const currentTime = this._videoElement.currentTime;

        // Clear existing sources
        while (this._videoElement.firstChild) {
            this._videoElement.removeChild(this._videoElement.firstChild);
        }
        this._videoElement.removeAttribute('src');

        // Set source based on protocol (mirror loadStream logic)
        if (this._descriptor.protocol === 'hls') {
            // Native HLS - set src directly
            this._videoElement.src = this._descriptor.url;
        } else {
            // Direct play - use source element with type hint for webOS
            const source = document.createElement('source');
            source.src = this._descriptor.url;
            source.type = this._descriptor.mimeType;
            this._videoElement.appendChild(source);
        }

        this._videoElement.load();
        this._videoElement.currentTime = currentTime;
        this._videoElement.play().catch(() => {
            // Error will be handled by error event
        });
    }
}
