/**
 * @fileoverview Type definitions for the Application Lifecycle module.
 * @module modules/lifecycle/types
 * @version 1.0.0
 */

/**
 * Unified error codes for the application.
 * Canonical taxonomy per shared-types specification.
 */
export enum AppErrorCode {
    // Authentication Errors
    AUTH_REQUIRED = 'AUTH_REQUIRED',
    AUTH_EXPIRED = 'AUTH_EXPIRED',
    AUTH_INVALID = 'AUTH_INVALID',
    AUTH_FAILED = 'AUTH_FAILED',
    AUTH_RATE_LIMITED = 'AUTH_RATE_LIMITED',

    // Network Errors
    NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
    NETWORK_OFFLINE = 'NETWORK_OFFLINE',
    NETWORK_UNAVAILABLE = 'NETWORK_UNAVAILABLE',
    SERVER_UNREACHABLE = 'SERVER_UNREACHABLE',
    SERVER_SSL_ERROR = 'SERVER_SSL_ERROR',
    MIXED_CONTENT_BLOCKED = 'MIXED_CONTENT_BLOCKED',
    SERVER_ERROR = 'SERVER_ERROR',
    RATE_LIMITED = 'RATE_LIMITED',
    RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',

    // Playback Errors
    PLAYBACK_FAILED = 'PLAYBACK_FAILED',
    PLAYBACK_DECODE_ERROR = 'PLAYBACK_DECODE_ERROR',
    PLAYBACK_FORMAT_UNSUPPORTED = 'PLAYBACK_FORMAT_UNSUPPORTED',

    // Storage Errors
    STORAGE_QUOTA_EXCEEDED = 'STORAGE_QUOTA_EXCEEDED',
    STORAGE_CORRUPTED = 'STORAGE_CORRUPTED',

    // Lifecycle Errors
    INITIALIZATION_FAILED = 'INITIALIZATION_FAILED',
    PLEX_UNREACHABLE = 'PLEX_UNREACHABLE',
    DATA_CORRUPTION = 'DATA_CORRUPTION',
    OUT_OF_MEMORY = 'OUT_OF_MEMORY',
    MODULE_INIT_FAILED = 'MODULE_INIT_FAILED',
    UNRECOVERABLE = 'UNRECOVERABLE',

    // Scheduler/Channel Errors (per channel-manager spec)
    CHANNEL_NOT_FOUND = 'CHANNEL_NOT_FOUND',
    SCHEDULER_EMPTY_CHANNEL = 'SCHEDULER_EMPTY_CHANNEL',
    CONTENT_UNAVAILABLE = 'CONTENT_UNAVAILABLE',

    // Generic
    UNKNOWN = 'UNKNOWN',
}

/**
 * Base application error structure.
 */
export interface AppError {
    /** Error code from canonical taxonomy */
    code: AppErrorCode;
    /** Technical error message */
    message: string;
    /** Whether recovery might succeed */
    recoverable: boolean;
    /** Additional context for debugging */
    context?: Record<string, unknown>;
}

/**
 * Application phase states.
 * Forms a state machine with valid transitions.
 */
export type AppPhase =
    | 'initializing'
    | 'authenticating'
    | 'loading_data'
    | 'ready'
    | 'backgrounded'
    | 'resuming'
    | 'error'
    | 'terminating';

/**
 * Plex server connection status.
 */
export type ConnectionStatus =
    | 'connected'
    | 'connecting'
    | 'disconnected'
    | 'unreachable';

/**
 * User preferences stored in persistent state.
 */
export interface UserPreferences {
    /** UI theme */
    theme: 'dark' | 'light';
    /** Audio volume level (0-100) */
    volume: number;
    /** Preferred subtitle language code */
    subtitleLanguage: string | null;
    /** Preferred audio language code */
    audioLanguage: string | null;
}

/**
 * Minimal channel configuration for persistence.
 * Full type defined in channel-manager module.
 */
export interface ChannelConfig {
    /** Unique channel identifier */
    id: string;
    /** Display name */
    name: string;
    /** Channel number for quick access */
    number: number;
}

/**
 * Minimal Plex authentication data for persistence.
 * Full type defined in plex-auth module.
 */
export interface PlexAuthData {
    /** Authentication token */
    token: {
        token: string;
        userId: string;
        username: string;
        email: string;
        thumb: string;
        expiresAt: Date | null;
        issuedAt: Date;
    };
    /** Selected server machine ID */
    selectedServerId: string | null;
    /** Active connection URI */
    selectedServerUri: string | null;
}

/**
 * Persistent state saved to localStorage.
 * Includes version for migrations.
 */
export interface PersistentState {
    /** Schema version for migrations */
    version: number;
    /** Plex authentication data */
    plexAuth: PlexAuthData | null;
    /** Channel configurations */
    channelConfigs: ChannelConfig[];
    /** Current channel index */
    currentChannelIndex: number;
    /** User preferences */
    userPreferences: UserPreferences;
    /** Last update timestamp */
    lastUpdated: number;
}

/**
 * Lifecycle-specific error with additional context.
 */
export interface LifecycleAppError extends AppError {
    /** Phase when error occurred */
    phase: AppPhase;
    /** Timestamp of error */
    timestamp: number;
}

/**
 * Event map for lifecycle events.
 * Used with EventEmitter for type-safe event handling.
 */
export interface LifecycleEventMap {
    /** Index signature for EventEmitter compatibility */
    [key: string]: unknown;
    /** Emitted when app phase changes */
    phaseChange: { from: AppPhase; to: AppPhase };
    /** Emitted when visibility changes (background/foreground) */
    visibilityChange: { isVisible: boolean };
    /** Emitted when network connectivity changes */
    networkChange: { isAvailable: boolean };
    /** Emitted when Plex server connection status changes */
    plexConnectionChange: { status: ConnectionStatus };
    /** Emitted when an error is reported */
    error: LifecycleAppError;
    /** Emitted when state is restored from localStorage */
    stateRestored: PersistentState;
    /** Emitted before app terminates */
    beforeTerminate: void;
    /** Emitted when memory warning threshold is reached */
    memoryWarning: { level: 'warning' | 'critical'; used: number };
    /** Emitted to trigger cache clearing */
    clearCaches: void;
}

/**
 * Runtime state of the lifecycle manager.
 */
export interface AppLifecycleState {
    /** Current phase */
    phase: AppPhase;
    /** Whether app is visible (foreground) */
    isVisible: boolean;
    /** Whether network is available */
    isNetworkAvailable: boolean;
    /** Last active timestamp */
    lastActiveTime: number;
    /** Plex server connection status */
    plexConnectionStatus: ConnectionStatus;
    /** Current error, if any */
    currentError: AppError | null;
}

/**
 * Memory usage information.
 */
export interface MemoryUsage {
    /** Used heap size in bytes */
    used: number;
    /** Total heap limit in bytes */
    limit: number;
    /** Usage percentage (0-100) */
    percentage: number;
}

/**
 * Recovery action presented to user.
 */
export interface ErrorAction {
    /** Button label */
    label: string;
    /** Action to execute */
    action: () => void | Promise<void>;
    /** Whether this is the primary/default action */
    isPrimary: boolean;
    /** Whether action requires network connectivity */
    requiresNetwork: boolean;
}

/**
 * Callback type for lifecycle events.
 */
export type LifecycleCallback = () => void | Promise<void>;
