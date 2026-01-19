import type { AppError } from '../../modules/lifecycle';
import type { LifecycleAppError } from '../../modules/lifecycle';
import type { LifecycleErrorAdapterDeps } from './types';

export function toLifecycleAppError(
    error: AppError,
    deps: LifecycleErrorAdapterDeps
): LifecycleAppError {
    return {
        ...error,
        phase: deps.getPhase(),
        timestamp: deps.nowMs(),
        userMessage: deps.getUserMessage(error.code),
        actions: deps.getRecoveryActions(error.code),
    };
}
