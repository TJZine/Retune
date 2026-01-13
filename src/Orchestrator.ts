/**
 * @fileoverview Application Orchestrator - Central coordinator for all modules.
 * @module Orchestrator
 * @version 1.0.0
 *
 * Responsibilities:
 * - Module initialization in dependency order
 * - Cross-module event wiring
 * - State restoration on startup
 * - Error handling and recovery
 * - Channel switching and EPG management
 */

import {
    AppLifecycle,
    AppErrorCode,
    type IAppLifecycle,
    type AppError,
    type LifecycleAppError,
    type AppPhase,
    type LifecycleEventMap,
} from './modules/lifecycle';
import { AppMode, STORAGE_KEYS } from './types';
import {
    NavigationManager,
    type INavigationManager,
    type NavigationConfig,
    type Screen,
    type KeyEvent,
} from './modules/navigation';
import {
    PlexAuth,
    type IPlexAuth,
    type PlexAuthConfig,
    type PlexPinRequest,
} from './modules/plex/auth';
import {
    PlexServerDiscovery,
    type IPlexServerDiscovery,
    type PlexServer,
} from './modules/plex/discovery';
import {
    PlexLibrary,
    type IPlexLibrary,
    type PlexLibraryType,
    type PlexCollection,
    type PlexMediaItem,
    type PlexLibraryConfig,
} from './modules/plex/library';
import {
    PlexStreamResolver,
    type IPlexStreamResolver,
    type PlexStreamResolverConfig,
    type StreamDecision,
} from './modules/plex/stream';
import { MIME_TYPES } from './modules/plex/stream/constants'; // Fix Direct Play MIME types
import {
    ChannelManager,
    type IChannelManager,
    type ChannelManagerConfig,
    type ChannelConfig,
    type ResolvedChannelContent,
} from './modules/scheduler/channel-manager';
import {
    MAX_CHANNELS,
} from './modules/scheduler/channel-manager/constants';
import {
    ChannelScheduler,
    type IChannelScheduler,
    type ScheduledProgram,
    type ScheduleConfig,
    ShuffleGenerator,
    ScheduleCalculator,
} from './modules/scheduler/scheduler';
import {
    VideoPlayer,
    type IVideoPlayer,
    type VideoPlayerConfig,
    type StreamDescriptor,
    type PlaybackError,
    mapPlayerErrorCodeToAppErrorCode,
} from './modules/player';
import {
    EPGComponent,
    type IEPGComponent,
    type EPGConfig,
} from './modules/ui/epg';
import type { IDisposable } from './utils/interfaces';
import { createMulberry32 } from './utils/prng';
import { safeLocalStorageGet, safeLocalStorageRemove, safeLocalStorageSet } from './utils/storage';

// ============================================
// Types
// ============================================

/**
 * Module health status
 */
export interface ModuleStatus {
    id: string;
    name: string;
    status: 'pending' | 'initializing' | 'ready' | 'error' | 'disabled';
    loadTimeMs?: number;
    error?: AppError;
    /** Placeholder for future memory diagnostics (per-module RAM usage tracking) */
    memoryUsageMB?: number;
}

export interface ChannelSetupConfig {
    serverId: string;
    selectedLibraryIds: string[];
    enabledStrategies: {
        collections: boolean;
        libraryFallback: boolean;
        playlists: boolean;
        genres: boolean;
        directors: boolean;
    };
}

export interface ChannelBuildSummary {
    created: number;
    skipped: number;
    reachedMaxChannels: boolean;
    errorCount: number;
}

export interface ChannelSetupRecord extends ChannelSetupConfig {
    createdAt: number;
    updatedAt: number;
}

/**
 * Orchestrator configuration (module configs passed at initialization)
 */
export interface OrchestratorConfig {
    plexConfig: PlexAuthConfig;
    playerConfig: VideoPlayerConfig;
    navConfig: NavigationConfig;
    epgConfig: EPGConfig;
}

/**
 * Recovery action definition for error handling UI
 */
export interface ErrorRecoveryAction {
    label: string;
    action: () => void;
    isPrimary: boolean;
    requiresNetwork: boolean;
}

/**
 * Application Orchestrator Interface
 */
export interface IAppOrchestrator {
    initialize(config: OrchestratorConfig): Promise<void>;
    start(): Promise<void>;
    shutdown(): Promise<void>;
    getModuleStatus(): Map<string, ModuleStatus>;
    isReady(): boolean;
    getCurrentScreen(): Screen | null;
    onScreenChange(handler: (from: string, to: string) => void): IDisposable;
    switchToChannel(channelId: string): Promise<void>;
    switchToChannelByNumber(number: number): Promise<void>;
    openEPG(): void;
    closeEPG(): void;
    toggleEPG(): void;
    requestAuthPin(): Promise<PlexPinRequest>;
    pollForPin(pinId: number): Promise<PlexPinRequest>;
    cancelPin(pinId: number): Promise<void>;
    discoverServers(forceRefresh?: boolean): Promise<PlexServer[]>;
    selectServer(serverId: string): Promise<boolean>;
    clearSelectedServer(): void;
    getSelectedServerId(): string | null;
    getLibrariesForSetup(): Promise<PlexLibraryType[]>;
    createChannelsFromSetup(config: ChannelSetupConfig): Promise<ChannelBuildSummary>;
    markSetupComplete(serverId: string, setupConfig: ChannelSetupConfig): void;
    requestChannelSetupRerun(): void;
    handleGlobalError(error: AppError, context: string): void;
    registerErrorHandler(moduleId: string, handler: (error: AppError) => boolean): void;
    getRecoveryActions(errorCode: AppErrorCode): ErrorRecoveryAction[];
    toLifecycleAppError(error: AppError): LifecycleAppError;
    onLifecycleEvent<K extends keyof LifecycleEventMap>(
        event: K,
        handler: (payload: LifecycleEventMap[K]) => void
    ): IDisposable;
    getNavigation(): INavigationManager | null;
    toggleDemoMode(): void;
}

// Re-export AppErrorCode for consumers
export { AppErrorCode };

// ============================================
// Implementation
// ============================================

/**
 * AppOrchestrator - Central coordinator for all application modules.
 *
 * Manages:
 * - Module initialization in 5 phases
 * - Cross-module event wiring
 * - State restoration on startup
 * - Error handling with recovery actions
 * - Channel switching and EPG management
 */
export class AppOrchestrator implements IAppOrchestrator {
    private _lifecycle: IAppLifecycle | null = null;
    private _navigation: INavigationManager | null = null;
    private _plexAuth: IPlexAuth | null = null;
    private _plexDiscovery: IPlexServerDiscovery | null = null;
    private _plexLibrary: IPlexLibrary | null = null;
    private _plexStreamResolver: IPlexStreamResolver | null = null;
    private _channelManager: IChannelManager | null = null;
    private _scheduler: IChannelScheduler | null = null;
    private _videoPlayer: IVideoPlayer | null = null;
    private _epg: IEPGComponent | null = null;
    private _epgScheduleLoadToken = 0;
    private _activeScheduleDayKey: number | null = null;
    private _pendingDayRolloverDayKey: number | null = null;
    private _pendingDayRolloverTimer: ReturnType<typeof setTimeout> | null = null;
    private _epgInitPromise: Promise<void> | null = null;

    private _config: OrchestratorConfig | null = null;
    private _moduleStatus: Map<string, ModuleStatus> = new Map();
    private _errorHandlers: Map<string, (error: AppError) => boolean> = new Map();
    private _mode: AppMode = 'real';
    private _eventUnsubscribers: Array<() => void> = [];
    private _eventsWired: boolean = false;
    private _ready: boolean = false;
    private _isChannelSwitching: boolean = false;
    private _startupInProgress: boolean = false;
    private _startupQueuedPhase: (1 | 2 | 3 | 4 | 5) | null = null;
    private _startupQueuedWaiters: Array<() => void> = [];
    private _authResumeDisposable: IDisposable | null = null;
    private _serverResumeDisposable: IDisposable | null = null;
    private _channelSetupRerunRequested: boolean = false;

    // Playback fast-fail guard: prevents tight skip loops when all items fail to play.
    private _playbackFailureWindowStartMs: number = 0;
    private _playbackFailureCount: number = 0;
    private _playbackFailureTripped: boolean = false;
    private _playbackFailureWindowMs: number = 2000;
    private _playbackFailureTripCount: number = 3;

    // Playback fallback: when a Direct stream fails due to container/codec support, retry via HLS Direct Stream.
    private _currentProgramForPlayback: ScheduledProgram | null = null;
    private _currentStreamDescriptor: StreamDescriptor | null = null;
    private _directFallbackAttemptedForItemKey: Set<string> = new Set();
    private _streamRecoveryInProgress: boolean = false;

    constructor() {
        this._initializeModuleStatus();
    }

