/**
 * @fileoverview Constants for Plex Library module.
 * @module modules/plex/library/constants
 * @version 1.0.0
 */

/**
 * Plex Library module constants.
 */
export const PLEX_LIBRARY_CONSTANTS = {
    /** Default page size for pagination */
    DEFAULT_PAGE_SIZE: 100,

    /** Cache TTL in milliseconds (5 minutes) */
    CACHE_TTL_MS: 300000,

    /** Request timeout in milliseconds */
    REQUEST_TIMEOUT_MS: 10000,

    /** Maximum retry attempts for network timeouts */
    MAX_TIMEOUT_RETRIES: 3,

    /** Retry delays for network timeouts in milliseconds (exponential backoff) */
    TIMEOUT_RETRY_DELAYS: [1000, 2000, 4000] as readonly number[],

    /** Single retry delay for 500+ server errors (spec: retry once after 2s) */
    SERVER_ERROR_RETRY_DELAY: 2000,

    /** Default rate limit delay when Retry-After header is missing (seconds) */
    DEFAULT_RATE_LIMIT_DELAY: 5,
} as const;

/**
 * Plex API endpoints.
 */
export const PLEX_ENDPOINTS = {
    /** Library sections list */
    LIBRARY_SECTIONS: '/library/sections',

    /** Library section all items (append /{id}/all) */
    LIBRARY_SECTION_ALL: (id: string) => `/library/sections/${id}/all`,

    /** Library section collections (append /{id}/collections) */
    LIBRARY_SECTION_COLLECTIONS: (id: string) => `/library/sections/${id}/collections`,

    /** Item metadata (append /{key}) */
    LIBRARY_METADATA: (key: string) => `/library/metadata/${key}`,

    /** Item children (append /{key}/children) */
    LIBRARY_METADATA_CHILDREN: (key: string) => `/library/metadata/${key}/children`,

    /** Collection children */
    COLLECTION_CHILDREN: (key: string) => `/library/collections/${key}/children`,

    /** Playlists list */
    PLAYLISTS: '/playlists',

    /** Playlist items (append /{key}/items) */
    PLAYLIST_ITEMS: (key: string) => `/playlists/${key}/items`,

    /** Search hub */
    SEARCH: '/hubs/search',

    /** Photo transcoder */
    PHOTO_TRANSCODE: '/photo/:/transcode',
} as const;

/**
 * Plex media type codes.
 */
export const PLEX_MEDIA_TYPES = {
    /** Movie type code */
    MOVIE: 1,
    /** Show type code */
    SHOW: 2,
    /** Season type code */
    SEASON: 3,
    /** Episode type code */
    EPISODE: 4,
    /** Artist type code */
    ARTIST: 8,
    /** Album type code */
    ALBUM: 9,
    /** Track type code */
    TRACK: 10,
} as const;
