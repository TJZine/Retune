/**
 * @fileoverview Initialization Coordinator - Manages the 5-phase startup sequence.
 * @module core/InitializationCoordinator
 * @version 1.0.0
 *
 * Extracted from Orchestrator to reduce complexity and improve modularity.
 * Handles:
 * - Phase 1: Core infrastructure (Lifecycle, Navigation)
 * - Phase 2: Auth validation
 * - Phase 3: Plex server connection
 * - Phase 4: Channel Manager, Scheduler, Video Player
 * - Phase 5: EPG initialization
 */

import { AppErrorCode, type IAppLifecycle, type AppError } from '../modules/lifecycle';
import type { INavigationManager } from '../modules/navigation';
import type { IPlexAuth } from '../modules/plex/auth';
import type { IPlexServerDiscovery } from '../modules/plex/discovery';
import type { IPlexLibrary } from '../modules/plex/library';
import type { IPlexStreamResolver } from '../modules/plex/stream';
import type { IChannelManager } from '../modules/scheduler/channel-manager';
import type { IChannelScheduler } from '../modules/scheduler/scheduler';
import type { IVideoPlayer } from '../modules/player';
import type { IEPGComponent } from '../modules/ui/epg';
import type { INowPlayingInfoOverlay } from '../modules/ui/now-playing-info';
import type { IPlayerOsdOverlay } from '../modules/ui/player-osd';
import type { IChannelTransitionOverlay } from '../modules/ui/channel-transition';
import type { IPlaybackOptionsModal } from '../modules/ui/playback-options';
import type { IDisposable } from '../utils/interfaces';
import { isStoredTrue, safeLocalStorageGet } from '../utils/storage';
import { RETUNE_STORAGE_KEYS } from '../config/storageKeys';
import type { OrchestratorConfig, ModuleStatus } from '../Orchestrator';

// ============================================
// Types
// ============================================

/**
 * Dependencies injected by Orchestrator.
 * These are module references the coordinator needs.
 */
export interface InitializationDependencies {
    lifecycle: IAppLifecycle | null;
    navigation: INavigationManager | null;
    plexAuth: IPlexAuth | null;
    plexDiscovery: IPlexServerDiscovery | null;
    plexLibrary: IPlexLibrary | null;
    plexStreamResolver: IPlexStreamResolver | null;
    channelManager: IChannelManager | null;
    scheduler: IChannelScheduler | null;
    videoPlayer: IVideoPlayer | null;
    epg: IEPGComponent | null;
    nowPlayingInfo: INowPlayingInfoOverlay | null;
    playerOsd: IPlayerOsdOverlay | null;
    channelTransition: IChannelTransitionOverlay | null;
    playbackOptions: IPlaybackOptionsModal | null;
}

/**
 * Callbacks the coordinator invokes on the Orchestrator.
 * These maintain separation of concerns while allowing state updates.
 */
export interface InitializationCallbacks {
    // Module status tracking
    updateModuleStatus: (
        id: string,
        status: ModuleStatus['status'],
        error?: AppError,
        loadTimeMs?: number
    ) => void;

    // Module status check (for EPG idempotency guard)
    getModuleStatus: (id: string) => ModuleStatus['status'] | undefined;

    // Error handling
    handleGlobalError: (error: AppError, context: string) => void;

    // State management
    setReady: (ready: boolean) => void;

    // Event wiring (called after phases complete)
    setupEventWiring: () => void;

    // Server/storage operations (kept in Orchestrator)
    configureChannelManagerStorage: () => Promise<void>;
    getSelectedServerId: () => string | null;
    shouldRunAudioSetup: () => boolean;
    shouldRunChannelSetup: () => boolean;
    switchToChannel: (id: string) => Promise<void>;
    openServerSelect: () => void;

    // EPG thumb resolver (Orchestrator owns _buildPlexResourceUrl for security)
    buildPlexResourceUrl: (pathOrUrl: string | null) => string | null;

    // Optional: seed subtitle language from Plex profile when unset
    seedSubtitleLanguageFromPlexUser?: () => void;
}

