import { ChannelManager } from '../ChannelManager';

function createMemoryLocalStorage(): Storage {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string): string | null => (key in store ? store[key]! : null),
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
    } as unknown as Storage;
}

describe('ChannelManager Demo Mode seeding', () => {
    const demoStorageKey = 'retune_channels_demo_v1';

    const plexLibraryStub = {
        getLibraryItems: jest.fn(async () => []),
        getCollectionItems: jest.fn(async () => []),
        getShowEpisodes: jest.fn(async () => []),
        getPlaylistItems: jest.fn(async () => []),
        getItem: jest.fn(async () => null),
    };

    const originalLocalStorage = global.localStorage;

    beforeEach(() => {
        Object.defineProperty(global, 'localStorage', {
            value: createMemoryLocalStorage(),
            configurable: true,
        });
    });

    afterEach(() => {
        Object.defineProperty(global, 'localStorage', {
            value: originalLocalStorage,
            configurable: true,
        });
    });

    it('creates deterministic channels with stable IDs and manual sources', async () => {
        const cm = new ChannelManager({
            plexLibrary: plexLibraryStub,
            storageKey: demoStorageKey,
            logger: { warn: jest.fn(), error: jest.fn() },
        });

        await cm.seedDemoChannels();

        const channels = cm.getAllChannels();
        expect(channels.length).toBe(10);
        expect(channels[0]?.id).toBe('demo-channel-001');
        expect(channels[0]?.contentSource.type).toBe('manual');
        expect(channels[0]?.playbackMode).toBe('shuffle');
        expect(channels[0]?.shuffleSeed).toBe(12346);

        // Deterministic anchor for stable scheduling across reloads.
        expect(channels[0]?.startTimeAnchor).toBe(Date.UTC(2020, 0, 1, 0, 0, 0, 0));

        // Manual items must be present and have stable ratingKeys/durations.
        const firstItems = (channels[0]?.contentSource.type === 'manual')
            ? channels[0].contentSource.items
            : [];
        expect(firstItems.length).toBeGreaterThan(0);
        expect(firstItems[0]?.ratingKey).toBe('demo-1-0');
        expect(firstItems[0]?.durationMs).toBe(300000);
    });
});

