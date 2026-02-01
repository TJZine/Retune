/**
 * @jest-environment jsdom
 */
import { MiniGuideCoordinator } from '../MiniGuideCoordinator';
import type { IMiniGuideOverlay } from '../interfaces';
import type { IChannelManager, ChannelConfig } from '../../../scheduler/channel-manager';
import type { IChannelScheduler, ScheduledProgram, ScheduleConfig } from '../../../scheduler/scheduler';
import type { ResolvedChannelContent, ResolvedContentItem } from '../../../scheduler/channel-manager/types';

const AUTO_HIDE_MS = 1000;

type Deferred<T> = {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
};

const makeDeferred = <T,>(): Deferred<T> => {
    let resolve: (value: T) => void = () => undefined;
    let reject: (reason?: unknown) => void = () => undefined;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

const makeItem = (title: string, durationMs: number, index: number): ResolvedContentItem => ({
    ratingKey: `rk-${title}`,
    type: 'movie',
    title,
    fullTitle: title,
    durationMs,
    thumb: null,
    year: 2024,
    scheduledIndex: index,
});

const makeResolvedContent = (channelId: string): ResolvedChannelContent => ({
    channelId,
    resolvedAt: 0,
    items: [
        makeItem(`${channelId}-Now`, 60_000, 0),
        makeItem(`${channelId}-Next`, 60_000, 1),
    ],
    totalDurationMs: 120_000,
    orderedItems: [],
});

const makeProgram = (title: string): ScheduledProgram => ({
    item: makeItem(title, 60_000, 0),
    scheduledStartTime: 0,
    scheduledEndTime: 60_000,
    elapsedMs: 10_000,
    remainingMs: 50_000,
    scheduleIndex: 0,
    loopNumber: 0,
    streamDescriptor: null,
    isCurrent: true,
});

const makeOverlay = (): IMiniGuideOverlay & { _visible: boolean } => {
    const overlay = {
        _visible: false,
        initialize: jest.fn(),
        destroy: jest.fn(),
        show: jest.fn(() => {
            overlay._visible = true;
        }),
        hide: jest.fn(() => {
            overlay._visible = false;
        }),
        isVisible: jest.fn(() => overlay._visible),
        setViewModel: jest.fn(),
        setFocusedIndex: jest.fn(),
    } as unknown as IMiniGuideOverlay & { _visible: boolean };
    return overlay;
};

const makeChannel = (id: string, number: number): ChannelConfig => ({
    id,
    name: `Channel ${number}`,
    number,
    playbackMode: 'sequential',
    shuffleSeed: 1,
    phaseSeed: 0,
} as ChannelConfig);

const buildScheduleConfig = (
    channel: ChannelConfig,
    items: ResolvedChannelContent['items'],
    referenceTimeMs: number
): ScheduleConfig => ({
    channelId: channel.id,
    anchorTime: referenceTimeMs,
    content: items,
    playbackMode: channel.playbackMode,
    shuffleSeed: channel.shuffleSeed ?? 0,
    loopSchedule: true,
});

const setup = (overrides?: Partial<{
    scheduler: IChannelScheduler | null;
    autoHideMs: number;
    channels: ChannelConfig[];
    currentChannel: ChannelConfig | null;
}>): {
    coordinator: MiniGuideCoordinator;
    overlay: IMiniGuideOverlay & { _visible: boolean };
    channelManager: IChannelManager;
    scheduler: IChannelScheduler;
    resolveDeferred: Record<string, Deferred<ResolvedChannelContent>>;
    switchToChannel: jest.Mock<Promise<void>, [string]>;
} => {
    const overlay = makeOverlay();
    const channels = overrides?.channels ?? [
        makeChannel('ch1', 1),
        makeChannel('ch2', 2),
        makeChannel('ch3', 3),
        makeChannel('ch4', 4),
        makeChannel('ch5', 5),
        makeChannel('ch6', 6),
    ];
    const currentChannel = overrides && 'currentChannel' in overrides
        ? overrides.currentChannel ?? null
        : (channels[2] ?? channels[0] ?? null);
    const resolveDeferred: Record<string, Deferred<ResolvedChannelContent>> = {};
    channels.forEach((channel) => {
        resolveDeferred[channel.id] = makeDeferred<ResolvedChannelContent>();
    });

    const channelManager = {
        getAllChannels: jest.fn().mockReturnValue(channels),
        getCurrentChannel: jest.fn().mockReturnValue(currentChannel),
        resolveChannelContent: jest.fn((channelId: string) => {
            const deferred = resolveDeferred[channelId];
            if (!deferred) {
                throw new Error(`Missing deferred for ${channelId}`);
            }
            return deferred.promise;
        }),
    } as unknown as IChannelManager;

    const scheduler = {
        getState: jest.fn().mockReturnValue({ isActive: true, channelId: currentChannel?.id ?? 'ch1' }),
        getCurrentProgram: jest.fn().mockReturnValue(makeProgram('Current-Now')),
        getNextProgram: jest.fn().mockReturnValue(makeProgram('Current-Next')),
    } as unknown as IChannelScheduler;

    const switchToChannel = jest.fn().mockResolvedValue(undefined);

    const coordinator = new MiniGuideCoordinator({
        getOverlay: (): IMiniGuideOverlay => overlay,
        getChannelManager: (): IChannelManager => channelManager,
        getScheduler: (): IChannelScheduler => (overrides?.scheduler ?? scheduler),
        buildDailyScheduleConfig: buildScheduleConfig,
        switchToChannel,
        getAutoHideMs: (): number => overrides?.autoHideMs ?? AUTO_HIDE_MS,
    });

    return { coordinator, overlay, channelManager, scheduler, resolveDeferred, switchToChannel };
};

describe('MiniGuideCoordinator', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(0);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('shows immediately with loading placeholders', () => {
        const { coordinator, overlay } = setup();

        coordinator.show();

        expect(overlay.show).toHaveBeenCalledTimes(1);
        const firstVm = (overlay.setViewModel as jest.Mock).mock.calls[0]?.[0];
        expect(firstVm.channels[0].nowTitle).toBe('Loading...');
        expect(firstVm.channels[4].nowTitle).toBe('Loading...');
        expect(firstVm.channels[2].nowTitle).toBe('Current-Now');
    });

    it('does not show when there are no channels', () => {
        const { coordinator, overlay } = setup({
            channels: [],
            currentChannel: null,
        });

        coordinator.show();

        expect(overlay.show).not.toHaveBeenCalled();
        expect(overlay.setViewModel).not.toHaveBeenCalled();
    });

    it('uses current channel view model for all rows when only one channel', () => {
        const singleChannel = makeChannel('ch1', 1);
        const scheduler = {
            getState: jest.fn().mockReturnValue({ isActive: true, channelId: 'ch1' }),
            getCurrentProgram: jest.fn().mockReturnValue(makeProgram('Current-Now')),
            getNextProgram: jest.fn().mockReturnValue(makeProgram('Current-Next')),
        } as unknown as IChannelScheduler;
        const { coordinator, overlay } = setup({
            channels: [singleChannel],
            currentChannel: singleChannel,
            scheduler,
        });

        coordinator.show();

        const firstVm = (overlay.setViewModel as jest.Mock).mock.calls[0]?.[0];
        expect(firstVm.channels[0].nowTitle).toBe('Current-Now');
        expect(firstVm.channels[1].nowTitle).toBe('Current-Now');
        expect(firstVm.channels[2].nowTitle).toBe('Current-Now');
        expect(firstVm.channels[3].nowTitle).toBe('Current-Now');
        expect(firstVm.channels[4].nowTitle).toBe('Current-Now');
    });

    it('dedupes resolve for duplicate non-current channels', () => {
        const channelA = makeChannel('ch1', 1);
        const channelB = makeChannel('ch2', 2);
        const { coordinator, channelManager } = setup({
            channels: [channelA, channelB],
            currentChannel: channelA,
        });

        coordinator.show();

        expect(channelManager.resolveChannelContent).toHaveBeenCalledTimes(1);
        expect(channelManager.resolveChannelContent).toHaveBeenCalledWith('ch2', expect.any(Object));
    });

    it('falls back to first channel when current channel is null', () => {
        const channelA = makeChannel('ch1', 1);
        const channelB = makeChannel('ch2', 2);
        const { coordinator, overlay } = setup({
            channels: [channelA, channelB],
            currentChannel: null,
        });

        coordinator.show();

        const firstVm = (overlay.setViewModel as jest.Mock).mock.calls[0]?.[0];
        expect(firstVm.channels[2].channelId).toBe('ch1');
        expect(firstVm.channels[2].channelNumber).toBe(1);
    });

    it('resolves prev/next channels and updates view model', async () => {
        const { coordinator, overlay, resolveDeferred } = setup();

        coordinator.show();

        resolveDeferred['ch1']!.resolve(makeResolvedContent('ch1'));
        resolveDeferred['ch5']!.resolve(makeResolvedContent('ch5'));

        await Promise.resolve();

        const lastCall = (overlay.setViewModel as jest.Mock).mock.calls.at(-1)?.[0];
        expect(lastCall.channels[0].nowTitle).toBe('ch1-Now');
        expect(lastCall.channels[0].nextTitle).toBe('ch1-Next');
        expect(lastCall.channels[4].nowTitle).toBe('ch5-Now');
        expect(lastCall.channels[4].nextTitle).toBe('ch5-Next');
    });

    it('navigation shifts window when moving past edges', () => {
        const { coordinator, overlay } = setup();
        coordinator.show();

        coordinator.handleNavigation('up');
        coordinator.handleNavigation('up');
        expect(overlay.setFocusedIndex).toHaveBeenCalledWith(0);

        coordinator.handleNavigation('up');
        const lastVm = (overlay.setViewModel as jest.Mock).mock.calls.at(-1)?.[0];
        expect(lastVm.channels[0].channelId).toBe('ch6');
        expect(overlay.hide).not.toHaveBeenCalled();

        coordinator.show();
        coordinator.handleNavigation('down');
        coordinator.handleNavigation('down');
        coordinator.handleNavigation('down');
        expect(overlay.setFocusedIndex).toHaveBeenCalledWith(4);

        const lastVmDown = (overlay.setViewModel as jest.Mock).mock.calls.at(-1)?.[0];
        expect(lastVmDown.channels[4].channelId).toBe('ch6');
        expect(overlay.hide).not.toHaveBeenCalled();
    });

    it('pages window by jump size', () => {
        const { coordinator, overlay } = setup();
        coordinator.show();

        expect(coordinator.handlePage('down')).toBe(true);
        const lastVm = (overlay.setViewModel as jest.Mock).mock.calls.at(-1)?.[0];
        expect(lastVm.channels[0].channelId).toBe('ch6');
        expect(lastVm.channels[2].channelId).toBe('ch2');
    });

    it('ok hides and switches channel', () => {
        const { coordinator, overlay, switchToChannel } = setup();
        coordinator.show();

        coordinator.handleSelect();

        expect(overlay.hide).toHaveBeenCalled();
        expect(switchToChannel).toHaveBeenCalledWith('ch3');
    });

    it('auto-hide hides after timeout', () => {
        const { coordinator, overlay } = setup({ autoHideMs: AUTO_HIDE_MS });
        coordinator.show();

        jest.advanceTimersByTime(AUTO_HIDE_MS + 1);

        expect(overlay.hide).toHaveBeenCalledTimes(1);
    });

    it('hide aborts and prevents post-hide updates', async () => {
        const { coordinator, overlay, resolveDeferred } = setup();
        coordinator.show();

        coordinator.hide();
        resolveDeferred['ch1']!.resolve(makeResolvedContent('ch1'));

        await Promise.resolve();

        expect((overlay.setViewModel as jest.Mock).mock.calls.length).toBe(1);
    });

    it('ignores resolves that complete after window shifts', async () => {
        const { coordinator, overlay, resolveDeferred } = setup();
        coordinator.show();

        coordinator.handlePage('down');
        const callCountBefore = (overlay.setViewModel as jest.Mock).mock.calls.length;

        resolveDeferred['ch5']!.resolve(makeResolvedContent('ch5'));

        await Promise.resolve();

        const callCountAfter = (overlay.setViewModel as jest.Mock).mock.calls.length;
        expect(callCountAfter).toBe(callCountBefore);
        const lastVm = (overlay.setViewModel as jest.Mock).mock.calls.at(-1)?.[0];
        expect(lastVm.channels[0].channelId).toBe('ch6');
    });

    it('skips stale row updates when channel id differs', () => {
        const { coordinator, overlay } = setup();
        coordinator.show();

        coordinator.handlePage('down');

        const anyCoordinator = coordinator as unknown as {
            _showToken: number;
            _updateRow: (index: number, row: unknown, token: number) => void;
        };
        const token = anyCoordinator._showToken;
        const staleRow = {
            channelId: 'ch1',
            channelNumber: 1,
            channelName: 'Channel 1',
            nowTitle: 'Stale',
            nextTitle: null,
            nowProgress: 0,
        };

        const callCountBefore = (overlay.setViewModel as jest.Mock).mock.calls.length;
        anyCoordinator._updateRow(0, staleRow, token);
        const callCountAfter = (overlay.setViewModel as jest.Mock).mock.calls.length;

        expect(callCountAfter).toBe(callCountBefore);
    });
});
