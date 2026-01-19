import { NowPlayingDebugManager, type NowPlayingDebugManagerDeps } from '../NowPlayingDebugManager';
import { RETUNE_STORAGE_KEYS } from '../../../config/storageKeys';
import type { INavigationManager } from '../../navigation';
import type { IPlexStreamResolver, StreamDecision } from '../../plex/stream';
import type { ScheduledProgram } from '../../scheduler/scheduler';

const modalId = 'now-playing';

const makeNavigation = (overrides: Partial<INavigationManager> = {}): INavigationManager => {
    const base: INavigationManager = {
        getCurrentScreen: () => 'player',
        isModalOpen: jest.fn().mockReturnValue(false),
        openModal: jest.fn(),
        closeModal: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
        goTo: jest.fn(),
    } as unknown as INavigationManager;
    return { ...base, ...overrides };
};

const makeDecision = (): StreamDecision =>
    ({
        isTranscoding: true,
        isDirectPlay: false,
        container: 'mp4',
        videoCodec: 'h264',
        audioCodec: 'aac',
        bitrate: 1000,
        width: 1920,
        height: 1080,
        protocol: 'direct',
        playbackUrl: 'http://example/stream',
        subtitleDelivery: 'embedded',
        sessionId: 'sess',
        directPlay: { reasons: [] },
        transcodeRequest: {
            sessionId: 'sess',
            maxBitrate: 2000,
        },
    } as unknown as StreamDecision);

const makeProgram = (): ScheduledProgram =>
    ({
        item: {
            ratingKey: '1',
            title: 'title',
            durationMs: 1000,
            type: 'movie',
        } as unknown as ScheduledProgram['item'],
        elapsedMs: 0,
        scheduledStartTime: 0,
        scheduledEndTime: 1000,
        remainingMs: 1000,
        scheduleIndex: 0,
        channelId: 'c1',
    } as unknown as ScheduledProgram);

const setup = (overrides: Partial<NowPlayingDebugManagerDeps> = {}): {
    manager: NowPlayingDebugManager;
    deps: NowPlayingDebugManagerDeps;
    navigation: INavigationManager;
    decision: StreamDecision;
    program: ScheduledProgram;
    resolver: IPlexStreamResolver;
} => {
    const navigation = makeNavigation();
    const decision = makeDecision();
    const program = makeProgram();
    const resolver: IPlexStreamResolver = {
        fetchUniversalTranscodeDecision: jest.fn().mockResolvedValue({ videoDecision: 'copy' }),
    } as unknown as IPlexStreamResolver;

    const deps: NowPlayingDebugManagerDeps = {
        nowPlayingModalId: modalId,
        getNavigation: () => navigation,
        getStreamResolver: () => resolver,
        getCurrentProgram: () => program,
        getCurrentStreamDecision: () => decision,
        requestNowPlayingOverlayRefresh: jest.fn(),
        ...overrides,
    };
    const manager = new NowPlayingDebugManager(deps);
    return { manager, deps, navigation, decision, program, resolver };
};

