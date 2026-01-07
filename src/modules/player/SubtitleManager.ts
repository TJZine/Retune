/**
 * @fileoverview Subtitle track manager for Video Player.
 * Handles creation and management of text tracks.
 * @module modules/player/SubtitleManager
 * @version 1.0.0
 */

import type { SubtitleTrack } from './types';
import { BURN_IN_SUBTITLE_FORMATS, TEXT_SUBTITLE_FORMATS } from './constants';

/**
 * Manages subtitle tracks for the video player.
 * Creates and controls HTMLTrackElement instances.
 */
export class SubtitleManager {
    /** Reference to the video element */
    private _videoElement: HTMLVideoElement | null = null;

    /** Currently loaded subtitle tracks */
    private _tracks: SubtitleTrack[] = [];

    /** Map of track IDs to track elements */
    private _trackElements: Map<string, HTMLTrackElement> = new Map();

    /** Currently active track ID */
    private _activeTrackId: string | null = null;

    /**
     * Initialize the subtitle manager with a video element.
     * @param videoElement - The video element to manage subtitles for
     */
    public initialize(videoElement: HTMLVideoElement): void {
        this._videoElement = videoElement;
    }

    /**
     * Load subtitle tracks for the current media.
     * Creates track elements for text-based formats.
     * @param tracks - Array of subtitle tracks to load
     * @returns Array of track IDs that require burn-in
     */
    public loadTracks(tracks: SubtitleTrack[]): string[] {
        if (!this._videoElement) {
            console.warn('[SubtitleManager] Cannot load tracks: video element not initialized');
            return [];
        }

        // Clear any existing tracks
        this.unloadTracks();

        this._tracks = tracks;
        const burnInRequired: string[] = [];

        for (const track of tracks) {
            if (this._requiresBurnIn(track.format)) {
                burnInRequired.push(track.id);
                continue;
            }

            // Create track element for text-based subtitles
            if (track.url && this._isTextFormat(track.format)) {
                const trackElement = this._createTrackElement(track);
                this._videoElement.appendChild(trackElement);
                this._trackElements.set(track.id, trackElement);
            }
        }

        return burnInRequired;
    }

    /**
     * Unload all subtitle tracks.
     */
    public unloadTracks(): void {
        // Remove track elements from DOM
        for (const element of this._trackElements.values()) {
            element.remove();
        }
        this._trackElements.clear();

        this._tracks = [];
        this._activeTrackId = null;
    }

    /**
     * Set the active subtitle track.
     * @param trackId - Track ID to activate, null to disable all
     */
    public setActiveTrack(trackId: string | null): void {
        if (!this._videoElement) {
            return;
        }

        const textTracks = this._videoElement.textTracks;

        for (let i = 0; i < textTracks.length; i++) {
            const track = textTracks[i];
            if (track) {
                if (trackId && track.id === trackId) {
                    track.mode = 'showing';
                } else {
                    track.mode = 'hidden';
                }
            }
        }

        this._activeTrackId = trackId;
    }

    /**
     * Get the currently active track ID.
     * @returns Active track ID or null
     */
    public getActiveTrackId(): string | null {
        return this._activeTrackId;
    }

    /**
     * Get all loaded subtitle tracks.
     * @returns Array of subtitle tracks
     */
    public getTracks(): SubtitleTrack[] {
        return [...this._tracks];
    }

    /**
     * Check if a format requires burn-in.
     * @param format - Subtitle format
     * @returns true if format requires burn-in
     */
    public requiresBurnIn(format: string): boolean {
        return this._requiresBurnIn(format);
    }

    /**
     * Destroy the subtitle manager.
     */
    public destroy(): void {
        this.unloadTracks();
        this._videoElement = null;
    }

    // ========================================
    // Private Methods
    // ========================================

    /**
     * Create a track element for a subtitle track.
     * @param track - Subtitle track info
     * @returns HTMLTrackElement
     */
    private _createTrackElement(track: SubtitleTrack): HTMLTrackElement {
        const trackElement = document.createElement('track');
        trackElement.id = track.id;
        trackElement.kind = track.forced ? 'forced' : 'subtitles';
        trackElement.src = track.url || '';
        trackElement.srclang = track.languageCode;
        trackElement.label = track.title || track.language;
        if (track.default) {
            trackElement.default = true;
        }

        // Start hidden (with null check for jsdom compatibility)
        if (trackElement.track) {
            trackElement.track.mode = 'hidden';
        }

        return trackElement;
    }

    /**
     * Check if a format requires burn-in (cannot be rendered natively).
     * @param format - Subtitle format
     * @returns true if format requires burn-in
     */
    private _requiresBurnIn(format: string): boolean {
        const normalizedFormat = format.toLowerCase();
        return BURN_IN_SUBTITLE_FORMATS.includes(normalizedFormat);
    }

    /**
     * Check if a format is a text-based subtitle format.
     * @param format - Subtitle format
     * @returns true if format is text-based
     */
    private _isTextFormat(format: string): boolean {
        const normalizedFormat = format.toLowerCase();
        return TEXT_SUBTITLE_FORMATS.includes(normalizedFormat);
    }
}
