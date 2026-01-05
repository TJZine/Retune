/**
 * @fileoverview Interface definitions for the Application Lifecycle module.
 * @module modules/lifecycle/interfaces
 * @version 1.0.0
 */

import {
    AppPhase,
    AppError,
    PersistentState,
    AppLifecycleState,
    MemoryUsage,
    ErrorAction,
    LifecycleCallback,
    LifecycleEventMap,
    AppErrorCode,
} from './types';

/**
 * Application Lifecycle Interface.
 * Manages app phases, persistence, visibility, network, memory, and error reporting.
 */
export interface IAppLifecycle {
    /**
     * Initialize the lifecycle manager.
     * Sets up event listeners for visibility and network changes.
     * Restores state from localStorage if available.
     */
    initialize(): Promise<void>;

    /**
     * Shutdown the lifecycle manager.
     * Removes all event listeners, saves state, and cleans up.
     */
    shutdown(): Promise<void>;

    /**
     * Save current application state to localStorage.
     */
    saveState(): Promise<void>;

    /**
     * Restore application state from localStorage.
     * @returns The restored state, or null if not available
     */
    restoreState(): Promise<PersistentState | null>;

    /**
     * Clear all persisted state from localStorage.
     */
    clearState(): Promise<void>;

    /**
     * Register a callback for when the app is paused (backgrounded).
     * @param callback - Function to call on pause
     */
    onPause(callback: LifecycleCallback): void;

    /**
     * Register a callback for when the app is resumed (foregrounded).
     * @param callback - Function to call on resume
     */
    onResume(callback: LifecycleCallback): void;

    /**
     * Register a callback for when the app is about to terminate.
     * @param callback - Function to call before terminate
     */
    onTerminate(callback: LifecycleCallback): void;

    /**
     * Check if network is currently available.
     * Uses navigator.onLine for quick access.
     * @returns true if network is available
     */
    isNetworkAvailable(): boolean;

    /**
     * Actively check network connectivity.
     * Performs an actual network request to verify connectivity.
     * @returns true if network test succeeds
     */
    checkNetworkStatus(): Promise<boolean>;

    /**
     * Get current memory usage statistics.
     * Uses performance.memory if available (Chrome/webOS).
     * @returns Memory usage info with used, limit, and percentage
     */
    getMemoryUsage(): MemoryUsage;

    /**
     * Trigger memory cleanup operations.
     * Emits events to clear caches and force garbage collection.
     */
    performMemoryCleanup(): void;

    /**
     * Get the current application phase.
     * @returns Current phase
     */
    getPhase(): AppPhase;

    /**
     * Get the full lifecycle state.
     * @returns Current runtime state
     */
    getState(): AppLifecycleState;

    /**
     * Set the application phase.
     * Validates transition and emits phaseChange event.
     * @param phase - New phase
     */
    setPhase(phase: AppPhase): void;

    /**
     * Report an error for handling.
     * Sets phase to 'error' and emits error event.
     * @param error - Error to report
     */
    reportError(error: AppError): void;

    /**
     * Get the last reported error.
     * @returns Last error, or null if none
     */
    getLastError(): AppError | null;

    /**
     * Register an event handler.
     * @param event - Event name
     * @param handler - Handler function
     */
    on<K extends keyof LifecycleEventMap>(
        event: K,
        handler: (payload: LifecycleEventMap[K]) => void
    ): void;
}

/**
 * Error Recovery Interface.
 * Maps errors to recovery actions and executes them.
 */
export interface IErrorRecovery {
    /**
     * Get recovery actions for an error.
     * @param error - Error to handle
     * @returns Array of possible recovery actions
     */
    handleError(error: AppError): ErrorAction[];

    /**
     * Execute a recovery action.
     * @param action - Action to execute
     * @returns true if recovery succeeded, false otherwise
     */
    executeRecovery(action: ErrorAction): Promise<boolean>;

    /**
     * Create an AppError with the given parameters.
     * @param code - Error code
     * @param message - Error message
     * @param context - Optional context
     * @returns Constructed AppError
     */
    createError(
        code: AppErrorCode,
        message: string,
        context?: Record<string, unknown>
    ): AppError;
}

/**
 * State Manager Interface.
 * Handles localStorage persistence with versioning and migrations.
 */
export interface IStateManager {
    /**
     * Save state to localStorage.
     * @param state - State to save
     */
    save(state: PersistentState): Promise<void>;

    /**
     * Load state from localStorage.
     * Applies migrations if needed.
     * @returns Loaded state, or null if not available
     */
    load(): Promise<PersistentState | null>;

    /**
     * Clear stored state.
     */
    clear(): Promise<void>;
}
