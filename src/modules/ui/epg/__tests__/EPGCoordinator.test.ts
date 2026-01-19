import { EPGCoordinator, type EPGCoordinatorDeps, type EpgUiStatus } from '../EPGCoordinator';
import type { IEPGComponent } from '../interfaces';
import type {
    IChannelManager,
    ChannelConfig,
    ResolvedChannelContent,
    ResolvedContentItem,
    PlaybackMode,
} from '../../../scheduler/channel-manager';
import type { IChannelScheduler, ScheduledProgram, ScheduleConfig } from '../../../scheduler/scheduler';
import type { EPGConfig } from '../types';

const makeChannel = (id: string, number: number): ChannelConfig => ({
    id,
    name: `Channel ${number}`,
    number,
    contentSource: { type: 'manual', items: [] },
    playbackMode: 'loop' as PlaybackMode,
    startTimeAnchor: 0,
    skipIntros: false,
    skipCredits: false,
    createdAt: 0,
    updatedAt: 0,
    lastContentRefresh: 0,
    itemCount: 0,
    totalDurationMs: 0,
});

const makeResolvedItem = (channelId: string, idx: number): ResolvedContentItem =>
    ({
        ratingKey: `${channelId}-${idx}`,
        type: 'movie',
        title: `Program ${idx}`,
        fullTitle: `Program ${idx}`,
        durationMs: 10_000,
        thumb: null,
        guid: null,
        parentGuid: null,
        grandparentGuid: null,
        viewOffset: 0,
        year: 0,
        scheduledIndex: idx,
    } as ResolvedContentItem);

const baseProgram = (channelId: string, idx: number): ScheduledProgram =>
    ({
        item: makeResolvedItem(channelId, idx),
        scheduledStartTime: 0,
        scheduledEndTime: 10_000,
        elapsedMs: 0,
        remainingMs: 10_000,
        scheduleIndex: idx,
        loopNumber: 0,
        streamDescriptor: null,
        isCurrent: false,
    } as ScheduledProgram);

const makeDeps = (
    overrides: Partial<EPGCoordinatorDeps> = {}
): { deps: EPGCoordinatorDeps; epg: IEPGComponent; channelManager: IChannelManager; scheduler: IChannelScheduler } => {
    const epg: IEPGComponent = {
        show: jest.fn(),
        hide: jest.fn(),
        isVisible: jest.fn().mockReturnValue(false),
        focusNow: jest.fn(),
        loadChannels: jest.fn(),
        loadScheduleForChannel: jest.fn(),
        setGridAnchorTime: jest.fn(),
        getFocusedProgram: jest.fn().mockReturnValue(null),
        focusChannel: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
    } as unknown as IEPGComponent;

    const channels: ChannelConfig[] = Array.from({ length: 3 }, (_, i) => makeChannel(`c${i}`, i + 1));
    const channelManager: IChannelManager = {
        getAllChannels: () => channels,
        getCurrentChannel: () => channels[0],
        resolveChannelContent: jest.fn().mockImplementation(async (id: string) => {
            const items: ResolvedChannelContent['items'] = [makeResolvedItem(id, 0)];
            return { items } as ResolvedChannelContent;
        }),
    } as unknown as IChannelManager;

    const scheduler: IChannelScheduler = {
        getState: () => ({ isActive: true, channelId: channels[0]!.id }),
        getScheduleWindow: () => ({
            startTime: 0,
            endTime: 1000,
            programs: [baseProgram(channels[0]!.id, 0)],
        }),
    } as unknown as IChannelScheduler;

    const deps: EPGCoordinatorDeps = {
        getEpg: () => epg,
        getChannelManager: () => channelManager,
        getScheduler: () => scheduler,
        getEpgUiStatus: () => 'ready',
        ensureEpgInitialized: jest.fn().mockResolvedValue(undefined),
        getEpgConfig: () => ({ totalHours: 6, timeSlotMinutes: 30 } as EPGConfig),
        getLocalMidnightMs: (t: number) => t - (t % (24 * 60 * 60 * 1000)),
        buildDailyScheduleConfig: (
            channel: ChannelConfig,
            items: ResolvedChannelContent['items']
        ): ScheduleConfig =>
            ({
                channelId: channel.id,
                anchorTime: 0,
                content: items,
                playbackMode: 'loop' as PlaybackMode,
                shuffleSeed: 1,
                loopSchedule: true,
            } satisfies ScheduleConfig),
        getPreserveFocusOnOpen: () => false,
        setLastChannelChangeSourceToGuide: jest.fn(),
        switchToChannel: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    };
    return { deps, epg, channelManager, scheduler };
};

