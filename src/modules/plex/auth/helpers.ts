/**
 * @fileoverview Helper functions for Plex Authentication module.
 * Pure functions for HTTP requests, parsing, and client ID management.
 * @module modules/plex/auth/helpers
 * @version 1.0.0
 */

import { PLEX_AUTH_CONSTANTS } from './constants';
import { PlexAuthConfig, PlexAuthToken, PlexPinRequest } from './interfaces';

// ============================================
// AppErrorCode (from shared types)
// ============================================

/**
 * App error codes for consistent error handling.
 */
export enum AppErrorCode {
    SERVER_UNREACHABLE = 'SERVER_UNREACHABLE',
    RATE_LIMITED = 'RATE_LIMITED',
    RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
    AUTH_INVALID = 'AUTH_INVALID',
    AUTH_REQUIRED = 'AUTH_REQUIRED',
}

/**
 * Error class for Plex API errors.
 */
export class PlexApiError extends Error {
    public readonly code: AppErrorCode;
    public readonly httpStatus: number | undefined;
    public readonly retryable: boolean;

    constructor(
        code: AppErrorCode,
        message: string,
        httpStatus?: number,
        retryable: boolean = false
    ) {
        super(message);
        this.name = 'PlexApiError';
        this.code = code;
        this.httpStatus = httpStatus;
        this.retryable = retryable;
    }
}

// ============================================
// Client ID Management
// ============================================

/**
 * Generate a UUID v4.
 * @returns UUID string
 */
function generateUUID(): string {
    // Simple UUID v4 implementation for ES2017
    const hex = '0123456789abcdef';
    let uuid = '';
    for (let i = 0; i < 36; i++) {
        if (i === 8 || i === 13 || i === 18 || i === 23) {
            uuid += '-';
        } else if (i === 14) {
            uuid += '4';
        } else if (i === 19) {
            uuid += hex[(Math.random() * 4) | 8];
        } else {
            uuid += hex[(Math.random() * 16) | 0];
        }
    }
    return uuid;
}

/**
 * Get or generate persistent client identifier.
 * @returns Client identifier string
 */
export function getOrCreateClientId(): string {
    const stored = localStorage.getItem(PLEX_AUTH_CONSTANTS.CLIENT_ID_KEY);
    if (stored) {
        return stored;
    }
    const newId = generateUUID();
    localStorage.setItem(PLEX_AUTH_CONSTANTS.CLIENT_ID_KEY, newId);
    return newId;
}

// ============================================
// Header Building
// ============================================

/**
 * Build request headers for Plex API calls.
 * @param config - Plex auth configuration
 * @param token - Optional auth token
 * @returns Headers object
 */
export function buildRequestHeaders(
    config: PlexAuthConfig,
    token?: string
): Record<string, string> {
    const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Plex-Client-Identifier': config.clientIdentifier,
        'X-Plex-Product': config.product,
        'X-Plex-Version': config.version,
        'X-Plex-Platform': config.platform,
        'X-Plex-Device': config.device,
    };
    if (token) {
        headers['X-Plex-Token'] = token;
    }
    return headers;
}

// ============================================
// Response Parsing
// ============================================

/**
 * Parse PIN response from Plex API.
 * @param data - Raw API response
 * @param fallbackClientId - Client ID for fallback
 * @returns Parsed PIN request
 */
export function parsePinResponse(
    data: Record<string, unknown>,
    fallbackClientId: string
): PlexPinRequest {
    const expiresAtValue = data['expiresAt'];
    const expiresAt = typeof expiresAtValue === 'string'
        ? new Date(expiresAtValue)
        : new Date();

    const authTokenValue = data['authToken'];
    const authToken = typeof authTokenValue === 'string' ? authTokenValue : null;

    const clientIdValue = data['clientIdentifier'];
    const clientIdentifier = typeof clientIdValue === 'string'
        ? clientIdValue
        : fallbackClientId;

    return {
        id: Number(data['id']),
        code: String(data['code']),
        expiresAt: expiresAt,
        authToken: authToken,
        clientIdentifier: clientIdentifier,
    };
}

/**
 * Parse user response from Plex API.
 * @param data - Raw API response
 * @param token - Auth token
 * @returns Parsed auth token
 */
export function parseUserResponse(
    data: Record<string, unknown>,
    token: string
): PlexAuthToken {
    const thumbValue = data['thumb'];
    const thumb = typeof thumbValue === 'string' ? thumbValue : '';

    return {
        token: token,
        userId: String(data['id']),
        username: String(data['username']),
        email: String(data['email']),
        thumb: thumb,
        expiresAt: null,
        issuedAt: new Date(),
    };
}

// ============================================
// HTTP Helpers
// ============================================

/**
 * Sleep helper for delays.
 * @param ms - Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(function (resolve) {
        setTimeout(resolve, ms);
    });
}

/**
 * Handle HTTP response status and throw appropriate errors.
 * @param response - Fetch response
 * @throws PlexApiError for error statuses
 */
export function handleResponseStatus(response: Response): void {
    if (response.status === 429) {
        throw new PlexApiError(
            AppErrorCode.RATE_LIMITED,
            'Rate limited by Plex API',
            429,
            true
        );
    }
    if (response.status === 404) {
        throw new PlexApiError(
            AppErrorCode.RESOURCE_NOT_FOUND,
            'Resource not found',
            404,
            false
        );
    }
    if (response.status >= 500) {
        throw new PlexApiError(
            AppErrorCode.SERVER_UNREACHABLE,
            'Server error: ' + String(response.status),
            response.status,
            true
        );
    }
}

/**
 * Create a network error.
 * @returns PlexApiError for network failures
 */
export function createNetworkError(): PlexApiError {
    return new PlexApiError(
        AppErrorCode.SERVER_UNREACHABLE,
        'Network error',
        undefined,
        true
    );
}

/**
 * Fetch with retry logic and exponential backoff.
 * @param url - URL to fetch
 * @param options - Fetch options
 * @returns Response object
 * @throws PlexApiError on exhausted retries
 */
export async function fetchWithRetry(
    url: string,
    options: RequestInit
): Promise<Response> {
    let lastError: Error = new Error('Unknown error');
    let delay = PLEX_AUTH_CONSTANTS.RETRY_DELAY_MS;

    for (let attempt = 0; attempt < PLEX_AUTH_CONSTANTS.RETRY_ATTEMPTS; attempt++) {
        try {
            const response = await fetch(url, options);
            handleResponseStatus(response);
            return response;
        } catch (error) {
            if (error instanceof PlexApiError && !error.retryable) {
                throw error;
            }
            lastError = error instanceof PlexApiError ? error : createNetworkError();

            if (attempt < PLEX_AUTH_CONSTANTS.RETRY_ATTEMPTS - 1) {
                await sleep(delay);
                delay = delay * 2;
            }
        }
    }
    throw lastError;
}
