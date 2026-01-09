/**
 * @fileoverview Channel Manager implementation.
 * Manages virtual TV channel CRUD, content resolution, and persistence.
 * @module modules/scheduler/channel-manager/ChannelManager
 * @version 1.0.0
 */

import { EventEmitter } from '../../../utils/EventEmitter';
import { ContentResolver } from './ContentResolver';
import { AppErrorCode } from '../../lifecycle/types';
import type { IChannelManager, ChannelManagerConfig, IPlexLibraryMinimal } from './interfaces';
import type {
    ChannelConfig,
    ResolvedChannelContent,
    ImportResult,
    ChannelManagerEventMap,
    ChannelManagerState,
    StoredChannelData,
} from './types';
import {
    STORAGE_KEY,
    CURRENT_CHANNEL_KEY,
    STORAGE_VERSION,
    CACHE_TTL_MS,
    MAX_CHANNELS,
    MIN_CHANNEL_NUMBER,
    MAX_CHANNEL_NUMBER,
    CHANNEL_ERROR_MESSAGES,
} from './constants';

// ============================================
// ChannelError Class (per spec)
// ============================================

/**
 * Channel-specific error with AppErrorCode.
 * @see spec-pack/modules/channel-manager.md Error Handling
 */
export class ChannelError extends Error {
    public readonly code: AppErrorCode;
    public readonly recoverable: boolean;

    constructor(code: AppErrorCode, message: string, recoverable = false) {
        super(message);
        this.name = 'ChannelError';
        this.code = code;
        this.recoverable = recoverable;
    }
}

/**
 * Network-related AppErrorCodes that allow cache fallback.
 */
const NETWORK_ERROR_CODES: Set<AppErrorCode> = new Set([
    AppErrorCode.NETWORK_TIMEOUT,
    AppErrorCode.NETWORK_OFFLINE,
    AppErrorCode.SERVER_UNREACHABLE,
    AppErrorCode.NETWORK_UNAVAILABLE,
]);

/**
 * Extract AppErrorCode from any error type that has a code property.
 * Works with ChannelError, PlexLibraryError, PlexApiError, etc.
 */
function getErrorCode(error: unknown): AppErrorCode | null {
    if (error && typeof error === 'object' && 'code' in error) {
        const code = (error as { code: unknown }).code;
        if (typeof code === 'string' && Object.values(AppErrorCode).includes(code as AppErrorCode)) {
            return code as AppErrorCode;
        }
    }
    return null;
}

/**
 * Check if error is a network-related error that allows cache fallback.
 * Issue 1 (Round 3): Detect AppErrorCode on any error type, not just ChannelError.
 */
function isNetworkError(error: unknown): boolean {
    const code = getErrorCode(error);
    if (code && NETWORK_ERROR_CODES.has(code)) {
        return true;
    }
    // Fallback: Check error message for network-related terms
    return error instanceof Error && (
        error.message.toLowerCase().includes('network') ||
        error.message.toLowerCase().includes('timeout') ||
        error.message.toLowerCase().includes('econnrefused') ||
        error.message.toLowerCase().includes('failed to fetch')
    );
}

/**
 * Check if error is a content-unavailable error that allows stale cache fallback.
 */
function isContentUnavailableError(error: unknown): boolean {
    const code = getErrorCode(error);
    return code === AppErrorCode.CONTENT_UNAVAILABLE;
}

// ============================================
// UUID Generator
// ============================================

/**
 * Generate a UUID v4.
 */
function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * Get today's midnight timestamp.
 */
function getTodayMidnight(): number {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.getTime();
}

// ============================================
// Channel Manager Class
// ============================================

/**
 * Channel Manager implementation.
 * Manages virtual TV channels with CRUD operations and content resolution.
 * @implements {IChannelManager}
 */
export class ChannelManager implements IChannelManager {
    private readonly _emitter: EventEmitter<ChannelManagerEventMap>;
    private readonly _contentResolver: ContentResolver;
    private readonly _library: IPlexLibraryMinimal;
    private readonly _logger: {
        warn: (message: string, ...args: unknown[]) => void;
        error: (message: string, ...args: unknown[]) => void;
    };

