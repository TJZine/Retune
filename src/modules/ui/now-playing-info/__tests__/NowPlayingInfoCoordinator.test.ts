import { NowPlayingInfoCoordinator } from '../NowPlayingInfoCoordinator';
import type { INavigationManager } from '../../../navigation';
import type { IChannelScheduler, ScheduledProgram } from '../../../scheduler/scheduler';
import type { IChannelManager, ChannelConfig } from '../../../scheduler/channel-manager';
import type { IPlexLibrary, PlexMediaItem } from '../../../plex/library';
import type { INowPlayingInfoOverlay } from '../interfaces';
import type { NowPlayingInfoConfig } from '../types';

const modalId = 'now-playing-info';

const makeProgram = (overrides: Partial<ScheduledProgram> = {}): ScheduledProgram =>
    ({
        item: {
            ratingKey: 'rk1',
            title: 'Current Title',
            durationMs: 60_000,
            type: 'movie',
            fullTitle: null,
            year: 2024,
            contentRating: 'PG',
            thumb: '/thumb',
        } as unknown as ScheduledProgram['item'],
        scheduledStartTime: Date.now() - 1000,
        scheduledEndTime: Date.now() + 59_000,
        elapsedMs: 1000,
        remainingMs: 59_000,
        scheduleIndex: 0,
        loopNumber: 0,
        streamDescriptor: null,
        isCurrent: true,
        ...overrides,
    }) as ScheduledProgram;

const makeChannel = (): ChannelConfig =>
    ({
        id: 'ch1',
        name: 'Channel 1',
        number: 1,
    }) as ChannelConfig;

const makeOverlay = (overrides: Partial<INowPlayingInfoOverlay> = {}): INowPlayingInfoOverlay =>
    ({
        initialize: jest.fn(),
        show: jest.fn(),
        update: jest.fn(),
        hide: jest.fn(),
        isVisible: jest.fn().mockReturnValue(true),
        destroy: jest.fn(),
        setAutoHideMs: jest.fn(),
        resetAutoHideTimer: jest.fn(),
        setOnAutoHide: jest.fn(),
        ...overrides,
    }) as unknown as INowPlayingInfoOverlay;

const makeNavigation = (
    overrides: Partial<INavigationManager> = {}
): INavigationManager =>
    ({
        getCurrentScreen: jest.fn().mockReturnValue('player'),
        isModalOpen: jest.fn().mockReturnValue(true),
        openModal: jest.fn(),
        closeModal: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
        goTo: jest.fn(),
        ...overrides,
    }) as unknown as INavigationManager;

const makeScheduler = (
    overrides: Partial<IChannelScheduler> = {}
): IChannelScheduler =>
    ({
        getCurrentProgram: jest.fn().mockReturnValue(makeProgram()),
        getNextProgram: jest.fn().mockReturnValue(null),
        ...overrides,
    }) as unknown as IChannelScheduler;

const makeChannelManager = (
    overrides: Partial<IChannelManager> = {}
): IChannelManager =>
    ({
        getCurrentChannel: jest.fn().mockReturnValue(makeChannel()),
        ...overrides,
    }) as unknown as IChannelManager;

const makePlexLibrary = (overrides: Partial<IPlexLibrary> = {}): IPlexLibrary =>
    ({
        getItem: jest.fn().mockResolvedValue(null),
        getImageUrl: jest.fn().mockReturnValue('http://image'),
        ...overrides,
    }) as unknown as IPlexLibrary;

const makeConfig = (): NowPlayingInfoConfig => ({
    containerId: 'now-playing-info-container',
    posterWidth: 111,
    posterHeight: 222,
});

const setup = (
    overrides: Partial<ConstructorParameters<typeof NowPlayingInfoCoordinator>[0]> = {}
): {
    coordinator: NowPlayingInfoCoordinator;
    deps: ConstructorParameters<typeof NowPlayingInfoCoordinator>[0];
    navigation: INavigationManager;
    scheduler: IChannelScheduler;
    channelManager: IChannelManager;
    plexLibrary: IPlexLibrary;
    overlay: INowPlayingInfoOverlay;
} => {
    const navigation = makeNavigation();
    const scheduler = makeScheduler();
    const channelManager = makeChannelManager();
    const plexLibrary = makePlexLibrary();
    const overlay = makeOverlay();
    const config = makeConfig();
    const deps = {
        nowPlayingModalId: modalId,
        getNavigation: (): INavigationManager => navigation,
        getScheduler: (): IChannelScheduler => scheduler,
        getChannelManager: (): IChannelManager => channelManager,
        getPlexLibrary: (): IPlexLibrary => plexLibrary,
        getNowPlayingInfo: (): INowPlayingInfoOverlay => overlay,
        getNowPlayingInfoConfig: (): NowPlayingInfoConfig => config,
        buildPlexResourceUrl: jest.fn().mockReturnValue(null) as () => string | null,
        buildDebugText: jest.fn().mockReturnValue(null) as () => string | null,
        maybeFetchStreamDecisionForDebugHud: jest.fn().mockResolvedValue(undefined) as () => Promise<void>,
        getAutoHideMs: (): number => 5000,
        getCurrentProgramForPlayback: (): ScheduledProgram => makeProgram(),
        getPlaybackInfoSnapshot: (): { stream: null } => ({ stream: null }),
        refreshPlaybackInfoSnapshot: jest.fn().mockResolvedValue({ stream: null }),
        ...overrides,
    };
    return {
        coordinator: new NowPlayingInfoCoordinator(deps),
        deps,
        navigation,
        scheduler,
        channelManager,
        plexLibrary,
        overlay,
    };
};

