/**
 * @fileoverview Interface definitions for Video Player module.
 * @module modules/player/interfaces
 * @version 1.0.0
 */

import type {
    VideoPlayerConfig,
    StreamDescriptor,
    PlaybackState,
    SubtitleTrack,
    AudioTrack,
    PlayerEventMap,
} from './types';

/**
 * Video Player Interface.
 * Abstraction over HTML5 video for webOS platform.
 */
export interface IVideoPlayer {
    // ========================================
    // Lifecycle
    // ========================================

    /**
     * Initialize the video player.
     * Creates video element and sets up event listeners.
     * @param config - Player configuration
     * @throws Error if container element not found
     */
    initialize(config: VideoPlayerConfig): Promise<void>;

    /**
     * Destroy the video player.
     * Cleans up video element, listeners, and timers.
     */
    destroy(): void;

    // ========================================
    // Stream Management
    // ========================================

    /**
     * Load a media stream for playback.
     * @param descriptor - Stream to load
     * @returns Promise that resolves when media is ready to play
     */
    loadStream(descriptor: StreamDescriptor): Promise<void>;

    /**
     * Unload the current stream.
     * Stops playback and clears the source.
     */
    unloadStream(): void;

    // ========================================
    // Playback Control
    // ========================================

    /**
     * Start or resume playback.
     * @returns Promise that resolves when playback starts
     */
    play(): Promise<void>;

    /**
     * Pause playback.
     */
    pause(): void;

    /**
     * Stop playback and unload stream.
     */
    stop(): void;

    /**
     * Seek to an absolute position.
     * @param positionMs - Target position in milliseconds
     * @returns Promise that resolves when seek completes
     */
    seekTo(positionMs: number): Promise<void>;

    /**
     * Seek relative to current position.
     * @param deltaMs - Delta in milliseconds (positive = forward)
     * @returns Promise that resolves when seek completes
     */
    seekRelative(deltaMs: number): Promise<void>;

    // ========================================
    // Volume Control
    // ========================================

    /**
     * Set the volume level.
     * @param level - Volume level (0.0 to 1.0)
     */
    setVolume(level: number): void;

    /**
     * Get the current volume level.
     * @returns Current volume (0.0 to 1.0)
     */
    getVolume(): number;

    /**
     * Mute audio.
     */
    mute(): void;

    /**
     * Unmute audio.
     */
    unmute(): void;

    /**
     * Toggle mute state.
     */
    toggleMute(): void;

    // ========================================
    // Track Management
    // ========================================

    /**
     * Set the active subtitle track.
     * @param trackId - Track ID to enable, null to disable
     */
    setSubtitleTrack(trackId: string | null): Promise<void>;

    /**
     * Set the active audio track.
     * @param trackId - Audio track ID to activate
     * @throws Error if track not found
     */
    setAudioTrack(trackId: string): Promise<void>;

    /**
     * Get available subtitle tracks.
     * @returns Array of subtitle tracks
     */
    getAvailableSubtitles(): SubtitleTrack[];

    /**
     * Get available audio tracks.
     * @returns Array of audio tracks
     */
    getAvailableAudio(): AudioTrack[];

    // ========================================
    // State
    // ========================================

    /**
     * Get current playback state.
     * @returns Current playback state
     */
    getState(): PlaybackState;

    /**
     * Get current playback position.
     * @returns Current time in milliseconds
     */
    getCurrentTimeMs(): number;

    /**
     * Get media duration.
     * @returns Duration in milliseconds
     */
    getDurationMs(): number;

    /**
     * Check if media is currently playing.
     * @returns true if playing
     */
    isPlaying(): boolean;

    // ========================================
    // Events
    // ========================================

    /**
     * Register an event handler.
     * @param event - Event name
     * @param handler - Callback function
     */
    on<K extends keyof PlayerEventMap>(
        event: K,
        handler: (payload: PlayerEventMap[K]) => void
    ): void;

    /**
     * Unregister an event handler.
     * @param event - Event name
     * @param handler - Callback function
     */
    off<K extends keyof PlayerEventMap>(
        event: K,
        handler: (payload: PlayerEventMap[K]) => void
    ): void;

    // ========================================
    // webOS Specific
    // ========================================

    /**
     * Request media session (for future webOS media keys).
     */
    requestMediaSession(): void;

    /**
     * Release media session.
     */
    releaseMediaSession(): void;
}
