/**
 * @fileoverview Public exports for Plex Server Discovery module.
 * @module modules/plex/discovery
 * @version 1.0.0
 */

export { PlexServerDiscovery, AppErrorCode, PlexApiError } from './PlexServerDiscovery';
export type {
    IPlexServerDiscovery,
    PlexServerDiscoveryConfig,
} from './interfaces';
export type {
    PlexServer,
    PlexConnection,
    PlexServerDiscoveryEvents,
    MixedContentConfig,
} from './types';
export { PLEX_DISCOVERY_CONSTANTS, CONNECTION_PRIORITY, DEFAULT_MIXED_CONTENT_CONFIG } from './constants';
