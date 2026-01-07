/**
 * @fileoverview Video player event handling.
 * Encapsulates DOM event wiring and handler logic.
 * @module modules/player/VideoPlayerEvents
 * @version 1.0.0
 */

import type { EventEmitter } from '../../utils/EventEmitter';
import type {
    PlayerEventMap,
    PlayerStatus,
    VideoPlayerInternalState,
    TimeRange,
} from './types';
import type { RetryManager } from './RetryManager';

/**
 * Callbacks for state updates.
 */
export interface EventHandlerCallbacks {
    updateStatus: (status: PlayerStatus) => void;
    getState: () => VideoPlayerInternalState;
    setState: (update: Partial<VideoPlayerInternalState>) => void;
}

/**
 * Manages video element event listeners.
 */
export class VideoPlayerEvents {
    /** Video element reference */
    private _videoElement: HTMLVideoElement | null = null;

    /** Event emitter */
    private _emitter: EventEmitter<PlayerEventMap> | null = null;

    /** State accessor */
    private _callbacks: EventHandlerCallbacks | null = null;

    /** Retry manager */
    private _retryManager: RetryManager | null = null;

    /** Bound event handlers for cleanup */
    private _boundHandlers: Map<string, EventListener> = new Map();

    /** Status before seeking (to restore after) */
    private _statusBeforeSeek: PlayerStatus | null = null;

    /**
     * Attach event listeners to video element.
     */
    public attach(
        videoElement: HTMLVideoElement,
        emitter: EventEmitter<PlayerEventMap>,
        callbacks: EventHandlerCallbacks,
        retryManager: RetryManager
    ): void {
        this._videoElement = videoElement;
        this._emitter = emitter;
        this._callbacks = callbacks;
        this._retryManager = retryManager;

        const handlers: [string, EventListener][] = [
            ['loadstart', this._handleLoadStart.bind(this)],
            ['canplay', this._handleCanPlay.bind(this)],
            ['playing', this._handlePlaying.bind(this)],
            ['pause', this._handlePause.bind(this)],
            ['seeking', this._handleSeeking.bind(this)],
            ['seeked', this._handleSeeked.bind(this)],
            ['ended', this._handleEnded.bind(this)],
            ['error', this._handleError.bind(this)],
            ['timeupdate', this._handleTimeUpdate.bind(this)],
            ['progress', this._handleProgress.bind(this)],
            ['waiting', this._handleWaiting.bind(this)],
            ['loadedmetadata', this._handleLoadedMetadata.bind(this)],
        ];

        for (const [event, handler] of handlers) {
            videoElement.addEventListener(event, handler);
            this._boundHandlers.set(event, handler);
        }
    }

    /**
     * Detach all event listeners.
     */
    public detach(): void {
        if (!this._videoElement) {
            return;
        }

        for (const [event, handler] of this._boundHandlers) {
            this._videoElement.removeEventListener(event, handler);
        }
        this._boundHandlers.clear();
        this._videoElement = null;
        this._emitter = null;
        this._callbacks = null;
        this._retryManager = null;
    }

    /**
     * Wait for canplay event.
     */
    public waitForCanPlay(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this._videoElement) {
                reject(new Error('Video element not available'));
                return;
            }

            if (this._videoElement.readyState >= 3) {
                resolve();
                return;
            }

            const onCanPlay = (): void => {
                this._videoElement?.removeEventListener('canplay', onCanPlay);
                this._videoElement?.removeEventListener('error', onError);
                resolve();
            };

            const onError = (): void => {
                this._videoElement?.removeEventListener('canplay', onCanPlay);
                this._videoElement?.removeEventListener('error', onError);
                reject(new Error('Error loading media'));
            };

