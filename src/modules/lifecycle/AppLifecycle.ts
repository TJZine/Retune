/**
 * @fileoverview Application Lifecycle Manager for webOS.
 * @module modules/lifecycle/AppLifecycle
 * @version 1.0.0
 */

import { IAppLifecycle } from './interfaces';
import {
    AppPhase,
    AppError,
    PersistentState,
    AppLifecycleState,
    MemoryUsage,
    LifecycleEventMap,
    LifecycleCallback,
    LifecycleAppError,
} from './types';
import { StateManager } from './StateManager';
import { ErrorRecovery } from './ErrorRecovery';
import { EventEmitter } from '../../utils/EventEmitter';
import type { IDisposable } from '../../utils/interfaces';
import {
    MEMORY_THRESHOLDS,
    TIMING_CONFIG,
    VALID_PHASE_TRANSITIONS,
} from './constants';

/**
 * Application Lifecycle Manager.
 * Manages app phases, visibility, network monitoring, memory tracking,
 * state persistence, and error reporting for webOS applications.
 */
export class AppLifecycle implements IAppLifecycle {
    // Dependencies
    private readonly _emitter: EventEmitter<LifecycleEventMap>;
    private readonly _stateManager: StateManager;
    private readonly _errorRecovery: ErrorRecovery;

    // Runtime state
    private _phase: AppPhase = 'initializing';
    private _isVisible: boolean = true;
    private _isNetworkAvailable: boolean = true;
    private _lastActiveTime: number = Date.now();
    private _lastError: AppError | null = null;

    // Callbacks
    private readonly _pauseCallbacks: LifecycleCallback[] = [];
    private readonly _resumeCallbacks: LifecycleCallback[] = [];
    private readonly _terminateCallbacks: LifecycleCallback[] = [];

    // Event listener references (for cleanup)
    private _visibilityHandler: (() => void) | null = null;
    private _webOSRelaunchHandler: ((event: Event) => void) | null = null;
    private _onlineHandler: (() => void) | null = null;
    private _offlineHandler: (() => void) | null = null;

    // Memory monitoring
    private _memoryCheckInterval: number | null = null;

    // Network monitoring
    private _networkCheckInterval: number | null = null;

    // State save debounce
    private _saveDebounceTimer: number | null = null;
    private _pendingState: PersistentState | null = null;
    private _nextPersistenceWarningAt: number = 0;
    private _persistenceWarningBackoffMs: number = TIMING_CONFIG.PERSISTENCE_WARNING_BACKOFF_MS;

    // Idempotency guards (ISSUE-003)
    private _initialized: boolean = false;
    private _shutdownStarted: boolean = false;

    // Network warning throttling
    private _nextNetworkWarningAt: number = 0;

    /**
     * Create a new AppLifecycle manager.
     * @param stateManager - Optional custom StateManager (for testing)
     * @param errorRecovery - Optional custom ErrorRecovery (for testing)
     */
    constructor(stateManager?: StateManager, errorRecovery?: ErrorRecovery) {
        this._emitter = new EventEmitter<LifecycleEventMap>();
        this._stateManager = stateManager !== undefined ? stateManager : new StateManager();
        this._errorRecovery = errorRecovery !== undefined ? errorRecovery : new ErrorRecovery();
    }

    // ========== Lifecycle Methods ==========

    /**
     * Initialize the lifecycle manager.
     * Sets up event listeners and restores state.
     */
    public async initialize(): Promise<void> {
        // Idempotency guard: prevent double-initialization
        if (this._initialized) {
            return;
        }
        this._initialized = true;

        // Setup event listeners
        this._setupVisibilityListeners();
        this._setupNetworkListeners();
        this._startMemoryMonitoring();
        this._startNetworkMonitoring();

        // Check initial network state
        this._isNetworkAvailable = navigator.onLine;

        // Restore state
        const savedState = await this.restoreState();

        if (savedState !== null) {
            this._emitter.emit('stateRestored', savedState);
        }

        // Auth is managed by PlexAuth storage; default to authenticating here.
        await this._transitionPhase('authenticating');
    }