    /**
     * Initialize the orchestrator with configuration.
     * Creates all module instances but does not start them.
     * @param config - Configuration for all modules
     */
    async initialize(config: OrchestratorConfig): Promise<void> {
        this._config = config;

        // Load mode
        const storedMode = safeLocalStorageGet(STORAGE_KEYS.MODE);
        if (storedMode === 'demo') {
            this._mode = 'demo';
            console.warn('[Orchestrator] Running in DEMO MODE');
        } else if (storedMode === 'real') {
            this._mode = 'real';
        } else {
            if (storedMode !== null) {
                console.warn('[Orchestrator] Ignoring invalid persisted mode value:', storedMode);
            }
            this._mode = 'real';
        }

        this._cleanupStaleChannelBuildKeys();

        // Create module instances (not yet initialized)
        this._lifecycle = new AppLifecycle();
        this._navigation = new NavigationManager();
        this._plexAuth = new PlexAuth(config.plexConfig);
        this._plexDiscovery = new PlexServerDiscovery({
            getAuthHeaders: (): Record<string, string> => {
                if (this._plexAuth) {
                    return this._plexAuth.getAuthHeaders();
                }
                return {};
            },
        });

        // PlexLibrary needs config with accessors
        const plexLibraryConfig: PlexLibraryConfig = {
            getAuthHeaders: () => {
                if (this._plexAuth) {
                    return this._plexAuth.getAuthHeaders();
                }
                return {};
            },
            getServerUri: () => {
                if (this._plexDiscovery) {
                    return this._plexDiscovery.getServerUri();
                }
                return null;
            },
            getAuthToken: () => {
                if (this._plexAuth) {
                    const user = this._plexAuth.getCurrentUser();
                    return user ? user.token : null;
                }
                return null;
            },
        };
        this._plexLibrary = new PlexLibrary(plexLibraryConfig);

        // PlexStreamResolver needs config with accessors
        const streamResolverConfig: PlexStreamResolverConfig = {
            getAuthHeaders: () => {
                if (this._plexAuth) {
                    return this._plexAuth.getAuthHeaders();
                }
                return {};
            },
            getServerUri: () => {
                if (this._plexDiscovery) {
                    return this._plexDiscovery.getServerUri();
                }
                return null;
            },
            getSelectedConnection: () => {
                const conn = this._plexDiscovery?.getSelectedConnection() ?? null;
                if (!conn) return null;
                return { uri: conn.uri, local: conn.local, relay: conn.relay };
            },
            getHttpsConnection: () => {
                const conn = this._plexDiscovery?.getHttpsConnection() ?? null;
                if (conn) return { uri: conn.uri };
                return null;
            },
            getRelayConnection: () => {
                const conn = this._plexDiscovery?.getRelayConnection() ?? null;
                if (conn) return { uri: conn.uri };
                return null;
            },
            getItem: async (ratingKey: string) => {
                if (this._plexLibrary) {
                    return this._plexLibrary.getItem(ratingKey);
                }
                return null;
            },
            clientIdentifier: config.plexConfig.clientIdentifier,
        };
        this._plexStreamResolver = new PlexStreamResolver(streamResolverConfig);

        // ChannelManager needs config
        const channelManagerConfig: ChannelManagerConfig = {
            plexLibrary: this._plexLibrary,
            storageKey: this._mode === 'demo' ? STORAGE_KEYS.CHANNELS_DEMO : STORAGE_KEYS.CHANNELS_REAL,
            currentChannelKey: this._mode === 'demo' ? `${STORAGE_KEYS.CURRENT_CHANNEL}:demo` : STORAGE_KEYS.CURRENT_CHANNEL,
        };
        this._channelManager = new ChannelManager(channelManagerConfig);

        // ChannelScheduler - no init args
        this._scheduler = new ChannelScheduler();

        // VideoPlayer - no constructor args, initialize later
        this._videoPlayer = new VideoPlayer();

        // EPGComponent - no constructor args, initialize later
        this._epg = new EPGComponent();

        // Update status for all modules
        this._updateModuleStatus('event-emitter', 'ready');
    }

    /**
     * Start the application - execute initialization sequence and begin playback.
     * Follows 5-phase initialization order per spec.
     */
    async start(): Promise<void> {
        this._resetPlaybackFailureGuard();
        await this._runStartup(1);
    }

    /**
     * Shutdown the application gracefully.
     * Saves state, stops playback, and cleans up all resources.
     *
     * NOTE: The orchestrator follows a singleton lifecycle pattern.
     * After shutdown, the instance should be discarded. To restart,
     * create a new AppOrchestrator instance and call initialize() + start().
     * Internal state (_errorHandlers, _moduleStatus) is not reset because
     * instance reuse is not a supported pattern.
     */
    async shutdown(): Promise<void> {
        this._clearAuthResume();
        this._clearServerResume();

        if (this._pendingDayRolloverTimer !== null) {
            globalThis.clearTimeout(this._pendingDayRolloverTimer);
            this._pendingDayRolloverTimer = null;
        }
        this._pendingDayRolloverDayKey = null;

        // Unregister all event subscriptions (resilient to throwing handlers)
        for (const unsubscribe of this._eventUnsubscribers) {
            try {
                unsubscribe();
            } catch (e) {
                console.warn('[Orchestrator] unsubscribe failed:', e);
            }
        }
        this._eventUnsubscribers = [];
        this._eventsWired = false; // Reset to allow re-wiring on retry

        // Save state
        if (this._lifecycle) {
            await this._lifecycle.saveState();
        }

        // Stop playback (resilient to errors)
        if (this._videoPlayer) {
            try {
                this._videoPlayer.stop();
            } catch (e) {
                console.warn('[Orchestrator] stop failed:', e);
            }
        }

        // Stop scheduler timer
        if (this._scheduler) {
            this._scheduler.pauseSyncTimer();
            this._scheduler.unloadChannel();
        }

        // Destroy modules
        if (this._epg) {
            this._epg.destroy();
        }
        if (this._videoPlayer) {
            this._videoPlayer.destroy();
        }
        if (this._navigation) {
            this._navigation.destroy();
        }

        this._ready = false;
    }

    /**
     * Get the status of all modules.
     */
    getModuleStatus(): Map<string, ModuleStatus> {
        return new Map(this._moduleStatus);
    }

    /**
     * Check if the orchestrator is ready for operations.
     */
    isReady(): boolean {
        return this._ready;
    }

    getSelectedServerId(): string | null {
        return this._getSelectedServerId();
    }

    /**
     * Get the currently active navigation screen.
     */
    getCurrentScreen(): Screen | null {
        if (!this._navigation) {
            return null;
        }
        return this._navigation.getCurrentScreen();
    }

    /**
     * Get the navigation manager instance.
     */
    getNavigation(): INavigationManager | null {
        return this._navigation;
    }

    /**
     * Subscribe to navigation screen change events.
     */
    onScreenChange(handler: (from: string, to: string) => void): IDisposable {
        if (!this._navigation) {
            return { dispose: (): void => undefined };
        }
        const wrapped = (payload: { from: string; to: string }): void => {
            handler(payload.from, payload.to);
        };
        this._navigation.on('screenChange', wrapped);
        return {
            dispose: (): void => {
                if (this._navigation) {
                    this._navigation.off('screenChange', wrapped);
                }
            },
        };
    }

    /**
     * Request a Plex PIN for authentication.
     */
    async requestAuthPin(): Promise<PlexPinRequest> {
        if (this._mode === 'demo') {
            throw new Error('Demo Mode: Plex auth is disabled');
        }
        if (!this._plexAuth) {
            throw new Error('PlexAuth not initialized');
        }
        return this._plexAuth.requestPin();
    }

    /**
     * Poll for PIN claim status.
     */
    async pollForPin(pinId: number): Promise<PlexPinRequest> {
        if (this._mode === 'demo') {
            throw new Error('Demo Mode: Plex auth is disabled');
        }
        if (!this._plexAuth) {
            throw new Error('PlexAuth not initialized');
        }
        return this._plexAuth.pollForPin(pinId);
    }

    /**
     * Cancel an active PIN request.
     */
    async cancelPin(pinId: number): Promise<void> {
        if (this._mode === 'demo') {
            throw new Error('Demo Mode: Plex auth is disabled');
        }
        if (!this._plexAuth) {
            throw new Error('PlexAuth not initialized');
        }
        await this._plexAuth.cancelPin(pinId);
    }

    /**
     * Discover Plex servers (optionally forcing refresh).
     */
    async discoverServers(forceRefresh: boolean = false): Promise<PlexServer[]> {
        if (this._mode === 'demo') {
            throw new Error('Demo Mode: Plex discovery is disabled');
        }
        if (!this._plexDiscovery) {
            throw new Error('PlexServerDiscovery not initialized');
        }
        if (forceRefresh) {
            return this._plexDiscovery.refreshServers();
        }
        return this._plexDiscovery.discoverServers();
    }

    /**
     * Select a Plex server to connect to.
     */
    async selectServer(serverId: string): Promise<boolean> {
        if (this._mode === 'demo') {
            throw new Error('Demo Mode: Plex discovery is disabled');
        }
        if (!this._plexDiscovery) {
            throw new Error('PlexServerDiscovery not initialized');
        }
        const ok = await this._plexDiscovery.selectServer(serverId);
        if (ok) {
            // If we're already running (or resuming from the server-select screen),
            // re-run the channel/player/EPG phases to swap to the selected server.
            await this._runStartup(4);
            return this._ready;
        }
        return ok;
    }

    /**
     * Clear saved server selection.
     */
    clearSelectedServer(): void {
        if (this._mode === 'demo') {
            throw new Error('Demo Mode: Plex discovery is disabled');
        }
        if (!this._plexDiscovery) {
            throw new Error('PlexServerDiscovery not initialized');
        }
        this._plexDiscovery.clearSelection();
    }

    async getLibrariesForSetup(): Promise<PlexLibraryType[]> {
        if (this._mode === 'demo') {
            return [];
        }
        if (!this._plexLibrary) {
            throw new Error('PlexLibrary not initialized');
        }
        const libraries = await this._plexLibrary.getLibraries();
        return libraries.filter((lib) => lib.type === 'movie' || lib.type === 'show');
    }

