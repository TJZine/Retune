import { ChannelManager } from '../../modules/scheduler/channel-manager';
import type { IChannelManager, ChannelConfig, ContentFilter } from '../../modules/scheduler/channel-manager';
import type { IPlexLibrary, PlexLibraryType, PlexMediaItem, LibraryQueryOptions } from '../../modules/plex/library';
import { PLEX_MEDIA_TYPES } from '../../modules/plex/library';
import type { INavigationManager } from '../../modules/navigation';
import type { AppError } from '../../modules/lifecycle';
import { DEFAULT_CHANNEL_SETUP_MAX, MAX_CHANNELS } from '../../modules/scheduler/channel-manager/constants';

import type { ChannelSetupConfig, ChannelBuildSummary, ChannelBuildProgress, ChannelSetupRecord } from './types';

export interface ChannelSetupCoordinatorDeps {
    // Primary modules
    getPlexLibrary: () => IPlexLibrary | null;
    getChannelManager: () => IChannelManager | null;
    getNavigation: () => INavigationManager | null;

    // Server + storage
    getSelectedServerId: () => string | null;
    storageGet: (key: string) => string | null;
    storageSet: (key: string, value: string) => void;
    storageRemove: (key: string) => void;

    // Orchestrator hooks
    handleGlobalError: (error: AppError, context: string) => void;

    // EPG hooks (do not inject the whole epg coordinator object)
    primeEpgChannels: () => void;
    refreshEpgSchedules: () => Promise<void>;

    // Channel manager storage configuration already exists in Orchestrator; we do not move it in this slice.
    // Rerun flag storage remains in-memory in this coordinator (not in localStorage).
}

export class ChannelSetupCoordinator {
    private _channelSetupRerunRequested = false;

    constructor(private readonly deps: ChannelSetupCoordinatorDeps) {}

    // --- Public API mirrored from AppOrchestrator ---
    async getLibrariesForSetup(signal?: AbortSignal | null): Promise<PlexLibraryType[]> {
        const plexLibrary = this.deps.getPlexLibrary();
        if (!plexLibrary) {
            throw new Error('PlexLibrary not initialized');
        }
        const libraries = await plexLibrary.getLibraries({ signal: signal ?? null });
        return libraries.filter((lib) => lib.type === 'movie' || lib.type === 'show');
    }

