/**
 * @fileoverview Plex Library implementation.
 * Handles library browsing, content retrieval, and image URL generation.
 * @module modules/plex/library/PlexLibrary
 * @version 1.0.0
 */

import { EventEmitter } from '../../../utils/EventEmitter';
import type { IDisposable } from '../../../utils/interfaces';
import type { IPlexLibrary, PlexLibraryConfig } from './interfaces';
import type {
    PlexLibrary as PlexLibraryType,
    PlexMediaItem,
    PlexSeason,
    PlexCollection,
    PlexPlaylist,
    LibraryQueryOptions,
    SearchOptions,
    PlexLibraryState,
    PlexLibraryEvents,
    PlexMediaContainer,
    RawLibrarySection,
    RawMediaItem,
    RawSeason,
    RawCollection,
    RawPlaylist,
} from './types';
import { PlexLibraryErrorCode } from './types';
import {
    parseLibrarySections,
    parseMediaItems,
    parseMediaItem,
    parseSeasons,
    parseCollections,
    parsePlaylists,
} from './ResponseParser';
import { PLEX_LIBRARY_CONSTANTS, PLEX_ENDPOINTS, PLEX_MEDIA_TYPES } from './constants';

// ============================================
// Error Class
// ============================================

/**
 * Plex Library error with typed error code.
 */
export class PlexLibraryError extends Error {
    constructor(
        public readonly code: PlexLibraryErrorCode,
        message: string,
        public readonly httpStatus?: number
    ) {
        super(message);
        this.name = 'PlexLibraryError';
    }
}

// Re-export for consumers
export { PlexLibraryErrorCode };

// ============================================
// Main Class
// ============================================

/**
 * Plex Library implementation.
 * Provides access to Plex media libraries and content.
 * @implements {IPlexLibrary}
 */
export class PlexLibrary implements IPlexLibrary {
    private readonly _config: PlexLibraryConfig;
    private readonly _emitter: EventEmitter<PlexLibraryEvents>;
    private readonly _state: PlexLibraryState;

    /**
     * Create a new PlexLibrary instance.
     * @param config - Configuration with auth and server URI getters
     */
    constructor(config: PlexLibraryConfig) {
        this._config = config;
        this._emitter = new EventEmitter<PlexLibraryEvents>();
        this._state = {
            libraryCache: new Map(),
            isRefreshing: false,
        };
    }

    // ============================================
    // Library Sections
    // ============================================

    /**
     * Get all libraries.
     * @returns Promise resolving to list of libraries
     */
    async getLibraries(options?: { signal?: AbortSignal | null }): Promise<PlexLibraryType[]> {
        const url = this._buildUrl(PLEX_ENDPOINTS.LIBRARY_SECTIONS);
        const response = await this._fetchWithRetry<PlexMediaContainer<RawLibrarySection>>(url, { signal: options?.signal ?? null });

        if (!response) {
            return [];
        }

        const directories = response.MediaContainer.Directory || [];
        const libraries = parseLibrarySections(directories);

        // Cache all libraries
        const now = Date.now();
        for (const lib of libraries) {
            this._state.libraryCache.set(lib.id, { library: lib, cachedAt: now });
        }

        return libraries;
    }

    /**
     * Get a specific library by ID.
     * @param libraryId - Library section ID
     * @returns Promise resolving to library or null if not found
     */
    async getLibrary(libraryId: string): Promise<PlexLibraryType | null> {
        // Check cache first
        const cached = this._state.libraryCache.get(libraryId);
        if (cached && Date.now() - cached.cachedAt < PLEX_LIBRARY_CONSTANTS.CACHE_TTL_MS) {
            return cached.library;
        }

        // Fetch all libraries (they come as a batch)
        const libraries = await this.getLibraries();
        return libraries.find((lib) => lib.id === libraryId) ?? null;
    }

    // ============================================
    // Content Browsing
    // ============================================

