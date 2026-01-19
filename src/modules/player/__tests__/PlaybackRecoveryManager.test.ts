import { PlaybackRecoveryManager, type PlaybackRecoveryDeps } from '../PlaybackRecoveryManager';
import { AppErrorCode } from '../../lifecycle';
import type { IVideoPlayer, StreamDescriptor } from '../index';
import type { IPlexStreamResolver, StreamDecision } from '../../plex/stream';
import type { IChannelScheduler, ScheduledProgram } from '../../scheduler/scheduler';

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
        channelId: 'ch1',
        ...overrides,
    } as ScheduledProgram);

const makeDecision = (overrides: Partial<StreamDecision> = {}): StreamDecision =>
    ({
        playbackUrl: 'http://test/stream.m3u8',
        protocol: 'hls',
        container: 'mpegts',
        ...overrides,
    } as StreamDecision);

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
    } as unknown as IChannelScheduler;
    const resolver: IPlexStreamResolver = {
        resolveStream: jest.fn().mockResolvedValue(makeDecision()),
    } as unknown as IPlexStreamResolver;
    const player: IVideoPlayer = {
        loadStream: jest.fn().mockResolvedValue(undefined),
        play: jest.fn().mockResolvedValue(undefined),
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
        handleGlobalError: jest.fn(),
        ...overrides,
    };

    const manager = new PlaybackRecoveryManager(deps);
    return { manager, deps, scheduler, resolver, player };
};

describe('PlaybackRecoveryManager', () => {
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
});
