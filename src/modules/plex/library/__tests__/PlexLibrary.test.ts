import { PlexLibrary, PlexLibraryError, AppErrorCode } from '../PlexLibrary';
import type { PlexLibraryConfig } from '../interfaces';
import { mockLocalStorage, installMockLocalStorage } from '../../../../__tests__/mocks/localStorage';

// ============================================
// Install Mock localStorage
// ============================================

installMockLocalStorage();

// ============================================
// Mock Config
// ============================================

const mockConfig: PlexLibraryConfig = {
    getAuthHeaders: () => ({
        Accept: 'application/json',
        'X-Plex-Token': 'mock-token',
        'X-Plex-Client-Identifier': 'mock-client-id',
    }),
    getServerUri: () => 'http://192.168.1.100:32400',
    getAuthToken: () => 'mock-token',
};

// ============================================
// Mock Data
// ============================================

const mockLibrarySectionsResponse = {
    MediaContainer: {
        Directory: [
            {
                key: '1',
                uuid: 'lib-1',
                title: 'Movies',
                type: 'movie',
                agent: 'com.plexapp.agents.imdb',
                scanner: 'Plex Movie Scanner',
                art: '/library/sections/1/art',
                thumb: '/library/sections/1/thumb',
                scannedAt: 1704067200,
            },
            {
                key: '2',
                uuid: 'lib-2',
                title: 'TV Shows',
                type: 'show',
                agent: 'com.plexapp.agents.thetvdb',
                scanner: 'Plex TV Series',
            },
            {
                key: '3',
                uuid: 'lib-3',
                title: 'Music',
                type: 'artist',
                agent: 'com.plexapp.agents.lastfm',
                scanner: 'Plex Music Scanner',
            },
            {
                key: '4',
                uuid: 'lib-4',
                title: 'Photos',
                type: 'photo',
                agent: 'com.plexapp.agents.none',
                scanner: 'Plex Photo Scanner',
            },
        ],
    },
};