    /**
     * Get items from a library with optional filtering.
     * Handles pagination transparently.
     * @param libraryId - Library section ID
     * @param options - Optional query options
     * @returns Promise resolving to list of media items
     */
    async getLibraryItems(
        libraryId: string,
        options: LibraryQueryOptions = {}
    ): Promise<PlexMediaItem[]> {
        const items: PlexMediaItem[] = [];
        let offset = options.offset ?? 0;
        const pageSize = options.limit ?? PLEX_LIBRARY_CONSTANTS.DEFAULT_PAGE_SIZE;
        let hasMore = true;

        while (hasMore) {
            const params: Record<string, string | number> = {
                'X-Plex-Container-Start': offset,
                'X-Plex-Container-Size': pageSize,
            };

            if (options.sort) {
                params['sort'] = options.sort;
            }

            if (options.filter) {
                Object.assign(params, options.filter);
            }

            if (options.includeCollections) {
                params['includeCollections'] = 1;
            }

            const url = this._buildUrl(PLEX_ENDPOINTS.LIBRARY_SECTION_ALL(libraryId), params);
            const response = await this._fetchWithRetry<PlexMediaContainer<RawMediaItem>>(url, { signal: options.signal ?? null });

            if (!response) {
                break; // Empty/error response, stop pagination
            }

            const metadata = response.MediaContainer.Metadata || [];
            const pageItems = parseMediaItems(metadata);

            items.push(...pageItems);
            offset += pageItems.length;

            // Stop if we got fewer items than requested (last page)
            // or if we've reached the user-specified limit
            hasMore =
                pageItems.length === pageSize &&
                (!options.limit || items.length < options.limit);
        }

        // Trim to exact limit if specified
        if (options.limit && items.length > options.limit) {
            return items.slice(0, options.limit);
        }

        return items;
    }

    /**
     * Get total item count for a library without fetching items.
     * Uses X-Plex-Container-Size=0 to avoid payload costs.
     */
    async getLibraryItemCount(
        libraryId: string,
        options: LibraryQueryOptions = {}
    ): Promise<number> {
        const params: Record<string, string | number> = {
            'X-Plex-Container-Start': 0,
            'X-Plex-Container-Size': 0,
        };

        if (options.sort) {
            params['sort'] = options.sort;
        }

        if (options.filter) {
            Object.assign(params, options.filter);
        }

        if (options.includeCollections) {
            params['includeCollections'] = 1;
        }

        const url = this._buildUrl(PLEX_ENDPOINTS.LIBRARY_SECTION_ALL(libraryId), params);
        const response = await this._fetchWithRetry<PlexMediaContainer<RawMediaItem>>(url, { signal: options.signal ?? null });
        if (!response) {
            return 0;
        }
        const total = response.MediaContainer.totalSize ?? response.MediaContainer.size;
        return typeof total === 'number' && Number.isFinite(total) ? total : 0;
    }

    /**
     * Get a specific media item by rating key.
     * @param ratingKey - Item's unique rating key
     * @returns Promise resolving to item or null if not found
     */
    async getItem(ratingKey: string, options?: { signal?: AbortSignal | null }): Promise<PlexMediaItem | null> {
        const url = this._buildUrl(PLEX_ENDPOINTS.LIBRARY_METADATA(ratingKey));
        const response = await this._fetchWithRetry<PlexMediaContainer<RawMediaItem>>(url, { signal: options?.signal ?? null });

        if (!response) {
            return null;
        }

        const metadata = response.MediaContainer.Metadata || [];
        if (metadata.length === 0) {
            return null;
        }

        return parseMediaItem(metadata[0]!);
    }

    // ============================================
    // TV Show Hierarchy
    // ============================================

    /**
     * Get TV shows within a library.
     * @param libraryId - Library section ID (must be a show library)
     * @returns Promise resolving to list of shows
     */
    async getShows(libraryId: string, options?: { signal?: AbortSignal | null }): Promise<PlexMediaItem[]> {
        const params = {
            type: PLEX_MEDIA_TYPES.SHOW,
        };
        const url = this._buildUrl(PLEX_ENDPOINTS.LIBRARY_SECTION_ALL(libraryId), params);
        const response = await this._fetchWithRetry<PlexMediaContainer<RawMediaItem>>(url, { signal: options?.signal ?? null });

        if (!response) {
            return [];
        }

        const metadata = response.MediaContainer.Metadata || [];
        return parseMediaItems(metadata);
    }

    /**
     * Get seasons for a show.
     * @param showKey - Show's rating key
     * @returns Promise resolving to list of seasons
     */
    async getShowSeasons(showKey: string, options?: { signal?: AbortSignal | null }): Promise<PlexSeason[]> {
        const url = this._buildUrl(PLEX_ENDPOINTS.LIBRARY_METADATA_CHILDREN(showKey));
        const response = await this._fetchWithRetry<PlexMediaContainer<RawSeason>>(url, { signal: options?.signal ?? null });

        if (!response) {
            return [];
        }

        const metadata = response.MediaContainer.Metadata || [];
        return parseSeasons(metadata);
    }

