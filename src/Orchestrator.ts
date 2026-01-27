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
import { STORAGE_KEYS } from './types';
import {
    NavigationManager,
    type INavigationManager,
    type NavigationConfig,
    type Screen,
} from './modules/navigation';
import { NavigationCoordinator } from './modules/navigation/NavigationCoordinator';
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
    type PlexLibraryConfig,
} from './modules/plex/library';
import {
    PlexStreamResolver,
    type IPlexStreamResolver,
    type PlexStreamResolverConfig,
    type StreamDecision,
    type StreamResolverError,
    mapPlexStreamErrorCodeToAppErrorCode,
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
    type PlaybackState,
    type PlaybackError,
    type TimeRange,
    mapPlayerErrorCodeToAppErrorCode,
} from './modules/player';
import { BURN_IN_SUBTITLE_FORMATS } from './modules/player/constants';
import { PlaybackRecoveryManager } from './modules/player/PlaybackRecoveryManager';
import {
    EPGComponent,
    type IEPGComponent,
    type EPGConfig,
} from './modules/ui/epg';
import { EPGCoordinator, type EpgUiStatus } from './modules/ui/epg/EPGCoordinator';
import {
    NowPlayingInfoOverlay,
    type INowPlayingInfoOverlay,
    type NowPlayingInfoConfig,
    NOW_PLAYING_INFO_MODAL_ID,
} from './modules/ui/now-playing-info';
import {
    PlayerOsdOverlay,
    type IPlayerOsdOverlay,
    type PlayerOsdConfig,
} from './modules/ui/player-osd';
import { PlayerOsdCoordinator } from './modules/ui/player-osd/PlayerOsdCoordinator';
import {
    ChannelTransitionOverlay,
    type IChannelTransitionOverlay,
    type ChannelTransitionConfig,
} from './modules/ui/channel-transition';
import { ChannelTransitionCoordinator } from './modules/ui/channel-transition/ChannelTransitionCoordinator';
import {
    PlaybackOptionsModal,
    type IPlaybackOptionsModal,
    type PlaybackOptionsConfig,
    PLAYBACK_OPTIONS_MODAL_ID,
} from './modules/ui/playback-options';
import {
    InitializationCoordinator,
    ChannelTuningCoordinator,
    type IInitializationCoordinator,
} from './core';
import { ChannelSetupCoordinator } from './core/channel-setup';
import type {
    ChannelSetupConfig,
    ChannelBuildSummary,
    ChannelBuildProgress,
    ChannelSetupRecord,
    ChannelSetupPreview,
    ChannelSetupReview,
} from './core/channel-setup/types';
import { NowPlayingDebugManager } from './modules/debug/NowPlayingDebugManager';
import {
    NowPlayingInfoCoordinator,
    getNowPlayingInfoAutoHideMs,
} from './modules/ui/now-playing-info/NowPlayingInfoCoordinator';
import { PlaybackOptionsCoordinator } from './modules/ui/playback-options';
import type { IDisposable } from './utils/interfaces';
import { createMulberry32 } from './utils/prng';
import {
    isStoredTrue,
    readStoredBoolean,
    safeLocalStorageGet,
    safeLocalStorageRemove,
    safeLocalStorageSet,
} from './utils/storage';
import { RETUNE_STORAGE_KEYS } from './config/storageKeys';
import { getRecoveryActions as getRecoveryActionsHelper } from './core/error-recovery/RecoveryActions';
import { toLifecycleAppError as toLifecycleAppErrorHelper } from './core/error-recovery/LifecycleErrorAdapter';
import type { ErrorRecoveryAction } from './core/error-recovery/types';

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

export type {
    ChannelSetupConfig,
    ChannelBuildSummary,
    ChannelBuildProgress,
    ChannelSetupRecord,
    ChannelSetupPreview,
    ChannelSetupReview,
} from './core/channel-setup/types';

export interface PlaybackInfoSnapshot {
    channel: { id: string; number: number; name: string } | null;
    program:
    | {
        itemKey: string;
        title: string;
        fullTitle: string;
        type: string;
        scheduledStartTime: number;
        scheduledEndTime: number;
        elapsedMs: number;
        remainingMs: number;
    }
    | null;
    stream:
    | {
        protocol: StreamDescriptor['protocol'];
        mimeType: string;
        isDirectPlay: boolean;
        isTranscoding: boolean;
        container: string;
        videoCodec: string;
        audioCodec: string;
        subtitleDelivery: StreamDecision['subtitleDelivery'];
        bitrate: number;
        width: number;
        height: number;
        sessionId: string;
        selectedAudio:
        | {
            id: string;
            codec: string | null | undefined;
            channels?: number;
            language?: string;
            title?: string;
            default?: boolean;
        }
        | null;
        selectedSubtitle:
        | {
            id: string;
            codec: string | null | undefined;
            language?: string;
            title?: string;
            format?: string;
            default?: boolean;
        }
        | null;
        directPlay?: StreamDecision['directPlay'];
        audioFallback?: StreamDecision['audioFallback'];
        source?: StreamDecision['source'];
        transcodeRequest?: StreamDecision['transcodeRequest'];
        serverDecision?: StreamDecision['serverDecision'];
    }
    | null;
}

/**
 * Orchestrator configuration (module configs passed at initialization)
 */
export interface OrchestratorConfig {
    plexConfig: PlexAuthConfig;
    playerConfig: VideoPlayerConfig;
    navConfig: NavigationConfig;
    epgConfig: EPGConfig;
    nowPlayingInfoConfig: NowPlayingInfoConfig;
    playbackOptionsConfig: PlaybackOptionsConfig;
    playerOsdConfig: PlayerOsdConfig;
    channelTransitionConfig: ChannelTransitionConfig;
}

