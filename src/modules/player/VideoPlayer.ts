/**
 * @fileoverview Video Player implementation for webOS.
 * Provides unified playback abstraction with native HLS support.
 * @module modules/player/VideoPlayer
 * @version 1.0.0
 */

import { EventEmitter } from '../../utils/EventEmitter';
import { SubtitleManager } from './SubtitleManager';
import { AudioTrackManager } from './AudioTrackManager';
import { VideoPlayerEvents } from './VideoPlayerEvents';
import { RetryManager } from './RetryManager';
import { KeepAliveManager } from './KeepAliveManager';
import type { IVideoPlayer } from './interfaces';
import type {
    VideoPlayerConfig,
    StreamDescriptor,
    PlaybackState,
    SubtitleTrack,
    AudioTrack,
    PlayerEventMap,
    PlayerStatus,
    VideoPlayerInternalState,
} from './types';
import {
    VIDEO_ELEMENT_ID,
    VIDEO_ELEMENT_STYLES,
    DEFAULT_CONFIG,
} from './constants';

// Import and re-export from ErrorHandler for backward compatibility
import { mapMediaErrorCodeToPlaybackError } from './ErrorHandler';
export { mapMediaErrorCodeToPlaybackError };

// ============================================
// VideoPlayer Class
// ============================================

/**
 * Video Player implementation for webOS platform.
 *
 * Key features:
 * - Native HLS support (no HLS.js per ADR-002)
 * - Keep-alive mechanism to prevent webOS suspension
 * - Error retry with exponential backoff
 * - Subtitle track management
 *
 * @example
 * ```typescript
 * const player = new VideoPlayer();
 * await player.initialize({ containerId: 'video-container', defaultVolume: 0.8 });
 * await player.loadStream(descriptor);
 * await player.play();
 * ```
 */
export class VideoPlayer implements IVideoPlayer {
    /** Event emitter for player events */
    private _emitter: EventEmitter<PlayerEventMap> = new EventEmitter();

    /** The video element */
    private _videoElement: HTMLVideoElement | null = null;

    /** Subtitle manager */
    private _subtitleManager: SubtitleManager = new SubtitleManager();

    /** Audio track manager */
    private _audioTrackManager: AudioTrackManager = new AudioTrackManager();

    /** Event handler manager */
    private _eventManager: VideoPlayerEvents = new VideoPlayerEvents();

    /** Retry manager */
    private _retryManager: RetryManager = new RetryManager();

    /** Keep-alive manager */
    private _keepAliveManager: KeepAliveManager = new KeepAliveManager();

    /** Player configuration */
    private _config: VideoPlayerConfig | null = null;

    /** Internal state */
    private _state: VideoPlayerInternalState = this._createInitialState();

    // ========================================
    // Lifecycle
    // ========================================

    /**
     * Initialize the video player.
     * @param config - Player configuration
     * @throws Error if container element not found
     */
    public async initialize(config: VideoPlayerConfig): Promise<void> {
        // Guard: Prevent creating multiple video elements (spec requirement)
        if (this._videoElement) {
            console.warn('[VideoPlayer] Already initialized. Call destroy() before re-initializing.');
            this.destroy();
        }

        // Apply defaults
        this._config = {
            ...DEFAULT_CONFIG,
            ...config,
        };

        // Create video element
        this._videoElement = document.createElement('video');
        this._videoElement.id = VIDEO_ELEMENT_ID;
        this._videoElement.style.cssText = VIDEO_ELEMENT_STYLES;
        this._videoElement.playsInline = true;

        // Find container and append
        const container = document.getElementById(config.containerId);
        if (!container) {
            throw new Error(`Video container not found: ${config.containerId}`);
        }
        container.appendChild(this._videoElement);

        // Initialize state first, then set volume
        this._state = this._createInitialState();
        this._videoElement.volume = Math.max(0, Math.min(1, this._config.defaultVolume));
        this._state.volume = this._videoElement.volume;

        // Initialize managers
        this._subtitleManager.initialize(this._videoElement);
        this._audioTrackManager.initialize(this._videoElement);
        this._retryManager.initialize(
            this._videoElement,
            this._config.retryAttempts,
            this._config.retryDelayMs
        );

        // Setup event listeners using event manager
        this._eventManager.attach(
            this._videoElement,
            this._emitter,
            {
                updateStatus: this._updateStatus.bind(this),
                getState: (): VideoPlayerInternalState => this._state,
                setState: (update: Partial<VideoPlayerInternalState>): void => {
                    Object.assign(this._state, update);
                },
            },
            this._retryManager
        );

        // Start keep-alive
        this._keepAliveManager.setIsPlayingCheck((): boolean => this.isPlaying());
        this._keepAliveManager.start();
    }

