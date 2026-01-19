/**
 * @fileoverview Unit tests for AppOrchestrator.
 * @module __tests__/Orchestrator.test
 * @version 1.0.0
 */


import { AppOrchestrator, type OrchestratorConfig, AppErrorCode } from '../Orchestrator';
import {
    NowPlayingInfoCoordinator,
    getNowPlayingInfoAutoHideMs,
} from '../modules/ui/now-playing-info/NowPlayingInfoCoordinator';
import type { INavigationManager } from '../modules/navigation';
import type { IPlexLibrary } from '../modules/plex/library';
import type { ChannelConfig, IChannelManager } from '../modules/scheduler/channel-manager';
import type { ScheduledProgram } from '../modules/scheduler/scheduler';
import type { INowPlayingInfoOverlay, NowPlayingInfoConfig } from '../modules/ui/now-playing-info';

// Mock localStorage
const mockLocalStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
};
Object.defineProperty(global, 'localStorage', { value: mockLocalStorage, configurable: true });


// ============================================
// Test Configuration
// ============================================

const mockPlexConfig = {
    clientIdentifier: 'test-client',
    product: 'Retune',
    version: '1.0.0',
    platform: 'webOS',
    platformVersion: '6.0',
    device: 'LG Smart TV',
    deviceName: 'Test TV',
};

const mockNavConfig = {
    enablePointerMode: false,
    keyRepeatDelayMs: 500,
    keyRepeatIntervalMs: 100,
    focusMemoryEnabled: true,
    debugMode: false,
};

const mockPlayerConfig = {
    containerId: 'video-container',
    defaultVolume: 1.0,
    bufferAheadMs: 30000,
    seekIncrementSec: 10,
    hideControlsAfterMs: 3000,
    retryAttempts: 3,
    retryDelayMs: 1000,
};

const mockEpgConfig = {
    containerId: 'epg-container',
    visibleChannels: 5,
    timeSlotMinutes: 30,
    visibleHours: 3,
    totalHours: 24,
    pixelsPerMinute: 4,
    rowHeight: 80,
    showCurrentTimeIndicator: true,
    autoScrollToNow: true,
};

const mockNowPlayingInfoConfig = {
    containerId: 'now-playing-info-container',
    autoHideMs: 10_000,
    posterWidth: 111,
    posterHeight: 222,
};

const mockConfig: OrchestratorConfig = {
    plexConfig: mockPlexConfig,
    navConfig: mockNavConfig,
    playerConfig: mockPlayerConfig,
    epgConfig: mockEpgConfig,
    nowPlayingInfoConfig: mockNowPlayingInfoConfig,
};

// ============================================
// Mock Modules
// ============================================

// Mock EventEmitter
jest.mock('../utils', () => ({
    EventEmitter: jest.fn().mockImplementation(() => ({
        on: jest.fn(() => jest.fn()),
        off: jest.fn(),
        emit: jest.fn(),
        removeAllListeners: jest.fn(),
    })),
}));

// Mock AppLifecycle
const mockLifecycle = {
    initialize: jest.fn().mockResolvedValue(undefined),
    setPhase: jest.fn(),
    getPhase: jest.fn().mockReturnValue('ready'),
    getErrorRecovery: jest.fn(() => ({
        getUserMessage: jest.fn().mockReturnValue('Test message'),
        handleError: jest.fn().mockReturnValue([]),
    })),
    restoreState: jest.fn().mockResolvedValue(null),
    saveState: jest.fn().mockResolvedValue(undefined),
    reportError: jest.fn(),
    onPause: jest.fn(),
    onResume: jest.fn(),
    onTerminate: jest.fn(),
    on: jest.fn(() => jest.fn()),
};

jest.mock('../modules/lifecycle', () => ({
    AppLifecycle: jest.fn(() => mockLifecycle),
    AppErrorCode: {
        AUTH_REQUIRED: 'AUTH_REQUIRED',
        AUTH_EXPIRED: 'AUTH_EXPIRED',
        AUTH_INVALID: 'AUTH_INVALID',
        AUTH_RATE_LIMITED: 'AUTH_RATE_LIMITED',
        NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
        NETWORK_OFFLINE: 'NETWORK_OFFLINE',
        SERVER_UNREACHABLE: 'SERVER_UNREACHABLE',
        PLAYBACK_FAILED: 'PLAYBACK_FAILED',
        PLAYBACK_DECODE_ERROR: 'PLAYBACK_DECODE_ERROR',
        PLAYBACK_FORMAT_UNSUPPORTED: 'PLAYBACK_FORMAT_UNSUPPORTED',
        CHANNEL_NOT_FOUND: 'CHANNEL_NOT_FOUND',
        SCHEDULER_EMPTY_CHANNEL: 'SCHEDULER_EMPTY_CHANNEL',
        INITIALIZATION_FAILED: 'INITIALIZATION_FAILED',
        MODULE_INIT_FAILED: 'MODULE_INIT_FAILED',
        UNRECOVERABLE: 'UNRECOVERABLE',
        TRACK_NOT_FOUND: 'TRACK_NOT_FOUND',
        TRACK_SWITCH_FAILED: 'TRACK_SWITCH_FAILED',
        TRACK_SWITCH_TIMEOUT: 'TRACK_SWITCH_TIMEOUT',
        CODEC_UNSUPPORTED: 'CODEC_UNSUPPORTED',
        UNKNOWN: 'UNKNOWN',
    },
}));

// Mock NavigationManager
const mockNavigation = {
    initialize: jest.fn().mockResolvedValue(undefined),
    goTo: jest.fn(),
    replaceScreen: jest.fn(),
    getCurrentScreen: jest.fn().mockReturnValue('player'),
    isModalOpen: jest.fn().mockReturnValue(false),
    openModal: jest.fn(),
    closeModal: jest.fn(),
    on: jest.fn(() => jest.fn()),
    off: jest.fn(),
    destroy: jest.fn(),
};

jest.mock('../modules/navigation', () => ({
    NavigationManager: jest.fn(() => mockNavigation),
}));

