import { ChannelManager } from '../../modules/scheduler/channel-manager';
import type { IChannelManager, ChannelConfig } from '../../modules/scheduler/channel-manager';
import type { IPlexLibrary, PlexLibraryType, PlexMediaItem, LibraryQueryOptions, PlexTagDirectoryItem, PlexPlaylist, PlexCollection } from '../../modules/plex/library';
import { PLEX_MEDIA_TYPES } from '../../modules/plex/library';
import type { INavigationManager } from '../../modules/navigation';
import type { AppError } from '../../modules/lifecycle';
import { DEFAULT_CHANNEL_SETUP_MAX, MAX_CHANNELS, MAX_CHANNEL_NUMBER } from '../../modules/scheduler/channel-manager/constants';

import type {
    ChannelSetupConfig,
    ChannelBuildSummary,
    ChannelBuildProgress,
    ChannelSetupRecord,
    ChannelSetupPreview,
    ChannelSetupReview,
} from './types';
import {
    buildChannelSetupPlan,
    diffChannelPlans,
    createChannelIdentityKey,
    type PendingChannel,
    type ChannelDiffResult,
} from './ChannelSetupPlanner';

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

    getSetupRecord(serverId: string): ChannelSetupRecord | null {
        return this._getChannelSetupRecord(serverId);
    }

    async getSetupPreview(
        config: ChannelSetupConfig,
        options?: { signal?: AbortSignal }
    ): Promise<ChannelSetupPreview> {
        const normalizedConfig = this._normalizeConfig(config);
        const libraries = await this.getLibrariesForSetup(options?.signal ?? null);
        const planResult = await this._buildSetupPlan(normalizedConfig, libraries, options?.signal ?? null);
        if (planResult.canceled || !planResult.plan) {
            return {
                estimates: this._emptyEstimates(),
                warnings: [],
                reachedMaxChannels: false,
            };
        }
        return {
            estimates: planResult.plan.estimates,
            warnings: planResult.plan.warnings,
            reachedMaxChannels: planResult.plan.reachedMaxChannels,
        };
    }

    async getSetupReview(
        config: ChannelSetupConfig,
        options?: { signal?: AbortSignal }
    ): Promise<ChannelSetupReview> {
        const channelManager = this.deps.getChannelManager();
        if (!channelManager) {
            throw new Error('Channel manager not initialized');
        }
        const normalizedConfig = this._normalizeConfig(config);
        const libraries = await this.getLibrariesForSetup(options?.signal ?? null);
        const planResult = await this._buildSetupPlan(normalizedConfig, libraries, options?.signal ?? null);
        if (planResult.canceled || !planResult.plan) {
            return {
                preview: { estimates: this._emptyEstimates(), warnings: [], reachedMaxChannels: false },
                diff: { summary: { created: 0, removed: 0, unchanged: 0 }, samples: { created: [], removed: [], unchanged: [] } },
            };
        }
        const existingChannels = channelManager.getAllChannels();
        const diff = diffChannelPlans(existingChannels, planResult.plan.pendingChannels);
        const normalizedDiff = this._normalizeDiffForMode(diff, normalizedConfig.buildMode);
        return {
            preview: {
                estimates: planResult.plan.estimates,
                warnings: planResult.plan.warnings,
                reachedMaxChannels: planResult.plan.reachedMaxChannels,
            },
            diff: normalizedDiff,
        };
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
            if (isAbortLike(e, signal ?? undefined)) {
                reportProgress('fetch_playlists', 'Preparing...', 'Canceled', 0, null);
                return { created: 0, skipped: 0, reachedMaxChannels: false, errorCount: 0, canceled: true, lastTask: 'fetch_playlists' };
            }
            throw e;
        }
        const normalizedConfig = this._normalizeConfig(config);
        const planResult = await this._buildSetupPlan(normalizedConfig, libraries, signal ?? null, reportProgress);
        playlistMs += planResult.playlistMs;
        collectionsMs += planResult.collectionsMs;
        libraryQueryMs += planResult.libraryQueryMs;

        if (planResult.canceled || !planResult.plan) {
            return {
                created: 0,
                skipped: 0,
                reachedMaxChannels: false,
                errorCount: planResult.errorsTotal,
                canceled: true,
                lastTask: planResult.lastTask ?? 'build_pending',
            };
        }

        let errorsTotal = planResult.errorsTotal;
        const pending = planResult.plan.pendingChannels;
        let skippedCount = planResult.plan.skipped;
        let reachedMax = planResult.plan.reachedMaxChannels;

        if (checkCanceled()) {
            return { created: 0, skipped: skippedCount, reachedMaxChannels: reachedMax, errorCount: errorsTotal, canceled: true, lastTask: 'build_pending' };
        }

        const existingChannels = channelManager.getAllChannels();
        const diff = diffChannelPlans(existingChannels, pending);
        const pendingToCreate = this._getPendingChannelsForMode(normalizedConfig.buildMode, pending, diff);

        reportProgress('create_channels', 'Shuffling...', 'Setting up lineup', 0, pendingToCreate.length);

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
            const buildMode = normalizedConfig.buildMode ?? 'replace';
            const availableNumbers = buildMode === 'replace'
                ? []
                : this._getAvailableChannelNumbers(existingChannels);

            if (buildMode !== 'replace' && pendingToCreate.length > availableNumbers.length) {
                reachedMax = true;
            }

            const maxCreates = buildMode === 'replace'
                ? pendingToCreate.length
                : Math.min(pendingToCreate.length, availableNumbers.length);

            for (const p of pendingToCreate) {
                pIndex++;
                if (finalSummary.created >= maxCreates) {
                    break;
                }

                if (checkCanceled()) {
                    finalSummary.canceled = true;
                    finalSummary.lastTask = 'create_channels';
                    return finalSummary;
                }

                if (pIndex % 5 === 0) {
                    reportProgress('create_channels', 'Creating channels...', `Channel ${finalSummary.created + 1}`, pIndex, pendingToCreate.length);
                }

                try {
                    const channelParams: Partial<ChannelConfig> = {
                        name: p.name,
                        contentSource: p.contentSource,
                        playbackMode: p.playbackMode,
                        shuffleSeed: p.shuffleSeed,
                        isAutoGenerated: p.isAutoGenerated === true,
                    };
                    if (p.contentFilters) {
                        channelParams.contentFilters = p.contentFilters;
                    }
                    if (p.sortOrder) {
                        channelParams.sortOrder = p.sortOrder;
                    }
                    if (buildMode !== 'replace') {
                        const nextNumber = availableNumbers.shift();
                        if (!nextNumber) {
                            reachedMax = true;
                            break;
                        }
                        channelParams.number = nextNumber;
                    }

                    await builder.createChannel(channelParams, { signal: signal ?? null });

                    finalSummary.created++;
                } catch (e) {
                    if (isAbortLike(e, signal ?? undefined)) {
                        finalSummary.canceled = true;
                        finalSummary.lastTask = 'create_channels';
                        return finalSummary;
                    }
                    console.warn(`Failed to create channel ${p.name}:`, summarizeErrorForLog(e));
                    finalSummary.errorCount++;
                }
            }
            createChannelsMs += Date.now() - createStart;
            finalSummary.reachedMaxChannels = reachedMax;

            if (checkCanceled()) {
                finalSummary.canceled = true;
                finalSummary.lastTask = 'apply_channels';
                return finalSummary;
            }

            reportProgress('apply_channels', 'Saving...', 'Saving library', finalSummary.created, finalSummary.created);
            const applyStart = Date.now();
            const builtChannels = builder.getAllChannels();
            let finalChannels = builtChannels;
            if (buildMode === 'append') {
                finalChannels = [...existingChannels, ...builtChannels];
            } else if (buildMode === 'merge') {
                const mergedExisting = this._mergeExistingChannels(existingChannels, diff);
                finalChannels = [...mergedExisting, ...builtChannels];
            }
            await channelManager.replaceAllChannels(finalChannels);
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
        const normalizedConfig = this._normalizeConfig(setupConfig);
        const record: ChannelSetupRecord = {
            serverId,
            selectedLibraryIds: [...normalizedConfig.selectedLibraryIds],
            enabledStrategies: { ...normalizedConfig.enabledStrategies },
            maxChannels: normalizedConfig.maxChannels,
            buildMode: normalizedConfig.buildMode,
            actorStudioCombineMode: normalizedConfig.actorStudioCombineMode,
            minItemsPerChannel: normalizedConfig.minItemsPerChannel,
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
            // Direct localStorage enumeration is intentional: deps only support single-key ops.
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

    private _normalizeConfig(config: ChannelSetupConfig): ChannelSetupConfig {
        const maxChannels = Number.isFinite(config.maxChannels)
            ? Math.min(Math.max(Math.floor(config.maxChannels), 1), MAX_CHANNELS)
            : DEFAULT_CHANNEL_SETUP_MAX;
        const minItemsPerChannel = Number.isFinite(config.minItemsPerChannel)
            ? Math.max(1, Math.floor(config.minItemsPerChannel))
            : 10;
        const buildMode = config.buildMode ?? 'replace';
        const actorStudioCombineMode = config.actorStudioCombineMode ?? 'separate';
        return {
            ...config,
            maxChannels,
            minItemsPerChannel,
            buildMode,
            actorStudioCombineMode,
            enabledStrategies: {
                ...config.enabledStrategies,
                recentlyAdded: Boolean(config.enabledStrategies.recentlyAdded),
                studios: Boolean(config.enabledStrategies.studios),
                actors: Boolean(config.enabledStrategies.actors),
            },
        };
    }

    private _emptyEstimates(): ChannelSetupPreview['estimates'] {
        return {
            total: 0,
            collections: 0,
            libraryFallback: 0,
            playlists: 0,
            genres: 0,
            directors: 0,
            decades: 0,
            recentlyAdded: 0,
            studios: 0,
            actors: 0,
        };
    }

    private _normalizeDiffForMode(
        diff: ChannelDiffResult,
        buildMode: ChannelSetupConfig['buildMode']
    ): ChannelSetupReview['diff'] {
        if (buildMode === 'replace') {
            return {
                summary: diff.summary,
                samples: diff.samples,
            };
        }
        const unchanged = [...diff.unchanged, ...diff.removed];
        const summary = {
            created: diff.created.length,
            removed: 0,
            unchanged: unchanged.length,
        };
        const samples = {
            created: diff.created.slice(0, 6).map((c) => c.name),
            removed: [],
            unchanged: unchanged.slice(0, 6).map((c) => c.name),
        };
        return { summary, samples };
    }

    private async _buildSetupPlan(
        config: ChannelSetupConfig,
        libraries: PlexLibraryType[],
        signal: AbortSignal | null,
        reportProgress?: (
            task: ChannelBuildProgress['task'],
            label: string,
            detail: string,
            current: number,
            total: number | null
        ) => void
    ): Promise<{
        plan: ReturnType<typeof buildChannelSetupPlan> | null;
        canceled: boolean;
        lastTask?: ChannelBuildProgress['task'];
        errorsTotal: number;
        playlistMs: number;
        collectionsMs: number;
        libraryQueryMs: number;
    }> {
        const plexLibrary = this.deps.getPlexLibrary();
        if (!plexLibrary) {
            throw new Error('PlexLibrary not initialized');
        }

        const checkCanceled = (): boolean => signal?.aborted ?? false;
        const warnings = new Set<string>();
        const selectedLibraries = libraries.filter((lib) => config.selectedLibraryIds.includes(lib.id));

        let errorsTotal = 0;
        let playlistMs = 0;
        let collectionsMs = 0;
        let libraryQueryMs = 0;

        const playlists: PlexPlaylist[] = [];
        const collectionsByLibraryId = new Map<string, PlexCollection[]>();
        const tagItemsByLibraryId = new Map<string, PlexMediaItem[]>();
        const scanItemsByLibraryId = new Map<string, PlexMediaItem[]>();
        const libraryItemCountById = new Map<string, number | null>();
        const actorsByLibraryId = new Map<string, PlexTagDirectoryItem[]>();
        const studiosByLibraryId = new Map<string, PlexTagDirectoryItem[]>();

        if (config.enabledStrategies.playlists) {
            reportProgress?.('fetch_playlists', 'Fetching playlists...', 'Scanning server', 0, null);
            try {
                const playlistsStart = Date.now();
                const fetched = await plexLibrary.getPlaylists({ signal });
                playlistMs += Date.now() - playlistsStart;
                playlists.push(...fetched);
            } catch (e) {
                if (isAbortLike(e, signal ?? undefined)) {
                    return { plan: null, canceled: true, lastTask: 'fetch_playlists', errorsTotal, playlistMs, collectionsMs, libraryQueryMs };
                }
                console.warn('Failed to fetch playlists:', summarizeErrorForLog(e));
                errorsTotal++;
            }
        }

        const CHANNEL_SETUP_SCAN_LIMIT = 500;

        for (let libIndex = 0; libIndex < selectedLibraries.length; libIndex++) {
            const library = selectedLibraries[libIndex];
            if (!library) continue;
            if (checkCanceled()) {
                return { plan: null, canceled: true, lastTask: 'scan_library_items', errorsTotal, playlistMs, collectionsMs, libraryQueryMs };
            }

            if (config.enabledStrategies.collections) {
                reportProgress?.('fetch_collections', 'Fetching collections...', library.title, libIndex, selectedLibraries.length);
                try {
                    const collectionsStart = Date.now();
                    const collections = await plexLibrary.getCollections(library.id, { signal });
                    collectionsMs += Date.now() - collectionsStart;
                    collectionsByLibraryId.set(library.id, collections);
                } catch (e) {
                    if (isAbortLike(e, signal ?? undefined)) {
                        return { plan: null, canceled: true, lastTask: 'fetch_collections', errorsTotal, playlistMs, collectionsMs, libraryQueryMs };
                    }
                    console.warn(`Failed to fetch collections for library ${library.title}:`, summarizeErrorForLog(e));
                    errorsTotal++;
                    collectionsByLibraryId.set(library.id, []);
                }
            }

            if (config.enabledStrategies.libraryFallback) {
                let libraryCount: number | null = Number.isFinite(library.contentCount)
                    ? library.contentCount
                    : null;
                if (libraryCount === 0) {
                    try {
                        const countOptions: LibraryQueryOptions = { signal };
                        if (library.type === 'show') {
                            countOptions.filter = { type: PLEX_MEDIA_TYPES.EPISODE };
                        }
                        const countStart = Date.now();
                        libraryCount = await plexLibrary.getLibraryItemCount(library.id, countOptions);
                        libraryQueryMs += Date.now() - countStart;
                    } catch (e) {
                        if (isAbortLike(e, signal ?? undefined)) {
                            return { plan: null, canceled: true, lastTask: 'scan_library_items', errorsTotal, playlistMs, collectionsMs, libraryQueryMs };
                        }
                        console.warn(`Failed to fetch item count for ${library.title}:`, summarizeErrorForLog(e));
                        errorsTotal++;
                        libraryCount = null;
                    }
                }
                libraryItemCountById.set(library.id, libraryCount);
            }

            if (config.enabledStrategies.genres || config.enabledStrategies.directors || config.enabledStrategies.decades) {
                reportProgress?.('scan_library_items', 'Resolving filters...', library.title, libIndex, selectedLibraries.length);
                try {
                    const scanOptions: LibraryQueryOptions = {
                        signal,
                        limit: CHANNEL_SETUP_SCAN_LIMIT,
                    };

                    let tagItems: PlexMediaItem[] = [];
                    let scanItems: PlexMediaItem[] = [];

                    if (library.type === 'show') {
                        if (config.enabledStrategies.genres || config.enabledStrategies.directors) {
                            const tagOptions: LibraryQueryOptions = {
                                signal,
                                limit: CHANNEL_SETUP_SCAN_LIMIT,
                                filter: { type: PLEX_MEDIA_TYPES.SHOW },
                            };
                            const tagStart = Date.now();
                            tagItems = await plexLibrary.getLibraryItems(library.id, tagOptions);
                            libraryQueryMs += Date.now() - tagStart;
                        }
                        if (config.enabledStrategies.decades) {
                            const episodeOptions: LibraryQueryOptions = {
                                signal,
                                limit: CHANNEL_SETUP_SCAN_LIMIT,
                                filter: { type: PLEX_MEDIA_TYPES.EPISODE },
                            };
                            const scanStart = Date.now();
                            scanItems = await plexLibrary.getLibraryItems(library.id, episodeOptions);
                            libraryQueryMs += Date.now() - scanStart;
                        }
                    } else {
                        const scanStart = Date.now();
                        tagItems = await plexLibrary.getLibraryItems(library.id, scanOptions);
                        libraryQueryMs += Date.now() - scanStart;
                        scanItems = tagItems;
                    }

                    tagItemsByLibraryId.set(library.id, tagItems);
                    scanItemsByLibraryId.set(library.id, scanItems);
                } catch (e) {
                    if (isAbortLike(e, signal ?? undefined)) {
                        return { plan: null, canceled: true, lastTask: 'scan_library_items', errorsTotal, playlistMs, collectionsMs, libraryQueryMs };
                    }
                    console.warn(`Failed to scan items for ${library.title}:`, summarizeErrorForLog(e));
                    errorsTotal++;
                }
            }

            if (config.enabledStrategies.studios) {
                reportProgress?.('scan_library_items', 'Fetching studios...', library.title, libIndex, selectedLibraries.length);
                try {
                    const studiosStart = Date.now();
                    const studios = await plexLibrary.getStudios(library.id, {
                        type: library.type === 'movie' ? PLEX_MEDIA_TYPES.MOVIE : PLEX_MEDIA_TYPES.EPISODE,
                        signal,
                        onUnsupported: () => {
                            warnings.add('Studios endpoint not supported by this Plex server.');
                        },
                    });
                    libraryQueryMs += Date.now() - studiosStart;
                    studiosByLibraryId.set(library.id, studios);
                } catch (e) {
                    if (isAbortLike(e, signal ?? undefined)) {
                        return { plan: null, canceled: true, lastTask: 'scan_library_items', errorsTotal, playlistMs, collectionsMs, libraryQueryMs };
                    }
                    console.warn(`Failed to fetch studios for ${library.title}:`, summarizeErrorForLog(e));
                    errorsTotal++;
                }
            }

            if (config.enabledStrategies.actors) {
                reportProgress?.('scan_library_items', 'Fetching actors...', library.title, libIndex, selectedLibraries.length);
                try {
                    const actorsStart = Date.now();
                    const actors = await plexLibrary.getActors(library.id, {
                        type: library.type === 'movie' ? PLEX_MEDIA_TYPES.MOVIE : PLEX_MEDIA_TYPES.EPISODE,
                        signal,
                        onUnsupported: () => {
                            warnings.add('Actors endpoint not supported by this Plex server.');
                        },
                    });
                    libraryQueryMs += Date.now() - actorsStart;
                    actorsByLibraryId.set(library.id, actors);
                } catch (e) {
                    if (isAbortLike(e, signal ?? undefined)) {
                        return { plan: null, canceled: true, lastTask: 'scan_library_items', errorsTotal, playlistMs, collectionsMs, libraryQueryMs };
                    }
                    console.warn(`Failed to fetch actors for ${library.title}:`, summarizeErrorForLog(e));
                    errorsTotal++;
                }
            }
        }

        const plan = buildChannelSetupPlan({
            config,
            libraries,
            playlists,
            collectionsByLibraryId,
            tagItemsByLibraryId,
            scanItemsByLibraryId,
            libraryItemCountById,
            actorsByLibraryId,
            studiosByLibraryId,
            warnings: Array.from(warnings),
            seedFor: (value: string): number => this._hashSeed(value),
        });

        return { plan, canceled: false, errorsTotal, playlistMs, collectionsMs, libraryQueryMs };
    }

    private _getPendingChannelsForMode(
        buildMode: ChannelSetupConfig['buildMode'],
        pending: PendingChannel[],
        diff: ChannelDiffResult
    ): PendingChannel[] {
        if (buildMode === 'replace') {
            return pending;
        }
        const matchedCounts = new Map<string, number>();
        for (const pair of diff.matchedPairs) {
            const key = createChannelIdentityKey(pair.planned);
            matchedCounts.set(key, (matchedCounts.get(key) ?? 0) + 1);
        }
        const result: PendingChannel[] = [];
        for (const p of pending) {
            const key = createChannelIdentityKey(p);
            const remaining = matchedCounts.get(key) ?? 0;
            if (remaining > 0) {
                matchedCounts.set(key, remaining - 1);
                continue;
            }
            result.push(p);
        }
        return result;
    }

    private _getAvailableChannelNumbers(existingChannels: ChannelConfig[]): number[] {
        const used = new Set(existingChannels.map((channel) => channel.number));
        const available: number[] = [];
        for (let i = 1; i <= MAX_CHANNEL_NUMBER; i++) {
            if (!used.has(i)) {
                available.push(i);
            }
        }
        return available;
    }

    private _mergeExistingChannels(existingChannels: ChannelConfig[], diff: ChannelDiffResult): ChannelConfig[] {
        const plannedById = new Map<string, PendingChannel>();
        for (const pair of diff.matchedPairs) {
            plannedById.set(pair.existing.id, pair.planned);
        }
        return existingChannels.map((existing) => {
            const planned = plannedById.get(existing.id);
            if (!planned) {
                return existing;
            }
            return this._mergeChannel(existing, planned);
        });
    }

    private _mergeChannel(existing: ChannelConfig, planned: PendingChannel): ChannelConfig {
        const updated: ChannelConfig = {
            ...existing,
            contentSource: planned.contentSource,
            playbackMode: planned.playbackMode,
            shuffleSeed: planned.shuffleSeed,
            updatedAt: Date.now(),
        };
        if (planned.contentFilters) {
            updated.contentFilters = planned.contentFilters;
        } else {
            delete updated.contentFilters;
        }
        if (planned.sortOrder) {
            updated.sortOrder = planned.sortOrder;
        } else {
            delete updated.sortOrder;
        }
        if (existing.isAutoGenerated === true) {
            updated.name = planned.name;
        }
        return updated;
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

            const requiredKeys: Array<keyof Omit<ChannelSetupConfig['enabledStrategies'], 'recentlyAdded' | 'studios' | 'actors'>> = [
                'collections',
                'libraryFallback',
                'playlists',
                'genres',
                'directors',
                'decades',
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
            const buildMode = parsed.buildMode === 'append' || parsed.buildMode === 'merge'
                ? parsed.buildMode
                : 'replace';
            const actorStudioCombineMode = parsed.actorStudioCombineMode === 'combined'
                ? parsed.actorStudioCombineMode
                : 'separate';
            const enabledStrategies: ChannelSetupConfig['enabledStrategies'] = {
                collections: Boolean((strategies as Record<string, unknown>).collections),
                libraryFallback: Boolean((strategies as Record<string, unknown>).libraryFallback),
                playlists: Boolean((strategies as Record<string, unknown>).playlists),
                genres: Boolean((strategies as Record<string, unknown>).genres),
                directors: Boolean((strategies as Record<string, unknown>).directors),
                decades: Boolean((strategies as Record<string, unknown>).decades),
                recentlyAdded: Boolean((strategies as Record<string, unknown>).recentlyAdded),
                studios: Boolean((strategies as Record<string, unknown>).studios),
                actors: Boolean((strategies as Record<string, unknown>).actors),
            };

            return {
                serverId: parsed.serverId,
                selectedLibraryIds: parsed.selectedLibraryIds,
                enabledStrategies,
                maxChannels,
                buildMode,
                actorStudioCombineMode,
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