describe('NowPlayingDebugManager', () => {
    beforeAll(() => {
        const storage: Record<string, string> = {};
        const globalAny = global as unknown as { localStorage?: Storage };
        globalAny.localStorage = {
            getItem: (key: string) => (key in storage ? storage[key] ?? null : null),
            setItem: (key: string, value: string) => {
                storage[key] = value;
            },
            removeItem: (key: string) => {
                delete storage[key];
            },
            clear: () => {
                Object.keys(storage).forEach((k) => delete storage[k]);
            },
        } as Storage;
    });

    beforeEach((): void => {
        localStorage.clear();
    });

    afterEach((): void => {
        localStorage.clear();
    });

    const enableDebug = (): void => {
        localStorage.setItem(RETUNE_STORAGE_KEYS.NOW_PLAYING_STREAM_DEBUG, '1');
    };
    const enableAutoShow = (): void => {
        localStorage.setItem(RETUNE_STORAGE_KEYS.NOW_PLAYING_STREAM_DEBUG_AUTO_SHOW, '1');
    };

    it('auto-show opens modal only when debug + auto-show + player screen + no modals', () => {
        enableDebug();
        enableAutoShow();
        const { manager, navigation } = setup();

        manager.maybeAutoShowNowPlayingStreamDebugHud();

        expect(navigation.openModal).toHaveBeenCalledWith(modalId);
    });

    it('auto-show does nothing when screen not player or any modal open', () => {
        enableDebug();
        enableAutoShow();
        const navigation = makeNavigation({
            getCurrentScreen: () => 'guide',
            openModal: jest.fn(),
        } as Partial<INavigationManager> as INavigationManager);
        const { manager } = setup({ getNavigation: () => navigation });

        manager.maybeAutoShowNowPlayingStreamDebugHud();
        expect(navigation.openModal).not.toHaveBeenCalled();

        const navigationWithModal = makeNavigation({
            isModalOpen: jest.fn().mockReturnValue(true),
            openModal: jest.fn(),
        } as Partial<INavigationManager> as INavigationManager);
        const manager2 = new NowPlayingDebugManager({
            ...setup().deps,
            getNavigation: (): INavigationManager => navigationWithModal,
        });
        manager2.maybeAutoShowNowPlayingStreamDebugHud();
        expect(navigationWithModal.openModal).not.toHaveBeenCalled();
    });

    it('debug text is null when debug disabled or no decision', () => {
        const { manager } = setup({ getCurrentStreamDecision: () => null });
        expect(manager.buildNowPlayingStreamDebugText()).toBeNull();

        enableDebug();
        const manager2 = setup({ getCurrentStreamDecision: () => null }).manager;
        expect(manager2.buildNowPlayingStreamDebugText()).toBeNull();

        // Debug enabled and decision present returns string
        const manager3 = setup().manager;
        enableDebug();
        expect(manager3.buildNowPlayingStreamDebugText()).not.toBeNull();
    });

    it('snapshot fetch does not require debug enabled', async () => {
        const { manager, resolver, decision } = setup();
        decision.isTranscoding = true;
        decision.transcodeRequest = {
            sessionId: 'sess',
            maxBitrate: 1234,
        } as NonNullable<StreamDecision['transcodeRequest']>;
        await manager.ensureServerDecisionForPlaybackInfoSnapshot();
        expect(resolver.fetchUniversalTranscodeDecision).toHaveBeenCalled();
    });

    it('debug fetch calls refresh only when modal open', async () => {
        enableDebug();
        const closed = setup();
        const refreshSpy = closed.deps.requestNowPlayingOverlayRefresh as jest.Mock;
        (closed.resolver.fetchUniversalTranscodeDecision as jest.Mock).mockResolvedValue({
            videoDecision: 'copy',
        });

        // Modal closed
        await closed.manager.maybeFetchNowPlayingStreamDecisionForDebugHud();
        expect(refreshSpy).not.toHaveBeenCalled();

        // Modal open on fresh manager (no cached decision)
        const navigationOpen = makeNavigation({
            isModalOpen: jest.fn().mockReturnValue(true),
        } as Partial<INavigationManager> as INavigationManager);
        const openDecision = makeDecision();
        const openResolver: IPlexStreamResolver = {
            fetchUniversalTranscodeDecision: jest.fn().mockResolvedValue({ videoDecision: 'copy' }),
        } as unknown as IPlexStreamResolver;
        const openDeps: NowPlayingDebugManagerDeps = {
            nowPlayingModalId: modalId,
            getNavigation: () => navigationOpen,
            getStreamResolver: () => openResolver,
            getCurrentProgram: () => makeProgram(),
            getCurrentStreamDecision: () => openDecision,
            requestNowPlayingOverlayRefresh: jest.fn(),
        };
        const managerOpen = new NowPlayingDebugManager(openDeps);
        await managerOpen.maybeFetchNowPlayingStreamDecisionForDebugHud();
        expect(openDeps.requestNowPlayingOverlayRefresh).toHaveBeenCalled();
    });
});
