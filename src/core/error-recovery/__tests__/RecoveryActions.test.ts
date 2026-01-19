import { AppErrorCode } from '../../../modules/lifecycle';
import { getRecoveryActions } from '../RecoveryActions';
import type { RecoveryActionDeps } from '../types';

describe('getRecoveryActions', () => {
    const createDeps = (): RecoveryActionDeps => ({
        goToAuth: jest.fn(),
        goToServerSelect: jest.fn(),
        goToChannelEdit: jest.fn(),
        goToSettings: jest.fn(),
        retryStart: jest.fn(),
        exitApp: jest.fn(),
        skipToNext: jest.fn(),
    });

    it('returns Sign In for AUTH_REQUIRED', () => {
        const deps = createDeps();
        const actions = getRecoveryActions(AppErrorCode.AUTH_REQUIRED, deps);

        expect(actions).toHaveLength(1);
        expect(actions[0]).toMatchObject({
            label: 'Sign In',
            isPrimary: true,
            requiresNetwork: true,
        });

        actions[0]!.action();
        expect(deps.goToAuth).toHaveBeenCalledTimes(1);
    });

    it('returns Retry and Exit for NETWORK_TIMEOUT', () => {
        const deps = createDeps();
        const actions = getRecoveryActions(AppErrorCode.NETWORK_TIMEOUT, deps);

        expect(actions).toHaveLength(2);
        expect(actions[0]).toMatchObject({
            label: 'Retry',
            isPrimary: true,
            requiresNetwork: true,
        });
        expect(actions[1]).toMatchObject({
            label: 'Exit',
            isPrimary: false,
            requiresNetwork: false,
        });

        actions[0]!.action();
        actions[1]!.action();
        expect(deps.retryStart).toHaveBeenCalledTimes(1);
        expect(deps.exitApp).toHaveBeenCalledTimes(1);
    });

    it('returns Select Server and Retry for SERVER_UNREACHABLE', () => {
        const deps = createDeps();
        const actions = getRecoveryActions(AppErrorCode.SERVER_UNREACHABLE, deps);

        expect(actions).toHaveLength(2);
        expect(actions[0]).toMatchObject({
            label: 'Select Server',
            isPrimary: true,
            requiresNetwork: true,
        });
        expect(actions[1]).toMatchObject({
            label: 'Retry',
            isPrimary: false,
            requiresNetwork: true,
        });

        actions[0]!.action();
        actions[1]!.action();
        expect(deps.goToServerSelect).toHaveBeenCalledTimes(1);
        expect(deps.retryStart).toHaveBeenCalledTimes(1);
    });

    it('returns Skip for PLAYBACK_DECODE_ERROR', () => {
        const deps = createDeps();
        const actions = getRecoveryActions(AppErrorCode.PLAYBACK_DECODE_ERROR, deps);

        expect(actions).toHaveLength(1);
        expect(actions[0]).toMatchObject({
            label: 'Skip',
            isPrimary: true,
            requiresNetwork: false,
        });

        actions[0]!.action();
        expect(deps.skipToNext).toHaveBeenCalledTimes(1);
    });

    it.each([
        AppErrorCode.CODEC_UNSUPPORTED,
        AppErrorCode.TRACK_NOT_FOUND,
        AppErrorCode.TRACK_SWITCH_FAILED,
        AppErrorCode.TRACK_SWITCH_TIMEOUT,
    ])('returns Skip for %s', (errorCode) => {
        const deps = createDeps();
        const actions = getRecoveryActions(errorCode, deps);

        expect(actions).toHaveLength(1);
        expect(actions[0]).toMatchObject({
            label: 'Skip',
            isPrimary: true,
            requiresNetwork: false,
        });

        actions[0]!.action();
        expect(deps.skipToNext).toHaveBeenCalledTimes(1);
    });

    it('returns Open Settings and Retry for STORAGE_CORRUPTED', () => {
        const deps = createDeps();
        const actions = getRecoveryActions(AppErrorCode.STORAGE_CORRUPTED, deps);

        expect(actions).toHaveLength(2);
        expect(actions[0]).toMatchObject({
            label: 'Open Settings',
            isPrimary: true,
            requiresNetwork: false,
        });
        expect(actions[1]).toMatchObject({
            label: 'Retry',
            isPrimary: false,
            requiresNetwork: false,
        });

        actions[0]!.action();
        actions[1]!.action();
        expect(deps.goToSettings).toHaveBeenCalledTimes(1);
        expect(deps.retryStart).toHaveBeenCalledTimes(1);
    });

    it('returns Exit for UNRECOVERABLE', () => {
        const deps = createDeps();
        const actions = getRecoveryActions(AppErrorCode.UNRECOVERABLE, deps);

        expect(actions).toHaveLength(1);
        expect(actions[0]).toMatchObject({
            label: 'Exit',
            isPrimary: true,
            requiresNetwork: false,
        });

        actions[0]!.action();
        expect(deps.exitApp).toHaveBeenCalledTimes(1);
    });

    it('returns Dismiss for unknown/default', () => {
        const deps = createDeps();
        const actions = getRecoveryActions(AppErrorCode.UNKNOWN, deps);

        expect(actions).toHaveLength(1);
        expect(actions[0]).toMatchObject({
            label: 'Dismiss',
            isPrimary: true,
            requiresNetwork: false,
        });

        actions[0]!.action();
        expect(deps.goToAuth).not.toHaveBeenCalled();
        expect(deps.goToServerSelect).not.toHaveBeenCalled();
        expect(deps.goToChannelEdit).not.toHaveBeenCalled();
        expect(deps.goToSettings).not.toHaveBeenCalled();
        expect(deps.retryStart).not.toHaveBeenCalled();
        expect(deps.exitApp).not.toHaveBeenCalled();
        expect(deps.skipToNext).not.toHaveBeenCalled();
    });
});
