/**
 * @fileoverview Interface definitions for Plex Server Discovery module.
 * @module modules/plex/discovery/interfaces
 * @version 1.0.0
 */

import { PlexServer, PlexConnection } from './types';
import { IDisposable } from '../../../utils/interfaces';

// ============================================
// Main Interface
// ============================================

/**
 * Plex Server Discovery Interface.
 * Manages server discovery, connection testing, and selection.
 */
export interface IPlexServerDiscovery {
    // Discovery

    /**
     * Discover available Plex servers for the authenticated user.
     * @returns Promise resolving to list of servers
     * @throws PlexApiError on connection failure
     */
    discoverServers(): Promise<PlexServer[]>;

    /**
     * Refresh the server list from plex.tv.
     * @returns Promise resolving to list of servers
     * @throws PlexApiError on connection failure
     */
    refreshServers(): Promise<PlexServer[]>;

    /**
     * Initialize discovery by fetching servers and restoring selection.
     * @returns Promise resolving when initialization completes
     */
    initialize(): Promise<void>;

    // Connection Testing

    /**
     * Test a specific connection to a server.
     * @param server - Server to test
     * @param connection - Connection endpoint to test
     * @returns Promise resolving to latency in ms, 'auth_required' if auth is needed, or null if failed
     */
    testConnection(server: PlexServer, connection: PlexConnection): Promise<number | 'auth_required' | null>;

    /**
     * Find the fastest working connection for a server.
     * Tests connections in priority order: local > remote > relay.
     * @param server - Server to test connections for
     * @returns Promise resolving to best connection info (connection + authRequired)
     */
    findFastestConnection(server: PlexServer): Promise<{
        connection: PlexConnection | null;
        authRequired: boolean;
    }>;

    // Server Selection

    /**
     * Select a server and find its best connection.
     * Persists selection to localStorage.
     * @param serverId - Machine identifier of server to select
     * @returns Promise resolving to true if selection succeeded
     */
    selectServer(serverId: string): Promise<boolean>;

    /**
     * Get the currently selected server.
     * @returns Selected server or null
     */
    getSelectedServer(): PlexServer | null;

    /**
     * Get the connection for the selected server.
     * @returns Selected connection or null
     */
    getSelectedConnection(): PlexConnection | null;

    /**
     * Get the URI for the selected server connection.
     * @returns Server URI or null
     */
    getServerUri(): string | null;

    // Mixed Content Fallback

    /**
     * Get an HTTPS connection for the selected server, if available.
     * Used by plex-stream-resolver for mixed content fallback.
     * @returns HTTPS connection or null
     */
    getHttpsConnection(): PlexConnection | null;

    /**
     * Get a relay connection for the selected server, if available.
     * Used by plex-stream-resolver for mixed content fallback.
     * @returns Relay connection or null
     */
    getRelayConnection(): PlexConnection | null;

    /**
     * Get the active connection URI (alias for getServerUri).
     * @returns Active connection URI or null
     */
    getActiveConnectionUri(): string | null;

    /**
     * Clear any saved server selection.
     * Resets selected server and connection state.
     */
    clearSelection(): void;

    // State

    /**
     * Get all cached servers.
     * @returns List of discovered servers
     */
    getServers(): PlexServer[];

    /**
     * Check if connected to a server.
     * @returns true if a server is selected with a working connection
     */
    isConnected(): boolean;

    // Events

    /**
     * Register handler for server change events.
     * @param event - Event name ('serverChange')
     * @param handler - Handler function
     * @returns Disposable to remove the handler
     */
    on(event: 'serverChange', handler: (server: PlexServer | null) => void): IDisposable;

    /**
     * Register handler for connection change events.
     * @param event - Event name ('connectionChange')
     * @param handler - Handler function
     * @returns Disposable to remove the handler
     */
    on(event: 'connectionChange', handler: (uri: string | null) => void): IDisposable;
}

/**
 * Configuration for PlexServerDiscovery constructor.
 */
export interface PlexServerDiscoveryConfig {
    /**
     * Function to get auth headers for Plex API requests.
     * Should return headers including X-Plex-Token when authenticated.
     */
    getAuthHeaders: () => Record<string, string>;
}
