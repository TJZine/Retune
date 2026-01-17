/**
 * @fileoverview Interface definitions for Channel Manager module.
 * @module modules/scheduler/channel-manager/interfaces
 * @version 1.0.0
 */

import type {
    ChannelConfig,
    ResolvedChannelContent,
    ImportResult,
    ChannelManagerEventMap,
} from './types';

// ============================================
// Main Interface
// ============================================

/**
 * Channel Manager Interface.
 * Manages virtual TV channel CRUD operations.
 */
export interface IChannelManager {
    // Channel CRUD

    /**
     * Create a new channel with default values for missing fields.
     * @param config - Partial channel configuration
     * @returns Promise resolving to complete channel config
     * @throws Error if content source is missing
     */
    createChannel(config: Partial<ChannelConfig>): Promise<ChannelConfig>;

    /**
     * Update an existing channel.
     * @param id - Channel ID
     * @param updates - Partial updates to apply
     * @returns Promise resolving to updated channel config
     * @throws Error if channel not found
     */
    updateChannel(id: string, updates: Partial<ChannelConfig>): Promise<ChannelConfig>;

    /**
     * Delete a channel.
     * @param id - Channel ID to delete
     * @throws Error if channel not found
     */
    deleteChannel(id: string): Promise<void>;

    // Demo Mode support
    /**
     * seedDemoChannels.
     * Creates deterministic channels for Demo Mode.
     */
    seedDemoChannels(): Promise<void>;

    // Retrieval

    /**
     * Get a channel by ID.
     * @param id - Channel ID
     * @returns Channel config or null if not found
     */
    getChannel(id: string): ChannelConfig | null;

    /**
     * Get all channels in order.
     * @returns Array of channel configs
     */
    getAllChannels(): ChannelConfig[];

    /**
     * Get a channel by its display number.
     * @param number - Channel number (1-999)
     * @returns Channel config or null if not found
     */
    getChannelByNumber(number: number): ChannelConfig | null;

    // Content Resolution

    /**
     * Resolve content for a channel (uses cache if valid).
     * @param channelId - Channel ID
     * @returns Promise resolving to resolved content
     * @throws Error if channel not found
     */
    resolveChannelContent(channelId: string): Promise<ResolvedChannelContent>;

    /**
     * Force refresh content for a channel (bypasses cache).
     * @param channelId - Channel ID
     * @returns Promise resolving to resolved content
     * @throws Error if channel not found
     */
    refreshChannelContent(channelId: string): Promise<ResolvedChannelContent>;

    // Ordering / Current Channel

    /**
     * Reorder channels.
     * @param orderedIds - Array of channel IDs in new order
     */
    reorderChannels(orderedIds: string[]): void;

    /**
     * Set the current active channel.
     * @param channelId - Channel ID to switch to
     */
    setCurrentChannel(channelId: string): void;

    /**
     * Get the current active channel.
     * @returns Current channel or null if none selected
     */
    getCurrentChannel(): ChannelConfig | null;

    /**
     * Get the next channel in order.
     * @returns Next channel or null if at end
     */
    getNextChannel(): ChannelConfig | null;

    /**
     * Get the previous channel in order.
     * @returns Previous channel or null if at start
     */
    getPreviousChannel(): ChannelConfig | null;

    // Import/Export

    /**
     * Export all channels as JSON string.
     * @returns JSON string of channel data
     */
    exportChannels(): string;

    /**
     * Import channels from JSON string.
     * @param data - JSON string of channel data
     * @returns Import result with success/error details
     */
    importChannels(data: string): Promise<ImportResult>;

    // Persistence

    /**
     * Save channels to localStorage.
     */
    saveChannels(): Promise<void>;

    /**
     * Load channels from localStorage.
     */
    loadChannels(): Promise<void>;

    /**
     * Update persistence keys for multi-server/multi-mode support.
     * Implementations should NOT throw if storage is unavailable.
     * Typically followed by loadChannels().
     */
    setStorageKeys(storageKey: string, currentChannelKey: string): void;

    /**
     * Replace the entire channel lineup atomically (best-effort).
     * Used to avoid partial destructive builds when generating many channels.
     */
    replaceAllChannels(
        channels: ChannelConfig[],
        options?: { currentChannelId?: string | null }
    ): Promise<void>;

    // Events

    /**
     * Subscribe to channel manager events.
     * @param event - Event name
     * @param handler - Event handler
     */
    on<K extends keyof ChannelManagerEventMap>(
        event: K,
        handler: (payload: ChannelManagerEventMap[K]) => void
    ): void;
}

// ============================================
// Configuration
// ============================================

/**
 * Configuration for ChannelManager constructor.
 */
export interface ChannelManagerConfig {
    /**
     * PlexLibrary instance for content resolution.
     */
    plexLibrary: IPlexLibraryMinimal;

    /**
     * Optional logger for warnings and errors.
     */
    logger?: {
        warn: (message: string, ...args: unknown[]) => void;
        error: (message: string, ...args: unknown[]) => void;
    };

    /**
     * Storage key to use for channel persistence.
     */
    storageKey?: string;

    /**
     * Storage key to use for persisting the current channel ID.
     * If omitted, a per-storage-key namespaced default is used.
     */
    currentChannelKey?: string;
}

/**
 * Minimal PlexLibrary interface needed by ChannelManager.
 * Decouples from full IPlexLibrary for testability.
 */
export interface IPlexLibraryMinimal {
    getLibraryItems(
        libraryId: string,
        options?: {
            includeCollections?: boolean;
            filter?: Record<string, string | number>;
        }
    ): Promise<PlexMediaItemMinimal[]>;
    getCollectionItems(collectionKey: string): Promise<PlexMediaItemMinimal[]>;
    getShowEpisodes(showKey: string): Promise<PlexMediaItemMinimal[]>;
    getPlaylistItems(playlistKey: string): Promise<PlexMediaItemMinimal[]>;
    getItem(ratingKey: string): Promise<PlexMediaItemMinimal | null>;
}

/**
 * Minimal PlexMediaItem interface for content resolution.
 */
export interface PlexMediaItemMinimal {
    ratingKey: string;
    type: 'movie' | 'show' | 'episode' | 'track' | 'clip';
    title: string;
    year: number;
    durationMs: number;
    thumb: string | null;
    grandparentTitle?: string;
    parentTitle?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    rating?: number;
    contentRating?: string;
    genres?: string[];
    directors?: string[];
    addedAt: Date;
    viewCount?: number;
}
