/**
 * @fileoverview Plex Authentication implementation.
 * Handles PIN-based OAuth flow, token storage, and credential management.
 * @module modules/plex/auth/PlexAuth
 * @version 1.1.0
 */

import { EventEmitter } from '../../../utils/EventEmitter';
import { IDisposable } from '../../../utils/interfaces';
import { PLEX_AUTH_CONSTANTS } from './constants';
import {
    IPlexAuth,
    PlexAuthConfig,
    PlexAuthEvents,
    PlexAuthToken,
    PlexAuthData,
    PlexPinRequest,
    PlexAuthState,
    StoredAuthData,
} from './interfaces';
import {
    AppErrorCode,
    PlexApiError,
    getOrCreateClientId,
    buildRequestHeaders,
    parsePinResponse,
    parseUserResponse,
    fetchWithRetry,
} from './helpers';

// Re-export for consumers
export { AppErrorCode, PlexApiError } from './helpers';

/**
 * Plex Authentication implementation.
 * Handles PIN-based OAuth flow, token storage, and credential lifecycle.
 * @implements {IPlexAuth}
 */
export class PlexAuth implements IPlexAuth {
    private _state: PlexAuthState;
    private _emitter: EventEmitter<PlexAuthEvents>;

    /**
     * Create a new PlexAuth instance.
     * @param config - Plex API client identification config
     */
    constructor(config: PlexAuthConfig) {
        // Ensure client ID is persisted
        const clientId = getOrCreateClientId();
        const configWithClientId: PlexAuthConfig = {
            ...config,
            clientIdentifier: config.clientIdentifier || clientId,
        };

        this._emitter = new EventEmitter<PlexAuthEvents>();
        this._state = {
            config: configWithClientId,
            currentToken: null,
            isValidated: false,
            pendingPin: null,
        };
        this._loadStoredCredentials();
    }

    // ========================================
    // PIN-based OAuth flow
    // ========================================

    /**
     * Initiate Plex OAuth flow by requesting a PIN code.
     * @returns PIN request containing code for user display (length varies)
     * @throws {PlexApiError} On connection failure or rate limiting
     */
    public async requestPin(): Promise<PlexPinRequest> {
        const url = PLEX_AUTH_CONSTANTS.PLEX_TV_BASE_URL +
            PLEX_AUTH_CONSTANTS.PIN_ENDPOINT + '?strong=true';
        const headers = buildRequestHeaders(this._state.config);

        const response = await fetchWithRetry(url, {
            method: 'POST',
            headers: headers,
        });

        const data = await response.json();
        const pin = parsePinResponse(data, this._state.config.clientIdentifier);
        this._state.pendingPin = pin;
        return pin;
    }

    /**
     * Check if user has claimed the PIN via the Plex auth app.
     * @param pinId - PIN ID from requestPin()
     * @returns Updated PIN request with authToken if claimed
     * @throws {PlexApiError} If PIN doesn't exist or on connection failure
     */
    public async checkPinStatus(pinId: number): Promise<PlexPinRequest> {
        const url = PLEX_AUTH_CONSTANTS.PLEX_TV_BASE_URL +
            PLEX_AUTH_CONSTANTS.PIN_ENDPOINT + '/' + String(pinId);
        const headers = buildRequestHeaders(this._state.config);

        const response = await fetchWithRetry(url, {
            method: 'GET',
            headers: headers,
        });

        const data = await response.json();
        const pin = parsePinResponse(data, this._state.config.clientIdentifier);

        if (pin.authToken !== null) {
            const userToken = await this._fetchUserProfile(pin.authToken);
            await this.storeCredentials({
                token: userToken,
                selectedServerId: null,
                selectedServerUri: null,
            });
        }
        return pin;
    }

    /**
     * Poll for PIN status until claimed or timeout.
     * @param pinId - PIN ID from requestPin()
     * @returns Updated PIN request with authToken when claimed
     * @throws {PlexApiError} If PIN expires or on connection failure
     */
    public async pollForPin(pinId: number): Promise<PlexPinRequest> {
        const startTime = Date.now();
        const timeout = PLEX_AUTH_CONSTANTS.PIN_TIMEOUT_MS;
        const interval = PLEX_AUTH_CONSTANTS.PIN_POLL_INTERVAL_MS;

        while (Date.now() - startTime < timeout) {
            try {
                const pin = await this.checkPinStatus(pinId);
                if (pin.authToken !== null) {
                    return pin;
                }
            } catch (error) {
                if (error instanceof PlexApiError && !error.retryable) {
                    throw error;
                }
                // Log unexpected non-PlexApiError errors for debugging
                if (!(error instanceof PlexApiError)) {
                    console.warn('[PlexAuth] Unexpected error during PIN polling:', error);
                }
                // On network error, continue polling
            }
            await this._sleep(interval);
        }

        throw new PlexApiError(
            AppErrorCode.AUTH_REQUIRED,
            'PIN polling timeout exceeded',
            undefined,
            false
        );
    }

    /**
     * Cancel an active PIN request.
     * @param pinId - PIN ID to cancel
     */
    public async cancelPin(pinId: number): Promise<void> {
        const url = PLEX_AUTH_CONSTANTS.PLEX_TV_BASE_URL +
            PLEX_AUTH_CONSTANTS.PIN_ENDPOINT + '/' + String(pinId);
        const headers = buildRequestHeaders(this._state.config);

        try {
            await fetchWithRetry(url, { method: 'DELETE', headers: headers });
        } catch {
            // Ignore errors on cancel
        }

        if (this._state.pendingPin && this._state.pendingPin.id === pinId) {
            this._state.pendingPin = null;
        }
    }

    // ========================================
    // Token management
    // ========================================