describe('EPGCoordinator', () => {
    it('openEPG primes and refreshes when ready before show', async () => {
        const { deps, epg } = makeDeps();
        const coordinator = new EPGCoordinator(deps);

        coordinator.openEPG();

        expect(epg.loadChannels).toHaveBeenCalled();
        expect(epg.setGridAnchorTime).toHaveBeenCalled();
        expect(epg.show).toHaveBeenCalledTimes(1);
        // focusNow called when not preserving focus
        expect(epg.focusNow).toHaveBeenCalled();
    });

    it('openEPG shows immediately when not ready then initializes and shows again', async () => {
        let status: EpgUiStatus = 'initializing';
        const ensure = jest.fn().mockImplementation(async () => {
            status = 'ready';
        });
        const { deps, epg } = makeDeps({
            getEpgUiStatus: () => status,
            ensureEpgInitialized: ensure,
        });
        const coordinator = new EPGCoordinator(deps);

        coordinator.openEPG();
        await Promise.resolve();
        await Promise.resolve();

        expect(epg.show).toHaveBeenCalledTimes(2);
        expect(ensure).toHaveBeenCalled();
        expect(epg.loadChannels).toHaveBeenCalled();
    });

    it('refreshEpgSchedules limits preload to 100 and focuses when visible with no focus', async () => {
        const manyChannels = Array.from({ length: 105 }, (_, i) => makeChannel(`c${i}`, i + 1));
        const base = makeDeps().deps.getChannelManager()!;
        const { deps, epg } = makeDeps({
            getChannelManager: () =>
                ({
                    ...base,
                    getAllChannels: () => manyChannels,
                    getCurrentChannel: () => manyChannels[0],
                    resolveChannelContent: base.resolveChannelContent,
                } as IChannelManager),
        });
        const coordinator = new EPGCoordinator(deps);
        (epg.isVisible as jest.Mock).mockReturnValue(true);
        (epg.getFocusedProgram as jest.Mock).mockReturnValue(null);

        await coordinator.refreshEpgSchedules();

        expect((epg.loadScheduleForChannel as jest.Mock).mock.calls.length).toBeLessThanOrEqual(100);
        expect(epg.focusNow).toHaveBeenCalled();
    });

    it('refreshEpgScheduleForLiveChannel uses scheduler window for current channel', () => {
        const windowPrograms = [baseProgram('c0', 5)];
        const scheduler: IChannelScheduler = {
            getState: () => ({ isActive: true, channelId: 'c0' }),
            getScheduleWindow: () => ({ startTime: 10, endTime: 20, programs: windowPrograms }),
        } as unknown as IChannelScheduler;
        const { deps, epg } = makeDeps({
            getScheduler: () => scheduler,
        });
        const coordinator = new EPGCoordinator(deps);
        (epg.isVisible as jest.Mock).mockReturnValue(true);

        coordinator.refreshEpgScheduleForLiveChannel();

        expect(epg.loadScheduleForChannel).toHaveBeenCalledWith('c0', {
            startTime: 10,
            endTime: 20,
            programs: windowPrograms,
        });
    });

    it('wireEpgEvents returns unsubscribers and triggers switch when program eligible', () => {
        const hide = jest.fn();
        const epg: IEPGComponent = {
            on: jest.fn(),
            off: jest.fn(),
            hide,
        } as unknown as IEPGComponent;
        const switchToChannel = jest.fn().mockResolvedValue(undefined);
        const setSource = jest.fn();
        const deps = makeDeps({
            getEpg: () => epg,
            setLastChannelChangeSourceToGuide: setSource,
            switchToChannel,
        }).deps;
        const coordinator = new EPGCoordinator(deps);

        const [unsub] = coordinator.wireEpgEvents();
        expect(typeof unsub).toBe('function');

        const handler = (epg.on as jest.Mock).mock.calls[0][1];
        handler({
            channel: makeChannel('c1', 1),
            program: { ...baseProgram('c1', 0), scheduledStartTime: 0 } as ScheduledProgram,
        });

        expect(setSource).toHaveBeenCalled();
        expect(hide).toHaveBeenCalled();
        expect(switchToChannel).toHaveBeenCalledWith('c1');

        unsub!();
        expect(epg.off).toHaveBeenCalledWith('channelSelected', handler);
    });
});
