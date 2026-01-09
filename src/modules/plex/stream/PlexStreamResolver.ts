/**
 * @fileoverview Plex Stream Resolver implementation.
 * Resolves playback URLs, handles direct play detection, and manages sessions.
 * @module modules/plex/stream/PlexStreamResolver
 * @version 1.0.0
 */

import { EventEmitter } from '../../../utils/EventEmitter';
import type {
    IPlexStreamResolver,
    PlexStreamResolverConfig,
    StreamResolverError,
    StreamResolverEventMap,
    SessionStartPayload,
    SessionEndPayload,
} from './interfaces';
import type {
    PlexMediaItem,
    PlexMediaFile,
    PlexStream,
    StreamRequest,
    StreamDecision,
    HlsOptions,
    PlaybackSession,
    StreamResolverState,
} from './types';
import { PlexStreamErrorCode } from './types';
import {
    SUPPORTED_CONTAINERS,
    SUPPORTED_VIDEO_CODECS,
    SUPPORTED_AUDIO_CODECS,
    MAX_RESOLUTION,
    PROGRESS_TIMEOUT_MS,
    BURN_IN_SUBTITLE_FORMATS,
    SIDECAR_SUBTITLE_FORMATS,
    WEBOS_CLIENT_PROFILE_PARTS,
    DEFAULT_HLS_OPTIONS,
} from './constants';
import { generateUUID, withTimeout } from './utils';

// Re-export types for consumers
export { PlexStreamErrorCode } from './types';

/**
 * Plex Stream Resolver implementation.
 * Resolves stream URLs and manages playback sessions.
 * @implements {IPlexStreamResolver}
 */
export class PlexStreamResolver implements IPlexStreamResolver {
    private readonly _config: PlexStreamResolverConfig;
    private readonly _emitter: EventEmitter<StreamResolverEventMap>;
    private readonly _state: StreamResolverState;

    /**
     * Create a new PlexStreamResolver instance.
     * @param config - Configuration with auth and server accessors
     */
    constructor(config: PlexStreamResolverConfig) {
        this._config = config;
        this._emitter = new EventEmitter<StreamResolverEventMap>();
        this._state = {
            activeSessions: new Map<string, PlaybackSession>(),
        };
    }

    // ========================================
    // Stream Resolution
    // ========================================

    /**
     * Resolve the best stream URL for a media item.
     * @param request - Stream request parameters
     * @returns Promise resolving to stream decision
     */
    async resolveStream(request: StreamRequest): Promise<StreamDecision> {
        // 1. Get item metadata
        const item = await this._config.getItem(request.itemKey);
        if (!item) {
            throw this._createError(
                PlexStreamErrorCode.PLAYBACK_SOURCE_NOT_FOUND,
                `Item not found: ${request.itemKey}`,
                false
            );
        }

        // 2. Select best media version
        const media = this._selectBestMedia(item.media, request.maxBitrate);
        if (!media) {
            throw this._createError(
                PlexStreamErrorCode.PLAYBACK_FORMAT_UNSUPPORTED,
                'No compatible media version found',
                false
            );
        }

        const part = media.parts[0];
        if (!part) {
            throw this._createError(
                PlexStreamErrorCode.PLAYBACK_SOURCE_NOT_FOUND,
                'No media parts available',
                false
            );
        }

        // 3. Check direct play compatibility ON THE SELECTED MEDIA VERSION
        const canDirect = this._canDirectPlayMedia(media);

        let playbackUrl: string;
        let protocol: 'hls' | 'http';
        let isTranscoding = false;
        let container: string;
        let videoCodec: string;
        let audioCodec: string;

        if (canDirect && request.directPlay !== false) {
            // Direct play
            playbackUrl = this._buildDirectPlayUrl(part.key);
            protocol = 'http';
            container = media.container;
            videoCodec = media.videoCodec;
            audioCodec = media.audioCodec;
        } else {
            // Transcode to HLS
            const maxBitrate = typeof request.maxBitrate === 'number'
                ? request.maxBitrate
                : DEFAULT_HLS_OPTIONS.maxBitrate;
            playbackUrl = this.getTranscodeUrl(request.itemKey, { maxBitrate });
            protocol = 'hls';
            isTranscoding = true;
            container = 'mpegts';
            videoCodec = 'h264';
            audioCodec = 'aac';
        }

        // 4. Find selected tracks
        const audioStream = this._findStream(
            part.streams,
            2,
            request.audioStreamId
        );
        const subtitleStream = this._findStream(
            part.streams,
            3,
            request.subtitleStreamId
        );

        // 5. Determine subtitle delivery
        const subtitleDelivery = this._getSubtitleDelivery(
            subtitleStream,
            isTranscoding
        );

        // 6. Start session
        const sessionId = await this.startSession(request.itemKey);

        // 7. Track transcoding state
        const session = this._state.activeSessions.get(sessionId);
        if (session) {
            session.isTranscoding = isTranscoding;
            session.durationMs = item.durationMs;
        }

        return {
            playbackUrl,
            protocol,
            isDirectPlay: !isTranscoding,
            isTranscoding,
            container,
            videoCodec,
            audioCodec,
            subtitleDelivery,
            sessionId,
            selectedAudioStream: audioStream,
            selectedSubtitleStream: subtitleStream,
            width: media.width,
            height: media.height,
            bitrate: isTranscoding
                ? (typeof request.maxBitrate === 'number' ? request.maxBitrate : 8000)
                : media.bitrate,
        };
    }

