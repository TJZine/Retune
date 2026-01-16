/**
 * @fileoverview Audio track management for Video Player.
 * Extracted to reduce VideoPlayer.ts file length.
 * @module modules/player/AudioTrackManager
 * @version 1.0.0
 */

import type { AudioTrack, PlaybackError } from './types';
import { PlayerErrorCode as ErrorCode } from './types';
import { AUDIO_TRACK_SWITCH_TIMEOUT_MS } from './constants';
import { SUPPORTED_AUDIO_CODECS } from '../plex/stream/constants';
import { isStoredTrue, safeLocalStorageGet } from '../../utils/storage';
import { RETUNE_STORAGE_KEYS } from '../../config/storageKeys';

// ============================================
// Type Augmentation for AudioTrackList
// ============================================

/**
 * Interface for audio track in HTMLVideoElement.
 * Not all browsers support this - used for HLS audio track switching.
 */
export interface WebOSAudioTrack {
    id: string;
    enabled: boolean;
    kind: string;
    label: string;
    language: string;
}

/**
 * Interface for audio track list in HTMLVideoElement.
 */
export interface WebOSAudioTrackList {
    length: number;
    [index: number]: WebOSAudioTrack | undefined;
}

/**
 * Extended HTMLVideoElement interface for webOS.
 */
export interface HTMLVideoElementWithAudioTracks extends HTMLVideoElement {
    audioTracks?: WebOSAudioTrackList;
}

// ============================================
// Constants
// ============================================

/** Maximum retry attempts for audio track switch */
const AUDIO_TRACK_MAX_RETRIES = 1;

/** Polling interval for track switch verification */
const TRACK_SWITCH_POLL_INTERVAL_MS = 100;


// ============================================
// Audio Track Manager Class
// ============================================

/**
 * Manages audio track switching with retry logic.
 */
export class AudioTrackManager {
    /** Reference to the video element */
    private _videoElement: HTMLVideoElement | null = null;

    /** Available audio tracks */
    private _tracks: AudioTrack[] = [];

    /** Currently active track ID */
    private _activeTrackId: string | null = null;

    /**
     * Initialize with a video element.
     */
    public initialize(videoElement: HTMLVideoElement): void {
        this._videoElement = videoElement;
    }

    /**
     * Set available audio tracks.
     */
    public setTracks(tracks: AudioTrack[]): void {
        this._tracks = tracks;
        // Set first track as active if none set
        if (!this._activeTrackId && tracks.length > 0) {
            const defaultTrack = tracks.find((t) => t.default) || tracks[0];
            if (defaultTrack) {
                this._activeTrackId = defaultTrack.id;
            }
        }
    }

    /**
     * Get available audio tracks.
     */
    public getTracks(): AudioTrack[] {
        return [...this._tracks];
    }

    /**
     * Get active track ID.
     */
    public getActiveTrackId(): string | null {
        return this._activeTrackId;
    }

    /**
     * Switch to a different audio track with retry-on-failure.
     * @param trackId - Target track ID
     * @throws PlaybackError if switch fails (TRACK_NOT_FOUND, CODEC_UNSUPPORTED, TRACK_SWITCH_TIMEOUT, TRACK_SWITCH_FAILED)
     */
    public async switchTrack(trackId: string): Promise<void> {
        if (!this._videoElement) {
            throw this._createError(ErrorCode.TRACK_NOT_FOUND, 'Video element not initialized');
        }

        const targetTrack = this._tracks.find((t) => t.id === trackId);
        if (!targetTrack) {
            throw this._createError(ErrorCode.TRACK_NOT_FOUND, `Audio track ${trackId} not found`);
        }

        // Check codec support before attempting switch
        if (targetTrack.codec && !this._isCodecSupported(targetTrack.codec)) {
            throw this._createError(
                ErrorCode.CODEC_UNSUPPORTED,
                `Audio codec '${targetTrack.codec}' is not supported`
            );
        }

        const videoWithTracks = this._videoElement as HTMLVideoElementWithAudioTracks;
        const audioTracks = videoWithTracks.audioTracks;

        if (!audioTracks || audioTracks.length === 0) {
            // No native audio tracks - just update state
            this._activeTrackId = trackId;
            return;
        }

        const previousTrackId = this._activeTrackId;
        let lastError: PlaybackError | null = null;
        let isTimeoutError = false;

        // Try with retry
        for (let attempt = 0; attempt <= AUDIO_TRACK_MAX_RETRIES; attempt++) {
            try {
                await this._switchWithTimeout(audioTracks, targetTrack);
                this._activeTrackId = trackId;
                return;
            } catch (error) {
                lastError = error as PlaybackError;

                // Don't retry timeout errors - preserve the timeout error
                if ((error as PlaybackError).code === ErrorCode.TRACK_SWITCH_TIMEOUT) {
                    isTimeoutError = true;
                    break;
                }

                // Log retry
                if (attempt < AUDIO_TRACK_MAX_RETRIES) {
                    console.warn(`[AudioTrackManager] Retrying track switch (attempt ${attempt + 1})`);
                }
            }
        }

        // Failed after retries - try to restore previous track
        if (previousTrackId && previousTrackId !== trackId) {
            try {
                await this._restoreTrack(audioTracks, previousTrackId);
            } catch (restoreError) {
                console.error('[AudioTrackManager] Failed to restore previous track:', restoreError);
            }
        }

        // If it was a timeout error, throw TRACK_SWITCH_TIMEOUT (not TRACK_SWITCH_FAILED)
        if (isTimeoutError && lastError) {
            throw lastError;
        }

        // Throw TRACK_SWITCH_FAILED after retry for non-timeout errors
        throw this._createError(
            ErrorCode.TRACK_SWITCH_FAILED,
            `Failed to switch to audio track ${trackId} after retry`,
            lastError
        );
    }

