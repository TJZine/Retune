/**
 * @fileoverview Unit tests for ResponseParser.
 * @module modules/plex/library/__tests__/ResponseParser.test
 */

import {
    parseLibrarySections,
    parseMediaItem,
    parseSeasons,
    parseCollections,
    parsePlaylists,
    parseDirectoryTags,
    mapLibraryType,
    mapMediaType,
} from '../ResponseParser';
import type {
    RawLibrarySection,
    RawMediaItem,
    RawSeason,
    RawCollection,
    RawPlaylist,
    RawDirectoryTag,
} from '../types';

describe('ResponseParser', () => {
    describe('parseLibrarySections', () => {
        it('should parse library sections correctly', () => {
            const raw: RawLibrarySection[] = [
                {
                    key: '1',
                    uuid: 'lib-uuid-1',
                    title: 'Movies',
                    type: 'movie',
                    agent: 'com.plexapp.agents.imdb',
                    scanner: 'Plex Movie Scanner',
                    art: '/art/path',
                    thumb: '/thumb/path',
                    scannedAt: 1704067200,
                },
            ];

            const result = parseLibrarySections(raw);

            expect(result).toHaveLength(1);
            expect(result[0]!.id).toBe('1');
            expect(result[0]!.uuid).toBe('lib-uuid-1');
            expect(result[0]!.title).toBe('Movies');
            expect(result[0]!.type).toBe('movie');
            expect(result[0]!.agent).toBe('com.plexapp.agents.imdb');
            expect(result[0]!.scanner).toBe('Plex Movie Scanner');
            expect(result[0]!.art).toBe('/art/path');
            expect(result[0]!.thumb).toBe('/thumb/path');
        });

        it('should handle null/undefined input', () => {
            expect(parseLibrarySections(null as unknown as RawLibrarySection[])).toEqual([]);
            expect(parseLibrarySections(undefined as unknown as RawLibrarySection[])).toEqual([]);
        });

        it('should handle missing optional fields', () => {
            const raw: RawLibrarySection[] = [
                {
                    key: '1',
                    uuid: 'lib-uuid',
                    title: 'Test',
                    type: 'movie',
                    agent: 'agent',
                    scanner: 'scanner',
                },
            ];

            const result = parseLibrarySections(raw);

            expect(result[0]!.art).toBeNull();
            expect(result[0]!.thumb).toBeNull();
        });
    });

    describe('parseMediaItem', () => {
        it('should parse all media item fields', () => {
            const raw: RawMediaItem = {
                ratingKey: '12345',
                key: '/library/metadata/12345',
                type: 'movie',
                title: 'Test Movie',
                originalTitle: 'Original Title',
                titleSort: 'Test Movie Sort',
                summary: 'A summary',
                year: 2023,
                duration: 7200000,
                addedAt: 1704067200,
                updatedAt: 1704153600,
                thumb: '/thumb',
                art: '/art',
                banner: '/banner',
                rating: 8.5,
                audienceRating: 9.0,
                contentRating: 'PG-13',
                viewOffset: 1000,
                viewCount: 2,
                lastViewedAt: 1704240000,
            };

            const result = parseMediaItem(raw);

            expect(result.ratingKey).toBe('12345');
            expect(result.key).toBe('/library/metadata/12345');
            expect(result.type).toBe('movie');
            expect(result.title).toBe('Test Movie');
            expect(result.originalTitle).toBe('Original Title');
            expect(result.sortTitle).toBe('Test Movie Sort');
            expect(result.summary).toBe('A summary');
            expect(result.year).toBe(2023);
            expect(result.durationMs).toBe(7200000);
            expect(result.thumb).toBe('/thumb');
            expect(result.art).toBe('/art');
            expect(result.banner).toBe('/banner');
            expect(result.rating).toBe(8.5);
            expect(result.audienceRating).toBe(9.0);
            expect(result.contentRating).toBe('PG-13');
            expect(result.viewOffset).toBe(1000);
            expect(result.viewCount).toBe(2);
        });

        it('should handle TV episode fields', () => {
            const raw: RawMediaItem = {
                ratingKey: 'e1',
                key: '/library/metadata/e1',
                type: 'episode',
                title: 'Episode Title',
                grandparentTitle: 'Show Name',
                parentTitle: 'Season 1',
                parentIndex: 1,
                index: 5,
                duration: 2700000,
            };

            const result = parseMediaItem(raw);

            expect(result.type).toBe('episode');
            expect(result.grandparentTitle).toBe('Show Name');
            expect(result.parentTitle).toBe('Season 1');
            expect(result.seasonNumber).toBe(1);
            expect(result.episodeNumber).toBe(5);
        });

        it('should default missing optional fields', () => {
            const raw: RawMediaItem = {
                ratingKey: '1',
                key: '/key',
                type: 'movie',
                title: 'Title',
            };

            const result = parseMediaItem(raw);

            expect(result.sortTitle).toBe('Title');
            expect(result.summary).toBe('');
            expect(result.year).toBe(0);
            expect(result.durationMs).toBe(0);
            expect(result.thumb).toBeNull();
            expect(result.art).toBeNull();
            expect(result.viewOffset).toBe(0);
            expect(result.viewCount).toBe(0);
            expect(result.media).toEqual([]);
        });
    });

    describe('parseSeasons', () => {
        it('should parse seasons correctly', () => {
            const raw: RawSeason[] = [
                {
                    ratingKey: 's1',
                    key: '/library/metadata/s1/children',
                    title: 'Season 1',
                    index: 1,
                    leafCount: 10,
                    viewedLeafCount: 5,
                    thumb: '/s1/thumb',
                },
            ];

            const result = parseSeasons(raw);

            expect(result).toHaveLength(1);
            expect(result[0]!.ratingKey).toBe('s1');
            expect(result[0]!.title).toBe('Season 1');
            expect(result[0]!.index).toBe(1);
            expect(result[0]!.leafCount).toBe(10);
            expect(result[0]!.viewedLeafCount).toBe(5);
            expect(result[0]!.thumb).toBe('/s1/thumb');
        });

        it('should handle missing optional fields', () => {
            const raw: RawSeason[] = [
                {
                    ratingKey: 's1',
                    key: '/key',
                    title: 'Season 1',
                    index: 1,
                    leafCount: 10,
                    viewedLeafCount: 0,
                },
            ];

            const result = parseSeasons(raw);

            expect(result[0]!.thumb).toBeNull();
        });
    });

    describe('parseCollections', () => {
        it('should parse collections correctly', () => {
            const raw: RawCollection[] = [
                {
                    ratingKey: 'c1',
                    key: '/library/collections/c1',
                    title: 'Marvel',
                    thumb: '/c1/thumb',
                    childCount: 25,
                },
            ];

            const result = parseCollections(raw);

            expect(result).toHaveLength(1);
            expect(result[0]!.ratingKey).toBe('c1');
            expect(result[0]!.title).toBe('Marvel');
            expect(result[0]!.childCount).toBe(25);
            expect(result[0]!.thumb).toBe('/c1/thumb');
        });
    });

    describe('parsePlaylists', () => {
        it('should parse playlists correctly', () => {
            const raw: RawPlaylist[] = [
                {
                    ratingKey: 'pl1',
                    key: '/playlists/pl1',
                    title: 'Favorites',
                    thumb: '/pl1/thumb',
                    duration: 36000000,
                    leafCount: 10,
                },
            ];

            const result = parsePlaylists(raw);

            expect(result).toHaveLength(1);
            expect(result[0]!.ratingKey).toBe('pl1');
            expect(result[0]!.title).toBe('Favorites');
            expect(result[0]!.duration).toBe(36000000);
            expect(result[0]!.leafCount).toBe(10);
        });
    });

    describe('parseDirectoryTags', () => {
        it('should parse directory tag entries correctly', () => {
            const raw: RawDirectoryTag[] = [
                { key: 'k1', title: 'Studio A', count: 42, fastKey: '/library/sections/1/studio?type=1&studio=Studio%20A', thumb: '/thumb/a' },
                { key: 'k2', title: 'Actor B' },
            ];

            const result = parseDirectoryTags(raw);

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                key: 'k1',
                title: 'Studio A',
                count: 42,
                fastKey: '/library/sections/1/studio?type=1&studio=Studio%20A',
                thumb: '/thumb/a',
            });
            expect(result[1]).toEqual({
                key: 'k2',
                title: 'Actor B',
                count: 0,
                fastKey: undefined,
                thumb: undefined,
            });
        });
    });

    describe('mapLibraryType', () => {
        it('should map known library types', () => {
            expect(mapLibraryType('movie')).toBe('movie');
            expect(mapLibraryType('show')).toBe('show');
            expect(mapLibraryType('artist')).toBe('artist');
            expect(mapLibraryType('photo')).toBe('photo');
        });

        it('should default unknown types to movie', () => {
            expect(mapLibraryType('unknown')).toBe('movie');
            expect(mapLibraryType('')).toBe('movie');
        });
    });

    describe('mapMediaType', () => {
        it('should map known media types', () => {
            expect(mapMediaType('movie')).toBe('movie');
            expect(mapMediaType('episode')).toBe('episode');
            expect(mapMediaType('track')).toBe('track');
            expect(mapMediaType('clip')).toBe('clip');
        });

        it('should default unknown types to movie', () => {
            expect(mapMediaType('unknown')).toBe('movie');
            expect(mapMediaType('')).toBe('movie');
        });
    });
});
