/**
 * @fileoverview Type definitions for error recovery module.
 * @module core/error-recovery/types
 * @version 1.0.0
 */

import type { AppErrorCode, AppError, AppPhase, LifecycleAppError } from '../../modules/lifecycle';

/** User-facing action button for error recovery overlay. */
export interface ErrorRecoveryAction {
    label: string;
    action: () => void;
    isPrimary: boolean;
    requiresNetwork: boolean;
}

export interface RecoveryActionDeps {
    goToAuth: () => void; // must internally no-op if navigation missing
    goToServerSelect: () => void; // must internally no-op if navigation missing
    goToChannelEdit: () => void; // must internally no-op if navigation missing
    goToSettings: () => void; // must internally no-op if navigation missing
    retryStart: () => void; // MUST call start().catch(console.error) exactly
    exitApp: () => void; // MUST call shutdown().catch(console.error) exactly
    skipToNext: () => void; // must internally no-op if scheduler missing
}

export interface LifecycleErrorAdapterDeps {
    getPhase: () => AppPhase; // if lifecycle missing, Orchestrator must pass () => 'error'
    getUserMessage: (code: AppErrorCode) => string; // if lifecycle missing, Orchestrator must pass fallback
    getRecoveryActions: (code: AppErrorCode) => ErrorRecoveryAction[];
    nowMs: () => number; // MUST be Date.now in production
}

export type { AppErrorCode, AppError, LifecycleAppError, AppPhase };