export type { ErrorRecoveryAction } from './core/error-recovery/types';

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
    getPlaybackInfoSnapshot(): PlaybackInfoSnapshot;
    refreshPlaybackInfoSnapshot(): Promise<PlaybackInfoSnapshot>;
    setSubtitleTrack(trackId: string | null): Promise<void>;
    switchToChannel(channelId: string, options?: { signal?: AbortSignal }): Promise<void>;
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
    getLibrariesForSetup(signal?: AbortSignal | null): Promise<PlexLibraryType[]>;
    getChannelSetupRecord(serverId: string): ChannelSetupRecord | null;
    getSetupPreview(config: ChannelSetupConfig, options?: { signal?: AbortSignal }): Promise<ChannelSetupPreview>;
    getSetupReview(config: ChannelSetupConfig, options?: { signal?: AbortSignal }): Promise<ChannelSetupReview>;
    createChannelsFromSetup(config: ChannelSetupConfig, options?: { signal?: AbortSignal; onProgress?: (p: ChannelBuildProgress) => void }): Promise<ChannelBuildSummary>;
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
    setNowPlayingHandler(handler: ((message: string) => void) | null): void;
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
    private _epgCoordinator: EPGCoordinator | null = null;
    private _nowPlayingInfo: INowPlayingInfoOverlay | null = null;
    private _nowPlayingInfoCoordinator: NowPlayingInfoCoordinator | null = null;
    private _playerOsd: PlayerOsdOverlay | null = null;
    private _channelTransitionOverlay: ChannelTransitionOverlay | null = null;
    private _playerOsdCoordinator: PlayerOsdCoordinator | null = null;
    private _channelTransitionCoordinator: ChannelTransitionCoordinator | null = null;
    private _playbackOptionsModal: IPlaybackOptionsModal | null = null;
    private _playbackOptionsCoordinator: PlaybackOptionsCoordinator | null = null;
    private _nowPlayingDebugManager: NowPlayingDebugManager | null = null;
    private _playbackRecovery: PlaybackRecoveryManager | null = null;
    private _channelTuning: ChannelTuningCoordinator | null = null;
    private _navigationCoordinator: NavigationCoordinator | null = null;
    private _nowPlayingHandler: ((message: string) => void) | null = null;
    private _pendingNowPlayingChannelId: string | null = null;
    private _lastChannelChangeSource: 'remote' | 'number' | 'guide' | null = null;
    private _activeScheduleDayKey: number | null = null;
    private _pendingDayRolloverDayKey: number | null = null;
    private _pendingDayRolloverTimer: ReturnType<typeof setTimeout> | null = null;

    private _config: OrchestratorConfig | null = null;
    private _moduleStatus: Map<string, ModuleStatus> = new Map();
    private _errorHandlers: Map<string, (error: AppError) => boolean> = new Map();
    private _eventUnsubscribers: Array<() => void> = [];
    private _eventsWired: boolean = false;
    private _ready: boolean = false;
    private _initCoordinator: IInitializationCoordinator | null = null;
    private _channelSetup: ChannelSetupCoordinator | null = null;

    private _currentProgramForPlayback: ScheduledProgram | null = null;
    private _currentStreamDescriptor: StreamDescriptor | null = null;
    private _currentStreamDecision: StreamDecision | null = null;

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
        if (this._config.nowPlayingInfoConfig) {
            const previousOnAutoHide = this._config.nowPlayingInfoConfig.onAutoHide ?? null;
            this._config.nowPlayingInfoConfig.onAutoHide = (): void => {
                if (previousOnAutoHide) {
                    previousOnAutoHide();
                }
                if (this._navigation?.isModalOpen(NOW_PLAYING_INFO_MODAL_ID)) {
                    this._navigation.closeModal(NOW_PLAYING_INFO_MODAL_ID);
                }
            };
        }

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
        const plexLibrary = new PlexLibrary(plexLibraryConfig);
        this._plexLibrary = plexLibrary;

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
        const plexStreamResolver = new PlexStreamResolver(streamResolverConfig);
        this._plexStreamResolver = plexStreamResolver;

        // ChannelManager needs config
        const channelManagerConfig: ChannelManagerConfig = {
            plexLibrary: plexLibrary,
            storageKey: STORAGE_KEYS.CHANNELS_REAL,
            currentChannelKey: STORAGE_KEYS.CURRENT_CHANNEL,
        };
        this._channelManager = new ChannelManager(channelManagerConfig);

        // ChannelScheduler - no init args
        this._scheduler = new ChannelScheduler();

        // VideoPlayer - no constructor args, initialize later
        this._videoPlayer = new VideoPlayer();

        // EPGComponent - no constructor args, initialize later
        this._epg = new EPGComponent();

        // Now Playing Info overlay - no constructor args, initialize later
        this._nowPlayingInfo = new NowPlayingInfoOverlay();

        // Player OSD overlay - no constructor args, initialize later
        this._playerOsd = new PlayerOsdOverlay();

        // Channel transition overlay - no constructor args, initialize later
        this._channelTransitionOverlay = new ChannelTransitionOverlay();

        // Playback Options modal - no constructor args, initialize later
        this._playbackOptionsModal = new PlaybackOptionsModal();

        this._epgCoordinator = new EPGCoordinator({
            getEpg: (): IEPGComponent | null => this._epg,
            getChannelManager: (): IChannelManager | null => this._channelManager,
            getScheduler: (): IChannelScheduler | null => this._scheduler,
            getEpgUiStatus: (): EpgUiStatus => this._moduleStatus.get('epg-ui')?.status as EpgUiStatus,
            ensureEpgInitialized: (): Promise<void> =>
                this._initCoordinator?.ensureEPGInitialized() ?? Promise.resolve(),
            getEpgConfig: (): EPGConfig | null => this._config?.epgConfig ?? null,
            getLocalMidnightMs: (t: number): number => this._getLocalMidnightMs(t),
            buildDailyScheduleConfig: (
                channel: ChannelConfig,
                items: ResolvedChannelContent['items'],
                referenceTimeMs: number
            ): ScheduleConfig => this._buildDailyScheduleConfig(channel, items, referenceTimeMs),
            getPreserveFocusOnOpen: (): boolean => this._lastChannelChangeSource === 'guide',
            setLastChannelChangeSourceToGuide: (): void => {
                this._lastChannelChangeSource = 'guide';
            },
            switchToChannel: (channelId: string): Promise<void> => this.switchToChannel(channelId),
        });

        this._channelSetup = new ChannelSetupCoordinator({
            getPlexLibrary: (): IPlexLibrary | null => this._plexLibrary,
            getChannelManager: (): IChannelManager | null => this._channelManager,
            getNavigation: (): INavigationManager | null => this._navigation,
            getSelectedServerId: (): string | null => this._getSelectedServerId(),
            storageGet: (key: string): string | null => safeLocalStorageGet(key),
            storageSet: (key: string, value: string): void => {
                safeLocalStorageSet(key, value);
            },
            storageRemove: (key: string): void => {
                safeLocalStorageRemove(key);
            },
            handleGlobalError: (error: AppError, context: string): void => this.handleGlobalError(error, context),
            primeEpgChannels: (): void => this._epgCoordinator?.primeEpgChannels(),
            refreshEpgSchedules: (): Promise<void> => this._epgCoordinator?.refreshEpgSchedules() ?? Promise.resolve(),
        });
        this._channelSetup.cleanupStaleChannelBuildKeys();

        this._nowPlayingDebugManager = new NowPlayingDebugManager({
            nowPlayingModalId: NOW_PLAYING_INFO_MODAL_ID,
            getNavigation: (): INavigationManager | null => this._navigation,
            getStreamResolver: (): IPlexStreamResolver | null => this._plexStreamResolver,
            getNowPlayingInfo: (): INowPlayingInfoOverlay | null => this._nowPlayingInfo,
            getCurrentProgram: (): ScheduledProgram | null =>
                this._scheduler?.getCurrentProgram() ?? this._currentProgramForPlayback,
            getCurrentStreamDecision: (): StreamDecision | null => this._currentStreamDecision,
            requestNowPlayingOverlayRefresh: (): void =>
                this._nowPlayingInfoCoordinator?.refreshIfOpen(),
        });

        this._nowPlayingInfoCoordinator = new NowPlayingInfoCoordinator({
            nowPlayingModalId: NOW_PLAYING_INFO_MODAL_ID,
            getNavigation: (): INavigationManager | null => this._navigation,
            getScheduler: (): IChannelScheduler | null => this._scheduler,
            getChannelManager: (): IChannelManager | null => this._channelManager,
            getPlexLibrary: (): IPlexLibrary | null => this._plexLibrary,
            getNowPlayingInfo: (): INowPlayingInfoOverlay | null => this._nowPlayingInfo,
            getNowPlayingInfoConfig: (): NowPlayingInfoConfig | null =>
                this._config?.nowPlayingInfoConfig ?? null,
            buildPlexResourceUrl: (pathOrUrl: string): string | null =>
                this._buildPlexResourceUrl(pathOrUrl),
            buildDebugText: (): string | null =>
                this._nowPlayingDebugManager?.buildNowPlayingStreamDebugText() ?? null,
            maybeFetchStreamDecisionForDebugHud: (): Promise<void> =>
                this._nowPlayingDebugManager?.maybeFetchNowPlayingStreamDecisionForDebugHud() ??
                Promise.resolve(),
            getAutoHideMs: (): number =>
                getNowPlayingInfoAutoHideMs(this._config?.nowPlayingInfoConfig),
            getCurrentProgramForPlayback: (): ScheduledProgram | null =>
                this._currentProgramForPlayback,
        });

        this._playerOsdCoordinator = new PlayerOsdCoordinator({
            getOverlay: (): IPlayerOsdOverlay | null => this._playerOsd,
            getCurrentProgram: (): ScheduledProgram | null =>
                this._scheduler?.getCurrentProgram() ?? this._currentProgramForPlayback,
            getCurrentChannel: (): ChannelConfig | null =>
                this._channelManager?.getCurrentChannel() ?? null,
            getVideoPlayer: (): IVideoPlayer | null => this._videoPlayer,
            getAutoHideMs: (): number =>
                this._config?.playerConfig.hideControlsAfterMs ?? 3000,
        });

        this._channelTransitionCoordinator = new ChannelTransitionCoordinator({
            getOverlay: (): IChannelTransitionOverlay | null => this._channelTransitionOverlay,
            getNavigation: (): INavigationManager | null => this._navigation,
            getVideoPlayer: (): IVideoPlayer | null => this._videoPlayer,
        });

        this._playbackOptionsCoordinator = new PlaybackOptionsCoordinator({
            playbackOptionsModalId: PLAYBACK_OPTIONS_MODAL_ID,
            getNavigation: (): INavigationManager | null => this._navigation,
            getPlaybackOptionsModal: (): IPlaybackOptionsModal | null => this._playbackOptionsModal,
            getVideoPlayer: (): IVideoPlayer | null => this._videoPlayer,
            getCurrentProgram: (): ScheduledProgram | null =>
                this._scheduler?.getCurrentProgram() ?? this._currentProgramForPlayback,
            notifyToast: (message: string): void => {
                this._nowPlayingHandler?.(message);
            },
        });

        this._playbackRecovery = new PlaybackRecoveryManager({
            getVideoPlayer: (): IVideoPlayer | null => this._videoPlayer,
            getStreamResolver: (): IPlexStreamResolver | null => this._plexStreamResolver,
            getScheduler: (): IChannelScheduler | null => this._scheduler,
            getCurrentProgramForPlayback: (): ScheduledProgram | null => this._currentProgramForPlayback,
            getCurrentStreamDescriptor: (): StreamDescriptor | null => this._currentStreamDescriptor,
            getCurrentStreamDecision: (): StreamDecision | null => this._currentStreamDecision,
            setCurrentStreamDecision: (decision: StreamDecision): void => {
                this._currentStreamDecision = decision;
            },
            setCurrentStreamDescriptor: (descriptor: StreamDescriptor): void => {
                this._currentStreamDescriptor = descriptor;
            },
            buildPlexResourceUrl: (pathOrUrl: string): string | null =>
                this._buildPlexResourceUrl(pathOrUrl),
            getMimeType: (decision: StreamDecision): string => this._getMimeType(decision),
            getAuthHeaders: (): Record<string, string> =>
                this._plexAuth?.getAuthHeaders() ?? {},
            getServerUri: (): string | null =>
                this._plexDiscovery?.getServerUri() ?? null,
            getPreferredSubtitleLanguage: (): string | null =>
                safeLocalStorageGet(RETUNE_STORAGE_KEYS.SUBTITLE_LANGUAGE),
            getPlexPreferredSubtitleLanguage: (): string | null =>
                this._plexAuth?.getCurrentUser()?.preferredSubtitleLanguage ?? null,
            notifySubtitleUnavailable: (): void => {
                if (this._nowPlayingHandler) {
                    this._nowPlayingHandler('Subtitles unavailable for this item');
                }
            },
            handleGlobalError: (error: AppError, context: string): void =>
                this.handleGlobalError(error, context),
        });

        this._channelTuning = new ChannelTuningCoordinator({
            getChannelManager: (): IChannelManager | null => this._channelManager,
            getScheduler: (): IChannelScheduler | null => this._scheduler,
            getVideoPlayer: (): IVideoPlayer | null => this._videoPlayer,
            buildDailyScheduleConfig: (
                channel: ChannelConfig,
                items: ResolvedChannelContent['items'],
                referenceTimeMs: number
            ): ScheduleConfig => this._buildDailyScheduleConfig(channel, items, referenceTimeMs),
            getLocalDayKey: (timeMs: number): number => this._getLocalDayKey(timeMs),
            setActiveScheduleDayKey: (dayKey: number): void => {
                this._activeScheduleDayKey = dayKey;
            },
            setPendingNowPlayingChannelId: (channelId: string | null): void => {
                this._pendingNowPlayingChannelId = channelId;
            },
            getPendingNowPlayingChannelId: (): string | null => this._pendingNowPlayingChannelId,
            notifyNowPlaying: (program: ScheduledProgram): void => {
                this._notifyNowPlaying(program);
            },
            resetPlaybackGuardsForNewChannel: (): void => {
                this._playbackRecovery?.resetPlaybackFailureGuard();
                this._playbackRecovery?.resetDirectFallbackAttempts();
            },
            stopActiveTranscodeSession: (): void => {
                this._stopActiveTranscodeSession();
            },
            armChannelTransitionForSwitch: (prefix: string): void => {
                this._channelTransitionCoordinator?.armForChannelSwitch(prefix);
            },
            handleGlobalError: (error: AppError, context: string): void =>
                this.handleGlobalError(error, context),
            saveLifecycleState: async (): Promise<void> => {
                if (this._lifecycle) {
                    await this._lifecycle.saveState();
                }
            },
        });

        this._navigationCoordinator = new NavigationCoordinator({
            getNavigation: (): INavigationManager | null => this._navigation,
            getEpg: (): IEPGComponent | null => this._epg,
            getVideoPlayer: (): IVideoPlayer | null => this._videoPlayer,
            getPlexAuth: (): IPlexAuth | null => this._plexAuth,
            stopPlayback: (): void => this._stopPlayback(),
            pokePlayerOsd: (reason): void => {
                this._playerOsdCoordinator?.poke(reason);
            },
            togglePlayerOsd: (): void => {
                this._playerOsdCoordinator?.toggle();
            },
            getSeekIncrementMs: (): number =>
                (this._config?.playerConfig.seekIncrementSec ?? 10) * 1000,
            isNowPlayingModalOpen: (): boolean => {
                const isOpen = this._navigation?.isModalOpen(NOW_PLAYING_INFO_MODAL_ID) ?? false;
                if (isOpen) {
                    this._nowPlayingInfo?.resetAutoHideTimer();
                }
                return isOpen;
            },
            toggleNowPlayingInfoOverlay: (): void => this._toggleNowPlayingInfoOverlay(),
            showNowPlayingInfoOverlay: (): void =>
                this._nowPlayingInfoCoordinator?.handleModalOpen(NOW_PLAYING_INFO_MODAL_ID),
            hideNowPlayingInfoOverlay: (): void =>
                this._nowPlayingInfoCoordinator?.handleModalClose(NOW_PLAYING_INFO_MODAL_ID),
            playbackOptionsModalId: PLAYBACK_OPTIONS_MODAL_ID,
            preparePlaybackOptionsModal: (): { focusableIds: string[]; preferredFocusId: string | null } =>
                this._playbackOptionsCoordinator?.prepareModal() ?? { focusableIds: [], preferredFocusId: null },
            showPlaybackOptionsModal: (): void =>
                this._playbackOptionsCoordinator?.handleModalOpen(PLAYBACK_OPTIONS_MODAL_ID),
            hidePlaybackOptionsModal: (): void =>
                this._playbackOptionsCoordinator?.handleModalClose(PLAYBACK_OPTIONS_MODAL_ID),
            setLastChannelChangeSourceRemote: (): void => {
                this._lastChannelChangeSource = 'remote';
            },
            setLastChannelChangeSourceNumber: (): void => {
                this._lastChannelChangeSource = 'number';
            },
            switchToNextChannel: (): void => this._switchToNextChannel(),
            switchToPreviousChannel: (): void => this._switchToPreviousChannel(),
            switchToChannelByNumber: (n: number): Promise<void> => this.switchToChannelByNumber(n),
            toggleEpg: (): void => this.toggleEPG(),
            shouldRunChannelSetup: (): boolean => this._channelSetup?.shouldRunChannelSetup() ?? false,
            hidePlayerOsd: (): void => {
                this._playerOsdCoordinator?.hide();
            },
            hideChannelTransition: (): void => {
                this._channelTransitionCoordinator?.hide();
            },
        });

        // Create InitializationCoordinator with dependencies and callbacks
        this._initCoordinator = new InitializationCoordinator(
            config,
            {
                lifecycle: this._lifecycle,
                navigation: this._navigation,
                plexAuth: this._plexAuth,
                plexDiscovery: this._plexDiscovery,
                plexLibrary: this._plexLibrary,
                plexStreamResolver: this._plexStreamResolver,
                channelManager: this._channelManager,
                scheduler: this._scheduler,
                videoPlayer: this._videoPlayer,
                epg: this._epg,
                nowPlayingInfo: this._nowPlayingInfo,
                playerOsd: this._playerOsd,
                channelTransition: this._channelTransitionOverlay,
                playbackOptions: this._playbackOptionsModal,
            },
            {
                updateModuleStatus: this._updateModuleStatus.bind(this),
                getModuleStatus: (id: string): ModuleStatus['status'] | undefined => this._moduleStatus.get(id)?.status,
                handleGlobalError: this.handleGlobalError.bind(this),
                setReady: (ready: boolean): void => { this._ready = ready; },
                setupEventWiring: this._setupEventWiring.bind(this),
                configureChannelManagerStorage: this._configureChannelManagerStorageForSelectedServer.bind(this),
                getSelectedServerId: this._getSelectedServerId.bind(this),
                shouldRunAudioSetup: this._shouldRunAudioSetup.bind(this),
                shouldRunChannelSetup: (): boolean => this._channelSetup?.shouldRunChannelSetup() ?? false,
                switchToChannel: this.switchToChannel.bind(this),
                openServerSelect: this.openServerSelect.bind(this),
                buildPlexResourceUrl: (pathOrUrl: string | null): string | null => {
                    if (!pathOrUrl) return null;
                    return this._buildPlexResourceUrl(pathOrUrl);
                },
                seedSubtitleLanguageFromPlexUser: (): void => {
                    this._seedSubtitleLanguageFromPlexUser();
                },
            }
        );

        // Update status for all modules
        this._updateModuleStatus('event-emitter', 'ready');
    }

    /**
     * Start the application - execute initialization sequence and begin playback.
     * Follows 5-phase initialization order per spec.
     */
    async start(): Promise<void> {
        this._playbackRecovery?.resetPlaybackFailureGuard();
        if (!this._initCoordinator) {
            throw new Error('Orchestrator must be initialized before starting');
        }
        await this._initCoordinator.runStartup(1);
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
        if (this._initCoordinator) {
            this._initCoordinator.clearAuthResume();
            this._initCoordinator.clearServerResume();
        }

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
                this._stopPlayback();
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
        this._nowPlayingInfoCoordinator?.dispose();
        if (this._nowPlayingInfo) {
            this._nowPlayingInfo.destroy();
        }
        this._playerOsdCoordinator?.hide();
        if (this._playerOsd) {
            this._playerOsd.destroy();
        }
        this._channelTransitionCoordinator?.hide();
        if (this._channelTransitionOverlay) {
            this._channelTransitionOverlay.destroy();
        }
        this._playbackOptionsCoordinator?.dispose();
        if (this._playbackOptionsModal) {
            this._playbackOptionsModal.destroy();
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

    getPlaybackInfoSnapshot(): PlaybackInfoSnapshot {
        const channel = this._channelManager?.getCurrentChannel() ?? null;
        const program = this._currentProgramForPlayback;
        const decision = this._currentStreamDecision;
        const descriptor = this._currentStreamDescriptor;

        return {
            channel: channel ? { id: channel.id, number: channel.number, name: channel.name } : null,
            program: program
                ? {
                    itemKey: program.item.ratingKey,
                    title: program.item.title,
                    fullTitle: program.item.fullTitle,
                    type: program.item.type,
                    scheduledStartTime: program.scheduledStartTime,
                    scheduledEndTime: program.scheduledEndTime,
                    elapsedMs: program.elapsedMs,
                    remainingMs: program.remainingMs,
                }
                : null,
            stream:
                decision && descriptor
                    ? {
                        protocol: descriptor.protocol,
                        mimeType: descriptor.mimeType,
                        isDirectPlay: decision.isDirectPlay,
                        isTranscoding: decision.isTranscoding,
                        container: decision.container,
                        videoCodec: decision.videoCodec,
                        audioCodec: decision.audioCodec,
                        subtitleDelivery: decision.subtitleDelivery,
                        bitrate: decision.bitrate,
                        width: decision.width,
                        height: decision.height,
                        sessionId: decision.sessionId,
                        selectedAudio: ((): {
                            id: string;
                            codec: string | null | undefined;
                            channels?: number;
                            language?: string;
                            title?: string;
                            default?: boolean;
                        } | null => {
                            const a = decision.selectedAudioStream;
                            if (!a) return null;
                            const out: {
                                id: string;
                                codec: string | null | undefined;
                                channels?: number;
                                language?: string;
                                title?: string;
                                default?: boolean;
                            } = { id: a.id, codec: a.codec };
                            if (typeof a.channels === 'number') out.channels = a.channels;
                            if (typeof a.language === 'string') out.language = a.language;
                            if (typeof a.title === 'string') out.title = a.title;
                            if (typeof a.default === 'boolean') out.default = a.default;
                            return out;
                        })(),
                        selectedSubtitle: ((): {
                            id: string;
                            codec: string | null | undefined;
                            language?: string;
                            title?: string;
                            format?: string;
                            default?: boolean;
                        } | null => {
                            const s = decision.selectedSubtitleStream;
                            if (!s) return null;
                            const out: {
                                id: string;
                                codec: string | null | undefined;
                                language?: string;
                                title?: string;
                                format?: string;
                                default?: boolean;
                            } = { id: s.id, codec: s.codec };
                            if (typeof s.language === 'string') out.language = s.language;
                            if (typeof s.title === 'string') out.title = s.title;
                            if (typeof s.format === 'string') out.format = s.format;
                            if (typeof s.default === 'boolean') out.default = s.default;
                            return out;
                        })(),
                        directPlay: decision.directPlay,
                        audioFallback: decision.audioFallback,
                        source: decision.source,
                        transcodeRequest: decision.transcodeRequest,
                        serverDecision: decision.serverDecision,
                    }
                    : null,
        };
    }

    async refreshPlaybackInfoSnapshot(): Promise<PlaybackInfoSnapshot> {
        const program = this._currentProgramForPlayback;
        const decision = this._currentStreamDecision;
        if (!program || !decision || !this._plexStreamResolver) {
            return this.getPlaybackInfoSnapshot();
        }

        await this._nowPlayingDebugManager?.ensureServerDecisionForPlaybackInfoSnapshot();

        return this.getPlaybackInfoSnapshot();
    }

    async setSubtitleTrack(trackId: string | null): Promise<void> {
        if (!this._videoPlayer) return;
        try {
            await this._videoPlayer.setSubtitleTrack(trackId);
        } catch (error) {
            console.warn('[Orchestrator] setSubtitleTrack failed:', error);
        }
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
        if (!this._plexAuth) {
            throw new Error('PlexAuth not initialized');
        }
        return this._plexAuth.requestPin();
    }

    /**
     * Poll for PIN claim status.
     */
    async pollForPin(pinId: number): Promise<PlexPinRequest> {
        if (!this._plexAuth) {
            throw new Error('PlexAuth not initialized');
        }
        return this._plexAuth.pollForPin(pinId);
    }

    /**
     * Cancel an active PIN request.
     */
    async cancelPin(pinId: number): Promise<void> {
        if (!this._plexAuth) {
            throw new Error('PlexAuth not initialized');
        }
        await this._plexAuth.cancelPin(pinId);
    }

    /**
     * Discover Plex servers (optionally forcing refresh).
     */
    async discoverServers(forceRefresh: boolean = false): Promise<PlexServer[]> {
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
        if (!this._plexDiscovery) {
            throw new Error('PlexServerDiscovery not initialized');
        }
        const debugLogging = isStoredTrue(safeLocalStorageGet(RETUNE_STORAGE_KEYS.DEBUG_LOGGING));
        if (debugLogging) {
            console.warn('[Orchestrator] selectServer: selecting server', { serverId });
        }
        const ok = await this._plexDiscovery.selectServer(serverId);
        if (ok) {
            // If we're already running (or resuming from the server-select screen),
            // re-run the channel/player/EPG phases to swap to the selected server.
            if (this._initCoordinator) {
                await this._initCoordinator.runStartup(3);
                if (debugLogging) {
                    console.warn('[Orchestrator] selectServer: startup phases complete', { serverId });
                }
                if (this._epg) {
                    this._epg.clearSchedules();
                    if (debugLogging) {
                        console.warn('[Orchestrator] selectServer: cleared EPG schedules', { serverId });
                    }
                }
                this._epgCoordinator?.primeEpgChannels();
                await this._epgCoordinator?.refreshEpgSchedules({ reason: 'server-swap' });
                if (debugLogging) {
                    console.warn('[Orchestrator] selectServer: started EPG refresh', { serverId });
                }
            }
            return this._ready;
        }
        return ok;
    }

    /**
     * Clear saved server selection.
     */
    clearSelectedServer(): void {
        if (!this._plexDiscovery) {
            throw new Error('PlexServerDiscovery not initialized');
        }
        this._plexDiscovery.clearSelection();
    }

    async getLibrariesForSetup(signal?: AbortSignal | null): Promise<PlexLibraryType[]> {
        return this._channelSetup?.getLibrariesForSetup(signal ?? null)
            ?? Promise.reject(new Error('Channel setup not initialized'));
    }

    getChannelSetupRecord(serverId: string): ChannelSetupRecord | null {
        return this._channelSetup?.getSetupRecord(serverId) ?? null;
    }

    async getSetupPreview(
        config: ChannelSetupConfig,
        options?: { signal?: AbortSignal }
    ): Promise<ChannelSetupPreview> {
        return this._channelSetup?.getSetupPreview(config, options)
            ?? Promise.reject(new Error('Channel setup not initialized'));
    }

    async getSetupReview(
        config: ChannelSetupConfig,
        options?: { signal?: AbortSignal }
    ): Promise<ChannelSetupReview> {
        return this._channelSetup?.getSetupReview(config, options)
            ?? Promise.reject(new Error('Channel setup not initialized'));
    }

    async createChannelsFromSetup(
        config: ChannelSetupConfig,
        options?: { signal?: AbortSignal; onProgress?: (p: ChannelBuildProgress) => void }
    ): Promise<ChannelBuildSummary> {
        return this._channelSetup?.createChannelsFromSetup(config, options)
            ?? Promise.reject(new Error('Channel setup not initialized'));
    }

    markSetupComplete(serverId: string, setupConfig: ChannelSetupConfig): void {
        this._channelSetup?.markSetupComplete(serverId, setupConfig);
    }

    requestChannelSetupRerun(): void {
        this._channelSetup?.requestChannelSetupRerun();
    }

    /**
     * Switch to a channel by ID.
     * Stops current playback, resolves content, configures scheduler, and syncs.
     * @param channelId - ID of channel to switch to
     */
    async switchToChannel(channelId: string, options?: { signal?: AbortSignal }): Promise<void> {
        if (!this._channelTuning) {
            if (!this._channelManager || !this._scheduler || !this._videoPlayer) {
                console.error('Modules not initialized');
            }
            return;
        }

        return this._channelTuning.switchToChannel(channelId, options);
    }

    /**
     * Switch to a channel by its number.
     * @param number - Channel number
     */
    async switchToChannelByNumber(number: number): Promise<void> {
        if (!this._channelTuning) {
            if (!this._channelManager || !this._scheduler || !this._videoPlayer) {
                console.error('Modules not initialized');
            }
            return;
        }

        return this._channelTuning.switchToChannelByNumber(number);
    }

    /**
     * Open the EPG overlay.
     */
    openEPG(): void {
        this._epgCoordinator?.openEPG();
    }

    /**
     * Close the EPG overlay.
     */
    closeEPG(): void {
        this._epgCoordinator?.closeEPG();
    }

    /**
     * Open the server selection screen.
     */
    openServerSelect(): void {
        if (!this._navigation) {
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
        this._epgCoordinator?.toggleEPG();
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
        return getRecoveryActionsHelper(errorCode, {
            goToAuth: (): void => {
                if (this._navigation) {
                    this._navigation.goTo('auth');
                }
            },
            goToServerSelect: (): void => {
                if (this._navigation) {
                    this._navigation.goTo('server-select');
                }
            },
            goToChannelEdit: (): void => {
                if (this._navigation) {
                    this._navigation.goTo('channel-edit');
                }
            },
            goToSettings: (): void => {
                if (this._navigation) {
                    this._navigation.goTo('settings');
                }
            },
            retryStart: (): void => {
                this.start().catch(console.error);
            },
            exitApp: (): void => {
                this.shutdown().catch(console.error);
            },
            skipToNext: (): void => {
                if (this._scheduler) {
                    this._scheduler.skipToNext();
                }
            },
        });
    }

    public toLifecycleAppError(error: AppError): LifecycleAppError {
        return toLifecycleAppErrorHelper(error, {
            getPhase: (): AppPhase => (this._lifecycle ? this._lifecycle.getPhase() : 'error'),
            getUserMessage: (code: AppErrorCode): string =>
                this._lifecycle ? this._lifecycle.getErrorRecovery().getUserMessage(code) : error.message,
            getRecoveryActions: (code: AppErrorCode): ErrorRecoveryAction[] =>
                this.getRecoveryActions(code),
            nowMs: (): number => Date.now(),
        });
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
            'now-playing-info-ui',
            'player-osd-ui',
            'channel-transition-ui',
            'playback-options-ui',
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


    private _getSelectedServerId(): string | null {
        if (!this._plexDiscovery) {
            return null;
        }
        const server = this._plexDiscovery.getSelectedServer();
        return server ? server.id : null;
    }

    private _seedSubtitleLanguageFromPlexUser(): void {
        const existing = safeLocalStorageGet(RETUNE_STORAGE_KEYS.SUBTITLE_LANGUAGE);
        if (typeof existing === 'string' && existing.trim().length > 0) {
            return;
        }
        const plexPreferred = this._plexAuth?.getCurrentUser()?.preferredSubtitleLanguage ?? null;
        if (typeof plexPreferred !== 'string') {
            return;
        }
        const normalized = plexPreferred.trim();
        if (normalized.length === 0) {
            return;
        }
        safeLocalStorageSet(RETUNE_STORAGE_KEYS.SUBTITLE_LANGUAGE, normalized);
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

        const serverId = this._getSelectedServerId();
        if (!serverId) {
            return;
        }

        const serverChannelsKey = this._getPerServerChannelsStorageKey(serverId);
        const serverCurrentKey = this._getPerServerCurrentChannelKey(serverId);

        this._channelManager.setStorageKeys(serverChannelsKey, serverCurrentKey);
    }


    private _shouldRunAudioSetup(): boolean {
        // Check if audio setup has been completed
        const completed = safeLocalStorageGet(RETUNE_STORAGE_KEYS.AUDIO_SETUP_COMPLETE);
        return completed !== '1';
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

        await this._epgCoordinator?.refreshEpgSchedules();
        this._activeScheduleDayKey = dayKey;
        this._pendingDayRolloverDayKey = null;
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
        this._wirePlexEvents();
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
            this._stopActiveTranscodeSession();
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

        const trackHandler = (event: { type: 'audio' | 'subtitle'; trackId: string | null }): void => {
            this._playbackOptionsCoordinator?.refreshIfOpen();

            if (event.type !== 'subtitle' || !event.trackId || !this._videoPlayer) {
                return;
            }

            const selected = this._videoPlayer.getAvailableSubtitles()
                .find((track) => track.id === event.trackId) ?? null;
            if (!selected) {
                return;
            }

            const format = (selected.format || selected.codec || '').toLowerCase();
            const isBurnIn = BURN_IN_SUBTITLE_FORMATS.includes(format);
            if (!isBurnIn) {
                return;
            }

            // Only check burn-in settings for tracks that actually require burn-in.
            const allowBurnIn = readStoredBoolean(RETUNE_STORAGE_KEYS.SUBTITLE_ALLOW_BURN_IN, true);
            if (!allowBurnIn) {
                if (this._nowPlayingHandler) {
                    this._nowPlayingHandler('Burn-in subtitles are disabled in Settings');
                }
                void this._videoPlayer.setSubtitleTrack(null).catch(() => undefined);
                return;
            }

            void this._playbackRecovery?.attemptBurnInSubtitleForCurrentProgram(
                event.trackId,
                'subtitle_track_change'
            );
        };
        this._videoPlayer.on('trackChange', trackHandler);
        this._eventUnsubscribers.push(() => {
            if (this._videoPlayer) {
                this._videoPlayer.off('trackChange', trackHandler);
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
                            const ok = await this._playbackRecovery?.attemptTranscodeFallbackForCurrentProgram(
                                'PLAYBACK_FORMAT_UNSUPPORTED'
                            );
                            if (!ok) {
                                this._playbackRecovery?.handlePlaybackFailure('video-player', error);
                            }
                        } catch (fallbackError) {
                            this._playbackRecovery?.handlePlaybackFailure('video-player', fallbackError);
                        }
                    })();
                    return;
                }
                this._playbackRecovery?.handlePlaybackFailure('video-player', error);
            }
        };
        this._videoPlayer.on('error', errorHandler);
        this._eventUnsubscribers.push(() => {
            if (this._videoPlayer) {
                this._videoPlayer.off('error', errorHandler);
            }
        });

        const stateHandler = (state: PlaybackState): void => {
            this._playerOsdCoordinator?.onPlayerStateChange(state);
            this._channelTransitionCoordinator?.onPlayerStateChange(state);
        };
        this._videoPlayer.on('stateChange', stateHandler);
        this._eventUnsubscribers.push(() => {
            if (this._videoPlayer) {
                this._videoPlayer.off('stateChange', stateHandler);
            }
        });

        const timeHandler = (payload: { currentTimeMs: number; durationMs: number }): void => {
            this._playerOsdCoordinator?.onTimeUpdate(payload);
        };
        this._videoPlayer.on('timeUpdate', timeHandler);
        this._eventUnsubscribers.push(() => {
            if (this._videoPlayer) {
                this._videoPlayer.off('timeUpdate', timeHandler);
            }
        });

        const bufferHandler = (payload: { percent: number; bufferedRanges: TimeRange[] }): void => {
            this._playerOsdCoordinator?.onBufferUpdate(payload);
        };
        this._videoPlayer.on('bufferUpdate', bufferHandler);
        this._eventUnsubscribers.push(() => {
            if (this._videoPlayer) {
                this._videoPlayer.off('bufferUpdate', bufferHandler);
            }
        });

        // No-op on state changes: Retune does not report playback progress to Plex.
    }

    private _wirePlexEvents(): void {
        if (this._plexLibrary) {
            const authExpiredHandler = (): void => {
                this.handleGlobalError(
                    {
                        code: AppErrorCode.AUTH_EXPIRED,
                        message: 'Authentication expired',
                        recoverable: true,
                    },
                    'plex-library'
                );
            };
            this._plexLibrary.on('authExpired', authExpiredHandler);
            this._eventUnsubscribers.push(() => {
                if (this._plexLibrary && typeof this._plexLibrary.off === 'function') {
                    this._plexLibrary.off('authExpired', authExpiredHandler);
                }
            });
        }

        if (this._plexStreamResolver) {
            const errorHandler = (error: StreamResolverError): void => {
                const mapped = mapPlexStreamErrorCodeToAppErrorCode(error.code);
                if (
                    mapped === AppErrorCode.AUTH_REQUIRED ||
                    mapped === AppErrorCode.AUTH_EXPIRED ||
                    mapped === AppErrorCode.AUTH_INVALID
                ) {
                    this.handleGlobalError(
                        {
                            code: mapped,
                            message: error.message,
                            recoverable: error.recoverable,
                        },
                        'plex-stream'
                    );
                }
            };
            this._plexStreamResolver.on('error', errorHandler);
            this._eventUnsubscribers.push(() => {
                if (this._plexStreamResolver && typeof this._plexStreamResolver.off === 'function') {
                    this._plexStreamResolver.off('error', errorHandler);
                }
            });
        }
    }

    /**
     * Wire navigation key events and screen changes.
     */
    private _wireNavigationEvents(): void {
        this._eventUnsubscribers.push(...(this._navigationCoordinator?.wireNavigationEvents() ?? []));
        if (!this._navigation) {
            return;
        }
        const screenHandler = (payload: { from: string; to: string }): void => {
            this._channelTransitionCoordinator?.onScreenChange(payload.to as Screen);
        };
        this._navigation.on('screenChange', screenHandler);
        this._eventUnsubscribers.push(() => {
            this._navigation?.off('screenChange', screenHandler);
        });
    }

    /**
     * Wire EPG channel selection events.
     */
    private _wireEpgEvents(): void {
        this._eventUnsubscribers.push(...(this._epgCoordinator?.wireEpgEvents() ?? []));
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

    // ========================================
    // ========================================

    /**
     * Handle program start event from scheduler.
     */
    private async _handleProgramStart(program: ScheduledProgram): Promise<void> {
        if (!this._videoPlayer) {
            return;
        }

        this._currentProgramForPlayback = program;
        const programAtStart = program;
        this._notifyNowPlaying(program);
        this._nowPlayingInfoCoordinator?.onProgramStart(program);
        this._epgCoordinator?.refreshEpgScheduleForLiveChannel();

        try {
            const stream = await this._playbackRecovery?.resolveStreamForProgram(programAtStart);
            if (this._currentProgramForPlayback !== programAtStart) {
                return;
            }
            if (!stream) {
                return;
            }
            this._currentStreamDescriptor = stream;

            // Optional developer aid: show a compact "stream decision" HUD when tuning a channel,
            // and fetch PMS transcode decision in the background to explain why video/audio transcodes.
            this._nowPlayingDebugManager?.maybeAutoShowNowPlayingStreamDebugHud();
            void this._nowPlayingDebugManager?.maybeFetchNowPlayingStreamDecisionForDebugHud();

            await this._videoPlayer.loadStream(stream);
            await this._videoPlayer.play();
            this._playbackRecovery?.resetPlaybackFailureGuard();
        } catch (error) {
            if (this._playbackRecovery?.tryHandleStreamResolverAuthError(error)) {
                return;
            }
            console.error('Failed to load stream:', error);
            this._playbackRecovery?.handlePlaybackFailure('programStart', error);
        }
    }

    private _stopActiveTranscodeSession(): void {
        const decision = this._currentStreamDecision;
        if (!decision || !decision.isTranscoding || !decision.sessionId) {
            return;
        }
        this._plexStreamResolver?.stopTranscodeSession(decision.sessionId).catch(() => { /* swallow */ });
    }

    private _stopPlayback(): void {
        this._stopActiveTranscodeSession();
        this._videoPlayer?.stop();
    }

    private _notifyNowPlaying(program: ScheduledProgram): void {
        if (!this._nowPlayingHandler || !this._channelManager) {
            return;
        }

        const pendingId = this._pendingNowPlayingChannelId;
        if (!pendingId) {
            return;
        }
        const currentChannel = this._channelManager.getCurrentChannel();
        const pendingChannel = pendingId ? this._channelManager.getChannel(pendingId) : null;
        const resolvedChannel = pendingChannel ?? currentChannel;
        const channelId = resolvedChannel?.id ?? null;
        const channelName = resolvedChannel?.name ?? 'Channel';
        const channelNumber = resolvedChannel?.number;
        const prefix = channelNumber ? `${channelNumber} ${channelName}` : channelName;

        const subtitle = program.item.fullTitle && program.item.fullTitle !== program.item.title
            ? ` • ${program.item.fullTitle}`
            : '';
        const message = `${prefix} • ${program.item.title}${subtitle}`;
        this._nowPlayingHandler(message);

        if (pendingId && pendingId === channelId) {
            this._pendingNowPlayingChannelId = null;
        }
    }

    private _toggleNowPlayingInfoOverlay(): void {
        if (!this._navigation || !this._nowPlayingInfo) {
            return;
        }
        const currentScreen = this._navigation.getCurrentScreen();
        if (currentScreen !== 'player') {
            return;
        }
        if (!this._currentProgramForPlayback) {
            return;
        }

        if (this._navigation.isModalOpen(NOW_PLAYING_INFO_MODAL_ID)) {
            this._navigation.closeModal(NOW_PLAYING_INFO_MODAL_ID);
            return;
        }
        if (this._navigation.isModalOpen()) {
            return;
        }

        this._navigation.openModal(NOW_PLAYING_INFO_MODAL_ID);
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

    setNowPlayingHandler(handler: ((message: string) => void) | null): void {
        this._nowPlayingHandler = handler;
    }
}