    async createChannelsFromSetup(
        config: ChannelSetupConfig
    ): Promise<ChannelBuildSummary> {
        if (this._mode === 'demo') {
            throw new Error('Demo Mode: channel setup is disabled');
        }
        if (!this._channelManager || !this._plexLibrary) {
            throw new Error('Channel manager not initialized');
        }

        const libraries = await this.getLibrariesForSetup();
        const selectedLibraries = libraries
            .filter((lib) => config.selectedLibraryIds.includes(lib.id))
            .sort((a, b) => a.title.localeCompare(b.title));

        const previousChannels = this._channelManager.getAllChannels();
        const previousCurrent = this._channelManager.getCurrentChannel()?.id ?? null;

        let created = 0;
        let skippedLibraries = 0;
        let reachedMaxChannels = false;
        let errorCount = 0;
        const errors: string[] = [];

        const shuffleSeedFor = (value: string): number => this._hashSeed(value);
        const MAX_SCAN_ITEMS = 500;

        type PendingChannel = {
            name: string;
            contentSource: ChannelConfig['contentSource'];
            playbackMode: ChannelConfig['playbackMode'];
            shuffleSeed: number;
            contentFilters?: ChannelConfig['contentFilters'];
        };

        const pending: PendingChannel[] = [];

        if (config.enabledStrategies.playlists) {
            const playlists = await this._plexLibrary.getPlaylists();
            const sortedPlaylists = [...playlists].sort((a, b) => a.title.localeCompare(b.title));
            for (const playlist of sortedPlaylists) {
                pending.push({
                    name: `Playlist: ${playlist.title}`,
                    contentSource: {
                        type: 'playlist',
                        playlistKey: playlist.ratingKey,
                        playlistName: playlist.title,
                    },
                    playbackMode: 'shuffle',
                    shuffleSeed: shuffleSeedFor(`playlist:${playlist.ratingKey}`),
                });
            }
        }

        for (const library of selectedLibraries) {
            let collections: PlexCollection[] = [];
            if (config.enabledStrategies.collections) {
                collections = await this._plexLibrary.getCollections(library.id);
                collections.sort((a, b) => a.title.localeCompare(b.title));
            }

            if (collections.length > 0) {
                for (const collection of collections) {
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
                }
            } else if (config.enabledStrategies.libraryFallback) {
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
                skippedLibraries += 1;
            }

            if (config.enabledStrategies.genres || config.enabledStrategies.directors) {
                const items = await this._plexLibrary.getLibraryItems(library.id, { limit: MAX_SCAN_ITEMS });
                const uniqueGenres = config.enabledStrategies.genres
                    ? this._collectUniqueTags(items, 'genres')
                    : [];
                const uniqueDirectors = config.enabledStrategies.directors
                    ? this._collectUniqueTags(items, 'directors')
                    : [];

                for (const genre of uniqueGenres) {
                    if (pending.length >= MAX_CHANNELS) {
                        reachedMaxChannels = true;
                        break;
                    }
                    pending.push({
                        name: `${library.title} - ${genre}`,
                        contentSource: {
                            type: 'library',
                            libraryId: library.id,
                            libraryType: library.type === 'movie' ? 'movie' : 'show',
                            includeWatched: true,
                        },
                        contentFilters: [{ field: 'genre', operator: 'eq', value: genre }],
                        playbackMode: 'shuffle',
                        shuffleSeed: shuffleSeedFor(`genre:${library.id}:${genre}`),
                    });
                }

                for (const director of uniqueDirectors) {
                    if (pending.length >= MAX_CHANNELS) {
                        reachedMaxChannels = true;
                        break;
                    }
                    pending.push({
                        name: `${library.title} - ${director}`,
                        contentSource: {
                            type: 'library',
                            libraryId: library.id,
                            libraryType: library.type === 'movie' ? 'movie' : 'show',
                            includeWatched: true,
                        },
                        contentFilters: [{ field: 'director', operator: 'eq', value: director }],
                        playbackMode: 'shuffle',
                        shuffleSeed: shuffleSeedFor(`director:${library.id}:${director}`),
                    });
                }
            }
        }

        const tmpStorageKey = `retune_channels_build_tmp_v1:${Date.now()}:${Math.random().toString(16).slice(2)}`;
        const tmpCurrentKey = `retune_current_channel_build_tmp_v1:${Date.now()}:${Math.random().toString(16).slice(2)}`;
        const builder = new ChannelManager({
            plexLibrary: this._plexLibrary,
            storageKey: tmpStorageKey,
            currentChannelKey: tmpCurrentKey,
        });

        try {
            for (const ch of pending) {
                if (created >= MAX_CHANNELS) {
                    reachedMaxChannels = true;
                    break;
                }
                try {
                    const createConfig: Partial<ChannelConfig> = {
                        name: ch.name,
                        contentSource: ch.contentSource,
                        playbackMode: ch.playbackMode,
                        shuffleSeed: ch.shuffleSeed,
                    };
                    if (ch.contentFilters) {
                        createConfig.contentFilters = ch.contentFilters;
                    }
                    await builder.createChannel(createConfig);
                    created += 1;
                } catch (e) {
                    errorCount += 1;
                    if (errors.length < 5) {
                        errors.push(e instanceof Error ? e.message : 'Unknown channel creation error');
                    }
                    if (e instanceof Error && e.message === 'Maximum number of channels reached') {
                        reachedMaxChannels = true;
                        break;
                    }
                }
            }

            const builtChannels = builder.getAllChannels();
            if (builtChannels.length === 0) {
                return {
                    created: 0,
                    skipped: skippedLibraries + pending.length,
                    reachedMaxChannels,
                    errorCount,
                };
            }

            await this._channelManager.replaceAllChannels(builtChannels, { currentChannelId: builtChannels[0]?.id ?? null });
            this._primeEpgChannels();
            await this._refreshEpgSchedules();
        } catch (e) {
            console.error('[Orchestrator] Channel build failed; attempting rollback:', e);
            try {
                await this._channelManager.replaceAllChannels(previousChannels, { currentChannelId: previousCurrent });
            } catch (rollbackError) {
                console.error('[Orchestrator] Channel build rollback failed:', rollbackError);
            }
            throw e;
        } finally {
            builder.cancelPendingRetries();
            safeLocalStorageRemove(tmpStorageKey);
            safeLocalStorageRemove(tmpCurrentKey);
        }

        const skipped = skippedLibraries + Math.max(0, pending.length - created);
        if (errors.length > 0) {
            console.warn('[Orchestrator] Channel build errors (first few):', errors);
        }

        return { created, skipped, reachedMaxChannels, errorCount };
    }

    markSetupComplete(serverId: string, setupConfig: ChannelSetupConfig): void {
        const storageKey = this._getChannelSetupStorageKey(serverId);
        const existing = this._getChannelSetupRecord(serverId);
        const createdAt = existing?.createdAt ?? Date.now();
        const record: ChannelSetupRecord = {
            serverId,
            selectedLibraryIds: [...setupConfig.selectedLibraryIds],
            enabledStrategies: { ...setupConfig.enabledStrategies },
            createdAt,
            updatedAt: Date.now(),
        };
        safeLocalStorageSet(storageKey, JSON.stringify(record));
        this._channelSetupRerunRequested = false;
    }

    requestChannelSetupRerun(): void {
        const serverId = this._getSelectedServerId();
        if (!serverId) {
            console.warn('[Orchestrator] No server selected for setup rerun.');
            return;
        }
        safeLocalStorageRemove(this._getChannelSetupStorageKey(serverId));
        this._channelSetupRerunRequested = true;
        if (this._navigation) {
            this._navigation.goTo('channel-setup');
        }
    }

    /**
     * Switch to a channel by ID.
     * Stops current playback, resolves content, configures scheduler, and syncs.
     * @param channelId - ID of channel to switch to
     */
    async switchToChannel(channelId: string): Promise<void> {
        if (!this._channelManager || !this._scheduler || !this._videoPlayer) {
            console.error('Modules not initialized');
            return;
        }

        // New channel = new playback attempt; unblock any prior fast-fail guard.
        this._resetPlaybackFailureGuard();
        this._directFallbackAttemptedForItemKey.clear();

        // Prevent concurrent channel switches from causing state corruption
        if (this._isChannelSwitching) {
            console.warn('Channel switch already in progress, ignoring request');
            return;
        }

        this._isChannelSwitching = true;

        try {
            const channel = this._channelManager.getChannel(channelId);
            if (!channel) {
                console.error('Channel not found:', channelId);
                return;
            }

            // Resolve channel content BEFORE stopping player
            // This prevents blank screen if resolution fails
            let content: ResolvedChannelContent;
            try {
                content = await this._channelManager.resolveChannelContent(channelId);
            } catch (error) {
                console.error('Failed to resolve channel content:', error);
                // Report error but keep current playback running
                this.handleGlobalError(
                    {
                        code: AppErrorCode.CONTENT_UNAVAILABLE,
                        message: `Failed to switch to channel: ${channel.name}`,
                        recoverable: true,
                    },
                    'switchToChannel'
                );
                return;
            }

            // Only stop player after successful content resolution
            this._videoPlayer.stop();

            // Configure scheduler
            const scheduleConfig = this._buildDailyScheduleConfig(channel, content.items, Date.now());
            this._scheduler.loadChannel(scheduleConfig);
            this._activeScheduleDayKey = this._getLocalDayKey(Date.now());

            // Sync to current time (this will emit programStart)
            this._scheduler.syncToCurrentTime();

            // Update current channel
            this._channelManager.setCurrentChannel(channelId);

            // Save state
            if (this._lifecycle) {
                await this._lifecycle.saveState();
            }
        } finally {
            this._isChannelSwitching = false;
        }
    }

    /**
     * Switch to a channel by its number.
     * @param number - Channel number
     */
    async switchToChannelByNumber(number: number): Promise<void> {
        if (!this._channelManager) {
            console.error('Channel manager not initialized');
            return;
        }

        const channel = this._channelManager.getChannelByNumber(number);
        if (!channel) {
            this.handleGlobalError(
                {
                    code: AppErrorCode.CHANNEL_NOT_FOUND,
                    message: `Channel ${number} not found`,
                    recoverable: true,
                },
                'switchToChannelByNumber'
            );
            return;
        }

        await this.switchToChannel(channel.id);
    }

    /**
     * Open the EPG overlay.
     */
    openEPG(): void {
        if (!this._epg) {
            return;
        }

        // Prime data when EPG is already initialized.
        if (this._moduleStatus.get('epg-ui')?.status === 'ready') {
            this._primeEpgChannels();
            void this._refreshEpgSchedules();
        }

        const show = (): void => {
            this._epg?.show();
            this._epg?.focusNow();
        };

        // Allow EPG to be opened even before full app initialization completes
        // (e.g., during auth/server-select flows in the simulator).
        if (this._moduleStatus.get('epg-ui')?.status !== 'ready') {
            // Best-effort attempt immediately (helps in tests/mocks and if already initialized).
            show();
            void this._initPhase5()
                .then(() => {
                    this._primeEpgChannels();
                    void this._refreshEpgSchedules();
                    show();
                })
                .catch((error) => console.error('[Orchestrator] Failed to init EPG:', error));
            return;
        }

        show();
    }

    /**
     * Close the EPG overlay.
     */
    closeEPG(): void {
        if (this._epg) {
            this._epg.hide();
        }
    }

    /**
     * Open the server selection screen.
     */
    openServerSelect(): void {
        if (!this._navigation) {
            return;
        }
        if (this._mode === 'demo') {
            // Demo Mode must not navigate into Plex flows.
            this._navigation.goTo('player');
            return;
        }
        this._navigation.goTo('server-select');
    }

