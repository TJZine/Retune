/**
 * @fileoverview Unit tests for AppOrchestrator.
 * @module __tests__/Orchestrator.test
 * @version 1.0.0
 */

import { AppOrchestrator, type OrchestratorConfig, AppErrorCode } from '../Orchestrator';

// ============================================
// Test Configuration
// ============================================

const mockPlexConfig = {
    clientIdentifier: 'test-client',
    product: 'Retune',
    version: '1.0.0',
    platform: 'webOS',
    platformVersion: '6.0',
    device: 'lgtv',
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

const mockConfig: OrchestratorConfig = {
    plexConfig: mockPlexConfig,
    navConfig: mockNavConfig,
    playerConfig: mockPlayerConfig,
    epgConfig: mockEpgConfig,
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
    },
}));

// Mock NavigationManager
const mockNavigation = {
    initialize: jest.fn().mockResolvedValue(undefined),
    goTo: jest.fn(),
    getCurrentScreen: jest.fn().mockReturnValue('player'),
    on: jest.fn(() => jest.fn()),
    off: jest.fn(),
    destroy: jest.fn(),
};

jest.mock('../modules/navigation', () => ({
    NavigationManager: jest.fn(() => mockNavigation),
}));

// Mock PlexAuth
const mockPlexAuth = {
    validateToken: jest.fn().mockResolvedValue(true),
    storeCredentials: jest.fn().mockResolvedValue(undefined),
    getStoredCredentials: jest.fn().mockResolvedValue(null),
    isAuthenticated: jest.fn().mockReturnValue(true),
    getAuthHeaders: jest.fn().mockReturnValue({}),
    getCurrentUser: jest.fn().mockReturnValue(null),
    on: jest.fn(() => jest.fn()),
};

jest.mock('../modules/plex/auth', () => ({
    PlexAuth: jest.fn(() => mockPlexAuth),
}));

// Mock PlexServerDiscovery
const mockPlexDiscovery = {
    discoverServers: jest.fn().mockResolvedValue([]),
    selectServer: jest.fn().mockResolvedValue(true),
    getSelectedServer: jest.fn().mockReturnValue(null),
    getServerUri: jest.fn().mockReturnValue('http://localhost:32400'),
    on: jest.fn(() => jest.fn()),
};

jest.mock('../modules/plex/discovery', () => ({
    PlexServerDiscovery: jest.fn(() => mockPlexDiscovery),
}));

// Mock PlexLibrary
const mockPlexLibrary = {
    getLibraries: jest.fn().mockResolvedValue([]),
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
};

const mockChannelManager = {
    loadChannels: jest.fn().mockResolvedValue(undefined),
    getCurrentChannel: jest.fn().mockReturnValue(mockChannel),
    getChannel: jest.fn().mockReturnValue(mockChannel),
    getChannelByNumber: jest.fn().mockReturnValue(mockChannel),
    getNextChannel: jest.fn().mockReturnValue(mockChannel),
    getPreviousChannel: jest.fn().mockReturnValue(mockChannel),
    setCurrentChannel: jest.fn(),
    resolveChannelContent: jest.fn().mockResolvedValue({
        channelId: 'ch1',
        orderedItems: [],
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
    skipToNext: jest.fn(),
    skipToPrevious: jest.fn(),
    pauseSyncTimer: jest.fn(),
    resumeSyncTimer: jest.fn(),
    on: jest.fn(() => jest.fn()),
    off: jest.fn(),
};

jest.mock('../modules/scheduler/scheduler', () => ({
    ChannelScheduler: jest.fn(() => mockScheduler),
}));

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
    mapPlayerErrorCodeToAppErrorCode: jest.fn((code) => code),
}));

// Mock EPGComponent
const mockEpg = {
    initialize: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    destroy: jest.fn(),
    isVisible: jest.fn().mockReturnValue(false),
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

    beforeEach(() => {
        jest.clearAllMocks();
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
    });

    describe('start', () => {
        beforeEach(async () => {
            await orchestrator.initialize(mockConfig);
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
            mockPlexDiscovery.discoverServers.mockImplementation(async () => {
                initOrder.push('plex-discovery');
                return [];
            });

            // Setup state with auth
            mockLifecycle.restoreState.mockResolvedValue({
                plexAuth: {
                    token: { token: 'test-token' },
                    selectedServerId: 'server1',
                },
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
            mockLifecycle.restoreState.mockResolvedValue({
                plexAuth: {
                    token: { token: 'valid-token' },
                    selectedServerId: 'server1',
                },
            });
            mockPlexAuth.validateToken.mockResolvedValue(true);

            await orchestrator.start();

            expect(mockPlexAuth.validateToken).toHaveBeenCalledWith('valid-token');
            expect(mockNavigation.goTo).toHaveBeenCalledWith('player');
        });

        it('should navigate to auth if token invalid', async () => {
            mockLifecycle.restoreState.mockResolvedValue({
                plexAuth: {
                    token: { token: 'invalid-token' },
                    selectedServerId: 'server1',
                },
            });
            mockPlexAuth.validateToken.mockResolvedValue(false);

            await orchestrator.start();

            expect(mockNavigation.goTo).toHaveBeenCalledWith('auth');
        });

        it('should navigate to server-select if server connection fails', async () => {
            mockLifecycle.restoreState.mockResolvedValue({
                plexAuth: {
                    token: { token: 'valid-token' },
                    selectedServerId: 'server1',
                },
            });
            mockPlexAuth.validateToken.mockResolvedValue(true);
            mockPlexDiscovery.selectServer.mockResolvedValue(false);

            await orchestrator.start();

            expect(mockNavigation.goTo).toHaveBeenCalledWith('server-select');
        });

        it('should be ready after successful start', async () => {
            mockLifecycle.restoreState.mockResolvedValue({
                plexAuth: {
                    token: { token: 'valid-token' },
                    selectedServerId: 'server1',
                },
            });
            mockPlexAuth.validateToken.mockResolvedValue(true);
            mockPlexDiscovery.selectServer.mockResolvedValue(true);

            await orchestrator.start();

            expect(orchestrator.isReady()).toBe(true);
        });

        it('should call requestMediaSession once after player initialization', async () => {
            mockLifecycle.restoreState.mockResolvedValue({
                plexAuth: {
                    token: { token: 'valid-token' },
                    selectedServerId: 'server1',
                },
            });
            mockPlexAuth.validateToken.mockResolvedValue(true);
            mockPlexDiscovery.selectServer.mockResolvedValue(true);

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
                return { channelId: 'ch1', orderedItems: [], resolvedAt: Date.now() };
            });
            mockScheduler.loadChannel.mockImplementation(() => {
                resolveOrder.push('load');
            });

            await orchestrator.switchToChannel('ch1');

            expect(resolveOrder).toEqual(['resolve', 'load']);
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
            mockLifecycle.restoreState.mockResolvedValue({
                plexAuth: { token: { token: 't' }, selectedServerId: 's' },
            });
            mockPlexAuth.validateToken.mockResolvedValue(true);
            mockPlexDiscovery.selectServer.mockResolvedValue(true);
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
