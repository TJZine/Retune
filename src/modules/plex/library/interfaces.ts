/**
 * @fileoverview Interface definitions for Plex Library module.
 * @module modules/plex/library/interfaces
 * @version 1.0.0
 */

import type {
    PlexLibrary,
    PlexMediaItem,
    PlexSeason,
    PlexCollection,
    PlexPlaylist,
    LibraryQueryOptions,
    SearchOptions,
} from './types';

// ============================================
// Main Interface
// ============================================

/**
 * Plex Library Interface.
 * Provides access to Plex media libraries and content.
 */
export interface IPlexLibrary {
    // Library Sections

    /**
     * Get all libraries.
     * @returns Promise resolving to list of libraries
     */
    getLibraries(): Promise<PlexLibrary[]>;

    /**
     * Get a specific library by ID.
     * @param libraryId - Library section ID
     * @returns Promise resolving to library or null if not found
     */
    getLibrary(libraryId: string): Promise<PlexLibrary | null>;

    // Content Browsing

    /**
     * Get items from a library with optional filtering.
     * Handles pagination transparently.
     * @param libraryId - Library section ID
     * @param options - Optional query options
     * @returns Promise resolving to list of media items
     */
    getLibraryItems(libraryId: string, options?: LibraryQueryOptions): Promise<PlexMediaItem[]>;

    /**
     * Get a specific media item by rating key.
     * @param ratingKey - Item's unique rating key
     * @returns Promise resolving to item or null if not found
     */
    getItem(ratingKey: string): Promise<PlexMediaItem | null>;

    // TV Show Hierarchy

    /**
     * Get TV shows within a library.
     * @param libraryId - Library section ID (must be a show library)
     * @returns Promise resolving to list of shows
     */
    getShows(libraryId: string): Promise<PlexMediaItem[]>;

    /**
     * Get seasons for a show.
     * @param showKey - Show's rating key
     * @returns Promise resolving to list of seasons
     */
    getShowSeasons(showKey: string): Promise<PlexSeason[]>;

    /**
     * Get episodes for a season.
     * @param seasonKey - Season's rating key
     * @returns Promise resolving to list of episodes
     */
    getSeasonEpisodes(seasonKey: string): Promise<PlexMediaItem[]>;

    /**
     * Get all episodes for a show (flattened across all seasons).
     * @param showKey - Show's rating key
     * @returns Promise resolving to all episodes sorted by season/episode
     */
    getShowEpisodes(showKey: string): Promise<PlexMediaItem[]>;

    // Search

    /**
     * Search for content across libraries.
     * @param query - Search query string
     * @param options - Optional search options
     * @returns Promise resolving to matching items
     */
    search(query: string, options?: SearchOptions): Promise<PlexMediaItem[]>;

    // Collections/Playlists

    /**
     * Get collections in a library.
     * @param libraryId - Library section ID
     * @returns Promise resolving to list of collections
     */
    getCollections(libraryId: string): Promise<PlexCollection[]>;

    /**
     * Get items in a collection.
     * @param collectionKey - Collection's rating key
     * @returns Promise resolving to list of items
     */
    getCollectionItems(collectionKey: string): Promise<PlexMediaItem[]>;

    /**
     * Get user playlists.
     * @returns Promise resolving to list of playlists
     */
    getPlaylists(): Promise<PlexPlaylist[]>;

    /**
     * Get items in a playlist.
     * @param playlistKey - Playlist's rating key
     * @returns Promise resolving to list of items
     */
    getPlaylistItems(playlistKey: string): Promise<PlexMediaItem[]>;

    // Image URLs

    /**
     * Generate authenticated URL for Plex images.
     * @param imagePath - Image path from Plex metadata
     * @param width - Optional resize width
     * @param height - Optional resize height (defaults to width)
     * @returns Full URL with authentication token
     */
    getImageUrl(imagePath: string, width?: number, height?: number): string;

    // Refresh

    /**
     * Refresh cached library data.
     * Invalidates cache and emits libraryRefreshed event.
     * @param libraryId - Library section ID to refresh
     */
    refreshLibrary(libraryId: string): Promise<void>;
}

/**
 * Configuration for PlexLibrary constructor.
 */
export interface PlexLibraryConfig {
    /**
     * Function to get auth headers for Plex API requests.
     * Should return headers including X-Plex-Token when authenticated.
     */
    getAuthHeaders: () => Record<string, string>;

    /**
     * Function to get the current server URI.
     * Should return the active Plex server connection URI.
     */
    getServerUri: () => string | null;

    /**
     * Function to get the current auth token.
     * Used for appending to image URLs.
     */
    getAuthToken: () => string | null;

    /**
     * Optional callback to trigger server re-discovery.
     * Called when SERVER_UNREACHABLE is encountered.
     */
    onServerUnreachable?: () => void;

    /**
     * Optional logger for warnings and errors.
     * Defaults to console.warn if not provided.
     */
    logger?: {
        warn: (message: string, ...args: unknown[]) => void;
        error: (message: string, ...args: unknown[]) => void;
    };
}
