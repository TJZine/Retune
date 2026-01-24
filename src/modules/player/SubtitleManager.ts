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
    itemKey?: string;
    sessionId?: string;
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
        } else if (trackId) {
            // Avoid prefetching/transforming every subtitle track on load.
            // Only attempt the expensive fetch+convert fallback for the user-selected track.
            const selected = this._tracks.find((t) => t.id === trackId) ?? null;
            if (selected && selected.isTextCandidate) {
                const codec = (selected.codec || selected.format || '').toLowerCase();
                // Native track rendering expects WebVTT; SRT/other text formats require conversion.
                if (codec !== 'vtt' && codec !== 'webvtt') {
                    void this._triggerFallback(selected, 'selected', this._loadToken);
                }
            }
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
        // Only fetch/convert subtitles for the currently selected track.
        // Otherwise, loadTracks() would eagerly fetch+convert every available language track.
        if (this._activeTrackId !== track.id) return;
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
            let lastAttempt: string = 'init';
            let lastAttemptUrl: string = url.toString();

            const tokenFromHeaders = ((): string | null => {
                const headers = this._subtitleContext?.authHeaders ?? null;
                if (!headers) return null;
                return this._getAuthTokenFromHeaders(headers);
            })();

            const baseAcceptHeader = { Accept: 'text/vtt, text/plain, */*' };

            const attempts: Array<{
                name: 'query' | 'header' | 'query_download' | 'header_download';
                url: URL;
                headers: Record<string, string>;
            }> = [
                { name: 'query', url, headers: baseAcceptHeader },
            ];

            if (tokenFromHeaders) {
                // Some PMS setups accept token-in-header but reject token-in-query for /library/streams/*.
                // Keep query-first to avoid extra preflight work, then retry with token header.
                const headerUrl = new URL(url.toString());
                headerUrl.searchParams.delete('X-Plex-Token');
                headerUrl.searchParams.delete('X-Plex-token');
                attempts.push({
                    name: 'header',
                    url: headerUrl,
                    headers: { ...baseAcceptHeader, 'X-Plex-Token': tokenFromHeaders },
                });

                const queryDownloadUrl = new URL(url.toString());
                if (!queryDownloadUrl.searchParams.has('download')) {
                    queryDownloadUrl.searchParams.set('download', '1');
                }
                attempts.push({ name: 'query_download', url: queryDownloadUrl, headers: baseAcceptHeader });

                const headerDownloadUrl = new URL(headerUrl.toString());
                if (!headerDownloadUrl.searchParams.has('download')) {
                    headerDownloadUrl.searchParams.set('download', '1');
                }
                attempts.push({
                    name: 'header_download',
                    url: headerDownloadUrl,
                    headers: { ...baseAcceptHeader, 'X-Plex-Token': tokenFromHeaders },
                });
            }

            let raw: string | null = null;
            for (const attempt of attempts) {
                lastAttempt = attempt.name;
                lastAttemptUrl = attempt.url.toString();
                const response = await fetch(attempt.url.toString(), {
                    headers: attempt.headers,
                    signal: controller.signal,
                });
                if (loadToken !== this._loadToken) return null;
                if (!response.ok) {
                    this._logSubtitleDebug('subtitle_fetch_error', () => ({
                        id: track.id,
                        status: response.status,
                        attempt: attempt.name,
                        url: redactSensitiveTokens(attempt.url.toString()),
                    }));
                    continue;
                }
                raw = await response.text();
                if (loadToken !== this._loadToken) return null;
                break;
            }

            // Some PMS setups return 501 for keyless subtitle streams via /library/streams/{id}.
            // As a last resort, ask PMS to extract/transcode the selected subtitle stream.
            if (!raw) {
                const transcodeUrl = this._buildSubtitleTranscodeUrl(track, tokenFromHeaders);
                if (transcodeUrl) {
                    lastAttempt = 'transcode_subtitles';
                    lastAttemptUrl = transcodeUrl.toString();
                    try {
                        raw = await this._fetchSubtitleTextWithFallbacks(
                            transcodeUrl,
                            baseAcceptHeader,
                            controller.signal,
                            loadToken,
                            track.id
                        );
                        if (!raw) {
                            return null;
                        }
                    } catch (error) {
                        if (loadToken !== this._loadToken) return null;
                        const message = error instanceof Error ? error.message : String(error);
                        this._logSubtitleDebug('subtitle_fetch_error', () => ({
                            id: track.id,
                            error: message,
                            attempt: 'transcode_subtitles_exception',
                            url: redactSensitiveTokens(transcodeUrl.toString()),
                        }));
                        return null;
                    }
                }
            }

            if (!raw) return null;
            if (looksLikeHtml(raw)) {
                this._logSubtitleDebug('subtitle_fetch_error', () => ({
                    id: track.id,
                    error: 'html_response',
                    attempt: lastAttempt,
                    url: redactSensitiveTokens(lastAttemptUrl),
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

    /**
     * Fetch subtitle text, with a best-effort XHR fallback for environments where `fetch()`
     * can fail on large/chunked responses (seen on some webOS Chromium builds).
     */
    private async _fetchSubtitleTextWithFallbacks(
        url: URL,
        headers: Record<string, string>,
        signal: AbortSignal,
        loadToken: number,
        trackId: string
    ): Promise<string | null> {
        const urlsToTry: Array<{ variant: 'primary' | 'lan_http'; url: URL }> = [{ variant: 'primary', url }];
        const lanHttp = this._deriveLanHttpUrl(url);
        if (lanHttp) {
            const lan = lanHttp.toString();
            const primary = url.toString();
            if (lan !== primary) {
                urlsToTry.push({ variant: 'lan_http', url: lanHttp });
            }
        }

        for (const entry of urlsToTry) {
            const suffix = entry.variant === 'lan_http' ? '_lan_http' : '';
            try {
                const response = await fetch(entry.url.toString(), { headers, signal });
                if (loadToken !== this._loadToken) return null;
                if (!response.ok) {
                    let bodySample: string | null = null;
                    let contentType: string | null = null;
                    try {
                        contentType = response.headers.get('content-type');
                        const rawText = await response.text();
                        bodySample = rawText.slice(0, 200);
                    } catch {
                        // ignore
                    }
                    this._logSubtitleDebug('subtitle_fetch_error', () => ({
                        id: trackId,
                        status: response.status,
                        attempt: (`transcode_subtitles${suffix}`) as string,
                        url: redactSensitiveTokens(entry.url.toString()),
                        ...(contentType ? { contentType } : {}),
                        ...(bodySample ? { bodySample } : {}),
                    }));
                } else {
                    return await response.text();
                }
            } catch (error) {
                if (loadToken !== this._loadToken) return null;

                // If fetch fails (e.g. ERR_INCOMPLETE_CHUNKED_ENCODING), try XHR which can behave differently
                // on older embedded Chromium stacks.
                const message = error instanceof Error ? error.message : String(error);
                this._logSubtitleDebug('subtitle_fetch_error', () => ({
                    id: trackId,
                    error: message,
                    attempt: (`transcode_subtitles_fetch_failed${suffix}`) as string,
                    url: redactSensitiveTokens(entry.url.toString()),
                }));

                const xhrText = await this._xhrGetText(entry.url.toString(), headers, signal, loadToken, trackId);
                if (xhrText) return xhrText;
            }
        }

        return null;
    }

    private _xhrGetText(
        url: string,
        headers: Record<string, string>,
        signal: AbortSignal,
        loadToken: number,
        trackId: string
    ): Promise<string | null> {
        return new Promise((resolve) => {
            try {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                for (const [k, v] of Object.entries(headers)) {
                    try {
                        xhr.setRequestHeader(k, v);
                    } catch {
                        // Some environments restrict certain headers; ignore and proceed.
                    }
                }
                // Encourage plain text decoding.
                try {
                    xhr.overrideMimeType('text/plain; charset=utf-8');
                } catch {
                    // ignore
                }

                let settled = false;
                const finish = (value: string | null): void => {
                    if (settled) return;
                    settled = true;
                    signal.removeEventListener('abort', onAbort);
                    resolve(value);
                };

                const onAbort = (): void => {
                    try {
                        xhr.abort();
                    } catch {
                        // ignore
                    }
                    finish(null);
                };
                signal.addEventListener('abort', onAbort, { once: true });

                xhr.onerror = (): void => {
                    if (loadToken !== this._loadToken) {
                        finish(null);
                        return;
                    }
                    this._logSubtitleDebug('subtitle_fetch_error', () => ({
                        id: trackId,
                        attempt: 'transcode_subtitles_xhr_error',
                        status: xhr.status,
                        readyState: xhr.readyState,
                        url: redactSensitiveTokens(url),
                    }));
                    finish(null);
                };
                xhr.ontimeout = (): void => {
                    if (loadToken !== this._loadToken) {
                        finish(null);
                        return;
                    }
                    this._logSubtitleDebug('subtitle_fetch_error', () => ({
                        id: trackId,
                        attempt: 'transcode_subtitles_xhr_timeout',
                        status: xhr.status,
                        readyState: xhr.readyState,
                        url: redactSensitiveTokens(url),
                    }));
                    finish(null);
                };
                xhr.onabort = (): void => {
                    finish(null);
                };
                xhr.onload = (): void => {
                    if (loadToken !== this._loadToken) {
                        finish(null);
                        return;
                    }
                    if (xhr.status < 200 || xhr.status >= 300) {
                        const bodySample =
                            typeof xhr.responseText === 'string' && xhr.responseText.length > 0
                                ? xhr.responseText.slice(0, 200)
                                : null;
                        this._logSubtitleDebug('subtitle_fetch_error', () => ({
                            id: trackId,
                            status: xhr.status,
                            attempt: 'transcode_subtitles_xhr_status',
                            url: redactSensitiveTokens(url),
                            ...(bodySample ? { bodySample } : {}),
                        }));
                        finish(null);
                        return;
                    }
                    finish(typeof xhr.responseText === 'string' ? xhr.responseText : null);
                };

                xhr.timeout = 10000;
                xhr.send();
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                this._logSubtitleDebug('subtitle_fetch_error', () => ({
                    id: trackId,
                    attempt: 'transcode_subtitles_xhr_exception',
                    error: message,
                    url: redactSensitiveTokens(url),
                }));
                resolve(null);
            }
        });
    }

    private _deriveLanHttpUrl(original: URL): URL | null {
        try {
            // Plex "plex.direct" hostnames often embed the LAN IP as the first label:
            //   192-168-50-19.<hash>.plex.direct
            // If HTTPS+plex.direct is flaky on some webOS stacks (chunked encoding),
            // try plain HTTP to the LAN IP as a best-effort fallback.
            const hostname = original.hostname ?? '';
            if (!hostname.endsWith('.plex.direct')) return null;

            const firstLabel = hostname.split('.')[0] ?? '';
            if (!firstLabel.includes('-')) return null;
            const ip = firstLabel.split('-').join('.');
            const octets = ip.split('.');
            if (octets.length !== 4) return null;
            for (const o of octets) {
                const n = Number(o);
                if (!Number.isInteger(n) || n < 0 || n > 255) return null;
            }

            const url = new URL(original.toString());
            url.protocol = 'http:';
            url.hostname = ip;
            // Keep the same port.
            return url;
        } catch {
            return null;
        }
    }

    private _buildSubtitleTranscodeUrl(track: SubtitleTrack, token: string | null): URL | null {
        try {
            const ctx = this._subtitleContext;
            const baseUri = ctx?.serverUri ?? null;
            const itemKey = ctx?.itemKey ?? null;
            if (!baseUri || !itemKey) return null;

            const url = new URL('/video/:/transcode/universal/subtitles', baseUri);

            // Minimal required request shape (best-effort). PMS may accept additional identity params.
            url.searchParams.set('path', `/library/metadata/${itemKey}`);
            url.searchParams.set('mediaIndex', '0');
            url.searchParams.set('partIndex', '0');
            url.searchParams.set('subtitleStreamID', track.id);
            // Ask PMS for SRT (or plain text) and run conversion locally.
            // This avoids relying on PMS WebVTT conversion behavior and has been more robust in practice.
            url.searchParams.set('format', 'srt');
            url.searchParams.set('download', '1');

            if (ctx?.sessionId) {
                url.searchParams.set('X-Plex-Session-Identifier', ctx.sessionId);
                url.searchParams.set('session', ctx.sessionId);
            }

            // Prefer token in query to avoid CORS preflight and to match <video>/<track> request constraints.
            if (token) {
                url.searchParams.set('X-Plex-Token', token);
            }

            // Carry through any X-Plex-* identity headers as query params (matches how direct-play URLs are built).
            const headers = ctx?.authHeaders ?? {};
            for (const [k, v] of Object.entries(headers)) {
                if (!k.startsWith('X-Plex-')) continue;
                if (typeof v !== 'string' || v.length === 0) continue;
                // Avoid duplicating token in two casings.
                if (k.toLowerCase() === 'x-plex-token') continue;
                if (!url.searchParams.has(k)) {
                    url.searchParams.set(k, v);
                }
            }

            // Some PMS setups require a client profile name for universal transcode endpoints.
            if (!url.searchParams.has('X-Plex-Client-Profile-Name')) {
                url.searchParams.set('X-Plex-Client-Profile-Name', 'HTML TV App');
            }

            return url;
        } catch {
            return null;
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