    /**
     * Get episodes for a season.
     * @param seasonKey - Season's rating key
     * @returns Promise resolving to list of episodes
     */
    async getSeasonEpisodes(seasonKey: string, options?: { signal?: AbortSignal | null }): Promise<PlexMediaItem[]> {
        const url = this._buildUrl(PLEX_ENDPOINTS.LIBRARY_METADATA_CHILDREN(seasonKey));
        const response = await this._fetchWithRetry<PlexMediaContainer<RawMediaItem>>(url, { signal: options?.signal ?? null });

        if (!response) {
            return [];
        }

        const metadata = response.MediaContainer.Metadata || [];
        return parseMediaItems(metadata);
    }

    /**
     * Get all episodes for a show (flattened across all seasons).
     * @param showKey - Show's rating key
     * @returns Promise resolving to all episodes sorted by season/episode
     */
    async getShowEpisodes(showKey: string, options?: { signal?: AbortSignal | null }): Promise<PlexMediaItem[]> {
        // Get all seasons
        const seasons = await this.getShowSeasons(showKey, options);

        // Fetch episodes for each season in parallel
        const episodePromises = seasons.map((season) =>
            this.getSeasonEpisodes(season.ratingKey, options)
        );
        const episodeArrays = await Promise.all(episodePromises);

        // Flatten and sort by season/episode number
        const allEpisodes = episodeArrays.flat();
        return allEpisodes.sort((a, b) => {
            const aSeason = typeof a.seasonNumber === 'number' ? a.seasonNumber : 0;
            const bSeason = typeof b.seasonNumber === 'number' ? b.seasonNumber : 0;
            const seasonDiff = aSeason - bSeason;
            if (seasonDiff !== 0) return seasonDiff;

            const aEpisode = typeof a.episodeNumber === 'number' ? a.episodeNumber : 0;
            const bEpisode = typeof b.episodeNumber === 'number' ? b.episodeNumber : 0;
            return aEpisode - bEpisode;
        });
    }

    // ============================================
    // Search
    // ============================================

    /**
     * Search for content across libraries.
     * @param query - Search query string
     * @param options - Optional search options
     * @returns Promise resolving to matching items
     */
    async search(query: string, options: SearchOptions = {}): Promise<PlexMediaItem[]> {
        const params: Record<string, string | number> = {
            query,
        };

        if (options.libraryId) {
            params['sectionId'] = options.libraryId;
        }

        if (options.limit) {
            params['limit'] = options.limit;
        }

        const url = this._buildUrl(PLEX_ENDPOINTS.SEARCH, params);
        const response = await this._fetchWithRetry<PlexMediaContainer<RawMediaItem>>(url);

        if (!response) {
            return [];
        }

        // Search results come in "Hubs" - extract items from all hubs
        const hubs = response.MediaContainer.Hub || [];
        const items: PlexMediaItem[] = [];

        for (const hub of hubs) {
            // Filter by types if specified
            if (options.types && options.types.length > 0) {
                const hubType = this._mapHubTypeToMediaType(hub.type);
                if (hubType && !options.types.includes(hubType)) {
                    continue;
                }
            }

            const metadata = (hub as unknown as { Metadata?: RawMediaItem[] }).Metadata || [];
            items.push(...parseMediaItems(metadata));
        }

        return items;
    }

    // ============================================
    // Collections/Playlists
    // ============================================

    /**
     * Get collections in a library.
     * Uses type=18 filter on the 'all' endpoint for standard Plex behavior.
     * @param libraryId - Library section ID
     * @returns Promise resolving to list of collections
     */
    async getCollections(libraryId: string, options?: { signal?: AbortSignal | null }): Promise<PlexCollection[]> {
        // Use type=18 (COLLECTION) filter on the library 'all' endpoint
        const params = {
            type: PLEX_MEDIA_TYPES.COLLECTION,
            includeGuids: 1, // Standard metadata
            includeMeta: 1,  // Standard metadata
        };
        const url = this._buildUrl(PLEX_ENDPOINTS.LIBRARY_SECTION_ALL(libraryId), params);
        const response = await this._fetchWithRetry<PlexMediaContainer<RawCollection>>(url, { signal: options?.signal ?? null });

        if (!response) {
            return [];
        }

        const metadata = response.MediaContainer.Metadata || [];
        return parseCollections(metadata);
    }