    /**
     * Shutdown the lifecycle manager.
     * Saves state and removes all event listeners.
     */
    public async shutdown(): Promise<void> {
        // Idempotency guard: prevent double-shutdown
        if (this._shutdownStarted) {
            return;
        }
        this._shutdownStarted = true;

        await this._transitionPhase('terminating');

        // Emit beforeTerminate
        this._emitter.emit('beforeTerminate', undefined);

        // Execute terminate callbacks with timeout
        await this._executeCallbacksWithTimeout(
            this._terminateCallbacks,
            TIMING_CONFIG.CALLBACK_TIMEOUT_MS
        );

        // Save final state (already saved by _transitionPhase, but flush any pending)
        try {
            await this._flushPendingSave();
        } catch {
            // Silently handle save errors on shutdown
        }

        // Stop monitoring
        this._stopMemoryMonitoring();
        this._stopNetworkMonitoring();

        // Remove event listeners
        this._removeVisibilityListeners();
        this._removeNetworkListeners();

        // Clear all event handlers
        this._emitter.removeAllListeners();
    }

    // ========== State Persistence ==========

    /**
     * Save current application state.
     * Debounced to prevent excessive writes.
     */
    public async saveState(): Promise<void> {
        const state = this._buildCurrentState();
        this._pendingState = state;

        // Debounce saves
        if (this._saveDebounceTimer !== null) {
            clearTimeout(this._saveDebounceTimer);
        }

        this._saveDebounceTimer = window.setTimeout(() => {
            this._fireAndForget(this._flushPendingSave(), 'saveState');
        }, TIMING_CONFIG.SAVE_DEBOUNCE_MS) as unknown as number;
    }

    /**
     * Restore state from localStorage.
     * @returns Restored state, or null if not available
     */
    public async restoreState(): Promise<PersistentState | null> {
        return this._stateManager.load();
    }

    /**
     * Clear all persisted state.
     */
    public async clearState(): Promise<void> {
        await this._stateManager.clear();
    }

    // ========== Lifecycle Callbacks ==========

    /**
     * Register a callback for when app is paused.
     * @param callback - Function to call on pause
     */
    public onPause(callback: LifecycleCallback): void {
        this._pauseCallbacks.push(callback);
    }

    /**
     * Register a callback for when app resumes.
     * @param callback - Function to call on resume
     */
    public onResume(callback: LifecycleCallback): void {
        this._resumeCallbacks.push(callback);
    }

    /**
     * Register a callback for before termination.
     * @param callback - Function to call before terminate
     */
    public onTerminate(callback: LifecycleCallback): void {
        this._terminateCallbacks.push(callback);
    }

    // ========== Network Monitoring ==========

    /**
     * Check if network is available.
     * @returns true if online
     */
    public isNetworkAvailable(): boolean {
        return this._isNetworkAvailable;
    }

