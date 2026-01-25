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
} from './interfaces';
import type {
    PlexMediaItem,
    PlexMediaFile,
    PlexStream,
    StreamRequest,
    StreamDecision,
    HlsOptions,
} from './types';
import { PlexStreamErrorCode } from './types';
import {
    SUPPORTED_CONTAINERS,
    SUPPORTED_VIDEO_CODECS,
    SUPPORTED_AUDIO_CODECS,
    MAX_RESOLUTION,
    BURN_IN_SUBTITLE_FORMATS,
    SIDECAR_SUBTITLE_FORMATS,
    DEFAULT_HLS_OPTIONS,
} from './constants';
import { generateUUID } from './utils';
import { RETUNE_STORAGE_KEYS } from '../../../config/storageKeys';
import { isStoredTrue, readStoredBoolean, safeLocalStorageGet } from '../../../utils/storage';
import { redactSensitiveTokens } from '../../../utils/redact';
import { detectHdrLabel } from './hdr';

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

    /**
     * Create a new PlexStreamResolver instance.
     * @param config - Configuration with auth and server accessors
     */
    constructor(config: PlexStreamResolverConfig) {
        this._config = config;
        this._emitter = new EventEmitter<StreamResolverEventMap>();
    }

    private _getChromeMajor(): number | null {
        try {
            if (typeof navigator === 'undefined') return null;
            const ua = navigator.userAgent || '';
            const chromeMatch = ua.match(/Chrome\/(\d+)/);
            if (!chromeMatch) return null;
            const n = Number(chromeMatch[1]);
            return Number.isFinite(n) ? n : null;
        } catch {
            return null;
        }
    }

    private _isWebOs(): boolean {
        try {
            if (typeof navigator === 'undefined') return false;
            return /Web0S|webOS/i.test(navigator.userAgent || '');
        } catch {
            return false;
        }
    }

    /**
     * Detect webOS platform version from webOSTV API or Chromium user agent mapping.
     * Used for X-Plex-Platform-Version when constructing transcode URLs.
     */
    private _detectPlatformVersion(): string {
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
            // - webOS 24 (C4, 2024): Chromium 108
            // - webOS 23 (C3, 2023): Chromium 94
            // - webOS 22: Chromium 87
            // - webOS 6.x and older: Chromium <87
            const chromeMajor = this._getChromeMajor();
            if (chromeMajor !== null) {
                if (chromeMajor >= 120) return '25.0';  // webOS 25+ (C5 and newer)
                if (chromeMajor >= 108) return '24.0';  // webOS 24 (C4)
                if (chromeMajor >= 94) return '23.0';   // webOS 23
                if (chromeMajor >= 87) return '22.0';   // webOS 22
            }

            return '6.0'; // Conservative fallback for older TVs
        } catch {
            return '6.0';
        }
    }

    private _applyDefaultIdentityParams(params: URLSearchParams): void {
        const defaults: Record<string, string> = {
            'X-Plex-Client-Identifier': this._config.clientIdentifier,
            'X-Plex-Platform': 'webOS',
            'X-Plex-Product': 'Retune',
            'X-Plex-Version': '1.0.0',
            'X-Plex-Device': 'LG Smart TV',
            'X-Plex-Device-Name': 'Retune',
            'X-Plex-Platform-Version': this._detectPlatformVersion(),
            'X-Plex-Model': 'LGTV',
        };
        for (const [key, value] of Object.entries(defaults)) {
            if (!params.has(key)) {
                params.set(key, value);
            }
        }
    }

    private _isSubtitleDebugEnabled(): boolean {
        try {
            return isStoredTrue(
                safeLocalStorageGet(RETUNE_STORAGE_KEYS.SUBTITLE_DEBUG_LOGGING)
            );
        } catch {
            return false;
        }
    }

    private _logSubtitleDebug(event: string, context: Record<string, unknown>): void {
        if (!this._isSubtitleDebugEnabled()) return;
        console.warn(`[SubtitleDebug] ${JSON.stringify({
            ts: new Date().toISOString(),
            module: 'PlexStreamResolver',
            event,
            ...context,
        })}`);
    }

    private _detectSubtitleTextFormat(sample: string): 'webvtt' | 'srt' | 'unknown' {
        const trimmed = sample.replace(/^\uFEFF/, '').trimStart(); // strip UTF-8 BOM
        if (trimmed.startsWith('WEBVTT')) return 'webvtt';
        // Heuristic: SRT has timestamps with -->
        if (trimmed.includes('-->')) return 'srt';
        return 'unknown';
    }

    private async _probeSubtitleStreamDelivery(options: {
        itemKey: string;
        subtitleStreamId: string;
        subtitleStreamKey?: string;
        codec?: string;
        language?: string;
    }): Promise<void> {
        if (!this._isSubtitleDebugEnabled()) return;
        const serverUri = this._config.getServerUri();
        if (!serverUri) return;

        let urlSource: 'key' | 'id_fallback' = 'id_fallback';
        const baseUrl = ((): URL => {
            if (typeof options.subtitleStreamKey === 'string' && options.subtitleStreamKey.length > 0) {
                try {
                    urlSource = 'key';
                    return new URL(options.subtitleStreamKey, serverUri);
                } catch {
                    // Fall through to ID-based URL
                }
            }
            return new URL(`/library/streams/${encodeURIComponent(options.subtitleStreamId)}`, serverUri);
        })();

        const tokenFromHeader = ((): string | null => {
            try {
                const headers = this._config.getAuthHeaders();
                const token = headers['X-Plex-Token'] ?? headers['x-plex-token'];
                return typeof token === 'string' && token.length > 0 ? token : null;
            } catch {
                return null;
            }
        })();

        const variants: Array<{
            authMode: 'header';
            url: URL;
            headers: Record<string, string>;
        }> = [
            {
                // Closest to how Retune currently talks to PMS (token in header)
                authMode: 'header',
                url: baseUrl,
                headers: {
                    Accept: 'text/vtt, text/plain, */*',
                    ...this._config.getAuthHeaders(),
                },
            },
        ];

        for (const variant of variants) {
            const redactedUrl = redactSensitiveTokens(variant.url.toString());
            const redactedTrackSrcQueryAuth = ((): string | null => {
                // NOTE: <track src="..."> cannot send X-Plex-Token headers. Prefer a blob URL
                // created from an authenticated fetch to avoid token-in-URL and CORS issues.
                if (!tokenFromHeader) return null;
                try {
                    const u = new URL(baseUrl.toString());
                    if (!u.searchParams.has('X-Plex-Token')) u.searchParams.set('X-Plex-Token', tokenFromHeader);
                    return redactSensitiveTokens(u.toString());
                } catch {
                    return null;
                }
            })();

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            try {
                const response = await fetch(variant.url.toString(), {
                    method: 'GET',
                    headers: variant.headers,
                    cache: 'no-store',
                    // Explicitly CORS so the behavior matches what the TV browser enforces.
                    mode: 'cors',
                    credentials: 'omit',
                    signal: controller.signal,
                });

            const contentType = response.headers.get('content-type');
            const contentLength = response.headers.get('content-length');
            const acceptRanges = response.headers.get('accept-ranges');
            const contentRange = response.headers.get('content-range');
            const contentDisposition = response.headers.get('content-disposition');
            const accessControlAllowOrigin = response.headers.get('access-control-allow-origin');
            const accessControlExposeHeaders = response.headers.get('access-control-expose-headers');
            const responseType = response.type;
            const redirected = response.redirected;
            const finalUrl = redactSensitiveTokens(response.url);

                let detected: 'webvtt' | 'srt' | 'unknown' = 'unknown';
                let sampleLength = 0;
                let sampleCapped = false;
                let looksLikeHtml = false;
                try {
                    const reader = response.body?.getReader?.();
                    if (reader) {
                        const decoder = new TextDecoder('utf-8');
                        let sample = '';
                        const MAX_SAMPLE_CHARS = 2048;
                        while (sample.length < MAX_SAMPLE_CHARS) {
                            const { value, done } = await reader.read();
                            if (done) break;
                            if (value) {
                                const chunk = decoder.decode(value, { stream: true });
                                const remaining = MAX_SAMPLE_CHARS - sample.length;
                                if (chunk.length > remaining) {
                                    sample += chunk.slice(0, remaining);
                                    sampleCapped = true;
                                    break;
                                }
                                sample += chunk;
                            }
                        }
                        try {
                            // Stop downloading if more data exists.
                            await reader.cancel();
                        } catch {
                            // Ignore cancel errors.
                        }
                        sampleLength = sample.length;
                        looksLikeHtml = sample.replace(/^\uFEFF/, '').trimStart().startsWith('<');
                        detected = this._detectSubtitleTextFormat(sample);
                    } else {
                        // Some client stacks may not expose a streaming body. Avoid downloading full subtitle
                        // payloads in debug mode; fall back to codec-based detection.
                        detected =
                            ((): 'webvtt' | 'srt' | 'unknown' => {
                                const c = (options.codec ?? '').toLowerCase();
                                if (c === 'vtt' || c === 'webvtt') return 'webvtt';
                                if (c === 'srt') return 'srt';
                                return 'unknown';
                            })();
                    }
                } catch {
                    // Ignore read errors; still log status/headers.
                }

            this._logSubtitleDebug('subtitle_stream_probe', {
                itemKey: options.itemKey,
                subtitleStreamId: options.subtitleStreamId,
                subtitleStreamKey: typeof options.subtitleStreamKey === 'string' ? redactSensitiveTokens(options.subtitleStreamKey) : null,
                codec: options.codec ?? null,
                language: options.language ?? null,
                urlSource,
                authMode: variant.authMode,
                url: redactedUrl,
                trackSrcQueryAuthExample: redactedTrackSrcQueryAuth,
                originHost: variant.url.host,
                originIsPlexDirect: variant.url.hostname.endsWith('.plex.direct'),
                responseType,
                redirected,
                finalUrl,
                ok: response.ok,
                status: response.status,
                contentType,
                contentLength,
                contentDisposition,
                    accessControlAllowOrigin,
                    accessControlExposeHeaders,
                    acceptRanges,
                    contentRange,
                    detected,
                    sampleLength,
                    sampleCapped,
                    looksLikeHtml,
                });
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
            this._logSubtitleDebug('subtitle_stream_probe_error', {
                itemKey: options.itemKey,
                subtitleStreamId: options.subtitleStreamId,
                subtitleStreamKey: typeof options.subtitleStreamKey === 'string' ? redactSensitiveTokens(options.subtitleStreamKey) : null,
                codec: options.codec ?? null,
                language: options.language ?? null,
                urlSource,
                authMode: variant.authMode,
                url: redactedUrl,
                error: message,
            });
            } finally {
                clearTimeout(timeoutId);
            }
        }
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

        // Track selection (used for UI and optional HLS stream selection)
        const audioStream = this._selectCompatibleAudioTrack(
            part.streams,
            request.audioStreamId
        );
        const videoStream = part.streams.find((s) => s.streamType === 1) ?? null;
        // Subtitles are not user-selectable in Retune yet; do not auto-select defaults.
        // This prevents accidental burn-in which forces video transcoding.
        const subtitleStream =
            request.subtitleStreamId
                ? (part.streams.find(
                    (s) => s.streamType === 3 && s.id === request.subtitleStreamId
                ) ?? null)
                : null;
        const availableSubtitleStreams = part.streams.filter((s) => s.streamType === 3);
        const availableAudioStreams = part.streams.filter((s) => s.streamType === 2);

        if (this._isSubtitleDebugEnabled()) {
            const isTextCandidate = (s: PlexStream): boolean => {
                const c = (s.codec ?? '').toLowerCase();
                return c === 'srt' || c === 'vtt' || c === 'webvtt';
            };
            const hasKey = (s: PlexStream): boolean => typeof s.key === 'string' && s.key.length > 0;
            const codecCounts = availableSubtitleStreams.reduce<Record<string, number>>((acc, stream) => {
                const codec = (stream.codec ?? stream.format ?? 'unknown').toLowerCase();
                acc[codec] = (acc[codec] ?? 0) + 1;
                return acc;
            }, {});
            const withKeyCount = availableSubtitleStreams.filter(hasKey).length;
            this._logSubtitleDebug('subtitle_tracks_discovered', {
                count: availableSubtitleStreams.length,
                codecs: codecCounts,
                withKeyCount,
                withoutKeyCount: Math.max(0, availableSubtitleStreams.length - withKeyCount),
            });
            this._logSubtitleDebug('subtitle_streams_discovered', {
                itemKey: request.itemKey,
                subtitlesCount: availableSubtitleStreams.length,
                subtitleStreams: availableSubtitleStreams.map((s) => ({
                    id: s.id,
                    codec: s.codec,
                    format: s.format,
                    language: s.language,
                    languageCode: s.languageCode,
                    title: s.title,
                    default: s.default,
                    forced: s.forced,
                    selected: subtitleStream?.id === s.id,
                    isTextCandidate: isTextCandidate(s),
                    fetchableViaKey: hasKey(s),
                    key: typeof s.key === 'string' ? redactSensitiveTokens(s.key) : null,
                })),
            });

            const candidates = availableSubtitleStreams.filter(isTextCandidate);
            if (candidates.length > 0) {
                const pickPreferred = (streams: PlexStream[]): PlexStream => {
                    const forced = streams.find((s) => s.forced);
                    if (forced) return forced;
                    const english = streams.find(
                        (s) => (s.language ?? '').toLowerCase() === 'english' || (s.languageCode ?? '').toLowerCase() === 'en'
                    );
                    if (english) return english;
                    return streams[0]!;
                };

                // Probe both a key-backed and keyless candidate when possible, to categorize behavior.
                const withKey = candidates.filter(hasKey);
                const withoutKey = candidates.filter((s) => !hasKey(s));
                const toProbe: PlexStream[] = [];
                if (withKey.length > 0) toProbe.push(pickPreferred(withKey));
                if (withoutKey.length > 0 && toProbe.length < 2) toProbe.push(pickPreferred(withoutKey));
                while (toProbe.length < 2) {
                    const next = candidates.find((s) => !toProbe.some((p) => p.id === s.id));
                    if (!next) break;
                    toProbe.push(next);
                }
                for (const s of toProbe) {
                    void this._probeSubtitleStreamDelivery({
                        itemKey: request.itemKey,
                        subtitleStreamId: s.id,
                        ...(typeof s.key === 'string' ? { subtitleStreamKey: s.key } : {}),
                        codec: s.codec,
                        ...(typeof s.language === 'string' ? { language: s.language } : {}),
                    });
                }
            }
        }

        const shouldForceAudioStreamId = this._shouldForceTranscodeAudioStreamId(
            part.streams,
            request.audioStreamId
        );
        const defaultAudio = this._findStream(part.streams, 2);
        const audioFallbackInfo =
            defaultAudio &&
                audioStream &&
                this._isTrueHdCodec(defaultAudio.codec) &&
                !this._isTrueHdCodec(audioStream.codec)
                ? {
                    fromCodec: (defaultAudio.codec || 'unknown').toLowerCase(),
                    toCodec: (audioStream.codec || 'unknown').toLowerCase(),
                    reason: 'TrueHD cannot be decoded on webOS',
                }
                : null;

        // 3. Start a playback session early so the same sessionId can be used for
        // transcoding session binding (`session` + `X-Plex-Session-Identifier`).
        const sessionId = generateUUID();

        try {
            // 4. Check direct play compatibility ON THE SELECTED MEDIA VERSION
            const allowDirectPlayAudioFallback = ((): boolean => {
                try {
                    return isStoredTrue(
                        safeLocalStorageGet(RETUNE_STORAGE_KEYS.DIRECT_PLAY_AUDIO_FALLBACK)
                    );
                } catch {
                    return false;
                }
            })();

            let directDecision = this._getDirectPlayDecision(media);
            let directPlayAudioStreamId: string | undefined;
            if (
                allowDirectPlayAudioFallback &&
                defaultAudio &&
                this._isTrueHdCodec(defaultAudio.codec) &&
                audioStream &&
                audioStream.id &&
                !this._isTrueHdCodec(audioStream.codec)
            ) {
                // If the only blocker is TrueHD (or other audio incompatibility), and we found a
                // compatible fallback track, try allowing Direct Play and hint Plex with audioStreamID.
                // This is intentionally opt-in since some client stacks may not honor audioStreamID
                // for direct URLs.
                const nonAudioReasons = directDecision.reasons.filter(
                    (r) => !r.startsWith('unsupported_audio_codec:') && r !== 'dts_passthrough_disabled'
                );
                if (nonAudioReasons.length === 0) {
                    const overridden = this._getDirectPlayDecision(media, audioStream.codec);
                    if (overridden.canDirect) {
                        directDecision = overridden;
                        directPlayAudioStreamId = audioStream.id;
                    }
                }
            }

            const canDirect = directDecision.canDirect;
            const preferHdr10 = this._shouldPreferHdr10OverDv();
            const isDolbyVision = this._detectHdrLabelFromStream(videoStream) === 'Dolby Vision';
            const forceTranscodeForDv = preferHdr10 && isDolbyVision;
            const debugEnabled = ((): boolean => {
                try {
                    return isStoredTrue(safeLocalStorageGet(RETUNE_STORAGE_KEYS.DEBUG_LOGGING));
                } catch {
                    return false;
                }
            })();

            if (debugEnabled) {
                const reasons: string[] = [];
                if (request.directPlay === false) {
                    reasons.push('direct_play_disabled_by_request');
                }
                if (!directDecision.canDirect) {
                    reasons.push(...directDecision.reasons);
                }
                if (forceTranscodeForDv) {
                    reasons.push('prefer_hdr10_over_dv');
                }
                if (reasons.length > 0) {
                    console.warn('[PlexStreamResolver] Direct play decision:', {
                        itemKey: request.itemKey,
                        container: media.container,
                        videoCodec: media.videoCodec,
                        audioCodec: media.audioCodec,
                        width: media.width,
                        height: media.height,
                        reasons,
                    });
                }
            }

            let playbackUrl: string;
            let protocol: 'hls' | 'http';
            let isTranscoding = false;
            let container: string;
            let videoCodec: string;
            let audioCodec: string;
            let transcodeRequestInfo: StreamDecision['transcodeRequest'] | null = null;

            const allowDirectPlay = canDirect && request.directPlay !== false && !forceTranscodeForDv;
            if (allowDirectPlay) {
                // Direct play
                playbackUrl = this._buildDirectPlayUrl(part.key, sessionId, directPlayAudioStreamId);
                protocol = 'http';
                container = media.container;
                videoCodec = media.videoCodec;
                audioCodec = (audioStream?.codec ?? media.audioCodec).toLowerCase();
            } else {
                // Transcode to HLS
                const maxBitrate = typeof request.maxBitrate === 'number'
                    ? request.maxBitrate
                    : DEFAULT_HLS_OPTIONS.maxBitrate;
                const options: HlsOptions = { maxBitrate, sessionId };
                if (shouldForceAudioStreamId && audioStream?.id) {
                    options.audioStreamId = audioStream.id;
                }
                playbackUrl = this.getTranscodeUrl(request.itemKey, options);
                protocol = 'hls';
                isTranscoding = true;
                container = 'mpegts';
                videoCodec = 'h264';
                audioCodec = 'aac';
                const req: { sessionId: string; maxBitrate: number; audioStreamId?: string } = { sessionId, maxBitrate };
                if (typeof options.audioStreamId === 'string') {
                    req.audioStreamId = options.audioStreamId;
                }
                transcodeRequestInfo = req;
            }

            // 5. Determine subtitle delivery
            const subtitleDelivery = this._getSubtitleDelivery(
                subtitleStream,
                isTranscoding
            );

            const rawHdrLabel = videoStream?.hdr?.trim();
            const hdrLabel = rawHdrLabel || this._detectHdrLabelFromStream(videoStream);
            const source: NonNullable<StreamDecision['source']> = {
                container: media.container,
                videoCodec: media.videoCodec,
                audioCodec: media.audioCodec,
                width: media.width,
                height: media.height,
                bitrate: media.bitrate,
                ...(hdrLabel ? { hdr: hdrLabel } : {}),
                ...(videoStream?.dynamicRange ? { dynamicRange: videoStream.dynamicRange } : {}),
                ...(typeof videoStream?.doviPresent === 'boolean' ? { doviPresent: videoStream.doviPresent } : {}),
                ...(videoStream?.doviProfile ? { doviProfile: videoStream.doviProfile } : {}),
            };

            const decision: StreamDecision = {
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
                availableAudioStreams,
                availableSubtitleStreams,
                width: media.width,
                height: media.height,
                bitrate: isTranscoding
                    ? (typeof request.maxBitrate === 'number' ? request.maxBitrate : 8000)
                    : media.bitrate,
                source,
                directPlay: {
                    allowed: allowDirectPlay,
                    reasons:
                        allowDirectPlay
                            ? []
                            : [
                                ...(request.directPlay === false ? ['direct_play_disabled_by_request'] : []),
                                ...(forceTranscodeForDv ? ['prefer_hdr10_over_dv'] : []),
                                ...directDecision.reasons,
                            ],
                },
            };
            if (audioFallbackInfo) {
                decision.audioFallback = audioFallbackInfo;
            }
            if (transcodeRequestInfo) {
                decision.transcodeRequest = transcodeRequestInfo;
            }

            if (this._isDebugLoggingEnabled()) {
                console.warn('[PlexStreamResolver] Stream decision summary:', {
                    itemKey: request.itemKey,
                    isDirectPlay: decision.isDirectPlay,
                    isTranscoding: decision.isTranscoding,
                    hdr: hdrLabel,
                    doviPresent: videoStream?.doviPresent ?? null,
                    doviProfile: videoStream?.doviProfile ?? null,
                });
            }

            return decision;
        } catch (error) {
            throw error;
        }
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
        return this._getDirectPlayDecision(media).canDirect;
    }

    private _getDirectPlayDecision(
        media: PlexMediaFile,
        audioCodecOverride?: string | null | undefined
    ): { canDirect: boolean; reasons: string[] } {
        const reasons: string[] = [];

        // Check container (pre-normalized to lowercase in ResponseParser)
        if (!SUPPORTED_CONTAINERS.includes(media.container)) {
            reasons.push(`unsupported_container:${media.container}`);
        }

        // webOS nuance: MKV container support is inconsistent on older webOS (Chromium 79 era).
        // For legacy stacks, prefer Direct Stream (remux) rather than attempting MKV Direct Play.
        if (media.container === 'mkv') {
            const isLegacyWebOs = ((): boolean => {
                try {
                    if (typeof navigator === 'undefined') return false;
                    const ua = navigator.userAgent || '';
                    if (!/Web0S|webOS/i.test(ua)) return false;
                    const chromeMatch = ua.match(/Chrome\/(\d+)/);
                    const chromeMajor = chromeMatch ? Number(chromeMatch[1]) : NaN;
                    return Number.isFinite(chromeMajor) && chromeMajor < 87;
                } catch {
                    return false;
                }
            })();
            if (isLegacyWebOs) {
                reasons.push('mkv_legacy_webos');
            }
        }

        // Check video codec (pre-normalized to lowercase in ResponseParser)
        if (!SUPPORTED_VIDEO_CODECS.includes(media.videoCodec)) {
            reasons.push(`unsupported_video_codec:${media.videoCodec}`);
        }

        // Check audio codec (pre-normalized to lowercase in ResponseParser)
        const audioCodec = (audioCodecOverride ?? media.audioCodec).toLowerCase();
        const isDtsFamily =
            audioCodec.startsWith('dts') ||
            audioCodec.startsWith('dca'); // includes dca-ma (DTS-HD MA)
        if (isDtsFamily) {
            const isDtsEnabled = ((): boolean => {
                try {
                    if (!isStoredTrue(safeLocalStorageGet(RETUNE_STORAGE_KEYS.DTS_PASSTHROUGH))) {
                        return false;
                    }
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
                reasons.push('dts_passthrough_disabled');
            }
        } else if (!SUPPORTED_AUDIO_CODECS.includes(audioCodec)) {
            reasons.push(`unsupported_audio_codec:${audioCodec}`);
        }

        // Check resolution
        if (media.width > MAX_RESOLUTION.width || media.height > MAX_RESOLUTION.height) {
            reasons.push(`unsupported_resolution:${media.width}x${media.height}`);
        }

        return { canDirect: reasons.length === 0, reasons };
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

        const compatMode = readStoredBoolean(RETUNE_STORAGE_KEYS.TRANSCODE_COMPAT, false);

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
        if (typeof options.audioStreamId === 'string' && options.audioStreamId.length > 0) {
            params.set('audioStreamID', options.audioStreamId);
        }

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
            // Redundant belt-and-suspenders for servers that ignore `subtitles=none`.
            params.set('subtitleStreamID', '0');
            params.set('subtitleFormat', 'none');
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

        const chromeMajor = this._getChromeMajor();
        const isWebOs = this._isWebOs();

        // HEVC detection (common for 4K MKV libraries).
        const supportsHevc =
            canPlay('video/mp4; codecs="hvc1.1.6.L93.B0"') ||
            canPlay('video/mp4; codecs="hev1.1.6.L93.B0"') ||
            // Fallback: webOS 23+ (Chromium 94+) should support HEVC decode.
            (isWebOs && chromeMajor !== null && chromeMajor >= 94);

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
            ((): string => {
                const audioDecoders: string[] = [
                    'mp3',
                    'aac{bitrate:800000}',
                    'ac3{bitrate:800000}',
                    'eac3{bitrate:800000}',
                ];

                // If user explicitly enabled DTS passthrough and we're on a modern webOS stack,
                // advertise DTS-HD MA as well (Plex often labels it as `dca-ma`).
                const dtsEnabled = ((): boolean => {
                    try {
                        return isStoredTrue(safeLocalStorageGet(RETUNE_STORAGE_KEYS.DTS_PASSTHROUGH));
                    } catch {
                        return false;
                    }
                })();
                if (dtsEnabled) {
                    audioDecoders.push('dts{bitrate:1536000}');
                    audioDecoders.push('dca{bitrate:1536000}');
                    if (isWebOs && chromeMajor !== null && chromeMajor >= 108) {
                        audioDecoders.push('dca-ma{bitrate:1536000}');
                    }
                }

                return `protocols=http-live-streaming,http-mp4-streaming,http-streaming-video;videoDecoders=${videoDecoders.join(',')};audioDecoders=${audioDecoders.join(',')}`;
            })()
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
        this._applyDefaultIdentityParams(params);

        const url = new URL('/video/:/transcode/universal/start.m3u8', baseUri);
        url.search = params.toString();
        try {
            const shouldLogTranscodeDebug = ((): boolean => {
                try {
                    return isStoredTrue(safeLocalStorageGet(RETUNE_STORAGE_KEYS.DEBUG_LOGGING));
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
                detectedPlatformVersion: this._detectPlatformVersion(),
                chromeMajor: this._getChromeMajor(),
                overrides: {
                    platform: overridePlatform,
                    platformVersion: overridePlatformVersion,
                    device: overrideDevice,
                    deviceName: overrideDeviceName,
                    model: overrideModel,
                    product: overrideProduct,
                    version: overrideVersion,
                    profileName: forcedProfileName,
                    profileVersion: forcedProfileVersion,
                },
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

    async fetchUniversalTranscodeDecision(
        itemKey: string,
        options: { sessionId: string; maxBitrate?: number; audioStreamId?: string }
    ): Promise<NonNullable<StreamDecision['serverDecision']>> {
        const hlsOptions: HlsOptions = { sessionId: options.sessionId };
        if (typeof options.maxBitrate === 'number') {
            hlsOptions.maxBitrate = options.maxBitrate;
        }
        if (typeof options.audioStreamId === 'string') {
            hlsOptions.audioStreamId = options.audioStreamId;
        }

        const startUrl = this.getTranscodeUrl(itemKey, hlsOptions);

        const decisionUrl = ((): string => {
            const url = new URL(startUrl);
            url.pathname = '/video/:/transcode/universal/decision';
            return url.toString();
        })();

        const response = await this._fetchWithTimeout(
            decisionUrl,
            { method: 'GET', headers: this._config.getAuthHeaders() },
            4000
        );
        this._throwIfAuthFailure(response);
        if (!response.ok) {
            throw new Error(`PMS decision request failed: ${response.status}`);
        }
        const raw = await response.text();

        const parsed = this._parseUniversalDecisionResponse(raw);
        return { fetchedAt: Date.now(), ...parsed };
    }

    private _parseUniversalDecisionResponse(
        raw: string
    ): Omit<NonNullable<StreamDecision['serverDecision']>, 'fetchedAt'> {
        // Best-effort parsing. Plex typically responds with XML for this endpoint.
        // We extract commonly used attributes: decisionCode/decisionText and video/audio/subtitle decisions.
        try {
            if (typeof DOMParser !== 'undefined') {
                const doc = new DOMParser().parseFromString(raw, 'text/xml');
                const container = doc.querySelector('MediaContainer');
                const transcode = doc.querySelector('TranscodeSession');

                const decisionCode =
                    container?.getAttribute('decisionCode') ??
                    transcode?.getAttribute('decisionCode') ??
                    undefined;
                const decisionText =
                    container?.getAttribute('decisionText') ??
                    container?.getAttribute('generalDecisionText') ??
                    transcode?.getAttribute('decisionText') ??
                    undefined;

                const videoDecision =
                    transcode?.getAttribute('videoDecision') ??
                    container?.getAttribute('videoDecision') ??
                    undefined;
                const audioDecision =
                    transcode?.getAttribute('audioDecision') ??
                    container?.getAttribute('audioDecision') ??
                    undefined;
                const subtitleDecision =
                    transcode?.getAttribute('subtitleDecision') ??
                    container?.getAttribute('subtitleDecision') ??
                    undefined;

                const result: Record<string, string> = {};
                if (decisionCode) result.decisionCode = decisionCode;
                if (decisionText) result.decisionText = decisionText;
                if (videoDecision) result.videoDecision = videoDecision;
                if (audioDecision) result.audioDecision = audioDecision;
                if (subtitleDecision) result.subtitleDecision = subtitleDecision;
                return result as Omit<NonNullable<StreamDecision['serverDecision']>, 'fetchedAt'>;
            }
        } catch {
            // fall through to regex parsing
        }

        const attr = (name: string): string | undefined => {
            const match = raw.match(new RegExp(`${name}=\"([^\"]+)\"`));
            return match?.[1];
        };
        const decisionCode = attr('decisionCode') ?? attr('generalDecisionCode');
        const decisionText = attr('decisionText') ?? attr('generalDecisionText');
        const videoDecision = attr('videoDecision');
        const audioDecision = attr('audioDecision');
        const subtitleDecision = attr('subtitleDecision');

        const result: Record<string, string> = {};
        if (decisionCode) result.decisionCode = decisionCode;
        if (decisionText) result.decisionText = decisionText;
        if (videoDecision) result.videoDecision = videoDecision;
        if (audioDecision) result.audioDecision = audioDecision;
        if (subtitleDecision) result.subtitleDecision = subtitleDecision;
        return result as Omit<NonNullable<StreamDecision['serverDecision']>, 'fetchedAt'>;
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

    /**
     * Remove event handler.
     * @param event - Event name
     * @param handler - Handler function
     */
    off<K extends keyof StreamResolverEventMap>(
        event: K,
        handler: (payload: StreamResolverEventMap[K]) => void
    ): void {
        type HandlerUnion = (payload: StreamResolverEventMap[keyof StreamResolverEventMap]) => void;
        this._emitter.off(event, handler as HandlerUnion);
    }

    // ========================================
    // Private: URL Building
    // ========================================

    /**
     * Build direct play URL with mixed content handling.
     * @param partKey - Media part key
     * @returns Full playback URL
     */
    private _buildDirectPlayUrl(
        partKey: string,
        sessionId: string,
        audioStreamId?: string
    ): string {
        const serverUri = this._config.getServerUri();
        if (!serverUri) {
            throw this._createError(
                PlexStreamErrorCode.SERVER_UNREACHABLE,
                'No server connection available',
                true
            );
        }

        const baseUri = this._selectBaseUriForMixedContent(serverUri);
        return this._buildUrlWithToken(baseUri, partKey, sessionId, audioStreamId);
    }

    /**
     * Build URL with auth token.
     */
    private _buildUrlWithToken(
        baseUri: string,
        partKey: string,
        sessionId: string,
        audioStreamId?: string
    ): string {
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
        url.searchParams.set('X-Plex-Session-Identifier', sessionId);
        if (typeof audioStreamId === 'string' && audioStreamId.length > 0) {
            url.searchParams.set('audioStreamID', audioStreamId);
        }

        // Video element requests cannot include headers; attach identity via query params.
        for (const [key, value] of Object.entries(headers)) {
            if (!key.startsWith('X-Plex-')) {
                continue;
            }
            if (typeof value !== 'string' || value.length === 0) {
                continue;
            }
            url.searchParams.set(key, value);
        }

        this._applyDefaultIdentityParams(url.searchParams);
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

    private _throwIfAuthFailure(response: Response): void {
        if (response.status === 401) {
            throw this._createError(
                PlexStreamErrorCode.AUTH_EXPIRED,
                'Authentication expired',
                false
            );
        }
        if (response.status === 403) {
            throw this._createError(
                PlexStreamErrorCode.AUTH_INVALID,
                'Authentication invalid',
                false
            );
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

        if (this._shouldPreferHdr10OverDv()) {
            const nonDvCandidates = candidates.filter((media) => !this._isDolbyVisionMedia(media));
            if (nonDvCandidates.length > 0) {
                candidates = nonDvCandidates;
            } else if (this._isDebugLoggingEnabled()) {
                console.warn('[PlexStreamResolver] HDR10 preference enabled but no non-DV media found.');
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
     * TrueHD cannot be decoded on LG webOS internal apps, so we auto-select an
     * AC3/EAC3/AAC fallback track (non-commentary) when available.
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

        const fallbackCodecs = ['eac3', 'ac3', 'aac'];

        // Find default track
        const defaultTrack = audioStreams.find((s) => s.default) || audioStreams[0];
        if (!defaultTrack) {
            return null;
        }

        if (!this._isTrueHdCodec(defaultTrack.codec)) {
            return defaultTrack; // Default is fine
        }

        // Default is TrueHD - try to find a compatible fallback
        // Prefer same language, then prefer EAC3 > AC3 > AAC
        const defaultLang = (defaultTrack.languageCode || defaultTrack.language || '').toLowerCase();

        const fallbackCandidates = audioStreams
            .filter((s) => {
                const codec = (s.codec || '').toLowerCase();
                if (s.id === defaultTrack.id) return false;
                if (!fallbackCodecs.includes(codec)) return false;
                if (this._isCommentaryStream(s)) return false;
                return true;
            })
            .sort((a, b) => {
                // Prefer same language
                const aLang = (a.languageCode || a.language || '').toLowerCase();
                const bLang = (b.languageCode || b.language || '').toLowerCase();
                if (aLang === defaultLang && bLang !== defaultLang) return -1;
                if (bLang === defaultLang && aLang !== defaultLang) return 1;

                // Prefer higher quality compatible codec
                const codecPriority = ['eac3', 'ac3', 'aac'];
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
                if (isStoredTrue(safeLocalStorageGet(RETUNE_STORAGE_KEYS.DEBUG_LOGGING))) {
                    console.warn('[PlexStreamResolver] Audio fallback selected:', {
                        from: { codec: defaultTrack.codec, language: defaultTrack.language },
                        to: { codec: fallback.codec, language: fallback.language },
                        reason: 'TrueHD cannot be decoded on webOS',
                    });
                }
            } catch {
                // Ignore logging failures
            }
        }

        return fallback || defaultTrack; // Use fallback if found, otherwise stick with default
    }

    private _shouldPreferHdr10OverDv(): boolean {
        try {
            return readStoredBoolean(RETUNE_STORAGE_KEYS.PREFER_HDR10_OVER_DV, false);
        } catch {
            return false;
        }
    }

    private _isDolbyVisionMedia(media: PlexMediaFile): boolean {
        const stream = media.parts?.[0]?.streams?.find((s) => s.streamType === 1);
        const hdrLabel = this._detectHdrLabelFromStream(stream ?? undefined);
        return hdrLabel === 'Dolby Vision';
    }

    private _detectHdrLabelFromStream(stream?: PlexStream | null): string | undefined {
        return detectHdrLabel(stream);
    }

    private _isDebugLoggingEnabled(): boolean {
        try {
            return isStoredTrue(safeLocalStorageGet(RETUNE_STORAGE_KEYS.DEBUG_LOGGING));
        } catch {
            return false;
        }
    }

    private _isTrueHdCodec(codec: string | null | undefined): boolean {
        const normalized = (codec || '').toLowerCase().replace(/[\s-]/g, '');
        return normalized === 'truehd' || normalized === 'mlp';
    }

    private _isCommentaryStream(stream: PlexStream): boolean {
        const title = (stream.title || '').toLowerCase();
        return title.includes('commentary');
    }

    private _shouldForceTranscodeAudioStreamId(
        streams: PlexStream[],
        requestedId?: string
    ): boolean {
        if (requestedId) return true;
        const defaultAudio = this._findStream(streams, 2);
        return defaultAudio ? this._isTrueHdCodec(defaultAudio.codec) : false;
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
