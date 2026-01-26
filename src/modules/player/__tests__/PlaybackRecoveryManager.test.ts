import { PlaybackRecoveryManager, type PlaybackRecoveryDeps } from '../PlaybackRecoveryManager';
import { AppErrorCode } from '../../lifecycle';
import type { IVideoPlayer, StreamDescriptor } from '../index';
import type { IPlexStreamResolver, StreamDecision } from '../../plex/stream';
import type { PlexStream } from '../../plex/shared/types';
import type { IChannelScheduler, ScheduledProgram } from '../../scheduler/scheduler';
import { RETUNE_STORAGE_KEYS } from '../../../config/storageKeys';

const makeProgram = (overrides: Partial<ScheduledProgram> = {}): ScheduledProgram =>
    ({
        item: {
            ratingKey: 'item-1',
            title: 'Test Item',
            durationMs: 60000,
            type: 'movie',
        } as unknown as ScheduledProgram['item'],
        elapsedMs: 5000,
        scheduledStartTime: 0,
        scheduledEndTime: 0,
        remainingMs: 0,
        scheduleIndex: 0,
        ...overrides,
    } as ScheduledProgram);

const makeDecision = (overrides: Partial<StreamDecision> = {}): StreamDecision =>
    ({
        playbackUrl: 'http://test/stream.m3u8',
        protocol: 'hls',
        container: 'mpegts',
        sessionId: 'sess-1',
        availableSubtitleStreams: [],
        availableAudioStreams: [],
        ...overrides,
    } as StreamDecision);

const makeSubtitleStreams = (): PlexStream[] => [
    {
        id: 'sub-full',
        streamType: 3,
        language: 'English',
        languageCode: 'en',
        codec: 'srt',
        format: 'srt',
        key: '/library/streams/1',
        forced: false,
        default: false,
        title: 'Full',
    },
    {
        id: 'sub-forced',
        streamType: 3,
        language: 'English',
        languageCode: 'en',
        codec: 'srt',
        format: 'srt',
        key: '/library/streams/2',
        forced: true,
        default: false,
        title: 'Forced',
    },
];

const createLocalStorageMock = (): Storage => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string): string | null => (
            Object.prototype.hasOwnProperty.call(store, key) ? (store[key] ?? null) : null
        ),
        setItem: (key: string, value: string): void => {
            store[key] = String(value);
        },
        removeItem: (key: string): void => {
            delete store[key];
        },
        clear: (): void => {
            store = {};
        },
        key: (index: number): string | null => Object.keys(store)[index] ?? null,
        get length(): number {
            return Object.keys(store).length;
        },
    } as Storage;
};

const setup = (overrides: Partial<PlaybackRecoveryDeps> = {}): {
    manager: PlaybackRecoveryManager;
    deps: PlaybackRecoveryDeps;
    scheduler: IChannelScheduler;
    resolver: IPlexStreamResolver;
    player: IVideoPlayer;
} => {
    const program = makeProgram();
    const scheduler: IChannelScheduler = {
        pauseSyncTimer: jest.fn(),
        resumeSyncTimer: jest.fn(),
        skipToNext: jest.fn(),
        getState: jest.fn().mockReturnValue({ channelId: 'ch1' }),
    } as unknown as IChannelScheduler;
    const resolver: IPlexStreamResolver = {
        resolveStream: jest.fn().mockResolvedValue(makeDecision()),
    } as unknown as IPlexStreamResolver;
    const player: IVideoPlayer = {
        loadStream: jest.fn().mockResolvedValue(undefined),
        play: jest.fn().mockResolvedValue(undefined),
        getState: jest.fn().mockReturnValue({ activeAudioId: null }),
    } as unknown as IVideoPlayer;
    const deps: PlaybackRecoveryDeps = {
        getVideoPlayer: () => player,
        getStreamResolver: () => resolver,
        getScheduler: () => scheduler,
        getCurrentProgramForPlayback: () => program,
        getCurrentStreamDescriptor: () => ({ protocol: 'direct' } as StreamDescriptor),
        setCurrentStreamDecision: jest.fn(),
        setCurrentStreamDescriptor: jest.fn(),
        buildPlexResourceUrl: (pathOrUrl: string) => pathOrUrl,
        getMimeType: () => 'video/mp4',
        getAuthHeaders: () => ({ 'X-Plex-Token': 'token' }),
        getServerUri: () => 'http://example.com',
        getPreferredSubtitleLanguage: () => null,
        getPlexPreferredSubtitleLanguage: () => null,
        notifySubtitleUnavailable: jest.fn(),
        handleGlobalError: jest.fn(),
        ...overrides,
    };

    const manager = new PlaybackRecoveryManager(deps);
    return { manager, deps, scheduler, resolver, player };
};

