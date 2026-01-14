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

import { type IAppLifecycle, type AppError } from '../modules/lifecycle';
import type { INavigationManager } from '../modules/navigation';
import type { IPlexAuth } from '../modules/plex/auth';
import type { IPlexServerDiscovery } from '../modules/plex/discovery';
import type { IPlexLibrary } from '../modules/plex/library';
import type { IPlexStreamResolver } from '../modules/plex/stream';
import type { IChannelManager } from '../modules/scheduler/channel-manager';
import type { IChannelScheduler } from '../modules/scheduler/scheduler';
import type { IVideoPlayer } from '../modules/player';
import type { IEPGComponent } from '../modules/ui/epg';
import type { IDisposable } from '../utils/interfaces';
import type { AppMode } from '../types';
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

    // Error handling
    handleGlobalError: (error: AppError, context: string) => void;

    // State management
    setReady: (ready: boolean) => void;

    // Event wiring (called after phases complete)
    setupEventWiring: () => void;

    // Server/storage operations (kept in Orchestrator)
    configureChannelManagerStorage: () => Promise<void>;
    getSelectedServerId: () => string | null;
    shouldRunChannelSetup: () => boolean;
    switchToChannel: (id: string) => Promise<void>;
    openServerSelect: () => void;

    // EPG thumb resolver (Orchestrator owns _buildPlexResourceUrl for security)
    buildPlexResourceUrl: (pathOrUrl: string | null) => string | null;
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
    private _startupQueuedWaiters: Array<() => void> = [];

    // Resume listeners
    private _authResumeDisposable: IDisposable | null = null;
    private _serverResumeDisposable: IDisposable | null = null;

    // EPG init promise (prevents duplicate initialization)
    private _epgInitPromise: Promise<void> | null = null;

    constructor(
        private readonly _config: OrchestratorConfig,
        private readonly _deps: InitializationDependencies,
        private readonly _callbacks: InitializationCallbacks,
        private readonly _mode: AppMode
    ) { }

    // ============================================
    // Public Methods
    // ============================================

    async runStartup(_startPhase: 1 | 2 | 3 | 4 | 5): Promise<void> {
        // Placeholder references to satisfy noUnusedLocals until implementation is complete
        // These will be removed as each method gets real implementation in Phase 2-3
        void this._config;
        void this._deps;
        void this._callbacks;
        void this._mode;
        void this._startupQueuedPhase;
        void this._startupQueuedWaiters;
        void this._epgInitPromise;
        void this._initPhase1;
        void this._initPhase2;
        void this._initPhase3;
        void this._initPhase4;
        void this._initPhase5;
        void this._registerAuthResume;
        void this._registerServerResume;
        // TODO: Implement in Phase 3
        throw new Error('Not implemented');
    }

    isStartupInProgress(): boolean {
        return this._startupInProgress;
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
        // TODO: Extract from Orchestrator in Phase 2
    }

    /**
     * Phase 2: Validate authentication
     */
    private async _initPhase2(): Promise<boolean> {
        // TODO: Extract from Orchestrator in Phase 2
        return false;
    }

    /**
     * Phase 3: Connect to Plex server and initialize Plex services
     */
    private async _initPhase3(): Promise<boolean> {
        // TODO: Extract from Orchestrator in Phase 2
        return false;
    }

    /**
     * Phase 4: Initialize Channel Manager, Scheduler, and Video Player
     */
    private async _initPhase4(): Promise<void> {
        // TODO: Extract from Orchestrator in Phase 2
    }

    /**
     * Phase 5: Initialize EPG
     */
    private async _initPhase5(): Promise<void> {
        // TODO: Extract from Orchestrator in Phase 2
    }

    // ============================================
    // Private Methods - Resume Handlers
    // ============================================

    /**
     * Register listener for auth state changes to resume startup.
     */
    private _registerAuthResume(): void {
        // TODO: Extract from Orchestrator in Phase 3
    }

    /**
     * Register listener for server connection changes to resume startup.
     */
    private _registerServerResume(): void {
        // TODO: Extract from Orchestrator in Phase 3
    }
}