    async createChannelsFromSetup(
        config: ChannelSetupConfig,
        options?: { signal?: AbortSignal; onProgress?: (p: ChannelBuildProgress) => void }
    ): Promise<ChannelBuildSummary> {
        const channelManager = this.deps.getChannelManager();
        const plexLibrary = this.deps.getPlexLibrary();
        if (!channelManager || !plexLibrary) {
            throw new Error('Channel manager not initialized');
        }

        const signal = options?.signal;
        const buildStartMs = Date.now();
        let libraryFetchMs = 0;
        let playlistMs = 0;
        let collectionsMs = 0;
        let libraryQueryMs = 0;
        let createChannelsMs = 0;
        let applyChannelsMs = 0;
        let refreshEpgMs = 0;
        const reportProgress = (
            task: ChannelBuildProgress['task'],
            label: string,
            detail: string,
            current: number,
            total: number | null
        ): void => {
            options?.onProgress?.({ task, label, detail, current, total });
        };

        const checkCanceled = (): boolean => {
            return signal?.aborted ?? false;
        };

        if (checkCanceled()) {
            return { created: 0, skipped: 0, reachedMaxChannels: false, errorCount: 0, canceled: true, lastTask: 'init' };
        }

        reportProgress('fetch_playlists', 'Preparing...', 'Loading libraries', 0, null);

        let libraries: PlexLibraryType[];
        const librariesStart = Date.now();
        try {
            libraries = await this.getLibrariesForSetup(signal ?? null);
            libraryFetchMs += Date.now() - librariesStart;
        } catch (e) {
            libraryFetchMs += Date.now() - librariesStart;
            if (isAbortLike(e, signal)) {
                reportProgress('fetch_playlists', 'Preparing...', 'Canceled', 0, null);
                return { created: 0, skipped: 0, reachedMaxChannels: false, errorCount: 0, canceled: true, lastTask: 'fetch_playlists' };
            }
            throw e;
        }
        const selectedLibraries = libraries
            .filter((lib) => config.selectedLibraryIds.includes(lib.id))
            .sort((a, b) => a.title.localeCompare(b.title));

        let createdItems = 0;
        let skippedCount = 0;
        let reachedMax = false;
        let errorsTotal = 0;

        const requestedMax = Number.isFinite(config.maxChannels) ? config.maxChannels : DEFAULT_CHANNEL_SETUP_MAX;
        const effectiveMaxChannels = Math.min(
            Math.max(Math.floor(requestedMax), 1),
            MAX_CHANNELS
        );
        const rawMinItems = Number.isFinite(config.minItemsPerChannel)
            ? Math.floor(config.minItemsPerChannel)
            : 10;
        const minItems = Math.max(1, rawMinItems);
        // Maximum items to scan for category extraction during setup.
        // Trade-off: higher values improve coverage but increase setup time.
        const CHANNEL_SETUP_SCAN_LIMIT = 500;

        const shuffleSeedFor = (value: string): number => this._hashSeed(value);

        type PendingChannel = {
            name: string;
            contentSource: ChannelConfig['contentSource'];
            playbackMode: ChannelConfig['playbackMode'];
            shuffleSeed: number;
            contentFilters?: ContentFilter[];
        };

        const pending: PendingChannel[] = [];
        const reportLibraryProgress = (index: number, label: string, libTitle: string): void => {
            reportProgress('scan_library_items', label, libTitle, index, selectedLibraries.length);
        };

        // 0. Server-wide Playlists (Playlists in Plex are global, not per-library)
        if (config.enabledStrategies.playlists) {
            reportProgress('fetch_playlists', 'Fetching playlists...', 'Scanning server', 0, null);
            try {
                const playlistsStart = Date.now();
                const playlists = await plexLibrary.getPlaylists({ signal: signal ?? null });
                playlistMs += Date.now() - playlistsStart;
                for (const pl of playlists) {
                    if (checkCanceled()) {
                        return { created: createdItems, skipped: skippedCount, reachedMaxChannels: reachedMax, errorCount: errorsTotal, canceled: true, lastTask: 'fetch_playlists' };
                    }

                    if (pl.leafCount >= minItems) {
                        pending.push({
                            name: pl.title,
                            contentSource: {
                                type: 'playlist',
                                playlistKey: pl.ratingKey,
                                playlistName: pl.title,
                            },
                            playbackMode: 'shuffle',
                            shuffleSeed: shuffleSeedFor(`playlist:${pl.ratingKey}`),
                        });
                    } else {
                        skippedCount++;
                    }
                }
            } catch (e) {
                if (isAbortLike(e, signal)) {
                    return { created: createdItems, skipped: skippedCount, reachedMaxChannels: reachedMax, errorCount: errorsTotal, canceled: true, lastTask: 'fetch_playlists' };
                }
                console.warn('Failed to fetch playlists:', summarizeErrorForLog(e));
                errorsTotal++;
            }
        }

        for (let libIndex = 0; libIndex < selectedLibraries.length; libIndex++) {
            const library = selectedLibraries[libIndex];
            if (!library) {
                continue;
            }
            if (checkCanceled()) {
                return { created: createdItems, skipped: skippedCount, reachedMaxChannels: reachedMax, errorCount: errorsTotal, canceled: true, lastTask: 'scan_library_items' };
            }

            // 1. Collections
            let addedCollections = false;
            if (config.enabledStrategies.collections) {
                reportProgress('fetch_collections', 'Fetching collections...', library.title, libIndex, selectedLibraries.length);
                try {
                    const collectionsStart = Date.now();
                    const collections = await plexLibrary.getCollections(library.id, { signal: signal ?? null });
                    collectionsMs += Date.now() - collectionsStart;
                    for (const collection of collections) {
                        if (collection.childCount >= minItems) {
                            pending.push({
                                name: collection.title,
                                contentSource: {
                                    type: 'collection',
                                    collectionKey: collection.ratingKey,
                                    collectionName: collection.title,
                                },
                                playbackMode: 'shuffle',
                                shuffleSeed: shuffleSeedFor(`collection:${collection.ratingKey}`),
                            });
                            addedCollections = true;
                        } else {
                            skippedCount++;
                        }
                    }
                } catch (e) {
                    if (isAbortLike(e, signal)) {
                        return { created: createdItems, skipped: skippedCount, reachedMaxChannels: reachedMax, errorCount: errorsTotal, canceled: true, lastTask: 'fetch_collections' };
                    }
                    console.warn(`Failed to fetch collections for library ${library.title}:`, summarizeErrorForLog(e));
                    errorsTotal++;
                }
            }

            if (!addedCollections && config.enabledStrategies.libraryFallback) {
                let libraryCount: number | null = Number.isFinite(library.contentCount)
                    ? library.contentCount
                    : null;
                if (libraryCount === 0) {
                    try {
                        const countOptions: LibraryQueryOptions = { signal: signal ?? null };
                        if (library.type === 'show') {
                            countOptions.filter = { type: PLEX_MEDIA_TYPES.EPISODE };
                        }
                        const countStart = Date.now();
                        libraryCount = await plexLibrary.getLibraryItemCount(library.id, countOptions);
                        libraryQueryMs += Date.now() - countStart;
                    } catch (e) {
                        if (isAbortLike(e, signal)) {
                            return { created: createdItems, skipped: skippedCount, reachedMaxChannels: reachedMax, errorCount: errorsTotal, canceled: true, lastTask: 'scan_library_items' };
                        }
                        console.warn(`Failed to fetch item count for ${library.title}:`, summarizeErrorForLog(e));
                        errorsTotal++;
                        libraryCount = null;
                    }
                }

                if (libraryCount === null || libraryCount >= minItems) {
                    pending.push({
                        name: library.title,
                        contentSource: {
                            type: 'library',
                            libraryId: library.id,
                            libraryType: library.type === 'movie' ? 'movie' : 'show',
                            includeWatched: true,
                        },
                        playbackMode: 'shuffle',
                        shuffleSeed: shuffleSeedFor(`library:${library.id}`),
                    });
                } else {
                    skippedCount++;
                }
            } else if (!config.enabledStrategies.collections && !config.enabledStrategies.libraryFallback) {
                skippedCount++;
            }

            // 2. Item Scanning Strategies
            const needsScan =
                config.enabledStrategies.genres ||
                config.enabledStrategies.directors ||
                config.enabledStrategies.decades ||
                config.enabledStrategies.runtimeRanges;

            if (needsScan) {
                reportLibraryProgress(libIndex, 'Resolving filters...', library.title);
                if (checkCanceled()) {
                    return { created: createdItems, skipped: skippedCount, reachedMaxChannels: reachedMax, errorCount: errorsTotal, canceled: true, lastTask: 'scan_library_items' };
                }

                try {
                    const scanOptions: LibraryQueryOptions = {
                        signal: signal ?? null,
                        limit: CHANNEL_SETUP_SCAN_LIMIT,
                    };

                    let tagItems: PlexMediaItem[];
                    let scanItems: PlexMediaItem[];

                    if (library.type === 'show') {
                        if (config.enabledStrategies.genres || config.enabledStrategies.directors) {
                            const tagOptions: LibraryQueryOptions = {
                                signal: signal ?? null,
                                limit: CHANNEL_SETUP_SCAN_LIMIT,
                                filter: { type: PLEX_MEDIA_TYPES.SHOW },
                            };
                            const tagStart = Date.now();
                            tagItems = await plexLibrary.getLibraryItems(library.id, tagOptions);
                            libraryQueryMs += Date.now() - tagStart;
                        } else {
                            tagItems = [];
                        }

                        if (config.enabledStrategies.decades || config.enabledStrategies.runtimeRanges) {
                            const episodeOptions: LibraryQueryOptions = {
                                signal: signal ?? null,
                                limit: CHANNEL_SETUP_SCAN_LIMIT,
                                filter: { type: PLEX_MEDIA_TYPES.EPISODE },
                            };
                            const scanStart = Date.now();
                            scanItems = await plexLibrary.getLibraryItems(library.id, episodeOptions);
                            libraryQueryMs += Date.now() - scanStart;
                        } else {
                            scanItems = [];
                        }
                    } else {
                        const scanStart = Date.now();
                        tagItems = await plexLibrary.getLibraryItems(library.id, scanOptions);
                        libraryQueryMs += Date.now() - scanStart;
                        scanItems = tagItems;
                    }

                    const countTags = (field: 'genres' | 'directors'): { label: string; count: number }[] => {
                        const counts = new Map<string, { label: string; count: number }>();
                        for (const item of tagItems) {
                            const values = item[field];
                            if (!values) continue;
                            for (const value of values) {
                                const trimmed = value.trim();
                                if (!trimmed) continue;
                                const key = trimmed.toLowerCase();
                                const existing = counts.get(key);
                                if (existing) {
                                    existing.count++;
                                } else {
                                    counts.set(key, { label: trimmed, count: 1 });
                                }
                            }
                        }
                        return Array.from(counts.values()).sort((a, b) => a.label.localeCompare(b.label));
                    };

                    // -- Genres
                    if (config.enabledStrategies.genres) {
                        const genres = countTags('genres');
                        for (const genre of genres) {
                            if (genre.count < minItems) continue;
                            pending.push({
                                name: `${library.title} - ${genre.label}`,
                                contentSource: {
                                    type: 'library',
                                    libraryId: library.id,
                                    libraryType: library.type === 'movie' ? 'movie' : 'show',
                                    includeWatched: true,
                                },
                                contentFilters: [{ field: 'genre', operator: 'eq', value: genre.label }],
                                playbackMode: 'shuffle',
                                shuffleSeed: shuffleSeedFor(`genre:${library.id}:${genre.label}`),
                            });
                        }
                    }

                    // -- Directors
                    if (config.enabledStrategies.directors) {
                        const directors = countTags('directors');
                        for (const director of directors) {
                            if (director.count < minItems) continue;
                            pending.push({
                                name: `${library.title} - ${director.label}`,
                                contentSource: {
                                    type: 'library',
                                    libraryId: library.id,
                                    libraryType: library.type === 'movie' ? 'movie' : 'show',
                                    includeWatched: true,
                                },
                                contentFilters: [{ field: 'director', operator: 'eq', value: director.label }],
                                playbackMode: 'shuffle',
                                shuffleSeed: shuffleSeedFor(`director:${library.id}:${director.label}`),
                            });
                        }
                    }

                    // -- Decades
                    if (config.enabledStrategies.decades) {
                        const decadeCounts = new Map<number, number>();
                        for (const item of scanItems) {
                            if (item.year) {
                                const decade = Math.floor(item.year / 10) * 10;
                                decadeCounts.set(decade, (decadeCounts.get(decade) || 0) + 1);
                            }
                        }
                        const sortedDecades = Array.from(decadeCounts.keys()).sort((a, b) => a - b);
                        for (const decade of sortedDecades) {
                            if ((decadeCounts.get(decade) || 0) < minItems) continue;
                            pending.push({
                                name: `${library.title} - ${decade}s`,
                                contentSource: {
                                    type: 'library',
                                    libraryId: library.id,
                                    libraryType: library.type === 'movie' ? 'movie' : 'show',
                                    includeWatched: true,
                                },
                                contentFilters: [
                                    { field: 'year', operator: 'gte', value: decade },
                                    { field: 'year', operator: 'lt', value: decade + 10 },
                                ],
                                playbackMode: 'shuffle',
                                shuffleSeed: shuffleSeedFor(`decade:${library.id}:${decade}`),
                            });
                        }
                    }

                    // -- Runtime Ranges
                    if (config.enabledStrategies.runtimeRanges) {
                        const buckets = {
                            '< 30m': { count: 0, min: 0, max: 30 * 60 * 1000 },
                            '30m - 60m': { count: 0, min: 30 * 60 * 1000, max: 60 * 60 * 1000 },
                            '60m - 90m': { count: 0, min: 60 * 60 * 1000, max: 90 * 60 * 1000 },
                            '90m - 120m': { count: 0, min: 90 * 60 * 1000, max: 120 * 60 * 1000 },
                            '> 120m': { count: 0, min: 120 * 60 * 1000, max: null as number | null },
                        };

                        for (const item of scanItems) {
                            const dur = item.durationMs;
                            if (!dur) continue;
                        if (dur < 30 * 60 * 1000) buckets['< 30m'].count++;
                        else if (dur < 60 * 60 * 1000) buckets['30m - 60m'].count++;
                        else if (dur < 90 * 60 * 1000) buckets['60m - 90m'].count++;
                        else if (dur < 120 * 60 * 1000) buckets['90m - 120m'].count++;
                            else buckets['> 120m'].count++;
                        }

                        for (const [key, b] of Object.entries(buckets)) {
                            if (b.count < minItems) continue;
                            const rangeFilters: ContentFilter[] = [
                                { field: 'duration', operator: 'gte', value: b.min }
                            ];
                            if (b.max !== null) {
                                rangeFilters.push({ field: 'duration', operator: 'lt', value: b.max });
                            }

                            pending.push({
                                name: `${library.title} - ${key}`,
                                contentSource: {
                                    type: 'library',
                                    libraryId: library.id,
                                    libraryType: library.type === 'movie' ? 'movie' : 'show',
                                    includeWatched: true,
                                },
                                contentFilters: rangeFilters,
                                playbackMode: 'shuffle',
                                shuffleSeed: shuffleSeedFor(`runtime:${library.id}:${key}`),
                            });
                        }
                    }
                } catch (e) {
                    if (isAbortLike(e, signal)) {
                        return { created: createdItems, skipped: skippedCount, reachedMaxChannels: reachedMax, errorCount: errorsTotal, canceled: true, lastTask: 'scan_library_items' };
                    }
                    console.warn(`Failed to scan items for ${library.title}:`, summarizeErrorForLog(e));
                    errorsTotal++;
                }
            }
        }

        if (checkCanceled()) {
            return { created: createdItems, skipped: skippedCount, reachedMaxChannels: reachedMax, errorCount: errorsTotal, canceled: true, lastTask: 'build_pending' };
        }

        reportProgress('create_channels', 'Shuffling...', 'Setting up lineup', 0, pending.length);

        const tempKeyId = String(Date.now());
        const tempKey = `retune_channels_build_tmp_v1:${tempKeyId}`;
        const tempCurrentKey = `retune_current_channel_build_tmp_v1:${tempKeyId}`;
        const builder = new ChannelManager({
            plexLibrary: plexLibrary,
            storageKey: tempKey,
            currentChannelKey: tempCurrentKey,
            logger: {
                warn: (msg, ...args): void => console.warn(msg, ...args.map(summarizeErrorForLog)),
                error: (msg, ...args): void => console.error(msg, ...args.map(summarizeErrorForLog)),
            },
        });

        const finalSummary: ChannelBuildSummary = {
            created: 0,
            skipped: skippedCount,
            reachedMaxChannels: false,
            errorCount: errorsTotal,
            canceled: false,
            lastTask: 'Initializing...',
        };

        try {
            const createStart = Date.now();
            let pIndex = 0;
            for (const p of pending) {
                pIndex++;
                if (finalSummary.created >= effectiveMaxChannels) {
                    finalSummary.reachedMaxChannels = true;
                    break;
                }

                if (checkCanceled()) {
                    finalSummary.canceled = true;
                    finalSummary.lastTask = 'create_channels';
                    return finalSummary;
                }

                if (pIndex % 5 === 0) {
                    reportProgress('create_channels', 'Creating channels...', `Channel ${finalSummary.created + 1}`, pIndex, pending.length);
                }

                try {
                    const channelParams: Partial<ChannelConfig> = {
                        name: p.name,
                        contentSource: p.contentSource,
                        playbackMode: p.playbackMode,
                        shuffleSeed: p.shuffleSeed,
                    };
                    if (p.contentFilters) {
                        channelParams.contentFilters = p.contentFilters;
                    }

                    await builder.createChannel(channelParams, { signal: signal ?? null });

                    finalSummary.created++;
                } catch (e) {
                    if (isAbortLike(e, signal)) {
                        finalSummary.canceled = true;
                        finalSummary.lastTask = 'create_channels';
                        return finalSummary;
                    }
                    console.warn(`Failed to create channel ${p.name}:`, summarizeErrorForLog(e));
                    finalSummary.errorCount++;
                }
            }
            createChannelsMs += Date.now() - createStart;

            if (checkCanceled()) {
                finalSummary.canceled = true;
                finalSummary.lastTask = 'apply_channels';
                return finalSummary;
            }

            reportProgress('apply_channels', 'Saving...', 'Saving library', finalSummary.created, finalSummary.created);
            const applyStart = Date.now();
            await channelManager.replaceAllChannels(builder.getAllChannels());
            applyChannelsMs += Date.now() - applyStart;

            reportProgress('refresh_epg', 'Refreshing guide...', 'Loading schedules', 0, null);
            this.deps.primeEpgChannels();
            const refreshStart = Date.now();
            await this.deps.refreshEpgSchedules();
            refreshEpgMs += Date.now() - refreshStart;

        } catch (e) {
            console.error('[ChannelSetup] Channel build failed:', summarizeErrorForLog(e));
            throw e;
        } finally {
            const totalMs = Date.now() - buildStartMs;
            console.warn('[ChannelSetup] Timing:', {
                totalMs,
                libraryFetchMs,
                playlistMs,
                collectionsMs,
                libraryQueryMs,
                createChannelsMs,
                applyChannelsMs,
                refreshEpgMs,
            });
            this.deps.storageRemove(tempKey);
            this.deps.storageRemove(tempCurrentKey);
        }

        reportProgress('done', 'Done!', `Built ${finalSummary.created} channels`, finalSummary.created, finalSummary.created);
        return finalSummary;
    }

