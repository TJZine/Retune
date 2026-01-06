/**
 * @fileoverview Plex Server Discovery implementation.
 * Handles server discovery, connection testing, and selection.
 * @module modules/plex/discovery/PlexServerDiscovery
 * @version 1.0.0
 */

import { EventEmitter } from '../../../utils/EventEmitter';
import { PLEX_DISCOVERY_CONSTANTS, DEFAULT_MIXED_CONTENT_CONFIG } from './constants';
import {
    IPlexServerDiscovery,
    PlexServerDiscoveryConfig,
} from './interfaces';
import {
    PlexServer,
    PlexConnection,
    PlexServerDiscoveryState,
    PlexServerDiscoveryEvents,
    PlexApiResource,
    PlexApiConnection,
    MixedContentConfig,
} from './types';
import { AppErrorCode } from '../../lifecycle/types';
import { PlexApiError } from '../auth/helpers';

// Re-export for consumers
export { AppErrorCode, PlexApiError };

/**
 * Plex Server Discovery implementation.
 * Discovers and manages Plex Media Servers accessible to the authenticated user.
 * @implements {IPlexServerDiscovery}
 */
export class PlexServerDiscovery implements IPlexServerDiscovery {
    private _state: PlexServerDiscoveryState;
    private _emitter: EventEmitter<PlexServerDiscoveryEvents>;
    private _getAuthHeaders: () => Record<string, string>;
    private _mixedContentConfig: MixedContentConfig;
    private _pendingServerId?: string;
    private _discoveryPromise: Promise<PlexServer[]> | null = null;

    /**
     * Create a new PlexServerDiscovery instance.
     * @param config - Configuration with auth header getter
     */
    constructor(config: PlexServerDiscoveryConfig) {
        this._getAuthHeaders = config.getAuthHeaders;
        this._emitter = new EventEmitter<PlexServerDiscoveryEvents>();
        this._mixedContentConfig = { ...DEFAULT_MIXED_CONTENT_CONFIG };
        this._state = {
            servers: [],
            selectedServer: null,
            selectedConnection: null,
            lastRefreshAt: null,
            isDiscovering: false,
        };

        // Restore persisted selection
        this._restoreSelection();
    }

    // ============================================
    // Discovery Methods
    // ============================================

    /**
     * Discover available Plex servers for the authenticated user.
     * @returns Promise resolving to list of servers
     * @throws PlexApiError on connection failure
     */
    public async discoverServers(): Promise<PlexServer[]> {
        // Return pending promise if discovery already in progress
        if (this._discoveryPromise) {
            return this._discoveryPromise;
        }

        this._discoveryPromise = this._doDiscoverServers();
        try {
            return await this._discoveryPromise;
        } finally {
            this._discoveryPromise = null;
        }
    }

    /**
     * Internal discovery implementation.
     * @returns Promise resolving to list of servers
     * @throws PlexApiError on connection failure
     */
    private async _doDiscoverServers(): Promise<PlexServer[]> {
        this._state.isDiscovering = true;

        try {
            const url = PLEX_DISCOVERY_CONSTANTS.PLEX_TV_BASE_URL +
                PLEX_DISCOVERY_CONSTANTS.RESOURCES_ENDPOINT +
                '?' + PLEX_DISCOVERY_CONSTANTS.RESOURCES_PARAMS;

            const headers = this._getAuthHeaders();
            const response = await fetch(url, {
                method: 'GET',
                headers: headers,
            });

            if (!response.ok) {
                this._handleResponseError(response);
            }

            const resources = await response.json() as PlexApiResource[];
            const servers = this._parseResources(resources);

            this._state.servers = servers;
            this._state.lastRefreshAt = Date.now();

            return servers;
        } catch (error) {
            if (error instanceof PlexApiError) {
                throw error;
            }
            throw new PlexApiError(
                AppErrorCode.SERVER_UNREACHABLE,
                'Failed to discover servers: network error',
                undefined,
                true
            );
        } finally {
            this._state.isDiscovering = false;
        }
    }