    /**
     * Clear tracks on unload.
     */
    public unload(): void {
        this._tracks = [];
        this._activeTrackId = null;
    }

    /**
     * Destroy the manager.
     */
    public destroy(): void {
        this._videoElement = null;
        this._tracks = [];
        this._activeTrackId = null;
    }

    // ========================================
    // Private Methods
    // ========================================

    /**
     * Check if an audio codec is supported.
     */
    private _isCodecSupported(codec: string): boolean {
        const normalizedCodec = codec.toLowerCase().trim();
        if (normalizedCodec === 'dts' || normalizedCodec === 'dca' || normalizedCodec.startsWith('dts')) {
            return isStoredTrue(safeLocalStorageGet(RETUNE_STORAGE_KEYS.DTS_PASSTHROUGH));
        }
        return SUPPORTED_AUDIO_CODECS.some(
            (supported) => normalizedCodec === supported || normalizedCodec.startsWith(supported)
        );
    }

    /**
     * Switch track with timeout.
     */
    private async _switchWithTimeout(
        audioTracks: WebOSAudioTrackList,
        targetTrack: AudioTrack
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                clearInterval(checkInterval);
                reject(
                    this._createError(ErrorCode.TRACK_SWITCH_TIMEOUT, 'Audio switch timed out')
                );
            }, AUDIO_TRACK_SWITCH_TIMEOUT_MS);

            // Find and enable the target track
            for (let i = 0; i < audioTracks.length; i++) {
                const track = audioTracks[i];
                if (track) {
                    track.enabled = track.id === targetTrack.id;
                }
            }

            // Immediate check before polling - track switch may be instantaneous
            for (let i = 0; i < audioTracks.length; i++) {
                if (audioTracks[i]?.id === targetTrack.id && audioTracks[i]?.enabled) {
                    clearTimeout(timeout);
                    resolve();
                    return;
                }
            }

            // Verify switch with polling - find by ID, not index
            // AudioTrack.index is media-relative, not array-relative
            const checkInterval = setInterval(() => {
                let matchedTrack: WebOSAudioTrack | undefined;
                for (let i = 0; i < audioTracks.length; i++) {
                    if (audioTracks[i]?.id === targetTrack.id) {
                        matchedTrack = audioTracks[i];
                        break;
                    }
                }
                if (matchedTrack?.enabled) {
                    clearTimeout(timeout);
                    clearInterval(checkInterval);
                    resolve();
                }
            }, TRACK_SWITCH_POLL_INTERVAL_MS);
        });
    }

    /**
     * Restore a previous track.
     */
    private async _restoreTrack(
        audioTracks: WebOSAudioTrackList,
        trackId: string
    ): Promise<void> {
        for (let i = 0; i < audioTracks.length; i++) {
            const track = audioTracks[i];
            if (track) {
                track.enabled = track.id === trackId;
            }
        }
    }

    /**
     * Create a PlaybackError.
     */
    private _createError(
        code: typeof ErrorCode[keyof typeof ErrorCode],
        message: string,
        cause?: PlaybackError | null
    ): PlaybackError {
        const error: PlaybackError = {
            code,
            message,
            recoverable: false,
            retryCount: 0,
        };
        if (cause) {
            error.context = { cause: cause.message };
        }
        return error;
    }
}
