/**
 * @fileoverview Content resolution logic for Channel Manager.
 * Handles fetching and transforming content from various Plex sources.
 * @module modules/scheduler/channel-manager/ContentResolver
 * @version 1.0.0
 */

import type { IPlexLibraryMinimal, PlexMediaItemMinimal } from './interfaces';
import type {
    ChannelContentSource,
    LibraryContentSource,
    CollectionContentSource,
    ShowContentSource,
    PlaylistContentSource,
    ManualContentSource,
    MixedContentSource,
    ResolvedContentItem,
    ContentFilter,
    SortOrder,
    PlaybackMode,
    PlexMediaType,
} from './types';
import { shuffleWithSeed } from '../../../utils/prng';
import { PLEX_MEDIA_TYPES } from '../../plex/library/constants';

// ============================================
// Content Resolver Class
// ============================================

/**
 * Resolves content from various Plex sources.
 */
export class ContentResolver {
    private readonly _library: IPlexLibraryMinimal;
    private readonly _logger: {
        warn: (message: string, ...args: unknown[]) => void;
    };

    /**
     * Create a ContentResolver instance.
     * @param library - PlexLibrary for content fetching
     * @param logger - Optional logger
     */
    constructor(
        library: IPlexLibraryMinimal,
        logger?: { warn: (message: string, ...args: unknown[]) => void }
    ) {
        this._library = library;
        this._logger = logger || { warn: console.warn.bind(console) };
    }

    /**
     * Resolve content from any source type.
     * @param source - Content source configuration
     * @returns Promise resolving to content items
     * @throws Error if resolution fails (for cached fallback handling by caller)
     */
    async resolveSource(source: ChannelContentSource): Promise<ResolvedContentItem[]> {
        switch (source.type) {
            case 'library':
                return this._resolveLibrarySource(source);
            case 'collection':
                return this._resolveCollectionSource(source);
            case 'show':
                return this._resolveShowSource(source);
            case 'playlist':
                return this._resolvePlaylistSource(source);
            case 'manual':
                return this._resolveManualSource(source);
            case 'mixed':
                return this._resolveMixedSource(source);
            default:
                this._logger.warn(`Unknown source type: ${(source as BaseContentSource).type}`);
                return [];
        }
    }

    /**
     * Apply filters to content items.
     * @param items - Items to filter
     * @param filters - Filters to apply (AND logic)
     * @returns Filtered items
     */
    applyFilters(items: ResolvedContentItem[], filters: ContentFilter[]): ResolvedContentItem[] {
        if (!filters.length) {
            return items;
        }

        return items.filter((item) => filters.every((filter) => this._matchesFilter(item, filter)));
    }

    /**
     * Apply sort order to content items.
     * @param items - Items to sort
     * @param order - Sort order
     * @returns Sorted items (new array)
     */
    applySort(items: ResolvedContentItem[], order: SortOrder): ResolvedContentItem[] {
        const result = [...items];

        switch (order) {
            case 'title_asc':
                result.sort((a, b) => a.title.localeCompare(b.title));
                break;
            case 'title_desc':
                result.sort((a, b) => b.title.localeCompare(a.title));
                break;
            case 'year_asc':
                result.sort((a, b) => a.year - b.year);
                break;
            case 'year_desc':
                result.sort((a, b) => b.year - a.year);
                break;
            case 'duration_asc':
                result.sort((a, b) => a.durationMs - b.durationMs);
                break;
            case 'duration_desc':
                result.sort((a, b) => b.durationMs - a.durationMs);
                break;
            case 'episode_order':
                result.sort((a, b) => {
                    const seasonA = a.seasonNumber || 0;
                    const seasonB = b.seasonNumber || 0;
                    if (seasonA !== seasonB) return seasonA - seasonB;
                    const epA = a.episodeNumber || 0;
                    const epB = b.episodeNumber || 0;
                    return epA - epB;
                });
                break;
            // Issue 9: Implement added_asc/added_desc sorting
            case 'added_asc':
                result.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
                break;
            case 'added_desc':
                result.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
                break;
            default:
                break;
        }

        return result;
    }

