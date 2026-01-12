/**
 * @fileoverview Unit tests for ChannelManager.
 * @module modules/scheduler/channel-manager/__tests__/ChannelManager.test
 */

import { ChannelManager } from '../ChannelManager';
import type { IPlexLibraryMinimal, PlexMediaItemMinimal } from '../interfaces';
import type { LibraryContentSource } from '../types';
import {
    STORAGE_KEY,
    CURRENT_CHANNEL_KEY,
} from '../constants';

// ============================================
// Mock Setup
// ============================================

function createMockLibrary(): jest.Mocked<IPlexLibraryMinimal> {
    return {
        getLibraryItems: jest.fn(),
        getCollectionItems: jest.fn(),
        getShowEpisodes: jest.fn(),
        getPlaylistItems: jest.fn(),
        getItem: jest.fn(),
    };
}

function createMockItem(overrides: Partial<PlexMediaItemMinimal> = {}): PlexMediaItemMinimal {
    return {
        ratingKey: '1',
        type: 'movie',
        title: 'Test Movie',
        year: 2020,
        durationMs: 7200000,
        thumb: '/thumb/1',
        addedAt: new Date(),
        ...overrides,
    };
}

function createMockContentSource(): LibraryContentSource {
    return {
        type: 'library',
        libraryId: 'lib1',
        libraryType: 'movie',
        includeWatched: true,
    };
}

// localStorage mock
const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
    getItem: jest.fn((key: string) => mockStorage[key] || null),
    setItem: jest.fn((key: string, value: string) => {
        mockStorage[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
        delete mockStorage[key];
    }),
    clear: jest.fn(() => {
        Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    }),
    get length(): number {
        return Object.keys(mockStorage).length;
    },
    key: jest.fn((index: number) => Object.keys(mockStorage)[index] || null),
};

Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
    configurable: true,
});

// ============================================
// Tests
// ============================================