jest.mock('../modules/ui/now-playing-info', () => ({
    NowPlayingInfoOverlay: jest.fn(() => ({
        initialize: jest.fn(),
        show: jest.fn(),
        update: jest.fn(),
        hide: jest.fn(),
        isVisible: jest.fn(() => false),
        destroy: jest.fn(),
        setAutoHideMs: jest.fn(),
        resetAutoHideTimer: jest.fn(),
        setOnAutoHide: jest.fn(),
    })),
    NOW_PLAYING_INFO_MODAL_ID: 'now-playing-info',
    NOW_PLAYING_INFO_DEFAULTS: {
        autoHideMs: 10_000,
        posterWidth: 320,
        posterHeight: 480,
    },
    NOW_PLAYING_INFO_AUTO_HIDE_OPTIONS: [5_000, 10_000, 15_000, 30_000, 60_000, 120_000],
}));

// Mock PlexAuth
const mockPlexAuth = {
    validateToken: jest.fn().mockResolvedValue(true),
    storeCredentials: jest.fn().mockResolvedValue(undefined),
    getStoredCredentials: jest.fn().mockResolvedValue(null),
    isAuthenticated: jest.fn().mockReturnValue(true),
    getAuthHeaders: jest.fn().mockReturnValue({}),
    getCurrentUser: jest.fn().mockReturnValue(null),
    on: jest.fn(() => ({ dispose: jest.fn() })),
};

jest.mock('../modules/plex/auth', () => ({
    PlexAuth: jest.fn(() => mockPlexAuth),
}));

// Mock PlexServerDiscovery
const mockPlexDiscovery = {
    initialize: jest.fn().mockResolvedValue(undefined),
    isConnected: jest.fn().mockReturnValue(true),
    getSelectedServer: jest.fn().mockReturnValue(null),
    getServerUri: jest.fn().mockReturnValue('http://localhost:32400'),
    clearSelection: jest.fn(),
    on: jest.fn(() => ({ dispose: jest.fn() })),
};

jest.mock('../modules/plex/discovery', () => ({
    PlexServerDiscovery: jest.fn(() => mockPlexDiscovery),
}));

// Mock PlexLibrary
const mockPlexLibrary = {
    getLibraries: jest.fn().mockResolvedValue([]),
    getImageUrl: jest.fn().mockReturnValue('http://test/resized.jpg'),
    getItem: jest.fn().mockResolvedValue(null),
    on: jest.fn(() => jest.fn()),
};

jest.mock('../modules/plex/library', () => ({
    PlexLibrary: jest.fn(() => mockPlexLibrary),
}));

// Mock PlexStreamResolver
const mockPlexStreamResolver = {
    resolveStream: jest.fn().mockResolvedValue({
        playbackUrl: 'http://test/stream.mp4',
        protocol: 'direct',
        mimeType: 'video/mp4',
    }),
    on: jest.fn(() => jest.fn()),
};

jest.mock('../modules/plex/stream', () => ({
    PlexStreamResolver: jest.fn(() => mockPlexStreamResolver),
}));

// Mock ChannelManager
const mockChannel = {
    id: 'ch1',
    name: 'Test Channel',
    number: 1,
    startTimeAnchor: 0,
    playbackMode: 'sequential' as const,
    shuffleSeed: 12345,
    phaseSeed: 4242,
};

const mockChannelManager = {
    loadChannels: jest.fn().mockResolvedValue(undefined),
    setStorageKeys: jest.fn(),
    replaceAllChannels: jest.fn().mockResolvedValue(undefined),
    getAllChannels: jest.fn().mockReturnValue([mockChannel]),
    getCurrentChannel: jest.fn().mockReturnValue(mockChannel),
    getChannel: jest.fn().mockReturnValue(mockChannel),
    getChannelByNumber: jest.fn().mockReturnValue(mockChannel),
    getNextChannel: jest.fn().mockReturnValue(mockChannel),
    getPreviousChannel: jest.fn().mockReturnValue(mockChannel),
    setCurrentChannel: jest.fn(),
    deleteChannel: jest.fn().mockResolvedValue(undefined),
    resolveChannelContent: jest.fn().mockResolvedValue({
        channelId: 'ch1',
        items: [],
        orderedItems: [],
        totalDurationMs: 0,
        resolvedAt: Date.now(),
    }),
    on: jest.fn(() => jest.fn()),
};

jest.mock('../modules/scheduler/channel-manager', () => ({
    ChannelManager: jest.fn(() => mockChannelManager),
}));

// Mock ChannelScheduler
const mockScheduler = {
    loadChannel: jest.fn(),
    unloadChannel: jest.fn(),
    syncToCurrentTime: jest.fn(),
    getCurrentProgram: jest.fn().mockReturnValue(null),
    getState: jest.fn().mockReturnValue({ isActive: false, channelId: null }),
    getScheduleWindow: jest.fn().mockReturnValue({ startTime: 0, endTime: 0, programs: [] }),
    skipToNext: jest.fn(),
    skipToPrevious: jest.fn(),
    pauseSyncTimer: jest.fn(),
    resumeSyncTimer: jest.fn(),
    on: jest.fn(() => jest.fn()),
    off: jest.fn(),
};

jest.mock('../modules/scheduler/scheduler', () => {
    class MockShuffleGenerator {}
    return {
        ChannelScheduler: jest.fn(() => mockScheduler),
        ShuffleGenerator: MockShuffleGenerator,
        ScheduleCalculator: {
            buildScheduleIndex: jest.fn(() => ({})),
            generateScheduleWindow: jest.fn(() => []),
        },
    };
});

// Mock VideoPlayer
const mockVideoPlayer = {
    initialize: jest.fn().mockResolvedValue(undefined),
    loadStream: jest.fn().mockResolvedValue(undefined),
    play: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn(),
    stop: jest.fn(),
    destroy: jest.fn(),
    requestMediaSession: jest.fn(),
    releaseMediaSession: jest.fn(),
    on: jest.fn(() => jest.fn()),
    off: jest.fn(),
};

