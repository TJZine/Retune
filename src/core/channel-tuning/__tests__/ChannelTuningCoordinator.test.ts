import { ChannelTuningCoordinator } from '../ChannelTuningCoordinator';
import { AppErrorCode } from '../../../modules/lifecycle';
import type { IVideoPlayer } from '../../../modules/player';
import type {
    IChannelManager,
    ChannelConfig,
    ResolvedChannelContent,
} from '../../../modules/scheduler/channel-manager';
import type {
    IChannelScheduler,
    ScheduleConfig,
} from '../../../modules/scheduler/scheduler';

const mockChannel = {
    id: 'ch1',
    name: 'Channel 1',
    number: 1,
} as ChannelConfig;

const resolvedContent: ResolvedChannelContent = {
    channelId: 'ch1',
    items: [],
    orderedItems: [],
    totalDurationMs: 0,
    resolvedAt: 0,
};

const createScheduleConfig = (channelId: string, anchorTime: number): ScheduleConfig => ({
    channelId,
    anchorTime,
    content: [],
    playbackMode: 'sequential',
    shuffleSeed: 0,
    loopSchedule: true,
});

type CoordinatorHarness = {
    coordinator: ChannelTuningCoordinator;
    deps: {
        getChannelManager: () => IChannelManager | null;
        getScheduler: () => IChannelScheduler | null;
        getVideoPlayer: () => IVideoPlayer | null;
        buildDailyScheduleConfig: jest.Mock<ScheduleConfig, [ChannelConfig, ResolvedChannelContent['items'], number]>;
        getLocalDayKey: jest.Mock<number, [number]>;
        setActiveScheduleDayKey: jest.Mock<void, [number]>;
        setPendingNowPlayingChannelId: jest.Mock<void, [string | null]>;
        getPendingNowPlayingChannelId: jest.Mock<string | null, []>;
        notifyNowPlaying: jest.Mock<void, [unknown]>;
        resetPlaybackGuardsForNewChannel: jest.Mock<void, []>;
        stopActiveTranscodeSession: jest.Mock<void, []>;
        handleGlobalError: jest.Mock<void, [unknown, string]>;
        saveLifecycleState: jest.Mock<Promise<void>, []>;
    };
    channelManager: jest.Mocked<IChannelManager>;
    scheduler: jest.Mocked<IChannelScheduler>;
    videoPlayer: jest.Mocked<IVideoPlayer>;
    buildDailyScheduleConfig: jest.Mock<ScheduleConfig, [ChannelConfig, ResolvedChannelContent['items'], number]>;
};

const createCoordinator = (): CoordinatorHarness => {
    const channelManager = {
        getChannel: jest.fn().mockReturnValue(mockChannel),
        getChannelByNumber: jest.fn().mockReturnValue(mockChannel),
        resolveChannelContent: jest.fn().mockResolvedValue(resolvedContent),
        setCurrentChannel: jest.fn(),
    } as unknown as jest.Mocked<IChannelManager>;

    const scheduler = {
        loadChannel: jest.fn(),
        syncToCurrentTime: jest.fn(),
        getCurrentProgram: jest.fn().mockReturnValue(null),
    } as unknown as jest.Mocked<IChannelScheduler>;

    const videoPlayer = {
        stop: jest.fn(),
    } as unknown as jest.Mocked<IVideoPlayer>;

    const buildDailyScheduleConfig = jest.fn((
        channel: ChannelConfig,
        items: ResolvedChannelContent['items'],
        now: number
    ) => {
        void items;
        return createScheduleConfig(channel.id, now);
    });

    const deps = {
        getChannelManager: (): IChannelManager => channelManager,
        getScheduler: (): IChannelScheduler => scheduler,
        getVideoPlayer: (): IVideoPlayer => videoPlayer,
        buildDailyScheduleConfig,
        getLocalDayKey: jest.fn<number, [number]>().mockReturnValue(123),
        setActiveScheduleDayKey: jest.fn<void, [number]>(),
        setPendingNowPlayingChannelId: jest.fn<void, [string | null]>(),
        getPendingNowPlayingChannelId: jest.fn<string | null, []>().mockReturnValue(null),
        notifyNowPlaying: jest.fn<void, [unknown]>(),
        resetPlaybackGuardsForNewChannel: jest.fn<void, []>(),
        stopActiveTranscodeSession: jest.fn<void, []>(),
        handleGlobalError: jest.fn<void, [unknown, string]>(),
        saveLifecycleState: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    };

    const coordinator = new ChannelTuningCoordinator(deps);

    return { coordinator, deps, channelManager, scheduler, videoPlayer, buildDailyScheduleConfig };
};