    /**
     * Apply playback mode to order items.
     * @param items - Items to order
     * @param mode - Playback mode
     * @param seed - Shuffle seed (used for 'shuffle' mode)
     * @returns Ordered items
     */
    applyPlaybackMode(
        items: ResolvedContentItem[],
        mode: PlaybackMode,
        seed: number
    ): ResolvedContentItem[] {
        switch (mode) {
            case 'sequential':
                return items.map((item, index) => ({
                    ...item,
                    scheduledIndex: index,
                }));
            case 'shuffle':
                return shuffleWithSeed(items, seed).map((item, index) => ({
                    ...item,
                    scheduledIndex: index,
                }));
            case 'random':
                // Random mode uses current time as seed for different order each time
                return shuffleWithSeed(items, Date.now()).map((item, index) => ({
                    ...item,
                    scheduledIndex: index,
                }));
            default:
                return items;
        }
    }

    // ============================================
    // Private Source Resolution Methods
    // ============================================

    private async _resolveLibrarySource(
        source: LibraryContentSource
    ): Promise<ResolvedContentItem[]> {
        // Issue 5: Let errors propagate for cached fallback handling
        if (source.libraryType !== 'show') {
            const items = await this._library.getLibraryItems(source.libraryId);
            return items.map((item, index) => this._toResolvedItem(item, index));
        }

        // Prefer a single call if Plex returns episodes directly for the section.
        const episodeItems = await this._library.getLibraryItems(source.libraryId, {
            filter: { type: PLEX_MEDIA_TYPES.EPISODE },
        });
        const playableEpisodes = episodeItems.filter((item) => item.durationMs > 0);
        if (playableEpisodes.length > 0) {
            return playableEpisodes.map((item, index) => this._toResolvedItem(item, index));
        }

        // Fallback: expand each show into episodes and propagate show metadata for filtering.
        const shows = await this._library.getLibraryItems(source.libraryId);
        const expanded: PlexMediaItemMinimal[] = [];
        for (const show of shows) {
            try {
                const episodes = await this._library.getShowEpisodes(show.ratingKey);
                for (const episode of episodes) {
                    const merged: PlexMediaItemMinimal = { ...episode };

                    // Propagate show-level metadata to episodes for filtering, without assigning undefined
                    if (!merged.genres && show.genres) merged.genres = show.genres;
                    if (!merged.directors && show.directors) merged.directors = show.directors;
                    if (!merged.contentRating && show.contentRating) merged.contentRating = show.contentRating;
                    if (merged.year === 0 && show.year) merged.year = show.year;

                    expanded.push(merged);
                }
            } catch (error) {
                this._logger.warn('Failed to expand show library item', show.ratingKey, error);
            }
        }

        return expanded.map((item, index) => this._toResolvedItem(item, index));
    }

    private async _resolveCollectionSource(
        source: CollectionContentSource
    ): Promise<ResolvedContentItem[]> {
        // Issue 5: Let errors propagate for cached fallback handling
        const items = await this._library.getCollectionItems(source.collectionKey);
        const expanded: PlexMediaItemMinimal[] = [];

        for (const item of items) {
            if (
                item.durationMs <= 0 &&
                item.episodeNumber === undefined &&
                item.seasonNumber === undefined
            ) {
                try {
                    const episodes = await this._library.getShowEpisodes(item.ratingKey);
                    if (episodes.length > 0) {
                        expanded.push(...episodes);
                        continue;
                    }
                } catch (error) {
                    this._logger.warn('Failed to expand show collection item', item.ratingKey, error);
                }
            }
            expanded.push(item);
        }

        return expanded.map((item, index) => this._toResolvedItem(item, index));
    }

    private async _resolveShowSource(source: ShowContentSource): Promise<ResolvedContentItem[]> {
        // Issue 5: Let errors propagate for cached fallback handling
        const episodes = await this._library.getShowEpisodes(source.showKey);

        let filtered = episodes;
        const seasonFilter = source.seasonFilter;
        if (seasonFilter && seasonFilter.length) {
            filtered = episodes.filter(
                (ep) =>
                    typeof ep.seasonNumber === 'number' &&
                    seasonFilter.indexOf(ep.seasonNumber) !== -1
            );
        }

        return filtered.map((item, index) => this._toResolvedItem(item, index));
    }