    // ========================================
    // Session Management
    // ========================================

    /**
     * Start a new playback session.
     * @param itemKey - ratingKey of the media item
     * @returns Promise resolving to session ID
     */
    async startSession(itemKey: string): Promise<string> {
        const sessionId = generateUUID();
        const now = Date.now();

        const session: PlaybackSession = {
            sessionId,
            itemKey,
            startedAt: now,
            durationMs: 0,
            lastReportedPositionMs: 0,
            lastReportedAt: now,
            isTranscoding: false,
        };

        this._state.activeSessions.set(sessionId, session);

        const payload: SessionStartPayload = { sessionId, itemKey };
        this._emitter.emit('sessionStart', payload);

        return sessionId;
    }

    /**
     * Report playback progress to Plex server.
     * Uses 100ms timeout budget per spec.
     * @param sessionId - Session identifier
     * @param itemKey - ratingKey of the media item
     * @param positionMs - Current playback position
     * @param state - Playback state
     */
    async updateProgress(
        sessionId: string,
        itemKey: string,
        positionMs: number,
        state: 'playing' | 'paused' | 'stopped'
    ): Promise<void> {
        // Wrap operation to return result we can check, using null as timeout sentinel
        const result = await withTimeout(
            this._reportProgress(sessionId, itemKey, positionMs, state).then(
                () => ({ completed: true as const })
            ),
            PROGRESS_TIMEOUT_MS,
            null
        );

        // SUGGESTION-002: Emit progressTimeout event for diagnostics when exceeded budget
        if (result === null) {
            this._emitter.emit('progressTimeout', { sessionId, itemKey });
        }
    }

    /**
     * Internal progress reporting (no timeout).
     */
    private async _reportProgress(
        sessionId: string,
        itemKey: string,
        positionMs: number,
        state: 'playing' | 'paused' | 'stopped'
    ): Promise<void> {
        const serverUri = this._config.getServerUri();
        if (!serverUri) {
            return;
        }

        const session = this._state.activeSessions.get(sessionId);
        const durationMs = session ? session.durationMs : 0;

        const params = new URLSearchParams({
            ratingKey: itemKey,
            key: `/library/metadata/${itemKey}`,
            state: state,
            time: String(positionMs),
            duration: String(durationMs),
            'X-Plex-Session-Identifier': sessionId,
        });

        try {
            await fetch(`${serverUri}/:/timeline?${params.toString()}`, {
                method: 'POST',
                headers: this._config.getAuthHeaders(),
            });

            // Update local session tracking
            if (session) {
                session.lastReportedPositionMs = positionMs;
                session.lastReportedAt = Date.now();
            }
        } catch (error) {
            // Swallow errors for progress reporting (fire-and-forget)
            console.warn('Failed to report progress:', error);
        }
    }

    /**
     * End a playback session.
     * @param sessionId - Session identifier
     * @param itemKey - ratingKey of the media item
     */
    async endSession(sessionId: string, itemKey: string): Promise<void> {
        const session = this._state.activeSessions.get(sessionId);
        const positionMs = session ? session.lastReportedPositionMs : 0;

        const serverUri = this._config.getServerUri();
        if (serverUri) {
            // Report stopped state
            const params = new URLSearchParams({
                ratingKey: itemKey,
                key: `/library/metadata/${itemKey}`,
                state: 'stopped',
                time: String(positionMs),
            });

            try {
                await fetch(`${serverUri}/:/timeline?${params.toString()}`, {
                    method: 'POST',
                    headers: this._config.getAuthHeaders(),
                });

                // If transcoding, stop the transcode session per spec: DELETE /transcode/sessions/{key}
                if (session && session.isTranscoding) {
                    await fetch(
                        `${serverUri}/transcode/sessions/${sessionId}`,
                        { method: 'DELETE', headers: this._config.getAuthHeaders() }
                    );
                }
            } catch (error) {
                console.warn('Error ending session:', error);
            }
        }

        // Remove from tracking
        this._state.activeSessions.delete(sessionId);

        // Emit event
        const payload: SessionEndPayload = { sessionId, itemKey, positionMs };
        this._emitter.emit('sessionEnd', payload);
    }

