import { ChannelSetupCoordinator } from '../ChannelSetupCoordinator';
import type { ChannelSetupCoordinatorDeps } from '../ChannelSetupCoordinator';
import type { ChannelSetupConfig, ChannelSetupRecord } from '../types';
import type { IPlexLibrary, PlexLibraryType } from '../../../modules/plex/library';
import type { IChannelManager, ChannelConfig } from '../../../modules/scheduler/channel-manager';
import type { INavigationManager } from '../../../modules/navigation';

const mockBuilder = {
    createChannel: jest.fn().mockResolvedValue(undefined),
    getAllChannels: jest.fn().mockReturnValue([]),
};

jest.mock('../../../modules/scheduler/channel-manager', () => ({
    ChannelManager: jest.fn(() => mockBuilder),
}));

const createConfig = (overrides?: Partial<ChannelSetupConfig>): ChannelSetupConfig => ({
    serverId: 'server-1',
    selectedLibraryIds: [],
    maxChannels: 25,
    enabledStrategies: {
        collections: false,
        libraryFallback: false,
        playlists: false,
        genres: false,
        directors: false,
        decades: false,
        runtimeRanges: false,
    },
    minItemsPerChannel: 5,
    ...overrides,
});

const mockChannelConfig = {
    id: 'ch1',
    name: 'Channel 1',
    number: 1,
    contentSource: { type: 'library', libraryId: 'lib1', libraryType: 'movie', includeWatched: true },
    playbackMode: 'shuffle' as const,
    shuffleSeed: 123,
    phaseSeed: 456,
    startTimeAnchor: 0,
    isManual: false,
    isFavorite: false,
    enabled: true,
} as unknown as ChannelConfig;

type CoordinatorHarness = {
    coordinator: ChannelSetupCoordinator;
    deps: ChannelSetupCoordinatorDeps;
    plexLibrary: jest.Mocked<IPlexLibrary>;
    channelManager: jest.Mocked<IChannelManager>;
    navigation: jest.Mocked<INavigationManager>;
    storage: Map<string, string>;
    storageGet: jest.Mock<string | null, [string]>;
    storageSet: jest.Mock<void, [string, string]>;
    storageRemove: jest.Mock<void, [string]>;
    getSelectedServerId: jest.Mock<string | null, []>;
};

