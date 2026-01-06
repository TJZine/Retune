/**
 * @fileoverview Unit tests for ErrorRecovery.
 * @module modules/lifecycle/__tests__/ErrorRecovery.test
 */

import { ErrorRecovery } from '../ErrorRecovery';
import { AppError, AppErrorCode } from '../types';

describe('ErrorRecovery', () => {
    let recovery: ErrorRecovery;

    beforeEach(() => {
        recovery = new ErrorRecovery();
    });

    describe('handleError', () => {
        it('should map AUTH_EXPIRED to Sign In and Exit actions', () => {
            const error: AppError = {
                code: AppErrorCode.AUTH_EXPIRED,
                message: 'Session expired',
                recoverable: true,
            };

            const actions = recovery.handleError(error);

            expect(actions.length).toBeGreaterThan(0);
            expect(actions.some(a => a.label === 'Sign In')).toBe(true);
            expect(actions.some(a => a.label === 'Exit')).toBe(true);
        });

        it('should map NETWORK_UNAVAILABLE to Retry and Exit actions', () => {
            const error: AppError = {
                code: AppErrorCode.NETWORK_UNAVAILABLE,
                message: 'No network',
                recoverable: true,
            };

            const actions = recovery.handleError(error);

            expect(actions.length).toBeGreaterThan(0);
            expect(actions.some(a => a.label === 'Retry')).toBe(true);
            expect(actions.some(a => a.label === 'Exit')).toBe(true);
        });

        it('should map PLEX_UNREACHABLE to Retry, Different Server, and Exit', () => {
            const error: AppError = {
                code: AppErrorCode.PLEX_UNREACHABLE,
                message: 'Server unreachable',
                recoverable: true,
            };

            const actions = recovery.handleError(error);

            expect(actions.length).toBe(3);
            expect(actions.some(a => a.label === 'Retry')).toBe(true);
            expect(actions.some(a => a.label === 'Different Server')).toBe(true);
            expect(actions.some(a => a.label === 'Exit')).toBe(true);
        });

        it('should map DATA_CORRUPTION to OK action only', () => {
            const error: AppError = {
                code: AppErrorCode.DATA_CORRUPTION,
                message: 'Data corrupted',
                recoverable: false,
            };

            const actions = recovery.handleError(error);

            expect(actions.length).toBe(1);
            expect(actions[0]?.label).toBe('OK');
        });

        it('should map PLAYBACK_FAILED to Skip, Retry, Exit', () => {
            const error: AppError = {
                code: AppErrorCode.PLAYBACK_FAILED,
                message: 'Playback failed',
                recoverable: true,
            };

            const actions = recovery.handleError(error);

            expect(actions.some(a => a.label === 'Skip')).toBe(true);
            expect(actions.some(a => a.label === 'Retry')).toBe(true);
            expect(actions.some(a => a.label === 'Exit')).toBe(true);
        });

        it('should map OUT_OF_MEMORY to Restart action', () => {
            const error: AppError = {
                code: AppErrorCode.OUT_OF_MEMORY,
                message: 'Out of memory',
                recoverable: true,
            };

            const actions = recovery.handleError(error);

            expect(actions.length).toBe(1);
            expect(actions[0]?.label).toBe('Restart');
        });

        it('should provide default actions for unknown errors', () => {
            const error: AppError = {
                code: AppErrorCode.UNKNOWN,
                message: 'Unknown error',
                recoverable: true,
            };

            const actions = recovery.handleError(error);

            expect(actions.length).toBeGreaterThan(0);
            expect(actions[0]).toHaveProperty('label');
            expect(actions[0]).toHaveProperty('action');
            expect(actions[0]).toHaveProperty('isPrimary');
        });

        it('should have isPrimary set on exactly one action', () => {
            const error: AppError = {
                code: AppErrorCode.NETWORK_TIMEOUT,
                message: 'Timeout',
                recoverable: true,
            };

            const actions = recovery.handleError(error);
            const primaryCount = actions.filter(a => a.isPrimary).length;

            expect(primaryCount).toBe(1);
        });
    });

    describe('executeRecovery', () => {
        it('should execute recovery action and return true on success', async () => {
            const action = {
                label: 'Retry',
                action: jest.fn().mockResolvedValue(undefined),
                isPrimary: true,
                requiresNetwork: true,
            };

            const result = await recovery.executeRecovery(action);

            expect(action.action).toHaveBeenCalled();
            expect(result).toBe(true);
        });

        it('should return false when action throws', async () => {
            const action = {
                label: 'Retry',
                action: jest.fn().mockRejectedValue(new Error('Failed')),
                isPrimary: true,
                requiresNetwork: true,
            };

            const result = await recovery.executeRecovery(action);

            expect(action.action).toHaveBeenCalled();
            expect(result).toBe(false);
        });

        it('should handle synchronous actions', async () => {
            const action = {
                label: 'OK',
                action: jest.fn(),
                isPrimary: true,
                requiresNetwork: false,
            };

            const result = await recovery.executeRecovery(action);

            expect(action.action).toHaveBeenCalled();
            expect(result).toBe(true);
        });
    });

    describe('createError', () => {
        it('should create AppError with correct structure', () => {
            const error = recovery.createError(
                AppErrorCode.NETWORK_TIMEOUT,
                'Request timed out'
            );

            expect(error.code).toBe(AppErrorCode.NETWORK_TIMEOUT);
            expect(error.message).toBe('Request timed out');
            expect(typeof error.recoverable).toBe('boolean');
        });

        it('should include context when provided', () => {
            const error = recovery.createError(
                AppErrorCode.NETWORK_TIMEOUT,
                'Request timed out',
                { url: 'https://example.com', timeout: 5000 }
            );

            expect(error.context).toBeDefined();
            expect(error.context?.url).toBe('https://example.com');
            expect(error.context?.timeout).toBe(5000);
        });

        it('should set recoverable to false for unrecoverable errors', () => {
            const error = recovery.createError(
                AppErrorCode.UNRECOVERABLE,
                'Unrecoverable error'
            );

            expect(error.recoverable).toBe(false);
        });

        it('should set recoverable to false for DATA_CORRUPTION', () => {
            const error = recovery.createError(
                AppErrorCode.DATA_CORRUPTION,
                'Data corrupted'
            );

            expect(error.recoverable).toBe(false);
        });

        it('should set recoverable to true for recoverable errors', () => {
            const error = recovery.createError(
                AppErrorCode.NETWORK_TIMEOUT,
                'Timeout'
            );

            expect(error.recoverable).toBe(true);
        });
    });

    describe('getUserMessage', () => {
        it('should return user-friendly message for AUTH_EXPIRED', () => {
            const message = recovery.getUserMessage(AppErrorCode.AUTH_EXPIRED);
            expect(message).toBe('Please sign in again');
        });

        it('should return user-friendly message for NETWORK_UNAVAILABLE', () => {
            const message = recovery.getUserMessage(AppErrorCode.NETWORK_UNAVAILABLE);
            expect(message).toBe('No internet connection');
        });

        it('should return user-friendly message for NETWORK_TIMEOUT', () => {
            const message = recovery.getUserMessage(AppErrorCode.NETWORK_TIMEOUT);
            // Falls through to default message
            expect(message).toBe('An error occurred. Please try again.');
        });

        it('should return user-friendly message for AUTH_REQUIRED', () => {
            const message = recovery.getUserMessage(AppErrorCode.AUTH_REQUIRED);
            // Maps to AUTH_EXPIRED message per error handling design
            expect(message).toBe('Please sign in again');
        });

        it('should return user-friendly message for SERVER_UNREACHABLE', () => {
            const message = recovery.getUserMessage(AppErrorCode.SERVER_UNREACHABLE);
            // Explicitly maps to PLEX_UNREACHABLE message
            expect(message).toBe('Cannot connect to Plex server');
        });

        it('should return generic message for unknown error codes', () => {
            const message = recovery.getUserMessage(AppErrorCode.UNKNOWN);
            expect(message).toContain('error');
        });
    });

    describe('registerCallbacks', () => {
        it('should invoke registered callbacks when actions execute', async () => {
            const onSignIn = jest.fn();
            const onExit = jest.fn();

            recovery.registerCallbacks({ onSignIn, onExit });

            const actions = recovery.handleError({
                code: AppErrorCode.AUTH_EXPIRED,
                message: 'Test',
                recoverable: true,
            });

            // Execute Sign In action
            const signInAction = actions.find(a => a.label === 'Sign In');
            expect(signInAction).toBeDefined();
            await recovery.executeRecovery(signInAction!);

            expect(onSignIn).toHaveBeenCalled();

            // Execute Exit action
            const exitAction = actions.find(a => a.label === 'Exit');
            expect(exitAction).toBeDefined();
            await recovery.executeRecovery(exitAction!);

            expect(onExit).toHaveBeenCalled();
        });
    });
});