            this._videoElement.addEventListener('canplay', onCanPlay);
            this._videoElement.addEventListener('error', onError);
        });
    }

    // ========================================
    // Event Handlers
    // ========================================

    private _handleLoadStart(): void {
        this._callbacks?.updateStatus('loading');
    }

    private _handleCanPlay(): void {
        const state = this._callbacks?.getState();
        if (state?.status === 'loading') {
            this._callbacks?.updateStatus('paused');
        }
    }

    private _handlePlaying(): void {
        this._callbacks?.updateStatus('playing');
    }

    private _handlePause(): void {
        const state = this._callbacks?.getState();
        if (state?.status !== 'seeking' && state?.status !== 'ended') {
            this._callbacks?.updateStatus('paused');
        }
    }

    private _handleSeeking(): void {
        this._statusBeforeSeek = this._callbacks?.getState().status || null;
        this._callbacks?.updateStatus('seeking');
    }

    private _handleSeeked(): void {
        const previousStatus = this._statusBeforeSeek || 'paused';
        this._statusBeforeSeek = null;

        if (this._videoElement && !this._videoElement.paused) {
            this._callbacks?.updateStatus('playing');
        } else {
            this._callbacks?.updateStatus(previousStatus === 'playing' ? 'paused' : previousStatus);
        }
    }

    private _handleEnded(): void {
        this._callbacks?.updateStatus('ended');
        this._emitter?.emit('ended', undefined as unknown as void);
    }

    private _handleError(event: Event): void {
        const videoElement = event.target as HTMLVideoElement;
        const mediaError = videoElement.error;

        if (!mediaError || !this._retryManager) {
            return;
        }

        const playbackError = this._retryManager.handleMediaError(mediaError.code);

        if (!playbackError.recoverable) {
            this._callbacks?.setState({ errorInfo: playbackError });
            this._callbacks?.updateStatus('error');
            this._emitter?.emit('error', playbackError);
        }
    }

    private _handleTimeUpdate(): void {
        if (!this._videoElement) {
            return;
        }

        const currentTimeMs = Math.round(this._videoElement.currentTime * 1000);
        const durationMs = isFinite(this._videoElement.duration)
            ? Math.round(this._videoElement.duration * 1000)
            : this._callbacks?.getState().durationMs || 0;

        this._callbacks?.setState({ currentTimeMs, durationMs });

        this._emitter?.emit('timeUpdate', { currentTimeMs, durationMs });
    }

    private _handleProgress(): void {
        if (!this._videoElement) {
            return;
        }

        const buffered = this._videoElement.buffered;
        const duration = this._videoElement.duration || 1;
        const bufferedRanges: TimeRange[] = [];

        let bufferedEnd = 0;
        for (let i = 0; i < buffered.length; i++) {
            const start = buffered.start(i);
            const end = buffered.end(i);
            bufferedRanges.push({
                startMs: Math.round(start * 1000),
                endMs: Math.round(end * 1000),
            });
            if (end > bufferedEnd) {
                bufferedEnd = end;
            }
        }

        const bufferPercent = Math.round((bufferedEnd / duration) * 100);
        this._callbacks?.setState({ bufferPercent });

        this._emitter?.emit('bufferUpdate', { percent: bufferPercent, bufferedRanges });
    }

    private _handleWaiting(): void {
        const state = this._callbacks?.getState();
        if (state?.status === 'playing') {
            this._callbacks?.updateStatus('buffering');
        }
    }

    private _handleLoadedMetadata(): void {
        if (!this._videoElement) {
            return;
        }

        const state = this._callbacks?.getState();
        const descriptor = state?.currentDescriptor;

        const durationMs = isFinite(this._videoElement.duration)
            ? Math.round(this._videoElement.duration * 1000)
            : descriptor?.durationMs || 0;

        this._callbacks?.setState({ durationMs });

        if (descriptor) {
            this._emitter?.emit('mediaLoaded', {
                durationMs,
                tracks: {
                    audio: descriptor.audioTracks,
                    subtitle: descriptor.subtitleTracks,
                },
            });
        }
    }
}