/**
 * Public interface for the InitializationCoordinator.
 */
export interface IInitializationCoordinator {
    /**
     * Run the startup sequence starting from the specified phase.
     * Phases 1-5 execute in order; earlier phases are skipped if startPhase > 1.
     */
    runStartup(startPhase: 1 | 2 | 3 | 4 | 5): Promise<void>;

    /**
     * Check if a startup sequence is currently in progress.
     */
    isStartupInProgress(): boolean;

    /**
     * Ensure EPG is initialized (for lazy initialization outside startup flow).
     */
    ensureEPGInitialized(): Promise<void>;

    /**
     * Clear auth resume listener (cleanup).
     */
    clearAuthResume(): void;

    /**
     * Clear server resume listener (cleanup).
     */
    clearServerResume(): void;
}

// ============================================
// Implementation
// ============================================

/**
 * InitializationCoordinator - Manages the 5-phase startup sequence.
 *
 * Extracted from Orchestrator to reduce its size and improve modularity.
 * The coordinator is instantiated by Orchestrator with injected dependencies
 * and callbacks, allowing bidirectional communication without tight coupling.
 */
export class InitializationCoordinator implements IInitializationCoordinator {
    // Startup state
    private _startupInProgress = false;
    private _startupQueuedPhase: 1 | 2 | 3 | 4 | 5 | null = null;
    private _startupQueuedWaiters: Array<{ resolve: () => void; reject: (err: unknown) => void }> = [];

    // Resume listeners
    private _authResumeDisposable: IDisposable | null = null;
    private _serverResumeDisposable: IDisposable | null = null;

    // EPG init promise (prevents duplicate initialization)
    private _epgInitPromise: Promise<void> | null = null;
    private _nowPlayingInfoInitPromise: Promise<void> | null = null;
    private _playbackOptionsInitPromise: Promise<void> | null = null;

    constructor(
        private readonly _config: OrchestratorConfig,
        private readonly _deps: InitializationDependencies,
        private readonly _callbacks: InitializationCallbacks
    ) { }

    // ============================================
    // Public Methods
    // ============================================