    /**
     * Toggle the server selection screen.
     */
    toggleServerSelect(): void {
        if (!this._navigation) {
            return;
        }

        const current = this._navigation.getCurrentScreen();
        if (this._mode === 'demo' && current !== 'server-select') {
            // In Demo Mode, allow closing server-select if already open, but never open it.
            return;
        }
        if (current === 'server-select') {
            // Attempt to go back; if stack is empty, force player
            if (!this._navigation.goBack()) {
                this._navigation.goTo('player');
            }
        } else {
            this.openServerSelect();
        }
    }

    /**
     * Toggle EPG visibility.
     */
    toggleEPG(): void {
        if (this._epg) {
            if (this._epg.isVisible()) {
                this.closeEPG();
            } else {
                this.openEPG();
            }
        }
    }

    private _primeEpgChannels(): void {
        if (!this._epg || !this._channelManager) {
            return;
        }
        if (this._moduleStatus.get('epg-ui')?.status !== 'ready') {
            return;
        }
        this._epg.loadChannels(this._channelManager.getAllChannels());
    }

    private _getEpgScheduleRangeMs(): { startTime: number; endTime: number } | null {
        if (!this._config) {
            return null;
        }
        const totalHours = this._config.epgConfig.totalHours;
        const slotMinutes = this._config.epgConfig.timeSlotMinutes;
        const slotMs = slotMinutes * 60_000;
        const PAST_WINDOW_MINUTES = 30;
        const now = Date.now();
        const dayStart = this._getLocalMidnightMs(now);
        const startTime = Math.max(
            Math.floor((now - (PAST_WINDOW_MINUTES * 60_000)) / slotMs) * slotMs,
            dayStart
        );
        const endTime = startTime + totalHours * 60 * 60 * 1000;

        return { startTime, endTime };
    }

    private async _refreshEpgSchedules(): Promise<void> {
        if (!this._epg || !this._channelManager) {
            return;
        }
        if (this._moduleStatus.get('epg-ui')?.status !== 'ready') {
            return;
        }

        const range = this._getEpgScheduleRangeMs();
        if (!range) {
            return;
        }

        const { startTime, endTime } = range;
        this._epg.setGridAnchorTime(startTime);
        const channels = this._channelManager.getAllChannels();
        if (channels.length === 0) {
            return;
        }

        const loadToken = ++this._epgScheduleLoadToken;
        const shuffler = new ShuffleGenerator();

        // Safety limit to avoid long blocking loops on TV hardware.
        const MAX_CHANNELS_TO_PRELOAD = 100;
        const channelsToLoad = channels.slice(0, MAX_CHANNELS_TO_PRELOAD);

        for (const channel of channelsToLoad) {
            if (loadToken !== this._epgScheduleLoadToken) {
                return;
            }
            try {
                const resolved = await this._channelManager.resolveChannelContent(channel.id);

                const scheduleConfig = this._buildDailyScheduleConfig(channel, resolved.items, startTime);

                const index = ScheduleCalculator.buildScheduleIndex(scheduleConfig, shuffler);
                const programs = ScheduleCalculator.generateScheduleWindow(
                    startTime,
                    endTime,
                    index,
                    scheduleConfig.anchorTime
                );

                this._epg.loadScheduleForChannel(channel.id, { startTime, endTime, programs });
            } catch (error) {
                console.warn('[Orchestrator] Failed to build EPG schedule for channel:', channel.id, error);
            }
        }

        if (
            loadToken === this._epgScheduleLoadToken &&
            this._epg.isVisible() &&
            !this._epg.getFocusedProgram()
        ) {
            this._epg.focusNow();
        }
    }

    /**
     * Handle a global application error.
     * Routes to module-specific handlers first, then reports via lifecycle.
     * @param error - The error to handle
     * @param context - Module or operation context
     */
    handleGlobalError(error: AppError, context: string): void {
        console.error(`[${context}] Error:`, error.code, error.message);

        // Try module-specific handlers first
        for (const [moduleId, handler] of this._errorHandlers) {
            try {
                const handled = handler(error);
                if (handled) {
                    console.warn(`Error handled by ${moduleId}`);
                    return;
                }
            } catch (handlerError) {
                console.error(`Error in handler for ${moduleId}:`, handlerError);
            }
        }

        // Report via lifecycle for UI display
        if (this._lifecycle) {
            this._lifecycle.reportError(error);
        }
    }

    /**
     * Register a module-specific error handler.
     * @param moduleId - Module identifier
     * @param handler - Handler function, returns true if handled
     */
    registerErrorHandler(
        moduleId: string,
        handler: (error: AppError) => boolean
    ): void {
        this._errorHandlers.set(moduleId, handler);
    }

    /**
     * Get recovery actions for a specific error code.
     * Covers all AppErrorCode values per spec.
     * @param errorCode - Error code to get actions for
     */
    getRecoveryActions(errorCode: AppErrorCode): ErrorRecoveryAction[] {
        const actions: ErrorRecoveryAction[] = [];

        switch (errorCode) {
            // Auth errors -> Sign In
            case AppErrorCode.AUTH_REQUIRED:
            case AppErrorCode.AUTH_EXPIRED:
            case AppErrorCode.AUTH_INVALID:
            case AppErrorCode.AUTH_FAILED:
                actions.push({
                    label: 'Sign In',
                    action: (): void => {
                        if (this._navigation) {
                            this._navigation.goTo('auth');
                        }
                    },
                    isPrimary: true,
                    requiresNetwork: true,
                });
                break;

            // Network errors -> Retry + Exit
            case AppErrorCode.AUTH_RATE_LIMITED:
            case AppErrorCode.NETWORK_TIMEOUT:
            case AppErrorCode.NETWORK_OFFLINE:
            case AppErrorCode.NETWORK_UNAVAILABLE:
            case AppErrorCode.RATE_LIMITED:
                actions.push({
                    label: 'Retry',
                    action: (): void => {
                        this.start().catch(console.error);
                    },
                    isPrimary: true,
                    requiresNetwork: true,
                });
                actions.push({
                    label: 'Exit',
                    action: (): void => {
                        this.shutdown().catch(console.error);
                    },
                    isPrimary: false,
                    requiresNetwork: false,
                });
                break;

            // Server errors -> Select Server + Retry
            case AppErrorCode.SERVER_UNREACHABLE:
            case AppErrorCode.SERVER_SSL_ERROR:
            case AppErrorCode.MIXED_CONTENT_BLOCKED:
            case AppErrorCode.SERVER_ERROR:
            case AppErrorCode.PLEX_UNREACHABLE:
                actions.push({
                    label: 'Select Server',
                    action: (): void => {
                        if (this._navigation) {
                            this._navigation.goTo('server-select');
                        }
                    },
                    isPrimary: true,
                    requiresNetwork: true,
                });
                actions.push({
                    label: 'Retry',
                    action: (): void => {
                        this.start().catch(console.error);
                    },
                    isPrimary: false,
                    requiresNetwork: true,
                });
                break;

            // Playback errors -> Skip
            case AppErrorCode.PLAYBACK_FAILED:
            case AppErrorCode.PLAYBACK_DECODE_ERROR:
            case AppErrorCode.PLAYBACK_FORMAT_UNSUPPORTED:
                actions.push({
                    label: 'Skip',
                    action: (): void => {
                        if (this._scheduler) {
                            this._scheduler.skipToNext();
                        }
                    },
                    isPrimary: true,
                    requiresNetwork: false,
                });
                break;

            // Channel/content errors -> Edit Channels
            case AppErrorCode.CHANNEL_NOT_FOUND:
            case AppErrorCode.SCHEDULER_EMPTY_CHANNEL:
            case AppErrorCode.CONTENT_UNAVAILABLE:
            case AppErrorCode.RESOURCE_NOT_FOUND:
                actions.push({
                    label: 'Edit Channels',
                    action: (): void => {
                        if (this._navigation) {
                            this._navigation.goTo('channel-edit');
                        }
                    },
                    isPrimary: true,
                    requiresNetwork: false,
                });
                break;

            // Storage errors -> Settings (clear cache)
            case AppErrorCode.STORAGE_QUOTA_EXCEEDED:
            case AppErrorCode.STORAGE_CORRUPTED:
            case AppErrorCode.DATA_CORRUPTION:
                actions.push({
                    label: 'Clear Data',
                    action: (): void => {
                        if (this._navigation) {
                            this._navigation.goTo('settings');
                        }
                    },
                    isPrimary: true,
                    requiresNetwork: false,
                });
                actions.push({
                    label: 'Retry',
                    action: (): void => {
                        this.start().catch(console.error);
                    },
                    isPrimary: false,
                    requiresNetwork: false,
                });
                break;

            // Initialization errors -> Retry + Exit
            case AppErrorCode.INITIALIZATION_FAILED:
            case AppErrorCode.MODULE_INIT_FAILED:
            case AppErrorCode.OUT_OF_MEMORY:
                actions.push({
                    label: 'Retry',
                    action: (): void => {
                        this.start().catch(console.error);
                    },
                    isPrimary: true,
                    requiresNetwork: true,
                });
                actions.push({
                    label: 'Exit',
                    action: (): void => {
                        this.shutdown().catch(console.error);
                    },
                    isPrimary: false,
                    requiresNetwork: false,
                });
                break;

            // Unrecoverable errors -> Exit only
            case AppErrorCode.UNRECOVERABLE:
                actions.push({
                    label: 'Exit',
                    action: (): void => {
                        this.shutdown().catch(console.error);
                    },
                    isPrimary: true,
                    requiresNetwork: false,
                });
                break;

            // Unknown/default -> Dismiss
            case AppErrorCode.UNKNOWN:
            default:
                actions.push({
                    label: 'Dismiss',
                    action: (): void => {
                        // No-op - just dismiss
                    },
                    isPrimary: true,
                    requiresNetwork: false,
                });
        }

        return actions;
    }

    public toLifecycleAppError(error: AppError): LifecycleAppError {
        const phase: AppPhase = this._lifecycle ? this._lifecycle.getPhase() : 'error';
        const userMessage = this._lifecycle
            ? this._lifecycle.getErrorRecovery().getUserMessage(error.code)
            : error.message;
        return {
            ...error,
            phase,
            timestamp: Date.now(),
            userMessage,
            actions: this.getRecoveryActions(error.code),
        };
    }