    // ========================================
    // Direct Play Check
    // ========================================

    /**
     * Check if a media item can be played directly without transcoding.
     * Uses the first media version for the public interface.
     * @param item - Media item to check
     * @returns true if direct play is supported
     */
    canDirectPlay(item: PlexMediaItem): boolean {
        if (!item.media || item.media.length === 0) {
            return false;
        }

        const media = item.media[0];
        if (!media) {
            return false;
        }

        return this._canDirectPlayMedia(media);
    }

    /**
     * Check if a specific media version can be played directly.
     * This is used internally after selecting the best media version.
     * @param media - Media version to check
     * @returns true if direct play is supported
     */
    private _canDirectPlayMedia(media: PlexMediaFile): boolean {
        // Check container (pre-normalized to lowercase in ResponseParser)
        if (!SUPPORTED_CONTAINERS.includes(media.container)) {
            return false;
        }

        // Check video codec (pre-normalized to lowercase in ResponseParser)
        if (!SUPPORTED_VIDEO_CODECS.includes(media.videoCodec)) {
            return false;
        }

        // Check audio codec (pre-normalized to lowercase in ResponseParser)
        if (!SUPPORTED_AUDIO_CODECS.includes(media.audioCodec)) {
            return false;
        }

        // Check resolution
        if (media.width > MAX_RESOLUTION.width || media.height > MAX_RESOLUTION.height) {
            return false;
        }

        return true;
    }

    // ========================================
    // Transcode URL
    // ========================================

    /**
     * Generate an HLS transcode URL for a media item.
     * @param itemKey - ratingKey of the media item
     * @param options - HLS transcoding options (required per SSOT)
     * @returns Full transcode URL
     */
    getTranscodeUrl(itemKey: string, options: HlsOptions): string {
        const serverUri = this._config.getServerUri();
        if (!serverUri) {
            throw this._createError(
                PlexStreamErrorCode.SERVER_UNREACHABLE,
                'No server connection available',
                true
            );
        }

        const sessionId = generateUUID();
        const clientProfile = WEBOS_CLIENT_PROFILE_PARTS.join('&');

        const maxBitrate = typeof options.maxBitrate === 'number'
            ? options.maxBitrate
            : DEFAULT_HLS_OPTIONS.maxBitrate;
        const subtitleSize = typeof options.subtitleSize === 'number'
            ? options.subtitleSize
            : DEFAULT_HLS_OPTIONS.subtitleSize;
        const audioBoost = typeof options.audioBoost === 'number'
            ? options.audioBoost
            : DEFAULT_HLS_OPTIONS.audioBoost;

        const params = new URLSearchParams({
            path: `/library/metadata/${itemKey}`,
            mediaIndex: '0',
            partIndex: '0',
            protocol: 'hls',
            fastSeek: '1',
            directPlay: '0',
            directStream: '1',
            subtitleSize: String(subtitleSize),
            audioBoost: String(audioBoost),
            maxVideoBitrate: String(maxBitrate),
            subtitles: 'burn',
            'Accept-Language': 'en',
            'X-Plex-Session-Identifier': sessionId,
            'X-Plex-Client-Profile-Extra': clientProfile,
        });

        // Add client params
        const headers = this._config.getAuthHeaders();
        const token = headers['X-Plex-Token'];
        if (token) {
            params.set('X-Plex-Token', token);
        }
        params.set('X-Plex-Client-Identifier', this._config.clientIdentifier);
        params.set('X-Plex-Platform', 'webOS');
        params.set('X-Plex-Device', 'LG Smart TV');
        params.set('X-Plex-Product', 'Retune');

        return `${serverUri}/video/:/transcode/universal/start.m3u8?${params.toString()}`;
    }

    // ========================================
    // Events
    // ========================================

    /**
     * Register event handler.
     * @param event - Event name
     * @param handler - Handler function
     */
    on(
        event: 'sessionStart',
        handler: (session: SessionStartPayload) => void
    ): void;
    on(
        event: 'sessionEnd',
        handler: (session: SessionEndPayload) => void
    ): void;
    on(event: 'error', handler: (error: StreamResolverError) => void): void;
    on(
        event: 'sessionStart' | 'sessionEnd' | 'error',
        handler:
            | ((session: SessionStartPayload) => void)
            | ((session: SessionEndPayload) => void)
            | ((error: StreamResolverError) => void)
    ): void {
        // Type assertion to handler union - EventEmitter accepts this via index signature
        type HandlerUnion = (payload: StreamResolverEventMap[keyof StreamResolverEventMap]) => void;
        this._emitter.on(event, handler as HandlerUnion);
    }