    private _state: ChannelManagerState;
    /** Issue 3 (Round 3): Pending retry queue for network errors */
    private readonly _pendingRetries: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private static readonly RETRY_DELAY_MS = 30000; // 30 seconds

    /**
     * Create a new ChannelManager instance.
     * @param config - Configuration with PlexLibrary instance
     */
    constructor(config: ChannelManagerConfig) {
        this._emitter = new EventEmitter<ChannelManagerEventMap>();
        this._library = config.plexLibrary;
        this._logger = config.logger || {
            warn: console.warn.bind(console),
            error: console.error.bind(console),
        };
        this._contentResolver = new ContentResolver(this._library, this._logger);

        this._state = {
            channels: new Map(),
            resolvedContent: new Map(),
            currentChannelId: null,
            channelOrder: [],
        };
    }

    // ============================================
    // Channel CRUD
    // ============================================

    /**
     * Create a new channel with default values for missing fields.
     * @param config - Partial channel configuration
     * @returns Promise resolving to complete channel config
     */
    async createChannel(config: Partial<ChannelConfig>): Promise<ChannelConfig> {
        // Validate content source
        if (!config.contentSource) {
            throw new Error(CHANNEL_ERROR_MESSAGES.CONTENT_SOURCE_REQUIRED);
        }

        // Check max channels
        if (this._state.channels.size >= MAX_CHANNELS) {
            throw new Error(CHANNEL_ERROR_MESSAGES.MAX_CHANNELS_REACHED);
        }

        // Validate and assign channel number
        let channelNumber: number;
        if (typeof config.number === 'number') {
            this._validateChannelNumber(config.number);
            if (this._isChannelNumberInUse(config.number)) {
                throw new Error(CHANNEL_ERROR_MESSAGES.DUPLICATE_CHANNEL_NUMBER);
            }
            channelNumber = config.number;
        } else {
            channelNumber = this._getNextAvailableNumber();
        }

        // Build complete channel config
        const channel: ChannelConfig = {
            id: generateUUID(),
            number: channelNumber,
            name:
                typeof config.name === 'string' && config.name.length > 0
                    ? config.name
                    : `Channel ${channelNumber}`,
            contentSource: config.contentSource,
            playbackMode: config.playbackMode || 'sequential',
            startTimeAnchor:
                typeof config.startTimeAnchor === 'number'
                    ? config.startTimeAnchor
                    : getTodayMidnight(),
            skipIntros: config.skipIntros === true,
            skipCredits: config.skipCredits === true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastContentRefresh: 0,
            itemCount: 0,
            totalDurationMs: 0,
        };

        // Add optional properties only if defined
        if (config.description !== undefined) channel.description = config.description;
        if (config.icon !== undefined) channel.icon = config.icon;
        if (config.color !== undefined) channel.color = config.color;
        if (typeof config.shuffleSeed === 'number') channel.shuffleSeed = config.shuffleSeed;
        else channel.shuffleSeed = Date.now();
        if (config.contentFilters !== undefined) channel.contentFilters = config.contentFilters;
        if (config.sortOrder !== undefined) channel.sortOrder = config.sortOrder;
        if (config.maxEpisodeRunTimeMs !== undefined) channel.maxEpisodeRunTimeMs = config.maxEpisodeRunTimeMs;
        if (config.minEpisodeRunTimeMs !== undefined) channel.minEpisodeRunTimeMs = config.minEpisodeRunTimeMs;

        // Store channel
        this._state.channels.set(channel.id, channel);
        this._state.channelOrder.push(channel.id);

        // Resolve content initially
        try {
            const content = await this._resolveContentInternal(channel);
            channel.itemCount = content.items.length;
            channel.totalDurationMs = content.totalDurationMs;
            channel.lastContentRefresh = Date.now();
        } catch (error) {
            this._logger.warn(`Failed initial content resolution for channel ${channel.id}`, error);
        }

        // Persist and emit event
        await this.saveChannels();
        this._emitter.emit('channelCreated', channel);

        return channel;
    }