    public onLifecycleEvent<K extends keyof LifecycleEventMap>(
        event: K,
        handler: (payload: LifecycleEventMap[K]) => void
    ): IDisposable {
        if (!this._lifecycle) {
            return { dispose: (): void => undefined };
        }
        return this._lifecycle.on(event, handler);
    }

    // ============================================
    // Private Methods - Initialization Phases
    // ============================================

    private _initializeModuleStatus(): void {
        const modules = [
            'event-emitter',
            'app-lifecycle',
            'navigation',
            'plex-auth',
            'plex-server-discovery',
            'plex-library',
            'plex-stream-resolver',
            'channel-manager',
            'channel-scheduler',
            'video-player',
            'epg-ui',
        ];

        for (const id of modules) {
            this._moduleStatus.set(id, {
                id,
                name: id,
                status: 'pending',
            });
        }
    }

    private _updateModuleStatus(
        id: string,
        status: ModuleStatus['status'],
        error?: AppError,
        loadTimeMs?: number
    ): void {
        const current = this._moduleStatus.get(id);
        if (current) {
            current.status = status;

            // Clear stale error when transitioning to non-error state
            if (status !== 'error') {
                delete current.error;
            }
            if (error) {
                current.error = error;
            }

            // Clear stale loadTimeMs except when explicitly provided
            if (status !== 'initializing' && loadTimeMs === undefined) {
                delete current.loadTimeMs;
            }
            if (loadTimeMs !== undefined) {
                current.loadTimeMs = loadTimeMs;
            }
        }
    }

    /**
     * Phase 1: Initialize core infrastructure (EventEmitter, AppLifecycle, Navigation)
     */
    private async _initPhase1(): Promise<void> {
        const startTime = Date.now();

        // EventEmitter is already ready (synchronous)
        this._updateModuleStatus('event-emitter', 'ready', undefined, 0);

        // Initialize Lifecycle and Navigation in parallel
        const promises: Promise<void>[] = [];

        if (this._lifecycle) {
            this._updateModuleStatus('app-lifecycle', 'initializing');
            promises.push(
                this._lifecycle.initialize().then(() => {
                    this._updateModuleStatus(
                        'app-lifecycle',
                        'ready',
                        undefined,
                        Date.now() - startTime
                    );
                })
            );
        }

        if (this._navigation && this._config) {
            this._updateModuleStatus('navigation', 'initializing');
            this._navigation.initialize(this._config.navConfig);
            this._updateModuleStatus(
                'navigation',
                'ready',
                undefined,
                Date.now() - startTime
            );
        }

        await Promise.all(promises);

        if (this._lifecycle) {
            this._lifecycle.setPhase('authenticating');
        }
    }

    /**
     * Phase 2: Validate authentication
     */
    private async _initPhase2(): Promise<boolean> {
        const startTime = Date.now();
        this._updateModuleStatus('plex-auth', 'initializing');

        if (this._mode === 'demo') {
            console.warn('[Orchestrator] Phase 2: Skipping Auth (Demo Mode)');
            this._updateModuleStatus('plex-auth', 'ready', undefined, 0);
            if (this._lifecycle) {
                this._lifecycle.setPhase('loading_data');
            }
            return true;
        }

        if (!this._plexAuth || !this._navigation) {
            this._updateModuleStatus('plex-auth', 'error');
            return false;
        }

        // Check for stored auth credentials (SSOT: PlexAuth storage)
        const storedCredentials = await this._plexAuth.getStoredCredentials();
        if (storedCredentials) {
            try {
                const isValid = await this._plexAuth.validateToken(
                    storedCredentials.token.token
                );

                if (isValid) {
                    const currentToken =
                        this._plexAuth.getCurrentUser() ?? storedCredentials.token;
                    await this._plexAuth.storeCredentials({
                        token: currentToken,
                        selectedServerId: null,
                        selectedServerUri: null,
                    });
                    this._updateModuleStatus(
                        'plex-auth',
                        'ready',
                        undefined,
                        Date.now() - startTime
                    );

                    if (this._lifecycle) {
                        this._lifecycle.setPhase('loading_data');
                    }
                    return true;
                }
            } catch (error) {
                console.error('Token validation failed:', error);
            }
        }

        // No valid auth - navigate to auth screen
        this._updateModuleStatus('plex-auth', 'pending');
        this._registerAuthResume();
        this._navigation.goTo('auth');
        return false;
    }

    /**
     * Phase 3: Connect to Plex server and initialize Plex services
     */
    private async _initPhase3(): Promise<boolean> {
        const startTime = Date.now();

        if (
            !this._plexDiscovery ||
            !this._plexLibrary ||
            !this._plexStreamResolver ||
            !this._navigation
        ) {
            return false;
        }

        if (this._mode === 'demo') {
            console.warn('[Orchestrator] Phase 3: Skipping Discovery (Demo Mode)');
            this._updateModuleStatus('plex-server-discovery', 'ready', undefined, 0);
            this._updateModuleStatus('plex-library', 'ready', undefined, 0);
            this._updateModuleStatus('plex-stream-resolver', 'ready', undefined, 0);
            return true;
        }

        // Discover servers and restore selection (SSOT: discovery storage)
        this._updateModuleStatus('plex-server-discovery', 'initializing');
        try {
            await this._plexDiscovery.initialize();
            this._updateModuleStatus(
                'plex-server-discovery',
                'ready',
                undefined,
                Date.now() - startTime
            );
        } catch (error) {
            console.error('Server discovery failed:', error);
            this._updateModuleStatus('plex-server-discovery', 'error');
            if (this._navigation) {
                this._navigation.goTo('server-select');
            }
            return false;
        }

        if (!this._plexDiscovery.isConnected()) {
            this._registerServerResume();
            this._navigation.goTo('server-select');
            return false;
        }

        // Mark library and stream resolver as ready (they use discovery)
        this._updateModuleStatus(
            'plex-library',
            'ready',
            undefined,
            Date.now() - startTime
        );
        this._updateModuleStatus(
            'plex-stream-resolver',
            'ready',
            undefined,
            Date.now() - startTime
        );

        return true;
    }

    /**
     * Phase 4: Initialize Channel Manager, Scheduler, and Video Player
     */
    private async _initPhase4(): Promise<void> {
        const startTime = Date.now();

        // Channel Manager
        if (this._channelManager) {
            this._updateModuleStatus('channel-manager', 'initializing');
            await this._configureChannelManagerStorageForSelectedServer();
            await this._channelManager.loadChannels();

            // Demo Mode safety: demo storage must not allow Plex-backed sources.
            if (this._mode === 'demo') {
                const channels = this._channelManager.getAllChannels();
                const hasChannels = channels.length > 0;
                const allManual = hasChannels && channels.every((c) => c.contentSource?.type === 'manual');
                if (!hasChannels || !allManual) {
                    console.warn('[Orchestrator] Demo Mode: pruning non-manual channels via re-seed');
                    await this._channelManager.seedDemoChannels();
                }
            }

            this._updateModuleStatus(
                'channel-manager',
                'ready',
                undefined,
                Date.now() - startTime
            );
        }

        // Channel Scheduler (no async init needed)
        this._updateModuleStatus(
            'channel-scheduler',
            'ready',
            undefined,
            Date.now() - startTime
        );

        // Video Player
        if (this._videoPlayer && this._config) {
            this._updateModuleStatus('video-player', 'initializing');
            await this._videoPlayer.initialize({
                ...this._config.playerConfig,
                demoMode: this._mode === 'demo',
            });

            // Request Media Session integration (once per app lifetime)
            // Enables Now Playing metadata and transport controls on supported platforms
            this._videoPlayer.requestMediaSession();

            this._updateModuleStatus(
                'video-player',
                'ready',
                undefined,
                Date.now() - startTime
            );
        }
    }

    /**
     * Phase 5: Initialize EPG
     */
    private async _initPhase5(): Promise<void> {
        if (this._moduleStatus.get('epg-ui')?.status === 'ready') {
            return;
        }
        if (this._epgInitPromise) {
            await this._epgInitPromise;
            return;
        }
        if (!this._epg || !this._config) {
            return;
        }

        const startTime = Date.now();
        this._updateModuleStatus('epg-ui', 'initializing');
        const init = async (): Promise<void> => {
            this._epg!.initialize(this._config!.epgConfig);
            this._updateModuleStatus(
                'epg-ui',
                'ready',
                undefined,
                Date.now() - startTime
            );
        };
        this._epgInitPromise = init()
            .catch((e) => {
                this._updateModuleStatus('epg-ui', 'error');
                throw e;
            })
            .finally(() => {
                this._epgInitPromise = null;
            });

        await this._epgInitPromise;
    }

