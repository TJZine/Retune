/**
 * @fileoverview Constants for Plex Authentication module.
 * @module modules/plex/auth/constants
 * @version 1.0.0
 */

/**
 * Plex authentication constants.
 * All timing values in milliseconds unless noted.
 */
export const PLEX_AUTH_CONSTANTS = {
    /** Base URL for plex.tv API */
    PLEX_TV_BASE_URL: 'https://plex.tv/api/v2',

    /** PIN endpoint path */
    PIN_ENDPOINT: '/pins',

    /** User profile endpoint path */
    USER_ENDPOINT: '/user',

    /** localStorage key for auth data */
    STORAGE_KEY: 'retune_plex_auth',

    /** localStorage key for client identifier */
    CLIENT_ID_KEY: 'retune_client_id',

    /** PIN polling interval (1 second) */
    PIN_POLL_INTERVAL_MS: 1000,

    /** PIN timeout (5 minutes) */
    PIN_TIMEOUT_MS: 300000,

    /** Token validation timeout */
    TOKEN_VALIDATION_TIMEOUT_MS: 5000,

    /** Number of retry attempts for network requests */
    RETRY_ATTEMPTS: 3,

    /** Initial retry delay (exponential backoff base) */
    RETRY_DELAY_MS: 1000,

    /** Storage version for future migrations */
    STORAGE_VERSION: 1,
} as const;

/**
 * User-facing error messages.
 * These are displayed to users during authentication failures.
 */
export const AUTH_ERROR_MESSAGES = {
    AUTH_REQUIRED: 'Please sign in to your Plex account to continue.',
    AUTH_EXPIRED: 'Your session has expired. Please sign in again.',
    AUTH_INVALID: 'Unable to verify your Plex account. Please try signing in again.',
    AUTH_FAILED: 'Sign in failed. Please check your internet connection and try again.',
    PIN_EXPIRED: 'The PIN code has expired. Please request a new one.',
    PIN_TIMEOUT: 'PIN entry timed out. Please try again.',
} as const;