    /**
     * Update an existing channel.
     * @param id - Channel ID
     * @param updates - Partial updates to apply
     * @returns Promise resolving to updated channel config
     */
    async updateChannel(id: string, updates: Partial<ChannelConfig>): Promise<ChannelConfig> {
        const channel = this._state.channels.get(id);
        if (!channel) {
            throw new Error(CHANNEL_ERROR_MESSAGES.CHANNEL_NOT_FOUND);
        }

        // Handle number change
        if (typeof updates.number === 'number' && updates.number !== channel.number) {
            this._validateChannelNumber(updates.number);
            if (this._isChannelNumberInUse(updates.number)) {
                throw new Error(CHANNEL_ERROR_MESSAGES.DUPLICATE_CHANNEL_NUMBER);
            }
        }

        // Apply updates
        const updated: ChannelConfig = {
            ...channel,
            ...updates,
            id: channel.id, // Prevent ID change
            createdAt: channel.createdAt, // Prevent createdAt change
            updatedAt: Date.now(),
        };

        this._state.channels.set(id, updated);

        // Re-resolve content if source changed
        if (updates.contentSource) {
            this._state.resolvedContent.delete(id);
            try {
                const content = await this._resolveContentInternal(updated);
                updated.itemCount = content.items.length;
                updated.totalDurationMs = content.totalDurationMs;
                updated.lastContentRefresh = Date.now();
            } catch (error) {
                this._logger.warn(`Failed content resolution during update for ${id}`, error);
            }
        }

        // Persist and emit event
        await this.saveChannels();
        this._emitter.emit('channelUpdated', updated);

        return updated;
    }

    /**
     * Delete a channel.
     * @param id - Channel ID to delete
     */
    async deleteChannel(id: string): Promise<void> {
        if (!this._state.channels.has(id)) {
            throw new Error(CHANNEL_ERROR_MESSAGES.CHANNEL_NOT_FOUND);
        }

        this._state.channels.delete(id);
        this._state.resolvedContent.delete(id);
        this._state.channelOrder = this._state.channelOrder.filter((cid) => cid !== id);

        // Update current channel if needed
        if (this._state.currentChannelId === id) {
            this._state.currentChannelId =
                this._state.channelOrder.length > 0 ? this._state.channelOrder[0]! : null;
        }

        // Persist and emit event
        await this.saveChannels();
        this._emitter.emit('channelDeleted', id);
    }

    // ============================================
    // Retrieval
    // ============================================

    /**
     * Get a channel by ID.
     */
    getChannel(id: string): ChannelConfig | null {
        return this._state.channels.get(id) || null;
    }

    /**
     * Get all channels in order.
     */
    getAllChannels(): ChannelConfig[] {
        return this._state.channelOrder
            .map((id) => this._state.channels.get(id))
            .filter((ch): ch is ChannelConfig => ch !== undefined);
    }

    /**
     * Get a channel by its display number.
     */
    getChannelByNumber(number: number): ChannelConfig | null {
        for (const channel of this._state.channels.values()) {
            if (channel.number === number) {
                return channel;
            }
        }
        return null;
    }

    // ============================================
    // Content Resolution
    // ============================================

    /**
     * Resolve content for a channel (uses cache if valid).
     * @throws {ChannelError} With AppErrorCode.CHANNEL_NOT_FOUND if channel doesn't exist
     */
    async resolveChannelContent(channelId: string): Promise<ResolvedChannelContent> {
        const channel = this._state.channels.get(channelId);
        if (!channel) {
            throw new ChannelError(
                AppErrorCode.CHANNEL_NOT_FOUND,
                CHANNEL_ERROR_MESSAGES.CHANNEL_NOT_FOUND,
                false
            );
        }

        // Check cache
        const cached = this._state.resolvedContent.get(channelId);
        if (cached && !this._isStale(cached)) {
            // Issue 2: Return cached content with cache status
            return {
                ...cached,
                fromCache: true,
                isStale: false,
                cacheReason: 'fresh',
            };
        }

        return this._resolveContentInternal(channel);
    }