    private async _resolvePlaylistSource(
        source: PlaylistContentSource
    ): Promise<ResolvedContentItem[]> {
        // Issue 5: Let errors propagate for cached fallback handling
        const items = await this._library.getPlaylistItems(source.playlistKey);
        return items.map((item, index) => this._toResolvedItem(item, index));
    }

    // Issue 7: Use cached metadata from manual source instead of fetching from Plex
    private _resolveManualSource(
        source: ManualContentSource
    ): Promise<ResolvedContentItem[]> {
        const results: ResolvedContentItem[] = [];

        for (let i = 0; i < source.items.length; i++) {
            const manualItem = source.items[i];
            if (!manualItem) continue;
            if (
                typeof manualItem.ratingKey !== 'string' ||
                manualItem.ratingKey.length === 0 ||
                typeof manualItem.title !== 'string' ||
                manualItem.title.length === 0 ||
                typeof manualItem.durationMs !== 'number' ||
                !Number.isFinite(manualItem.durationMs) ||
                manualItem.durationMs <= 0
            ) {
                continue;
            }

            // Build resolved item from cached manual metadata
            results.push({
                ratingKey: manualItem.ratingKey,
                type: 'movie', // Default, could be extended in ManualContentItem
                title: manualItem.title,
                fullTitle: manualItem.title,
                durationMs: manualItem.durationMs,
                thumb: null,
                year: 0, // Not cached in manual items
                scheduledIndex: i,
            });
        }

        return Promise.resolve(results);
    }

    private async _resolveMixedSource(
        source: MixedContentSource
    ): Promise<ResolvedContentItem[]> {
        const allResolved: ResolvedContentItem[][] = [];

        for (const subSource of source.sources) {
            const items = await this.resolveSource(subSource);
            allResolved.push(items);
        }

        if (source.mixMode === 'sequential') {
            // Append sources in order
            const combined = allResolved.flat();
            return combined.map((item, index) => ({
                ...item,
                scheduledIndex: index,
            }));
        } else {
            // Interleave sources
            return this._interleave(allResolved);
        }
    }

    // ============================================
    // Private Helper Methods
    // ============================================

    private _toResolvedItem(item: PlexMediaItemMinimal, index: number): ResolvedContentItem {
        const fullTitle = this._buildFullTitle(item);

        const resolved: ResolvedContentItem = {
            ratingKey: item.ratingKey,
            type: item.type as PlexMediaType,
            title: item.title,
            fullTitle,
            durationMs: item.durationMs,
            thumb: item.thumb,
            year: item.year,
            scheduledIndex: index,
        };

        // Optional properties - only add if defined
        if (typeof item.seasonNumber === 'number') {
            resolved.seasonNumber = item.seasonNumber;
        }
        if (typeof item.episodeNumber === 'number') {
            resolved.episodeNumber = item.episodeNumber;
        }
        // Issue 8: Include filterable fields
        if (typeof item.rating === 'number') {
            resolved.rating = item.rating;
        }
        if (item.contentRating) {
            resolved.contentRating = item.contentRating;
        }
        if (item.genres && item.genres.length > 0) {
            resolved.genres = item.genres;
        }
        if (item.directors && item.directors.length > 0) {
            resolved.directors = item.directors;
        }
        if (typeof item.viewCount === 'number') {
            resolved.watched = item.viewCount > 0;
        }
        if (item.addedAt) {
            resolved.addedAt = item.addedAt.getTime();
        }

        return resolved;
    }

