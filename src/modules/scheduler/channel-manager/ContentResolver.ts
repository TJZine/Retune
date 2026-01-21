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

const SHOW_CACHE_TTL_MS = 300000;
type PlexStreamMinimal = {
    streamType: number;
    selected?: boolean;
    default?: boolean;
    title?: string;
    language?: string;
    languageCode?: string;
};

/**
 * Resolves content from various Plex sources.
 */
export class ContentResolver {
    private readonly _library: IPlexLibraryMinimal;
    private readonly _logger: {
        warn: (message: string, ...args: unknown[]) => void;
    };
    private readonly _showCacheByLibraryId = new Map<
        string,
        { items: PlexMediaItemMinimal[]; cachedAt: number }
    >();

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
    async resolveSource(
        source: ChannelContentSource,
        options?: { signal?: AbortSignal | null }
    ): Promise<ResolvedContentItem[]> {
        let items: ResolvedContentItem[];

        switch (source.type) {
            case 'library':
                items = await this._resolveLibrarySource(source, options);
                break;
            case 'collection':
                items = await this._resolveCollectionSource(source, options);
                break;
            case 'show':
                items = await this._resolveShowSource(source, options);
                break;
            case 'playlist':
                items = await this._resolvePlaylistSource(source, options);
                break;
            case 'manual':
                items = await this._resolveManualSource(source, options);
                break;
            case 'mixed':
                items = await this._resolveMixedSource(source, options);
                break;
            default: {
                const type = (source as { type: string }).type;
                this._logger.warn(`Unknown source type: ${type}`);
                items = [];
            }
        }

        // Defensive expansion: Shows are containers, not playable items.
        // Expand any that slipped through (common in Collections containing shows).
        const expanded = await this._expandShowContainers(items, options);

        // Final defensive filter: if any shows remain, drop them and warn.
        const playable = expanded.filter((item) => item.type !== 'show');
        if (playable.length < expanded.length) {
            const skipped = expanded.length - playable.length;
            this._logger.warn(`Filtered out ${skipped} unexpanded show(s) from resolved content`);
        }

        // Normalize scheduledIndex to the final playable list.
        return playable.map((item, index) => ({ ...item, scheduledIndex: index }));
    }