    /**
     * Force refresh content for a channel (bypasses cache).
     * @throws {ChannelError} With AppErrorCode.CHANNEL_NOT_FOUND if channel doesn't exist
     */
    async refreshChannelContent(channelId: string): Promise<ResolvedChannelContent> {
        const channel = this._state.channels.get(channelId);
        if (!channel) {
            throw new ChannelError(
                AppErrorCode.CHANNEL_NOT_FOUND,
                CHANNEL_ERROR_MESSAGES.CHANNEL_NOT_FOUND,
                false
            );
        }

        this._state.resolvedContent.delete(channelId);
        return this._resolveContentInternal(channel);
    }

    // ============================================
    // Ordering / Current Channel
    // ============================================

    /**
     * Reorder channels.
     * @remarks In-memory order is updated synchronously; persistence is best-effort.
     * Save failures are logged but do not block the reorder operation.
     */
    reorderChannels(orderedIds: string[]): void {
        // Validate all IDs exist
        const validIds = orderedIds.filter((id) => this._state.channels.has(id));
        this._state.channelOrder = validIds;
        this.saveChannels().catch((e) => this._logger.error('Failed to save after reorder', e));
    }

    /**
     * Set the current active channel.
     */
    setCurrentChannel(channelId: string): void {
        const channel = this._state.channels.get(channelId);
        if (!channel) {
            throw new Error(CHANNEL_ERROR_MESSAGES.CHANNEL_NOT_FOUND);
        }

        this._state.currentChannelId = channelId;

        // Persist current channel separately
        try {
            localStorage.setItem(CURRENT_CHANNEL_KEY, channelId);
        } catch (e) {
            this._logger.warn('Failed to persist current channel', e);
        }

        const index = this._state.channelOrder.indexOf(channelId);
        this._emitter.emit('channelSwitch', { channel, index });
    }

    /**
     * Get the current active channel.
     */
    getCurrentChannel(): ChannelConfig | null {
        if (!this._state.currentChannelId) {
            return null;
        }
        return this._state.channels.get(this._state.currentChannelId) || null;
    }

    /**
     * Get the next channel in order.
     */
    getNextChannel(): ChannelConfig | null {
        if (!this._state.currentChannelId || this._state.channelOrder.length === 0) {
            return null;
        }

        const currentIndex = this._state.channelOrder.indexOf(this._state.currentChannelId);
        const nextIndex = (currentIndex + 1) % this._state.channelOrder.length;
        const nextId = this._state.channelOrder[nextIndex];
        return nextId ? this._state.channels.get(nextId) || null : null;
    }

    /**
     * Get the previous channel in order.
     */
    getPreviousChannel(): ChannelConfig | null {
        if (!this._state.currentChannelId || this._state.channelOrder.length === 0) {
            return null;
        }

        const currentIndex = this._state.channelOrder.indexOf(this._state.currentChannelId);
        const prevIndex =
            (currentIndex - 1 + this._state.channelOrder.length) % this._state.channelOrder.length;
        const prevId = this._state.channelOrder[prevIndex];
        return prevId ? this._state.channels.get(prevId) || null : null;
    }

    // ============================================
    // Import/Export
    // ============================================

    /**
     * Export all channels as JSON string.
     */
    exportChannels(): string {
        const channels = this.getAllChannels();
        return JSON.stringify(channels, null, 2);
    }

