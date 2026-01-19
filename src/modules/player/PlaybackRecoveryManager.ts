import { AppErrorCode, type AppError } from '../lifecycle';
import {
    mapPlexStreamErrorCodeToAppErrorCode,
    type IPlexStreamResolver,
    type StreamDecision,
    type StreamResolverError,
} from '../plex/stream';
import type { IChannelScheduler, ScheduledProgram } from '../scheduler/scheduler';
import type { IVideoPlayer, StreamDescriptor } from './index';

export interface PlaybackRecoveryDeps {
    getVideoPlayer: () => IVideoPlayer | null;
    getStreamResolver: () => IPlexStreamResolver | null;
    getScheduler: () => IChannelScheduler | null;

    getCurrentProgramForPlayback: () => ScheduledProgram | null;
    getCurrentStreamDescriptor: () => StreamDescriptor | null;

    setCurrentStreamDecision: (d: StreamDecision) => void;
    setCurrentStreamDescriptor: (d: StreamDescriptor) => void;

    buildPlexResourceUrl: (pathOrUrl: string) => string | null;
    getMimeType: (decision: StreamDecision) => string;

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
    private _streamRecoveryInProgress: boolean = false;

    constructor(private readonly deps: PlaybackRecoveryDeps) {}

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

        return {
            url: decision.playbackUrl,
            protocol: decision.protocol === 'hls' ? 'hls' : 'direct',
            mimeType: this.deps.getMimeType(decision),
            startPositionMs: clampedOffset,
            mediaMetadata: metadata,
            subtitleTracks: [],
            audioTracks: [],
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

            const descriptor: StreamDescriptor = {
                url: decision.playbackUrl,
                protocol: decision.protocol === 'hls' ? 'hls' : 'direct',
                mimeType: this.deps.getMimeType(decision),
                startPositionMs: clampedOffset,
                mediaMetadata: metadata,
                subtitleTracks: [],
                audioTracks: [],
                durationMs: program.item.durationMs,
                isLive: false,
            };

            this.deps.setCurrentStreamDescriptor(descriptor);
            await player.loadStream(descriptor);
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
}
