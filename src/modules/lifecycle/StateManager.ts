/**
 * @fileoverview State Manager for localStorage persistence with versioning.
 * @module modules/lifecycle/StateManager
 * @version 1.0.0
 */

import { IStateManager } from './interfaces';
import { PersistentState, UserPreferences } from './types';
import {
    STORAGE_CONFIG,
    MIGRATIONS,
    DEFAULT_USER_PREFERENCES,
} from './constants';

/**
 * Manages application state persistence to localStorage.
 * Handles versioning, migrations, and quota errors.
 */
export class StateManager implements IStateManager {
    private readonly _storageKey: string;
    private readonly _currentVersion: number;

    /**
     * Create a new StateManager.
     * @param storageKey - Override storage key (for testing)
     */
    constructor(storageKey?: string) {
        this._storageKey = storageKey !== undefined ? storageKey : STORAGE_CONFIG.STATE_KEY;
        this._currentVersion = STORAGE_CONFIG.STATE_VERSION;
    }

    /**
     * Save state to localStorage.
     * Handles QuotaExceededError by attempting cleanup and retry.
     * @param state - State to save
     */
    public async save(state: PersistentState): Promise<void> {
        const stateToSave: PersistentState = {
            ...state,
            version: this._currentVersion,
            lastUpdated: Date.now(),
        };

        const serialized = JSON.stringify(stateToSave);

        try {
            localStorage.setItem(this._storageKey, serialized);
        } catch (error) {
            if (this._isQuotaError(error)) {
                this._performStorageCleanup();

                // Retry once after cleanup
                localStorage.setItem(this._storageKey, serialized);
            } else {
                throw error;
            }
        }
    }

    /**
     * Load state from localStorage and apply migrations if needed.
     * @returns Loaded state, or null if not available/invalid
     */
    public async load(): Promise<PersistentState | null> {
        return this.loadSync();
    }

    /**
     * Load state synchronously from localStorage.
     * Used by _buildCurrentState which cannot be async.
     * @returns Loaded state, or null if not available/invalid
     */
    public loadSync(): PersistentState | null {
        try {
            const serialized = localStorage.getItem(this._storageKey);
            if (serialized === null) {
                return null;
            }

            const parsed: unknown = JSON.parse(serialized);
            if (!this._isValidState(parsed)) {
                return null;
            }

            // Apply migrations if needed
            const migrated = this._migrateState(parsed as Record<string, unknown>);
            if (migrated === null) {
                return null;
            }

            // Re-validate after migration to catch buggy migration functions
            if (!this._isValidState(migrated)) {
                return null;
            }

            return migrated as unknown as PersistentState;
        } catch (error) {
            // Log parse errors in development for debugging
            if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
                console.warn('[StateManager] Load error:', error);
            }
            return null;
        }
    }

    /**
     * Clear stored state.
     */
    public async clear(): Promise<void> {
        localStorage.removeItem(this._storageKey);
    }

    /**
     * Create a default persistent state.
     * @returns Default state object
     */
    public createDefaultState(): PersistentState {
        return {
            version: this._currentVersion,
            plexAuth: null,
            channelConfigs: [],
            currentChannelIndex: 0,
            userPreferences: { ...DEFAULT_USER_PREFERENCES } as UserPreferences,
            lastUpdated: Date.now(),
        };
    }

    /**
     * Apply version migrations to state.
     * @param state - State to migrate
     * @returns Migrated state, or null if migration fails
     */
    private _migrateState(state: Record<string, unknown>): Record<string, unknown> | null {
        const version = state['version'];
        if (typeof version !== 'number') {
            return null;
        }

        // Handle future versions gracefully (don't downgrade)
        if (version > this._currentVersion) {
            return state;
        }

        let currentState = state;
        let currentVersion = version;

        // Apply migrations sequentially
        while (currentVersion < this._currentVersion) {
            const migration = MIGRATIONS[currentVersion];
            if (!migration) {
                return null;
            }

            currentState = migration(currentState);
            currentVersion = currentVersion + 1;
        }

        return currentState;
    }

    /**
     * Check if error is a quota exceeded error.
     */
    private _isQuotaError(error: unknown): boolean {
        if (error instanceof DOMException) {
            // Different browsers use different error codes
            return (
                error.code === 22 || // Legacy
                error.code === 1014 || // Firefox
                error.name === 'QuotaExceededError'
            );
        }
        return false;
    }

    /**
     * Perform storage cleanup to free space.
     * Removes non-critical cached data defined in STORAGE_CONFIG.CLEANUP_KEYS.
     */
    private _performStorageCleanup(): void {
        for (const key of STORAGE_CONFIG.CLEANUP_KEYS) {
            try {
                localStorage.removeItem(key);
            } catch {
                // Ignore cleanup errors
            }
        }
    }

    /**
     * Validate that parsed data looks like a PersistentState.
     */
    private _isValidState(data: unknown): boolean {
        if (typeof data !== 'object' || data === null) {
            return false;
        }

        const obj = data as Record<string, unknown>;

        // Must have version number
        if (typeof obj['version'] !== 'number') {
            return false;
        }

        // Must have lastUpdated timestamp
        if (typeof obj['lastUpdated'] !== 'number') {
            return false;
        }

        // Must have required state shape
        if (!('plexAuth' in obj)) {
            return false;
        }
        if (!Array.isArray(obj['channelConfigs'])) {
            return false;
        }
        if (typeof obj['currentChannelIndex'] !== 'number') {
            return false;
        }
        if (typeof obj['userPreferences'] !== 'object' || obj['userPreferences'] === null) {
            return false;
        }

        return true;
    }
}