    async runStartup(startPhase: 1 | 2 | 3 | 4 | 5): Promise<void> {
        if (this._startupInProgress) {
            console.warn('[InitializationCoordinator] Startup already in progress; queuing follow-up run');
            this._startupQueuedPhase = this._startupQueuedPhase === null
                ? startPhase
                : (Math.min(this._startupQueuedPhase, startPhase) as 1 | 2 | 3 | 4 | 5);
            return new Promise((resolve, reject) => {
                this._startupQueuedWaiters.push({ resolve, reject });
            });
        }

        this._startupInProgress = true;
        let phaseToRun: 1 | 2 | 3 | 4 | 5 = startPhase;
        let caughtError: unknown = null;

        try {
            while (true) {
                this._callbacks.setReady(false);

                // Force phase to initializing to ensure 'ready' event is emitted at the end
                if (this._deps.lifecycle) {
                    this._deps.lifecycle.setPhase('initializing');
                }

                if (phaseToRun <= 1) {
                    await this._initPhase1();
                }

                if (phaseToRun <= 2) {
                    const authValid = await this._initPhase2();
                    if (!authValid) {
                        console.warn('[InitializationCoordinator] Phase 2 failed (auth not valid)');
                        if (this._startupQueuedPhase === null) {
                            break;
                        }
                        phaseToRun = this._startupQueuedPhase;
                        this._startupQueuedPhase = null;
                        continue;
                    }
                }

                if (phaseToRun <= 3) {
                    console.warn('[InitializationCoordinator] Starting Phase 3 (Plex Connection)');
                    const plexConnected = await this._initPhase3();
                    if (!plexConnected) {
                        console.warn('[InitializationCoordinator] Phase 3 failed (not connected)');
                        if (this._startupQueuedPhase === null) {
                            break;
                        }
                        phaseToRun = this._startupQueuedPhase;
                        this._startupQueuedPhase = null;
                        continue;
                    }
                }

                if (phaseToRun <= 4) {
                    console.warn('[InitializationCoordinator] Starting Phase 4 (Channels & Player)');
                    await this._initPhase4();
                }

                if (phaseToRun <= 5) {
                    console.warn('[InitializationCoordinator] Starting Phase 5 (EPG)');
                    await this._initPhase5();
                }

                console.warn('[InitializationCoordinator] Phases complete. Setting up wiring.');
                this._callbacks.setupEventWiring();
                this._callbacks.setReady(true);
                if (this._deps.lifecycle) {
                    this._deps.lifecycle.setPhase('ready');
                }

                if (this._deps.navigation) {
                    const shouldRunAudioSetup = this._callbacks.shouldRunAudioSetup();
                    const shouldRunSetup = this._callbacks.shouldRunChannelSetup();

                    if (shouldRunAudioSetup && shouldRunSetup) {
                        // First-time user: audio setup → channel setup
                        console.warn('[InitializationCoordinator] Audio setup required. Navigating to audio setup wizard.');
                        this._deps.navigation.replaceScreen('audio-setup');
                    } else if (shouldRunSetup) {
                        console.warn('[InitializationCoordinator] Channel setup required. Navigating to setup wizard.');
                        this._deps.navigation.replaceScreen('channel-setup');
                    } else {
                        console.warn('[InitializationCoordinator] Navigating to player');
                        this._deps.navigation.replaceScreen('player');
                        if (this._deps.channelManager) {
                            console.warn('[InitializationCoordinator] Switching to current channel');

                            let channelToPlay = this._deps.channelManager.getCurrentChannel();

                            // Fallback: If no current channel but we have channels, pick the first one
                            if (!channelToPlay) {
                                const allChannels = this._deps.channelManager.getAllChannels();
                                const firstChannel = allChannels[0];
                                if (firstChannel) {
                                    channelToPlay = firstChannel;
                                    console.warn(`[InitializationCoordinator] No current channel set. Defaulting to first channel: ${firstChannel.name}`);
                                }
                            }

                            if (channelToPlay) {
                                await this._callbacks.switchToChannel(channelToPlay.id);
                            } else {
                                console.warn('[InitializationCoordinator] No current channel found. Redirecting to Server Select.');
                                this._callbacks.openServerSelect();
                            }
                        }
                    }
                }

                console.warn('[InitializationCoordinator] Startup sequence finished successfully');

                this.clearAuthResume();
                this.clearServerResume();

                if (this._startupQueuedPhase === null) {
                    break;
                }
                phaseToRun = this._startupQueuedPhase;
                this._startupQueuedPhase = null;
            }
        } catch (error: unknown) {
            caughtError = error;
            const message = error instanceof Error ? error.message : String(error);
            // Avoid leaving stale resume listeners after a fatal startup error.
            this.clearAuthResume();
            this.clearServerResume();
            this._callbacks.handleGlobalError(
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
            for (const waiter of waiters) {
                try {
                    if (caughtError) {
                        waiter.reject(caughtError);
                    } else {
                        waiter.resolve();
                    }
                } catch {
                    // Ignore waiter failures
                }
            }
        }

        // Rethrow after cleanup so direct callers receive a rejected Promise
        if (caughtError) {
            throw caughtError;
        }
    }

    isStartupInProgress(): boolean {
        return this._startupInProgress;
    }

    async ensureEPGInitialized(): Promise<void> {
        await this._initPhase5();
    }

    clearAuthResume(): void {
        if (this._authResumeDisposable) {
            this._authResumeDisposable.dispose();
            this._authResumeDisposable = null;
        }
    }

    clearServerResume(): void {
        if (this._serverResumeDisposable) {
            this._serverResumeDisposable.dispose();
            this._serverResumeDisposable = null;
        }
    }

    // ============================================
    // Private Methods - Initialization Phases
    // ============================================

    /**
     * Phase 1: Initialize core infrastructure (EventEmitter, AppLifecycle, Navigation)
     */
    private async _initPhase1(): Promise<void> {
        const startTime = Date.now();

        // EventEmitter is already ready (synchronous)
        this._callbacks.updateModuleStatus('event-emitter', 'ready', undefined, 0);

        // Initialize Lifecycle and Navigation in parallel
        const promises: Promise<void>[] = [];

        if (this._deps.lifecycle) {
            this._callbacks.updateModuleStatus('app-lifecycle', 'initializing');
            promises.push(
                this._deps.lifecycle.initialize().then(() => {
                    this._callbacks.updateModuleStatus(
                        'app-lifecycle',
                        'ready',
                        undefined,
                        Date.now() - startTime
                    );
                })
            );
        }

        if (this._deps.navigation && this._config) {
            this._callbacks.updateModuleStatus('navigation', 'initializing');
            this._deps.navigation.initialize(this._config.navConfig);
            this._callbacks.updateModuleStatus(
                'navigation',
                'ready',
                undefined,
                Date.now() - startTime
            );
        }

        await Promise.all(promises);

        if (this._deps.lifecycle) {
            this._deps.lifecycle.setPhase('authenticating');
        }
    }

    /**
     * Phase 2: Validate authentication
     */
    private async _initPhase2(): Promise<boolean> {
        const startTime = Date.now();
        this._callbacks.updateModuleStatus('plex-auth', 'initializing');

        if (!this._deps.plexAuth || !this._deps.navigation) {
            this._callbacks.updateModuleStatus('plex-auth', 'error');
            return false;
        }

        // Check for stored auth credentials (SSOT: PlexAuth storage)
        const storedCredentials = await this._deps.plexAuth.getStoredCredentials();
        if (storedCredentials) {
            try {
                const isValid = await this._deps.plexAuth.validateToken(
                    storedCredentials.token.token
                );

                if (isValid) {
                    const currentToken =
                        this._deps.plexAuth.getCurrentUser() ?? storedCredentials.token;
                    await this._deps.plexAuth.storeCredentials({
                        token: currentToken,
                        selectedServerId: null,
                        selectedServerUri: null,
                    });
                    this._callbacks.seedSubtitleLanguageFromPlexUser?.();
                    this._callbacks.updateModuleStatus(
                        'plex-auth',
                        'ready',
                        undefined,
                        Date.now() - startTime
                    );

                    if (this._deps.lifecycle) {
                        this._deps.lifecycle.setPhase('loading_data');
                    }
                    return true;
                }
            } catch (error) {
                console.error('Token validation failed:', error);
            }
        }

        // No valid auth - navigate to auth screen
        this._callbacks.updateModuleStatus('plex-auth', 'pending');
        this._registerAuthResume();
        this._deps.navigation.goTo('auth');
        return false;
    }

    /**
     * Phase 3: Connect to Plex server and initialize Plex services
     */
    private async _initPhase3(): Promise<boolean> {
        const startTime = Date.now();

        if (
            !this._deps.plexDiscovery ||
            !this._deps.plexLibrary ||
            !this._deps.plexStreamResolver ||
            !this._deps.navigation
        ) {
            return false;
        }

        // Discover servers and restore selection (SSOT: discovery storage)
        this._callbacks.updateModuleStatus('plex-server-discovery', 'initializing');
        try {
            await this._deps.plexDiscovery.initialize();
        } catch (error) {
            console.error('Server discovery failed:', error);
            this._callbacks.updateModuleStatus('plex-server-discovery', 'error');
            if (this._deps.navigation) {
                this._deps.navigation.goTo('server-select');
            }
            return false;
        }

        const elapsedMs = Date.now() - startTime;
        const isConnected = this._deps.plexDiscovery.isConnected();

        if (!isConnected) {
            // Discovery completed, but server selection/connection is still required.
            this._callbacks.updateModuleStatus('plex-server-discovery', 'pending', undefined, elapsedMs);
            this._callbacks.updateModuleStatus('plex-library', 'pending', undefined, elapsedMs);
            this._callbacks.updateModuleStatus('plex-stream-resolver', 'pending', undefined, elapsedMs);
            this._registerServerResume();
            this._deps.navigation.goTo('server-select');
            return false;
        }

        this._callbacks.updateModuleStatus('plex-server-discovery', 'ready', undefined, elapsedMs);

        // Mark library and stream resolver as ready (they use discovery + connection)
        this._callbacks.updateModuleStatus(
            'plex-library',
            'ready',
            undefined,
            elapsedMs
        );
        this._callbacks.updateModuleStatus(
            'plex-stream-resolver',
            'ready',
            undefined,
            elapsedMs
        );

        return true;
    }

    /**
     * Phase 4: Initialize Channel Manager, Scheduler, and Video Player
     */
    private async _initPhase4(): Promise<void> {
        const startTime = Date.now();

        // Channel Manager
        if (this._deps.channelManager) {
            this._callbacks.updateModuleStatus('channel-manager', 'initializing');
            await this._callbacks.configureChannelManagerStorage();
            await this._deps.channelManager.loadChannels();

            this._callbacks.updateModuleStatus(
                'channel-manager',
                'ready',
                undefined,
                Date.now() - startTime
            );
        }

        // Channel Scheduler (no async init needed)
        if (this._deps.scheduler) {
            this._callbacks.updateModuleStatus(
                'channel-scheduler',
                'ready',
                undefined,
                Date.now() - startTime
            );
        } else {
            this._callbacks.updateModuleStatus('channel-scheduler', 'disabled');
        }

        // Video Player
        if (this._deps.videoPlayer && this._config) {
            this._callbacks.updateModuleStatus('video-player', 'initializing');
            await this._deps.videoPlayer.initialize({
                ...this._config.playerConfig,
            });

            // Request Media Session integration (once per app lifetime)
            this._deps.videoPlayer.requestMediaSession();

            this._callbacks.updateModuleStatus(
                'video-player',
                'ready',
                undefined,
                Date.now() - startTime
            );
        }

        if (this._deps.playerOsd && this._config) {
            this._callbacks.updateModuleStatus('player-osd-ui', 'initializing');
            this._deps.playerOsd.initialize(this._config.playerOsdConfig);
            this._callbacks.updateModuleStatus(
                'player-osd-ui',
                'ready',
                undefined,
                Date.now() - startTime
            );
        }

        if (this._deps.channelTransition && this._config) {
            this._callbacks.updateModuleStatus('channel-transition-ui', 'initializing');
            this._deps.channelTransition.initialize(this._config.channelTransitionConfig);
            this._callbacks.updateModuleStatus(
                'channel-transition-ui',
                'ready',
                undefined,
                Date.now() - startTime
            );
        }

        if (this._isDebugLoggingEnabled()) {
            console.warn('[InitializationCoordinator] Phase 4 complete');
        }
    }

    /**
     * Phase 5: Initialize EPG
     */
    private async _initPhase5(): Promise<void> {
        if (this._callbacks.getModuleStatus('epg-ui') === 'ready') {
            await this._initNowPlayingInfoUI();
            return;
        }
        if (this._epgInitPromise) {
            await this._epgInitPromise;
            return;
        }
        if (!this._deps.epg || !this._config) {
            return;
        }

        const startTime = Date.now();
        this._callbacks.updateModuleStatus('epg-ui', 'initializing');
        const init = async (): Promise<void> => {
            // Wire thumb resolver callback to convert relative Plex paths to absolute URLs
            const epgConfigWithResolver = {
                ...this._config.epgConfig,
                resolveThumbUrl: (
                    pathOrUrl: string | null,
                    width?: number,
                    height?: number
                ): string | null => {
                    if (!pathOrUrl) return null;
                    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
                        return pathOrUrl;
                    }
                    const plexLibrary = this._deps.plexLibrary;
                    if (plexLibrary) {
                        const resized = plexLibrary.getImageUrl(pathOrUrl, width, height);
                        if (resized) return resized;
                    }
                    return this._callbacks.buildPlexResourceUrl(pathOrUrl);
                },
                isVideoPlaying: (): boolean => this._deps.videoPlayer?.isPlaying?.() ?? false,
            };
            this._deps.epg!.initialize(epgConfigWithResolver);
            this._callbacks.updateModuleStatus(
                'epg-ui',
                'ready',
                undefined,
                Date.now() - startTime
            );
        };
        this._epgInitPromise = init()
            .catch((e) => {
                this._callbacks.updateModuleStatus('epg-ui', 'error');
                throw e;
            })
            .finally(() => {
                this._epgInitPromise = null;
            });

        await this._epgInitPromise;
        await this._initNowPlayingInfoUI();
    }

