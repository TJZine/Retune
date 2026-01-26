import { AppErrorCode, type AppError } from '../lifecycle';
import {
    mapPlexStreamErrorCodeToAppErrorCode,
    type IPlexStreamResolver,
    type StreamDecision,
    type StreamResolverError,
    type PlexStream,
} from '../plex/stream';
import type { IChannelScheduler, ScheduledProgram } from '../scheduler/scheduler';
import type { IVideoPlayer, StreamDescriptor } from './index';
import type { AudioTrack, SubtitleTrack } from './types';
import { TEXT_SUBTITLE_FORMATS } from './constants';
import { RETUNE_STORAGE_KEYS } from '../../config/storageKeys';
import { isStoredTrue, safeLocalStorageGet } from '../../utils/storage';

export interface PlaybackRecoveryDeps {
    getVideoPlayer: () => IVideoPlayer | null;
    getStreamResolver: () => IPlexStreamResolver | null;
    getScheduler: () => IChannelScheduler | null;

    getCurrentProgramForPlayback: () => ScheduledProgram | null;
    getCurrentStreamDescriptor: () => StreamDescriptor | null;
    getCurrentStreamDecision?: () => StreamDecision | null;

    setCurrentStreamDecision: (d: StreamDecision) => void;
    setCurrentStreamDescriptor: (d: StreamDescriptor) => void;

    buildPlexResourceUrl: (pathOrUrl: string) => string | null;
    getMimeType: (decision: StreamDecision) => string;
    getAuthHeaders: () => Record<string, string>;
    getServerUri: () => string | null;
    getPreferredSubtitleLanguage: () => string | null;
    getPlexPreferredSubtitleLanguage?: () => string | null;
    notifySubtitleUnavailable: () => void;

    handleGlobalError: (error: AppError, context: string) => void;
}

export class PlaybackRecoveryManager {
    // Playback fast-fail guard: prevents tight skip loops when all items fail to play.
    private _playbackFailureWindowStartMs: number = 0;
    private _playbackFailureCount: number = 0;
    private _playbackFailureTripped: boolean = false;
    private _playbackFailureWindowMs: number = 2000;
    private _playbackFailureTripCount: number = 3;

    // Prevent runaway recovery loops
    private _directFallbackAttemptedForItemKey: Set<string> = new Set();
    private _burnInAttemptedForItemKey: Set<string> = new Set();
    private _streamRecoveryInProgress: boolean = false;

    constructor(private readonly deps: PlaybackRecoveryDeps) { }

    private _isSubtitlesEnabled(): boolean {
        try {
            return isStoredTrue(safeLocalStorageGet(RETUNE_STORAGE_KEYS.SUBTITLES_ENABLED));
        } catch {
            return false;
        }
    }

    private _useGlobalSubtitlePreference(): boolean {
        try {
            return isStoredTrue(
                safeLocalStorageGet(RETUNE_STORAGE_KEYS.SUBTITLE_PREFERENCE_GLOBAL_OVERRIDE)
            );
        } catch {
            return false;
        }
    }

    private _preferForcedSubtitles(): boolean {
        try {
            return isStoredTrue(
                safeLocalStorageGet(RETUNE_STORAGE_KEYS.SUBTITLE_PREFER_FORCED)
            );
        } catch {
            return false;
        }
    }

    private _isExternalOnlyFilterEnabled(): boolean {
        try {
            return isStoredTrue(
                safeLocalStorageGet(RETUNE_STORAGE_KEYS.SUBTITLE_FILTER_EXTERNAL_ONLY)
            );
        } catch {
            return false;
        }
    }

    private _getCurrentItemKey(): string | null {
        const program = this.deps.getCurrentProgramForPlayback();
        if (!program) return null;
        const itemKey = program.item.ratingKey;
        return typeof itemKey === 'string' && itemKey.length > 0 ? itemKey : null;
    }

    private _getPreferredSubtitleLanguage(): string | null {
        try {
            const value = this.deps.getPreferredSubtitleLanguage();
            if (typeof value !== 'string') return null;
            const trimmed = value.trim();
            return trimmed.length > 0 ? trimmed : null;
        } catch {
            return null;
        }
    }