const mockMediaItemResponse = {
    MediaContainer: {
        Metadata: [
            {
                ratingKey: '12345',
                key: '/library/metadata/12345',
                type: 'movie',
                title: 'Test Movie',
                titleSort: 'Test Movie',
                summary: 'A test movie summary',
                year: 2023,
                duration: 7200000,
                addedAt: 1704067200,
                updatedAt: 1704153600,
                thumb: '/library/metadata/12345/thumb',
                art: '/library/metadata/12345/art',
                rating: 8.5,
                audienceRating: 9.0,
                contentRating: 'PG-13',
                Media: [
                    {
                        id: 'm1',
                        duration: 7200000,
                        bitrate: 10000,
                        width: 1920,
                        height: 1080,
                        aspectRatio: 1.78,
                        videoCodec: 'h264',
                        audioCodec: 'aac',
                        audioChannels: 6,
                        container: 'mp4',
                        videoResolution: '1080',
                        Part: [
                            {
                                id: 'p1',
                                key: '/library/parts/p1',
                                duration: 7200000,
                                file: '/movies/test.mp4',
                                size: 5000000000,
                                container: 'mp4',
                                Stream: [
                                    {
                                        id: 's1',
                                        streamType: 1,
                                        codec: 'h264',
                                        width: 1920,
                                        height: 1080,
                                    },
                                    {
                                        id: 's2',
                                        streamType: 2,
                                        codec: 'aac',
                                        language: 'English',
                                        languageCode: 'en',
                                        channels: 6,
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    },
};

const mockShowSeasonsResponse = {
    MediaContainer: {
        Metadata: [
            { ratingKey: 's1', key: '/library/metadata/s1/children', title: 'Season 1', index: 1, leafCount: 10, viewedLeafCount: 5, thumb: '/s1/thumb' },
            { ratingKey: 's2', key: '/library/metadata/s2/children', title: 'Season 2', index: 2, leafCount: 8, viewedLeafCount: 0 },
        ],
    },
};

const mockEpisodesResponse = {
    MediaContainer: {
        Metadata: [
            { ratingKey: 'e1', key: '/library/metadata/e1', type: 'episode', title: 'Pilot', parentIndex: 1, index: 1, duration: 2700000 },
            { ratingKey: 'e2', key: '/library/metadata/e2', type: 'episode', title: 'Episode 2', parentIndex: 1, index: 2, duration: 2700000 },
        ],
    },
};

const mockCollectionsResponse = {
    MediaContainer: {
        Metadata: [
            { ratingKey: 'c1', key: '/library/collections/c1', title: 'Marvel', thumb: '/c1/thumb', childCount: 25 },
            { ratingKey: 'c2', key: '/library/collections/c2', title: 'Star Wars', childCount: 12 },
        ],
    },
};

const mockPlaylistsResponse = {
    MediaContainer: {
        Metadata: [
            { ratingKey: 'pl1', key: '/playlists/pl1', title: 'Favorites', thumb: '/pl1/thumb', duration: 36000000, leafCount: 10 },
        ],
    },
};

const mockSearchResponse = {
    MediaContainer: {
        Hub: [
            {
                type: 'movie',
                hubIdentifier: 'movie',
                size: 2,
                title: 'Movies',
                Metadata: [
                    { ratingKey: 's1', key: '/library/metadata/s1', type: 'movie', title: 'Search Result 1', year: 2023, duration: 7200000 },
                    { ratingKey: 's2', key: '/library/metadata/s2', type: 'movie', title: 'Search Result 2', year: 2022, duration: 6600000 },
                ],
            },
        ],
    },
};

// ============================================
// Helper Functions
// ============================================

function mockFetchJson(json: unknown, status: number = 200): void {
    (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        headers: { get: () => null },
        json: async () => json,
        text: async () => JSON.stringify(json),
    });
}

function mockFetchSequence(responses: Array<{ json: unknown; status?: number }>): void {
    let callIndex = 0;
    (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(() => {
        const response = responses[callIndex] || responses[responses.length - 1];
        callIndex++;
        return Promise.resolve({
            ok: (response?.status ?? 200) >= 200 && (response?.status ?? 200) < 300,
            status: response?.status ?? 200,
            headers: { get: () => null },
            json: async () => response?.json,
            text: async () => JSON.stringify(response?.json),
        });
    });
}
// ============================================
// Tests
// ============================================

describe('PlexLibrary', () => {
    beforeEach(() => {
        mockLocalStorage.clear();
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    describe('getLibraries', () => {
        it('should return all library sections', async () => {
            mockFetchJson(mockLibrarySectionsResponse);
            const library = new PlexLibrary(mockConfig);

            const libs = await library.getLibraries();

            expect(libs).toHaveLength(4);
            expect(libs[0]!.id).toBe('1');
            expect(libs[0]!.title).toBe('Movies');
        });

        it('should parse library types correctly', async () => {
            mockFetchJson(mockLibrarySectionsResponse);
            const library = new PlexLibrary(mockConfig);

            const libs = await library.getLibraries();

            expect(libs[0]!.type).toBe('movie');
            expect(libs[1]!.type).toBe('show');
            expect(libs[2]!.type).toBe('artist');
            expect(libs[3]!.type).toBe('photo');
        });

        it('should cache libraries', async () => {
            mockFetchJson(mockLibrarySectionsResponse);
            const library = new PlexLibrary(mockConfig);

            await library.getLibraries();
            await library.getLibrary('1');

            // Should only call fetch once due to cache
            expect(fetch).toHaveBeenCalledTimes(1);
        });
    });

    describe('getLibrary', () => {
        it('should return specific library', async () => {
            mockFetchJson(mockLibrarySectionsResponse);
            const library = new PlexLibrary(mockConfig);

            const lib = await library.getLibrary('2');

            expect(lib).not.toBeNull();
            expect(lib!.id).toBe('2');
            expect(lib!.title).toBe('TV Shows');
        });

        it('should return null for non-existent library', async () => {
            mockFetchJson(mockLibrarySectionsResponse);
            const library = new PlexLibrary(mockConfig);

            const lib = await library.getLibrary('999');

            expect(lib).toBeNull();
        });
    });

    describe('getLibraryItems', () => {
        it('should handle pagination transparently', async () => {
            // Mock 250 items across 3 pages
            const page1 = { MediaContainer: { Metadata: Array(100).fill(mockMediaItemResponse.MediaContainer.Metadata[0]) } };
            const page2 = { MediaContainer: { Metadata: Array(100).fill(mockMediaItemResponse.MediaContainer.Metadata[0]) } };
            const page3 = { MediaContainer: { Metadata: Array(50).fill(mockMediaItemResponse.MediaContainer.Metadata[0]) } };

            mockFetchSequence([
                { json: page1 },
                { json: page2 },
                { json: page3 },
            ]);

            const library = new PlexLibrary(mockConfig);
            const items = await library.getLibraryItems('1');

            expect(items).toHaveLength(250);
            expect(fetch).toHaveBeenCalledTimes(3);
        });

        it('should handle empty library', async () => {
            mockFetchJson({ MediaContainer: { Metadata: [] } });
            const library = new PlexLibrary(mockConfig);

            const items = await library.getLibraryItems('1');

            expect(items).toHaveLength(0);
            expect(items).toEqual([]);
        });

        it('should handle single-page result', async () => {
            mockFetchJson(mockMediaItemResponse);
            const library = new PlexLibrary(mockConfig);

            const items = await library.getLibraryItems('1');

            expect(items).toHaveLength(1);
            expect(fetch).toHaveBeenCalledTimes(1);
        });

        it('should apply filters', async () => {
            mockFetchJson(mockMediaItemResponse);
            const library = new PlexLibrary(mockConfig);

            await library.getLibraryItems('1', { filter: { year: 2020 } });

            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('year=2020'),
                expect.any(Object)
            );
        });

        it('should use pagination parameters', async () => {
            mockFetchJson(mockMediaItemResponse);
            const library = new PlexLibrary(mockConfig);

            await library.getLibraryItems('1', { offset: 50, limit: 25 });

            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('X-Plex-Container-Start=50'),
                expect.any(Object)
            );
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('X-Plex-Container-Size=25'),
                expect.any(Object)
            );
        });
    });

    describe('getItem', () => {
        it('should return specific item', async () => {
            mockFetchJson(mockMediaItemResponse);
            const library = new PlexLibrary(mockConfig);

            const item = await library.getItem('12345');

            expect(item).not.toBeNull();
            expect(item!.ratingKey).toBe('12345');
            expect(item!.title).toBe('Test Movie');
        });

        it('should return null for 404', async () => {
            mockFetchJson({ error: 'Not found' }, 404);
            const library = new PlexLibrary(mockConfig);

            const item = await library.getItem('99999');

            expect(item).toBeNull();
        });

        it('should parse media files correctly', async () => {
            mockFetchJson(mockMediaItemResponse);
            const library = new PlexLibrary(mockConfig);

            const item = await library.getItem('12345');

            expect(item!.media).toHaveLength(1);
            expect(item!.media[0]!.videoCodec).toBe('h264');
            expect(item!.media[0]!.parts).toHaveLength(1);
            expect(item!.media[0]!.parts[0]!.streams).toHaveLength(2);
        });
    });

    describe('getShowEpisodes', () => {
        it('should fetch all episodes across seasons', async () => {
            mockFetchSequence([
                { json: mockShowSeasonsResponse },
                { json: mockEpisodesResponse },
                { json: mockEpisodesResponse },
            ]);

            const library = new PlexLibrary(mockConfig);
            const episodes = await library.getShowEpisodes('show1');

            expect(episodes).toHaveLength(4); // 2 seasons x 2 episodes
        });

        it('should sort episodes by season and episode number', async () => {
            const season1Episodes = {
                MediaContainer: {
                    Metadata: [
                        { ratingKey: 'e2', key: '/e2', type: 'episode', title: 'S1E2', parentIndex: 1, index: 2, duration: 2700000 },
                        { ratingKey: 'e1', key: '/e1', type: 'episode', title: 'S1E1', parentIndex: 1, index: 1, duration: 2700000 },
                    ],
                },
            };
            const season2Episodes = {
                MediaContainer: {
                    Metadata: [
                        { ratingKey: 'e3', key: '/e3', type: 'episode', title: 'S2E1', parentIndex: 2, index: 1, duration: 2700000 },
                    ],
                },
            };

            mockFetchSequence([
                { json: mockShowSeasonsResponse },
                { json: season1Episodes },
                { json: season2Episodes },
            ]);

            const library = new PlexLibrary(mockConfig);
            const episodes = await library.getShowEpisodes('show1');

            expect(episodes[0]!.seasonNumber).toBe(1);
            expect(episodes[0]!.episodeNumber).toBe(1);
            expect(episodes[1]!.seasonNumber).toBe(1);
            expect(episodes[1]!.episodeNumber).toBe(2);
            expect(episodes[2]!.seasonNumber).toBe(2);
            expect(episodes[2]!.episodeNumber).toBe(1);
        });
    });

    describe('getImageUrl', () => {
        it('should append auth token', () => {
            const library = new PlexLibrary(mockConfig);

            const url = library.getImageUrl('/library/metadata/123/thumb');

            expect(url).toContain('X-Plex-Token=mock-token');
        });

        it('should use transcoder for resized images', () => {
            const library = new PlexLibrary(mockConfig);

            const url = library.getImageUrl('/library/metadata/123/thumb', 300, 450);

            expect(url).toContain('/photo/:/transcode');
            expect(url).toContain('width=300');
            expect(url).toContain('height=450');
        });

        it('should use width for height if not specified', () => {
            const library = new PlexLibrary(mockConfig);

            const url = library.getImageUrl('/library/metadata/123/thumb', 300);

            expect(url).toContain('width=300');
            expect(url).toContain('height=300');
        });

        it('should return empty string for empty path', () => {
            const library = new PlexLibrary(mockConfig);

            const url = library.getImageUrl('');

            expect(url).toBe('');
        });

        it('should return empty string when no server URI', () => {
            const noServerConfig: PlexLibraryConfig = {
                ...mockConfig,
                getServerUri: () => null,
            };
            const library = new PlexLibrary(noServerConfig);

            const url = library.getImageUrl('/library/metadata/123/thumb');

            expect(url).toBe('');
        });
    });

    describe('search', () => {
        it('should return search results', async () => {
            mockFetchJson(mockSearchResponse);
            const library = new PlexLibrary(mockConfig);

            const results = await library.search('test');

            expect(results).toHaveLength(2);
            expect(results[0]!.title).toBe('Search Result 1');
        });

        it('should pass query parameter', async () => {
            mockFetchJson(mockSearchResponse);
            const library = new PlexLibrary(mockConfig);

            await library.search('my search query');

            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('query=my+search+query'),
                expect.any(Object)
            );
        });

        it('should filter by library when specified', async () => {
            mockFetchJson(mockSearchResponse);
            const library = new PlexLibrary(mockConfig);

            await library.search('test', { libraryId: '1' });

            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('sectionId=1'),
                expect.any(Object)
            );
        });
    });

    describe('collections', () => {
        it('should return collections', async () => {
            mockFetchJson(mockCollectionsResponse);
            const library = new PlexLibrary(mockConfig);

            const collections = await library.getCollections('1');

            expect(collections).toHaveLength(2);
            expect(collections[0]!.title).toBe('Marvel');
            expect(collections[0]!.childCount).toBe(25);
        });

        it('should return collection items', async () => {
            mockFetchJson(mockMediaItemResponse);
            const library = new PlexLibrary(mockConfig);

            const items = await library.getCollectionItems('c1');

            expect(items).toHaveLength(1);
        });
    });

    describe('playlists', () => {
        it('should return playlists', async () => {
            mockFetchJson(mockPlaylistsResponse);
            const library = new PlexLibrary(mockConfig);

            const playlists = await library.getPlaylists();

            expect(playlists).toHaveLength(1);
            expect(playlists[0]!.title).toBe('Favorites');
            expect(playlists[0]!.leafCount).toBe(10);
        });

        it('should return playlist items', async () => {
            mockFetchJson(mockMediaItemResponse);
            const library = new PlexLibrary(mockConfig);

            const items = await library.getPlaylistItems('pl1');

            expect(items).toHaveLength(1);
        });
    });

    describe('error handling', () => {
        it('should emit authExpired on 401', async () => {
            mockFetchJson({ error: 'Unauthorized' }, 401);
            const library = new PlexLibrary(mockConfig);
            const handler = jest.fn();
            library.on('authExpired', handler);

            await expect(library.getLibraries()).rejects.toThrow(PlexLibraryError);
            expect(handler).toHaveBeenCalled();
        });

        it('should throw AUTH_EXPIRED error code on 401', async () => {
            mockFetchJson({ error: 'Unauthorized' }, 401);
            const library = new PlexLibrary(mockConfig);

            try {
                await library.getLibraries();
                fail('Expected error to be thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(PlexLibraryError);
                expect((error as PlexLibraryError).code).toBe(AppErrorCode.AUTH_EXPIRED);
            }
        });

        it('should throw SERVER_ERROR on 500', async () => {
            // Mock all retries to fail with 500
            const fetchMock = jest.fn().mockResolvedValue({
                ok: false,
                status: 500,
                headers: { get: () => null },
                json: async () => ({ error: 'Server error' }),
            });
            (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;

            const library = new PlexLibrary(mockConfig);

            await expect(library.getLibraries()).rejects.toThrow();
        });

        it('should throw when no server URI available', async () => {
            const noServerConfig: PlexLibraryConfig = {
                ...mockConfig,
                getServerUri: () => null,
            };
            const library = new PlexLibrary(noServerConfig);

            await expect(library.getLibraries()).rejects.toThrow(PlexLibraryError);
        });
    });

    describe('refreshLibrary', () => {
        it('should invalidate cache and re-fetch', async () => {
            mockFetchJson(mockLibrarySectionsResponse);
            const library = new PlexLibrary(mockConfig);

            // First fetch - populates cache
            await library.getLibraries();
            expect(fetch).toHaveBeenCalledTimes(1);

            // Get from cache - no fetch
            await library.getLibrary('1');
            expect(fetch).toHaveBeenCalledTimes(1);

            // Refresh - should fetch again
            await library.refreshLibrary('1');
            expect(fetch).toHaveBeenCalledTimes(2);
        });

        it('should emit libraryRefreshed event', async () => {
            mockFetchJson(mockLibrarySectionsResponse);
            const library = new PlexLibrary(mockConfig);
            const handler = jest.fn();
            library.on('libraryRefreshed', handler);

            await library.refreshLibrary('1');

            expect(handler).toHaveBeenCalledWith({ libraryId: '1' });
        });
    });
});
