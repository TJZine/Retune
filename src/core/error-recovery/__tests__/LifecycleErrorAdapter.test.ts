import { toLifecycleAppError } from '../LifecycleErrorAdapter';
import { AppErrorCode } from '../../../modules/lifecycle';
import type { AppError, LifecycleAppError } from '../../../modules/lifecycle';
import type { ErrorRecoveryAction } from '../types';

describe('toLifecycleAppError', () => {
    it('adapts with phase, timestamp, userMessage, and actions', () => {
        const error: AppError = {
            code: AppErrorCode.NETWORK_TIMEOUT,
            message: 'Test message',
            recoverable: true,
        };
        const sentinelActions: ErrorRecoveryAction[] = [
            {
                label: 'Retry',
                action: (): void => undefined,
                isPrimary: true,
                requiresNetwork: true,
            },
        ];
        const adapted = toLifecycleAppError(error, {
            getPhase: () => 'ready',
            getUserMessage: () => 'UM',
            getRecoveryActions: () => sentinelActions,
            nowMs: () => 123,
        });

        const expected: LifecycleAppError = {
            ...error,
            phase: 'ready',
            timestamp: 123,
            userMessage: 'UM',
            actions: sentinelActions,
        };

        expect(adapted).toEqual(expected);
        expect(adapted.actions).toBe(sentinelActions);
    });
});