    /**
     * Destroy the video player.
     */
    public destroy(): void {
        // Stop managers
        this._keepAliveManager.stop();
        this._retryManager.destroy();
        this._eventManager.detach();
        this._subtitleManager.destroy();
        this._audioTrackManager.destroy();

        // Remove video element
        if (this._videoElement) {
            this._videoElement.pause();
            this._videoElement.src = '';
            this._videoElement.remove();
            this._videoElement = null;
        }

        // Remove all event handlers
        this._emitter.removeAllListeners();

        // Reset state
        this._state = this._createInitialState();
        this._config = null;
    }

    // ========================================
    // Stream Management
    // ========================================

    /**
     * Load a media stream for playback.
     * @param descriptor - Stream to load
     */
    public async loadStream(descriptor: StreamDescriptor): Promise<void> {
        if (!this._videoElement) {
            throw new Error('VideoPlayer not initialized');
        }

        // Unload any existing stream
        this.unloadStream();

        // Store descriptor
        this._state.currentDescriptor = descriptor;


        // Update status
        this._updateStatus('loading');

        // Reset retry manager
        this._retryManager.reset();
        this._retryManager.setDescriptor(descriptor);

        // Set source based on protocol
        // CRITICAL: webOS has native HLS support - DO NOT use HLS.js
        if (descriptor.protocol === 'hls') {
            // Native HLS - set src directly
            this._videoElement.src = descriptor.url;
        } else {
            // Direct play - use source element with type hint
            const source = document.createElement('source');
            source.src = descriptor.url;
            source.type = descriptor.mimeType;
            this._videoElement.appendChild(source);
        }

        // Set start position
        if (descriptor.startPositionMs > 0) {
            this._videoElement.currentTime = descriptor.startPositionMs / 1000;
        }

        // Load subtitle tracks
        const burnInTracks = this._subtitleManager.loadTracks(descriptor.subtitleTracks);
        if (burnInTracks.length > 0) {
            console.warn('[VideoPlayer] Tracks requiring burn-in:', burnInTracks);
        }

        // Load audio tracks
        this._audioTrackManager.setTracks(descriptor.audioTracks);

        // Store available tracks in state
        this._state.durationMs = descriptor.durationMs;
        this._state.activeAudioId = this._audioTrackManager.getActiveTrackId();

        // Trigger load
        this._videoElement.load();

        // Wait for canplay event with timeout (30s default)
        // Uses VideoPlayerEvents.waitForCanPlay() to avoid code duplication
        await this._eventManager.waitForCanPlay();
    }

    /**
     * Unload the current stream.
     */
    public unloadStream(): void {
        if (!this._videoElement) {
            return;
        }

        // Cancel pending retries to prevent stream resurrection
        this._retryManager.clear();
        this._retryManager.setDescriptor(null);

        // Pause and clear source
        this._videoElement.pause();

        // Remove source elements
        while (this._videoElement.firstChild) {
            this._videoElement.removeChild(this._videoElement.firstChild);
        }

        // Clear src attribute
        this._videoElement.removeAttribute('src');
        this._videoElement.load();

        // Unload subtitles
        this._subtitleManager.unloadTracks();

        // Unload audio tracks
        this._audioTrackManager.unload();

        // Reset state
        this._state.currentDescriptor = null;
        this._state.currentTimeMs = 0;
        this._state.durationMs = 0;
        this._state.bufferPercent = 0;
        this._state.activeSubtitleId = null;
        this._state.activeAudioId = null;
        this._state.errorInfo = null;

        this._updateStatus('idle');
    }