    private async _runStartup(startPhase: 1 | 2 | 3 | 4 | 5): Promise<void> {
        if (!this._config) {
            throw new Error('Orchestrator must be initialized before starting');
        }

        if (this._startupInProgress) {
            console.warn('[Orchestrator] Startup already in progress; queuing follow-up run');
            this._startupQueuedPhase = this._startupQueuedPhase === null
                ? startPhase
                : (Math.min(this._startupQueuedPhase, startPhase) as 1 | 2 | 3 | 4 | 5);
            return new Promise((resolve) => {
                this._startupQueuedWaiters.push(resolve);
            });
        }

        this._startupInProgress = true;
        let phaseToRun: 1 | 2 | 3 | 4 | 5 = startPhase;

        try {
            while (true) {
                this._ready = false;

                // Force phase to initializing to ensure 'ready' event is emitted at the end
                // even if we were already ready (e.g. changing server via 'I' key).
                if (this._lifecycle) {
                    this._lifecycle.setPhase('initializing');
                }

                if (phaseToRun <= 1) {
                    await this._initPhase1();
                }

                if (phaseToRun <= 2) {
                    const authValid = await this._initPhase2();
                    if (!authValid) {
                        console.warn('[Orchestrator] Phase 2 failed (auth not valid)');
                        if (this._startupQueuedPhase === null) {
                            break;
                        }
                        phaseToRun = this._startupQueuedPhase;
                        this._startupQueuedPhase = null;
                        continue;
                    }
                }

                if (phaseToRun <= 3) {
                    console.warn('[Orchestrator] Starting Phase 3 (Plex Connection)');
                    const plexConnected = await this._initPhase3();
                    if (!plexConnected) {
                        console.warn('[Orchestrator] Phase 3 failed (not connected)');
                        if (this._startupQueuedPhase === null) {
                            break;
                        }
                        phaseToRun = this._startupQueuedPhase;
                        this._startupQueuedPhase = null;
                        continue;
                    }
                }

                if (phaseToRun <= 4) {
                    console.warn('[Orchestrator] Starting Phase 4 (Channels & Player)');
                    await this._initPhase4();
                }

                if (phaseToRun <= 5) {
                    console.warn('[Orchestrator] Starting Phase 5 (EPG)');
                    await this._initPhase5();
                }

                console.warn('[Orchestrator] Phases complete. Setting up wiring.');
                this._setupEventWiring();
                this._ready = true;
                if (this._lifecycle) {
                    this._lifecycle.setPhase('ready');
                }

                if (this._navigation) {
                    const shouldRunSetup = this._shouldRunChannelSetup();
                    if (shouldRunSetup) {
                        console.warn('[Orchestrator] Channel setup required. Navigating to setup wizard.');
                        this._navigation.goTo('channel-setup');
                    } else {
                        console.warn('[Orchestrator] Navigating to player');
                        this._navigation.goTo('player');
                        if (this._channelManager) {
                            console.warn('[Orchestrator] Switching to current channel');

                            let channelToPlay = this._channelManager.getCurrentChannel();

                            // Fallback: If no current channel but we have channels, pick the first one
                            if (!channelToPlay) {
                                const allChannels = this._channelManager.getAllChannels();
                                const firstChannel = allChannels[0];
                                if (firstChannel) {
                                    channelToPlay = firstChannel;
                                    console.warn(`[Orchestrator] No current channel set. Defaulting to first channel: ${firstChannel.name}`);
                                }
                            }

                            if (channelToPlay) {
                                await this.switchToChannel(channelToPlay.id);
                            } else {
                                console.warn('[Orchestrator] No current channel found. Redirecting to Server Select.');
                                this.openServerSelect();
                            }
                        }
                    }
                }

                console.warn('[Orchestrator] Startup sequence finished successfully');

                this._clearAuthResume();
                this._clearServerResume();

                if (this._startupQueuedPhase === null) {
                    break;
                }
                phaseToRun = this._startupQueuedPhase;
                this._startupQueuedPhase = null;
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this.handleGlobalError(
                {
                    code: AppErrorCode.INITIALIZATION_FAILED,
                    message,
                    recoverable: true,
                },
                'start'
            );
        } finally {
            this._startupInProgress = false;
            this._startupQueuedPhase = null;
            const waiters = this._startupQueuedWaiters;
            this._startupQueuedWaiters = [];
            for (const resolve of waiters) {
                try {
                    resolve();
                } catch {
                    // Ignore waiter failures
                }
            }
        }
    }

    private _registerAuthResume(): void {
        if (!this._plexAuth) {
            return;
        }

        this._clearAuthResume();
        const disposable = this._plexAuth.on('authChange', (isAuthenticated) => {
            if (!isAuthenticated) {
                return;
            }
            this._clearAuthResume();
            this._runStartup(2).catch((error) => {
                console.error('[Orchestrator] Auth resume failed:', error);
            });
        });
        this._authResumeDisposable = disposable;
    }

    private _registerServerResume(): void {
        if (!this._plexDiscovery) {
            return;
        }

        this._clearServerResume();
        const disposable = this._plexDiscovery.on('connectionChange', (uri) => {
            if (!uri) {
                return;
            }
            this._clearServerResume();
            this._runStartup(3).catch((error) => {
                console.error('[Orchestrator] Server resume failed:', error);
            });
        });
        this._serverResumeDisposable = disposable;
    }

    private _getSelectedServerId(): string | null {
        if (!this._plexDiscovery) {
            return null;
        }
        const server = this._plexDiscovery.getSelectedServer();
        return server ? server.id : null;
    }

    private _getChannelSetupStorageKey(serverId: string): string {
        return `retune_channel_setup_v1:${serverId}`;
    }

    private _getPerServerChannelsStorageKey(serverId: string): string {
        return `${STORAGE_KEYS.CHANNELS_SERVER}:${serverId}`;
    }

    private _getPerServerCurrentChannelKey(serverId: string): string {
        return `${STORAGE_KEYS.CURRENT_CHANNEL}:${serverId}`;
    }

    private async _configureChannelManagerStorageForSelectedServer(): Promise<void> {
        if (!this._channelManager) {
            return;
        }

        if (this._mode === 'demo') {
            this._channelManager.setStorageKeys(
                STORAGE_KEYS.CHANNELS_DEMO,
                `${STORAGE_KEYS.CURRENT_CHANNEL}:demo`
            );
            return;
        }

        const serverId = this._getSelectedServerId();
        if (!serverId) {
            return;
        }

        const serverChannelsKey = this._getPerServerChannelsStorageKey(serverId);
        const serverCurrentKey = this._getPerServerCurrentChannelKey(serverId);

        this._channelManager.setStorageKeys(serverChannelsKey, serverCurrentKey);
    }

    private _getChannelSetupRecord(serverId: string): ChannelSetupRecord | null {
        const stored = safeLocalStorageGet(this._getChannelSetupStorageKey(serverId));
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
            return parsed as ChannelSetupRecord;
        } catch {
            return null;
        }
    }

    private _shouldRunChannelSetup(): boolean {
        if (this._mode === 'demo') {
            return false;
        }
        if (!this._channelManager) {
            return false;
        }
        const serverId = this._getSelectedServerId();
        if (!serverId) {
            return false;
        }
        if (this._channelSetupRerunRequested) {
            return true;
        }
        if (this._channelManager.getAllChannels().length === 0) {
            return true;
        }
        const record = this._getChannelSetupRecord(serverId);
        return record === null;
    }

    private _collectUniqueTags(items: PlexMediaItem[], field: 'genres' | 'directors'): string[] {
        const unique = new Map<string, string>();
        for (const item of items) {
            const values = item[field];
            if (!values) {
                continue;
            }
            for (const value of values) {
                const trimmed = value.trim();
                if (!trimmed) {
                    continue;
                }
                const key = trimmed.toLowerCase();
                if (!unique.has(key)) {
                    unique.set(key, trimmed);
                }
            }
        }
        return Array.from(unique.values()).sort((a, b) => a.localeCompare(b));
    }

