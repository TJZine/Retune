/**
 * @fileoverview Constants for Plex Server Discovery module.
 * @module modules/plex/discovery/constants
 * @version 1.0.0
 */

/**
 * Plex server discovery constants.
 * All timing values in milliseconds unless noted.
 */
export const PLEX_DISCOVERY_CONSTANTS = {
    /** Base URL for plex.tv API */
    PLEX_TV_BASE_URL: 'https://plex.tv/api/v2',

    /** Resources endpoint path */
    RESOURCES_ENDPOINT: '/resources',

    /** Query parameters for resources endpoint */
    RESOURCES_PARAMS: 'includeHttps=1&includeRelay=1',

    /** Identity endpoint for connection testing */
    IDENTITY_ENDPOINT: '/identity',

    /** localStorage key for selected server ID */
    SELECTED_SERVER_KEY: 'retune_selected_server',

    /** Connection test timeout (10 seconds) */
    CONNECTION_TEST_TIMEOUT_MS: 10000,

    /** Discovery request timeout (10 seconds) */
    DISCOVERY_TIMEOUT_MS: 10000,

    /** Maximum concurrent connection tests */
    MAX_CONCURRENT_TESTS: 3,

    /** Cache duration for server list (5 minutes) */
    SERVER_CACHE_DURATION_MS: 300000,
} as const;

/**
 * Connection priority weights (lower is better).
 * Used to sort connections for testing order.
 */
export const CONNECTION_PRIORITY = {
    /** Local HTTPS (plex.direct) - highest priority */
    LOCAL_HTTPS: 1,
    /** Remote HTTPS - second priority */
    REMOTE_HTTPS: 2,
    /** Relay - third priority (bandwidth limited) */
    RELAY: 3,
    /** Local HTTP - lowest priority (may be mixed content blocked) */
    LOCAL_HTTP: 4,
} as const;

/**
 * Default mixed content configuration per spec.
 * WebOS apps over HTTPS may block HTTP requests.
 */
export const DEFAULT_MIXED_CONTENT_CONFIG = {
    /** Prefer HTTPS connections when available */
    preferHttps: true,
    /** Attempt HTTP upgrade to HTTPS for local connections */
    tryHttpsUpgrade: true,
    /** Allow HTTP for local connections only (LAN connections can lack certs) */
    allowLocalHttp: true,
    /** Log mixed content warnings */
    logWarnings: true,
} as const;