    // ========================================
    // Playback Control
    // ========================================

    /**
     * Start or resume playback.
     */
    public async play(): Promise<void> {
        if (!this._videoElement) {
            throw new Error('VideoPlayer not initialized');
        }

        try {
            await this._videoElement.play();
        } catch (error) {
            console.error('[VideoPlayer] Play failed:', error);
            throw error;
        }
    }

    /**
     * Pause playback.
     */
    public pause(): void {
        if (this._videoElement) {
            this._videoElement.pause();
        }
    }

    /**
     * Stop playback and unload stream.
     */
    public stop(): void {
        this.unloadStream();
    }

    /**
     * Seek to an absolute position.
     * @param positionMs - Target position in milliseconds
     */
    public async seekTo(positionMs: number): Promise<void> {
        if (!this._videoElement) {
            throw new Error('VideoPlayer not initialized');
        }

        const positionSec = Math.max(0, positionMs / 1000);
        const durationSec = this._videoElement.duration || Infinity;

        this._videoElement.currentTime = Math.min(positionSec, durationSec);

        // Wait for seeked event with timeout
        return new Promise((resolve, reject) => {
            const SEEK_TIMEOUT_MS = 5000;
            let timeoutId: ReturnType<typeof setTimeout> | null = null;

            const cleanup = (): void => {
                if (timeoutId) clearTimeout(timeoutId);
                this._videoElement?.removeEventListener('seeked', handler);
            };

            const handler = (): void => {
                cleanup();
                resolve();
            };

            this._videoElement?.addEventListener('seeked', handler);

            timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error('Seek operation timed out'));
            }, SEEK_TIMEOUT_MS);
        });
    }

    /**
     * Seek relative to current position.
     * @param deltaMs - Delta in milliseconds
     */
    public async seekRelative(deltaMs: number): Promise<void> {
        const currentMs = this.getCurrentTimeMs();
        const targetMs = currentMs + deltaMs;
        return this.seekTo(targetMs);
    }

    // ========================================
    // Volume Control
    // ========================================

    /**
     * Set the volume level.
     * @param level - Volume level (0.0 to 1.0)
     */
    public setVolume(level: number): void {
        if (!this._videoElement) {
            return;
        }

        // Clamp to [0, 1] - MUST NOT allow > 1.0
        const clampedLevel = Math.max(0, Math.min(1, level));
        this._videoElement.volume = clampedLevel;
        this._state.volume = clampedLevel;

        // If setting volume while muted, unmute
        if (this._state.isMuted && clampedLevel > 0) {
            this._state.isMuted = false;
            this._videoElement.muted = false;
        }

        this._emitStateChange();
    }

    /**
     * Get the current volume level.
     */
    public getVolume(): number {
        return this._state.volume;
    }

    /**
     * Mute audio.
     */
    public mute(): void {
        if (!this._videoElement) {
            return;
        }

        this._videoElement.muted = true;
        this._state.isMuted = true;
        this._emitStateChange();
    }

    /**
     * Unmute audio.
     */
    public unmute(): void {
        if (!this._videoElement) {
            return;
        }

        this._videoElement.muted = false;
        this._state.isMuted = false;
        this._emitStateChange();
    }

    /**
     * Toggle mute state.
     */
    public toggleMute(): void {
        if (this._state.isMuted) {
            this.unmute();
        } else {
            this.mute();
        }
    }

    // ========================================
    // Track Management
    // ========================================

    /**
     * Set the active subtitle track.
     * @param trackId - Track ID to activate, null to disable
     */
    public async setSubtitleTrack(trackId: string | null): Promise<void> {
        this._subtitleManager.setActiveTrack(trackId);
        this._state.activeSubtitleId = trackId;

        this._emitter.emit('trackChange', { type: 'subtitle', trackId });
        this._emitStateChange();
    }

    /**
     * Set the active audio track with retry-on-failure.
     * @param trackId - Audio track ID to activate
     * @throws PlaybackError if track not found or switch fails after retry
     */
    public async setAudioTrack(trackId: string): Promise<void> {
        if (!this._videoElement) {
            throw new Error('VideoPlayer not initialized');
        }

        // Delegate to AudioTrackManager (handles retry and error mapping)
        await this._audioTrackManager.switchTrack(trackId);

        // Update state
        this._state.activeAudioId = this._audioTrackManager.getActiveTrackId();
        this._emitter.emit('trackChange', { type: 'audio', trackId });
        this._emitStateChange();
    }

    /**
     * Get available subtitle tracks.
     */
    public getAvailableSubtitles(): SubtitleTrack[] {
        return this._subtitleManager.getTracks();
    }

    /**
     * Get available audio tracks.
     */
    public getAvailableAudio(): AudioTrack[] {
        return this._audioTrackManager.getTracks();
    }

    // ========================================
    // State
    // ========================================

    /**
     * Get current playback state.
     */
    public getState(): PlaybackState {
        return {
            status: this._state.status,
            currentTimeMs: this._state.currentTimeMs,
            durationMs: this._state.durationMs,
            bufferPercent: this._state.bufferPercent,
            volume: this._state.volume,
            isMuted: this._state.isMuted,
            playbackRate: this._state.playbackRate,
            activeSubtitleId: this._state.activeSubtitleId,
            activeAudioId: this._state.activeAudioId,
            errorInfo: this._state.errorInfo,
        };
    }

    /**
     * Get current playback position.
     */
    public getCurrentTimeMs(): number {
        if (!this._videoElement) {
            return 0;
        }
        return Math.round(this._videoElement.currentTime * 1000);
    }

    /**
     * Get media duration.
     */
    public getDurationMs(): number {
        if (!this._videoElement || !isFinite(this._videoElement.duration)) {
            return this._state.durationMs;
        }
        return Math.round(this._videoElement.duration * 1000);
    }

    /**
     * Check if media is currently playing.
     */
    public isPlaying(): boolean {
        return this._state.status === 'playing';
    }

    // ========================================
    // Events
    // ========================================

    /**
     * Register an event handler.
     */
    public on<K extends keyof PlayerEventMap>(
        event: K,
        handler: (payload: PlayerEventMap[K]) => void
    ): void {
        this._emitter.on(event, handler);
    }

    /**
     * Unregister an event handler.
     */
    public off<K extends keyof PlayerEventMap>(
        event: K,
        handler: (payload: PlayerEventMap[K]) => void
    ): void {
        this._emitter.off(event, handler);
    }

    // ========================================
    // webOS Specific
    // ========================================

    /**
     * Request media session (placeholder for future webOS media keys).
     */
    public requestMediaSession(): void {
        // TODO: Implement webOS media session API
        console.debug('[VideoPlayer] Media session requested (not yet implemented)');
    }

    /**
     * Release media session.
     */
    public releaseMediaSession(): void {
        // TODO: Implement webOS media session API
        console.debug('[VideoPlayer] Media session released (not yet implemented)');
    }


    // ========================================
    // Private Methods - State
    // ========================================

    /**
     * Create initial state object.
     */
    private _createInitialState(): VideoPlayerInternalState {
        return {
            status: 'idle',
            currentTimeMs: 0,
            durationMs: 0,
            bufferPercent: 0,
            volume: 1.0,
            isMuted: false,
            playbackRate: 1.0,
            activeSubtitleId: null,
            activeAudioId: null,
            errorInfo: null,
            currentDescriptor: null,
        };
    }

    /**
     * Update player status and emit state change.
     */
    private _updateStatus(status: PlayerStatus): void {
        if (this._state.status !== status) {
            this._state.status = status;
            this._emitStateChange();
        }
    }

    /**
     * Emit state change event.
     */
    private _emitStateChange(): void {
        this._emitter.emit('stateChange', this.getState());
    }


}