    private async _expandShowContainers(
        items: ResolvedContentItem[],
        options?: { signal?: AbortSignal | null }
    ): Promise<ResolvedContentItem[]> {
        const expanded: ResolvedContentItem[] = [];

        for (const item of items) {
            if (item.type !== 'show') {
                expanded.push(item);
                continue;
            }

            try {
                const episodes = await this._library.getShowEpisodes(item.ratingKey, options);
                if (episodes.length === 0) {
                    this._logger.warn('Show item returned no episodes during expansion', item.ratingKey);
                    continue;
                }

                for (let i = 0; i < episodes.length; i++) {
                    const episode = episodes[i];
                    if (!episode) continue;

                    const merged: PlexMediaItemMinimal = { ...episode };

                    // Propagate show-level metadata to episodes for filtering (best-effort).
                    if (!merged.genres && item.genres) merged.genres = item.genres;
                    if (!merged.directors && item.directors) merged.directors = item.directors;
                    if (!merged.contentRating && item.contentRating) merged.contentRating = item.contentRating;
                    if ((!merged.rating || merged.rating === 0) && typeof item.rating === 'number') {
                        merged.rating = item.rating;
                    }
                    if ((merged.year === 0 || !merged.year) && item.year) {
                        merged.year = item.year;
                    }

                    expanded.push(this._toResolvedItem(merged, 0));
                }
            } catch (error) {
                this._logger.warn('Failed to expand show item', item.ratingKey, error);
            }
        }

        return expanded;
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
        source: LibraryContentSource,
        options?: { signal?: AbortSignal | null }
    ): Promise<ResolvedContentItem[]> {
        // Issue 5: Let errors propagate for cached fallback handling
        if (source.libraryType !== 'show') {
            const optionsWithFilter = source.libraryFilter
                ? { ...options, filter: source.libraryFilter }
                : options;
            const items = await this._library.getLibraryItems(source.libraryId, optionsWithFilter);
            return items.map((item, index) => this._toResolvedItem(item, index));
        }

        // --- TV Library "Fast Path" with Parent Decoration (Issue 2/3) ---

        // 1. Fetch episodes directly (Plex type=4)
        const episodeItems = await this._library.getLibraryItems(source.libraryId, {
            ...options,
            filter: { ...(source.libraryFilter ?? {}), type: PLEX_MEDIA_TYPES.EPISODE },
        });

        // 2. Fetch shows to get parent metadata (one request per library section)
        // This avoids N+1 queries during expansion and provides filtering context.
        const now = Date.now();
        const cached = this._showCacheByLibraryId.get(source.libraryId);
        let shows: PlexMediaItemMinimal[] | null = null;
        if (cached && now - cached.cachedAt < SHOW_CACHE_TTL_MS) {
            shows = cached.items;
        } else {
            try {
                shows = await this._library.getLibraryItems(source.libraryId, options);
                this._showCacheByLibraryId.set(source.libraryId, { items: shows, cachedAt: now });
            } catch (error) {
                if (isAbortLike(error, options?.signal ?? undefined)) {
                    throw error;
                }
                if (cached) {
                    this._logger.warn('Show list fetch failed, using cached show list', error);
                    shows = cached.items;
                    this._showCacheByLibraryId.set(source.libraryId, { items: cached.items, cachedAt: now });
                } else {
                    this._logger.warn('Show list fetch failed, continuing without decoration', error);
                    shows = null;
                }
            }
        }
        const parentMap = new Map<string, PlexMediaItemMinimal>();
        if (shows) {
            for (const show of shows) {
                // Index by ratingKey or key? Plex grandparents usually refer to show ratingKey.
                parentMap.set(show.ratingKey, show);
            }
        }

        const decorated: PlexMediaItemMinimal[] = [];
        for (const episode of episodeItems) {
            if (episode.durationMs <= 0) continue;

            // Plex usually provides grandparentRatingKey in episode metadata.
            // If not present, we can't decorate, but we still keep the episode.
            const parentKey = episode.grandparentRatingKey || episode.parentRatingKey;
            const parent = parentKey ? parentMap.get(parentKey) : null;

            if (parent) {
                const merged: PlexMediaItemMinimal = { ...episode };
                if (!merged.genres && parent.genres) merged.genres = parent.genres;
                if (!merged.directors && parent.directors) merged.directors = parent.directors;
                if (!merged.contentRating && parent.contentRating) merged.contentRating = parent.contentRating;
                if ((!merged.year || merged.year === 0) && parent.year) merged.year = parent.year;
                decorated.push(merged);
            } else {
                decorated.push(episode);
            }
        }

        return decorated.map((item, index) => this._toResolvedItem(item, index));
    }