const createCoordinator = (overrides?: Partial<ChannelSetupCoordinatorDeps>): CoordinatorHarness => {
    const plexLibrary = {
        getLibraries: jest.fn().mockResolvedValue([]),
        getPlaylists: jest.fn().mockResolvedValue([]),
        getCollections: jest.fn().mockResolvedValue([]),
        getLibraryItems: jest.fn().mockResolvedValue([]),
        getLibraryItemCount: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<IPlexLibrary>;

    const channelManager = {
        getAllChannels: jest.fn().mockReturnValue([mockChannelConfig]),
        replaceAllChannels: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IChannelManager>;

    const navigation = {
        goTo: jest.fn(),
    } as unknown as jest.Mocked<INavigationManager>;

    const storage = new Map<string, string>();
    const storageGet = jest.fn((key: string) => storage.get(key) ?? null);
    const storageSet = jest.fn((key: string, value: string) => {
        storage.set(key, value);
    });
    const storageRemove = jest.fn((key: string) => {
        storage.delete(key);
    });

    const getSelectedServerId = jest.fn().mockReturnValue('server-1');

    const deps: ChannelSetupCoordinatorDeps = {
        getPlexLibrary: () => plexLibrary,
        getChannelManager: () => channelManager,
        getNavigation: () => navigation,
        getSelectedServerId,
        storageGet,
        storageSet,
        storageRemove,
        handleGlobalError: jest.fn(),
        primeEpgChannels: jest.fn(),
        refreshEpgSchedules: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    };

    const coordinator = new ChannelSetupCoordinator(deps);

    return {
        coordinator,
        deps,
        plexLibrary,
        channelManager,
        navigation,
        storage,
        storageGet,
        storageSet,
        storageRemove,
        getSelectedServerId,
    };
};

describe('ChannelSetupCoordinator', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockBuilder.createChannel.mockResolvedValue(undefined);
        mockBuilder.getAllChannels.mockReturnValue([]);
    });

    it('shouldRunChannelSetup returns false without channel manager or server id', () => {
        const noManager = createCoordinator({ getChannelManager: () => null });
        expect(noManager.coordinator.shouldRunChannelSetup()).toBe(false);

        const noServer = createCoordinator({ getSelectedServerId: jest.fn().mockReturnValue(null) });
        expect(noServer.coordinator.shouldRunChannelSetup()).toBe(false);
    });

    it('shouldRunChannelSetup returns true after rerun is requested', () => {
        const { coordinator } = createCoordinator();

        coordinator.requestChannelSetupRerun();

        expect(coordinator.shouldRunChannelSetup()).toBe(true);
    });

    it('shouldRunChannelSetup returns true when no channels exist', () => {
        const { coordinator, channelManager, storage } = createCoordinator();
        const record: ChannelSetupRecord = {
            ...createConfig(),
            createdAt: 1,
            updatedAt: 2,
        };
        storage.set('retune_channel_setup_v1:server-1', JSON.stringify(record));
        channelManager.getAllChannels.mockReturnValue([]);

        expect(coordinator.shouldRunChannelSetup()).toBe(true);
    });

    it('shouldRunChannelSetup returns true when setup record is missing', () => {
        const { coordinator, channelManager } = createCoordinator();
        channelManager.getAllChannels.mockReturnValue([mockChannelConfig]);

        expect(coordinator.shouldRunChannelSetup()).toBe(true);
    });

    it('shouldRunChannelSetup returns true when setup record is invalid', () => {
        const { coordinator, channelManager, storage } = createCoordinator();
        channelManager.getAllChannels.mockReturnValue([mockChannelConfig]);
        storage.set('retune_channel_setup_v1:server-1', JSON.stringify({
            serverId: 'server-1',
            selectedLibraryIds: ['lib1', 123],
            enabledStrategies: { playlists: true },
            createdAt: 1,
            updatedAt: 2,
        }));

        expect(coordinator.shouldRunChannelSetup()).toBe(true);
    });

    it('requestChannelSetupRerun does nothing without a server id', () => {
        const { coordinator, storageRemove, navigation } = createCoordinator({
            getSelectedServerId: jest.fn().mockReturnValue(null),
        });

        coordinator.requestChannelSetupRerun();

        expect(storageRemove).not.toHaveBeenCalled();
        expect(navigation.goTo).not.toHaveBeenCalled();
    });

    it('requestChannelSetupRerun clears storage and navigates when server id exists', () => {
        const { coordinator, storageRemove, navigation } = createCoordinator({
            getSelectedServerId: jest.fn().mockReturnValue('server-9'),
        });

        coordinator.requestChannelSetupRerun();

        expect(storageRemove).toHaveBeenCalledWith('retune_channel_setup_v1:server-9');
        expect(navigation.goTo).toHaveBeenCalledWith('channel-setup');
        expect(coordinator.shouldRunChannelSetup()).toBe(true);
    });

    it('markSetupComplete preserves createdAt and clears rerun flag', () => {
        const { coordinator, storage, channelManager } = createCoordinator();
        const existing: ChannelSetupRecord = {
            ...createConfig(),
            createdAt: 123,
            updatedAt: 456,
        };
        storage.set('retune_channel_setup_v1:server-1', JSON.stringify(existing));
        channelManager.getAllChannels.mockReturnValue([mockChannelConfig]);

        coordinator.requestChannelSetupRerun();
        storage.set('retune_channel_setup_v1:server-1', JSON.stringify(existing));
        coordinator.markSetupComplete('server-1', createConfig({ minItemsPerChannel: 7 }));

        const stored = storage.get('retune_channel_setup_v1:server-1');
        expect(stored).toBeTruthy();
        const parsed = JSON.parse(stored as string) as ChannelSetupRecord;
        expect(parsed.createdAt).toBe(123);
        expect(parsed.updatedAt).toBeGreaterThan(456);
        expect(parsed.minItemsPerChannel).toBe(7);
        expect(coordinator.shouldRunChannelSetup()).toBe(false);
    });

    it('createChannelsFromSetup returns canceled when signal is already aborted', async () => {
        const { coordinator } = createCoordinator();
        const controller = new AbortController();
        controller.abort();

        const summary = await coordinator.createChannelsFromSetup(createConfig(), { signal: controller.signal });

        expect(summary.canceled).toBe(true);
        expect(summary.lastTask).toBe('init');
    });

    it('createChannelsFromSetup treats AbortError as cancellation without errors', async () => {
        const { coordinator, plexLibrary } = createCoordinator();
        plexLibrary.getPlaylists.mockRejectedValue({ name: 'AbortError' });

        const summary = await coordinator.createChannelsFromSetup(createConfig({
            enabledStrategies: { ...createConfig().enabledStrategies, playlists: true },
        }));

        expect(summary.canceled).toBe(true);
        expect(summary.lastTask).toBe('fetch_playlists');
        expect(summary.errorCount).toBe(0);
    });

    it('createChannelsFromSetup treats AbortError from getLibrariesForSetup as cancellation', async () => {
        const { coordinator, plexLibrary } = createCoordinator();
        plexLibrary.getLibraries.mockRejectedValue({ name: 'AbortError' });

        const summary = await coordinator.createChannelsFromSetup(createConfig());

        expect(summary.canceled).toBe(true);
        expect(summary.lastTask).toBe('fetch_playlists');
        expect(summary.errorCount).toBe(0);
    });

    it('createChannelsFromSetup falls back to default minItems for non-finite values', async () => {
        const { coordinator, plexLibrary } = createCoordinator();
        plexLibrary.getLibraries.mockResolvedValue([
            { id: 'lib1', title: 'Movies', type: 'movie', contentCount: 25 },
        ] as PlexLibraryType[]);
        plexLibrary.getLibraryItems.mockResolvedValue([]);

        await coordinator.createChannelsFromSetup(createConfig({
            selectedLibraryIds: ['lib1'],
            enabledStrategies: { ...createConfig().enabledStrategies, genres: true },
            minItemsPerChannel: Number.NaN,
        }));

        expect(plexLibrary.getLibraryItems).toHaveBeenCalled();
    });

    it('createChannelsFromSetup skips library fallback when count is zero', async () => {
        const { coordinator, plexLibrary } = createCoordinator();
        const libraries: PlexLibraryType[] = [
            { id: 'lib1', title: 'Movies', type: 'movie', contentCount: 0 } as PlexLibraryType,
        ];
        plexLibrary.getLibraries.mockResolvedValue(libraries);
        plexLibrary.getLibraryItemCount.mockResolvedValue(0);

        const summary = await coordinator.createChannelsFromSetup(createConfig({
            selectedLibraryIds: ['lib1'],
            enabledStrategies: { ...createConfig().enabledStrategies, libraryFallback: true },
        }));

        expect(mockBuilder.createChannel).not.toHaveBeenCalled();
        expect(summary.created).toBe(0);
        expect(summary.skipped).toBe(1);
    });

    it('logs safe summaries for playlist fetch errors', async () => {
        const { coordinator, plexLibrary } = createCoordinator();
        const error = { name: 'Error', code: 'BAD', message: 'http://plex?X-Plex-Token=secret' };
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

        plexLibrary.getPlaylists.mockRejectedValue(error);

        await coordinator.createChannelsFromSetup(createConfig({
            enabledStrategies: { ...createConfig().enabledStrategies, playlists: true },
        }));

        const warnCalls = warnSpy.mock.calls.filter((call) => call[0] === 'Failed to fetch playlists:');
        expect(warnCalls.length).toBe(1);
        const firstCall = warnCalls[0];
        expect(firstCall).toBeDefined();
        if (!firstCall) {
            throw new Error('Expected warn call for playlists');
        }
        expect(firstCall[1]).not.toBe(error);
        expect(firstCall[1].message).toMatch(/X-Plex-Token=REDACTED/i);
        expect(firstCall[1].message).not.toMatch(/X-Plex-Token=secret/i);

        warnSpy.mockRestore();
    });
});