    private async _initNowPlayingInfoUI(): Promise<void> {
        if (this._callbacks.getModuleStatus('now-playing-info-ui') === 'ready') {
            return;
        }
        if (this._nowPlayingInfoInitPromise) {
            await this._nowPlayingInfoInitPromise;
            return;
        }
        if (!this._deps.nowPlayingInfo || !this._config) {
            return;
        }

        const startTime = Date.now();
        this._callbacks.updateModuleStatus('now-playing-info-ui', 'initializing');
        const init = async (): Promise<void> => {
            this._deps.nowPlayingInfo!.initialize(this._config.nowPlayingInfoConfig);
            this._callbacks.updateModuleStatus(
                'now-playing-info-ui',
                'ready',
                undefined,
                Date.now() - startTime
            );
        };
        this._nowPlayingInfoInitPromise = init()
            .catch((e) => {
                this._callbacks.updateModuleStatus('now-playing-info-ui', 'error');
                throw e;
            })
            .finally(() => {
                this._nowPlayingInfoInitPromise = null;
            });

        await this._nowPlayingInfoInitPromise;
        await this._initPlaybackOptionsUI();
    }

    private async _initPlaybackOptionsUI(): Promise<void> {
        if (this._callbacks.getModuleStatus('playback-options-ui') === 'ready') {
            return;
        }
        if (this._playbackOptionsInitPromise) {
            await this._playbackOptionsInitPromise;
            return;
        }
        if (!this._deps.playbackOptions || !this._config) {
            return;
        }

        const startTime = Date.now();
        this._callbacks.updateModuleStatus('playback-options-ui', 'initializing');
        const init = async (): Promise<void> => {
            this._deps.playbackOptions!.initialize(this._config.playbackOptionsConfig);
            this._callbacks.updateModuleStatus(
                'playback-options-ui',
                'ready',
                undefined,
                Date.now() - startTime
            );
        };
        this._playbackOptionsInitPromise = init()
            .catch((e) => {
                this._callbacks.updateModuleStatus('playback-options-ui', 'error');
                throw e;
            })
            .finally(() => {
                this._playbackOptionsInitPromise = null;
            });

        await this._playbackOptionsInitPromise;
    }