jest.mock('../modules/player', () => ({
    VideoPlayer: jest.fn(() => mockVideoPlayer),
    mapPlayerErrorCodeToAppErrorCode: jest.fn((code) => {
        switch (code) {
            case 'NETWORK_TIMEOUT':
                return AppErrorCode.NETWORK_TIMEOUT;
            case 'PLAYBACK_DECODE_ERROR':
                return AppErrorCode.PLAYBACK_DECODE_ERROR;
            case 'PLAYBACK_FORMAT_UNSUPPORTED':
                return AppErrorCode.PLAYBACK_FORMAT_UNSUPPORTED;
            case 'TRACK_NOT_FOUND':
                return AppErrorCode.TRACK_NOT_FOUND;
            case 'TRACK_SWITCH_FAILED':
                return AppErrorCode.TRACK_SWITCH_FAILED;
            case 'TRACK_SWITCH_TIMEOUT':
                return AppErrorCode.TRACK_SWITCH_TIMEOUT;
            case 'CODEC_UNSUPPORTED':
                return AppErrorCode.CODEC_UNSUPPORTED;
            default:
                return AppErrorCode.UNKNOWN;
        }
    }),
}));

// Mock EPGComponent
const mockEpg = {
    initialize: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    destroy: jest.fn(),
    isVisible: jest.fn().mockReturnValue(false),
    handleNavigation: jest.fn().mockReturnValue(false),
    handleSelect: jest.fn().mockReturnValue(false),
    handleBack: jest.fn().mockReturnValue(true),
    loadChannels: jest.fn(),
    setGridAnchorTime: jest.fn(),
    loadScheduleForChannel: jest.fn(),
    getFocusedProgram: jest.fn().mockReturnValue(null),
    focusChannel: jest.fn(),
    focusNow: jest.fn(),
    on: jest.fn(() => jest.fn()),
    off: jest.fn(),
};

jest.mock('../modules/ui/epg', () => ({
    EPGComponent: jest.fn(() => mockEpg),
}));

// ============================================
// Tests
// ============================================