    private async _resolveCollectionSource(
        source: CollectionContentSource,
        options?: { signal?: AbortSignal | null }
    ): Promise<ResolvedContentItem[]> {
        // Issue 5: Let errors propagate for cached fallback handling
        const items = await this._library.getCollectionItems(source.collectionKey, options);
        const expanded: PlexMediaItemMinimal[] = [];

        for (const item of items) {
            if (
                item.durationMs <= 0 &&
                item.episodeNumber === undefined &&
                item.seasonNumber === undefined
            ) {
                try {
                    const episodes = await this._library.getShowEpisodes(item.ratingKey, options);
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

    private async _resolveShowSource(
        source: ShowContentSource,
        options?: { signal?: AbortSignal | null }
    ): Promise<ResolvedContentItem[]> {
        // Issue 5: Let errors propagate for cached fallback handling
        const items = await this._library.getShowEpisodes(source.showKey, options);

        let filtered = items;
        const seasonFilter = source.seasonFilter;
        if (seasonFilter && seasonFilter.length) {
            filtered = items.filter(
                (ep) =>
                    typeof ep.seasonNumber === 'number' &&
                    seasonFilter.indexOf(ep.seasonNumber) !== -1
            );
        }

        return filtered.map((item, index) => this._toResolvedItem(item, index));
    }

    private async _resolvePlaylistSource(
        source: PlaylistContentSource,
        options?: { signal?: AbortSignal | null }
    ): Promise<ResolvedContentItem[]> {
        // Issue 5: Let errors propagate for cached fallback handling
        const items = await this._library.getPlaylistItems(source.playlistKey, options);
        return items.map((item, index) => this._toResolvedItem(item, index));
    }

    // Issue 7: Use cached metadata from manual source instead of fetching from Plex
    private _resolveManualSource(
        source: ManualContentSource,
        _options?: { signal?: AbortSignal | null }
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
        source: MixedContentSource,
        options?: { signal?: AbortSignal | null }
    ): Promise<ResolvedContentItem[]> {
        const allResolved: ResolvedContentItem[][] = [];

        for (const subSource of source.sources) {
            const items = await this.resolveSource(subSource, options);
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
        if (item.summary && item.summary.trim().length > 0) {
            resolved.summary = item.summary;
        }
        const mediaInfo = this._buildMediaInfo(item);
        if (mediaInfo) {
            resolved.mediaInfo = mediaInfo;
        }
        if (typeof item.viewCount === 'number') {
            resolved.watched = item.viewCount > 0;
        }
        if (item.addedAt) {
            resolved.addedAt = item.addedAt.getTime();
        }

        return resolved;
    }

    private _buildMediaInfo(item: PlexMediaItemMinimal): ResolvedContentItem['mediaInfo'] | undefined {
        const media = item.media?.[0];
        if (!media) return undefined;

        const mediaInfo: ResolvedContentItem['mediaInfo'] = {};
        const resolution = this._normalizeResolution(media.videoResolution);
        if (resolution) mediaInfo.resolution = resolution;
        if (media.audioCodec) mediaInfo.audioCodec = media.audioCodec;
        if (typeof media.audioChannels === 'number') mediaInfo.audioChannels = media.audioChannels;

        const streams = media.parts?.[0]?.streams ?? [];
        const videoStream = streams.find((stream) => stream.streamType === 1);
        const hdr = this._detectHdrFromStreamTitle(videoStream?.title);
        if (hdr) mediaInfo.hdr = hdr;

        const audioStream = this._selectAudioStream(streams);
        const audioTitle = audioStream?.title || audioStream?.language || audioStream?.languageCode;
        if (audioTitle) mediaInfo.audioTrackTitle = audioTitle;

        return Object.keys(mediaInfo).length > 0 ? mediaInfo : undefined;
    }

    private _normalizeResolution(resolution?: string): string | undefined {
        if (!resolution) return undefined;
        const normalized = resolution.trim().toLowerCase();
        if (normalized === '4k' || normalized === 'uhd' || normalized === '2160' || normalized === '2160p') {
            return '4K';
        }
        if (normalized === '1080' || normalized === '1080p') {
            return '1080p';
        }
        if (normalized === '720' || normalized === '720p') {
            return '720p';
        }
        return resolution;
    }

    private _detectHdrFromStreamTitle(title?: string): string | undefined {
        if (!title) return undefined;
        const normalized = title.toLowerCase();
        if (normalized.includes('dolby vision')) return 'Dolby Vision';
        if (normalized.includes('hdr10+')) return 'HDR10+';
        if (normalized.includes('hdr10')) return 'HDR10';
        return undefined;
    }

    private _selectAudioStream(
        streams: PlexStreamMinimal[]
    ): PlexStreamMinimal | undefined {
        const audioStreams = streams.filter((stream) => stream.streamType === 2);
        if (audioStreams.length === 0) return undefined;
        return (
            audioStreams.find((stream) => stream.selected) ??
            audioStreams.find((stream) => stream.default) ??
            audioStreams[0]
        );
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
                if (value === undefined) return false;
                break;
            case 'contentRating':
                value = item.contentRating;
                if (value === undefined) return false;
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
                if (value === undefined) return false;
                break;
            case 'addedAt':
                value = item.addedAt;
                if (value === undefined) return false;
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

function isAbortLike(error: unknown, signal?: AbortSignal): boolean {
    if (signal?.aborted) return true;
    if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') {
        return true;
    }
    if (error && typeof error === 'object' && 'name' in error) {
        const namedError = error as { name?: unknown };
        if (namedError.name === 'AbortError') {
            return true;
        }
    }
    return false;
}