describe('ChannelManager', () => {
    let mockLibrary: jest.Mocked<IPlexLibraryMinimal>;
    let manager: ChannelManager;

    beforeEach(() => {
        mockLocalStorage.clear();
        jest.clearAllMocks();

        mockLibrary = createMockLibrary();
        mockLibrary.getLibraryItems.mockResolvedValue([
            createMockItem({ ratingKey: '1' }),
            createMockItem({ ratingKey: '2' }),
        ]);

        manager = new ChannelManager({ plexLibrary: mockLibrary });
    });

    describe('CRUD operations', () => {
        it('should create channel with generated ID and number', async () => {
            const channel = await manager.createChannel({
                name: 'Test Channel',
                contentSource: createMockContentSource(),
            });

            expect(channel.id).toMatch(/^[a-f0-9-]{36}$/);
            expect(channel.number).toBeGreaterThanOrEqual(1);
            expect(channel.name).toBe('Test Channel');
        });

        it('should assign next available channel number', async () => {
            await manager.createChannel({
                number: 1,
                contentSource: createMockContentSource(),
            });
            const ch2 = await manager.createChannel({
                contentSource: createMockContentSource(),
            });

            expect(ch2.number).toBe(2);
        });

        it('should throw if content source missing', async () => {
            await expect(manager.createChannel({ name: 'Test' })).rejects.toThrow(
                'Content source is required'
            );
        });

        it('should throw on duplicate channel number', async () => {
            await manager.createChannel({
                number: 5,
                contentSource: createMockContentSource(),
            });

            await expect(
                manager.createChannel({
                    number: 5,
                    contentSource: createMockContentSource(),
                })
            ).rejects.toThrow('Channel number already in use');
        });

        it('should throw on invalid channel number', async () => {
            await expect(
                manager.createChannel({
                    number: 0,
                    contentSource: createMockContentSource(),
                })
            ).rejects.toThrow('Channel number must be between 1 and 999');

            await expect(
                manager.createChannel({
                    number: 1000,
                    contentSource: createMockContentSource(),
                })
            ).rejects.toThrow('Channel number must be between 1 and 999');
        });

        it('should emit channelCreated event', async () => {
            const handler = jest.fn();
            manager.on('channelCreated', handler);

            await manager.createChannel({ contentSource: createMockContentSource() });

            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: expect.any(String),
                    number: expect.any(Number),
                })
            );
        });

        it('should update channel and emit event', async () => {
            const channel = await manager.createChannel({
                name: 'Original',
                contentSource: createMockContentSource(),
            });

            const handler = jest.fn();
            manager.on('channelUpdated', handler);

            const updated = await manager.updateChannel(channel.id, { name: 'Updated' });

            expect(updated.name).toBe('Updated');
            expect(handler).toHaveBeenCalledWith(expect.objectContaining({ name: 'Updated' }));
        });

        it('should delete channel and emit event', async () => {
            const channel = await manager.createChannel({
                contentSource: createMockContentSource(),
            });

            const handler = jest.fn();
            manager.on('channelDeleted', handler);

            await manager.deleteChannel(channel.id);

            expect(manager.getChannel(channel.id)).toBeNull();
            expect(handler).toHaveBeenCalledWith(channel.id);
        });

        it('should find channel by number', async () => {
            await manager.createChannel({
                number: 5,
                name: 'Channel 5',
                contentSource: createMockContentSource(),
            });

            const ch = manager.getChannelByNumber(5);

            expect(ch).not.toBeNull();
            expect(ch!.number).toBe(5);
            expect(ch!.name).toBe('Channel 5');
        });
    });

    describe('content resolution', () => {
        it('should resolve library content source', async () => {
            const channel = await manager.createChannel({
                contentSource: createMockContentSource(),
            });

            const result = await manager.resolveChannelContent(channel.id);

            expect(result.items).toHaveLength(2);
            expect(result.channelId).toBe(channel.id);
        });

        it('should resolve collection content source', async () => {
            mockLibrary.getCollectionItems.mockResolvedValue([createMockItem()]);

            const channel = await manager.createChannel({
                contentSource: {
                    type: 'collection',
                    collectionKey: 'col1',
                    collectionName: 'My Collection',
                },
            });

            const result = await manager.resolveChannelContent(channel.id);
            expect(result.items).toHaveLength(1);
        });

        it('should resolve show content source', async () => {
            mockLibrary.getShowEpisodes.mockResolvedValue([
                createMockItem({ ratingKey: 'ep1', type: 'episode' }),
                createMockItem({ ratingKey: 'ep2', type: 'episode' }),
                createMockItem({ ratingKey: 'ep3', type: 'episode' }),
            ]);

            const channel = await manager.createChannel({
                contentSource: {
                    type: 'show',
                    showKey: 'show1',
                    showName: 'Test Show',
                },
            });

            const result = await manager.resolveChannelContent(channel.id);
            expect(result.items).toHaveLength(3);
        });

        it('should resolve manual content source', async () => {
            mockLibrary.getItem.mockResolvedValue(createMockItem({ ratingKey: 'manual1' }));

            const channel = await manager.createChannel({
                contentSource: {
                    type: 'manual',
                    items: [{ ratingKey: 'manual1', title: 'Manual', durationMs: 1000 }],
                },
            });

            const result = await manager.resolveChannelContent(channel.id);
            expect(result.items.length).toBeGreaterThan(0);
        });

        it('should cache resolved content', async () => {
            const channel = await manager.createChannel({
                contentSource: createMockContentSource(),
            });

            // First resolution happens in createChannel
            mockLibrary.getLibraryItems.mockClear();

            await manager.resolveChannelContent(channel.id);
            await manager.resolveChannelContent(channel.id);

            // Should not call again due to cache
            expect(mockLibrary.getLibraryItems).toHaveBeenCalledTimes(0);
        });

        it('should force refresh bypasses cache', async () => {
            const channel = await manager.createChannel({
                contentSource: createMockContentSource(),
            });

            mockLibrary.getLibraryItems.mockClear();

            await manager.refreshChannelContent(channel.id);

            expect(mockLibrary.getLibraryItems).toHaveBeenCalledTimes(1);
        });

        it('should handle library deleted gracefully', async () => {
            mockLibrary.getLibraryItems.mockRejectedValue(new Error('404'));

            const channel = await manager.createChannel({
                contentSource: createMockContentSource(),
            });

            // Content should be empty but not throw
            expect(channel.itemCount).toBe(0);
        });
    });

    describe('channel switching', () => {
        it('should switch to channel by ID', async () => {
            // Create first channel to establish position
            await manager.createChannel({
                name: 'Ch1',
                contentSource: createMockContentSource(),
            });
            const ch2 = await manager.createChannel({
                name: 'Ch2',
                contentSource: createMockContentSource(),
            });

            manager.setCurrentChannel(ch2.id);

            expect(manager.getCurrentChannel()!.id).toBe(ch2.id);
        });

        it('should emit channelSwitch event', async () => {
            const channel = await manager.createChannel({
                contentSource: createMockContentSource(),
            });

            const handler = jest.fn();
            manager.on('channelSwitch', handler);

            manager.setCurrentChannel(channel.id);

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    channel: expect.objectContaining({ id: channel.id }),
                })
            );
        });

        it('should persist current channel', async () => {
            const channel = await manager.createChannel({
                contentSource: createMockContentSource(),
            });

            manager.setCurrentChannel(channel.id);

            expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
                CURRENT_CHANNEL_KEY,
                channel.id
            );
        });

        it('should get next and previous channels', async () => {
            const ch1 = await manager.createChannel({
                name: 'Ch1',
                contentSource: createMockContentSource(),
            });
            const ch2 = await manager.createChannel({
                name: 'Ch2',
                contentSource: createMockContentSource(),
            });
            const ch3 = await manager.createChannel({
                name: 'Ch3',
                contentSource: createMockContentSource(),
            });

            manager.setCurrentChannel(ch2.id);

            expect(manager.getNextChannel()!.id).toBe(ch3.id);
            expect(manager.getPreviousChannel()!.id).toBe(ch1.id);
        });

        it('should wrap around for next/previous', async () => {
            const ch1 = await manager.createChannel({
                name: 'Ch1',
                contentSource: createMockContentSource(),
            });
            const ch2 = await manager.createChannel({
                name: 'Ch2',
                contentSource: createMockContentSource(),
            });

            manager.setCurrentChannel(ch2.id);
            expect(manager.getNextChannel()!.id).toBe(ch1.id);

            manager.setCurrentChannel(ch1.id);
            expect(manager.getPreviousChannel()!.id).toBe(ch2.id);
        });
    });

    describe('persistence', () => {
        it('should save channels to localStorage', async () => {
            await manager.createChannel({ contentSource: createMockContentSource() });
            await manager.saveChannels();

            expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
                STORAGE_KEY,
                expect.any(String)
            );
        });

        it('should restore channels on load', async () => {
            // Create and save a channel
            await manager.createChannel({
                name: 'Saved Channel',
                contentSource: createMockContentSource(),
            });

            // Create new manager and load
            const newManager = new ChannelManager({ plexLibrary: mockLibrary });
            await newManager.loadChannels();

            expect(newManager.getAllChannels()).toHaveLength(1);
            expect(newManager.getAllChannels()[0]!.name).toBe('Saved Channel');
        });

        it('should not throw on malformed persisted contentSource', async () => {
            await manager.createChannel({
                name: 'Bad Channel',
                contentSource: createMockContentSource(),
            });
            const channel = manager.getAllChannels()[0]!;

            mockLocalStorage.clear();
            mockStorage[STORAGE_KEY] = JSON.stringify({
                version: 2,
                channels: [{ ...channel, contentSource: null }],
                channelOrder: [channel.id],
                currentChannelId: channel.id,
                savedAt: Date.now(),
            });

            const newManager = new ChannelManager({ plexLibrary: mockLibrary });
            await expect(newManager.loadChannels()).resolves.toBeUndefined();
            expect(newManager.getAllChannels()).toHaveLength(0);
        });

        it('should prune channels with malformed manual item shapes on load', async () => {
            await manager.createChannel({
                name: 'Bad Manual Channel',
                contentSource: createMockContentSource(),
            });
            const channel = manager.getAllChannels()[0]!;

            mockLocalStorage.clear();
            mockStorage[STORAGE_KEY] = JSON.stringify({
                version: 2,
                channels: [{
                    ...channel,
                    contentSource: {
                        type: 'manual',
                        items: [
                            // durationMs has wrong type
                            { ratingKey: 'rk1', title: 'Manual Item', durationMs: '1000' },
                        ],
                    },
                }],
                channelOrder: [channel.id],
                currentChannelId: channel.id,
                savedAt: Date.now(),
            });

            const newManager = new ChannelManager({ plexLibrary: mockLibrary });
            await newManager.loadChannels();
            expect(newManager.getAllChannels()).toHaveLength(0);
        });

        it('should rebuild channelOrder when persisted order is empty', async () => {
            const ch1 = await manager.createChannel({
                name: 'Ch 10',
                number: 10,
                contentSource: createMockContentSource(),
            });
            const ch2 = await manager.createChannel({
                name: 'Ch 2',
                number: 2,
                contentSource: createMockContentSource(),
            });

            mockLocalStorage.clear();
            mockStorage[STORAGE_KEY] = JSON.stringify({
                version: 2,
                channels: [ch1, ch2],
                channelOrder: [],
                currentChannelId: 'missing',
                savedAt: Date.now(),
            });

            const newManager = new ChannelManager({ plexLibrary: mockLibrary });
            await newManager.loadChannels();

            const loaded = newManager.getAllChannels();
            expect(loaded).toHaveLength(2);
            // Rebuilt order is by channel number.
            expect(loaded[0]?.number).toBe(2);
            expect(loaded[1]?.number).toBe(10);
            // Current channel is sanitized to first if invalid.
            expect(newManager.getCurrentChannel()?.id).toBe(loaded[0]?.id);
        });

        it('should export channels as JSON', async () => {
            await manager.createChannel({
                name: 'Export Test',
                contentSource: createMockContentSource(),
            });

            const json = manager.exportChannels();
            const parsed = JSON.parse(json);

            expect(Array.isArray(parsed)).toBe(true);
            expect(parsed[0].name).toBe('Export Test');
        });

        it('should import channels from JSON', async () => {
            const importData = JSON.stringify([
                {
                    name: 'Imported Channel',
                    contentSource: createMockContentSource(),
                },
            ]);

            const result = await manager.importChannels(importData);

            expect(result.success).toBe(true);
            expect(result.importedCount).toBe(1);
            expect(result.errors).toHaveLength(0);
            expect(manager.getAllChannels()).toHaveLength(1);
        });

        it('should handle invalid import data', async () => {
            const result = await manager.importChannels('not valid json');

            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('should skip invalid channels during import', async () => {
            const importData = JSON.stringify([
                { name: 'Missing contentSource' },
                { name: 'Valid', contentSource: createMockContentSource() },
            ]);

            const result = await manager.importChannels(importData);

            expect(result.importedCount).toBe(1);
            expect(result.skippedCount).toBe(1);
        });
    });

    describe('channel ordering', () => {
        it('should reorder channels', async () => {
            const ch1 = await manager.createChannel({
                name: 'Ch1',
                contentSource: createMockContentSource(),
            });
            const ch2 = await manager.createChannel({
                name: 'Ch2',
                contentSource: createMockContentSource(),
            });
            const ch3 = await manager.createChannel({
                name: 'Ch3',
                contentSource: createMockContentSource(),
            });

            manager.reorderChannels([ch3.id, ch1.id, ch2.id]);

            const all = manager.getAllChannels();
            expect(all[0]!.id).toBe(ch3.id);
            expect(all[1]!.id).toBe(ch1.id);
            expect(all[2]!.id).toBe(ch2.id);
        });
    });

    describe('content filtering and sorting', () => {
        it('should apply content filters', async () => {
            mockLibrary.getLibraryItems.mockResolvedValue([
                createMockItem({ ratingKey: '1', year: 2018 }),
                createMockItem({ ratingKey: '2', year: 2020 }),
                createMockItem({ ratingKey: '3', year: 2022 }),
            ]);

            const channel = await manager.createChannel({
                contentSource: createMockContentSource(),
                contentFilters: [{ field: 'year', operator: 'gte', value: 2020 }],
            });

            expect(channel.itemCount).toBe(2);
        });

        it('should apply sort order', async () => {
            mockLibrary.getLibraryItems.mockResolvedValue([
                createMockItem({ ratingKey: '1', title: 'Zebra' }),
                createMockItem({ ratingKey: '2', title: 'Apple' }),
            ]);

            const channel = await manager.createChannel({
                contentSource: createMockContentSource(),
                sortOrder: 'title_asc',
            });

            const content = await manager.resolveChannelContent(channel.id);
            expect(content.items[0]!.title).toBe('Apple');
        });

        it('should filter out zero-duration items', async () => {
            mockLibrary.getLibraryItems.mockResolvedValue([
                createMockItem({ ratingKey: '1', durationMs: 0 }),
                createMockItem({ ratingKey: '2', durationMs: 7200000 }),
            ]);

            const channel = await manager.createChannel({
                contentSource: createMockContentSource(),
            });

            expect(channel.itemCount).toBe(1);
        });
    });
});