    /**
     * Import channels from JSON string.
     */
    async importChannels(data: string): Promise<ImportResult> {
        const result: ImportResult = {
            success: false,
            importedCount: 0,
            skippedCount: 0,
            errors: [],
        };

        let parsed: unknown;
        try {
            parsed = JSON.parse(data);
        } catch {
            result.errors.push(CHANNEL_ERROR_MESSAGES.INVALID_IMPORT_DATA);
            return result;
        }

        if (!Array.isArray(parsed)) {
            result.errors.push(CHANNEL_ERROR_MESSAGES.INVALID_IMPORT_DATA);
            return result;
        }

        for (const item of parsed) {
            if (!this._isValidChannelImport(item)) {
                result.skippedCount++;
                continue;
            }

            try {
                // Generate new ID for imported channel
                const channelData = item as Partial<ChannelConfig>;
                delete (channelData as Record<string, unknown>)['id'];

                // Find available number if number conflicts
                if (
                    typeof channelData.number === 'number' &&
                    this._isChannelNumberInUse(channelData.number)
                ) {
                    channelData.number = this._getNextAvailableNumber();
                }

                await this.createChannel(channelData);
                result.importedCount++;
            } catch (e) {
                result.skippedCount++;
                result.errors.push(
                    `Failed to import channel: ${(e as Error).message}`
                );
            }
        }

        result.success = result.importedCount > 0;
        return result;
    }

    // ============================================
    // Persistence
    // ============================================