    // ========================================
    // Private: URL Building
    // ========================================

    /**
     * Build direct play URL with mixed content handling.
     * @param partKey - Media part key
     * @returns Full playback URL
     */
    private _buildDirectPlayUrl(partKey: string): string {
        const serverUri = this._config.getServerUri();
        if (!serverUri) {
            throw this._createError(
                PlexStreamErrorCode.SERVER_UNREACHABLE,
                'No server connection available',
                true
            );
        }

        // Check for mixed content issues
        const serverUrl = new URL(serverUri);
        const isAppHttps = typeof window !== 'undefined' &&
            window.location.protocol === 'https:';
        const isServerHttp = serverUrl.protocol === 'http:';

        if (isAppHttps && isServerHttp) {
            // Mixed content - try fallbacks
            const httpsConn = this._config.getHttpsConnection();
            if (httpsConn) {
                return this._buildUrlWithToken(httpsConn.uri, partKey);
            }

            const relayConn = this._config.getRelayConnection();
            if (relayConn) {
                console.warn('Using Plex relay due to mixed content restrictions');
                return this._buildUrlWithToken(relayConn.uri, partKey);
            }

            // No fallback available
            throw this._createError(
                PlexStreamErrorCode.MIXED_CONTENT_BLOCKED,
                'Cannot access HTTP server from HTTPS app - no fallback available',
                false
            );
        }

        return this._buildUrlWithToken(serverUri, partKey);
    }

    /**
     * Build URL with auth token.
     */
    private _buildUrlWithToken(baseUri: string, partKey: string): string {
        const headers = this._config.getAuthHeaders();
        const token = headers['X-Plex-Token'];
        const tokenParam = token ? `?X-Plex-Token=${token}` : '';
        return `${baseUri}${partKey}${tokenParam}`;
    }

    // ========================================
    // Private: Media Selection
    // ========================================

    /**
     * Select the best media version based on constraints.
     */
    private _selectBestMedia(
        mediaList: PlexMediaFile[],
        maxBitrate?: number
    ): PlexMediaFile | null {
        if (!mediaList || mediaList.length === 0) {
            return null;
        }

        // Filter by bitrate if specified
        let candidates = mediaList;
        if (typeof maxBitrate === 'number') {
            candidates = mediaList.filter((m) => m.bitrate <= maxBitrate);
            if (candidates.length === 0) {
                // Fall back to lowest bitrate if nothing fits
                candidates = [mediaList.reduce((a, b) =>
                    a.bitrate < b.bitrate ? a : b
                )];
            }
        }

        // Prefer highest resolution
        const sorted = [...candidates].sort((a, b) =>
            (b.width * b.height) - (a.width * a.height)
        );

        return sorted[0] || null;
    }

    /**
     * Find a stream by type and optional ID.
     */
    private _findStream(
        streams: PlexStream[],
        streamType: 1 | 2 | 3,
        streamId?: string
    ): PlexStream | null {
        if (streamId) {
            const match = streams.find(
                (s) => s.id === streamId && s.streamType === streamType
            );
            if (match) {
                return match;
            }
        }

        // Return default or first of type
        const ofType = streams.filter((s) => s.streamType === streamType);
        const defaultStream = ofType.find((s) => s.default);
        return defaultStream || ofType[0] || null;
    }

    // ========================================
    // Private: Subtitle Handling
    // ========================================

    /**
     * Determine how subtitles should be delivered.
     */
    private _getSubtitleDelivery(
        subtitle: PlexStream | null,
        isTranscoding: boolean
    ): 'embed' | 'sidecar' | 'burn' | 'none' {
        if (!subtitle) {
            return 'none';
        }

        const format = (subtitle.format || '').toLowerCase();

        // Image-based subtitles must be burned in
        if (BURN_IN_SUBTITLE_FORMATS.includes(format)) {
            return 'burn';
        }

        // Text-based subtitles can be sidecar for direct play
        if (SIDECAR_SUBTITLE_FORMATS.includes(format) && !isTranscoding) {
            return 'sidecar';
        }

        // For transcoding, server handles embedding
        if (isTranscoding) {
            return 'burn';
        }

        return 'embed';
    }

    // ========================================
    // Private: Error Handling
    // ========================================

    /**
     * Create a StreamResolverError.
     */
    private _createError(
        code: PlexStreamErrorCode,
        message: string,
        recoverable: boolean,
        retryAfterMs?: number
    ): StreamResolverError {
        const error: StreamResolverError = {
            code,
            message,
            recoverable,
        };
        if (retryAfterMs !== undefined) {
            error.retryAfterMs = retryAfterMs;
        }
        this._emitter.emit('error', error);
        return error;
    }
}
