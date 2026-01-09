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
    type PersistentState,
} from './modules/lifecycle';
import {
    NavigationManager,
    type INavigationManager,
    type NavigationConfig,
    type KeyEvent,
} from './modules/navigation';
import {
    PlexAuth,
    type IPlexAuth,
    type PlexAuthConfig,
} from './modules/plex/auth';
import {
    PlexServerDiscovery,
    type IPlexServerDiscovery,
} from './modules/plex/discovery';
import {
    PlexLibrary,
    type IPlexLibrary,
    type PlexLibraryConfig,
} from './modules/plex/library';
import {
    PlexStreamResolver,
    type IPlexStreamResolver,
    type PlexStreamResolverConfig,
    type StreamDecision,
} from './modules/plex/stream';
import {
    ChannelManager,
    type IChannelManager,
    type ChannelManagerConfig,
    type ChannelConfig,
    type ResolvedChannelContent,
} from './modules/scheduler/channel-manager';
import {
    ChannelScheduler,
    type IChannelScheduler,
    type ScheduledProgram,
    type ScheduleConfig,
} from './modules/scheduler/scheduler';
import {
    VideoPlayer,
    type IVideoPlayer,
    type VideoPlayerConfig,
    type StreamDescriptor,
    type PlaybackError,
} from './modules/player';
import {
    EPGComponent,
    type IEPGComponent,
    type EPGConfig,
} from './modules/ui/epg';

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
    switchToChannel(channelId: string): Promise<void>;
    switchToChannelByNumber(number: number): Promise<void>;
    openEPG(): void;
    closeEPG(): void;
    toggleEPG(): void;
    handleGlobalError(error: AppError, context: string): void;
    registerErrorHandler(moduleId: string, handler: (error: AppError) => boolean): void;
    getRecoveryActions(errorCode: AppErrorCode): ErrorRecoveryAction[];
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

    private _config: OrchestratorConfig | null = null;
    private _moduleStatus: Map<string, ModuleStatus> = new Map();
    private _errorHandlers: Map<string, (error: AppError) => boolean> = new Map();
    private _eventUnsubscribers: Array<() => void> = [];
    private _eventsWired: boolean = false;
    private _ready: boolean = false;
    private _isChannelSwitching: boolean = false;

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

        // Create module instances (not yet initialized)
        this._lifecycle = new AppLifecycle();
        this._navigation = new NavigationManager();
        this._plexAuth = new PlexAuth(config.plexConfig);
        this._plexDiscovery = new PlexServerDiscovery(this._plexAuth);

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
            getHttpsConnection: () => {
                if (this._plexDiscovery) {
                    const server = this._plexDiscovery.getSelectedServer();
                    if (server && server.connections) {
                        const httpsConn = server.connections.find(
                            (c: { protocol: string }) => c.protocol === 'https'
                        );
                        if (httpsConn) {
                            return { uri: httpsConn.uri };
                        }
                    }
                }
                return null;
            },
            getRelayConnection: () => {
                if (this._plexDiscovery) {
                    const server = this._plexDiscovery.getSelectedServer();
                    if (server && server.connections) {
                        const relayConn = server.connections.find(
                            (c: { relay: boolean }) => c.relay
                        );
                        if (relayConn) {
                            return { uri: relayConn.uri };
                        }
                    }
                }
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
        if (!this._config) {
            throw new Error('Orchestrator must be initialized before starting');
        }

        try {
            // Phase 1: Core Infrastructure (Parallel)
            await this._initPhase1();

            // Check for saved state
            const savedState = await this._restoreState();

            // Phase 2: Authentication
            const authValid = await this._initPhase2(savedState);
            if (!authValid) {
                return; // Navigation handled in _initPhase2
            }

            // Phase 3: Plex Services
            const plexConnected = await this._initPhase3(savedState);
            if (!plexConnected) {
                return; // Navigation handled in _initPhase3
            }

            // Phase 4: Channel/Scheduler/Player
            await this._initPhase4();

            // Phase 5: EPG
            await this._initPhase5();

            // Setup event wiring
            this._setupEventWiring();

            // Mark as ready
            this._ready = true;
            if (this._lifecycle) {
                this._lifecycle.setPhase('ready');
            }

            // Navigate to player
            if (this._navigation) {
                this._navigation.goTo('player');
            }

            // Start playback on last channel
            if (this._channelManager) {
                const currentChannel = this._channelManager.getCurrentChannel();
                if (currentChannel) {
                    await this.switchToChannel(currentChannel.id);
                }
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
        }
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
            const scheduleConfig: ScheduleConfig = {
                channelId: channel.id,
                anchorTime: channel.startTimeAnchor,
                content: content.orderedItems,
                playbackMode: channel.playbackMode,
                shuffleSeed: channel.shuffleSeed ?? Date.now(),
                loopSchedule: true,
            };
            this._scheduler.loadChannel(scheduleConfig);

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
        if (this._epg) {
            this._epg.show();
            this._epg.focusNow();
        }
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
    private async _initPhase2(
        savedState: PersistentState | null
    ): Promise<boolean> {
        const startTime = Date.now();
        this._updateModuleStatus('plex-auth', 'initializing');

        if (!this._plexAuth || !this._navigation) {
            this._updateModuleStatus('plex-auth', 'error');
            return false;
        }

        // Check for saved auth
        if (savedState && savedState.plexAuth) {
            try {
                const isValid = await this._plexAuth.validateToken(
                    savedState.plexAuth.token.token
                );

                if (isValid) {
                    await this._plexAuth.storeCredentials(savedState.plexAuth);
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
        this._navigation.goTo('auth');
        return false;
    }

    /**
     * Phase 3: Connect to Plex server and initialize Plex services
     */
    private async _initPhase3(
        savedState: PersistentState | null
    ): Promise<boolean> {
        const startTime = Date.now();

        if (
            !this._plexDiscovery ||
            !this._plexLibrary ||
            !this._plexStreamResolver ||
            !this._navigation
        ) {
            return false;
        }

        // Discover servers
        this._updateModuleStatus('plex-server-discovery', 'initializing');
        try {
            await this._plexDiscovery.discoverServers();
            this._updateModuleStatus(
                'plex-server-discovery',
                'ready',
                undefined,
                Date.now() - startTime
            );
        } catch (error) {
            console.error('Server discovery failed:', error);
            this._updateModuleStatus('plex-server-discovery', 'error');
            return false;
        }

        // Connect to saved server
        if (savedState?.plexAuth?.selectedServerId) {
            try {
                const connected = await this._plexDiscovery.selectServer(
                    savedState.plexAuth.selectedServerId
                );

                if (!connected) {
                    this._navigation.goTo('server-select');
                    return false;
                }
            } catch (error) {
                console.error('Failed to connect to saved server:', error);
                this._updateModuleStatus('plex-server-discovery', 'error');
                this._navigation.goTo('server-select');
                return false;
            }
        } else {
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
            await this._channelManager.loadChannels();
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
            await this._videoPlayer.initialize(this._config.playerConfig);

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
        const startTime = Date.now();

        if (this._epg && this._config) {
            this._updateModuleStatus('epg-ui', 'initializing');
            this._epg.initialize(this._config.epgConfig);
            this._updateModuleStatus(
                'epg-ui',
                'ready',
                undefined,
                Date.now() - startTime
            );
        }
    }

    /**
     * Restore persisted state from lifecycle module.
     */
    private async _restoreState(): Promise<PersistentState | null> {
        if (!this._lifecycle) {
            return null;
        }

        try {
            return await this._lifecycle.restoreState();
        } catch (error) {
            console.error('Failed to restore state:', error);
            return null;
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

        // Register cleanup
        this._eventUnsubscribers.push(() => {
            if (this._scheduler) {
                this._scheduler.off('programStart', handler);
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
                this.handleGlobalError(
                    {
                        code: AppErrorCode.PLAYBACK_FAILED,
                        message: error.message,
                        recoverable: true,
                    },
                    'video-player'
                );
            } else {
                // Unrecoverable -> skip to next
                if (this._scheduler) {
                    this._scheduler.skipToNext();
                }
            }
        };
        this._videoPlayer.on('error', errorHandler);
        this._eventUnsubscribers.push(() => {
            if (this._videoPlayer) {
                this._videoPlayer.off('error', errorHandler);
            }
        });
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
        if (!this._videoPlayer || !this._plexStreamResolver) {
            return;
        }

        try {
            const stream = await this._resolveStreamForProgram(program);
            await this._videoPlayer.loadStream(stream);
            await this._videoPlayer.play();
        } catch (error) {
            console.error('Failed to load stream:', error);
            if (this._scheduler) {
                this._scheduler.skipToNext();
            }
        }
    }

    /**
     * Resolve stream URL for a scheduled program.
     */
    private async _resolveStreamForProgram(
        program: ScheduledProgram
    ): Promise<StreamDescriptor> {
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
            metadata.thumb = program.item.thumb;
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

    /**
     * Get MIME type from stream decision.
     */
    private _getMimeType(decision: StreamDecision): string {
        if (decision.protocol === 'hls') {
            return 'application/x-mpegURL';
        }
        // Default to MP4 for direct play
        return 'video/mp4';
    }

    /**
     * Handle key press from navigation.
     */
    private _handleKeyPress(event: KeyEvent): void {
        switch (event.button) {
            case 'channelUp':
                this._switchToNextChannel();
                break;
            case 'channelDown':
                this._switchToPreviousChannel();
                break;
            case 'guide':
                this.toggleEPG();
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
}