    /**
     * Get items in a collection.
     * @param collectionKey - Collection's rating key
     * @returns Promise resolving to list of items
     */
    async getCollectionItems(collectionKey: string, options?: { signal?: AbortSignal | null }): Promise<PlexMediaItem[]> {
        const params = {
            includeGuids: 1,
            includeMeta: 1,
        };
        const url = this._buildUrl(PLEX_ENDPOINTS.COLLECTION_CHILDREN(collectionKey), params);
        const response = await this._fetchWithRetry<PlexMediaContainer<RawMediaItem>>(url, { signal: options?.signal ?? null });

        if (!response) {
            return [];
        }

        const metadata = response.MediaContainer.Metadata || [];
        return parseMediaItems(metadata);
    }

    /**
     * Get user playlists.
     * @returns Promise resolving to list of playlists
     */
    async getPlaylists(options?: { signal?: AbortSignal | null }): Promise<PlexPlaylist[]> {
        const url = this._buildUrl(PLEX_ENDPOINTS.PLAYLISTS);
        const response = await this._fetchWithRetry<PlexMediaContainer<RawPlaylist>>(url, { signal: options?.signal ?? null });

        if (!response) {
            return [];
        }

        const metadata = response.MediaContainer.Metadata || [];
        return parsePlaylists(metadata);
    }

    /**
     * Get items in a playlist.
     * @param playlistKey - Playlist's rating key
     * @returns Promise resolving to list of items
     */
    async getPlaylistItems(playlistKey: string, options?: { signal?: AbortSignal | null }): Promise<PlexMediaItem[]> {
        const url = this._buildUrl(PLEX_ENDPOINTS.PLAYLIST_ITEMS(playlistKey));
        const response = await this._fetchWithRetry<PlexMediaContainer<RawMediaItem>>(url, { signal: options?.signal ?? null });

        if (!response) {
            return [];
        }

        const metadata = response.MediaContainer.Metadata || [];
        return parseMediaItems(metadata);
    }

    // ============================================
    // Image URLs
    // ============================================

    /**
     * Generate authenticated URL for Plex images.
     * @param imagePath - Image path from Plex metadata
     * @param width - Optional resize width
     * @param height - Optional resize height (defaults to width)
     * @returns Full URL with authentication token
     */
    getImageUrl(imagePath: string, width?: number, height?: number): string {
        if (!imagePath) return '';

        const serverUri = this._config.getServerUri();
        if (!serverUri) return '';

        const token = this._config.getAuthToken() || '';

        if (typeof width === 'number' && width > 0) {
            // Use photo transcoder for resizing
            const resizeHeight = typeof height === 'number' ? height : width;
            const url = new URL(PLEX_ENDPOINTS.PHOTO_TRANSCODE, serverUri);
            if (token) {
                url.searchParams.set('X-Plex-Token', token);
            }
            url.searchParams.set('width', String(width));
            url.searchParams.set('height', String(resizeHeight));
            url.searchParams.set('url', imagePath);
            return url.toString();
        }

        // Direct image URL
        const url = new URL(imagePath, serverUri);
        if (token) {
            url.searchParams.set('X-Plex-Token', token);
        }
        return url.toString();
    }

    // ============================================
    // Refresh
    // ============================================

    /**
     * Refresh cached library data.
     * Invalidates cache and emits libraryRefreshed event.
     * @param libraryId - Library section ID to refresh
     */
    async refreshLibrary(libraryId: string): Promise<void> {
        // Invalidate cache for this library
        this._state.libraryCache.delete(libraryId);

        // Re-fetch the library
        await this.getLibrary(libraryId);

        // Emit refresh event
        this._emitter.emit('libraryRefreshed', { libraryId });
    }

    // ============================================
    // Events
    // ============================================

    /**
     * Register an event handler.
     * @param event - Event name
     * @param handler - Handler function
     * @returns Disposable to remove handler
     */
    on<K extends keyof PlexLibraryEvents>(
        event: K,
        handler: (payload: PlexLibraryEvents[K]) => void
    ): IDisposable {
        return this._emitter.on(event, handler);
    }

    // ============================================
    // Private Methods
    // ============================================

