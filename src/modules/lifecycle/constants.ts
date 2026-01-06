/**
 * @fileoverview Constants for the Application Lifecycle module.
 * @module modules/lifecycle/constants
 * @version 1.0.0
 */

/**
 * Storage configuration for persistent state.
 */
export const STORAGE_CONFIG = {
    /** localStorage key for app state */
    STATE_KEY: 'retune_app_state',
    /** Current state schema version */
    STATE_VERSION: 1,
    /** Non-critical keys to remove on quota cleanup */
    CLEANUP_KEYS: [
        'retune_focus_memory',
        'retune_image_cache',
        'retune_schedule_cache',
    ],
} as const;

/**
 * Memory thresholds for webOS.
 * Total app budget: 300MB peak.
 */
export const MEMORY_THRESHOLDS = {
    /** Warning threshold in bytes (250MB) */
    WARNING_BYTES: 250 * 1024 * 1024,
    /** Critical threshold in bytes (280MB) */
    CRITICAL_BYTES: 280 * 1024 * 1024,
    /** Total limit in bytes (300MB) */
    LIMIT_BYTES: 300 * 1024 * 1024,
    /** Monitoring interval in milliseconds */
    CHECK_INTERVAL_MS: 30000,
} as const;

/**
 * Timing configuration for lifecycle operations.
 */
export const TIMING_CONFIG = {
    /** Maximum time to wait for pause callbacks (ms) */
    CALLBACK_TIMEOUT_MS: 5000,
    /** Debounce time for state saves (ms) */
    SAVE_DEBOUNCE_MS: 500,
    /** Network check timeout (ms) */
    NETWORK_CHECK_TIMEOUT_MS: 5000,
    /** Periodic network check interval (ms) */
    NETWORK_CHECK_INTERVAL_MS: 60000,
} as const;

/**
 * Default user preferences.
 */
export const DEFAULT_USER_PREFERENCES = {
    theme: 'dark' as const,
    volume: 100,
    subtitleLanguage: null,
    audioLanguage: null,
};

/**
 * Error messages for user-facing display.
 */
export const ERROR_MESSAGES = {
    AUTH_EXPIRED: 'Please sign in again',
    NETWORK_UNAVAILABLE: 'No internet connection',
    PLEX_UNREACHABLE: 'Cannot connect to Plex server',
    DATA_CORRUPTION: 'Settings were reset',
    PLAYBACK_FAILED: 'Unable to play content',
    OUT_OF_MEMORY: 'App needs to restart',
    STORAGE_QUOTA_EXCEEDED: 'Storage full - some settings may not be saved',
} as const;

/**
 * Valid phase transitions.
 * Key is current phase, value is array of valid next phases.
 */
export const VALID_PHASE_TRANSITIONS: Record<string, readonly string[]> = {
    initializing: ['authenticating', 'loading_data', 'error'],
    authenticating: ['loading_data', 'error'],
    loading_data: ['ready', 'error'],
    ready: ['backgrounded', 'terminating', 'error'],
    backgrounded: ['ready', 'resuming', 'terminating'],
    resuming: ['ready', 'error'],
    error: ['authenticating', 'ready', 'terminating'],
    terminating: [],
} as const;

/**
 * State version migrations.
 * Each migration function upgrades state from version N to N+1.
 */
export const MIGRATIONS: Record<number, (state: Record<string, unknown>) => Record<string, unknown>> = {
    // v1 -> v2: Example future migration
    // 1: (state) => ({
    //     ...state,
    //     version: 2,
    //     newField: 'default'
    // }),
};