    // ============================================
    // Private Methods - Resume Handlers
    // ============================================

    /**
     * Register listener for auth state changes to resume startup.
     */
    private _registerAuthResume(): void {
        if (!this._deps.plexAuth) {
            return;
        }

        this.clearAuthResume();
        const disposable = this._deps.plexAuth.on('authChange', (isAuthenticated) => {
            if (!isAuthenticated) {
                return;
            }
            this.clearAuthResume();
            this.runStartup(2).catch((error) => {
                console.error('[InitializationCoordinator] Auth resume failed:', error);
            });
        });
        this._authResumeDisposable = disposable;
    }

    /**
     * Register listener for server connection changes to resume startup.
     */
    private _registerServerResume(): void {
        if (!this._deps.plexDiscovery) {
            return;
        }

        this.clearServerResume();
        const disposable = this._deps.plexDiscovery.on('connectionChange', (uri) => {
            if (!uri) {
                return;
            }
            this.clearServerResume();
            this.runStartup(3).catch((error) => {
                console.error('[InitializationCoordinator] Server resume failed:', error);
            });
        });
        this._serverResumeDisposable = disposable;
    }

    private _isDebugLoggingEnabled(): boolean {
        try {
            return isStoredTrue(safeLocalStorageGet(RETUNE_STORAGE_KEYS.DEBUG_LOGGING));
        } catch {
            return false;
        }
    }
}