    /**
     * Build a full URL with query parameters.
     * @param endpoint - API endpoint path
     * @param params - Optional query parameters
     * @returns Full URL string
     */
    private _buildUrl(endpoint: string, params: Record<string, string | number> = {}): string {
        const serverUri = this._config.getServerUri();
        if (!serverUri) {
            throw new PlexLibraryError(
                PlexLibraryErrorCode.SERVER_UNREACHABLE,
                'No server URI available'
            );
        }

        const url = new URL(endpoint, serverUri);

        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, String(value));
        }

        return url.toString();
    }

    /**
     * Fetch with retry and error handling per spec requirements.
     * 
     * Error handling:
     * - Network timeout: NETWORK_TIMEOUT, retry with exponential backoff (max 3)
     * - 401 Unauthorized: AUTH_EXPIRED, emit event, no retry
     * - 404 Not Found: return null, log warning
     * - 429 Rate Limited: backoff per Retry-After header
     * - 500+ Server Error: retry once after 2s delay
     * - Empty response: return null, log warning
     * - Parse error: return null, log error with response body
     * - Server unreachable: trigger re-discovery hook
     * 
     * @param url - URL to fetch
     * @param options - Optional fetch options
     * @returns Parsed JSON response or null for 404/empty/parse errors
     */
    private async _fetchWithRetry<T>(
        url: string,
        options: RequestInit = {}
    ): Promise<T | null> {
        const logger = this._config.logger ?? { warn: console.warn, error: console.error };
        let timeoutRetries = 0;
        let serverErrorRetried = false;
        let rateLimitRetries = 0;

        while (true) {
            let externalAborted = false;
            const externalSignal = options.signal ?? null;
            try {
                const controller = new AbortController();
                const onExternalAbort = (): void => {
                    externalAborted = true;
                    controller.abort();
                };
                if (externalSignal) {
                    if (externalSignal.aborted) {
                        throw new DOMException('The operation was aborted', 'AbortError');
                    }
                    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
                }
                const timeoutId = setTimeout(
                    () => controller.abort(),
                    PLEX_LIBRARY_CONSTANTS.REQUEST_TIMEOUT_MS
                );

                let response: Response;
                try {
                    // Plex has started warning that `X-Plex-Container-Size` must be provided as a header.
                    // Retune historically provides paging via query params; mirror those values as headers
                    // to avoid future 400s while keeping existing URL construction unchanged.
                    const pagingHeaders: Record<string, string> = {};
                    try {
                        const u = new URL(url);
                        const start = u.searchParams.get('X-Plex-Container-Start');
                        const size = u.searchParams.get('X-Plex-Container-Size');
                        if (start) pagingHeaders['X-Plex-Container-Start'] = start;
                        if (size) pagingHeaders['X-Plex-Container-Size'] = size;
                    } catch {
                        // Ignore invalid URLs; fetch will surface a more actionable error.
                    }

                    response = await fetch(url, {
                        ...options,
                        headers: {
                            Accept: 'application/json',
                            ...this._config.getAuthHeaders(),
                            ...pagingHeaders,
                            ...options.headers,
                        },
                        signal: controller.signal,
                    });
                } finally {
                    clearTimeout(timeoutId);
                    if (externalSignal) {
                        externalSignal.removeEventListener('abort', onExternalAbort);
                    }
                }

                // Handle 401 Unauthorized - emit event, no retry
                if (response.status === 401) {
                    this._emitter.emit('authExpired', undefined);
                    throw new PlexLibraryError(
                        PlexLibraryErrorCode.AUTH_EXPIRED,
                        'Authentication expired',
                        401
                    );
                }

                // Handle 429 Rate Limited - backoff per Retry-After
                if (response.status === 429) {
                    if (rateLimitRetries >= PLEX_LIBRARY_CONSTANTS.MAX_TIMEOUT_RETRIES) {
                        throw new PlexLibraryError(
                            PlexLibraryErrorCode.RATE_LIMITED,
                            'Rate limited after max retries',
                            429
                        );
                    }
                    rateLimitRetries++;

                    const retryAfterHeader = response.headers.get('Retry-After');
                    let retryAfter: number = PLEX_LIBRARY_CONSTANTS.DEFAULT_RATE_LIMIT_DELAY;
                    if (retryAfterHeader) {
                        const parsed = parseInt(retryAfterHeader, 10);
                        if (!isNaN(parsed)) {
                            retryAfter = Math.max(0, parsed);
                        } else {
                            // Try parsing as HTTP-date
                            const date = Date.parse(retryAfterHeader);
                            if (!isNaN(date)) {
                                retryAfter = Math.max(0, Math.ceil((date - Date.now()) / 1000));
                            }
                        }
                    }
                    await this._delay(retryAfter * 1000);
                    continue;
                }

                // Handle 404 Not Found - return null, log warning
                if (response.status === 404) {
                    logger.warn(`[PlexLibrary] 404 Not Found: ${url}`);
                    return null;
                }

                // Handle 500+ Server Error - retry once after 2s delay
                if (response.status >= 500) {
                    if (!serverErrorRetried) {
                        serverErrorRetried = true;
                        logger.warn(`[PlexLibrary] Server error ${response.status}, retrying after 2s...`);
                        await this._delay(PLEX_LIBRARY_CONSTANTS.SERVER_ERROR_RETRY_DELAY);
                        continue;
                    }
                    throw new PlexLibraryError(
                        PlexLibraryErrorCode.SERVER_ERROR,
                        `HTTP ${response.status}`,
                        response.status
                    );
                }

                // Handle other non-OK responses
                if (!response.ok) {
                    throw new PlexLibraryError(
                        PlexLibraryErrorCode.SERVER_ERROR,
                        `HTTP ${response.status}`,
                        response.status
                    );
                }

                // Parse response with error handling
                let data: T;
                let text = '';
                try {
                    text = await response.text();

                    // Handle empty response
                    if (!text || text.trim() === '') {
                        logger.warn(`[PlexLibrary] Empty response from: ${url}`);
                        return null;
                    }

                    data = JSON.parse(text) as T;
                } catch (parseError) {
                    // Include response body in parse error log per spec
                    logger.error(`[PlexLibrary] Parse error for ${url}:`, parseError, `Response body: ${text.substring(0, 500)}`);
                    return null;
                }

                // Empty MediaContainer is valid - no special handling needed

                return data;

            } catch (error) {
                if (externalAborted || options.signal?.aborted) {
                    throw error;
                }
                // Handle timeout/abort errors - retry with exponential backoff
                if (error instanceof Error && error.name === 'AbortError') {
                    if (timeoutRetries < PLEX_LIBRARY_CONSTANTS.MAX_TIMEOUT_RETRIES) {
                        const delay = PLEX_LIBRARY_CONSTANTS.TIMEOUT_RETRY_DELAYS[timeoutRetries] ?? 4000;
                        logger.warn(`[PlexLibrary] Network timeout, retry ${timeoutRetries + 1}/${PLEX_LIBRARY_CONSTANTS.MAX_TIMEOUT_RETRIES} after ${delay}ms`);
                        timeoutRetries++;
                        await this._delay(delay);
                        continue;
                    }
                    throw new PlexLibraryError(
                        PlexLibraryErrorCode.NETWORK_TIMEOUT,
                        'Network timeout after max retries'
                    );
                }

                // Don't retry auth errors
                if (error instanceof PlexLibraryError && error.code === PlexLibraryErrorCode.AUTH_EXPIRED) {
                    throw error;
                }

                // Server unreachable (TypeError = fetch network failure) - trigger re-discovery
                if (error instanceof TypeError) {
                    this._config.onServerUnreachable?.();
                    throw new PlexLibraryError(
                        PlexLibraryErrorCode.SERVER_UNREACHABLE,
                        error.message
                    );
                }

                // Re-throw PlexLibraryError as-is
                if (error instanceof PlexLibraryError) {
                    throw error;
                }

                // Unknown error - trigger re-discovery and throw
                this._config.onServerUnreachable?.();
                throw new PlexLibraryError(
                    PlexLibraryErrorCode.SERVER_UNREACHABLE,
                    error instanceof Error ? error.message : 'Unknown error'
                );
            }
        }
    }

    /**
     * Delay for a specified time.
     * @param ms - Milliseconds to delay
     */
    private _delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Map hub type to media type.
     * @param hubType - Hub type string from search results
     * @returns Corresponding media type or undefined
     */
    private _mapHubTypeToMediaType(hubType: string): PlexMediaItem['type'] | undefined {
        switch (hubType) {
            case 'movie':
                return 'movie';
            case 'episode':
            case 'show':
                return 'episode';
            case 'track':
            case 'artist':
            case 'album':
                return 'track';
            case 'clip':
                return 'clip';
            default:
                return undefined;
        }
    }
}
