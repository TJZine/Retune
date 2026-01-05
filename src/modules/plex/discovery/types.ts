/**
 * @fileoverview Type definitions for Plex Server Discovery module.
 * @module modules/plex/discovery/types
 * @version 1.0.0
 */

// ============================================
// Core Domain Types
// ============================================

/**
 * A single connection endpoint to a Plex server.
 * Servers typically have multiple connections (LAN, WAN, relay).
 */
export interface PlexConnection {
    /** Full URL (e.g., "http://192.168.1.5:32400" or "https://xxx.plex.direct:32400") */
    uri: string;
    /** Connection protocol */
    protocol: 'http' | 'https';
    /** IP address or hostname */
    address: string;
    /** Port number (typically 32400) */
    port: number;
    /** true for LAN connections */
    local: boolean;
    /** true for Plex relay connections (bandwidth limited) */
    relay: boolean;
    /** Measured latency in ms - null until tested */
    latencyMs: number | null;
}

/**
 * Represents a Plex Media Server accessible to the user.
 * A user may have access to multiple servers (owned or shared).
 */
export interface PlexServer {
    /** Machine identifier - unique per server */
    id: string;
    /** User-defined server name */
    name: string;
    /** Owner's username */
    sourceTitle: string;
    /** Owner's Plex user ID */
    ownerId: string;
    /** true if current user owns this server */
    owned: boolean;
    /** Available connection endpoints (local, remote, relay) */
    connections: PlexConnection[];
    /** Server capabilities list */
    capabilities: string[];
    /** Best available connection after testing - null until tested */
    preferredConnection: PlexConnection | null;
}

// ============================================
// Internal State Types
// ============================================

/**
 * Internal state managed by PlexServerDiscovery class.
 */
export interface PlexServerDiscoveryState {
    /** Cached list of discovered servers */
    servers: PlexServer[];
    /** Currently selected server */
    selectedServer: PlexServer | null;
    /** Currently selected connection */
    selectedConnection: PlexConnection | null;
    /** When the server list was last refreshed */
    lastRefreshAt: number | null;
    /** Whether discovery is in progress */
    isDiscovering: boolean;
}

/**
 * Events emitted by PlexServerDiscovery.
 */
export interface PlexServerDiscoveryEvents extends Record<string, unknown> {
    /** Emitted when selected server changes */
    serverChange: PlexServer | null;
    /** Emitted when connection URI changes */
    connectionChange: string | null;
}

// ============================================
// API Response Types
// ============================================

/**
 * Raw connection data from Plex API.
 */
export interface PlexApiConnection {
    uri: string;
    protocol: string;
    address: string;
    port: number;
    local: boolean;
    relay: boolean;
}

/**
 * Raw server resource data from Plex API.
 */
export interface PlexApiResource {
    clientIdentifier: string;
    name: string;
    sourceTitle: string;
    ownerId: string;
    owned: boolean;
    provides: string;
    connections: PlexApiConnection[];
}

/**
 * Identity response from Plex server.
 */
export interface PlexIdentityResponse {
    machineIdentifier: string;
    version: string;
}
