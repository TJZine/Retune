/**
 * @fileoverview Error Recovery for mapping errors to user actions.
 * @module modules/lifecycle/ErrorRecovery
 * @version 1.0.0
 */

import { IErrorRecovery } from './interfaces';
import { AppError, AppErrorCode, ErrorAction } from './types';
import { ERROR_MESSAGES } from './constants';

/**
 * Maps application errors to recovery actions.
 * Provides user-facing action buttons for error dialogs.
 */
export class ErrorRecovery implements IErrorRecovery {
    /** Callbacks for recovery actions */
    private _onSignIn: (() => void) | null = null;
    private _onRetry: (() => void) | null = null;
    private _onExit: (() => void) | null = null;
    private _onRestart: (() => void) | null = null;
    private _onSkip: (() => void) | null = null;
    private _onDifferentServer: (() => void) | null = null;

    /**
     * Register action callbacks for recovery options.
     * @param callbacks - Object containing action callbacks
     */
    public registerCallbacks(callbacks: {
        onSignIn?: () => void;
        onRetry?: () => void;
        onExit?: () => void;
        onRestart?: () => void;
        onSkip?: () => void;
        onDifferentServer?: () => void;
    }): void {
        if (callbacks.onSignIn) this._onSignIn = callbacks.onSignIn;
        if (callbacks.onRetry) this._onRetry = callbacks.onRetry;
        if (callbacks.onExit) this._onExit = callbacks.onExit;
        if (callbacks.onRestart) this._onRestart = callbacks.onRestart;
        if (callbacks.onSkip) this._onSkip = callbacks.onSkip;
        if (callbacks.onDifferentServer) this._onDifferentServer = callbacks.onDifferentServer;
    }

    /**
     * Get recovery actions for an error.
     * @param error - Error to handle
     * @returns Array of possible recovery actions
     */
    public handleError(error: AppError): ErrorAction[] {
        switch (error.code) {
            case AppErrorCode.AUTH_EXPIRED:
            case AppErrorCode.AUTH_REQUIRED:
            case AppErrorCode.AUTH_INVALID:
            case AppErrorCode.AUTH_FAILED:
                return this._createAuthActions();

            case AppErrorCode.NETWORK_UNAVAILABLE:
            case AppErrorCode.NETWORK_OFFLINE:
            case AppErrorCode.NETWORK_TIMEOUT:
                return this._createNetworkActions();

            case AppErrorCode.PLEX_UNREACHABLE:
            case AppErrorCode.SERVER_UNREACHABLE:
                return this._createServerActions();

            case AppErrorCode.DATA_CORRUPTION:
            case AppErrorCode.STORAGE_CORRUPTED:
                return this._createDataCorruptionActions();

            case AppErrorCode.PLAYBACK_FAILED:
            case AppErrorCode.PLAYBACK_DECODE_ERROR:
            case AppErrorCode.PLAYBACK_FORMAT_UNSUPPORTED:
                return this._createPlaybackActions();

            case AppErrorCode.OUT_OF_MEMORY:
                return this._createMemoryActions();

            default:
                return this._createDefaultActions(error.recoverable);
        }
    }

