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
import { RETUNE_STORAGE_KEYS } from '../../config/storageKeys';
import { isStoredTrue, safeLocalStorageGet } from '../../utils/storage';
import { redactSensitiveTokens } from '../../utils/redact';

// Import and re-export from ErrorHandler for backward compatibility
import { mapMediaErrorCodeToPlaybackError } from './ErrorHandler';
export { mapMediaErrorCodeToPlaybackError };

// ============================================
// Media Session Types (local "like" types for feature detection)
// ============================================

/** Playback state for Media Session API */
type MediaSessionPlaybackStateLike = 'none' | 'paused' | 'playing';

/** Actions supported by Media Session API */
type MediaSessionActionLike =
    | 'play'
    | 'pause'
    | 'stop'
    | 'seekto'
    | 'seekbackward'
    | 'seekforward';

/** Handler function for Media Session actions */
type MediaSessionActionHandlerLike = (details: unknown) => void;

/** Minimal interface matching browser MediaSession shape */
interface MediaSessionLike {
    metadata: unknown;
    playbackState: MediaSessionPlaybackStateLike;
    setActionHandler(action: MediaSessionActionLike, handler: MediaSessionActionHandlerLike | null): void;
    setPositionState?: (state: { duration: number; position: number; playbackRate: number }) => void;
}