    markSetupComplete(serverId: string, setupConfig: ChannelSetupConfig): void {
        const storageKey = this._getChannelSetupStorageKey(serverId);
        const existing = this._getChannelSetupRecord(serverId);
        const createdAt = existing?.createdAt ?? Date.now();
        const record: ChannelSetupRecord = {
            serverId,
            selectedLibraryIds: [...setupConfig.selectedLibraryIds],
            enabledStrategies: { ...setupConfig.enabledStrategies },
            maxChannels: setupConfig.maxChannels,
            minItemsPerChannel: setupConfig.minItemsPerChannel,
            createdAt,
            updatedAt: Date.now(),
        };
        this.deps.storageSet(storageKey, JSON.stringify(record));
        this._channelSetupRerunRequested = false;
    }

    requestChannelSetupRerun(): void {
        const serverId = this.deps.getSelectedServerId();
        if (!serverId) {
            console.warn('[Orchestrator] No server selected for setup rerun.');
            return;
        }
        this.deps.storageRemove(this._getChannelSetupStorageKey(serverId));
        this._channelSetupRerunRequested = true;
        const navigation = this.deps.getNavigation();
        if (navigation) {
            navigation.goTo('channel-setup');
        }
    }

    // --- Used by InitializationCoordinator + NavigationCoordinator ---
    shouldRunChannelSetup(): boolean {
        const channelManager = this.deps.getChannelManager();
        if (!channelManager) {
            return false;
        }
        const serverId = this.deps.getSelectedServerId();
        if (!serverId) {
            return false;
        }
        if (this._channelSetupRerunRequested) {
            return true;
        }
        if (channelManager.getAllChannels().length === 0) {
            return true;
        }
        const record = this._getChannelSetupRecord(serverId);
        return record === null;
    }

