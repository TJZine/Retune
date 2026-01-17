/**
 * @fileoverview Unit tests for ContentResolver.
 * @module modules/scheduler/channel-manager/__tests__/ContentResolver.test
 */

import { ContentResolver } from '../ContentResolver';
import type { IPlexLibraryMinimal, PlexMediaItemMinimal } from '../interfaces';
import type {
    LibraryContentSource,
    CollectionContentSource,
    ShowContentSource,
    PlaylistContentSource,
    ManualContentSource,
    MixedContentSource,
    ContentFilter,
    ResolvedContentItem,
} from '../types';

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

function createMockEpisode(
    season: number,
    episode: number,
    overrides: Partial<PlexMediaItemMinimal> = {}
): PlexMediaItemMinimal {
    return {
        ratingKey: `s${season}e${episode}`,
        type: 'episode',
        title: `Episode ${episode}`,
        year: 2020,
        durationMs: 2700000,
        thumb: `/thumb/s${season}e${episode}`,
        grandparentTitle: 'Test Show',
        seasonNumber: season,
        episodeNumber: episode,
        addedAt: new Date(),
        ...overrides,
    };
}

// ============================================
// Tests
// ============================================

describe('ContentResolver', () => {
    let mockLibrary: jest.Mocked<IPlexLibraryMinimal>;
    let resolver: ContentResolver;

    beforeEach(() => {
        mockLibrary = createMockLibrary();
        resolver = new ContentResolver(mockLibrary);
    });

    describe('resolveSource', () => {
        it('should resolve library source', async () => {
            const items = [createMockItem({ ratingKey: '1' }), createMockItem({ ratingKey: '2' })];
            mockLibrary.getLibraryItems.mockResolvedValue(items);

            const source: LibraryContentSource = {
                type: 'library',
                libraryId: 'lib1',
                libraryType: 'movie',
                includeWatched: true,
            };

            const result = await resolver.resolveSource(source);

            expect(mockLibrary.getLibraryItems).toHaveBeenCalledWith('lib1');
            expect(result).toHaveLength(2);
            expect(result[0]!.ratingKey).toBe('1');
        });

        it('should resolve collection source', async () => {
            const items = [createMockItem({ ratingKey: 'c1' })];
            mockLibrary.getCollectionItems.mockResolvedValue(items);

            const source: CollectionContentSource = {
                type: 'collection',
                collectionKey: 'col1',
                collectionName: 'My Collection',
            };

            const result = await resolver.resolveSource(source);

            expect(mockLibrary.getCollectionItems).toHaveBeenCalledWith('col1');
            expect(result).toHaveLength(1);
        });

        it('should expand show containers returned by a collection source', async () => {
            const show = createMockItem({
                ratingKey: 'show-1',
                type: 'show',
                title: 'My Show',
                durationMs: 123456, // Some servers populate this even for show containers
                genres: ['Animation'],
                contentRating: 'PG',
            });
            const episodes = [createMockEpisode(1, 1), createMockEpisode(1, 2)];

            mockLibrary.getCollectionItems.mockResolvedValue([show]);
            mockLibrary.getShowEpisodes.mockResolvedValue(episodes);

            const source: CollectionContentSource = {
                type: 'collection',
                collectionKey: 'col-shows',
                collectionName: 'Show Collection',
            };

            const result = await resolver.resolveSource(source);

            expect(mockLibrary.getCollectionItems).toHaveBeenCalledWith('col-shows');
            expect(mockLibrary.getShowEpisodes).toHaveBeenCalledWith('show-1');
            expect(result).toHaveLength(2);
            expect(result[0]!.type).toBe('episode');
            expect(result[0]!.genres).toEqual(['Animation']);
            expect(result[0]!.scheduledIndex).toBe(0);
            expect(result[1]!.scheduledIndex).toBe(1);
        });

        it('should resolve show source with all episodes', async () => {
            const episodes = [
                createMockEpisode(1, 1),
                createMockEpisode(1, 2),
                createMockEpisode(2, 1),
            ];
            mockLibrary.getShowEpisodes.mockResolvedValue(episodes);

            const source: ShowContentSource = {
                type: 'show',
                showKey: 'show1',
                showName: 'Test Show',
            };

            const result = await resolver.resolveSource(source);

            expect(mockLibrary.getShowEpisodes).toHaveBeenCalledWith('show1');
            expect(result).toHaveLength(3);
        });

        it('should resolve show source with season filter', async () => {
            const episodes = [
                createMockEpisode(1, 1),
                createMockEpisode(1, 2),
                createMockEpisode(2, 1),
                createMockEpisode(3, 1),
            ];
            mockLibrary.getShowEpisodes.mockResolvedValue(episodes);

            const source: ShowContentSource = {
                type: 'show',
                showKey: 'show1',
                showName: 'Test Show',
                seasonFilter: [1, 2],
            };

            const result = await resolver.resolveSource(source);

            expect(result).toHaveLength(3);
            expect(result.every((ep) => [1, 2].includes(ep.seasonNumber!))).toBe(true);
        });

        it('should resolve playlist source', async () => {
            const items = [createMockItem({ ratingKey: 'p1' })];
            mockLibrary.getPlaylistItems.mockResolvedValue(items);

            const source: PlaylistContentSource = {
                type: 'playlist',
                playlistKey: 'playlist1',
                playlistName: 'My Playlist',
            };

            const result = await resolver.resolveSource(source);

            expect(mockLibrary.getPlaylistItems).toHaveBeenCalledWith('playlist1');
            expect(result).toHaveLength(1);
        });

        // Issue 7: Manual source now uses cached metadata without fetching from Plex
        it('should resolve manual source from cached metadata', async () => {
            const source: ManualContentSource = {
                type: 'manual',
                items: [{ ratingKey: 'm1', title: 'Manual Item', durationMs: 3600000 }],
            };

            const result = await resolver.resolveSource(source);

            // Should NOT call getItem - uses cached metadata
            expect(mockLibrary.getItem).not.toHaveBeenCalled();
            expect(result).toHaveLength(1);
            expect(result[0]!.title).toBe('Manual Item');
            expect(result[0]!.durationMs).toBe(3600000);
        });

        it('should resolve mixed source with sequential mode', async () => {
            const libraryItems = [createMockItem({ ratingKey: 'l1' })];
            const collectionItems = [createMockItem({ ratingKey: 'c1' })];
            mockLibrary.getLibraryItems.mockResolvedValue(libraryItems);
            mockLibrary.getCollectionItems.mockResolvedValue(collectionItems);

            const source: MixedContentSource = {
                type: 'mixed',
                sources: [
                    { type: 'library', libraryId: 'lib1', libraryType: 'movie', includeWatched: true },
                    { type: 'collection', collectionKey: 'col1', collectionName: 'Col' },
                ],
                mixMode: 'sequential',
            };

            const result = await resolver.resolveSource(source);

            expect(result).toHaveLength(2);
            expect(result[0]!.ratingKey).toBe('l1');
            expect(result[1]!.ratingKey).toBe('c1');
        });

        it('should resolve mixed source with interleave mode', async () => {
            const libraryItems = [
                createMockItem({ ratingKey: 'l1' }),
                createMockItem({ ratingKey: 'l2' }),
            ];
            const collectionItems = [createMockItem({ ratingKey: 'c1' })];
            mockLibrary.getLibraryItems.mockResolvedValue(libraryItems);
            mockLibrary.getCollectionItems.mockResolvedValue(collectionItems);

            const source: MixedContentSource = {
                type: 'mixed',
                sources: [
                    { type: 'library', libraryId: 'lib1', libraryType: 'movie', includeWatched: true },
                    { type: 'collection', collectionKey: 'col1', collectionName: 'Col' },
                ],
                mixMode: 'interleave',
            };

            const result = await resolver.resolveSource(source);

            // Interleave: l1, c1, l2
            expect(result).toHaveLength(3);
            expect(result[0]!.ratingKey).toBe('l1');
            expect(result[1]!.ratingKey).toBe('c1');
            expect(result[2]!.ratingKey).toBe('l2');
        });

        // Issue 5: Errors now propagate for cached fallback handling by ChannelManager
        it('should propagate errors for cached fallback handling', async () => {
            mockLibrary.getLibraryItems.mockRejectedValue(new Error('404'));

            const source: LibraryContentSource = {
                type: 'library',
                libraryId: 'lib1',
                libraryType: 'movie',
                includeWatched: true,
            };

            await expect(resolver.resolveSource(source)).rejects.toThrow('404');
        });
    });

    describe('applyFilters', () => {
        const items: ResolvedContentItem[] = [
            { ratingKey: '1', type: 'movie', title: 'A', fullTitle: 'A', durationMs: 3600000, thumb: null, year: 2018, scheduledIndex: 0 },
            { ratingKey: '2', type: 'movie', title: 'B', fullTitle: 'B', durationMs: 7200000, thumb: null, year: 2020, scheduledIndex: 1 },
            { ratingKey: '3', type: 'movie', title: 'C', fullTitle: 'C', durationMs: 5400000, thumb: null, year: 2022, scheduledIndex: 2 },
        ];

        it('should filter by year gte', () => {
            const filter: ContentFilter = { field: 'year', operator: 'gte', value: 2020 };
            const result = resolver.applyFilters(items, [filter]);
            expect(result).toHaveLength(2);
            expect(result.every((i) => i.year >= 2020)).toBe(true);
        });

        it('should filter by year eq', () => {
            const filter: ContentFilter = { field: 'year', operator: 'eq', value: 2020 };
            const result = resolver.applyFilters(items, [filter]);
            expect(result).toHaveLength(1);
            expect(result[0]!.year).toBe(2020);
        });

        it('should filter by duration lt', () => {
            const filter: ContentFilter = { field: 'duration', operator: 'lt', value: 6000000 };
            const result = resolver.applyFilters(items, [filter]);
            expect(result).toHaveLength(2);
        });

        it('should apply multiple filters with AND logic', () => {
            const filters: ContentFilter[] = [
                { field: 'year', operator: 'gte', value: 2019 },
                { field: 'duration', operator: 'lte', value: 6000000 },
            ];
            const result = resolver.applyFilters(items, filters);
            expect(result).toHaveLength(1);
            expect(result[0]!.ratingKey).toBe('3');
        });
    });

    describe('applySort', () => {
        const items: ResolvedContentItem[] = [
            { ratingKey: '1', type: 'movie', title: 'Zebra', fullTitle: 'Zebra', durationMs: 3600000, thumb: null, year: 2020, scheduledIndex: 0 },
            { ratingKey: '2', type: 'movie', title: 'Apple', fullTitle: 'Apple', durationMs: 7200000, thumb: null, year: 2018, scheduledIndex: 1 },
            { ratingKey: '3', type: 'movie', title: 'Mango', fullTitle: 'Mango', durationMs: 5400000, thumb: null, year: 2022, scheduledIndex: 2 },
        ];

        it('should sort by title ascending', () => {
            const result = resolver.applySort(items, 'title_asc');
            expect(result[0]!.title).toBe('Apple');
            expect(result[2]!.title).toBe('Zebra');
        });

        it('should sort by title descending', () => {
            const result = resolver.applySort(items, 'title_desc');
            expect(result[0]!.title).toBe('Zebra');
            expect(result[2]!.title).toBe('Apple');
        });

        it('should sort by year ascending', () => {
            const result = resolver.applySort(items, 'year_asc');
            expect(result[0]!.year).toBe(2018);
            expect(result[2]!.year).toBe(2022);
        });

        it('should sort by duration descending', () => {
            const result = resolver.applySort(items, 'duration_desc');
            expect(result[0]!.durationMs).toBe(7200000);
            expect(result[2]!.durationMs).toBe(3600000);
        });

        it('should sort by episode order', () => {
            const episodes: ResolvedContentItem[] = [
                { ratingKey: '1', type: 'episode', title: 'Ep3', fullTitle: 'Ep3', durationMs: 1000, thumb: null, year: 2020, seasonNumber: 2, episodeNumber: 1, scheduledIndex: 0 },
                { ratingKey: '2', type: 'episode', title: 'Ep1', fullTitle: 'Ep1', durationMs: 1000, thumb: null, year: 2020, seasonNumber: 1, episodeNumber: 1, scheduledIndex: 1 },
                { ratingKey: '3', type: 'episode', title: 'Ep2', fullTitle: 'Ep2', durationMs: 1000, thumb: null, year: 2020, seasonNumber: 1, episodeNumber: 2, scheduledIndex: 2 },
            ];
            const result = resolver.applySort(episodes, 'episode_order');
            expect(result[0]!.seasonNumber).toBe(1);
            expect(result[0]!.episodeNumber).toBe(1);
            expect(result[1]!.episodeNumber).toBe(2);
            expect(result[2]!.seasonNumber).toBe(2);
        });
    });

    describe('applyPlaybackMode', () => {
        const items: ResolvedContentItem[] = [
            { ratingKey: '1', type: 'movie', title: 'A', fullTitle: 'A', durationMs: 1000, thumb: null, year: 2020, scheduledIndex: 0 },
            { ratingKey: '2', type: 'movie', title: 'B', fullTitle: 'B', durationMs: 1000, thumb: null, year: 2020, scheduledIndex: 1 },
            { ratingKey: '3', type: 'movie', title: 'C', fullTitle: 'C', durationMs: 1000, thumb: null, year: 2020, scheduledIndex: 2 },
        ];

        it('should preserve order for sequential mode', () => {
            const result = resolver.applyPlaybackMode(items, 'sequential', 12345);
            expect(result.map((i) => i.ratingKey)).toEqual(['1', '2', '3']);
        });

        it('should shuffle deterministically for shuffle mode', () => {
            const result1 = resolver.applyPlaybackMode(items, 'shuffle', 12345);
            const result2 = resolver.applyPlaybackMode(items, 'shuffle', 12345);
            expect(result1.map((i) => i.ratingKey)).toEqual(result2.map((i) => i.ratingKey));
        });

        it('should update scheduledIndex after shuffle', () => {
            const result = resolver.applyPlaybackMode(items, 'shuffle', 12345);
            expect(result[0]!.scheduledIndex).toBe(0);
            expect(result[1]!.scheduledIndex).toBe(1);
            expect(result[2]!.scheduledIndex).toBe(2);
        });
    });

    describe('fullTitle generation', () => {
        it('should build full title for episodes', async () => {
            const episode = createMockEpisode(1, 5, {
                grandparentTitle: 'Breaking Bad',
                title: 'Gray Matter',
            });
            mockLibrary.getShowEpisodes.mockResolvedValue([episode]);

            const source: ShowContentSource = {
                type: 'show',
                showKey: 'show1',
                showName: 'Breaking Bad',
            };

            const result = await resolver.resolveSource(source);

            expect(result[0]!.fullTitle).toBe('Breaking Bad - S01E05 - Gray Matter');
        });

        it('should use title only for movies', async () => {
            const movie = createMockItem({ title: 'Inception' });
            mockLibrary.getLibraryItems.mockResolvedValue([movie]);

            const source: LibraryContentSource = {
                type: 'library',
                libraryId: 'lib1',
                libraryType: 'movie',
                includeWatched: true,
            };

            const result = await resolver.resolveSource(source);

            expect(result[0]!.fullTitle).toBe('Inception');
        });
    });
});
