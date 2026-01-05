/**
 * @fileoverview Plex Server Discovery implementation.
 * Handles server discovery, connection testing, and selection.
 * @module modules/plex/discovery/PlexServerDiscovery
 * @version 1.0.0
 */

import { EventEmitter } from '../../../utils/EventEmitter';
import { IDisposable } from '../../../utils/interfaces';
import { PLEX_DISCOVERY_CONSTANTS, CONNECTION_PRIORITY } from './constants';
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

    /**
     * Create a new PlexServerDiscovery instance.
     * @param config - Configuration with auth header getter
     */
    constructor(config: PlexServerDiscoveryConfig) {
        this._getAuthHeaders = config.getAuthHeaders;
        this._emitter = new EventEmitter<PlexServerDiscoveryEvents>();
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
        if (this._state.isDiscovering) {
            return this._state.servers;
        }

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
     * @param server - Server to test connections for
     * @returns Promise resolving to best connection, or null if all fail
     */
    public async findFastestConnection(
        server: PlexServer
    ): Promise<PlexConnection | null> {
        const sortedConnections = this._sortConnectionsByPriority(server.connections);
        let bestConnection: PlexConnection | null = null;
        let bestLatency: number = Infinity;

        // Test connections in priority order
        for (const connection of sortedConnections) {
            const latency = await this.testConnection(server, connection);

            if (latency !== null) {
                const connectionWithLatency: PlexConnection = {
                    uri: connection.uri,
                    protocol: connection.protocol,
                    address: connection.address,
                    port: connection.port,
                    local: connection.local,
                    relay: connection.relay,
                    latencyMs: latency,
                };

                // First working connection wins (due to priority sorting)
                // Only update if significantly faster within same priority tier
                if (bestConnection === null || latency < bestLatency) {
                    bestConnection = connectionWithLatency;
                    bestLatency = latency;
                }

                // For local or HTTPS connections, accept first successful one
                if (connection.local || connection.protocol === 'https') {
                    break;
                }
            }
        }

        return bestConnection;
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
     * @returns Disposable to remove handler
     */
    public on(
        event: 'serverChange',
        handler: (server: PlexServer | null) => void
    ): IDisposable;
    public on(
        event: 'connectionChange',
        handler: (uri: string | null) => void
    ): IDisposable;
    public on(
        event: 'serverChange' | 'connectionChange',
        handler: ((server: PlexServer | null) => void) | ((uri: string | null) => void)
    ): IDisposable {
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
            connections.push({
                uri: conn.uri,
                protocol: conn.protocol === 'https' ? 'https' : 'http',
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
     * Sort connections by priority for testing.
     * Order: local HTTPS > remote HTTPS > relay > local HTTP
     */
    private _sortConnectionsByPriority(connections: PlexConnection[]): PlexConnection[] {
        const getPriority = (conn: PlexConnection): number => {
            if (conn.relay) {
                return CONNECTION_PRIORITY.RELAY;
            }
            if (conn.local && conn.protocol === 'https') {
                return CONNECTION_PRIORITY.LOCAL_HTTPS;
            }
            if (!conn.local && conn.protocol === 'https') {
                return CONNECTION_PRIORITY.REMOTE_HTTPS;
            }
            return CONNECTION_PRIORITY.LOCAL_HTTP;
        };

        return connections.slice().sort(function (a, b) {
            return getPriority(a) - getPriority(b);
        });
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
                // Store for async restoration
                (this as { _pendingServerId?: string })._pendingServerId = savedServerId;
            }
        } catch {
            // localStorage not available
        }
    }

    /**
     * Restore saved server selection asynchronously.
     */
    private async _restoreSelectionAsync(): Promise<void> {
        const pendingId = (this as { _pendingServerId?: string })._pendingServerId;
        if (pendingId && this._state.servers.length > 0) {
            await this.selectServer(pendingId);
        }
    }
}