describe('AppOrchestrator', () => {
    let orchestrator: AppOrchestrator;
    let schedulerHandlers: { programStart?: (program: unknown) => void };
    let playerHandlers: { ended?: () => void; error?: (error: unknown) => void };
    let navHandlers: {
        keyPress?: (payload: unknown) => void;
        modalOpen?: (payload: unknown) => void;
        modalClose?: (payload: unknown) => void;
    };
    let pauseHandler: (() => void | Promise<void>) | null;
    let resumeHandler: (() => void | Promise<void>) | null;

    beforeEach(() => {
        jest.clearAllMocks();
        schedulerHandlers = {};
        playerHandlers = {};
        navHandlers = {};
        pauseHandler = null;
        resumeHandler = null;

        (mockScheduler.on as jest.Mock).mockImplementation(
            (event: string, handler: (payload: unknown) => void) => {
                if (event === 'programStart') {
                    schedulerHandlers.programStart = handler;
                }
                return jest.fn();
            });
        (mockScheduler.off as jest.Mock).mockImplementation(
            (event: string, handler: (payload: unknown) => void) => {
                if (event === 'programStart' && schedulerHandlers.programStart === handler) {
                    delete schedulerHandlers.programStart;
                }
            });

        (mockVideoPlayer.on as jest.Mock).mockImplementation(
            (event: string, handler: (payload: unknown) => void) => {
                if (event === 'ended') {
                    playerHandlers.ended = handler as () => void;
                }
                if (event === 'error') {
                    playerHandlers.error = handler;
                }
                return jest.fn();
            });
        (mockVideoPlayer.off as jest.Mock).mockImplementation(
            (event: string, handler: (payload: unknown) => void) => {
                if (event === 'ended' && playerHandlers.ended === handler) {
                    delete playerHandlers.ended;
                }
                if (event === 'error' && playerHandlers.error === handler) {
                    delete playerHandlers.error;
                }
            });

        (mockNavigation.on as jest.Mock).mockImplementation(
            (event: string, handler: (payload: unknown) => void) => {
                if (event === 'keyPress') {
                    navHandlers.keyPress = handler;
                }
                if (event === 'modalOpen') {
                    navHandlers.modalOpen = handler;
                }
                if (event === 'modalClose') {
                    navHandlers.modalClose = handler;
                }
                return jest.fn();
            });
        (mockLifecycle.onPause as jest.Mock).mockImplementation(
            (handler: () => void | Promise<void>) => {
                pauseHandler = handler;
            });
        (mockLifecycle.onResume as jest.Mock).mockImplementation(
            (handler: () => void | Promise<void>) => {
                resumeHandler = handler;
            });
        orchestrator = new AppOrchestrator();
    });

    describe('initialize', () => {
        it('should create all module instances', async () => {
            await orchestrator.initialize(mockConfig);

            // Verify modules were created (by checking the mocks were called)
            expect(require('../modules/lifecycle').AppLifecycle).toHaveBeenCalled();
            expect(require('../modules/navigation').NavigationManager).toHaveBeenCalled();
            expect(require('../modules/plex/auth').PlexAuth).toHaveBeenCalled();
            expect(require('../modules/plex/discovery').PlexServerDiscovery).toHaveBeenCalled();
            expect(require('../modules/plex/library').PlexLibrary).toHaveBeenCalled();
            expect(require('../modules/plex/stream').PlexStreamResolver).toHaveBeenCalled();
            expect(require('../modules/scheduler/channel-manager').ChannelManager).toHaveBeenCalled();
            expect(require('../modules/scheduler/scheduler').ChannelScheduler).toHaveBeenCalled();
            expect(require('../modules/player').VideoPlayer).toHaveBeenCalled();
            expect(require('../modules/ui/epg').EPGComponent).toHaveBeenCalled();
        });

        it('should preserve caller-supplied nowPlayingInfoConfig.onAutoHide', async () => {
            const prev = jest.fn();
            const configWithHandler: OrchestratorConfig = {
                ...mockConfig,
                nowPlayingInfoConfig: {
                    ...mockConfig.nowPlayingInfoConfig,
                    onAutoHide: prev,
                },
            };

            mockNavigation.isModalOpen.mockReturnValue(true);
            await orchestrator.initialize(configWithHandler);

            // Orchestrator wraps the handler on initialize; invoke it to validate chaining + close behavior.
            configWithHandler.nowPlayingInfoConfig.onAutoHide?.();

            expect(prev).toHaveBeenCalledTimes(1);
            expect(mockNavigation.closeModal).toHaveBeenCalledWith('now-playing-info');
        });

        it('should honor config nowPlayingInfoConfig.autoHideMs when storage is unset', async () => {
            const configWithAutoHide: OrchestratorConfig = {
                ...mockConfig,
                nowPlayingInfoConfig: {
                    ...mockConfig.nowPlayingInfoConfig,
                    autoHideMs: 15_000,
                },
            };

            mockLocalStorage.getItem.mockReturnValue(null);
            await orchestrator.initialize(configWithAutoHide);

            const autoHideMs = getNowPlayingInfoAutoHideMs(configWithAutoHide.nowPlayingInfoConfig);

            expect(autoHideMs).toBe(15_000);
        });

        it('should use configured nowPlayingInfo poster sizes when resizing', async () => {
            const configWithPosterSizes: OrchestratorConfig = {
                ...mockConfig,
                nowPlayingInfoConfig: {
                    ...mockConfig.nowPlayingInfoConfig,
                    posterWidth: 111,
                    posterHeight: 222,
                },
            };

            await orchestrator.initialize(configWithPosterSizes);

            const program = {
                elapsedMs: 1234,
                item: {
                    ratingKey: 'rk1',
                    type: 'movie',
                    title: 'Test Movie',
                    fullTitle: null,
                    year: 2024,
                    contentRating: 'PG',
                    durationMs: 60_000,
                    thumb: '/thumb',
                },
            };
            const channel = mockChannel as unknown as ChannelConfig;
            const coordinator = new NowPlayingInfoCoordinator({
                nowPlayingModalId: 'now-playing-info',
                getNavigation: (): INavigationManager =>
                    ({
                        isModalOpen: (): boolean => true,
                    }) as INavigationManager,
                getScheduler: (): null => null,
                getChannelManager: (): IChannelManager =>
                    ({
                        getCurrentChannel: (): ChannelConfig => channel,
                    }) as unknown as IChannelManager,
                getPlexLibrary: (): IPlexLibrary => mockPlexLibrary as unknown as IPlexLibrary,
                getNowPlayingInfo: (): INowPlayingInfoOverlay =>
                    ({
                        setAutoHideMs: jest.fn(),
                        update: jest.fn(),
                        isVisible: (): boolean => false,
                    }) as unknown as INowPlayingInfoOverlay,
                getNowPlayingInfoConfig: (): NowPlayingInfoConfig | null => configWithPosterSizes.nowPlayingInfoConfig,
                buildPlexResourceUrl: (): null => null,
                buildDebugText: (): string | null => null,
                maybeFetchStreamDecisionForDebugHud: (): Promise<void> => Promise.resolve(),
                getAutoHideMs: (): number => 0,
                getCurrentProgramForPlayback: (): null => null,
            });
            coordinator.onProgramStart(program as unknown as ScheduledProgram);

            expect(mockPlexLibrary.getImageUrl).toHaveBeenCalledWith('/thumb', 111, 222);
        });
    });

    describe('start', () => {
        beforeEach(async () => {
            await orchestrator.initialize(mockConfig);
            mockPlexAuth.getStoredCredentials.mockResolvedValue(null);
        });

        it('should initialize modules in correct phase order', async () => {
            const initOrder: string[] = [];

            mockLifecycle.initialize.mockImplementation(async () => {
                initOrder.push('lifecycle');
            });
            mockNavigation.initialize.mockImplementation(async () => {
                initOrder.push('navigation');
            });
            mockPlexAuth.validateToken.mockImplementation(async () => {
                initOrder.push('plex-auth');
                return true;
            });
            mockPlexDiscovery.initialize.mockImplementation(async () => {
                initOrder.push('plex-discovery');
            });

            mockPlexAuth.getStoredCredentials.mockResolvedValue({
                token: { token: 'test-token' },
                selectedServerId: null,
                selectedServerUri: null,
            });

            await orchestrator.start();

            // Phase 1 (lifecycle, navigation) should be before Phase 2 (auth)
            const lifecycleIdx = initOrder.indexOf('lifecycle');
            const navIdx = initOrder.indexOf('navigation');
            const authIdx = initOrder.indexOf('plex-auth');
            const discoveryIdx = initOrder.indexOf('plex-discovery');

            // Lifecycle and navigation are Phase 1 (parallel)
            expect(lifecycleIdx).toBeLessThan(authIdx);
            expect(navIdx).toBeLessThan(authIdx);
            // Auth is Phase 2, before discovery (Phase 3)
            expect(authIdx).toBeLessThan(discoveryIdx);
        });

        it('should navigate to auth if no saved credentials', async () => {
            mockLifecycle.restoreState.mockResolvedValue(null);

            await orchestrator.start();

            expect(mockNavigation.goTo).toHaveBeenCalledWith('auth');
        });

        it('should validate token and proceed if valid', async () => {
            mockPlexAuth.getStoredCredentials.mockResolvedValue({
                token: { token: 'valid-token' },
                selectedServerId: null,
                selectedServerUri: null,
            });
            mockPlexAuth.validateToken.mockResolvedValue(true);
            mockPlexDiscovery.isConnected.mockReturnValue(true);

            await orchestrator.start();

            expect(mockPlexAuth.validateToken).toHaveBeenCalledWith('valid-token');
            expect(mockNavigation.goTo).toHaveBeenCalledWith('player');
        });

        it('should navigate to auth if token invalid', async () => {
            mockPlexAuth.getStoredCredentials.mockResolvedValue({
                token: { token: 'invalid-token' },
                selectedServerId: null,
                selectedServerUri: null,
            });
            mockPlexAuth.validateToken.mockResolvedValue(false);

            await orchestrator.start();

            expect(mockNavigation.goTo).toHaveBeenCalledWith('auth');
        });

        it('should navigate to server-select if server connection fails', async () => {
            mockPlexAuth.getStoredCredentials.mockResolvedValue({
                token: { token: 'valid-token' },
                selectedServerId: null,
                selectedServerUri: null,
            });
            mockPlexAuth.validateToken.mockResolvedValue(true);
            mockPlexDiscovery.isConnected.mockReturnValue(false);

            await orchestrator.start();

            expect(mockNavigation.goTo).toHaveBeenCalledWith('server-select');
        });

        it('should be ready after successful start', async () => {
            mockPlexAuth.getStoredCredentials.mockResolvedValue({
                token: { token: 'valid-token' },
                selectedServerId: null,
                selectedServerUri: null,
            });
            mockPlexAuth.validateToken.mockResolvedValue(true);
            mockPlexDiscovery.isConnected.mockReturnValue(true);

            await orchestrator.start();

            expect(orchestrator.isReady()).toBe(true);
        });

        it('should call requestMediaSession once after player initialization', async () => {
            mockPlexAuth.getStoredCredentials.mockResolvedValue({
                token: { token: 'valid-token' },
                selectedServerId: null,
                selectedServerUri: null,
            });
            mockPlexAuth.validateToken.mockResolvedValue(true);
            mockPlexDiscovery.isConnected.mockReturnValue(true);

            await orchestrator.start();

            // Verify requestMediaSession called exactly once
            expect(mockVideoPlayer.requestMediaSession).toHaveBeenCalledTimes(1);

            // Verify initialize was called before requestMediaSession
            const initOrder = mockVideoPlayer.initialize.mock.invocationCallOrder[0];
            const mediaSessionOrder = mockVideoPlayer.requestMediaSession.mock.invocationCallOrder[0];
            expect(initOrder).toBeDefined();
            expect(mediaSessionOrder).toBeDefined();
            if (initOrder !== undefined && mediaSessionOrder !== undefined) {
                expect(initOrder).toBeLessThan(mediaSessionOrder);
            }
        });

        it('should proceed without auth UI when stored credentials exist', async () => {
            mockPlexAuth.getStoredCredentials.mockResolvedValue({
                token: { token: 'valid-token' },
                selectedServerId: null,
                selectedServerUri: null,
            });
            mockPlexAuth.validateToken.mockResolvedValue(true);
            mockPlexDiscovery.isConnected.mockReturnValue(true);

            await orchestrator.start();

            expect(mockPlexAuth.validateToken).toHaveBeenCalledWith('valid-token');
            expect(mockNavigation.goTo).toHaveBeenCalledWith('player');
            expect(mockNavigation.goTo).not.toHaveBeenCalledWith('auth');
        });

        it('should navigate to channel-setup when channels are empty and setup is missing', async () => {
            mockPlexAuth.getStoredCredentials.mockResolvedValue({
                token: { token: 'valid-token' },
                selectedServerId: null,
                selectedServerUri: null,
            });
            mockPlexAuth.validateToken.mockResolvedValue(true);
            mockPlexDiscovery.isConnected.mockReturnValue(true);
            mockPlexDiscovery.getSelectedServer.mockReturnValue({ id: 'server-1' });
            mockChannelManager.getAllChannels.mockReturnValue([]);
            mockLocalStorage.getItem.mockImplementation((key: string) => {
                if (key === 'retune_audio_setup_complete') return '1';
                if (key === 'retune_channel_setup_v1:server-1') return null;
                if (key === 'retune_channels_server_v1') return null;
                return null;
            });

            await orchestrator.start();

            expect(mockNavigation.goTo).toHaveBeenCalledWith('channel-setup');
            expect(mockNavigation.goTo).not.toHaveBeenCalledWith('player');
        });

        it('should rerun setup when switching to a new server without setup record', async () => {
            mockPlexAuth.getStoredCredentials.mockResolvedValue({
                token: { token: 'valid-token' },
                selectedServerId: null,
                selectedServerUri: null,
            });
            mockPlexAuth.validateToken.mockResolvedValue(true);
            mockPlexDiscovery.isConnected.mockReturnValue(true);
            mockPlexDiscovery.getSelectedServer.mockReturnValue({ id: 'server-2' });
            mockChannelManager.getAllChannels.mockReturnValue([mockChannel]);
            mockLocalStorage.getItem.mockImplementation((key: string) => {
                if (key === 'retune_audio_setup_complete') return '1';
                if (key === 'retune_channels_server_v1') return 'server-1';
                return null;
            });

            await orchestrator.start();

            expect(mockNavigation.goTo).toHaveBeenCalledWith('channel-setup');
            expect(mockChannelManager.setStorageKeys).toHaveBeenCalledWith(
                'retune_channels_server_v1:server-2',
                'retune_current_channel_v4:server-2'
            );
        });

        it('should navigate to server-select when auth is valid but no selection restored', async () => {
            mockPlexAuth.getStoredCredentials.mockResolvedValue({
                token: { token: 'valid-token' },
                selectedServerId: null,
                selectedServerUri: null,
            });
            mockPlexAuth.validateToken.mockResolvedValue(true);
            mockPlexDiscovery.isConnected.mockReturnValue(false);

            await orchestrator.start();

            expect(mockNavigation.goTo).toHaveBeenCalledWith('server-select');
            expect(mockNavigation.goTo).not.toHaveBeenCalledWith('auth');
        });

        it('should wire scheduler, player, and lifecycle events after start', async () => {
            mockPlexAuth.getStoredCredentials.mockResolvedValue({
                token: { token: 'valid-token' },
                selectedServerId: null,
                selectedServerUri: null,
            });
            mockPlexAuth.validateToken.mockResolvedValue(true);
            mockPlexDiscovery.isConnected.mockReturnValue(true);

            await orchestrator.start();

            expect(schedulerHandlers.programStart).toBeDefined();
            expect(playerHandlers.ended).toBeDefined();
            expect(playerHandlers.error).toBeDefined();
            expect(pauseHandler).toBeDefined();
            expect(resumeHandler).toBeDefined();

            const program = {
                item: {
                    ratingKey: 'item-1',
                    title: 'Test Item',
                    durationMs: 60000,
                    type: 'movie',
                },
                elapsedMs: 5000,
            };

            schedulerHandlers.programStart?.(program);
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockPlexStreamResolver.resolveStream).toHaveBeenCalledWith(
                expect.objectContaining({
                    itemKey: 'item-1',
                    startOffsetMs: 5000,
                    directPlay: true,
                })
            );
            expect(mockVideoPlayer.loadStream).toHaveBeenCalled();
            expect(mockVideoPlayer.play).toHaveBeenCalled();

            playerHandlers.ended?.();
            expect(mockScheduler.skipToNext).toHaveBeenCalledTimes(1);

            playerHandlers.error?.({
                recoverable: false,
                code: 'PLAYBACK_FAILED',
                message: 'boom',
            });
            expect(mockScheduler.skipToNext).toHaveBeenCalledTimes(2);

            await pauseHandler?.();
            expect(mockVideoPlayer.pause).toHaveBeenCalled();
            expect(mockScheduler.pauseSyncTimer).toHaveBeenCalled();
            expect(mockLifecycle.saveState).toHaveBeenCalled();

            await resumeHandler?.();
            expect(mockScheduler.resumeSyncTimer).toHaveBeenCalled();
            expect(mockScheduler.syncToCurrentTime).toHaveBeenCalled();
            expect(mockVideoPlayer.play).toHaveBeenCalled();
        });

        it('retries via HLS when direct playback is unsupported (Direct Stream fallback)', async () => {
            mockPlexAuth.getStoredCredentials.mockResolvedValue({
                token: { token: 'valid-token' },
                selectedServerId: null,
                selectedServerUri: null,
            });
            mockPlexAuth.validateToken.mockResolvedValue(true);
            mockPlexDiscovery.isConnected.mockReturnValue(true);

            // First attempt: direct URL (e.g., MKV direct play on a legacy TV)
            // Fallback attempt: HLS (remux / direct stream) URL
            mockPlexStreamResolver.resolveStream
                .mockResolvedValueOnce({
                    playbackUrl: 'http://test/stream.mkv',
                    protocol: 'direct',
                    container: 'mkv',
                })
                .mockResolvedValueOnce({
                    playbackUrl: 'http://test/stream.m3u8',
                    protocol: 'hls',
                    container: 'mpegts',
                });

            await orchestrator.start();

            const program = {
                item: {
                    ratingKey: 'item-1',
                    title: 'Test Item',
                    durationMs: 60000,
                    type: 'movie',
                },
                elapsedMs: 5000,
            };

            schedulerHandlers.programStart?.(program);
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockPlexStreamResolver.resolveStream).toHaveBeenCalledWith(
                expect.objectContaining({
                    itemKey: 'item-1',
                    startOffsetMs: 5000,
                    directPlay: true,
                })
            );

            // Simulate the TV refusing the container (MEDIA_ERR_SRC_NOT_SUPPORTED => PLAYBACK_FORMAT_UNSUPPORTED)
            playerHandlers.error?.({
                recoverable: false,
                code: 'PLAYBACK_FORMAT_UNSUPPORTED',
                message: 'Media format not supported',
            });

            // Allow async fallback attempt to run.
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockPlexStreamResolver.resolveStream).toHaveBeenCalledWith(
                expect.objectContaining({
                    itemKey: 'item-1',
                    startOffsetMs: 5000,
                    directPlay: false,
                })
            );

            // Fallback should reload and play, not skip.
            expect(mockVideoPlayer.loadStream).toHaveBeenCalledTimes(2);
            expect(mockVideoPlayer.play).toHaveBeenCalledTimes(2);
            expect(mockScheduler.skipToNext).toHaveBeenCalledTimes(0);
        });
    });

    describe('switchToChannel', () => {
        beforeEach(async () => {
            // Reset mocks that may have been modified by previous tests
            mockChannelManager.getChannel.mockReturnValue(mockChannel);
            await orchestrator.initialize(mockConfig);
        });

        it('should stop current playback', async () => {
            await orchestrator.switchToChannel('ch1');

            expect(mockVideoPlayer.stop).toHaveBeenCalled();
        });

        it('should load scheduler with channel content', async () => {
            await orchestrator.switchToChannel('ch1');

            expect(mockScheduler.loadChannel).toHaveBeenCalled();
        });

        it('should sync to current time', async () => {
            await orchestrator.switchToChannel('ch1');

            expect(mockScheduler.syncToCurrentTime).toHaveBeenCalled();
        });

        it('should handle non-existent channel gracefully', async () => {
            mockChannelManager.getChannel.mockReturnValue(null);
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            await expect(orchestrator.switchToChannel('invalid')).resolves.not.toThrow();
            expect(consoleSpy).toHaveBeenCalledWith('Channel not found:', 'invalid');

            // Verify early return - stop should not be called for invalid channel
            expect(mockVideoPlayer.stop).not.toHaveBeenCalled();

            consoleSpy.mockRestore();
        });

        it('should resolve channel content before loading scheduler', async () => {
            const resolveOrder: string[] = [];

            mockChannelManager.resolveChannelContent.mockImplementation(async () => {
                resolveOrder.push('resolve');
                return { channelId: 'ch1', items: [], orderedItems: [], totalDurationMs: 0, resolvedAt: Date.now() };
            });
            mockScheduler.loadChannel.mockImplementation(() => {
                resolveOrder.push('load');
            });

            await orchestrator.switchToChannel('ch1');

            expect(resolveOrder).toEqual(['resolve', 'load']);
        });

        // ========================================
        // ORCH-002: Concurrent Channel Switch Guard
        // ========================================

        it('should reject concurrent channel switch attempts', async () => {
            // Make resolveChannelContent take some time
            let resolveDelay: () => void = (): void => { };
            mockChannelManager.resolveChannelContent.mockImplementation(
                (): Promise<{ channelId: string; items: never[]; orderedItems: never[]; totalDurationMs: number; resolvedAt: number }> => new Promise<{ channelId: string; items: never[]; orderedItems: never[]; totalDurationMs: number; resolvedAt: number }>((resolve) => {
                    resolveDelay = (): void => resolve({ channelId: 'ch1', items: [], orderedItems: [], totalDurationMs: 0, resolvedAt: Date.now() });
                })
            );

            // Start first switch (will be pending)
            const switch1 = orchestrator.switchToChannel('ch1');

            // Attempt second switch while first is in progress
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            const switch2 = orchestrator.switchToChannel('ch2');

            // Both should resolve, but second should early-return
            await switch2;
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('already in progress')
            );
            expect(mockChannelManager.resolveChannelContent).toHaveBeenCalledTimes(1);
            expect(mockScheduler.loadChannel).not.toHaveBeenCalled();

            // Complete first switch
            resolveDelay();
            await switch1;

            consoleSpy.mockRestore();
        });

        it('should allow sequential channel switches', async () => {
            mockChannelManager.resolveChannelContent.mockResolvedValue({
                channelId: 'ch1',
                items: [],
                orderedItems: [],
                totalDurationMs: 0,
                resolvedAt: Date.now(),
            });

            // First switch
            await orchestrator.switchToChannel('ch1');
            expect(mockScheduler.loadChannel).toHaveBeenCalledTimes(1);

            // Second switch (should work since first is complete)
            await orchestrator.switchToChannel('ch2');
            expect(mockScheduler.loadChannel).toHaveBeenCalledTimes(2);
        });
    });

    describe('switchToChannelByNumber', () => {
        beforeEach(async () => {
            await orchestrator.initialize(mockConfig);
        });

        it('should find channel by number and switch', async () => {
            mockChannelManager.getChannelByNumber.mockReturnValue(mockChannel);
            const switchSpy = jest.spyOn(orchestrator, 'switchToChannel');

            await orchestrator.switchToChannelByNumber(5);

            expect(mockChannelManager.getChannelByNumber).toHaveBeenCalledWith(5);
            expect(switchSpy).toHaveBeenCalledWith(mockChannel.id);
        });

        it('should handle invalid channel number', async () => {
            mockChannelManager.getChannelByNumber.mockReturnValue(null);

            await orchestrator.switchToChannelByNumber(999);

            expect(mockLifecycle.reportError).toHaveBeenCalledWith(
                expect.objectContaining({ code: 'CHANNEL_NOT_FOUND' })
            );
        });
    });

    describe('channel setup rerun', () => {
        beforeEach(async () => {
            await orchestrator.initialize(mockConfig);
        });

        it('should clear setup record and navigate to channel-setup', () => {
            mockPlexDiscovery.getSelectedServer.mockReturnValue({ id: 'server-3' });

            orchestrator.requestChannelSetupRerun();

            expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(
                'retune_channel_setup_v1:server-3'
            );
            expect(mockNavigation.goTo).toHaveBeenCalledWith('channel-setup');
        });
    });

    describe('EPG management', () => {
        beforeEach(async () => {
            await orchestrator.initialize(mockConfig);
        });

        it('should open EPG and focus now', () => {
            orchestrator.openEPG();

            expect(mockEpg.show).toHaveBeenCalled();
            expect(mockEpg.focusNow).toHaveBeenCalled();
        });

        it('should close EPG', () => {
            orchestrator.closeEPG();

            expect(mockEpg.hide).toHaveBeenCalled();
        });

        it('should toggle EPG from closed to open', () => {
            mockEpg.isVisible.mockReturnValue(false);

            orchestrator.toggleEPG();

            expect(mockEpg.show).toHaveBeenCalled();
        });

        it('should toggle EPG from open to closed', () => {
            mockEpg.isVisible.mockReturnValue(true);

            orchestrator.toggleEPG();

            expect(mockEpg.hide).toHaveBeenCalled();
        });

        it('should allow EPG while Now Playing modal is open and back should not close EPG', async () => {
            mockNavigation.isModalOpen.mockReturnValue(true);
            mockEpg.isVisible.mockReturnValue(true);

            await orchestrator.start();

            orchestrator.openEPG();
            expect(mockNavigation.closeModal).not.toHaveBeenCalled();

            const keyPress = navHandlers.keyPress;
            expect(keyPress).toBeDefined();
            keyPress?.({
                button: 'back',
                isRepeat: false,
                isLongPress: false,
                timestamp: Date.now(),
                originalEvent: { preventDefault: jest.fn() },
            });
            expect(mockEpg.handleBack).not.toHaveBeenCalled();
        });
    });

    describe('Now Playing Info overlay', () => {
        beforeEach(async () => {
            await orchestrator.initialize(mockConfig);
            await orchestrator.start();
        });

        it('should live-update progress while open', async () => {
            jest.useFakeTimers();

            const baseProgram = {
                item: {
                    ratingKey: 'rk1',
                    title: 'Test Movie',
                    durationMs: 120_000,
                    type: 'movie',
                },
                scheduledStartTime: Date.now(),
                scheduledEndTime: Date.now() + 120_000,
                elapsedMs: 0,
                remainingMs: 120_000,
                scheduleIndex: 0,
                loopNumber: 0,
                streamDescriptor: null,
                isCurrent: true,
            };

            // Program start sets _currentProgramForPlayback so the modal can render.
            await (schedulerHandlers.programStart as (p: unknown) => Promise<void>)(baseProgram);

            // While open, orchestrator should pull fresh elapsed values from scheduler.getCurrentProgram().
            // Use a monotonic mock since other orchestrator flows may also query getCurrentProgram().
            let elapsedMs = 0;
            mockScheduler.getCurrentProgram.mockImplementation(() => {
                elapsedMs += 1000;
                return { ...baseProgram, elapsedMs, remainingMs: Math.max(0, 120_000 - elapsedMs) };
            });

            mockNavigation.isModalOpen.mockImplementation((modalId?: string) => modalId === 'now-playing-info');

            const modalOpen = navHandlers.modalOpen as (payload: unknown) => void;
            expect(modalOpen).toBeDefined();
            modalOpen({ modalId: 'now-playing-info' });

            jest.advanceTimersByTime(1100);
            jest.advanceTimersByTime(1100);

            const nowPlayingModule = require('../modules/ui/now-playing-info');
            const instance = (nowPlayingModule.NowPlayingInfoOverlay as jest.Mock).mock.results[0]?.value;
            expect((instance.update as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2);

            const firstUpdateVm = (instance.update as jest.Mock).mock.calls[0]?.[0];
            const secondUpdateVm = (instance.update as jest.Mock).mock.calls[1]?.[0];
            expect(typeof firstUpdateVm.elapsedMs).toBe('number');
            expect(typeof secondUpdateVm.elapsedMs).toBe('number');
            expect(secondUpdateVm.elapsedMs).toBeGreaterThan(firstUpdateVm.elapsedMs);

            // Closing should stop the timer (no further updates).
            const callCount = (instance.update as jest.Mock).mock.calls.length;
            const modalClose = navHandlers.modalClose as (payload: unknown) => void;
            modalClose({ modalId: 'now-playing-info' });
            jest.advanceTimersByTime(3000);
            expect((instance.update as jest.Mock).mock.calls.length).toBe(callCount);

            jest.useRealTimers();
        });
    });

    describe('error handling', () => {
        beforeEach(async () => {
            await orchestrator.initialize(mockConfig);
        });

        it('should call module-specific handler first', () => {
            const moduleHandler = jest.fn().mockReturnValue(true);
            orchestrator.registerErrorHandler('test-module', moduleHandler);

            const error = { code: AppErrorCode.NETWORK_TIMEOUT, message: 'test', recoverable: true };
            orchestrator.handleGlobalError(error, 'test-context');

            expect(moduleHandler).toHaveBeenCalledWith(error);
            expect(mockLifecycle.reportError).not.toHaveBeenCalled();
        });

        it('should report to lifecycle if handler returns false', () => {
            const moduleHandler = jest.fn().mockReturnValue(false);
            orchestrator.registerErrorHandler('test-module', moduleHandler);

            const error = { code: AppErrorCode.NETWORK_TIMEOUT, message: 'test', recoverable: true };
            orchestrator.handleGlobalError(error, 'test-context');

            expect(moduleHandler).toHaveBeenCalledWith(error);
            expect(mockLifecycle.reportError).toHaveBeenCalledWith(error);
        });
    });

    describe('getRecoveryActions', () => {
        beforeEach(async () => {
            await orchestrator.initialize(mockConfig);
        });

        it('should return Sign In action for AUTH_REQUIRED', () => {
            const actions = orchestrator.getRecoveryActions(AppErrorCode.AUTH_REQUIRED);

            expect(actions).toContainEqual(
                expect.objectContaining({ label: 'Sign In', isPrimary: true })
            );
        });

        it('should return Retry and Exit for INITIALIZATION_FAILED', () => {
            const actions = orchestrator.getRecoveryActions(AppErrorCode.INITIALIZATION_FAILED);

            const labels = actions.map((a) => a.label);
            expect(labels).toContain('Retry');
            expect(labels).toContain('Exit');
        });

        it('should return Skip action for PLAYBACK_DECODE_ERROR', () => {
            const actions = orchestrator.getRecoveryActions(AppErrorCode.PLAYBACK_DECODE_ERROR);

            expect(actions).toContainEqual(
                expect.objectContaining({ label: 'Skip', isPrimary: true })
            );
        });
    });

    describe('shutdown', () => {
        beforeEach(async () => {
            await orchestrator.initialize(mockConfig);
        });

        it('should save state before shutdown', async () => {
            await orchestrator.shutdown();

            expect(mockLifecycle.saveState).toHaveBeenCalled();
        });

        it('should stop video player on shutdown', async () => {
            await orchestrator.shutdown();

            expect(mockVideoPlayer.stop).toHaveBeenCalled();
        });

        it('should destroy modules on shutdown', async () => {
            await orchestrator.shutdown();

            expect(mockEpg.destroy).toHaveBeenCalled();
            expect(mockVideoPlayer.destroy).toHaveBeenCalled();
            expect(mockNavigation.destroy).toHaveBeenCalled();
        });

        it('should set ready to false after shutdown', async () => {
            // First start to set ready
            mockPlexAuth.getStoredCredentials.mockResolvedValue({
                token: { token: 't' },
                selectedServerId: null,
                selectedServerUri: null,
            });
            mockPlexAuth.validateToken.mockResolvedValue(true);
            mockPlexDiscovery.isConnected.mockReturnValue(true);
            await orchestrator.start();
            expect(orchestrator.isReady()).toBe(true);

            // Then shutdown
            await orchestrator.shutdown();
            expect(orchestrator.isReady()).toBe(false);
        });
    });

    describe('getModuleStatus', () => {
        beforeEach(async () => {
            await orchestrator.initialize(mockConfig);
        });

        it('should return status of all modules', () => {
            const status = orchestrator.getModuleStatus();

            expect(status.has('plex-auth')).toBe(true);
            expect(status.has('channel-scheduler')).toBe(true);
            expect(status.has('video-player')).toBe(true);
            expect(status.has('epg-ui')).toBe(true);
        });

        it('should report event-emitter as ready after initialize', () => {
            const status = orchestrator.getModuleStatus();
            const emitterStatus = status.get('event-emitter');

            expect(emitterStatus).toBeDefined();
            expect(emitterStatus && emitterStatus.status).toBe('ready');
        });
    });

});
