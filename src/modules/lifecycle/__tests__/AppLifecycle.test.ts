/**
 * @jest-environment jsdom
 * @fileoverview Unit tests for AppLifecycle.
 * @module modules/lifecycle/__tests__/AppLifecycle.test
 */

import { AppLifecycle } from '../AppLifecycle';
import { StateManager } from '../StateManager';
import { ErrorRecovery } from '../ErrorRecovery';
import { AppErrorCode, PersistentState } from '../types';

describe('AppLifecycle', () => {
    let lifecycle: AppLifecycle;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockErrorRecovery: jest.Mocked<ErrorRecovery>;
    let addEventListenerSpy: jest.SpyInstance;
    let removeEventListenerSpy: jest.SpyInstance;

    beforeEach(() => {
        // Mock StateManager
        mockStateManager = {
            save: jest.fn().mockResolvedValue(undefined),
            load: jest.fn().mockResolvedValue(null),
            loadSync: jest.fn().mockReturnValue(null),
            clear: jest.fn().mockResolvedValue(undefined),
            createDefaultState: jest.fn().mockReturnValue({
                version: 1,
                plexAuth: null,
                channelConfigs: [],
                currentChannelIndex: 0,
                userPreferences: { theme: 'dark', volume: 100, subtitleLanguage: null, audioLanguage: null },
                lastUpdated: Date.now(),
            }),
        } as unknown as jest.Mocked<StateManager>;

        // Mock ErrorRecovery
        mockErrorRecovery = {
            handleError: jest.fn().mockReturnValue([]),
            executeRecovery: jest.fn().mockResolvedValue(true),
            createError: jest.fn().mockImplementation((code, message, context) => ({
                code,
                message,
                recoverable: true,
                context,
            })),
            registerCallbacks: jest.fn(),
            getUserMessage: jest.fn().mockReturnValue('Error'),
        } as unknown as jest.Mocked<ErrorRecovery>;

        // Spy on document event listeners
        addEventListenerSpy = jest.spyOn(document, 'addEventListener');
        removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');

        // Mock navigator.onLine
        Object.defineProperty(navigator, 'onLine', {
            value: true,
            writable: true,
            configurable: true,
        });

        // Mock document.hidden
        Object.defineProperty(document, 'hidden', {
            value: false,
            writable: true,
            configurable: true,
        });

        // Mock performance.memory
        Object.defineProperty(performance, 'memory', {
            value: {
                usedJSHeapSize: 100 * 1024 * 1024,
                totalJSHeapSize: 200 * 1024 * 1024,
                jsHeapSizeLimit: 300 * 1024 * 1024,
            },
            writable: true,
            configurable: true,
        });

        lifecycle = new AppLifecycle(mockStateManager, mockErrorRecovery);
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    describe('initialization', () => {
        it('should set phase to initializing then authenticating when no saved state', async () => {
            mockStateManager.load.mockResolvedValue(null);

            await lifecycle.initialize();

            expect(lifecycle.getPhase()).toBe('authenticating');
        });

        it('should restore state and set phase to authenticating when state exists', async () => {
            const savedState: PersistentState = {
                version: 1,
                plexAuth: null,
                channelConfigs: [],
                currentChannelIndex: 0,
                userPreferences: { theme: 'dark', volume: 100, subtitleLanguage: null, audioLanguage: null },
                lastUpdated: Date.now(),
            };
            mockStateManager.load.mockResolvedValue(savedState);

            await lifecycle.initialize();

            expect(lifecycle.getPhase()).toBe('authenticating');
        });

        it('should emit stateRestored event with saved state', async () => {
            const savedState: PersistentState = {
                version: 1,
                plexAuth: null,
                channelConfigs: [],
                currentChannelIndex: 0,
                userPreferences: { theme: 'dark', volume: 100, subtitleLanguage: null, audioLanguage: null },
                lastUpdated: Date.now(),
            };
            mockStateManager.load.mockResolvedValue(savedState);

            const handler = jest.fn();
            lifecycle.on('stateRestored', handler);

            await lifecycle.initialize();

            expect(handler).toHaveBeenCalledWith(savedState);
        });

        it('should register visibility listeners', async () => {
            await lifecycle.initialize();

            expect(addEventListenerSpy).toHaveBeenCalledWith(
                'visibilitychange',
                expect.any(Function)
            );
        });

        it('should register webOSRelaunch listener', async () => {
            await lifecycle.initialize();

            expect(addEventListenerSpy).toHaveBeenCalledWith(
                'webOSRelaunch',
                expect.any(Function)
            );
        });
    });

    describe('shutdown', () => {
        it('should remove visibility listeners', async () => {
            await lifecycle.initialize();
            await lifecycle.shutdown();

            expect(removeEventListenerSpy).toHaveBeenCalledWith(
                'visibilitychange',
                expect.any(Function)
            );
        });

        it('should set phase to terminating', async () => {
            await lifecycle.initialize();
            // Follow valid transition path: authenticating -> loading_data -> ready
            lifecycle.setPhase('loading_data');
            await Promise.resolve();
            lifecycle.setPhase('ready');
            await Promise.resolve();
            await lifecycle.shutdown();

            expect(lifecycle.getPhase()).toBe('terminating');
        });

        it('should emit beforeTerminate event', async () => {
            await lifecycle.initialize();
            // Follow valid transition path: authenticating -> loading_data -> ready
            lifecycle.setPhase('loading_data');
            await Promise.resolve();
            lifecycle.setPhase('ready');
            await Promise.resolve();

            const handler = jest.fn();
            lifecycle.on('beforeTerminate', handler);

            await lifecycle.shutdown();

            expect(handler).toHaveBeenCalled();
        });
    });

    describe('persistence', () => {
        it('should save state to localStorage', async () => {
            jest.useFakeTimers();
            await lifecycle.initialize();

            await lifecycle.saveState();
            jest.advanceTimersByTime(600); // Past debounce time

            // Wait for async operations
            await Promise.resolve();

            expect(mockStateManager.save).toHaveBeenCalled();
        });

        it('should include version number in restored or default state', async () => {
            await lifecycle.initialize();
            const savedState = (await lifecycle.restoreState()) || mockStateManager.createDefaultState();

            expect(savedState.version).toBeDefined();
            expect(typeof savedState.version).toBe('number');
        });
    });

    describe('visibility', () => {
        it('should call pause callbacks when hidden', async () => {
            await lifecycle.initialize();
            // Follow valid transition path: authenticating -> loading_data -> ready
            lifecycle.setPhase('loading_data');
            await new Promise(resolve => setTimeout(resolve, 0));
            lifecycle.setPhase('ready');
            await new Promise(resolve => setTimeout(resolve, 0));

            const pauseCallback = jest.fn();
            lifecycle.onPause(pauseCallback);

            // Simulate visibility change to hidden
            Object.defineProperty(document, 'hidden', { value: true, configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));

            // Wait for async callbacks
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(pauseCallback).toHaveBeenCalled();
        });

        it('should call resume callbacks when visible', async () => {
            await lifecycle.initialize();
            // Follow valid transition path: authenticating -> loading_data -> ready
            lifecycle.setPhase('loading_data');
            await new Promise(resolve => setTimeout(resolve, 0));
            lifecycle.setPhase('ready');
            await new Promise(resolve => setTimeout(resolve, 0));

            const resumeCallback = jest.fn();
            lifecycle.onResume(resumeCallback);

            // First hide
            Object.defineProperty(document, 'hidden', { value: true, configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));
            await new Promise(resolve => setTimeout(resolve, 0));

            // Then show
            Object.defineProperty(document, 'hidden', { value: false, configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(resumeCallback).toHaveBeenCalled();
        });

        it('should emit visibilityChange event', async () => {
            await lifecycle.initialize();
            // Follow valid transition path: authenticating -> loading_data -> ready
            lifecycle.setPhase('loading_data');
            await new Promise(resolve => setTimeout(resolve, 0));
            lifecycle.setPhase('ready');
            await new Promise(resolve => setTimeout(resolve, 0));

            const handler = jest.fn();
            lifecycle.on('visibilityChange', handler);

            Object.defineProperty(document, 'hidden', { value: true, configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(handler).toHaveBeenCalledWith({ isVisible: false });
        });

        it('should set phase to backgrounded when ready and hidden', async () => {
            await lifecycle.initialize();
            // Follow valid transition path: authenticating -> loading_data -> ready
            lifecycle.setPhase('loading_data');
            await new Promise(resolve => setTimeout(resolve, 0));
            lifecycle.setPhase('ready');
            await new Promise(resolve => setTimeout(resolve, 0));

            Object.defineProperty(document, 'hidden', { value: true, configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(lifecycle.getPhase()).toBe('backgrounded');
        });
    });

    describe('error handling', () => {
        it('should store reported error', async () => {
            await lifecycle.initialize();

            const error = {
                code: AppErrorCode.NETWORK_UNAVAILABLE,
                message: 'No network',
                recoverable: true,
            };

            lifecycle.reportError(error);

            expect(lifecycle.getLastError()).toEqual(error);
        });

        it('should set phase to error on reportError', async () => {
            await lifecycle.initialize();
            // Follow valid transition path: authenticating -> loading_data -> ready
            lifecycle.setPhase('loading_data');
            await new Promise(resolve => setTimeout(resolve, 0));
            lifecycle.setPhase('ready');
            await new Promise(resolve => setTimeout(resolve, 0));

            lifecycle.reportError({
                code: AppErrorCode.AUTH_EXPIRED,
                message: 'Session expired',
                recoverable: true,
            });
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(lifecycle.getPhase()).toBe('error');
        });

        it('should emit error event with lifecycle context', async () => {
            await lifecycle.initialize();

            const handler = jest.fn();
            lifecycle.on('error', handler);

            lifecycle.reportError({
                code: AppErrorCode.NETWORK_TIMEOUT,
                message: 'Timeout',
                recoverable: true,
            });

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    code: AppErrorCode.NETWORK_TIMEOUT,
                    phase: expect.any(String),
                    timestamp: expect.any(Number),
                })
            );
        });
    });

    describe('network monitoring', () => {
        it('should detect online status', async () => {
            Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
            await lifecycle.initialize();

            expect(lifecycle.isNetworkAvailable()).toBe(true);
        });

        it('checkNetworkStatus should treat resolved no-cors fetch as available', async () => {
            const originalFetch = globalThis.fetch;
            (globalThis as unknown as { fetch: typeof fetch }).fetch = (jest.fn().mockResolvedValue({
                ok: false,
                type: 'opaque',
            }) as unknown) as typeof fetch;

            await lifecycle.initialize();

            const result = await lifecycle.checkNetworkStatus();
            expect(result).toBe(true);
            expect(lifecycle.isNetworkAvailable()).toBe(true);

            globalThis.fetch = originalFetch;
        });

        it('should detect offline status', async () => {
            Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
            await lifecycle.initialize();

            expect(lifecycle.isNetworkAvailable()).toBe(false);
        });

        it('should emit networkChange on connectivity change', async () => {
            await lifecycle.initialize();

            const handler = jest.fn();
            lifecycle.on('networkChange', handler);

            window.dispatchEvent(new Event('offline'));

            expect(handler).toHaveBeenCalledWith({ isAvailable: false });
        });
    });

    describe('memory monitoring', () => {
        it('should return memory usage when API available', async () => {
            await lifecycle.initialize();

            const usage = lifecycle.getMemoryUsage();

            expect(usage.used).toBeGreaterThan(0);
            expect(usage.limit).toBeGreaterThan(0);
            expect(usage.percentage).toBeGreaterThanOrEqual(0);
        });

        it('should emit clearCaches when cleanup performed', async () => {
            await lifecycle.initialize();

            const handler = jest.fn();
            lifecycle.on('clearCaches', handler);

            lifecycle.performMemoryCleanup();

            expect(handler).toHaveBeenCalled();
        });
    });

    describe('phase management', () => {
        it('should emit phaseChange event on phase transition', async () => {
            await lifecycle.initialize();
            // Follow valid transition path: authenticating -> loading_data
            const handler = jest.fn();
            lifecycle.on('phaseChange', handler);

            lifecycle.setPhase('loading_data');
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    from: 'authenticating',
                    to: 'loading_data',
                })
            );
        });

        it('should not emit if phase unchanged', async () => {
            await lifecycle.initialize();
            // Follow valid transition path: authenticating -> loading_data
            lifecycle.setPhase('loading_data');
            await new Promise(resolve => setTimeout(resolve, 0));

            const handler = jest.fn();
            lifecycle.on('phaseChange', handler);

            lifecycle.setPhase('loading_data');
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(handler).not.toHaveBeenCalled();
        });

        it('should return correct state object', async () => {
            await lifecycle.initialize();
            // Follow valid transition path: authenticating -> loading_data -> ready
            lifecycle.setPhase('loading_data');
            await new Promise(resolve => setTimeout(resolve, 0));
            lifecycle.setPhase('ready');
            await new Promise(resolve => setTimeout(resolve, 0));

            const state = lifecycle.getState();

            expect(state.phase).toBe('ready');
            expect(typeof state.isVisible).toBe('boolean');
            expect(typeof state.isNetworkAvailable).toBe('boolean');
            expect(typeof state.lastActiveTime).toBe('number');
        });

        // ========================================
        // LIFE-003: Invalid Phase Transitions
        // ========================================

        it('should reject invalid phase transition from authenticating to ready', async () => {
            await lifecycle.initialize();
            // Should be in 'authenticating' phase
            expect(lifecycle.getPhase()).toBe('authenticating');

            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

            // Try to jump directly to 'ready' (invalid: should go through loading_data)
            lifecycle.setPhase('ready');
            await new Promise(resolve => setTimeout(resolve, 0));

            // Phase should NOT have changed
            expect(lifecycle.getPhase()).toBe('authenticating');
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Invalid phase transition')
            );

            consoleWarnSpy.mockRestore();
        });

        it('should reject invalid phase transition from ready to authenticating', async () => {
            await lifecycle.initialize();
            // Progress through valid transitions to reach 'ready'
            lifecycle.setPhase('loading_data');
            await new Promise(resolve => setTimeout(resolve, 0));
            lifecycle.setPhase('ready');
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(lifecycle.getPhase()).toBe('ready');

            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

            // Try to go back to 'authenticating' (invalid transition)
            lifecycle.setPhase('authenticating');
            await Promise.resolve();

            // Phase should NOT have changed
            expect(lifecycle.getPhase()).toBe('ready');
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Invalid phase transition')
            );

            consoleWarnSpy.mockRestore();
        });

        it('should reject transition from loading_data to authenticating', async () => {
            await lifecycle.initialize();
            lifecycle.setPhase('loading_data');
            await Promise.resolve();

            expect(lifecycle.getPhase()).toBe('loading_data');

            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

            // Try invalid backward transition
            lifecycle.setPhase('authenticating');
            await Promise.resolve();

            expect(lifecycle.getPhase()).toBe('loading_data');
            expect(consoleWarnSpy).toHaveBeenCalled();

            consoleWarnSpy.mockRestore();
        });
    });
});
