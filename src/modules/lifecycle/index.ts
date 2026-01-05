/**
 * @fileoverview Public exports for the Application Lifecycle module.
 * @module modules/lifecycle
 * @version 1.0.0
 */

// Classes
export { AppLifecycle } from './AppLifecycle';
export { ErrorRecovery } from './ErrorRecovery';
export { StateManager } from './StateManager';

// Interfaces
export type { IAppLifecycle, IErrorRecovery, IStateManager } from './interfaces';

// Types
export type {
    AppPhase,
    ConnectionStatus,
    PersistentState,
    UserPreferences,
    ChannelConfig,
    PlexAuthData,
    LifecycleEventMap,
    LifecycleAppError,
    AppLifecycleState,
    MemoryUsage,
    ErrorAction,
    LifecycleCallback,
    AppError,
} from './types';

export { AppErrorCode } from './types';

// Constants
export {
    STORAGE_CONFIG,
    MEMORY_THRESHOLDS,
    TIMING_CONFIG,
    ERROR_MESSAGES,
    VALID_PHASE_TRANSITIONS,
} from './constants';