    /**
     * Refresh the server list from plex.tv.
     * @returns Promise resolving to list of servers
     */
    public async refreshServers(): Promise<PlexServer[]> {
        return this.discoverServers();
    }

    // ============================================
    // Connection Testing
    // ============================================

    /**
     * Test a specific connection to a server.
     * @param _server - Server to test (unused but kept for interface compatibility)
     * @param connection - Connection endpoint to test
     * @returns Promise resolving to latency in ms, or null if failed
     */
    public async testConnection(
        _server: PlexServer,
        connection: PlexConnection
    ): Promise<number | null> {
        const url = connection.uri + PLEX_DISCOVERY_CONSTANTS.IDENTITY_ENDPOINT;
        const headers = this._getAuthHeaders();
        const startTime = Date.now();

        const controller = new AbortController();
        const timeoutId = setTimeout(function () {
            controller.abort();
        }, PLEX_DISCOVERY_CONSTANTS.CONNECTION_TEST_TIMEOUT_MS);

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: headers,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                return null;
            }

            const latency = Date.now() - startTime;
            return latency;
        } catch {
            clearTimeout(timeoutId);
            return null;
        }
    }

    /**
     * Find the fastest working connection for a server.
     * Tests connections in priority order: local HTTPS > remote HTTPS > relay > local HTTP.
     * Implements mixed-content handling per MixedContentConfig.
     * @param server - Server to test connections for
     * @returns Promise resolving to best connection, or null if all fail
     */
    public async findFastestConnection(
        server: PlexServer
    ): Promise<PlexConnection | null> {
        const config = this._mixedContentConfig;

        // Separate connections by protocol per mixed-content handling requirements
        const httpsConns = server.connections.filter(c => c.protocol === 'https');
        const httpConns = server.connections.filter(c => c.protocol === 'http');

        // If preferHttps is true (default), test HTTPS first
        if (config.preferHttps) {
            // Within HTTPS, prioritize: local > remote > relay
            const localHttps = httpsConns.filter(c => c.local && !c.relay);
            const remoteHttps = httpsConns.filter(c => !c.local && !c.relay);
            const relayHttps = httpsConns.filter(c => c.relay);

            // Test HTTPS connections in priority order
            for (const conn of localHttps) {
                const latency = await this.testConnection(server, conn);
                if (latency !== null) {
                    return this._createConnectionWithLatency(conn, latency);
                }
            }

            for (const conn of remoteHttps) {
                const latency = await this.testConnection(server, conn);
                if (latency !== null) {
                    return this._createConnectionWithLatency(conn, latency);
                }
            }

            for (const conn of relayHttps) {
                const latency = await this.testConnection(server, conn);
                if (latency !== null) {
                    return this._createConnectionWithLatency(conn, latency);
                }
            }
        }

        // Try HTTPS upgrade for HTTP connections if enabled
        if (config.tryHttpsUpgrade) {
            for (const conn of httpConns) {
                const httpsUri = conn.uri.replace('http://', 'https://');
                const upgradedConn: PlexConnection = {
                    uri: httpsUri,
                    protocol: 'https',
                    address: conn.address,
                    port: conn.port,
                    local: conn.local,
                    relay: conn.relay,
                    latencyMs: null,
                };
                const latency = await this.testConnection(server, upgradedConn);
                if (latency !== null) {
                    return this._createConnectionWithLatency(upgradedConn, latency);
                }
            }
        }

        // Only try HTTP as last resort if allowLocalHttp is true
        if (config.allowLocalHttp) {
            const localHttp = httpConns.filter(c => c.local && !c.relay);
            for (const conn of localHttp) {
                const latency = await this.testConnection(server, conn);
                if (latency !== null) {
                    // Log warning if logWarnings is enabled
                    if (config.logWarnings) {
                        console.warn('[Discovery] Using HTTP connection - HTTPS unavailable');
                    }
                    return this._createConnectionWithLatency(conn, latency);
                }
            }
        }

        return null;
    }

    /**
     * Create a connection object with latency.
     * @param conn - Original connection
     * @param latency - Measured latency in ms
     * @returns Connection with latencyMs set
     */
    private _createConnectionWithLatency(conn: PlexConnection, latency: number): PlexConnection {
        return {
            uri: conn.uri,
            protocol: conn.protocol,
            address: conn.address,
            port: conn.port,
            local: conn.local,
            relay: conn.relay,
            latencyMs: latency,
        };
    }

    // ============================================
    // Server Selection
    // ============================================

    /**
     * Select a server and find its best connection.
     * Persists selection to localStorage.
     * @param serverId - Machine identifier of server to select
     * @returns Promise resolving to true if selection succeeded
     */
    public async selectServer(serverId: string): Promise<boolean> {
        const server = this._findServerById(serverId);

        if (!server) {
            return false;
        }

        const connection = await this.findFastestConnection(server);

        if (!connection) {
            return false;
        }

        // Update state
        const serverWithConnection: PlexServer = {
            id: server.id,
            name: server.name,
            sourceTitle: server.sourceTitle,
            ownerId: server.ownerId,
            owned: server.owned,
            connections: server.connections,
            capabilities: server.capabilities,
            preferredConnection: connection,
        };

        this._state.selectedServer = serverWithConnection;
        this._state.selectedConnection = connection;

        // Persist to localStorage
        try {
            localStorage.setItem(
                PLEX_DISCOVERY_CONSTANTS.SELECTED_SERVER_KEY,
                serverId
            );
        } catch {
            // localStorage may be unavailable, continue anyway
        }

        // Emit events
        this._emitter.emit('serverChange', serverWithConnection);
        this._emitter.emit('connectionChange', connection.uri);

        return true;
    }

    /**
     * Get the currently selected server.
     * @returns Selected server or null
     */
    public getSelectedServer(): PlexServer | null {
        return this._state.selectedServer;
    }

    /**
     * Get the connection for the selected server.
     * @returns Selected connection or null
     */
    public getSelectedConnection(): PlexConnection | null {
        return this._state.selectedConnection;
    }

    /**
     * Get the URI for the selected server connection.
     * @returns Server URI or null
     */
    public getServerUri(): string | null {
        if (this._state.selectedConnection) {
            return this._state.selectedConnection.uri;
        }
        return null;
    }

    // ============================================
    // Mixed Content Fallback
    // ============================================

    /**
     * Get an HTTPS connection for the selected server, if available.
     * @returns HTTPS connection or null
     */
    public getHttpsConnection(): PlexConnection | null {
        const server = this._state.selectedServer;
        if (!server) {
            return null;
        }

        for (const conn of server.connections) {
            if (conn.protocol === 'https' && !conn.relay) {
                return conn;
            }
        }
        return null;
    }

    /**
     * Get a relay connection for the selected server, if available.
     * @returns Relay connection or null
     */
    public getRelayConnection(): PlexConnection | null {
        const server = this._state.selectedServer;
        if (!server) {
            return null;
        }

        for (const conn of server.connections) {
            if (conn.relay) {
                return conn;
            }
        }
        return null;
    }

    /**
     * Get the active connection URI (alias for getServerUri).
     * @returns Active connection URI or null
     */
    public getActiveConnectionUri(): string | null {
        return this.getServerUri();
    }

    // ============================================
    // State Methods
    // ============================================

    /**
     * Get all cached servers.
     * @returns List of discovered servers
     */
    public getServers(): PlexServer[] {
        return this._state.servers;
    }

    /**
     * Check if connected to a server.
     * @returns true if a server is selected with a working connection
     */
    public isConnected(): boolean {
        return this._state.selectedServer !== null &&
            this._state.selectedConnection !== null;
    }

    // ============================================
    // Event Handling
    // ============================================

    /**
     * Register handler for server or connection change events.
     * @param event - Event name
     * @param handler - Handler function
     * @returns Disposable to remove the handler
     */
    public on(
        event: 'serverChange',
        handler: (server: PlexServer | null) => void
    ): { dispose: () => void };
    public on(
        event: 'connectionChange',
        handler: (uri: string | null) => void
    ): { dispose: () => void };
    public on(
        event: 'serverChange' | 'connectionChange',
        handler: ((server: PlexServer | null) => void) | ((uri: string | null) => void)
    ): { dispose: () => void } {
        return this._emitter.on(event, handler as (payload: unknown) => void);
    }

    // ============================================
    // Initialization
    // ============================================

    /**
     * Initialize the discovery module.
     * Discovers servers and restores saved selection.
     * @returns Promise resolving when initialization is complete
     */
    public async initialize(): Promise<void> {
        await this.discoverServers();
        await this._restoreSelectionAsync();
    }

    // ============================================
    // Private Helpers
    // ============================================

    /**
     * Parse API resources into PlexServer objects.
     * Filters for server resources only.
     */
    private _parseResources(resources: PlexApiResource[]): PlexServer[] {
        const servers: PlexServer[] = [];

        for (const resource of resources) {
            // Filter for server capability
            if (!resource.provides || !resource.provides.includes('server')) {
                continue;
            }

            const connections = this._parseConnections(resource.connections);
            const capabilities = resource.provides ? resource.provides.split(',') : [];

            servers.push({
                id: resource.clientIdentifier,
                name: resource.name,
                sourceTitle: resource.sourceTitle,
                ownerId: resource.ownerId,
                owned: resource.owned,
                connections: connections,
                capabilities: capabilities,
                preferredConnection: null,
            });
        }

        return servers;
    }

    /**
     * Parse API connections into PlexConnection objects.
     */
    private _parseConnections(apiConnections: PlexApiConnection[]): PlexConnection[] {
        const connections: PlexConnection[] = [];

        for (const conn of apiConnections) {
            let protocol: 'https' | 'http';
            if (conn.protocol === 'https') {
                protocol = 'https';
            } else if (conn.protocol === 'http') {
                protocol = 'http';
            } else {
                console.warn(`[Discovery] Unexpected protocol: ${conn.protocol}, defaulting to http`);
                protocol = 'http';
            }

            connections.push({
                uri: conn.uri,
                protocol,
                address: conn.address,
                port: conn.port,
                local: Boolean(conn.local),
                relay: Boolean(conn.relay),
                latencyMs: null,
            });
        }

        return connections;
    }


    /**
     * Find a server by ID in the cached list.
     */
    private _findServerById(serverId: string): PlexServer | undefined {
        for (const server of this._state.servers) {
            if (server.id === serverId) {
                return server;
            }
        }
        return undefined;
    }

    /**
     * Handle HTTP response errors.
     */
    private _handleResponseError(response: Response): never {
        if (response.status === 401) {
            throw new PlexApiError(
                AppErrorCode.AUTH_REQUIRED,
                'Unauthorized: authentication required',
                401,
                false
            );
        }
        if (response.status === 403) {
            throw new PlexApiError(
                AppErrorCode.AUTH_INVALID,
                'Forbidden: access denied',
                403,
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
        throw new PlexApiError(
            AppErrorCode.SERVER_UNREACHABLE,
            'Request failed with status ' + String(response.status),
            response.status,
            false
        );
    }

    /**
     * Restore saved server selection synchronously (for constructor).
     */
    private _restoreSelection(): void {
        try {
            const savedServerId = localStorage.getItem(
                PLEX_DISCOVERY_CONSTANTS.SELECTED_SERVER_KEY
            );
            // Just note that there's a saved selection; actual restoration
            // happens in initialize() when we have server data
            if (savedServerId) {
                this._pendingServerId = savedServerId;
            }
        } catch {
            // localStorage not available
        }
    }

    private async _restoreSelectionAsync(): Promise<void> {
        if (this._pendingServerId && this._state.servers.length > 0) {
            await this.selectServer(this._pendingServerId);
        }
    }
}