    // --- Called during initialize to clean up crash leftovers ---
    cleanupStaleChannelBuildKeys(): void {
        try {
            const prefixes = [
                'retune_channels_build_tmp_v1:',
                'retune_current_channel_build_tmp_v1:',
            ];
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k) continue;
                if (prefixes.some((p) => k.startsWith(p))) {
                    keysToRemove.push(k);
                }
            }
            for (const k of keysToRemove) {
                try {
                    localStorage.removeItem(k);
                } catch {
                    // ignore
                }
            }
        } catch {
            // ignore
        }
    }

    private _getChannelSetupStorageKey(serverId: string): string {
        return `retune_channel_setup_v1:${serverId}`;
    }

    private _getChannelSetupRecord(serverId: string): ChannelSetupRecord | null {
        const stored = this.deps.storageGet(this._getChannelSetupStorageKey(serverId));
        if (!stored) {
            return null;
        }
        try {
            const parsed = JSON.parse(stored) as Partial<ChannelSetupRecord>;
            if (!parsed || parsed.serverId !== serverId) {
                return null;
            }
            if (
                !Array.isArray(parsed.selectedLibraryIds) ||
                !parsed.selectedLibraryIds.every((id) => typeof id === 'string')
            ) {
                return null;
            }
            const strategies = parsed.enabledStrategies;
            if (!strategies || typeof strategies !== 'object') {
                return null;
            }

            const requiredKeys: Array<keyof ChannelSetupConfig['enabledStrategies']> = [
                'collections',
                'libraryFallback',
                'playlists',
                'genres',
                'directors',
                'decades',
                'runtimeRanges',
            ];
            for (const key of requiredKeys) {
                if (typeof (strategies as Record<string, unknown>)[key] !== 'boolean') {
                    return null;
                }
            }

            if (typeof parsed.createdAt !== 'number' || !Number.isFinite(parsed.createdAt)) {
                return null;
            }
            if (typeof parsed.updatedAt !== 'number' || !Number.isFinite(parsed.updatedAt)) {
                return null;
            }
            const maxChannels = typeof parsed.maxChannels === 'number' && Number.isFinite(parsed.maxChannels)
                ? parsed.maxChannels
                : DEFAULT_CHANNEL_SETUP_MAX;
            const minItemsPerChannel = typeof parsed.minItemsPerChannel === 'number' && Number.isFinite(parsed.minItemsPerChannel)
                ? parsed.minItemsPerChannel
                : 10;

            return {
                serverId: parsed.serverId,
                selectedLibraryIds: parsed.selectedLibraryIds,
                enabledStrategies: strategies as ChannelSetupConfig['enabledStrategies'],
                maxChannels,
                minItemsPerChannel,
                createdAt: parsed.createdAt,
                updatedAt: parsed.updatedAt,
            };
        } catch {
            return null;
        }
    }

    private _hashSeed(value: string): number {
        let hash = 2166136261;
        for (let i = 0; i < value.length; i++) {
            hash ^= value.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }
}

function summarizeErrorForLog(error: unknown): { name?: string; code?: unknown; message?: string } {
    if (!error || typeof error !== 'object') return {};
    const e = error as { name?: unknown; code?: unknown; message?: unknown };
    return {
        ...(typeof e.name === 'string' ? { name: e.name } : {}),
        ...('code' in e ? { code: e.code } : {}),
        ...(typeof e.message === 'string' ? { message: redactSensitiveTokens(e.message) } : {}),
    };
}

function redactSensitiveTokens(value: string): string {
    return value
        .replace(/X-Plex-Token=[^&\s]*/gi, 'X-Plex-Token=REDACTED')
        .replace(/access_token=[^&\s]*/gi, 'access_token=REDACTED')
        .replace(/\btoken=[^&\s]*/gi, 'token=REDACTED');
}

function isAbortLike(error: unknown, signal?: AbortSignal): boolean {
    if (signal?.aborted) return true;
    if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') return true;
    if (error && typeof error === 'object' && 'name' in error) {
        const namedError = error as { name?: unknown };
        if (namedError.name === 'AbortError') return true;
    }
    return false;
}