describe('NowPlayingInfoCoordinator', () => {
    it('handleModalOpen closes modal if no program is available', () => {
        const scheduler = makeScheduler({
            getCurrentProgram: jest.fn(() => {
                throw new Error('boom');
            }),
        });
        const { coordinator, navigation } = setup({
            getScheduler: () => scheduler,
            getCurrentProgramForPlayback: () => null,
        });

        coordinator.handleModalOpen(modalId);

        expect(navigation.closeModal).toHaveBeenCalledWith(modalId);
    });

    it('handleModalOpen includes upNext when next program starts in the future', () => {
        const nextProgram = makeProgram({
            scheduledStartTime: Date.now() + 60_000,
            item: { ...makeProgram().item, title: 'Next Thing' },
        });
        const scheduler = makeScheduler({
            getNextProgram: jest.fn().mockReturnValue(nextProgram),
        });
        const { coordinator, overlay } = setup({
            getScheduler: () => scheduler,
        });

        coordinator.handleModalOpen(modalId);

        const viewModel = (overlay.show as jest.Mock).mock.calls[0]?.[0] as {
            upNext?: { title: string; startsAtMs: number };
        };
        expect(viewModel.upNext).toEqual({
            title: 'Next Thing',
            startsAtMs: nextProgram.scheduledStartTime,
        });
        coordinator.handleModalClose(modalId);
    });

    it('handleModalOpen omits upNext when next program starts at or before now', () => {
        const nextProgram = makeProgram({
            scheduledStartTime: Date.now(),
            item: { ...makeProgram().item, title: 'Next Thing' },
        });
        const scheduler = makeScheduler({
            getNextProgram: jest.fn().mockReturnValue(nextProgram),
        });
        const { coordinator, overlay } = setup({
            getScheduler: () => scheduler,
        });

        coordinator.handleModalOpen(modalId);

        const viewModel = (overlay.show as jest.Mock).mock.calls[0]?.[0] as {
            upNext?: { title: string; startsAtMs: number };
        };
        expect(viewModel.upNext).toBeUndefined();
        coordinator.handleModalClose(modalId);
    });

    it('handleModalOpen uses scheduled metadata when details are unavailable', () => {
        const program = makeProgram({
            item: {
                ...makeProgram().item,
                genres: ['Action', 'Drama'],
                directors: ['Director One'],
            },
        });
        const scheduler = makeScheduler({
            getCurrentProgram: jest.fn().mockReturnValue(program),
        });
        const { coordinator, overlay } = setup({
            getScheduler: () => scheduler,
        });

        coordinator.handleModalOpen(modalId);

        const viewModel = (overlay.show as jest.Mock).mock.calls[0]?.[0] as {
            metaLines?: string[];
        };
        expect(viewModel.metaLines).toEqual(['Action • Drama', 'Director: Director One']);
        coordinator.handleModalClose(modalId);
    });

    it('details metadata renders cast + studio line', async () => {
        const plexLibrary = makePlexLibrary({
            getItem: jest.fn().mockResolvedValue({
                ratingKey: 'rk1',
                title: 'Detail Title',
                type: 'movie',
                summary: 'Detail summary',
                genres: ['Sci-Fi', 'Action', 'Adventure'],
                studios: ['Studio One', 'Studio Two'],
                actors: ['Actor A', 'Actor B', 'Actor C', 'Actor D'],
            } as PlexMediaItem),
        });
        const { coordinator, overlay } = setup({
            getPlexLibrary: () => plexLibrary,
        });

        coordinator.handleModalOpen(modalId);
        await Promise.resolve();

        const updates = (overlay.update as jest.Mock).mock.calls;
        const lastUpdate = updates[updates.length - 1]?.[0] as { metaLines?: string[] };
        expect(lastUpdate.metaLines).toEqual([
            'Sci-Fi • Action • Adventure • Studio One',
            'Cast: Actor A • Actor B • Actor C +1',
        ]);
        coordinator.handleModalClose(modalId);
    });

    it('details metadata includes actor headshots with more count', async () => {
        const plexLibrary = makePlexLibrary({
            getImageUrl: jest.fn((path: string) => `http://image${path}`),
            getItem: jest.fn().mockResolvedValue({
                ratingKey: 'rk1',
                title: 'Detail Title',
                type: 'movie',
                actorRoles: [
                    { name: 'Actor A', thumb: '/actor/a' },
                    { name: 'Actor B', thumb: '/actor/b' },
                    { name: 'Actor C', thumb: '/actor/c' },
                    { name: 'Actor D', thumb: '/actor/d' },
                    { name: 'Actor E', thumb: '/actor/e' },
                ],
            } as PlexMediaItem),
        });
        const { coordinator, overlay } = setup({
            getPlexLibrary: () => plexLibrary,
        });

        coordinator.handleModalOpen(modalId);
        await Promise.resolve();

        const updates = (overlay.update as jest.Mock).mock.calls;
        const lastUpdate = updates[updates.length - 1]?.[0] as {
            actorHeadshots?: Array<{ name: string; url: string | null }>;
            actorTotalCount?: number;
        };
        expect(lastUpdate.actorHeadshots).toEqual([
            { name: 'Actor A', url: 'http://image/actor/a' },
            { name: 'Actor B', url: 'http://image/actor/b' },
            { name: 'Actor C', url: 'http://image/actor/c' },
            { name: 'Actor D', url: 'http://image/actor/d' },
        ]);
        expect(lastUpdate.actorTotalCount).toBe(5);
        coordinator.handleModalClose(modalId);
    });

    it('live updates call update while modal remains open', () => {
        jest.useFakeTimers();
        const { coordinator, overlay } = setup();

        coordinator.handleModalOpen(modalId);

        jest.advanceTimersByTime(2100);
        expect((overlay.update as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2);
        coordinator.handleModalClose(modalId);
        jest.useRealTimers();
    });

    it('live updates preserve description after details are fetched', async () => {
        jest.useFakeTimers();
        const plexLibrary = makePlexLibrary({
            getItem: jest.fn().mockResolvedValue({
                ratingKey: 'rk1',
                title: 'Detail Title',
                type: 'movie',
                summary: 'Detail summary',
            } as PlexMediaItem),
        });
        const { coordinator, overlay } = setup({
            getPlexLibrary: () => plexLibrary,
        });

        coordinator.handleModalOpen(modalId);
        await Promise.resolve();

        const updates = (overlay.update as jest.Mock).mock.calls;
        expect(updates.length).toBeGreaterThan(0);
        const lastUpdate = updates[updates.length - 1]?.[0] as { description?: string };
        expect(lastUpdate.description).toBe('Detail summary');

        jest.advanceTimersByTime(1100);
        const nextUpdate = (overlay.update as jest.Mock).mock.calls[
            (overlay.update as jest.Mock).mock.calls.length - 1
        ]?.[0] as { description?: string };
        expect(nextUpdate.description).toBe('Detail summary');

        coordinator.handleModalClose(modalId);
        jest.useRealTimers();
    });

    it('handleModalClose stops live updates', () => {
        jest.useFakeTimers();
        const { coordinator, overlay } = setup();

        coordinator.handleModalOpen(modalId);
        jest.advanceTimersByTime(1100);
        const callsBeforeClose = (overlay.update as jest.Mock).mock.calls.length;

        coordinator.handleModalClose(modalId);
        jest.advanceTimersByTime(2000);

        expect((overlay.update as jest.Mock).mock.calls.length).toBe(callsBeforeClose);
        jest.useRealTimers();
    });

    it('details fetch updates only when visible and token matches', async () => {
        const deferreds: Array<{ resolve: (item: PlexMediaItem | null) => void; promise: Promise<PlexMediaItem | null> }> = [];
        const plexLibrary = makePlexLibrary({
            getItem: jest.fn().mockImplementation(() => {
                let resolve: (item: PlexMediaItem | null) => void = () => undefined;
                const promise = new Promise<PlexMediaItem | null>((res) => {
                    resolve = res;
                });
                deferreds.push({ resolve, promise });
                return promise;
            }),
        });
        const overlay = makeOverlay({ isVisible: jest.fn().mockReturnValue(true) });
        const navigation = makeNavigation({ isModalOpen: jest.fn().mockReturnValue(true) });
        const { coordinator } = setup({
            getPlexLibrary: () => plexLibrary,
            getNowPlayingInfo: () => overlay,
            getNavigation: () => navigation,
        });

        const programA = makeProgram({ item: { ...makeProgram().item, ratingKey: 'a' } });
        const programB = makeProgram({ item: { ...makeProgram().item, ratingKey: 'b' } });

        coordinator.onProgramStart(programA);
        coordinator.onProgramStart(programB);

        expect((overlay.update as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2);

        const first = deferreds[0];
        const second = deferreds[1];
        expect(first).toBeDefined();
        expect(second).toBeDefined();

        first!.resolve({
            ratingKey: 'a',
            title: 'Old',
            type: 'movie',
            summary: 'Old summary',
        } as PlexMediaItem);
        await first!.promise;

        const descriptionsAfterFirst = (overlay.update as jest.Mock).mock.calls
            .map((call) => (call[0] as { description?: string }).description)
            .filter(Boolean);
        expect(descriptionsAfterFirst).not.toContain('Old summary');

        second!.resolve({
            ratingKey: 'b',
            title: 'New',
            type: 'movie',
            summary: 'New summary',
        } as PlexMediaItem);
        await second!.promise;

        const calls = (overlay.update as jest.Mock).mock.calls;
        const lastUpdate = calls[calls.length - 1]?.[0] as { description?: string };
        expect(lastUpdate.description).toBe('New summary');
    });
});