    /**
     * Execute a recovery action.
     * @param action - Action to execute
     * @returns true if recovery succeeded, false otherwise
     */
    public async executeRecovery(action: ErrorAction): Promise<boolean> {
        try {
            await action.action();
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Create an AppError with the given parameters.
     * @param code - Error code
     * @param message - Error message
     * @param context - Optional context
     * @returns Constructed AppError
     */
    public createError(
        code: AppErrorCode,
        message: string,
        context?: Record<string, unknown>
    ): AppError {
        const recoverable = this._isRecoverable(code);
        const error: AppError = {
            code,
            message,
            recoverable,
        };

        if (context !== undefined) {
            error.context = context;
        }

        return error;
    }

    /**
     * Get user-facing message for an error code.
     * @param code - Error code
     * @returns User-friendly message
     */
    public getUserMessage(code: AppErrorCode): string {
        switch (code) {
            case AppErrorCode.AUTH_EXPIRED:
            case AppErrorCode.AUTH_REQUIRED:
                return ERROR_MESSAGES.AUTH_EXPIRED;
            case AppErrorCode.NETWORK_UNAVAILABLE:
            case AppErrorCode.NETWORK_OFFLINE:
                return ERROR_MESSAGES.NETWORK_UNAVAILABLE;
            case AppErrorCode.PLEX_UNREACHABLE:
            case AppErrorCode.SERVER_UNREACHABLE:
                return ERROR_MESSAGES.PLEX_UNREACHABLE;
            case AppErrorCode.DATA_CORRUPTION:
            case AppErrorCode.STORAGE_CORRUPTED:
                return ERROR_MESSAGES.DATA_CORRUPTION;
            case AppErrorCode.PLAYBACK_FAILED:
                return ERROR_MESSAGES.PLAYBACK_FAILED;
            case AppErrorCode.OUT_OF_MEMORY:
                return ERROR_MESSAGES.OUT_OF_MEMORY;
            default:
                return 'An error occurred. Please try again.';
        }
    }

    // ========== Private Action Creators ==========

    private _createAuthActions(): ErrorAction[] {
        return [
            {
                label: 'Sign In',
                action: (): void => {
                    if (this._onSignIn) {
                        this._onSignIn();
                    } else {
                        console.warn('[ErrorRecovery] onSignIn callback not registered');
                    }
                },
                isPrimary: true,
                requiresNetwork: true,
            },
            {
                label: 'Exit',
                action: (): void => {
                    if (this._onExit) this._onExit();
                },
                isPrimary: false,
                requiresNetwork: false,
            },
        ];
    }

    private _createNetworkActions(): ErrorAction[] {
        return [
            {
                label: 'Retry',
                action: (): void => {
                    if (this._onRetry) {
                        this._onRetry();
                    } else {
                        console.warn('[ErrorRecovery] onRetry callback not registered');
                    }
                },
                isPrimary: true,
                requiresNetwork: true,
            },
            {
                label: 'Exit',
                action: (): void => {
                    if (this._onExit) this._onExit();
                },
                isPrimary: false,
                requiresNetwork: false,
            },
        ];
    }

    private _createServerActions(): ErrorAction[] {
        return [
            {
                label: 'Retry',
                action: (): void => {
                    if (this._onRetry) this._onRetry();
                },
                isPrimary: true,
                requiresNetwork: true,
            },
            {
                label: 'Different Server',
                action: (): void => {
                    if (this._onDifferentServer) this._onDifferentServer();
                },
                isPrimary: false,
                requiresNetwork: true,
            },
            {
                label: 'Exit',
                action: (): void => {
                    if (this._onExit) this._onExit();
                },
                isPrimary: false,
                requiresNetwork: false,
            },
        ];
    }

    private _createDataCorruptionActions(): ErrorAction[] {
        return [
            {
                label: 'OK',
                action: (): void => {
                    // Acknowledge and continue
                },
                isPrimary: true,
                requiresNetwork: false,
            },
        ];
    }

    private _createPlaybackActions(): ErrorAction[] {
        return [
            {
                label: 'Skip',
                action: (): void => {
                    if (this._onSkip) this._onSkip();
                },
                isPrimary: true,
                requiresNetwork: false,
            },
            {
                label: 'Retry',
                action: (): void => {
                    if (this._onRetry) this._onRetry();
                },
                isPrimary: false,
                requiresNetwork: true,
            },
            {
                label: 'Exit',
                action: (): void => {
                    if (this._onExit) this._onExit();
                },
                isPrimary: false,
                requiresNetwork: false,
            },
        ];
    }

    private _createMemoryActions(): ErrorAction[] {
        return [
            {
                label: 'Restart',
                action: (): void => {
                    if (this._onRestart) {
                        this._onRestart();
                    } else {
                        console.warn('[ErrorRecovery] onRestart callback not registered');
                    }
                },
                isPrimary: true,
                requiresNetwork: false,
            },
        ];
    }

    private _createDefaultActions(recoverable: boolean): ErrorAction[] {
        const actions: ErrorAction[] = [];

        if (recoverable) {
            actions.push({
                label: 'Retry',
                action: (): void => {
                    if (this._onRetry) this._onRetry();
                },
                isPrimary: true,
                requiresNetwork: true,
            });
        }

        actions.push({
            label: 'Exit',
            action: (): void => {
                if (this._onExit) this._onExit();
            },
            isPrimary: !recoverable,
            requiresNetwork: false,
        });

        return actions;
    }

    /**
     * Determine if an error code is typically recoverable.
     */
    private _isRecoverable(code: AppErrorCode): boolean {
        switch (code) {
            case AppErrorCode.UNRECOVERABLE:
            case AppErrorCode.DATA_CORRUPTION:
                return false;
            default:
                return true;
        }
    }
}
