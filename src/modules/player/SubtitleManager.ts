/**
 * @fileoverview Subtitle track manager for Video Player.
 * Handles creation and management of text tracks.
 * @module modules/player/SubtitleManager
 * @version 1.0.0
 */

import type { SubtitleTrack } from './types';
import { BURN_IN_SUBTITLE_FORMATS } from './constants';
import { RETUNE_STORAGE_KEYS } from '../../config/storageKeys';
import { isStoredTrue, safeLocalStorageGet } from '../../utils/storage';
import { redactSensitiveTokens } from '../../utils/redact';
import {
    looksLikeHtml,
    normalizeSubtitleToVtt,
} from './subtitleConversion';

interface SubtitleTrackContext {
    serverUri: string | null;
    authHeaders: Record<string, string>;
    onUnavailable?: () => void;
    onDeactivate?: (reason: string) => void;
}

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

    /** Subtitle fetch context (server + auth headers) */
    private _subtitleContext: SubtitleTrackContext | null = null;

    /** Load token for guarding async work */
    private _loadToken = 0;

    /** Track timers by ID */
    private _trackTimers: Map<string, number[]> = new Map();

    /** Track IDs with fallback in progress */
    private _fallbackInProgress: Set<string> = new Set();

    /** Track IDs that are ready */
    private _readyTracks: Set<string> = new Set();

    /** Blob URLs created for fallback tracks */
    private _blobUrls: Map<string, string> = new Map();

    /** Abort controllers for subtitle fetches */
    private _fallbackControllers: Map<string, AbortController> = new Map();

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
            module: 'SubtitleManager',
            event,
            ...contextFactory(),
        };
        console.warn(`[SubtitleDebug] ${JSON.stringify(entry)}`);
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
    public loadTracks(tracks: SubtitleTrack[], context?: SubtitleTrackContext): string[] {
        if (!this._videoElement) {
            console.warn('[SubtitleManager] Cannot load tracks: video element not initialized');
            return [];
        }

        // Clear any existing tracks
        this.unloadTracks();

        this._subtitleContext = context ?? null;
        this._tracks = tracks;
        this._loadToken += 1;
        const loadToken = this._loadToken;
        const burnInRequired: string[] = [];

        this._logSubtitleDebug('subtitle_tracks_discovered', () => {
            const codecCounts = tracks.reduce<Record<string, number>>((acc, track) => {
                const codec = (track.codec || track.format || 'unknown').toLowerCase();
                acc[codec] = (acc[codec] ?? 0) + 1;
                return acc;
            }, {});
            const withKeyCount = tracks.filter((t) => t.fetchableViaKey).length;
            return {
                count: tracks.length,
                codecs: codecCounts,
                withKeyCount,
                withoutKeyCount: Math.max(0, tracks.length - withKeyCount),
            };
        });

        for (const track of tracks) {
            if (this._requiresBurnIn(track.format)) {
                burnInRequired.push(track.id);
                continue;
            }

            // Create track element for text-based subtitles (key-based or ID-based fetch)
            if (track.isTextCandidate && (track.fetchableViaKey || track.id)) {
                const directUrl = this._buildDirectTrackUrl(track);
                if (!directUrl) {
                    this._logSubtitleDebug('subtitle_track_error', () => ({
                        id: track.id,
                        error: 'missing_context',
                        path: 'direct',
                    }));
                    continue;
                }

                const baselineTextTracks = this._videoElement.textTracks.length;
                const trackElement = this._createTrackElement(track, directUrl);
                this._videoElement.appendChild(trackElement);
                this._trackElements.set(track.id, trackElement);

                this._logSubtitleDebug('subtitle_track_attach', () => ({
                    id: track.id,
                    path: track.key ? 'direct' : 'id-fallback',
                    src: redactSensitiveTokens(trackElement.src),
                }));

                this._watchTrackReadiness(track, trackElement, 'direct', loadToken, baselineTextTracks);
            }
        }

        return burnInRequired;
    }

    /**
     * Unload all subtitle tracks.
     */
    public unloadTracks(): void {
        this._loadToken += 1;
        this._clearPendingTrackState();
        // Remove track elements from DOM
        for (const element of this._trackElements.values()) {
            element.remove();
        }
        this._trackElements.clear();

        this._tracks = [];
        this._activeTrackId = null;
        this._subtitleContext = null;
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
                track.mode = 'hidden';
            }
        }

        this._activeTrackId = trackId;

        if (trackId && this._readyTracks.has(trackId)) {
            this._applyTrackModeShowing(trackId);
        }

        this._logSubtitleDebug('setActiveTrack', () => ({
            activeTrackId: trackId,
            nativeTextTracks: this._snapshotNativeTextTracks(),
        }));
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

    private _clearPendingTrackState(): void {
        for (const timers of this._trackTimers.values()) {
            for (const timerId of timers) {
                window.clearTimeout(timerId);
            }
        }
        this._trackTimers.clear();

        for (const controller of this._fallbackControllers.values()) {
            controller.abort();
        }
        this._fallbackControllers.clear();

        for (const blobUrl of this._blobUrls.values()) {
            try {
                URL.revokeObjectURL(blobUrl);
            } catch {
                // ignore
            }
        }
        this._blobUrls.clear();
        this._fallbackInProgress.clear();
        this._readyTracks.clear();
    }

    private _storeTrackTimer(trackId: string, timerId: number): void {
        const existing = this._trackTimers.get(trackId) ?? [];
        existing.push(timerId);
        this._trackTimers.set(trackId, existing);
    }

    private _clearTrackTimers(trackId: string): void {
        const timers = this._trackTimers.get(trackId);
        if (!timers) return;
        for (const timerId of timers) {
            window.clearTimeout(timerId);
        }
        this._trackTimers.delete(trackId);
    }

    private _getAuthTokenFromHeaders(headers: Record<string, string>): string | null {
        const token = headers['X-Plex-Token'] ?? headers['x-plex-token'];
        return typeof token === 'string' && token.length > 0 ? token : null;
    }

    private _buildDirectTrackUrl(track: SubtitleTrack): string | null {
        try {
            const baseUri = this._subtitleContext?.serverUri ?? null;
            let url: URL;
            if (track.key) {
                url = new URL(track.key, baseUri ?? undefined);
            } else {
                if (!baseUri) return null;
                const path = `/library/streams/${encodeURIComponent(track.id)}`;
                url = new URL(path, baseUri);
            }
            const authHeaders = this._subtitleContext?.authHeaders;
            if (authHeaders) {
                const token = this._getAuthTokenFromHeaders(authHeaders);
                if (token && !url.searchParams.has('X-Plex-Token')) {
                    url.searchParams.set('X-Plex-Token', token);
                }
            }
            return url.toString();
        } catch {
            return null;
        }
    }

    private _watchTrackReadiness(
        track: SubtitleTrack,
        trackElement: HTMLTrackElement,
        path: 'direct' | 'blob',
        loadToken: number,
        baselineTextTracks: number
    ): void {
        const onLoad = (): void => {
            if (loadToken !== this._loadToken) return;
            this._checkTrackReady(track, trackElement, path, baselineTextTracks);
        };
        const onError = (): void => {
            if (loadToken !== this._loadToken) return;
            this._logSubtitleDebug('subtitle_track_error', () => ({
                id: track.id,
                path,
                error: 'track_error',
                nativeTextTracks: this._snapshotNativeTextTracks(),
            }));
            void this._triggerFallback(track, 'track_error', loadToken);
        };

        trackElement.addEventListener('load', onLoad);
        trackElement.addEventListener('error', onError);

        const loadTimeoutId = window.setTimeout(() => {
            if (loadToken !== this._loadToken) return;
            if (this._readyTracks.has(track.id)) return;
            const textTracksLength = this._videoElement?.textTracks.length ?? 0;
            const reason = textTracksLength <= baselineTextTracks
                ? 'texttracks_unchanged'
                : 'load_timeout';
            void this._triggerFallback(track, reason, loadToken);
        }, 2000);
        this._storeTrackTimer(track.id, loadTimeoutId);

        const cueTimeoutId = window.setTimeout(() => {
            if (loadToken !== this._loadToken) return;
            if (this._readyTracks.has(track.id)) return;
            const cuesLength = trackElement.track?.cues?.length ?? 0;
            if (cuesLength === 0) {
                void this._triggerFallback(track, 'no_cues', loadToken);
                return;
            }
            const textTracksLength = this._videoElement?.textTracks.length ?? 0;
            this._markTrackReady(track, path, textTracksLength, cuesLength);
        }, 3000);
        this._storeTrackTimer(track.id, cueTimeoutId);
    }

    private _checkTrackReady(
        track: SubtitleTrack,
        trackElement: HTMLTrackElement,
        path: 'direct' | 'blob',
        baselineTextTracks: number
    ): void {
        const textTracksLength = this._videoElement?.textTracks.length ?? 0;
        const cuesLength = trackElement.track?.cues?.length ?? 0;
        if (textTracksLength > baselineTextTracks && cuesLength > 0) {
            this._markTrackReady(track, path, textTracksLength, cuesLength);
        }
    }

    private _markTrackReady(
        track: SubtitleTrack,
        path: 'direct' | 'blob',
        textTracksLength: number,
        cuesLength: number
    ): void {
        if (this._readyTracks.has(track.id)) return;
        this._readyTracks.add(track.id);
        this._clearTrackTimers(track.id);
        this._logSubtitleDebug('subtitle_track_ready', () => ({
            id: track.id,
            path,
            textTracksLength,
            cuesLength,
            nativeTextTracks: this._snapshotNativeTextTracks(),
        }));
        if (this._activeTrackId === track.id) {
            this._applyTrackModeShowing(track.id);
        }
    }

    private async _triggerFallback(
        track: SubtitleTrack,
        reason: string,
        loadToken: number
    ): Promise<void> {
        if (this._fallbackInProgress.has(track.id)) return;
        if (this._readyTracks.has(track.id)) return;
        if (loadToken !== this._loadToken) return;
        this._fallbackInProgress.add(track.id);
        // Prevent stale timers from triggering duplicate fallback attempts.
        this._clearTrackTimers(track.id);
        this._logSubtitleDebug('subtitle_fallback_used', () => ({
            id: track.id,
            reason,
        }));

        const blobUrl = await this._fetchFallbackBlobUrl(track, loadToken);
        if (loadToken !== this._loadToken) {
            this._fallbackInProgress.delete(track.id);
            return;
        }
        if (!blobUrl) {
            this._fallbackInProgress.delete(track.id);
            this._handleFallbackFailure(track, reason);
            return;
        }

        this._replaceTrackElement(track, blobUrl, loadToken);
        this._fallbackInProgress.delete(track.id);
    }

    private async _fetchFallbackBlobUrl(
        track: SubtitleTrack,
        loadToken: number
    ): Promise<string | null> {
        const urlString = this._buildDirectTrackUrl(track);
        if (!urlString) {
            this._logSubtitleDebug('subtitle_fetch_error', () => ({
                id: track.id,
                error: 'missing_context',
            }));
            return null;
        }
        let url: URL;
        try {
            url = new URL(urlString);
        } catch {
            this._logSubtitleDebug('subtitle_fetch_error', () => ({
                id: track.id,
                error: 'invalid_url',
            }));
            return null;
        }

        const controller = new AbortController();
        this._fallbackControllers.set(track.id, controller);

        try {
            const response = await fetch(url.toString(), {
                headers: {
                    Accept: 'text/vtt, text/plain, */*',
                    ...(this._subtitleContext?.authHeaders ?? {}),
                },
                signal: controller.signal,
            });
            if (loadToken !== this._loadToken) return null;
            if (!response.ok) {
                this._logSubtitleDebug('subtitle_fetch_error', () => ({
                    id: track.id,
                    status: response.status,
                    url: redactSensitiveTokens(url.toString()),
                }));
                return null;
            }
            const raw = await response.text();
            if (looksLikeHtml(raw)) {
                this._logSubtitleDebug('subtitle_fetch_error', () => ({
                    id: track.id,
                    error: 'html_response',
                    url: redactSensitiveTokens(url.toString()),
                }));
                return null;
            }
            const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
            const converted = normalizeSubtitleToVtt(raw);
            const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
            const durationMs = Math.max(0, Math.round(end - start));
            this._logSubtitleDebug('subtitle_conversion_result', () => ({
                id: track.id,
                format: converted.format,
                bytes: converted.vtt.length,
                durationMs,
                success: true,
            }));

            const existing = this._blobUrls.get(track.id);
            if (existing) {
                try {
                    URL.revokeObjectURL(existing);
                } catch {
                    // ignore
                }
                this._blobUrls.delete(track.id);
            }

            const blob = new Blob([converted.vtt], { type: 'text/vtt' });
            const blobUrl = URL.createObjectURL(blob);
            this._blobUrls.set(track.id, blobUrl);
            return blobUrl;
        } catch (error) {
            if (loadToken !== this._loadToken) return null;
            const message = error instanceof Error ? error.message : String(error);
            this._logSubtitleDebug('subtitle_fetch_error', () => ({
                id: track.id,
                error: message,
                url: redactSensitiveTokens(url.toString()),
            }));
            return null;
        } finally {
            this._fallbackControllers.delete(track.id);
        }
    }

    private _replaceTrackElement(track: SubtitleTrack, src: string, loadToken: number): void {
        if (!this._videoElement || loadToken !== this._loadToken) return;
        const existing = this._trackElements.get(track.id);
        if (existing) {
            existing.remove();
        }
        const baselineTextTracks = this._videoElement.textTracks.length;
        const trackElement = this._createTrackElement(track, src);
        this._videoElement.appendChild(trackElement);
        this._trackElements.set(track.id, trackElement);
        this._logSubtitleDebug('subtitle_track_attach', () => ({
            id: track.id,
            path: 'blob',
            src: redactSensitiveTokens(trackElement.src),
        }));
        this._watchTrackReadiness(track, trackElement, 'blob', loadToken, baselineTextTracks);
    }

    private _notifySubtitleUnavailable(): void {
        const handler = this._subtitleContext?.onUnavailable;
        if (handler) {
            handler();
        }
    }

    private _notifySubtitleDeactivated(reason: string): void {
        const handler = this._subtitleContext?.onDeactivate;
        if (handler) {
            handler(reason);
        }
    }

    private _handleFallbackFailure(track: SubtitleTrack, reason: string): void {
        const isSelected = this._activeTrackId === track.id;
        if (!isSelected) {
            return;
        }
        this.setActiveTrack(null);
        this._notifySubtitleUnavailable();
        this._notifySubtitleDeactivated(reason);
    }

    private _applyTrackModeShowing(trackId: string): void {
        if (!this._videoElement) return;
        const textTracks = this._videoElement.textTracks;
        for (let i = 0; i < textTracks.length; i++) {
            const track = textTracks[i];
            if (!track) continue;
            track.mode = track.id === trackId ? 'showing' : 'hidden';
        }
    }

    /**
     * Create a track element for a subtitle track.
     * @param track - Subtitle track info
     * @returns HTMLTrackElement
     */
    private _createTrackElement(track: SubtitleTrack, src: string): HTMLTrackElement {
        const trackElement = document.createElement('track');
        trackElement.id = track.id;
        // 'forced' is not a valid HTMLTrackElement.kind value - use 'subtitles'
        // Valid values: subtitles, captions, descriptions, chapters, metadata
        trackElement.kind = 'subtitles';
        trackElement.src = src;
        trackElement.srclang = track.languageCode;
        trackElement.label = track.label || track.language;
        if (track.default) {
            trackElement.default = true;
        }
        // Store forced flag in dataset for internal tracking
        if (track.forced) {
            trackElement.dataset.forced = 'true';
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

}