    /**
     * Actively test network connectivity.
     * @returns true if network test succeeds
     */
    public async checkNetworkStatus(): Promise<boolean> {
        let timeoutId: number | null = null;
        try {
            // Simple HEAD request to check connectivity
            const controller = new AbortController();
            timeoutId = window.setTimeout(
                () => controller.abort(),
                TIMING_CONFIG.NETWORK_CHECK_TIMEOUT_MS
            ) as unknown as number;

            const response = await fetch('https://plex.tv', {
                method: 'HEAD',
                signal: controller.signal,
                mode: 'no-cors' // Use no-cors to avoid CORS errors on opaque network check
            });

            const available = response.ok;
            if (available !== this._isNetworkAvailable) {
                this._isNetworkAvailable = available;
                this._emitter.emit('networkChange', { isAvailable: available });
            }

            return available;
        } catch {
            if (this._isNetworkAvailable) {
                this._isNetworkAvailable = false;
                this._emitter.emit('networkChange', { isAvailable: false });
            }
            this._maybeEmitNetworkWarning('Network connectivity check failed');
            return false;
        } finally {
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
            }
        }
    }

    // ========== Memory Monitoring ==========

    /**
     * Get current memory usage.
     * @returns Memory usage statistics
     */
    public getMemoryUsage(): MemoryUsage {
        // performance.memory is Chrome-specific (including webOS)
        const memory = (performance as unknown as {
            memory?: {
                usedJSHeapSize: number;
                totalJSHeapSize: number;
                jsHeapSizeLimit: number;
            }
        }).memory;

        if (memory) {
            return {
                used: memory.usedJSHeapSize,
                limit: memory.jsHeapSizeLimit,
                percentage: Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100),
            };
        }

        // Fallback when memory API not available
        return {
            used: 0,
            limit: MEMORY_THRESHOLDS.LIMIT_BYTES,
            percentage: 0,
        };
    }

    /**
     * Perform memory cleanup.
     * Emits events to trigger cache clearing.
     */
    public performMemoryCleanup(): void {
        this._emitter.emit('clearCaches', undefined);
    }

    // ========== Phase Management ==========

    /**
     * Get current application phase.
     */
    public getPhase(): AppPhase {
        return this._phase;
    }

    /**
     * Get full lifecycle state.
     */
    public getState(): AppLifecycleState {
        return {
            phase: this._phase,
            isVisible: this._isVisible,
            isNetworkAvailable: this._isNetworkAvailable,
            lastActiveTime: this._lastActiveTime,
            plexConnectionStatus: 'disconnected', // Updated by external module
            currentError: this._lastError,
        };
    }

    /**
     * Set application phase.
     * Validates transition and emits event.
     * @param phase - New phase
     */
    public setPhase(phase: AppPhase): void {
        // Synchronous validation to catch invalid transitions immediately
        const validTransitions = VALID_PHASE_TRANSITIONS[this._phase];
        if (validTransitions && !validTransitions.includes(phase)) {
            // Log invalid transition attempt for debugging
            console.warn(
                `[AppLifecycle] Invalid phase transition: ${this._phase} -> ${phase}`
            );
            return;
        }
        // Delegate to the async version (now validated)
        this._transitionPhase(phase);
    }

    /**
     * Internal: Transition phase with validation and state save.
     * MUST reject invalid transitions per spec.
     * @param phase - New phase
     * @returns true if transition succeeded
     */
    private async _transitionPhase(phase: AppPhase): Promise<boolean> {
        // No-op if same phase
        if (this._phase === phase) {
            return true;
        }

        // Validate transition
        const validTransitions = VALID_PHASE_TRANSITIONS[this._phase];
        if (validTransitions && !validTransitions.includes(phase)) {
            // Reject invalid transition per spec
            return false;
        }

        // Save state BEFORE transition (per spec)
        await this._flushPendingSave();

        const from = this._phase;
        this._phase = phase;

        this._emitter.emit('phaseChange', { from, to: phase });
        return true;
    }

    // ========== Error Handling ==========

    /**
     * Report an error.
     * @param error - Error to report
     */
    public reportError(error: AppError): void {
        this._lastError = error;

        const lifecycleError: LifecycleAppError = {
            ...error,
            phase: this._phase,
            timestamp: Date.now(),
            userMessage: this._errorRecovery.getUserMessage(error.code),
            actions: [],
        };

        // Set phase to error if not already
        if (this._phase !== 'error' && this._phase !== 'terminating') {
            this._transitionPhase('error');
        }

        this._emitter.emit('error', lifecycleError);
    }

    /**
     * Get the last reported error.
     */
    public getLastError(): AppError | null {
        return this._lastError;
    }

    /**
     * Get the error recovery handler.
     */
    public getErrorRecovery(): ErrorRecovery {
        return this._errorRecovery;
    }

    // ========== Event Handling ==========

    /**
     * Register an event handler.
     * @returns A disposable to remove the handler
     */
    public on<K extends keyof LifecycleEventMap>(
        event: K,
        handler: (payload: LifecycleEventMap[K]) => void
    ): IDisposable {
        return this._emitter.on(event, handler);
    }

    // ========== Private Methods ==========

    /**
     * Setup visibility change listeners.
     */
    private _setupVisibilityListeners(): void {
        // Standard visibility API
        this._visibilityHandler = (): void => {
            if (document.hidden) {
                this._handlePause();
            } else {
                this._handleResume();
            }
        };
        document.addEventListener('visibilitychange', this._visibilityHandler);

        // webOS relaunch event
        this._webOSRelaunchHandler = (_event: Event): void => {
            this._handleResume();
        };
        document.addEventListener('webOSRelaunch', this._webOSRelaunchHandler);
    }

    /**
     * Remove visibility listeners.
     */
    private _removeVisibilityListeners(): void {
        if (this._visibilityHandler) {
            document.removeEventListener('visibilitychange', this._visibilityHandler);
            this._visibilityHandler = null;
        }
        if (this._webOSRelaunchHandler) {
            document.removeEventListener('webOSRelaunch', this._webOSRelaunchHandler);
            this._webOSRelaunchHandler = null;
        }
    }

    /**
     * Setup network change listeners.
     */
    private _setupNetworkListeners(): void {
        this._onlineHandler = (): void => {
            this._isNetworkAvailable = true;
            this._emitter.emit('networkChange', { isAvailable: true });
        };

        this._offlineHandler = (): void => {
            this._isNetworkAvailable = false;
            this._emitter.emit('networkChange', { isAvailable: false });
        };

        window.addEventListener('online', this._onlineHandler);
        window.addEventListener('offline', this._offlineHandler);
    }

    /**
     * Start periodic network connectivity checks.
     */
    private _startNetworkMonitoring(): void {
        this._networkCheckInterval = window.setInterval(() => {
            this._fireAndForget(this.checkNetworkStatus(), 'network-monitor');
        }, TIMING_CONFIG.NETWORK_CHECK_INTERVAL_MS) as unknown as number;
    }

    /**
     * Stop periodic network checks.
     */
    private _stopNetworkMonitoring(): void {
        if (this._networkCheckInterval !== null) {
            clearInterval(this._networkCheckInterval);
            this._networkCheckInterval = null;
        }
    }

    /**
     * Remove network listeners.
     */
    private _removeNetworkListeners(): void {
        if (this._onlineHandler) {
            window.removeEventListener('online', this._onlineHandler);
            this._onlineHandler = null;
        }
        if (this._offlineHandler) {
            window.removeEventListener('offline', this._offlineHandler);
            this._offlineHandler = null;
        }
    }

    /**
     * Start memory monitoring.
     */
    private _startMemoryMonitoring(): void {
        this._memoryCheckInterval = window.setInterval(() => {
            this._checkMemory();
        }, MEMORY_THRESHOLDS.CHECK_INTERVAL_MS) as unknown as number;
    }

    /**
     * Stop memory monitoring.
     */
    private _stopMemoryMonitoring(): void {
        if (this._memoryCheckInterval !== null) {
            clearInterval(this._memoryCheckInterval);
            this._memoryCheckInterval = null;
        }
    }

    /**
     * Check memory usage and emit warnings if needed.
     */
    private _checkMemory(): void {
        const usage = this.getMemoryUsage();
        if (usage.used === 0) {
            return; // API not available
        }

        if (usage.used > MEMORY_THRESHOLDS.CRITICAL_BYTES) {
            this._emitter.emit('memoryWarning', { level: 'critical', used: usage.used });
            this.performMemoryCleanup();
        } else if (usage.used > MEMORY_THRESHOLDS.WARNING_BYTES) {
            this._emitter.emit('memoryWarning', { level: 'warning', used: usage.used });
        }
    }

    /**
     * Handle app pause (backgrounding).
     */
    private async _handlePause(): Promise<void> {
        if (!this._isVisible) {
            return; // Already paused
        }

        this._isVisible = false;
        this._emitter.emit('visibilityChange', { isVisible: false });

        // Save state immediately on pause
        await this._flushPendingSave();

        // Execute pause callbacks with timeout
        await this._executeCallbacksWithTimeout(
            this._pauseCallbacks,
            TIMING_CONFIG.CALLBACK_TIMEOUT_MS
        );

        if (this._phase === 'ready') {
            await this._transitionPhase('backgrounded');
        }
    }

    /**
     * Handle app resume (foregrounding).
     */
    private async _handleResume(): Promise<void> {
        if (this._isVisible) {
            return; // Already visible
        }

        this._isVisible = true;
        this._lastActiveTime = Date.now();
        this._emitter.emit('visibilityChange', { isVisible: true });

        if (this._phase === 'backgrounded') {
            await this._transitionPhase('resuming');
        }

        // Execute resume callbacks
        await this._executeCallbacksWithTimeout(
            this._resumeCallbacks,
            TIMING_CONFIG.CALLBACK_TIMEOUT_MS
        );

        if (this._phase === 'resuming') {
            await this._transitionPhase('ready');
        }
    }

    /**
     * Execute callbacks with a timeout.
     */
    private async _executeCallbacksWithTimeout(
        callbacks: LifecycleCallback[],
        timeoutMs: number
    ): Promise<void> {
        const promises = callbacks.map((callback) => {
            return new Promise<void>((resolve) => {
                const timeoutId = setTimeout(() => {
                    resolve();
                }, timeoutMs);

                try {
                    const result = callback();
                    if (result && typeof result.then === 'function') {
                        result.then(() => {
                            clearTimeout(timeoutId);
                            resolve();
                        }).catch(() => {
                            clearTimeout(timeoutId);
                            resolve();
                        });
                    } else {
                        clearTimeout(timeoutId);
                        resolve();
                    }
                } catch {
                    clearTimeout(timeoutId);
                    resolve();
                }
            });
        });

        await Promise.all(promises);
    }

    /**
     * Flush any pending state save immediately.
     */
    private async _flushPendingSave(): Promise<void> {
        if (this._saveDebounceTimer !== null) {
            clearTimeout(this._saveDebounceTimer);
            this._saveDebounceTimer = null;
        }

        if (this._pendingState !== null) {
            try {
                await this._stateManager.save(this._pendingState);
                this._pendingState = null;
                this._persistenceWarningBackoffMs =
                    TIMING_CONFIG.PERSISTENCE_WARNING_BACKOFF_MS;
            } catch (error) {
                this._handleSaveError(error);
            }
        }
    }

    /**
     * Fire-and-forget helper that funnels async errors into non-blocking handling.
     */
    private _fireAndForget(promise: Promise<unknown>, context: string): void {
        void promise.catch((error) => {
            this._handleAsyncError(error, context);
        });
    }

    private _handleAsyncError(error: unknown, context: string): void {
        if (context === 'saveState') {
            this._handleSaveError(error);
            return;
        }
        console.warn(`[AppLifecycle] Unhandled async error (${context}):`, error);
    }

    private _handleSaveError(error: unknown): void {
        const isQuotaError = this._isQuotaError(error);
        if (this._shouldEmitPersistenceWarning(isQuotaError)) {
            const message = isQuotaError
                ? 'Persistent storage quota exceeded; save deferred'
                : 'Failed to persist state; will retry on next save';
            console.warn(`[AppLifecycle] ${message}`, error);
            this._emitter.emit('persistenceWarning', {
                message,
                isQuotaError,
                timestamp: Date.now(),
            });
        }
    }

    private _shouldEmitPersistenceWarning(isQuotaError: boolean): boolean {
        const now = Date.now();
        if (now < this._nextPersistenceWarningAt) {
            return false;
        }
        const backoff = isQuotaError
            ? this._persistenceWarningBackoffMs
            : TIMING_CONFIG.PERSISTENCE_WARNING_BACKOFF_MS;
        this._nextPersistenceWarningAt = now + backoff;
        if (isQuotaError) {
            this._persistenceWarningBackoffMs = Math.min(
                this._persistenceWarningBackoffMs * 2,
                TIMING_CONFIG.PERSISTENCE_WARNING_MAX_BACKOFF_MS
            );
        } else {
            this._persistenceWarningBackoffMs = TIMING_CONFIG.PERSISTENCE_WARNING_BACKOFF_MS;
        }
        return true;
    }

    private _maybeEmitNetworkWarning(message: string): void {
        const now = Date.now();
        if (now < this._nextNetworkWarningAt) {
            return;
        }
        this._nextNetworkWarningAt = now + TIMING_CONFIG.NETWORK_WARNING_BACKOFF_MS;
        console.warn(`[AppLifecycle] ${message}`);
        this._emitter.emit('networkWarning', {
            message,
            isAvailable: this._isNetworkAvailable,
            timestamp: now,
        });
    }

    private _isQuotaError(error: unknown): boolean {
        if (error instanceof DOMException) {
            return (
                error.code === 22 ||
                error.code === 1014 ||
                error.name === 'QuotaExceededError'
            );
        }
        return false;
    }

    /**
     * Build current state for saving.
     */
    private _buildCurrentState(): PersistentState {
        // Load existing persisted state as baseline, or create default if none exists
        const existingState =
            this._stateManager.loadSync() ?? this._stateManager.createDefaultState();

        // Return state with updated timestamp
        // Note: Other modules (PlexAuth, ChannelManager) own their respective state.
        // AppLifecycle persists the baseline; modules should call saveState after
        // updating their portions via StateManager integration.
        return {
            ...existingState,
            lastUpdated: Date.now(),
        };
    }
}
