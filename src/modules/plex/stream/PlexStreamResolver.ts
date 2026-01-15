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
    DEFAULT_HLS_OPTIONS,
} from './constants';
import { generateUUID } from './utils';

// Re-export types for consumers
export { PlexStreamErrorCode } from './types';

const isStoredTrue = (value: string | null): boolean => value === '1' || value === 'true';

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

        // 3. Start a playback session early so the same sessionId can be used for:
        // - Timeline updates (`X-Plex-Session-Identifier`)
        // - Transcoding session binding (`session` + `X-Plex-Session-Identifier`)
        const sessionId = await this.startSession(request.itemKey);

        try {
            // 4. Check direct play compatibility ON THE SELECTED MEDIA VERSION
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
                playbackUrl = this.getTranscodeUrl(request.itemKey, { maxBitrate, sessionId });
                protocol = 'hls';
                isTranscoding = true;
                container = 'mpegts';
                videoCodec = 'h264';
                audioCodec = 'aac';
            }

            // 5. Find selected tracks with audio fallback for TrueHD/DTS-HD
            const audioStream = this._selectCompatibleAudioTrack(
                part.streams,
                request.audioStreamId
            );
            const subtitleStream = this._findStream(
                part.streams,
                3,
                request.subtitleStreamId
            );

            // 6. Determine subtitle delivery
            const subtitleDelivery = this._getSubtitleDelivery(
                subtitleStream,
                isTranscoding
            );

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
        } catch (error) {
            // Avoid leaking sessions when stream resolution fails mid-flight
            const session = this._state.activeSessions.get(sessionId);
            const positionMs = session ? session.lastReportedPositionMs : 0;
            this._state.activeSessions.delete(sessionId);

            // Ensure sessionStart has a corresponding sessionEnd for consumers.
            this._emitter.emit('sessionEnd', {
                sessionId,
                itemKey: request.itemKey,
                positionMs,
            });
            throw error;
        }
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
        const status = await this._reportProgressWithBudget(sessionId, itemKey, positionMs, state);
        if (status === 'timeout') {
            this._emitter.emit('progressTimeout', { sessionId, itemKey });
        }
    }

    /**
     * Internal progress reporting with timeout budget.
     */
    private async _reportProgressWithBudget(
        sessionId: string,
        itemKey: string,
        positionMs: number,
        state: 'playing' | 'paused' | 'stopped'
    ): Promise<'ok' | 'timeout' | 'error'> {
        const serverUri = this._config.getServerUri();
        if (!serverUri) {
            return 'error';
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
            const baseUri = this._selectBaseUriForMixedContent(serverUri);
            const timelineUrl = new URL('/:/timeline', baseUri);
            timelineUrl.search = params.toString();

            await this._fetchWithTimeout(
                timelineUrl.toString(),
                { method: 'POST', headers: this._config.getAuthHeaders() },
                PROGRESS_TIMEOUT_MS
            );

            // Update local session tracking
            if (session) {
                session.lastReportedPositionMs = positionMs;
                session.lastReportedAt = Date.now();
            }
            return 'ok';
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                return 'timeout';
            }
            // Swallow errors for progress reporting (fire-and-forget)
            console.warn('Failed to report progress:', error);
            return 'error';
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
            const baseUri = this._selectBaseUriForMixedContent(serverUri);
            // Report stopped state
            const params = new URLSearchParams({
                ratingKey: itemKey,
                key: `/library/metadata/${itemKey}`,
                state: 'stopped',
                time: String(positionMs),
            });

            try {
                const timelineUrl = new URL('/:/timeline', baseUri);
                timelineUrl.search = params.toString();
                await this._fetchWithTimeout(
                    timelineUrl.toString(),
                    { method: 'POST', headers: this._config.getAuthHeaders() },
                    2000
                );

                // If transcoding, stop the transcode session per spec: DELETE /transcode/sessions/{key}
                if (session && session.isTranscoding) {
                    const stopUrl = new URL(`/transcode/sessions/${encodeURIComponent(sessionId)}`, baseUri);
                    await this._fetchWithTimeout(
                        stopUrl.toString(),
                        { method: 'DELETE', headers: this._config.getAuthHeaders() },
                        5000
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

        // webOS nuance: MKV container support is inconsistent on older webOS (Chromium 79 era).
        // For pre-webOS 23 devices, prefer Direct Stream (remux to HLS) rather than attempting MKV Direct Play.
        // This avoids "SRC_NOT_SUPPORTED" failures for MKV-heavy libraries while still allowing MKV Direct Play
        // on newer firmware/browser stacks that support it.
        if (media.container === 'mkv') {
            const isLegacyWebOs = ((): boolean => {
                try {
                    if (typeof navigator === 'undefined') return false;
                    const ua = navigator.userAgent || '';
                    if (!/Web0S|webOS/i.test(ua)) return false;
                    const chromeMatch = ua.match(/Chrome\/(\d+)/);
                    const chromeMajor = chromeMatch ? Number(chromeMatch[1]) : NaN;
                    // webOS 6.x is typically Chromium 79; webOS 23+ moves into newer Chromium.
                    return Number.isFinite(chromeMajor) && chromeMajor < 87;
                } catch {
                    return false;
                }
            })();

            // Debug logging for MKV direct play decisions
            try {
                if (isStoredTrue(localStorage.getItem('retune_debug_transcode'))) {
                    const ua = navigator?.userAgent || '';
                    const chromeMatch = ua.match(/Chrome\/(\d+)/);
                    console.warn('[PlexStreamResolver] MKV direct play check:', {
                        container: media.container,
                        isLegacyWebOs,
                        chromiumVersion: chromeMatch ? chromeMatch[1] : 'unknown',
                        willDirectPlay: !isLegacyWebOs,
                    });
                }
            } catch {
                // Ignore logging failures
            }

            if (isLegacyWebOs) {
                return false;
            }
        }

        // Check video codec (pre-normalized to lowercase in ResponseParser)
        if (!SUPPORTED_VIDEO_CODECS.includes(media.videoCodec)) {
            return false;
        }

        // Check audio codec (pre-normalized to lowercase in ResponseParser)
        const audioCodec = media.audioCodec.toLowerCase();

        // DTS passthrough requires BOTH:
        // 1. webOS 23+ (C3/C4/C5) - hardware support
        // 2. User opt-in setting - confirms they have an eARC receiver
        // Without a receiver, DTS passthrough = silent audio
        if (audioCodec === 'dts' || audioCodec === 'dca') {
            const isDtsEnabled = ((): boolean => {
                try {
                    // Check user setting first (must explicitly enable)
                    if (!isStoredTrue(localStorage.getItem('retune_enable_dts_passthrough'))) {
                        return false;
                    }
                    // Check device capability (webOS 23+ = Chromium 108+)
                    if (typeof navigator !== 'undefined') {
                        const ua = navigator.userAgent || '';
                        const chromeMatch = ua.match(/Chrome\/(\d+)/);
                        if (chromeMatch) {
                            const chromeMajor = Number(chromeMatch[1]);
                            return chromeMajor >= 108;
                        }
                    }
                    return false;
                } catch {
                    return false;
                }
            })();

            if (!isDtsEnabled) {
                return false; // DTS not enabled or device too old
            }
        } else if (!SUPPORTED_AUDIO_CODECS.includes(audioCodec)) {
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

        const baseUri = this._selectBaseUriForMixedContent(serverUri);

        const sessionId = options.sessionId ?? generateUUID();
        const maxBitrate = typeof options.maxBitrate === 'number'
            ? options.maxBitrate
            : DEFAULT_HLS_OPTIONS.maxBitrate;
        const subtitleSize = typeof options.subtitleSize === 'number'
            ? options.subtitleSize
            : DEFAULT_HLS_OPTIONS.subtitleSize;
        const audioBoost = typeof options.audioBoost === 'number'
            ? options.audioBoost
            : DEFAULT_HLS_OPTIONS.audioBoost;

        const metadataPath = itemKey.startsWith('/library/metadata/')
            ? itemKey
            : `/library/metadata/${itemKey}`;

        const compatMode = ((): boolean => {
            try {
                return localStorage.getItem('retune_transcode_compat') === '1';
            } catch {
                return false;
            }
        })();

        const getOverride = (key: string): string | null => {
            try {
                const value = localStorage.getItem(key);
                return typeof value === 'string' && value.length > 0 ? value : null;
            } catch {
                return null;
            }
        };

        const preset = getOverride('retune_transcode_preset');

        const relayOrigin = ((): string | null => {
            try {
                const relay = this._config.getRelayConnection()?.uri ?? null;
                if (!relay) return null;
                return new URL(relay).origin;
            } catch {
                return null;
            }
        })();
        const baseOrigin = ((): string | null => {
            try {
                return new URL(baseUri).origin;
            } catch {
                return null;
            }
        })();
        const location = ((): 'lan' | 'wan' | null => {
            const selectedConn = this._config.getSelectedConnection?.() ?? null;
            if (selectedConn) {
                if (selectedConn.relay) return 'wan';
                return selectedConn.local ? 'lan' : 'wan';
            }
            // Fallback: only classify as WAN if we are clearly using a relay origin.
            if (relayOrigin && baseOrigin && relayOrigin === baseOrigin) {
                return 'wan';
            }
            // Unknown: avoid misclassifying WAN as LAN.
            return null;
        })();

        const params = new URLSearchParams();
        params.set('path', metadataPath);
        params.set('mediaIndex', '0');
        params.set('partIndex', '0');
        params.set('protocol', 'hls');
        params.set('offset', '0');
        // Bind the transcoder session key to our app sessionId so we can terminate it later
        params.set('session', sessionId);
        params.set('X-Plex-Session-Identifier', sessionId);

        if (!compatMode) {
            // Default: richer set aligned with Plex examples
            params.set('fastSeek', '1');
            params.set('directPlay', '0');
            // Allow Plex to Direct Stream (copy video, transcode audio if needed) instead of forcing full transcode.
            params.set('directStream', '1');
            params.set('directStreamAudio', '1');
            params.set('subtitleSize', String(subtitleSize));
            params.set('audioBoost', String(audioBoost));
            params.set('maxVideoBitrate', String(maxBitrate));
            if (location) {
                params.set('location', location);
            }
            params.set('addDebugOverlay', '0');
            params.set('autoAdjustQuality', '0');
            params.set('mediaBufferSize', '102400');
            // Retune does not yet provide subtitle track selection. Avoid forcing burn-in, which can trigger video transcode.
            params.set('subtitles', 'none');
            params.set('Accept-Language', 'en');
        } else {
            // Compat: minimal, conservative set for older/stricter servers
            params.set('directPlay', '0');
            params.set('directStream', '1');
            params.set('maxVideoBitrate', String(maxBitrate));
            if (location) {
                params.set('location', location);
            }
        }

        // Explicitly declare capabilities to improve Direct Stream decisions (audio-only transcode, no video transcode).
        // Keep this conservative and adaptive to avoid requesting streams the device can't decode.
        const is4K = typeof window !== 'undefined' && window.screen.width >= 3840;
        const h264Level = is4K ? '51' : '42'; // Level 5.1 (4K) vs 4.2 (1080p)

        const videoEl = typeof document !== 'undefined' ? document.createElement('video') : null;
        const canPlay = (mime: string): boolean => {
            try {
                return !!videoEl && videoEl.canPlayType(mime) !== '';
            } catch {
                return false;
            }
        };

        // HEVC detection (common for 4K MKV libraries).
        const supportsHevc =
            canPlay('video/mp4; codecs="hvc1.1.6.L93.B0"') ||
            canPlay('video/mp4; codecs="hev1.1.6.L93.B0"');

        const supportsVp9 =
            canPlay('video/webm; codecs="vp9"') ||
            canPlay('video/mp4; codecs="vp09.00.10.08"');

        const supportsAv1 =
            canPlay('video/mp4; codecs="av01.0.05M.08"') ||
            canPlay('video/webm; codecs="av01.0.05M.08"');

        const videoDecoders: string[] = [`h264{profile:high&level:${h264Level}}`];
        if (supportsHevc) {
            // Plex commonly uses HEVC "level" style values like 120 (1080p) / 150 (4K).
            const hevcLevel = is4K ? '150' : '120';
            videoDecoders.push(`hevc{profile:main&level:${hevcLevel}}`);
        }
        if (supportsVp9) {
            videoDecoders.push('vp9');
        }
        if (supportsAv1) {
            videoDecoders.push('av1');
        }

        params.set(
            'X-Plex-Client-Capabilities',
            `protocols=http-live-streaming,http-mp4-streaming,http-streaming-video;videoDecoders=${videoDecoders.join(',')};audioDecoders=mp3,aac{bitrate:800000},ac3{bitrate:800000},eac3{bitrate:800000},dts{bitrate:1536000},dca{bitrate:1536000}`
        );

        // Add client params (video element requests cannot include headers, so use query params)
        const headers = this._config.getAuthHeaders();
        for (const [key, value] of Object.entries(headers)) {
            if (!key.startsWith('X-Plex-')) {
                continue;
            }
            if (typeof value !== 'string' || value.length === 0) {
                continue;
            }
            params.set(key, value);
        }

        // Optional: Force the server to use a specific built-in profile name/version (advanced).
        const forcedProfileName = getOverride('retune_transcode_profile_name');
        if (forcedProfileName) {
            params.set('X-Plex-Client-Profile-Name', forcedProfileName);
        } else {
            // Default to 'HTML TV App' for better Direct Play support on webOS
            // 'Generic' forces transcoding for almost everything.
            params.set('X-Plex-Client-Profile-Name', 'HTML TV App');
        }

        const forcedProfileVersion = getOverride('retune_transcode_profile_version');
        if (forcedProfileVersion) {
            params.set('X-Plex-Client-Profile-Version', forcedProfileVersion);
        }

        // Optional overrides for identity fields used by Plex profile matching.
        // These are intentionally narrow and only affect the transcode URL.
        const overridePlatform = getOverride('retune_transcode_platform');
        const overridePlatformVersion = getOverride('retune_transcode_platform_version');
        const overrideDevice = getOverride('retune_transcode_device');
        const overrideModel = getOverride('retune_transcode_model');
        const overrideProduct = getOverride('retune_transcode_product');
        const overrideVersion = getOverride('retune_transcode_version');
        const overrideDeviceName = getOverride('retune_transcode_device_name');

        // Presets to quickly try known-ish combinations without code changes.
        // If you find a working combo, prefer setting explicit overrides above.
        if (preset) {
            switch (preset) {
                case 'webos-lgtv':
                    params.set('X-Plex-Platform', 'webOS');
                    params.set('X-Plex-Platform-Version', '6.0');
                    params.set('X-Plex-Device', 'lgtv');
                    params.set('X-Plex-Model', 'webOS');
                    break;
                case 'webos-lg':
                    params.set('X-Plex-Platform', 'webOS');
                    params.set('X-Plex-Platform-Version', '6.0');
                    params.set('X-Plex-Device', 'LG');
                    params.set('X-Plex-Model', 'webOS');
                    break;
                case 'android':
                    params.set('X-Plex-Platform', 'Android');
                    params.set('X-Plex-Platform-Version', '12');
                    params.set('X-Plex-Device', 'Android');
                    params.set('X-Plex-Model', 'Pixel');
                    params.set('X-Plex-Product', 'Plex for Android');
                    params.set('X-Plex-Version', '9.0.0');
                    break;
                case 'plex-web':
                    params.set('X-Plex-Platform', 'Chrome');
                    params.set('X-Plex-Platform-Version', '87.0');
                    params.set('X-Plex-Device', 'Web');
                    params.set('X-Plex-Model', 'Chrome');
                    params.set('X-Plex-Product', 'Plex Web');
                    params.set('X-Plex-Version', '4.0.0');
                    break;
            }
        }

        // Explicit overrides take precedence over presets.
        if (overridePlatform) {
            params.set('X-Plex-Platform', overridePlatform);
        }
        if (overridePlatformVersion) {
            params.set('X-Plex-Platform-Version', overridePlatformVersion);
        }
        if (overrideDevice) {
            params.set('X-Plex-Device', overrideDevice);
        }
        if (overrideDeviceName) {
            params.set('X-Plex-Device-Name', overrideDeviceName);
        }
        if (overrideModel) {
            params.set('X-Plex-Model', overrideModel);
        }
        if (overrideProduct) {
            params.set('X-Plex-Product', overrideProduct);
        }
        if (overrideVersion) {
            params.set('X-Plex-Version', overrideVersion);
        }

        // Ensure minimum required ID params are present even if getAuthHeaders is mocked/minimal
        if (!params.has('X-Plex-Client-Identifier')) {
            params.set('X-Plex-Client-Identifier', this._config.clientIdentifier);
        }
        if (!params.has('X-Plex-Platform')) {
            params.set('X-Plex-Platform', 'webOS');
        }
        if (!params.has('X-Plex-Product')) {
            params.set('X-Plex-Product', 'Retune');
        }
        if (!params.has('X-Plex-Version')) {
            params.set('X-Plex-Version', '1.0.0');
        }
        if (!params.has('X-Plex-Device')) {
            params.set('X-Plex-Device', 'LG Smart TV');
        }
        if (!params.has('X-Plex-Device-Name')) {
            params.set('X-Plex-Device-Name', 'Retune');
        }
        if (!params.has('X-Plex-Platform-Version')) {
            // Detect actual webOS version instead of hardcoding 6.0
            // This ensures PMS uses the correct device profile for the TV's capabilities
            const detectedVersion = ((): string => {
                try {
                    // Try webOSTV API first (most accurate)
                    if (typeof window !== 'undefined') {
                        const webOSTV = (window as { webOSTV?: { platform?: { version?: string } } }).webOSTV;
                        if (webOSTV?.platform?.version) {
                            return webOSTV.platform.version;
                        }
                    }
                    // Fallback: infer from Chromium version in User Agent
                    // Chromium versions mapped to webOS versions:
                    // - webOS 25 (C5, 2025): Chromium 120+
                    // - webOS 24 (C4, 2024): Chromium 108-119
                    // - webOS 23 (C3, 2023): Chromium 108
                    // - webOS 22: Chromium 94-107
                    // - webOS 21: Chromium 87-93
                    // - webOS 6.x and older: Chromium <87
                    if (typeof navigator !== 'undefined') {
                        const ua = navigator.userAgent || '';
                        const chromeMatch = ua.match(/Chrome\/(\d+)/);
                        if (chromeMatch) {
                            const chromeMajor = Number(chromeMatch[1]);
                            if (chromeMajor >= 120) return '25.0';  // webOS 25+ (C5 and newer)
                            if (chromeMajor >= 108) return '24.0';  // webOS 24 (C4) / 23 (C3)
                            if (chromeMajor >= 94) return '22.0';   // webOS 22
                            if (chromeMajor >= 87) return '21.0';   // webOS 21
                        }
                    }
                    return '6.0'; // Conservative fallback for older TVs
                } catch {
                    return '6.0';
                }
            })();
            params.set('X-Plex-Platform-Version', detectedVersion);
        }
        // Plex server profile matching frequently requires a non-empty model; provide a sane default.
        if (!params.has('X-Plex-Model')) {
            params.set('X-Plex-Model', 'LGTV');
        }

        const url = new URL('/video/:/transcode/universal/start.m3u8', baseUri);
        url.search = params.toString();
        try {
            const shouldLogTranscodeDebug = ((): boolean => {
                try {
                    return isStoredTrue(localStorage.getItem('retune_debug_transcode'));
                } catch {
                    return false;
                }
            })();
            if (!shouldLogTranscodeDebug) {
                return url.toString();
            }

            const debugUrl = new URL(url.toString());
            if (debugUrl.searchParams.has('X-Plex-Token')) {
                debugUrl.searchParams.set('X-Plex-Token', 'REDACTED');
            }
            const idSummary = {
                platform: debugUrl.searchParams.get('X-Plex-Platform'),
                platformVersion: debugUrl.searchParams.get('X-Plex-Platform-Version'),
                device: debugUrl.searchParams.get('X-Plex-Device'),
                clientIdentifier: debugUrl.searchParams.get('X-Plex-Client-Identifier'),
                model: debugUrl.searchParams.get('X-Plex-Model'),
                product: debugUrl.searchParams.get('X-Plex-Product'),
                version: debugUrl.searchParams.get('X-Plex-Version'),
                profileName: debugUrl.searchParams.get('X-Plex-Client-Profile-Name'),
                profileVersion: debugUrl.searchParams.get('X-Plex-Client-Profile-Version'),
                preset: preset,
            };
            console.warn(
                `[PlexStreamResolver] Transcode URL (compat=${compatMode ? '1' : '0'}):`,
                debugUrl.toString()
            );
            console.warn('[PlexStreamResolver] Transcode ID:', idSummary);
        } catch {
            // Ignore debug logging failures
        }
        return url.toString();
    }

    // ========================================
    // Events
    // ========================================

    /**
     * Register event handler.
     * @param event - Event name
     * @param handler - Handler function
     */
    on<K extends keyof StreamResolverEventMap>(
        event: K,
        handler: (payload: StreamResolverEventMap[K]) => void
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

        const baseUri = this._selectBaseUriForMixedContent(serverUri);
        return this._buildUrlWithToken(baseUri, partKey);
    }

    /**
     * Build URL with auth token.
     */
    private _buildUrlWithToken(baseUri: string, partKey: string): string {
        const headers = this._config.getAuthHeaders();
        const token = headers['X-Plex-Token'];
        const baseUrl = new URL(baseUri);
        const parsedPart = new URL(partKey, baseUrl.origin);
        const normalizedPartKey = `${parsedPart.pathname}${parsedPart.search}`;
        const url = new URL(
            normalizedPartKey.startsWith('/') ? normalizedPartKey : `/${normalizedPartKey}`,
            baseUrl.origin
        );
        if (token) {
            url.searchParams.set('X-Plex-Token', token);
        }
        return url.toString();
    }

    private _selectBaseUriForMixedContent(serverUri: string): string {
        const serverUrl = new URL(serverUri);
        const isAppHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
        const isServerHttp = serverUrl.protocol === 'http:';

        if (!isAppHttps || !isServerHttp) {
            return serverUrl.origin;
        }

        const httpsConn = this._config.getHttpsConnection();
        if (httpsConn) {
            try {
                const url = new URL(httpsConn.uri);
                if (url.protocol === 'https:') {
                    return url.origin;
                }
            } catch {
                // Ignore invalid connection URIs and try other fallbacks.
            }
        }

        const relayConn = this._config.getRelayConnection();
        if (relayConn) {
            try {
                const url = new URL(relayConn.uri);
                if (url.protocol === 'https:') {
                    console.warn('Using Plex relay due to mixed content restrictions');
                    return url.origin;
                }
            } catch {
                // Ignore invalid relay URIs and continue.
            }
        }

        throw this._createError(
            PlexStreamErrorCode.MIXED_CONTENT_BLOCKED,
            'Cannot access HTTP server from HTTPS app - no fallback available',
            false
        );
    }

    private async _fetchWithTimeout(
        url: string,
        options: RequestInit,
        timeoutMs: number
    ): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, { ...options, signal: controller.signal });
        } finally {
            clearTimeout(timeoutId);
        }
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

    /**
     * Select a compatible audio track, falling back from incompatible codecs.
     * TrueHD and DTS-HD Master Audio cannot passthrough on webOS internal apps,
     * so we auto-select AC3/EAC3 compatibility tracks when available.
     * 
     * @param streams - All streams from the media part
     * @param requestedId - Optional user-requested audio stream ID
     * @returns Selected audio stream or null
     */
    private _selectCompatibleAudioTrack(
        streams: PlexStream[],
        requestedId?: string
    ): PlexStream | null {
        const audioStreams = streams.filter((s) => s.streamType === 2);
        if (audioStreams.length === 0) {
            return null;
        }

        // If user explicitly requested a track, honor it
        if (requestedId) {
            const requested = audioStreams.find((s) => s.id === requestedId);
            if (requested) {
                return requested;
            }
        }

        // Codecs webOS can decode or passthrough
        const compatibleCodecs = ['eac3', 'ac3', 'aac', 'dts', 'dca', 'flac', 'mp3', 'opus', 'vorbis', 'pcm'];
        // Codecs that CANNOT passthrough on webOS internal apps (require external device)
        const incompatibleCodecs = ['truehd', 'dts-hd', 'dtshd', 'dts-hd ma', 'mlp'];

        // Find default track
        const defaultTrack = audioStreams.find((s) => s.default) || audioStreams[0];
        if (!defaultTrack) {
            return null;
        }

        const defaultCodec = (defaultTrack.codec || '').toLowerCase().replace(/[\s-]/g, '');

        // Check if default is incompatible
        const isIncompatible = incompatibleCodecs.some((ic) =>
            defaultCodec.includes(ic.replace(/[\s-]/g, ''))
        );

        if (!isIncompatible) {
            return defaultTrack; // Default is fine
        }

        // Default is TrueHD/DTS-HD - try to find compatible fallback
        // Prefer same language, then prefer EAC3 > AC3 > AAC
        const defaultLang = (defaultTrack.languageCode || defaultTrack.language || '').toLowerCase();

        const fallbackCandidates = audioStreams
            .filter((s) => {
                const codec = (s.codec || '').toLowerCase();
                return compatibleCodecs.includes(codec) && s.id !== defaultTrack.id;
            })
            .sort((a, b) => {
                // Prefer same language
                const aLang = (a.languageCode || a.language || '').toLowerCase();
                const bLang = (b.languageCode || b.language || '').toLowerCase();
                if (aLang === defaultLang && bLang !== defaultLang) return -1;
                if (bLang === defaultLang && aLang !== defaultLang) return 1;

                // Prefer higher quality compatible codec
                const codecPriority = ['eac3', 'ac3', 'aac', 'dts', 'dca'];
                const aCodec = (a.codec || '').toLowerCase();
                const bCodec = (b.codec || '').toLowerCase();
                const aPriority = codecPriority.indexOf(aCodec);
                const bPriority = codecPriority.indexOf(bCodec);
                return (aPriority === -1 ? 99 : aPriority) - (bPriority === -1 ? 99 : bPriority);
            });

        const fallback = fallbackCandidates[0];

        // Debug logging
        if (fallback) {
            try {
                if (isStoredTrue(localStorage.getItem('retune_debug_transcode'))) {
                    console.warn('[PlexStreamResolver] Audio fallback selected:', {
                        from: { codec: defaultTrack.codec, language: defaultTrack.language },
                        to: { codec: fallback.codec, language: fallback.language },
                        reason: 'TrueHD/DTS-HD cannot passthrough on webOS',
                    });
                }
            } catch {
                // Ignore logging failures
            }
        }

        return fallback || defaultTrack; // Use fallback if found, otherwise stick with default
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
