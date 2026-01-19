import { AppErrorCode } from '../../modules/lifecycle';
import type { ErrorRecoveryAction, RecoveryActionDeps } from './types';

export function getRecoveryActions(
    errorCode: AppErrorCode,
    deps: RecoveryActionDeps
): ErrorRecoveryAction[] {
    const actions: ErrorRecoveryAction[] = [];

    switch (errorCode) {
        // Auth errors -> Sign In
        case AppErrorCode.AUTH_REQUIRED:
        case AppErrorCode.AUTH_EXPIRED:
        case AppErrorCode.AUTH_INVALID:
        case AppErrorCode.AUTH_FAILED:
            actions.push({
                label: 'Sign In',
                action: (): void => {
                    deps.goToAuth();
                },
                isPrimary: true,
                requiresNetwork: true,
            });
            break;

        // Network errors -> Retry + Exit
        case AppErrorCode.AUTH_RATE_LIMITED:
        case AppErrorCode.NETWORK_TIMEOUT:
        case AppErrorCode.NETWORK_OFFLINE:
        case AppErrorCode.NETWORK_UNAVAILABLE:
        case AppErrorCode.RATE_LIMITED:
            actions.push({
                label: 'Retry',
                action: (): void => {
                    deps.retryStart();
                },
                isPrimary: true,
                requiresNetwork: true,
            });
            actions.push({
                label: 'Exit',
                action: (): void => {
                    deps.exitApp();
                },
                isPrimary: false,
                requiresNetwork: false,
            });
            break;

        // Server errors -> Select Server + Retry
        case AppErrorCode.SERVER_UNREACHABLE:
        case AppErrorCode.SERVER_SSL_ERROR:
        case AppErrorCode.MIXED_CONTENT_BLOCKED:
        case AppErrorCode.SERVER_ERROR:
        case AppErrorCode.PLEX_UNREACHABLE:
            actions.push({
                label: 'Select Server',
                action: (): void => {
                    deps.goToServerSelect();
                },
                isPrimary: true,
                requiresNetwork: true,
            });
            actions.push({
                label: 'Retry',
                action: (): void => {
                    deps.retryStart();
                },
                isPrimary: false,
                requiresNetwork: true,
            });
            break;

        // Playback errors -> Skip
        case AppErrorCode.PLAYBACK_FAILED:
        case AppErrorCode.PLAYBACK_DECODE_ERROR:
        case AppErrorCode.PLAYBACK_FORMAT_UNSUPPORTED:
        case AppErrorCode.CODEC_UNSUPPORTED:
        case AppErrorCode.TRACK_NOT_FOUND:
        case AppErrorCode.TRACK_SWITCH_FAILED:
        case AppErrorCode.TRACK_SWITCH_TIMEOUT:
            actions.push({
                label: 'Skip',
                action: (): void => {
                    deps.skipToNext();
                },
                isPrimary: true,
                requiresNetwork: false,
            });
            break;

        // Channel/content errors -> Edit Channels
        case AppErrorCode.CHANNEL_NOT_FOUND:
        case AppErrorCode.SCHEDULER_EMPTY_CHANNEL:
        case AppErrorCode.CONTENT_UNAVAILABLE:
        case AppErrorCode.RESOURCE_NOT_FOUND:
            actions.push({
                label: 'Edit Channels',
                action: (): void => {
                    deps.goToChannelEdit();
                },
                isPrimary: true,
                requiresNetwork: false,
            });
            break;

        // Storage errors -> Settings (clear cache)
        case AppErrorCode.STORAGE_QUOTA_EXCEEDED:
        case AppErrorCode.STORAGE_CORRUPTED:
        case AppErrorCode.DATA_CORRUPTION:
            actions.push({
                label: 'Clear Data',
                action: (): void => {
                    deps.goToSettings();
                },
                isPrimary: true,
                requiresNetwork: false,
            });
            actions.push({
                label: 'Retry',
                action: (): void => {
                    deps.retryStart();
                },
                isPrimary: false,
                requiresNetwork: false,
            });
            break;

        // Initialization errors -> Retry + Exit
        case AppErrorCode.INITIALIZATION_FAILED:
        case AppErrorCode.MODULE_INIT_FAILED:
        case AppErrorCode.OUT_OF_MEMORY:
            actions.push({
                label: 'Retry',
                action: (): void => {
                    deps.retryStart();
                },
                isPrimary: true,
                requiresNetwork: true,
            });
            actions.push({
                label: 'Exit',
                action: (): void => {
                    deps.exitApp();
                },
                isPrimary: false,
                requiresNetwork: false,
            });
            break;

        // Unrecoverable errors -> Exit only
        case AppErrorCode.UNRECOVERABLE:
            actions.push({
                label: 'Exit',
                action: (): void => {
                    deps.exitApp();
                },
                isPrimary: true,
                requiresNetwork: false,
            });
            break;

        // Unknown/default -> Dismiss
        case AppErrorCode.UNKNOWN:
        default:
            actions.push({
                label: 'Dismiss',
                action: (): void => {
                    // No-op - just dismiss
                },
                isPrimary: true,
                requiresNetwork: false,
            });
    }

    return actions;
}