/** List of actions we install handlers for */
const MEDIA_SESSION_ACTIONS: MediaSessionActionLike[] = [
    'play',
    'pause',
    'stop',
    'seekto',
    'seekbackward',
    'seekforward',
];

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

    /** Whether Media Session is enabled */
    private _mediaSessionEnabled: boolean = false;

    /** State change handler for Media Session updates */
    private _mediaSessionStateChangeHandler: ((state: PlaybackState) => void) | null = null;

    /** Internal state */
    private _state: VideoPlayerInternalState = this._createInitialState();

    private _isSubtitleDebugEnabled(): boolean {
        try {
            return isStoredTrue(safeLocalStorageGet(RETUNE_STORAGE_KEYS.SUBTITLE_DEBUG_LOGGING));
        } catch {
            return false;
        }
    }

    private _logSubtitleDebug(event: string, contextFactory: () => Record<string, unknown>): void {
        if (!this._isSubtitleDebugEnabled()) return;
        const entry = {
            ts: new Date().toISOString(),
            module: 'VideoPlayer',
            event,
            ...contextFactory(),
        };
        console.warn(`[SubtitleDebug] ${JSON.stringify(entry)}`);
    }

    private _handleSubtitleDeactivated(reason: string): void {
        if (this._state.activeSubtitleId === null) {
            return;
        }
        this._state.activeSubtitleId = null;
        this._logSubtitleDebug('subtitle_track_deactivated', () => ({
            reason,
        }));
        this._emitter.emit('trackChange', { type: 'subtitle', trackId: null });
        this._emitStateChange();
    }

    private _snapshotNativeTextTracks(): Array<Record<string, unknown>> {
        if (!this._videoElement) return [];
        const list = this._videoElement.textTracks;
        const result: Array<Record<string, unknown>> = [];
        for (let i = 0; i < list.length; i++) {
            const t = list[i];
            if (!t) continue;
            result.push({
                id: t.id,
                kind: t.kind,
                label: t.label,
                language: t.language,
                mode: t.mode,
                cuesLength: t.cues?.length ?? null,
                activeCuesLength: t.activeCues?.length ?? null,
            });
        }
        return result;
    }

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
            return;
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
        // webOS simulator quirk: some builds composite the video plane above HTML overlays.
        // Hide the video element until a stream is actually loaded so the UI can render.
        this._videoElement.style.display = 'none';

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
        // Release media session before tearing down event emitters
        this.releaseMediaSession();

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

        // Ensure video element is visible once we start loading media.
        this._videoElement.style.display = 'block';

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
            // Direct play - set src directly.
            // Note: Some platforms (including webOS) are picky about <source type=...> for MKV,
            // so we let the media pipeline sniff the container/codec from the URL response.
            this._videoElement.src = descriptor.url;
        }

        this._logSubtitleDebug('loadStream_src_set', () => ({
            protocol: descriptor.protocol,
            url: redactSensitiveTokens(descriptor.url),
            descriptorSubtitleTracks: descriptor.subtitleTracks.map((t) => ({
                id: t.id,
                format: t.format,
                codec: t.codec,
                languageCode: t.languageCode,
                language: t.language,
                label: t.label,
                forced: t.forced,
                default: t.default,
                fetchableViaKey: t.fetchableViaKey,
                key: t.key ? redactSensitiveTokens(t.key) : null,
            })),
        }));

        // Load subtitle tracks
        const subtitleContext = descriptor.subtitleContext
            ? {
                ...descriptor.subtitleContext,
                onDeactivate: (reason: string): void => {
                    descriptor.subtitleContext?.onDeactivate?.(reason);
                    this._handleSubtitleDeactivated(reason);
                },
            }
            : undefined;
        const burnInTracks = this._subtitleManager.loadTracks(
            descriptor.subtitleTracks,
            subtitleContext
        );
        if (burnInTracks.length > 0) {
            console.warn('[VideoPlayer] Tracks requiring burn-in:', burnInTracks);
        }
        this._logSubtitleDebug('loadStream_subtitles_loaded', () => ({
            burnInTracks,
            nativeTextTracks: this._snapshotNativeTextTracks(),
        }));

        if (descriptor.preferredSubtitleTrackId !== undefined) {
            await this.setSubtitleTrack(descriptor.preferredSubtitleTrackId ?? null);
        }

        // Load audio tracks
        this._audioTrackManager.setTracks(descriptor.audioTracks);

        // Store available tracks in state
        this._state.durationMs = descriptor.durationMs;
        this._state.activeAudioId = this._audioTrackManager.getActiveTrackId();

        // Sync media session metadata if enabled
        this._syncMediaSessionMetadata();

        // Trigger load
        this._videoElement.load();

        // Wait for canplay event with timeout (30s default)
        // Uses VideoPlayerEvents.waitForCanPlay() to avoid code duplication
        await this._eventManager.waitForCanPlay();

        this._logSubtitleDebug('canplay', () => ({
            nativeTextTracks: this._snapshotNativeTextTracks(),
        }));

        // Set start position AFTER metadata is loaded
        // CRITICAL: load() resets currentTime to 0, so we must set it after canplay
        if (descriptor.startPositionMs > 0) {
            this._videoElement.currentTime = descriptor.startPositionMs / 1000;
        }
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
        // Hide when idle to avoid covering UI with a black video plane.
        this._videoElement.style.display = 'none';

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

        // Sync media session metadata if enabled (clears metadata)
        this._syncMediaSessionMetadata();

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
            // If the caller tries to play after a stream is loaded, ensure visibility.
            if (this._state.currentDescriptor) {
                this._videoElement.style.display = 'block';
            }
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

        // Capture reference to prevent issues if destroy() is called mid-seek
        const video = this._videoElement;
        const positionSec = Math.max(0, positionMs / 1000);
        const durationSec = video.duration || Infinity;

        video.currentTime = Math.min(positionSec, durationSec);

        // Wait for seeked event with timeout
        return new Promise((resolve, reject) => {
            const SEEK_TIMEOUT_MS = 5000;
            let timeoutId: ReturnType<typeof setTimeout> | null = null;

            const cleanup = (): void => {
                if (timeoutId !== null) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
                video.removeEventListener('seeked', handler);
            };

            const handler = (): void => {
                cleanup();
                resolve();
            };

            video.addEventListener('seeked', handler);

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

        const selected = trackId
            ? this._subtitleManager.getTracks().find((t) => t.id === trackId) ?? null
            : null;
        this._logSubtitleDebug('subtitle_track_selected', () => ({
            id: trackId,
            codec: selected?.codec ?? null,
            language: selected?.language ?? null,
            fetchableViaKey: selected?.fetchableViaKey ?? null,
        }));

        this._logSubtitleDebug('setSubtitleTrack', () => ({
            trackId,
            nativeTextTracks: this._snapshotNativeTextTracks(),
        }));

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
    // Media Session
    // ========================================

    /**
     * Request media session integration.
     * Registers action handlers and syncs Now Playing metadata.
     * Idempotent: multiple calls are safe. Never throws.
     */
    public requestMediaSession(): void {
        // Idempotency guard
        if (this._mediaSessionEnabled) {
            return;
        }

        const mediaSession = this._getMediaSession();
        if (!mediaSession) {
            // Media Session not supported; do not mark as enabled
            // so future calls can retry if API becomes available
            return;
        }

        // Mark enabled only after confirming support
        this._mediaSessionEnabled = true;

        // Install action handlers (each wrapped in try/catch for quirky implementations)
        for (let i = 0; i < MEDIA_SESSION_ACTIONS.length; i++) {
            const action = MEDIA_SESSION_ACTIONS[i];
            if (action) {
                try {
                    mediaSession.setActionHandler(action, this._createActionHandler(action));
                } catch {
                    // Some browsers throw for unsupported actions; skip and continue
                }
            }
        }

        // Sync metadata immediately based on current descriptor
        this._syncMediaSessionMetadata();

        // Sync playback state immediately
        this._syncMediaSessionPlaybackState(this.getState());

        // Subscribe to stateChange events for ongoing updates.
        // Note: Position state (setPositionState) is best-effort and only updates on
        // status changes (play/pause), not continuously during playback. This is acceptable
        // as webOS does not surface a system-level scrubber for Media Session.
        this._mediaSessionStateChangeHandler = (state: PlaybackState): void => {
            this._syncMediaSessionPlaybackState(state);
        };
        this.on('stateChange', this._mediaSessionStateChangeHandler);
    }

    /**
     * Release media session integration.
     * Clears handlers, metadata, and unsubscribes from events.
     * Idempotent: multiple calls are safe.
     */
    public releaseMediaSession(): void {
        // Idempotency guard
        if (!this._mediaSessionEnabled) {
            return;
        }
        this._mediaSessionEnabled = false;

        // Unsubscribe state change handler
        if (this._mediaSessionStateChangeHandler) {
            this.off('stateChange', this._mediaSessionStateChangeHandler);
            this._mediaSessionStateChangeHandler = null;
        }

        const mediaSession = this._getMediaSession();
        if (!mediaSession) {
            return;
        }

        // Clear all action handlers
        for (let i = 0; i < MEDIA_SESSION_ACTIONS.length; i++) {
            const action = MEDIA_SESSION_ACTIONS[i];
            if (action) {
                try {
                    mediaSession.setActionHandler(action, null);
                } catch {
                    // Some browsers may throw for unsupported actions; ignore
                }
            }
        }

        // Clear metadata and playback state (wrapped for quirky implementations)
        try {
            mediaSession.metadata = null;
        } catch {
            // Ignore
        }
        try {
            mediaSession.playbackState = 'none';
        } catch {
            // Ignore
        }
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

    // ========================================
    // Private Methods - Media Session
    // ========================================

    /**
     * Get Media Session API if available and functional.
     * Uses feature detection without relying on TypeScript DOM types.
     */
    private _getMediaSession(): MediaSessionLike | null {
        // Check navigator exists
        if (typeof navigator === 'undefined') {
            return null;
        }

        // Check mediaSession exists on navigator
        if (!('mediaSession' in navigator)) {
            return null;
        }

        const candidate = (navigator as { mediaSession?: unknown }).mediaSession;

        // Validate it has the required setActionHandler method
        if (
            typeof candidate !== 'object' ||
            candidate === null ||
            typeof (candidate as { setActionHandler?: unknown }).setActionHandler !== 'function'
        ) {
            return null;
        }

        return candidate as MediaSessionLike;
    }

    /**
     * Create an action handler for a specific Media Session action.
     * Handlers never throw and guard against uninitialized player.
     */
    private _createActionHandler(action: MediaSessionActionLike): MediaSessionActionHandlerLike {
        return (details: unknown): void => {
            // Guard: if player isn't initialized, no-op
            if (!this._videoElement) {
                return;
            }

            switch (action) {
                case 'play':
                    void this.play().catch(() => { /* swallow */ });
                    break;

                case 'pause':
                    this.pause();
                    break;

                case 'stop':
                    this.stop();
                    break;

                case 'seekto': {
                    const seekTimeSec = this._extractSeekTime(details);
                    if (seekTimeSec !== null) {
                        void this.seekTo(seekTimeSec * 1000).catch(() => { /* swallow */ });
                    }
                    break;
                }

                case 'seekbackward': {
                    const offsetSec = this._extractSeekOffset(details);
                    void this.seekRelative(-offsetSec * 1000).catch(() => { /* swallow */ });
                    break;
                }

                case 'seekforward': {
                    const offsetSec = this._extractSeekOffset(details);
                    void this.seekRelative(offsetSec * 1000).catch(() => { /* swallow */ });
                    break;
                }
            }
        };
    }

    /**
     * Extract seekTime from action details.
     * Returns null if not a valid finite number.
     */
    private _extractSeekTime(details: unknown): number | null {
        if (
            typeof details === 'object' &&
            details !== null &&
            'seekTime' in details
        ) {
            const seekTime = (details as { seekTime: unknown }).seekTime;
            if (typeof seekTime === 'number' && isFinite(seekTime)) {
                return seekTime;
            }
        }
        return null;
    }

    /**
     * Extract seekOffset from action details, or use default.
     */
    private _extractSeekOffset(details: unknown): number {
        if (
            typeof details === 'object' &&
            details !== null &&
            'seekOffset' in details
        ) {
            const seekOffset = (details as { seekOffset: unknown }).seekOffset;
            if (typeof seekOffset === 'number' && isFinite(seekOffset)) {
                return seekOffset;
            }
        }
        // Use config if available and finite, else default 10 seconds
        if (
            this._config &&
            typeof this._config.seekIncrementSec === 'number' &&
            isFinite(this._config.seekIncrementSec)
        ) {
            return this._config.seekIncrementSec;
        }
        return 10;
    }

    /**
     * Sync Media Session metadata from current descriptor.
     */
    private _syncMediaSessionMetadata(): void {
        if (!this._mediaSessionEnabled) {
            return;
        }

        const mediaSession = this._getMediaSession();
        if (!mediaSession) {
            return;
        }

        const descriptor = this._state.currentDescriptor;
        if (!descriptor) {
            try {
                mediaSession.metadata = null;
            } catch {
                // Ignore
            }
            return;
        }

        // Check if MediaMetadata constructor exists
        const MediaMetadataConstructor = this._getMediaMetadataConstructor();
        if (!MediaMetadataConstructor) {
            try {
                mediaSession.metadata = null;
            } catch {
                // Ignore
            }
            return;
        }

        // Build init object
        const metadata = descriptor.mediaMetadata;
        const init: {
            title: string;
            artist?: string;
            album?: string;
            artwork?: Array<{ src: string; sizes: string; type: string }>;
        } = {
            title: metadata.title,
        };

        if (metadata.subtitle) {
            init.artist = metadata.subtitle;
        }

        if (metadata.year !== undefined) {
            init.album = String(metadata.year);
        }

        if (metadata.thumb) {
            init.artwork = [
                { src: metadata.thumb, sizes: '512x512', type: 'image/jpeg' },
            ];
        }

        try {
            mediaSession.metadata = new MediaMetadataConstructor(init);
        } catch {
            // MediaMetadata constructor can throw for invalid inputs; fall back to null
            mediaSession.metadata = null;
        }
    }

    /**
     * Get MediaMetadata constructor if available.
     */
    private _getMediaMetadataConstructor(): (new (init: unknown) => unknown) | null {
        const candidate = (globalThis as { MediaMetadata?: unknown }).MediaMetadata;
        if (typeof candidate === 'function') {
            return candidate as new (init: unknown) => unknown;
        }
        return null;
    }

    /**
     * Sync Media Session playback state from player state.
     */
    private _syncMediaSessionPlaybackState(state: PlaybackState): void {
        if (!this._mediaSessionEnabled) {
            return;
        }

        const mediaSession = this._getMediaSession();
        if (!mediaSession) {
            return;
        }

        // Map player status to media session playback state (wrapped for quirky implementations)
        try {
            if (state.status === 'playing') {
                mediaSession.playbackState = 'playing';
            } else if (state.status === 'paused') {
                mediaSession.playbackState = 'paused';
            } else {
                mediaSession.playbackState = 'none';
            }
        } catch {
            // Ignore
        }

        // Update position state if supported and applicable
        this._syncMediaSessionPositionState(state);
    }

    /**
     * Sync Media Session position state (optional API).
     */
    private _syncMediaSessionPositionState(state: PlaybackState): void {
        const mediaSession = this._getMediaSession();
        if (
            !mediaSession ||
            typeof mediaSession.setPositionState !== 'function'
        ) {
            return;
        }

        // Only set position for non-live content with valid duration
        const descriptor = this._state.currentDescriptor;
        if (!descriptor || descriptor.isLive) {
            return;
        }

        if (state.durationMs <= 0 || !isFinite(state.durationMs)) {
            return;
        }

        const duration = state.durationMs / 1000;
        let position = state.currentTimeMs / 1000;
        const playbackRate = state.playbackRate;

        // Validate all values are finite
        if (!isFinite(duration) || !isFinite(position) || !isFinite(playbackRate)) {
            return;
        }

        // Clamp position to [0, duration]
        position = Math.max(0, Math.min(position, duration));

        try {
            mediaSession.setPositionState({
                duration,
                position,
                playbackRate,
            });
        } catch {
            // Some browsers may throw for invalid values; ignore
        }
    }

}