    private _buildFullTitle(item: PlexMediaItemMinimal): string {
        if (item.type === 'episode') {
            const showTitle = item.grandparentTitle || '';
            const seasonNum = item.seasonNumber;
            const epNum = item.episodeNumber;
            const seasonStr =
                typeof seasonNum === 'number' ? `S${String(seasonNum).padStart(2, '0')}` : '';
            const epStr = typeof epNum === 'number' ? `E${String(epNum).padStart(2, '0')}` : '';
            const episodeCode = seasonStr && epStr ? `${seasonStr}${epStr}` : '';

            if (showTitle && episodeCode) {
                return `${showTitle} - ${episodeCode} - ${item.title}`;
            } else if (showTitle) {
                return `${showTitle} - ${item.title}`;
            }
        }

        return item.title;
    }

    private _matchesFilter(item: ResolvedContentItem, filter: ContentFilter): boolean {
        // Issue 8: Get value from item including filterable fields
        let value: unknown;
        switch (filter.field) {
            case 'year':
                value = item.year;
                break;
            case 'duration':
                value = item.durationMs;
                break;
            case 'rating':
                value = item.rating;
                if (value === undefined) return true; // Skip if not available
                break;
            case 'contentRating':
                value = item.contentRating;
                if (value === undefined) return true;
                break;
            case 'genre': {
                // Genre is array - special handling for contains/notContains/eq/neq
                const genres = item.genres || [];
                if (filter.operator === 'contains') {
                    return genres.some((g) => g.toLowerCase().includes(String(filter.value).toLowerCase()));
                } else if (filter.operator === 'notContains') {
                    return !genres.some((g) => g.toLowerCase().includes(String(filter.value).toLowerCase()));
                } else if (filter.operator === 'eq') {
                    return genres.some((g) => g.toLowerCase() === String(filter.value).toLowerCase());
                } else if (filter.operator === 'neq') {
                    // Issue 3 (Round 2): neq means genre must NOT contain the value
                    return !genres.some((g) => g.toLowerCase() === String(filter.value).toLowerCase());
                }
                return true;
            }
            case 'director': {
                const directors = item.directors || [];
                if (filter.operator === 'contains') {
                    return directors.some((d) => d.toLowerCase().includes(String(filter.value).toLowerCase()));
                } else if (filter.operator === 'notContains') {
                    return !directors.some((d) => d.toLowerCase().includes(String(filter.value).toLowerCase()));
                } else if (filter.operator === 'eq') {
                    return directors.some((d) => d.toLowerCase() === String(filter.value).toLowerCase());
                } else if (filter.operator === 'neq') {
                    return !directors.some((d) => d.toLowerCase() === String(filter.value).toLowerCase());
                }
                return true;
            }
            case 'watched':
                value = item.watched;
                if (value === undefined) return true;
                break;
            case 'addedAt':
                value = item.addedAt;
                if (value === undefined) return true;
                break;
            default:
                return true;
        }

        switch (filter.operator) {
            case 'eq':
                return value === filter.value;
            case 'neq':
                return value !== filter.value;
            case 'gt':
            case 'gte':
            case 'lt':
            case 'lte': {
                // Validate both values are finite numbers before comparison
                const numVal = Number(value);
                const numFilter = Number(filter.value);
                if (!Number.isFinite(numVal) || !Number.isFinite(numFilter)) {
                    return true; // Skip filter when values aren't valid numbers
                }
                switch (filter.operator) {
                    case 'gt':
                        return numVal > numFilter;
                    case 'gte':
                        return numVal >= numFilter;
                    case 'lt':
                        return numVal < numFilter;
                    case 'lte':
                        return numVal <= numFilter;
                }
            }
            case 'contains':
                return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
            case 'notContains':
                return !String(value).toLowerCase().includes(String(filter.value).toLowerCase());
            default:
                return true;
        }
    }

    private _interleave(arrays: ResolvedContentItem[][]): ResolvedContentItem[] {
        const result: ResolvedContentItem[] = [];
        const maxLen = Math.max(...arrays.map((arr) => arr.length));

        for (let i = 0; i < maxLen; i++) {
            for (const arr of arrays) {
                const item = arr[i];
                if (item) {
                    result.push({
                        ...item,
                        scheduledIndex: result.length,
                    });
                }
            }
        }

        return result;
    }
}

// Re-export for type inference
interface BaseContentSource {
    type: string;
}