    private _getPlexPreferredSubtitleLanguage(): string | null {
        try {
            const getter = this.deps.getPlexPreferredSubtitleLanguage;
            if (!getter) return null;
            const value = getter();
            if (typeof value !== 'string') return null;
            const trimmed = value.trim();
            return trimmed.length > 0 ? trimmed : null;
        } catch {
            return null;
        }
    }

    private _getSubtitlePreferenceKey(itemKey: string): string {
        return `${RETUNE_STORAGE_KEYS.SUBTITLE_PREFERENCE_BY_ITEM_PREFIX}${itemKey}`;
    }

    private _readStoredPreference(key: string): { trackId: string; language: string; codec: string } | null {
        const raw = safeLocalStorageGet(key);
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw) as { trackId?: unknown; language?: unknown; codec?: unknown };
            if (
                typeof parsed.trackId === 'string' &&
                typeof parsed.language === 'string' &&
                typeof parsed.codec === 'string'
            ) {
                return {
                    trackId: parsed.trackId,
                    language: parsed.language,
                    codec: parsed.codec,
                };
            }
        } catch {
            return null;
        }
        return null;
    }

    private _resolvePreferredSubtitleId(
        itemKey: string | null,
        tracks: SubtitleTrack[]
    ): string | null {
        const externalOnly = this._isExternalOnlyFilterEnabled();
        const eligible = tracks.filter((t) => {
            if (!t.isTextCandidate || !(t.fetchableViaKey || Boolean(t.id))) {
                return false;
            }
            if (externalOnly && !t.fetchableViaKey) {
                return false;
            }
            return true;
        });
        if (eligible.length === 0) {
            return null;
        }

        const useGlobal = this._useGlobalSubtitlePreference() || !itemKey;
        const storedPreference = useGlobal
            ? this._readStoredPreference(RETUNE_STORAGE_KEYS.SUBTITLE_PREFERENCE_GLOBAL)
            : this._readStoredPreference(this._getSubtitlePreferenceKey(itemKey));
        if (storedPreference) {
            const byId = eligible.find((t) => t.id === storedPreference.trackId);
            if (byId) return byId.id;
            const byLangCodec = eligible.find(
                (t) =>
                    t.codec.toLowerCase() === storedPreference.codec.toLowerCase() &&
                    (t.languageCode.toLowerCase() === storedPreference.language.toLowerCase() ||
                        t.language.toLowerCase() === storedPreference.language.toLowerCase())
            );
            if (byLangCodec) return byLangCodec.id;
        }

        const appPreferredLanguage = this._getPreferredSubtitleLanguage();
        if (appPreferredLanguage) {
            const preferred = this._findSubtitleByLanguage(eligible, appPreferredLanguage);
            if (preferred) return preferred.id;
        } else {
            const plexPreferredLanguage = this._getPlexPreferredSubtitleLanguage();
            if (plexPreferredLanguage) {
                const preferred = this._findSubtitleByLanguage(eligible, plexPreferredLanguage);
                if (preferred) return preferred.id;
            }
        }

        const defaultLanguage =
            eligible.find((t) => t.default)?.languageCode ||
            eligible.find((t) => t.default)?.language ||
            null;
        if (defaultLanguage) {
            const preferred = this._findSubtitleByLanguage(eligible, defaultLanguage);
            if (preferred) return preferred.id;
        }

        const english = this._findSubtitleByLanguage(eligible, 'en') ??
            this._findSubtitleByLanguage(eligible, 'english');
        if (english) return english.id;

        return null;
    }

    private _findSubtitleByLanguage(tracks: SubtitleTrack[], language: string): SubtitleTrack | null {
        const normalized = language.trim().toLowerCase();
        const matches = tracks.filter((t) => {
            return (
                t.languageCode.toLowerCase() === normalized ||
                t.language.toLowerCase() === normalized
            );
        });
        if (matches.length === 0) return null;

        // Use setting to determine forced/full preference
        const preferForced = this._preferForcedSubtitles();
        if (preferForced) {
            const forced = matches.find((t) => t.forced);
            return forced ?? matches[0] ?? null;
        } else {
            const nonForced = matches.find((t) => !t.forced);
            return nonForced ?? matches[0] ?? null;
        }
    }

    private _mapAudioTracks(streams: PlexStream[]): AudioTrack[] {
        return streams.map((stream, index) => ({
            id: stream.id,
            title: stream.title ?? stream.language ?? 'Unknown',
            languageCode: (stream.languageCode ?? '').toLowerCase(),
            language: stream.language ?? 'Unknown',
            codec: (stream.codec ?? 'unknown').toLowerCase(),
            channels: typeof stream.channels === 'number' ? stream.channels : 0,
            index,
            default: stream.default ?? false,
        }));
    }

    private _mapSubtitleTracks(streams: PlexStream[]): SubtitleTrack[] {
        const baseTracks = streams.map((stream) => {
            const codec = (stream.codec ?? stream.format ?? 'unknown').toLowerCase();
            const format = (stream.format ?? stream.codec ?? 'unknown').toLowerCase();
            const languageCode = (stream.languageCode ?? '').toLowerCase();
            const language = (stream.language ?? languageCode) || 'Unknown';
            const isTextCandidate = TEXT_SUBTITLE_FORMATS.includes(codec);
            const fetchableViaKey = typeof stream.key === 'string' && stream.key.length > 0;
            const codecLabel = codec ? codec.toUpperCase() : 'Unknown';
            const languageLabel = language || 'Unknown';
            const key = typeof stream.key === 'string' && stream.key.length > 0 ? stream.key : undefined;
            return {
                id: stream.id,
                label: `${languageLabel} (${codecLabel})`,
                languageCode,
                language: languageLabel,
                codec,
                format,
                ...(key ? { key } : {}),
                forced: stream.forced ?? false,
                default: stream.default ?? false,
                isTextCandidate,
                fetchableViaKey,
                title: stream.title ?? '',
            };
        });

        const labelCounts = baseTracks.reduce<Record<string, number>>((acc, track) => {
            acc[track.label] = (acc[track.label] ?? 0) + 1;
            return acc;
        }, {});

        return baseTracks.map((track) => {
            let label = track.label;
            if ((labelCounts[label] ?? 0) > 1 && track.title) {
                label = `${label} • ${track.title}`;
            }
            if (track.forced) {
                label = `${label} • Forced`;
            }
            return {
                id: track.id,
                label,
                languageCode: track.languageCode,
                language: track.language,
                codec: track.codec,
                format: track.format,
                ...(track.key ? { key: track.key } : {}),
                forced: track.forced,
                default: track.default,
                isTextCandidate: track.isTextCandidate,
                fetchableViaKey: track.fetchableViaKey,
            };
        });
    }

    resetPlaybackFailureGuard(): void {
        this._playbackFailureWindowStartMs = 0;
        this._playbackFailureCount = 0;
        this._playbackFailureTripped = false;
        const scheduler = this.deps.getScheduler();
        if (scheduler) {
            scheduler.resumeSyncTimer();
        }
    }

    resetDirectFallbackAttempts(): void {
        this._directFallbackAttemptedForItemKey.clear();
        this._burnInAttemptedForItemKey.clear();
    }

    handlePlaybackFailure(context: string, error: unknown): void {
        if (this._playbackFailureTripped) {
            return;
        }

        const scheduler = this.deps.getScheduler();
        const now = Date.now();

        // Reset window if stale
        if (
            this._playbackFailureWindowStartMs === 0 ||
            now - this._playbackFailureWindowStartMs > this._playbackFailureWindowMs
        ) {
            this._playbackFailureWindowStartMs = now;
            this._playbackFailureCount = 0;
        }

        this._playbackFailureCount++;

        // Trip guard: stop auto-skipping and surface the error to the user
        if (this._playbackFailureCount >= this._playbackFailureTripCount) {
            this._playbackFailureTripped = true;
            if (scheduler) {
                scheduler.pauseSyncTimer();
            }
            const message = ((): string => {
                if (error instanceof Error) {
                    return error.message;
                }
                if (
                    error &&
                    typeof error === 'object' &&
                    'message' in error &&
                    typeof (error as { message?: unknown }).message === 'string'
                ) {
                    return (error as { message: string }).message;
                }
                return String(error);
            })();
            this.deps.handleGlobalError(
                {
                    code: AppErrorCode.PLAYBACK_FAILED,
                    message: `Playback failed repeatedly (${context}): ${message}`,
                    recoverable: true,
                },
                'playback'
            );
            return;
        }

        // Single/rare failure: skip as before
        if (scheduler) {
            scheduler.skipToNext();
        }
    }

    tryHandleStreamResolverAuthError(error: unknown): boolean {
        if (!error || typeof error !== 'object') {
            return false;
        }
        const maybe = error as Partial<StreamResolverError>;
        if (typeof maybe.code !== 'string' || typeof maybe.message !== 'string') {
            return false;
        }
        const mapped = mapPlexStreamErrorCodeToAppErrorCode(maybe.code as StreamResolverError['code']);
        if (
            mapped === AppErrorCode.AUTH_REQUIRED ||
            mapped === AppErrorCode.AUTH_EXPIRED ||
            mapped === AppErrorCode.AUTH_INVALID
        ) {
            this.deps.handleGlobalError(
                {
                    code: mapped,
                    message: maybe.message,
                    recoverable: Boolean(maybe.recoverable),
                },
                'plex-stream'
            );
            return true;
        }
        return false;
    }

    async resolveStreamForProgram(program: ScheduledProgram): Promise<StreamDescriptor> {
        const resolver = this.deps.getStreamResolver();
        if (!resolver) {
            throw new Error('Stream resolver not initialized');
        }

        // Defensive: clamp elapsed time to valid bounds
        const clampedOffset = Math.max(0, Math.min(program.elapsedMs, program.item.durationMs));

        const decision: StreamDecision = await resolver.resolveStream({
            itemKey: program.item.ratingKey,
            startOffsetMs: clampedOffset,
            directPlay: true,
        });
        this.deps.setCurrentStreamDecision(decision);

        return this._buildStreamDescriptor(program, decision, clampedOffset);
    }

    /**
     * Build a StreamDescriptor from a StreamDecision and ScheduledProgram.
     * Shared helper to reduce duplication between normal playback and transcode fallback.
     */
    private _buildStreamDescriptor(
        program: ScheduledProgram,
        decision: StreamDecision,
        startOffsetMs: number
    ): StreamDescriptor {
        // Build mediaMetadata carefully for exactOptionalPropertyTypes
        const metadata: StreamDescriptor['mediaMetadata'] = {
            title: program.item.title,
            durationMs: program.item.durationMs,
        };
        if (program.item.type === 'episode' && program.item.fullTitle) {
            metadata.subtitle = program.item.fullTitle;
        }
        if (program.item.thumb) {
            const thumbUrl = this.deps.buildPlexResourceUrl(program.item.thumb);
            if (thumbUrl) {
                metadata.thumb = thumbUrl;
            }
        }
        if (program.item.year !== undefined) {
            metadata.year = program.item.year;
        }

        const audioTracks = this._mapAudioTracks(decision.availableAudioStreams ?? []);
        const subtitlesEnabled = this._isSubtitlesEnabled();
        const subtitleTracks = subtitlesEnabled
            ? this._mapSubtitleTracks(decision.availableSubtitleStreams ?? [])
            : [];
        const itemKey = this._getCurrentItemKey();
        const preferredSubtitleTrackId = subtitlesEnabled
            ? this._resolvePreferredSubtitleId(itemKey, subtitleTracks)
            : null;
        const subtitleContext = subtitlesEnabled
            ? {
                serverUri: this.deps.getServerUri(),
                authHeaders: this.deps.getAuthHeaders(),
                itemKey: program.item.ratingKey,
                sessionId: decision.sessionId,
                onUnavailable: this.deps.notifySubtitleUnavailable,
            }
            : null;

        return {
            url: decision.playbackUrl,
            protocol: decision.protocol === 'hls' ? 'hls' : 'direct',
            mimeType: this.deps.getMimeType(decision),
            startPositionMs: startOffsetMs,
            mediaMetadata: metadata,
            subtitleTracks,
            audioTracks,
            ...(subtitleContext ? { subtitleContext } : {}),
            ...(preferredSubtitleTrackId !== undefined ? { preferredSubtitleTrackId } : {}),
            durationMs: program.item.durationMs,
            isLive: false,
        };
    }

    async attemptTranscodeFallbackForCurrentProgram(reason: string): Promise<boolean> {
        if (this._streamRecoveryInProgress) {
            return false;
        }
        const program = this.deps.getCurrentProgramForPlayback();
        const player = this.deps.getVideoPlayer();
        const resolver = this.deps.getStreamResolver();
        if (!program || !player || !resolver) {
            return false;
        }
        const programAtStart = program;
        const currentProtocol = this.deps.getCurrentStreamDescriptor()?.protocol ?? null;
        if (currentProtocol !== 'direct') {
            return false;
        }
        const itemKey = program.item.ratingKey;
        if (this._directFallbackAttemptedForItemKey.has(itemKey)) {
            return false;
        }

        this._directFallbackAttemptedForItemKey.add(itemKey);
        this._streamRecoveryInProgress = true;

        try {
            console.warn('[Orchestrator] Direct playback failed, retrying via HLS Direct Stream:', {
                reason,
                itemKey,
            });

            const clampedOffset = Math.max(0, Math.min(program.elapsedMs, program.item.durationMs));
            const decision: StreamDecision = await resolver.resolveStream({
                itemKey: itemKey,
                startOffsetMs: clampedOffset,
                directPlay: false,
            });
            if (this.deps.getCurrentProgramForPlayback() !== programAtStart) {
                return false;
            }
            this.deps.setCurrentStreamDecision(decision);

            const descriptor = this._buildStreamDescriptor(program, decision, clampedOffset);
            const preferredSubtitleTrackId = descriptor.preferredSubtitleTrackId;

            this.deps.setCurrentStreamDescriptor(descriptor);
            await player.loadStream(descriptor);
            if (preferredSubtitleTrackId) {
                await player.setSubtitleTrack(preferredSubtitleTrackId);
            }
            await player.play();
            this.resetPlaybackFailureGuard();
            return true;
        } catch (error) {
            console.error('[Orchestrator] Transcode fallback failed:', error);
            return false;
        } finally {
            this._streamRecoveryInProgress = false;
        }
    }

    async attemptBurnInSubtitleForCurrentProgram(trackId: string, reason: string): Promise<boolean> {
        if (this._streamRecoveryInProgress) {
            return false;
        }
        const program = this.deps.getCurrentProgramForPlayback();
        const player = this.deps.getVideoPlayer();
        const resolver = this.deps.getStreamResolver();
        if (!program || !player || !resolver) {
            return false;
        }

        const itemKey = program.item.ratingKey;
        const attemptKey = `${itemKey}::${trackId}`;
        if (this._burnInAttemptedForItemKey.has(attemptKey)) {
            return false;
        }

        const currentDescriptor = this.deps.getCurrentStreamDescriptor();
        const currentDecision = this.deps.getCurrentStreamDecision?.() ?? null;
        if (
            currentDescriptor?.protocol === 'hls' &&
            currentDecision?.transcodeRequest?.subtitleMode === 'burn' &&
            currentDecision.transcodeRequest.subtitleStreamId === trackId
        ) {
            return false;
        }

        this._streamRecoveryInProgress = true;

        try {
            console.warn('[PlaybackRecovery] Reloading for burn-in subtitles:', {
                reason,
                itemKey,
                trackId,
            });

            const livePosition = (() => {
                try {
                    const value = player.getCurrentTimeMs();
                    return Number.isFinite(value) ? value : null;
                } catch {
                    return null;
                }
            })();
            const baseOffset = typeof livePosition === 'number' ? livePosition : program.elapsedMs;
            const clampedOffset = Math.max(0, Math.min(baseOffset, program.item.durationMs));
            const activeAudioId = player.getState()?.activeAudioId ?? null;
            const decision: StreamDecision = await resolver.resolveStream({
                itemKey,
                startOffsetMs: clampedOffset,
                directPlay: false,
                subtitleStreamId: trackId,
                subtitleMode: 'burn',
                ...(activeAudioId ? { audioStreamId: activeAudioId } : {}),
            });
            if (this.deps.getCurrentProgramForPlayback() !== program) {
                return false;
            }
            this.deps.setCurrentStreamDecision(decision);

            const descriptor = this._buildStreamDescriptor(program, decision, clampedOffset);
            // Override preferred subtitle to the burn-in track that triggered this reload.
            const descriptorWithBurnIn = { ...descriptor, preferredSubtitleTrackId: trackId };
            this.deps.setCurrentStreamDescriptor(descriptorWithBurnIn);

            await player.loadStream(descriptorWithBurnIn);
            await player.play();
            this.resetPlaybackFailureGuard();
            this._burnInAttemptedForItemKey.add(attemptKey);
            return true;
        } catch (error) {
            console.error('[PlaybackRecovery] Burn-in reload failed:', error);
            return false;
        } finally {
            this._streamRecoveryInProgress = false;
        }
    }
}