    private _hashSeed(value: string): number {
        let hash = 2166136261;
        for (let i = 0; i < value.length; i++) {
            hash ^= value.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    private _getLocalMidnightMs(timeMs: number): number {
        const date = new Date(timeMs);
        date.setHours(0, 0, 0, 0);
        return date.getTime();
    }

    private _getLocalDayKey(timeMs: number): number {
        const date = new Date(timeMs);
        return (date.getFullYear() * 10000) + ((date.getMonth() + 1) * 100) + date.getDate();
    }

    private _calculateLoopDurationMs(items: ResolvedChannelContent['items']): number {
        let total = 0;
        for (const item of items) {
            total += item.durationMs;
        }
        return total;
    }

    private _getPhaseOffsetMs(channel: ChannelConfig, items: ResolvedChannelContent['items']): number {
        const loopDurationMs = this._calculateLoopDurationMs(items);
        if (!Number.isFinite(loopDurationMs) || loopDurationMs <= 0) {
            return 0;
        }
        const seed =
            typeof channel.phaseSeed === 'number' && Number.isFinite(channel.phaseSeed)
                ? channel.phaseSeed
                : 0;
        if (seed === 0) {
            return 0;
        }
        const random = createMulberry32(seed);
        return Math.floor(random() * loopDurationMs);
    }

    private _buildDailyScheduleConfig(
        channel: ChannelConfig,
        items: ResolvedChannelContent['items'],
        referenceTimeMs: number
    ): ScheduleConfig {
        const dayStart = this._getLocalMidnightMs(referenceTimeMs);
        const dayKey = this._getLocalDayKey(dayStart);
        const phaseOffsetMs = this._getPhaseOffsetMs(channel, items);

        const baseSeed =
            typeof channel.shuffleSeed === 'number' && Number.isFinite(channel.shuffleSeed)
                ? channel.shuffleSeed
                : Date.now();

        const effectiveSeed =
            channel.playbackMode === 'shuffle'
                ? (baseSeed ^ dayKey) >>> 0
                : baseSeed;

        return {
            channelId: channel.id,
            anchorTime: dayStart - phaseOffsetMs,
            content: items,
            playbackMode: channel.playbackMode,
            shuffleSeed: effectiveSeed,
            loopSchedule: true,
        };
    }

    private async _handleScheduleDayRollover(): Promise<void> {
        if (!this._channelManager || !this._scheduler) {
            return;
        }
        const now = Date.now();
        const dayKey = this._getLocalDayKey(now);
        if (this._activeScheduleDayKey === null) {
            this._activeScheduleDayKey = dayKey;
            return;
        }
        if (dayKey === this._activeScheduleDayKey) {
            return;
        }

        // If we're already waiting to apply the same day rollover, no-op.
        if (this._pendingDayRolloverDayKey === dayKey) {
            return;
        }

        const dayStart = this._getLocalMidnightMs(now);
        const currentProgram = this._scheduler.getCurrentProgram();
        const spansMidnight =
            currentProgram !== null &&
            currentProgram.scheduledStartTime < dayStart &&
            currentProgram.scheduledEndTime > dayStart;

        // Avoid interrupting a program that started before midnight and is still playing.
        if (spansMidnight) {
            this._pendingDayRolloverDayKey = dayKey;
            if (this._pendingDayRolloverTimer !== null) {
                globalThis.clearTimeout(this._pendingDayRolloverTimer);
                this._pendingDayRolloverTimer = null;
            }
            const delayMs = Math.max(0, currentProgram.scheduledEndTime - now + 50);
            this._pendingDayRolloverTimer = globalThis.setTimeout(() => {
                this._pendingDayRolloverTimer = null;
                this._applyScheduleDayRollover().catch((error) => {
                    console.error('[Orchestrator] Failed to apply day rollover:', error);
                });
            }, delayMs);
            return;
        }

        this._pendingDayRolloverDayKey = dayKey;
        await this._applyScheduleDayRollover();
    }

    private async _applyScheduleDayRollover(): Promise<void> {
        if (!this._channelManager || !this._scheduler) {
            return;
        }
        const now = Date.now();
        const dayKey = this._getLocalDayKey(now);
        if (this._activeScheduleDayKey === dayKey) {
            this._pendingDayRolloverDayKey = null;
            return;
        }

        const current = this._channelManager.getCurrentChannel();
        if (!current) {
            this._activeScheduleDayKey = dayKey;
            this._pendingDayRolloverDayKey = null;
            return;
        }

        const content = await this._channelManager.resolveChannelContent(current.id);
        this._scheduler.loadChannel(this._buildDailyScheduleConfig(current, content.items, now));
        this._scheduler.syncToCurrentTime();

        await this._refreshEpgSchedules();
        this._activeScheduleDayKey = dayKey;
        this._pendingDayRolloverDayKey = null;
    }

    private _clearAuthResume(): void {
        if (this._authResumeDisposable) {
            this._authResumeDisposable.dispose();
            this._authResumeDisposable = null;
        }
    }

    private _clearServerResume(): void {
        if (this._serverResumeDisposable) {
            this._serverResumeDisposable.dispose();
            this._serverResumeDisposable = null;
        }
    }

    // ============================================
    // Private Methods - Event Wiring
    // ============================================

    /**
     * Wire up all cross-module events per integration contracts.
     * Idempotent: guards against duplicate wiring on retries.
     */
    private _setupEventWiring(): void {
        // Guard against duplicate wiring on retries
        if (this._eventsWired) {
            return;
        }
        this._eventsWired = true;

        this._wireSchedulerEvents();
        this._wirePlayerEvents();
        this._wireNavigationEvents();
        this._wireEpgEvents();
        this._wireLifecycleEvents();
    }

    /**
     * Wire scheduler events to player.
     */
    private _wireSchedulerEvents(): void {
        if (!this._scheduler) return;

        // Fire-and-forget pattern: _handleProgramStart has internal error handling
        // This catch is a safety net for any unexpected throws
        const handler = (program: ScheduledProgram): void => {
            this._handleProgramStart(program).catch((error) => {
                console.error('[Orchestrator] Unhandled error in program start:', error);
            });
        };
        this._scheduler.on('programStart', handler);

        const syncHandler = (): void => {
            this._handleScheduleDayRollover().catch((error) => {
                console.error('[Orchestrator] Unhandled error in scheduleSync handler:', error);
            });
        };
        this._scheduler.on('scheduleSync', syncHandler);

        // Register cleanup
        this._eventUnsubscribers.push(() => {
            if (this._scheduler) {
                this._scheduler.off('programStart', handler);
                this._scheduler.off('scheduleSync', syncHandler);
            }
        });
    }

    /**
     * Wire player events to scheduler.
     */
    private _wirePlayerEvents(): void {
        if (!this._videoPlayer) return;

        // Player ended -> skip to next
        const endedHandler = (): void => {
            if (this._scheduler) {
                this._scheduler.skipToNext();
            }
        };
        this._videoPlayer.on('ended', endedHandler);
        this._eventUnsubscribers.push(() => {
            if (this._videoPlayer) {
                this._videoPlayer.off('ended', endedHandler);
            }
        });

        // Player error -> handle or skip
        const errorHandler = (error: PlaybackError): void => {
            if (error.recoverable) {
                const mappedCode = mapPlayerErrorCodeToAppErrorCode(error.code);
                this.handleGlobalError(
                    {
                        code: mappedCode,
                        message: error.message,
                        recoverable: true,
                    },
                    'video-player'
                );
            } else {
                // Special case: if Direct playback fails due to container/codec support, retry via HLS Direct Stream.
                // This is critical for MKV-heavy libraries on older webOS versions.
                if (error.code === 'PLAYBACK_FORMAT_UNSUPPORTED') {
                    void (async (): Promise<void> => {
                        try {
                            const ok = await this._attemptTranscodeFallbackForCurrentProgram(
                                'PLAYBACK_FORMAT_UNSUPPORTED'
                            );
                            if (!ok) {
                                this._handlePlaybackFailure('video-player', error);
                            }
                        } catch (fallbackError) {
                            this._handlePlaybackFailure('video-player', fallbackError);
                        }
                    })();
                    return;
                }
                this._handlePlaybackFailure('video-player', error);
            }
        };
        this._videoPlayer.on('error', errorHandler);
        this._eventUnsubscribers.push(() => {
            if (this._videoPlayer) {
                this._videoPlayer.off('error', errorHandler);
            }
        });
    }

    private _resetPlaybackFailureGuard(): void {
        this._playbackFailureWindowStartMs = 0;
        this._playbackFailureCount = 0;
        this._playbackFailureTripped = false;
        if (this._scheduler) {
            this._scheduler.resumeSyncTimer();
        }
    }

    private _handlePlaybackFailure(context: string, error: unknown): void {
        if (this._playbackFailureTripped) {
            return;
        }

        const now = Date.now();

        // Reset window if stale
        if (
            this._playbackFailureWindowStartMs === 0 ||
            now - this._playbackFailureWindowStartMs > this._playbackFailureWindowMs
        ) {
            this._playbackFailureWindowStartMs = now;
            this._playbackFailureCount = 0;
        }

        this._playbackFailureCount++;

        // Trip guard: stop auto-skipping and surface the error to the user
        if (this._playbackFailureCount >= this._playbackFailureTripCount) {
            this._playbackFailureTripped = true;
            if (this._scheduler) {
                this._scheduler.pauseSyncTimer();
            }
            const message = ((): string => {
                if (error instanceof Error) {
                    return error.message;
                }
                if (
                    error &&
                    typeof error === 'object' &&
                    'message' in error &&
                    typeof (error as { message?: unknown }).message === 'string'
                ) {
                    return (error as { message: string }).message;
                }
                return String(error);
            })();
            this.handleGlobalError(
                {
                    code: AppErrorCode.PLAYBACK_FAILED,
                    message: `Playback failed repeatedly (${context}): ${message}`,
                    recoverable: true,
                },
                'playback'
            );
            return;
        }

        // Single/rare failure: skip as before
        if (this._scheduler) {
            this._scheduler.skipToNext();
        }
    }

    /**
     * Wire navigation key events and screen changes.
     */
    private _wireNavigationEvents(): void {
        if (!this._navigation) return;

        // Key press handler
        const keyHandler = (event: KeyEvent): void => {
            this._handleKeyPress(event);
        };
        this._navigation.on('keyPress', keyHandler);
        this._eventUnsubscribers.push(() => {
            if (this._navigation) {
                this._navigation.off('keyPress', keyHandler);
            }
        });

        // Channel number entry handler
        const channelNumberHandler = (payload: { channelNumber: number }): void => {
            if (!Number.isFinite(payload.channelNumber)) {
                return;
            }
            this.switchToChannelByNumber(payload.channelNumber).catch(console.error);
        };
        this._navigation.on('channelNumberEntered', channelNumberHandler);
        this._eventUnsubscribers.push(() => {
            if (this._navigation) {
                this._navigation.off('channelNumberEntered', channelNumberHandler);
            }
        });

        // Guide/EPG Toggle Handler
        const guideHandler = (): void => {
            // EPG is an overlay, not a navigation screen; toggle based on EPG visibility.
            this.toggleEPG();
        };
        this._navigation.on('guide', guideHandler);
        this._eventUnsubscribers.push(() => {
            if (this._navigation) {
                this._navigation.off('guide', guideHandler);
            }
        });

        // Screen change handler - show/hide screens
        const screenHandler = (payload: { from: string; to: string }): void => {
            this._handleScreenChange(payload.from, payload.to);
        };
        this._navigation.on('screenChange', screenHandler);
        this._eventUnsubscribers.push(() => {
            if (this._navigation) {
                this._navigation.off('screenChange', screenHandler);
            }
        });
    }

    /**
     * Handle screen transitions.
     * @param from - Previous screen
     * @param to - New screen
     */
    private _handleScreenChange(from: string, to: string): void {
        if (to === 'player' && this._shouldRunChannelSetup()) {
            if (this._navigation) {
                this._navigation.replaceScreen('channel-setup');
            }
            return;
        }

        // Hide EPG when leaving guide
        if (from === 'guide' && to !== 'guide') {
            if (this._epg) {
                this._epg.hide();
            }
        }

        // Show EPG when entering guide
        if (to === 'guide') {
            if (this._epg) {
                this._epg.show();
                this._epg.focusNow();
            }
        }

        // Pause playback when leaving player for settings/channel-edit
        if (from === 'player' && (to === 'settings' || to === 'channel-edit')) {
            if (this._videoPlayer) {
                this._videoPlayer.pause();
            }
        }

        // Resume playback when returning to player
        if (to === 'player' && from !== 'player') {
            if (this._videoPlayer) {
                this._videoPlayer.play().catch(console.error);
            }
        }
    }

    /**
     * Wire EPG channel selection events.
     */
    private _wireEpgEvents(): void {
        if (!this._epg) return;

        const handler = (payload: { channel: ChannelConfig; program: ScheduledProgram }): void => {
            const now = Date.now();
            if (now < payload.program.scheduledStartTime) {
                // Future program: keep guide open; info panel already shows details on focus.
                return;
            }
            this.closeEPG();
            this.switchToChannel(payload.channel.id).catch(console.error);
        };
        this._epg.on('channelSelected', handler);
        this._eventUnsubscribers.push(() => {
            if (this._epg) {
                this._epg.off('channelSelected', handler);
            }
        });
    }

    /**
     * Wire lifecycle pause/resume events.
     */
    private _wireLifecycleEvents(): void {
        if (!this._lifecycle) return;

        // On pause
        this._lifecycle.onPause(async () => {
            if (this._videoPlayer) {
                this._videoPlayer.pause();
            }
            if (this._scheduler) {
                this._scheduler.pauseSyncTimer();
            }
            if (this._lifecycle) {
                await this._lifecycle.saveState();
            }
        });

        // On resume
        this._lifecycle.onResume(async () => {
            if (this._scheduler) {
                this._scheduler.resumeSyncTimer();
                this._scheduler.syncToCurrentTime();
            }
            if (this._videoPlayer) {
                await this._videoPlayer.play();
            }
        });
    }

    /**
     * Handle program start event from scheduler.
     */
    private async _handleProgramStart(program: ScheduledProgram): Promise<void> {
        if (!this._videoPlayer) {
            return;
        }

        this._currentProgramForPlayback = program;

        try {
            const stream =
                this._mode === 'demo'
                    ? this._buildDemoStreamForProgram(program)
                    : await this._resolveStreamForProgram(program);
            this._currentStreamDescriptor = stream;
            await this._videoPlayer.loadStream(stream);
            await this._videoPlayer.play();
            this._resetPlaybackFailureGuard();
        } catch (error) {
            console.error('Failed to load stream:', error);
            // Demo Mode must not auto-skip on failures.
            if (this._mode === 'demo') {
                this.handleGlobalError(
                    {
                        code: AppErrorCode.PLAYBACK_FAILED,
                        message: `Demo Mode playback simulation failed: ${error instanceof Error ? error.message : String(error)}`,
                        recoverable: true,
                    },
                    'demo-playback'
                );
                return;
            }
            this._handlePlaybackFailure('programStart', error);
        }
    }

    private async _attemptTranscodeFallbackForCurrentProgram(reason: string): Promise<boolean> {
        if (this._mode === 'demo') {
            return false;
        }
        if (this._streamRecoveryInProgress) {
            return false;
        }
        const program = this._currentProgramForPlayback;
        if (!program || !this._videoPlayer || !this._plexStreamResolver) {
            return false;
        }
        const currentProtocol = this._currentStreamDescriptor?.protocol ?? null;
        if (currentProtocol !== 'direct') {
            return false;
        }
        const itemKey = program.item.ratingKey;
        if (this._directFallbackAttemptedForItemKey.has(itemKey)) {
            return false;
        }

        this._directFallbackAttemptedForItemKey.add(itemKey);
        this._streamRecoveryInProgress = true;

        try {
            console.warn('[Orchestrator] Direct playback failed, retrying via HLS Direct Stream:', {
                reason,
                itemKey,
            });

            const clampedOffset = Math.max(0, Math.min(program.elapsedMs, program.item.durationMs));
            const decision: StreamDecision = await this._plexStreamResolver.resolveStream({
                itemKey: itemKey,
                startOffsetMs: clampedOffset,
                directPlay: false,
            });

            const metadata: StreamDescriptor['mediaMetadata'] = {
                title: program.item.title,
                durationMs: program.item.durationMs,
            };
            if (program.item.type === 'episode' && program.item.fullTitle) {
                metadata.subtitle = program.item.fullTitle;
            }
            if (program.item.thumb) {
                const thumbUrl = this._buildPlexResourceUrl(program.item.thumb);
                if (thumbUrl) {
                    metadata.thumb = thumbUrl;
                }
            }
            if (program.item.year !== undefined) {
                metadata.year = program.item.year;
            }

            const descriptor: StreamDescriptor = {
                url: decision.playbackUrl,
                protocol: decision.protocol === 'hls' ? 'hls' : 'direct',
                mimeType: this._getMimeType(decision),
                startPositionMs: clampedOffset,
                mediaMetadata: metadata,
                subtitleTracks: [],
                audioTracks: [],
                durationMs: program.item.durationMs,
                isLive: false,
            };

            this._currentStreamDescriptor = descriptor;
            await this._videoPlayer.loadStream(descriptor);
            await this._videoPlayer.play();
            this._resetPlaybackFailureGuard();
            return true;
        } catch (error) {
            console.error('[Orchestrator] Transcode fallback failed:', error);
            return false;
        } finally {
            this._streamRecoveryInProgress = false;
        }
    }

    /**
     * Resolve stream URL for a scheduled program.
     */
    private async _resolveStreamForProgram(
        program: ScheduledProgram
    ): Promise<StreamDescriptor> {
        if (this._mode === 'demo') {
            throw new Error('Demo Mode: stream resolution is disabled');
        }
        if (!this._plexStreamResolver) {
            throw new Error('Stream resolver not initialized');
        }

        // Defensive: clamp elapsed time to valid bounds
        const clampedOffset = Math.max(0, Math.min(program.elapsedMs, program.item.durationMs));

        const decision: StreamDecision = await this._plexStreamResolver.resolveStream({
            itemKey: program.item.ratingKey,
            startOffsetMs: clampedOffset,
            directPlay: true,
        });

        // Build mediaMetadata carefully for exactOptionalPropertyTypes
        const metadata: StreamDescriptor['mediaMetadata'] = {
            title: program.item.title,
            durationMs: program.item.durationMs,
        };
        if (program.item.type === 'episode' && program.item.fullTitle) {
            metadata.subtitle = program.item.fullTitle;
        }
        if (program.item.thumb) {
            const thumbUrl = this._buildPlexResourceUrl(program.item.thumb);
            if (thumbUrl) {
                metadata.thumb = thumbUrl;
            }
        }
        if (program.item.year !== undefined) {
            metadata.year = program.item.year;
        }

        return {
            url: decision.playbackUrl,
            protocol: decision.protocol === 'hls' ? 'hls' : 'direct',
            mimeType: this._getMimeType(decision),
            startPositionMs: clampedOffset,
            mediaMetadata: metadata,
            subtitleTracks: [],
            audioTracks: [],
            durationMs: program.item.durationMs,
            isLive: false,
        };
    }

    private _buildDemoStreamForProgram(program: ScheduledProgram): StreamDescriptor {
        // Demo Mode: no network / no real media. VideoPlayer simulates playback when demoMode=true.
        const clampedOffset = Math.max(
            0,
            Math.min(program.elapsedMs, program.item.durationMs)
        );
        return {
            url: 'about:blank',
            protocol: 'direct',
            mimeType: 'video/mp4',
            startPositionMs: clampedOffset,
            mediaMetadata: {
                title: program.item.title,
                durationMs: program.item.durationMs,
            },
            subtitleTracks: [],
            audioTracks: [],
            durationMs: program.item.durationMs,
            isLive: false,
        };
    }

    private _buildPlexResourceUrl(pathOrUrl: string): string | null {
        try {
            // If already absolute http(s), return as-is.
            if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
                return pathOrUrl;
            }

            const baseUri = this._plexDiscovery?.getServerUri() ?? null;
            if (!baseUri) {
                return null;
            }

            const url = new URL(pathOrUrl, baseUri);
            const headers = this._plexAuth?.getAuthHeaders() ?? {};
            const token = headers['X-Plex-Token'];
            if (typeof token === 'string' && token.length > 0) {
                // Note: We include the token as a query param because some webOS media/image fetch paths
                // cannot reliably attach headers. This carries leak risk (logs/referrers/caches), so avoid
                // logging these URLs and only use them where required.
                url.searchParams.set('X-Plex-Token', token);
            }
            return url.toString();
        } catch {
            return null;
        }
    }

    /**
     * Get MIME type from stream decision.
     */
    private _getMimeType(decision: StreamDecision): string {
        if (decision.protocol === 'hls') {
            return MIME_TYPES.hls || 'application/x-mpegURL';
        }
        if (decision.container) {
            const mime = MIME_TYPES[decision.container];
            if (mime) return mime;
        }
        // Fallback
        return 'video/mp4';
    }

    /**
     * Handle key press from navigation.
     */
    private _handleKeyPress(event: KeyEvent): void {
        if (this._epg?.isVisible()) {
            switch (event.button) {
                case 'up':
                case 'down':
                case 'left':
                case 'right':
                    if (this._epg.handleNavigation(event.button)) {
                        event.originalEvent.preventDefault();
                        return;
                    }
                    break;
                case 'ok':
                    if (this._epg.handleSelect()) {
                        event.originalEvent.preventDefault();
                        return;
                    }
                    break;
                case 'back':
                    if (this._epg.handleBack()) {
                        event.originalEvent.preventDefault();
                        return;
                    }
                    break;
                default:
                    break;
            }
        }

        switch (event.button) {
            case 'channelUp':
                this._switchToNextChannel();
                break;
            case 'channelDown':
                this._switchToPreviousChannel();
                break;
            case 'info':
            case 'blue':
                if (this._mode === 'demo') {
                    console.warn('[Orchestrator] Demo Mode: Plex screens disabled');
                    break;
                }
                if (this._navigation) {
                    if (this._plexAuth && !this._plexAuth.isAuthenticated()) {
                        this._navigation.goTo('auth');
                    } else {
                        this._navigation.goTo('server-select');
                    }
                }
                break;
            case 'play':
                if (this._videoPlayer) {
                    this._videoPlayer.play().catch(console.error);
                }
                break;
            case 'pause':
                if (this._videoPlayer) {
                    this._videoPlayer.pause();
                }
                break;
            case 'stop':
                if (this._videoPlayer) {
                    this._videoPlayer.stop();
                }
                break;
            // Other keys handled by active screen
        }
    }

    /**
     * Switch to next channel.
     */
    private _switchToNextChannel(): void {
        if (!this._channelManager) return;

        const nextChannel = this._channelManager.getNextChannel();
        if (nextChannel) {
            this.switchToChannel(nextChannel.id).catch(console.error);
        }
    }

    /**
     * Switch to previous channel.
     */
    private _switchToPreviousChannel(): void {
        if (!this._channelManager) return;

        const prevChannel = this._channelManager.getPreviousChannel();
        if (prevChannel) {
            this.switchToChannel(prevChannel.id).catch(console.error);
        }
    }

    /**
     * Toggle Demo Mode and reload.
     */
    toggleDemoMode(): void {
        const newMode: AppMode = this._mode === 'real' ? 'demo' : 'real';
        safeLocalStorageSet(STORAGE_KEYS.MODE, newMode);
        if (typeof window !== 'undefined') {
            // Best-effort save before reload (do not block UI).
            void this._lifecycle?.saveState();
            window.location.reload();
        }
    }

    /**
     * Remove orphaned temporary channel-build keys from prior crashes.
     * Best-effort only; never throws.
     */
    private _cleanupStaleChannelBuildKeys(): void {
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
}
