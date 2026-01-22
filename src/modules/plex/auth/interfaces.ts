/**
 * @fileoverview Interface definitions for Plex Authentication module.
 * @module modules/plex/auth/interfaces
 * @version 1.0.0
 */

import { IDisposable } from '../../../utils/interfaces';

// ============================================
// Configuration Types
// ============================================

/**
 * Configuration for Plex API client identification.
 * These values are sent with every Plex API request.
 */
export type PlexAuthMode = 'legacy' | 'jwt';

/**
 * Public JWK used for JWT-based Plex auth (Ed25519).
 * Only required for the JWT flow.
 */
export interface PlexPublicJwk {
    kty: 'OKP';
    crv: 'Ed25519';
    x: string;
    alg: 'EdDSA';
    use?: 'sig';
    kid?: string;
}

/**
 * Device key metadata for JWT-based auth.
 */
export interface PlexDeviceKey {
    kid: string;
    publicJwk: PlexPublicJwk;
    /** Base64url-encoded Ed25519 private key (store securely when possible) */
    privateKey: string;
    createdAt: Date;
}

export interface PlexAuthConfig {
    /** Unique app instance ID (UUID v4) - persisted across sessions */
    clientIdentifier: string;
    /** App name shown in Plex dashboard (e.g., "Retune") */
    product: string;
    /** App version string (e.g., "1.0.0") */
    version: string;
    /** Platform identifier - always "webOS" */
    platform: string;
    /** webOS version (e.g., "6.0", "23") */
    platformVersion: string;
    /** Device type (e.g., "LG Smart TV") */
    device: string;
    /** User-friendly device name (e.g., "Living Room TV") */
    deviceName: string;
    /** Auth flow selection (default: legacy PIN) */
    authMode?: PlexAuthMode;
}

// ============================================
// PIN Flow Types
// ============================================

/**
 * Represents a PIN request for OAuth flow.
 * User navigates to the Plex auth app (plex.tv/link or app.plex.tv/auth).
 */
export interface PlexPinRequest {
    /** Plex-assigned PIN ID for polling */
    id: number;
    /** PIN code for user to enter (length varies by flow) */
    code: string;
    /** PIN expiration time (typically 5 minutes) */
    expiresAt: Date;
    /** Populated when user claims the PIN - null until then */
    authToken: string | null;
    /** Client identifier used when requesting this PIN */
    clientIdentifier: string;
}

// ============================================
// Token & User Types
// ============================================

/**
 * Authenticated Plex user token and profile.
 * Stored in localStorage for session persistence.
 */
export interface PlexAuthToken {
    /** OAuth token for API requests - include in X-Plex-Token header */
    token: string;
    /** Plex user ID */
    userId: string;
    /** Plex username */
    username: string;
    /** User email address */
    email: string;
    /** Avatar URL */
    thumb: string;
    /**
     * Token expiration time (if known).
     * Plex tokens may be short-lived (e.g., JWTs); treat `null` as "unknown".
     */
    expiresAt: Date | null;
    /** When token was issued */
    issuedAt: Date;
    /** Preferred subtitle language (if provided by Plex user profile) */
    preferredSubtitleLanguage?: string | null;
}

/**
 * Complete authentication data including selected server.
 * This is the root object persisted for auth state.
 */
export interface PlexAuthData {
    /** User authentication token and profile */
    token: PlexAuthToken;
    /** Currently selected Plex server machine ID */
    selectedServerId: string | null;
    /** Active connection URI for the selected server */
    selectedServerUri: string | null;
    /** Device key metadata for JWT flow (optional) */
    deviceKey?: PlexDeviceKey | null;
}

// ============================================
// Internal State Types
// ============================================

/**
 * Internal state managed by PlexAuth class.
 */
export interface PlexAuthState {
    /** Configuration passed to constructor */
    config: PlexAuthConfig;
    /** Current authenticated token (null if not authenticated) */
    currentToken: PlexAuthToken | null;
    /** Whether token has been validated with server */
    isValidated: boolean;
    /** PIN currently being polled (null if none) */
    pendingPin: PlexPinRequest | null;
}

/**
 * Stored data format with version for migrations.
 */
export interface StoredAuthData {
    /** Storage format version */
    version: number;
    /** Auth data payload */
    data: PlexAuthData;
}

// ============================================
// Event Types
// ============================================

/**
 * Events emitted by PlexAuth.
 */
export interface PlexAuthEvents extends Record<string, unknown> {
    /** Emitted when authentication state changes */
    authChange: boolean;
}

// ============================================
// Main Interface
// ============================================

/**
 * Plex Authentication Interface.
 * Handles OAuth flow and token management.
 */
export interface IPlexAuth {
    // PIN-based OAuth flow

    /**
     * Initiate Plex OAuth flow by requesting a PIN code.
     * @returns PIN request containing code for user display (length varies)
     * @throws PlexApiError on connection failure or rate limiting
     */
    requestPin(): Promise<PlexPinRequest>;

    /**
     * Check if user has claimed the PIN via the Plex auth app.
     * @param pinId - PIN ID from requestPin()
     * @returns Updated PIN request with authToken if claimed
     * @throws PlexApiError if PIN doesn't exist or on connection failure
     */
    checkPinStatus(pinId: number): Promise<PlexPinRequest>;

    /**
     * Cancel an active PIN request.
     * @param pinId - PIN ID to cancel
     */
    cancelPin(pinId: number): Promise<void>;

    /**
     * Poll for PIN status until claimed or timeout (5 minutes).
     * @param pinId - PIN ID from requestPin()
     * @returns Updated PIN request with authToken when claimed
     * @throws PlexApiError if PIN expires or on connection failure
     */
    pollForPin(pinId: number): Promise<PlexPinRequest>;

    // Token management

    /**
     * Verify a token is still valid by calling Plex API.
     * @param token - Plex auth token to validate
     * @returns true if token is valid, false otherwise
     */
    validateToken(token: string): Promise<boolean>;

    /**
     * Get stored credentials from localStorage.
     * @returns Stored auth data or null if none
     */
    getStoredCredentials(): Promise<PlexAuthData | null>;

    /**
     * Store credentials to localStorage.
     * @param auth - Auth data to store
     */
    storeCredentials(auth: PlexAuthData): Promise<void>;

    /**
     * Clear credentials from localStorage.
     */
    clearCredentials(): Promise<void>;

    // Convenience methods

    /**
     * Check if currently authenticated (synchronous).
     * @returns true if authenticated
     */
    isAuthenticated(): boolean;

    /**
     * Get current user token (synchronous).
     * @returns Current token or null
     */
    getCurrentUser(): PlexAuthToken | null;

    /**
     * Generate headers required for all Plex API requests.
     * @returns Object containing all required Plex headers
     */
    getAuthHeaders(): Record<string, string>;

    // Event handling

    /**
     * Register handler for auth change events.
     * @param event - Event name ('authChange')
     * @param handler - Handler function
     * @returns Disposable to remove handler
     */
    on(event: 'authChange', handler: (isAuthenticated: boolean) => void): IDisposable;
}