describe('PlaybackRecoveryManager', () => {
    beforeEach(() => {
        if (!globalThis.localStorage) {
            (globalThis as { localStorage?: Storage }).localStorage = createLocalStorageMock();
        } else {
            globalThis.localStorage.clear();
        }
    });

    afterEach(() => {
        localStorage.removeItem(RETUNE_STORAGE_KEYS.SUBTITLES_ENABLED);
        localStorage.removeItem(RETUNE_STORAGE_KEYS.SUBTITLE_PREFER_FORCED);
        localStorage.removeItem(RETUNE_STORAGE_KEYS.SUBTITLE_FILTER_EXTERNAL_ONLY);
    });
    it('resets playback failure guard and resumes scheduler', () => {
        const { manager, scheduler } = setup();

        manager.resetPlaybackFailureGuard();

        expect(scheduler.resumeSyncTimer).toHaveBeenCalled();
    });

    it('skips on failures until tripped, then pauses and surfaces error', () => {
        const { manager, scheduler, deps } = setup();
        const handleGlobalError = deps.handleGlobalError as jest.Mock;

        manager.handlePlaybackFailure('context', new Error('boom'));
        manager.handlePlaybackFailure('context', new Error('boom'));

        expect(scheduler.skipToNext).toHaveBeenCalledTimes(2);
        expect(scheduler.pauseSyncTimer).not.toHaveBeenCalled();

        manager.handlePlaybackFailure('context', new Error('boom'));

        expect(scheduler.pauseSyncTimer).toHaveBeenCalled();
        expect(handleGlobalError).toHaveBeenCalledWith(
            {
                code: AppErrorCode.PLAYBACK_FAILED,
                message: 'Playback failed repeatedly (context): boom',
                recoverable: true,
            },
            'playback'
        );
    });

    it('handles stream resolver auth errors', () => {
        const { manager, deps } = setup();
        const handleGlobalError = deps.handleGlobalError as jest.Mock;

        const handled = manager.tryHandleStreamResolverAuthError({
            code: 'AUTH_REQUIRED',
            message: 'Auth required',
            recoverable: true,
        });

        expect(handled).toBe(true);
        expect(handleGlobalError).toHaveBeenCalledWith(
            {
                code: AppErrorCode.AUTH_REQUIRED,
                message: 'Auth required',
                recoverable: true,
            },
            'plex-stream'
        );
    });

    it('resolves stream for program and records decision', async () => {
        const { manager, resolver, deps } = setup({
            getCurrentProgramForPlayback: () => makeProgram({ elapsedMs: 999999 }),
        });
        const setDecision = deps.setCurrentStreamDecision as jest.Mock;

        const stream = await manager.resolveStreamForProgram(makeProgram({ elapsedMs: 999999 }));

        expect(resolver.resolveStream).toHaveBeenCalledWith(
            expect.objectContaining({
                itemKey: 'item-1',
                startOffsetMs: 60000,
                directPlay: true,
            })
        );
        expect(setDecision).toHaveBeenCalled();
        expect(stream.protocol).toBe('hls');
    });

    it('attempts transcode fallback only for direct protocol', async () => {
        const { manager, resolver, player } = setup({
            getCurrentStreamDescriptor: () => ({ protocol: 'hls' } as StreamDescriptor),
        });

        const ok = await manager.attemptTranscodeFallbackForCurrentProgram('reason');

        expect(ok).toBe(false);
        expect(resolver.resolveStream).not.toHaveBeenCalled();
        expect(player.loadStream).not.toHaveBeenCalled();
    });

    it('attempts transcode fallback when direct protocol and plays', async () => {
        const { manager, resolver, player, deps } = setup();
        const setDescriptor = deps.setCurrentStreamDescriptor as jest.Mock;

        const ok = await manager.attemptTranscodeFallbackForCurrentProgram('reason');

        expect(ok).toBe(true);
        expect(resolver.resolveStream).toHaveBeenCalledWith(
            expect.objectContaining({
                itemKey: 'item-1',
                startOffsetMs: 5000,
                directPlay: false,
            })
        );
        expect(setDescriptor).toHaveBeenCalled();
        expect(player.loadStream).toHaveBeenCalled();
        expect(player.play).toHaveBeenCalled();
    });

    it('prefers stored per-item subtitle preference when available', async () => {
        localStorage.setItem(RETUNE_STORAGE_KEYS.SUBTITLES_ENABLED, '1');
        localStorage.setItem(
            `${RETUNE_STORAGE_KEYS.SUBTITLE_PREFERENCE_BY_ITEM_PREFIX}item-1`,
            JSON.stringify({ trackId: 'sub-full', language: 'en', codec: 'srt', lastUpdated: Date.now() })
        );

        const decision = makeDecision({ availableSubtitleStreams: makeSubtitleStreams() });
        const { manager, resolver } = setup();
        (resolver.resolveStream as jest.Mock).mockResolvedValue(decision);

        const stream = await manager.resolveStreamForProgram(makeProgram());

        expect(stream.preferredSubtitleTrackId).toBe('sub-full');
    });

    it('filters out keyless subtitles when external-only is enabled', async () => {
        localStorage.setItem(RETUNE_STORAGE_KEYS.SUBTITLES_ENABLED, '1');
        localStorage.setItem(RETUNE_STORAGE_KEYS.SUBTITLE_FILTER_EXTERNAL_ONLY, '1');

        const keylessStream: PlexStream = {
            id: 'sub-keyless',
            streamType: 3,
            language: 'English',
            languageCode: 'en',
            codec: 'srt',
            format: 'srt',
            forced: false,
            default: true,
            title: 'Keyless',
        };
        const decision = makeDecision({ availableSubtitleStreams: [keylessStream] });
        const { manager, resolver } = setup();
        (resolver.resolveStream as jest.Mock).mockResolvedValue(decision);

        const stream = await manager.resolveStreamForProgram(makeProgram());

        expect(stream.preferredSubtitleTrackId).toBeNull();
    });

    it('skips burn-in reload when already in burn-in HLS for track', async () => {
        const { manager, resolver } = setup({
            getCurrentStreamDescriptor: () => ({ protocol: 'hls' } as StreamDescriptor),
            getCurrentStreamDecision: () => ({
                transcodeRequest: {
                    sessionId: 'sess-1',
                    maxBitrate: 2000,
                    subtitleStreamId: 'burn-1',
                    subtitleMode: 'burn',
                },
            } as StreamDecision),
        });

        const ok = await manager.attemptBurnInSubtitleForCurrentProgram('burn-1', 'test');

        expect(ok).toBe(false);
        expect(resolver.resolveStream).not.toHaveBeenCalled();
    });

    it('prefers forced subtitles when preference is enabled', async () => {
        localStorage.setItem(RETUNE_STORAGE_KEYS.SUBTITLES_ENABLED, '1');
        localStorage.setItem(RETUNE_STORAGE_KEYS.SUBTITLE_PREFER_FORCED, '1');

        const resolver: IPlexStreamResolver = {
            resolveStream: jest.fn().mockResolvedValue(
                makeDecision({ availableSubtitleStreams: makeSubtitleStreams() })
            ),
        } as unknown as IPlexStreamResolver;

        const { manager } = setup({
            getStreamResolver: () => resolver,
            getPreferredSubtitleLanguage: () => 'en',
        });
        const stream = await manager.resolveStreamForProgram(makeProgram());

        expect(stream.preferredSubtitleTrackId).toBe('sub-forced');
    });

    it('prefers full subtitles when preference is disabled', async () => {
        localStorage.setItem(RETUNE_STORAGE_KEYS.SUBTITLES_ENABLED, '1');
        localStorage.setItem(RETUNE_STORAGE_KEYS.SUBTITLE_PREFER_FORCED, '0');

        const resolver: IPlexStreamResolver = {
            resolveStream: jest.fn().mockResolvedValue(
                makeDecision({ availableSubtitleStreams: makeSubtitleStreams() })
            ),
        } as unknown as IPlexStreamResolver;

        const { manager } = setup({
            getStreamResolver: () => resolver,
            getPreferredSubtitleLanguage: () => 'en',
        });
        const stream = await manager.resolveStreamForProgram(makeProgram());

        expect(stream.preferredSubtitleTrackId).toBe('sub-full');
    });
});