describe('ChannelTuningCoordinator', () => {
    it('passes AbortSignal into resolveChannelContent', async () => {
        const { coordinator, channelManager } = createCoordinator();
        const controller = new AbortController();

        await coordinator.switchToChannel('ch1', { signal: controller.signal });

        expect(channelManager.resolveChannelContent).toHaveBeenCalledWith('ch1', { signal: controller.signal });
    });

    it('uses a single now for schedule + dayKey', async () => {
        const { coordinator, deps, buildDailyScheduleConfig } = createCoordinator();
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

        await coordinator.switchToChannel('ch1');

        expect(buildDailyScheduleConfig).toHaveBeenCalledWith(mockChannel, resolvedContent.items, 1_000_000);
        expect(deps.getLocalDayKey).toHaveBeenCalledWith(1_000_000);
        expect(deps.setActiveScheduleDayKey).toHaveBeenCalledWith(123);

        nowSpy.mockRestore();
    });

    it('stops any active transcode session when switching channels', async () => {
        const { coordinator, deps, videoPlayer } = createCoordinator();

        await coordinator.switchToChannel('ch1');

        expect(deps.stopActiveTranscodeSession).toHaveBeenCalledTimes(1);
        expect(videoPlayer.stop).toHaveBeenCalledTimes(1);
    });

    it('propagates ChannelError code + recoverable', async () => {
        const { coordinator, deps, channelManager, scheduler, videoPlayer } = createCoordinator();
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

        channelManager.resolveChannelContent.mockRejectedValue({
            name: 'ChannelError',
            code: 'SCHEDULER_EMPTY_CHANNEL',
            message: 'No playable content found after filtering',
            recoverable: false,
        });

        await coordinator.switchToChannel('ch1');

        expect(deps.handleGlobalError).toHaveBeenCalledWith(
            {
                code: 'SCHEDULER_EMPTY_CHANNEL',
                message: 'No playable content found after filtering',
                recoverable: false,
            },
            'switchToChannel'
        );
        expect(videoPlayer.stop).not.toHaveBeenCalled();
        expect(scheduler.loadChannel).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
    });

    it('logs a safe error summary on resolve failures', async () => {
        const { coordinator, deps, channelManager } = createCoordinator();
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

        channelManager.resolveChannelContent.mockRejectedValue({
            name: 'ChannelError',
            code: 'CONTENT_UNAVAILABLE',
            message: 'Boom',
            url: 'https://example.com?X-Plex-Token=abc',
        });

        await coordinator.switchToChannel('ch1');

        expect(consoleSpy).toHaveBeenCalledWith('Failed to resolve channel content:', {
            name: 'ChannelError',
            code: 'CONTENT_UNAVAILABLE',
            message: 'Boom',
        });
        expect(deps.handleGlobalError).toHaveBeenCalledWith(
            {
                code: 'CONTENT_UNAVAILABLE',
                message: 'Boom',
                recoverable: false,
            },
            'switchToChannel'
        );

        consoleSpy.mockRestore();
    });

    it('aborts silently on AbortError', async () => {
        const { coordinator, deps, channelManager, videoPlayer } = createCoordinator();
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

        channelManager.resolveChannelContent.mockRejectedValue({
            name: 'AbortError',
            message: 'cancelled',
        });

        await coordinator.switchToChannel('ch1', { signal: new AbortController().signal });

        expect(deps.handleGlobalError).not.toHaveBeenCalled();
        expect(videoPlayer.stop).not.toHaveBeenCalled();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(consoleWarnSpy).not.toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    it('returns silently when signal is already aborted', async () => {
        const { coordinator, deps, channelManager, scheduler, videoPlayer } = createCoordinator();
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        const controller = new AbortController();
        controller.abort();

        await coordinator.switchToChannel('ch1', { signal: controller.signal });

        expect(channelManager.resolveChannelContent).not.toHaveBeenCalled();
        expect(deps.resetPlaybackGuardsForNewChannel).not.toHaveBeenCalled();
        expect(videoPlayer.stop).not.toHaveBeenCalled();
        expect(scheduler.loadChannel).not.toHaveBeenCalled();
        expect(deps.setPendingNowPlayingChannelId).not.toHaveBeenCalled();
        expect(deps.handleGlobalError).not.toHaveBeenCalled();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(consoleWarnSpy).not.toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    it('returns silently when aborted after content resolution', async () => {
        const { coordinator, deps, channelManager, scheduler, videoPlayer } = createCoordinator();
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        const controller = new AbortController();

        channelManager.resolveChannelContent.mockImplementation(async () => {
            controller.abort();
            return resolvedContent;
        });

        await coordinator.switchToChannel('ch1', { signal: controller.signal });

        expect(deps.handleGlobalError).not.toHaveBeenCalled();
        expect(videoPlayer.stop).not.toHaveBeenCalled();
        expect(scheduler.loadChannel).not.toHaveBeenCalled();
        expect(deps.setPendingNowPlayingChannelId).not.toHaveBeenCalled();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(consoleWarnSpy).not.toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    it('guards against concurrent channel switches', async () => {
        const { coordinator, channelManager } = createCoordinator();
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
        let resolveDelay: () => void = () => {};

        channelManager.resolveChannelContent.mockImplementation(
            () => new Promise((resolve) => {
                resolveDelay = (): void => resolve(resolvedContent);
            })
        );

        const switch1 = coordinator.switchToChannel('ch1');
        const switch2 = coordinator.switchToChannel('ch2');

        await switch2;
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('already in progress'));
        expect(channelManager.resolveChannelContent).toHaveBeenCalledTimes(1);

        resolveDelay();
        await switch1;

        consoleSpy.mockRestore();
    });

    it('reports CHANNEL_NOT_FOUND when switchToChannel misses', async () => {
        const { coordinator, deps, channelManager, videoPlayer, scheduler } = createCoordinator();
        channelManager.getChannel.mockReturnValue(null);

        await coordinator.switchToChannel('missing');

        expect(deps.handleGlobalError).toHaveBeenCalledWith(
            {
                code: AppErrorCode.CHANNEL_NOT_FOUND,
                message: 'Channel missing not found',
                recoverable: true,
            },
            'switchToChannel'
        );
        expect(videoPlayer.stop).not.toHaveBeenCalled();
        expect(scheduler.loadChannel).not.toHaveBeenCalled();
    });

    it('preserves success call order', async () => {
        const { coordinator, deps, channelManager, scheduler, videoPlayer } = createCoordinator();

        await coordinator.switchToChannel('ch1');

        const resolveOrder = channelManager.resolveChannelContent.mock.invocationCallOrder[0] ?? 0;
        const stopOrder = videoPlayer.stop.mock.invocationCallOrder[0] ?? 0;
        const loadOrder = scheduler.loadChannel.mock.invocationCallOrder[0] ?? 0;
        const syncOrder = scheduler.syncToCurrentTime.mock.invocationCallOrder[0] ?? 0;
        const setCurrentOrder = channelManager.setCurrentChannel.mock.invocationCallOrder[0] ?? 0;
        const saveOrder = deps.saveLifecycleState.mock.invocationCallOrder[0] ?? 0;

        expect(resolveOrder).toBeLessThan(stopOrder);
        expect(loadOrder).toBeGreaterThan(0);
        expect(syncOrder).toBeGreaterThan(loadOrder);
        expect(setCurrentOrder).toBeGreaterThan(syncOrder);
        expect(saveOrder).toBeGreaterThan(setCurrentOrder);
        expect(deps.saveLifecycleState).toHaveBeenCalledTimes(1);
    });

    it('reports CHANNEL_NOT_FOUND when switchToChannelByNumber misses', async () => {
        const { coordinator, deps, channelManager } = createCoordinator();
        channelManager.getChannelByNumber.mockReturnValue(null);

        await coordinator.switchToChannelByNumber(999);

        expect(deps.handleGlobalError).toHaveBeenCalledWith(
            {
                code: AppErrorCode.CHANNEL_NOT_FOUND,
                message: 'Channel 999 not found',
                recoverable: true,
            },
            'switchToChannelByNumber'
        );
    });
});