    /**
     * Save channels to localStorage.
     */
    async saveChannels(): Promise<void> {
        const data: StoredChannelData = {
            version: STORAGE_VERSION,
            channels: Array.from(this._state.channels.values()),
            channelOrder: this._state.channelOrder,
            currentChannelId: this._state.currentChannelId,
            savedAt: Date.now(),
        };

        const json = JSON.stringify(data);

        try {
            localStorage.setItem(STORAGE_KEY, json);
        } catch (e) {
            if (this._isQuotaExceeded(e)) {
                // Issue 6: First clear content caches
                this._state.resolvedContent.clear();
                try {
                    localStorage.setItem(STORAGE_KEY, json);
                    return;
                } catch (e2) {
                    // Issue 6: If still failing, remove oldest channels until it fits
                    if (this._isQuotaExceeded(e2) && this._state.channelOrder.length > 1) {
                        const removedCount = this._compactOldestChannels();
                        this._logger.warn(`Removed ${removedCount} oldest channels due to quota`);
                        // Retry with compacted data
                        const compactedData: StoredChannelData = {
                            version: STORAGE_VERSION,
                            channels: Array.from(this._state.channels.values()),
                            channelOrder: this._state.channelOrder,
                            currentChannelId: this._state.currentChannelId,
                            savedAt: Date.now(),
                        };
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(compactedData));
                        return;
                    }
                    this._logger.error('Failed to save channels after pruning cache', e2);
                    throw e2;
                }
            } else {
                throw e;
            }
        }
    }

    /**
     * Load channels from localStorage.
     */
    async loadChannels(): Promise<void> {
        try {
            const json = localStorage.getItem(STORAGE_KEY);
            if (!json) {
                return;
            }

            const data = JSON.parse(json) as StoredChannelData;

            // Validate version
            if (typeof data.version !== 'number' || data.version > STORAGE_VERSION) {
                this._logger.warn('Unknown storage version, skipping load');
                return;
            }

            // Restore state
            this._state.channels.clear();
            for (const channel of data.channels) {
                this._state.channels.set(channel.id, channel);
            }

            this._state.channelOrder = data.channelOrder.filter((id) =>
                this._state.channels.has(id)
            );
            this._state.currentChannelId = data.currentChannelId;

            // Also restore current channel from separate key
            const savedCurrent = localStorage.getItem(CURRENT_CHANNEL_KEY);
            if (savedCurrent && this._state.channels.has(savedCurrent)) {
                this._state.currentChannelId = savedCurrent;
            }
        } catch (e) {
            this._logger.error('Failed to load channels from storage', e);
        }
    }

    // ============================================
    // Events
    // ============================================

    /**
     * Subscribe to channel manager events.
     */
    on<K extends keyof ChannelManagerEventMap>(
        event: K,
        handler: (payload: ChannelManagerEventMap[K]) => void
    ): void {
        this._emitter.on(event, handler);
    }

    // ============================================
    // Private Methods
    // ============================================

    private async _resolveContentInternal(channel: ChannelConfig): Promise<ResolvedChannelContent> {
        const cached = this._state.resolvedContent.get(channel.id);

        try {
            // Resolve from source
            const rawItems = await this._contentResolver.resolveSource(channel.contentSource);

            // Issue 1 (Round 4): If source itself returns empty, it's CONTENT_UNAVAILABLE (library/collection deleted)
            // This is different from filtering removing all items
            if (rawItems.length === 0) {
                throw new ChannelError(
                    AppErrorCode.CONTENT_UNAVAILABLE,
                    `Content source returned no items - source may have been deleted`,
                    true // recoverable with cache fallback
                );
            }

            let items = rawItems;

            // Apply filters
            if (channel.contentFilters && channel.contentFilters.length > 0) {
                items = this._contentResolver.applyFilters(items, channel.contentFilters);
            }

            // Apply sort
            if (channel.sortOrder) {
                items = this._contentResolver.applySort(items, channel.sortOrder);
            }

            // Filter out zero-duration items
            items = items.filter((item) => item.durationMs > 0);

            // Apply duration limits
            if (channel.minEpisodeRunTimeMs || channel.maxEpisodeRunTimeMs) {
                items = items.filter((item) => {
                    if (channel.minEpisodeRunTimeMs && item.durationMs < channel.minEpisodeRunTimeMs) {
                        return false;
                    }
                    if (channel.maxEpisodeRunTimeMs && item.durationMs > channel.maxEpisodeRunTimeMs) {
                        return false;
                    }
                    return true;
                });
            }

            // Issue 1 (Round 4): If content exists but filters removed all, it's SCHEDULER_EMPTY_CHANNEL
            if (items.length === 0) {
                throw new ChannelError(
                    AppErrorCode.SCHEDULER_EMPTY_CHANNEL,
                    CHANNEL_ERROR_MESSAGES.EMPTY_CONTENT,
                    false
                );
            }

            // Apply playback mode
            const orderedItems = this._contentResolver.applyPlaybackMode(
                items,
                channel.playbackMode,
                channel.shuffleSeed ?? Date.now()
            );

            // Build result
            const result: ResolvedChannelContent = {
                channelId: channel.id,
                resolvedAt: Date.now(),
                items,
                totalDurationMs: items.reduce((sum, item) => sum + item.durationMs, 0),
                orderedItems,
                // Issue 2: Include cache status for fresh content
                fromCache: false,
                isStale: false,
                cacheReason: 'fresh',
            };

            // Cache
            this._state.resolvedContent.set(channel.id, result);
            this._emitter.emit('contentResolved', result);

            // Issue 4: Update channel metadata after every successful resolve
            channel.lastContentRefresh = Date.now();
            channel.itemCount = items.length;
            channel.totalDurationMs = result.totalDurationMs;
            this._state.channels.set(channel.id, channel);

            // Persist metadata update (but don't await to avoid blocking)
            this.saveChannels().catch((e) =>
                this._logger.warn('Failed to persist channel metadata after resolve', e)
            );

            return result;
        } catch (error) {
            // Issue 2 (Round 2): Only fallback to cache for network errors
            // SCHEDULER_EMPTY_CHANNEL and other non-network errors should propagate
            if (error instanceof ChannelError && error.code === AppErrorCode.SCHEDULER_EMPTY_CHANNEL) {
                // No fallback for empty content - throw directly
                throw error;
            }

            // Issue 2 (Round 2): Check if this is a network error
            if (isNetworkError(error) && cached) {
                const isStale = this._isStale(cached);
                this._logger.warn(
                    `Resolution failed for channel ${channel.id} due to network error, using cached content (stale: ${isStale})`,
                    error
                );
                // Issue 3 (Round 3): Queue retry for network errors
                this._queueRetry(channel.id);
                return {
                    ...cached,
                    fromCache: true,
                    isStale,
                    cacheReason: 'network_error',
                };
            }

            // Issue 2 (Round 3): Only allow cache fallback for CONTENT_UNAVAILABLE errors
            // Per spec: library/collection deleted should return stale cache
            if (isContentUnavailableError(error) && cached) {
                this._logger.warn(
                    `Content unavailable for channel ${channel.id}, using stale cache`,
                    error
                );
                return {
                    ...cached,
                    fromCache: true,
                    isStale: true,
                    cacheReason: 'content_unavailable',
                };
            }

            // No cache fallback for other errors - re-throw
            throw error;
        }
    }

    private _isStale(content: ResolvedChannelContent): boolean {
        return Date.now() - content.resolvedAt > CACHE_TTL_MS;
    }

    private _validateChannelNumber(number: number): void {
        if (number < MIN_CHANNEL_NUMBER || number > MAX_CHANNEL_NUMBER) {
            throw new Error(CHANNEL_ERROR_MESSAGES.INVALID_CHANNEL_NUMBER);
        }
    }

    private _isChannelNumberInUse(number: number): boolean {
        for (const channel of this._state.channels.values()) {
            if (channel.number === number) {
                return true;
            }
        }
        return false;
    }

    private _getNextAvailableNumber(): number {
        const usedNumbers = new Set<number>();
        for (const channel of this._state.channels.values()) {
            usedNumbers.add(channel.number);
        }

        for (let n = MIN_CHANNEL_NUMBER; n <= MAX_CHANNEL_NUMBER; n++) {
            if (!usedNumbers.has(n)) {
                return n;
            }
        }

        // Fallback (should never reach due to MAX_CHANNELS check)
        return this._state.channels.size + 1;
    }

    private _isQuotaExceeded(error: unknown): boolean {
        return (
            error instanceof DOMException &&
            (error.code === 22 ||
                error.code === 1014 ||
                error.name === 'QuotaExceededError' ||
                error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
        );
    }

    private _isValidChannelImport(item: unknown): boolean {
        if (!item || typeof item !== 'object') {
            return false;
        }

        const obj = item as Record<string, unknown>;

        // Must have contentSource with type
        if (!obj['contentSource'] || typeof obj['contentSource'] !== 'object') {
            return false;
        }

        const source = obj['contentSource'] as Record<string, unknown>;
        if (typeof source['type'] !== 'string') {
            return false;
        }

        return true;
    }

    // Issue 6: Compact oldest channels to free storage space
    private _compactOldestChannels(): number {
        const channelsByAge = [...this._state.channels.values()]
            .sort((a, b) => a.createdAt - b.createdAt);

        // Remove up to 10% of channels (minimum 1)
        const toRemove = Math.max(1, Math.floor(channelsByAge.length * 0.1));
        let removed = 0;

        for (let i = 0; i < toRemove && i < channelsByAge.length; i++) {
            const oldChannel = channelsByAge[i];
            if (oldChannel) {
                this._state.channels.delete(oldChannel.id);
                this._state.resolvedContent.delete(oldChannel.id);
                this._state.channelOrder = this._state.channelOrder.filter((id) => id !== oldChannel.id);
                if (this._state.currentChannelId === oldChannel.id) {
                    this._state.currentChannelId = this._state.channelOrder[0] || null;
                }
                removed++;
            }
        }

        return removed;
    }

    /**
     * Issue 3 (Round 3): Queue a retry for network errors.
     * Implements spec requirement to retry failed content resolution.
     */
    private _queueRetry(channelId: string): void {
        // Don't queue if already pending
        if (this._pendingRetries.has(channelId)) {
            return;
        }

        const timeout = setTimeout(() => {
            this._pendingRetries.delete(channelId);
            this._executeRetry(channelId);
        }, ChannelManager.RETRY_DELAY_MS);

        this._pendingRetries.set(channelId, timeout);
    }

    /**
     * Execute a queued retry for a channel.
     */
    private _executeRetry(channelId: string): void {
        const channel = this._state.channels.get(channelId);
        if (!channel) {
            return;
        }

        this._resolveContentInternal(channel)
            .then(() => {
                this._logger.warn(`Retry succeeded for channel ${channelId}`);
            })
            .catch((error) => {
                this._logger.warn(`Retry failed for channel ${channelId}`, error);
                // Could implement exponential backoff here if needed
            });
    }

    /**
     * Cancel any pending retries (useful for cleanup).
     */
    cancelPendingRetries(): void {
        for (const timeout of this._pendingRetries.values()) {
            clearTimeout(timeout);
        }
        this._pendingRetries.clear();
    }
}
