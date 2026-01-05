/**
 * @fileoverview Public exports for Plex Authentication module.
 * @module modules/plex/auth
 * @version 1.1.0
 */

export { PlexAuth, AppErrorCode, PlexApiError } from './PlexAuth';
export type {
    IPlexAuth,
    PlexAuthMode,
    PlexAuthConfig,
    PlexPublicJwk,
    PlexDeviceKey,
    PlexPinRequest,
    PlexAuthToken,
    PlexAuthData,
    PlexAuthEvents,
} from './interfaces';
export { PLEX_AUTH_CONSTANTS, AUTH_ERROR_MESSAGES } from './constants';
export {
    getOrCreateClientId,
    buildRequestHeaders,
    fetchWithRetry,
} from './helpers';