    /**
     * Verify a token is still valid by calling Plex API.
     * Returns false on timeout (per spec performance budget).
     * @param token - Plex auth token to validate
     * @returns true if token is valid, false otherwise
     */
    public async validateToken(token: string): Promise<boolean> {
        const url = PLEX_AUTH_CONSTANTS.PLEX_TV_BASE_URL + PLEX_AUTH_CONSTANTS.USER_ENDPOINT;
        const headers = buildRequestHeaders(this._state.config, token);

        const controller = new AbortController();
        const timeoutId = setTimeout(
            function () { controller.abort(); },
            PLEX_AUTH_CONSTANTS.TOKEN_VALIDATION_TIMEOUT_MS
        );

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: headers,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (response.status === 200) {
                const data = await response.json();
                const userToken = parseUserResponse(data, token);
                this._state.currentToken = userToken;
                this._state.isValidated = true;
                return true;
            }
            return false;
        } catch (error) {
            clearTimeout(timeoutId);
            // Return false only on timeout (AbortError); throw on network errors
            if (error instanceof Error && error.name === 'AbortError') {
                return false;
            }
            throw new PlexApiError(
                AppErrorCode.SERVER_UNREACHABLE,
                'Network error during token validation',
                undefined,
                true
            );
        }
    }

    /**
     * Get stored credentials from localStorage.
     * @returns Stored auth data or null if none
     */
    public async getStoredCredentials(): Promise<PlexAuthData | null> {
        try {
            const stored = localStorage.getItem(PLEX_AUTH_CONSTANTS.STORAGE_KEY);
            if (!stored) return null;

            const parsed: StoredAuthData = JSON.parse(stored);
            return this._parseStoredAuthData(parsed);
        } catch {
            return null;
        }
    }

    /**
     * Store credentials to localStorage.
     * @param auth - Auth data to store
     */
    public async storeCredentials(auth: PlexAuthData): Promise<void> {
        const stored: StoredAuthData = {
            version: PLEX_AUTH_CONSTANTS.STORAGE_VERSION,
            data: auth,
        };
        localStorage.setItem(PLEX_AUTH_CONSTANTS.STORAGE_KEY, JSON.stringify(stored));
        this._state.currentToken = auth.token;
        this._state.isValidated = true;
        this._emitter.emit('authChange', true);
    }

    /**
     * Clear credentials from localStorage.
     */
    public async clearCredentials(): Promise<void> {
        localStorage.removeItem(PLEX_AUTH_CONSTANTS.STORAGE_KEY);
        this._state.currentToken = null;
        this._state.isValidated = false;
        this._state.pendingPin = null;
        this._emitter.emit('authChange', false);
    }

    // ========================================
    // Convenience methods
    // ========================================

    /** Check if currently authenticated. */
    public isAuthenticated(): boolean {
        return this._state.currentToken !== null;
    }

    /** Get current user token. */
    public getCurrentUser(): PlexAuthToken | null {
        return this._state.currentToken;
    }

    /**
     * Generate headers required for all Plex API requests.
     * @returns Object containing all required Plex headers
     */
    public getAuthHeaders(): Record<string, string> {
        const token = this._state.currentToken
            ? this._state.currentToken.token
            : undefined;
        return buildRequestHeaders(this._state.config, token, {
            platformVersion: this._state.config.platformVersion,
            deviceName: this._state.config.deviceName,
        });
    }

    // ========================================
    // Event handling
    // ========================================

    /**
     * Register handler for auth change events.
     * @param event - Event name ('authChange')
     * @param handler - Handler function
     * @returns Disposable to remove handler
     */
    public on(
        event: 'authChange',
        handler: (isAuthenticated: boolean) => void
    ): IDisposable {
        return this._emitter.on(event, handler);
    }

    // ========================================
    // Private helpers
    // ========================================

    private async _fetchUserProfile(token: string): Promise<PlexAuthToken> {
        const url = PLEX_AUTH_CONSTANTS.PLEX_TV_BASE_URL + PLEX_AUTH_CONSTANTS.USER_ENDPOINT;
        const headers = buildRequestHeaders(this._state.config, token);
        const response = await fetchWithRetry(url, { method: 'GET', headers: headers });
        const data = await response.json();
        return parseUserResponse(data, token);
    }

    private _loadStoredCredentials(): void {
        try {
            const stored = localStorage.getItem(PLEX_AUTH_CONSTANTS.STORAGE_KEY);
            if (!stored) return;

            const parsed: StoredAuthData = JSON.parse(stored);
            const data = this._parseStoredAuthData(parsed);
            if (!data) return;

            this._state.currentToken = data.token;
            this._state.isValidated = false;
        } catch {
            // Ignore parse errors
        }
    }

    /**
     * Parse stored auth data, converting date strings back to Date objects.
     * @param parsed - The parsed JSON from storage
     * @returns PlexAuthData with proper Date objects, or null if invalid
     */
    private _parseStoredAuthData(parsed: StoredAuthData): PlexAuthData | null {
        if (parsed.version !== PLEX_AUTH_CONSTANTS.STORAGE_VERSION) {
            return null;
        }

        const data = parsed.data;

        // Validate and convert issuedAt
        const issuedAt = new Date(data.token.issuedAt);
        if (isNaN(issuedAt.getTime())) {
            return null;
        }
        data.token.issuedAt = issuedAt;

        // Validate and convert expiresAt if present
        if (data.token.expiresAt !== null) {
            const expiresAt = new Date(data.token.expiresAt);
            if (isNaN(expiresAt.getTime())) {
                return null;
            }
            data.token.expiresAt = expiresAt;
        }

        return data;
    }

    private _sleep(ms: number): Promise<void> {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }
}
