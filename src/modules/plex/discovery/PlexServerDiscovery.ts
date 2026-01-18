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
    private _pendingServerId: string | undefined;
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
    public discoverServers(): Promise<PlexServer[]> {
        // Return cached servers if still fresh (avoid unnecessary plex.tv calls)
        if (
            this._state.lastRefreshAt !== null &&
            this._state.servers.length > 0 &&
            Date.now() - this._state.lastRefreshAt < PLEX_DISCOVERY_CONSTANTS.SERVER_CACHE_DURATION_MS
        ) {
            return Promise.resolve([...this._state.servers]);
        }

        // Return pending promise if discovery already in progress
        if (this._discoveryPromise) {
            return this._discoveryPromise;
        }

        this._discoveryPromise = this._doDiscoverServers().finally(() => {
            this._discoveryPromise = null;
        });

        return this._discoveryPromise;
    }

    /**
     * Internal discovery implementation.
     * @returns Promise resolving to list of servers
     * @throws PlexApiError on connection failure
     */
    private async _doDiscoverServers(): Promise<PlexServer[]> {
        this._state.isDiscovering = true;
        let lastUrl = '';

        try {
            const baseUrl = PLEX_DISCOVERY_CONSTANTS.PLEX_TV_BASE_URL +
                PLEX_DISCOVERY_CONSTANTS.RESOURCES_ENDPOINT +
                '?' + PLEX_DISCOVERY_CONSTANTS.RESOURCES_PARAMS;

            const headers = this._getAuthHeaders();
            const token = headers['X-Plex-Token'];
            const urlWithToken = token
                ? baseUrl + '&X-Plex-Token=' + encodeURIComponent(token)
                : baseUrl;
            const clientsBaseUrl = 'https://clients.plex.tv/api/v2/resources' +
                '?' + PLEX_DISCOVERY_CONSTANTS.RESOURCES_PARAMS +
                (token ? '&X-Plex-Token=' + encodeURIComponent(token) : '');

            const variants: Array<{ url: string; headers?: Record<string, string> }> = [
                { url: baseUrl, headers: headers },
            ];
            if (token) {
                variants.push({ url: urlWithToken });
                variants.push({ url: clientsBaseUrl });
            }

            const maxAttempts = PLEX_DISCOVERY_CONSTANTS.MAX_DISCOVERY_ATTEMPTS;
            let response: Response | null = null;
            let lastError: unknown = null;
            let lastNonOkResponse: Response | null = null;

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                let retryScheduled = false;
                for (const variant of variants) {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(
                        () => controller.abort(),
                        PLEX_DISCOVERY_CONSTANTS.DISCOVERY_TIMEOUT_MS
                    );
                    try {
                        lastUrl = variant.url;
                        const init: RequestInit = {
                            method: 'GET',
                            signal: controller.signal,
                        };
                        if (variant.headers) {
                            init.headers = variant.headers;
                        }
                        response = await fetch(variant.url, init);
                    } catch (error) {
                        lastError = error;
                        continue;
                    } finally {
                        clearTimeout(timeoutId);
                    }

                    if (response.status === 429 && attempt < maxAttempts - 1) {
                        const retryAfter = response.headers.get('Retry-After');
                        const parsed = retryAfter ? parseInt(retryAfter, 10) : NaN;
                        const delayMs = Number.isFinite(parsed) && parsed > 0
                            ? parsed * 1000
                            : PLEX_DISCOVERY_CONSTANTS.RATE_LIMIT_DEFAULT_DELAY_MS;
                        await new Promise((resolve) => setTimeout(resolve, delayMs));
                        response = null;
                        retryScheduled = true;
                        break;
                    }

                    // If one variant is temporarily unhealthy (5xx), try the next variant in the same attempt.
                    if (response.status >= 500 && response.status <= 599) {
                        lastNonOkResponse = response;
                        lastError = new Error(`Request failed with status ${response.status}`);
                        response = null;
                        continue;
                    }

                    break;
                }

                if (response) {
                    break;
                }
                if (retryScheduled) {
                    continue;
                }
                // Brief backoff if all variants in this attempt failed with 5xx to avoid hammering plex.tv.
                if (lastNonOkResponse && attempt < maxAttempts - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 500));
                }
            }

            if (!response) {
                if (lastNonOkResponse) {
                    this._handleResponseError(lastNonOkResponse);
                }
                const message = lastError instanceof Error
                    ? lastError.message
                    : 'unknown error';
                throw new PlexApiError(
                    AppErrorCode.SERVER_UNREACHABLE,
                    `Failed to discover servers: ${message} (last url: ${this._redactUrl(lastUrl) || 'unknown'})`,
                    undefined,
                    true
                );
            }
            if (!response.ok) {
                this._handleResponseError(response);
            }

            const resources = await this._parseResourcesResponse(response);
            const servers = this._parseResources(resources);

            this._state.servers = servers;
            this._state.lastRefreshAt = Date.now();

            return servers;
        } catch (error) {
            const lastUrlInfo = this._redactUrl(lastUrl) || 'unknown';
            if (error instanceof PlexApiError) {
                console.error(`[Discovery] Discovery failed (API Error): ${error.message} (last url: ${lastUrlInfo})`);
                throw error;
            }
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[Discovery] Discovery failed (Network/Other): ${message} (last url: ${lastUrlInfo})`);
            throw new PlexApiError(
                AppErrorCode.SERVER_UNREACHABLE,
                `Failed to discover servers: ${message} (last url: ${lastUrlInfo})`,
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
        this._state.lastRefreshAt = null;
        return this.discoverServers();
    }

    // ============================================
    // Connection Testing
    // ============================================

    /**
     * Test a specific connection to a server.
     * @param _server - Server to test (unused but kept for interface compatibility)
     * @param connection - Connection endpoint to test
     * @returns Promise resolving to latency in ms, 'auth_required' if auth is needed, or null if failed
     */
    public async testConnection(
        _server: PlexServer,
        connection: PlexConnection
    ): Promise<number | 'auth_required' | null> {
        const url = new URL(PLEX_DISCOVERY_CONSTANTS.IDENTITY_ENDPOINT, connection.uri).toString();
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

            if (response.status === 401 || response.status === 403) {
                return 'auth_required';
            }
            if (!response.ok) {
                return null;
            }

            const latency = Date.now() - startTime;
            return latency;
        } catch (error) {
            clearTimeout(timeoutId);
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.warn(`[Discovery] Connection test failed for ${url}:`, errorMsg);
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
    ): Promise<{ connection: PlexConnection | null; authRequired: boolean; selectedAuthRequired: boolean }> {
        const config = this._mixedContentConfig;
        let authRequired = false;

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
                if (latency === 'auth_required') {
                    authRequired = true;
                } else if (latency !== null) {
                    return { connection: this._createConnectionWithLatency(conn, latency), authRequired, selectedAuthRequired: false };
                }
            }

            for (const conn of remoteHttps) {
                const latency = await this.testConnection(server, conn);
                if (latency === 'auth_required') {
                    authRequired = true;
                } else if (latency !== null) {
                    return { connection: this._createConnectionWithLatency(conn, latency), authRequired, selectedAuthRequired: false };
                }
            }

            for (const conn of relayHttps) {
                const latency = await this.testConnection(server, conn);
                if (latency === 'auth_required') {
                    authRequired = true;
                } else if (latency !== null) {
                    return { connection: this._createConnectionWithLatency(conn, latency), authRequired, selectedAuthRequired: false };
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
                if (latency === 'auth_required') {
                    authRequired = true;
                } else if (latency !== null) {
                    return { connection: this._createConnectionWithLatency(upgradedConn, latency), authRequired, selectedAuthRequired: false };
                }
            }
        }

        // Only try HTTP as last resort if allowLocalHttp is true
        if (config.allowLocalHttp) {
            const localHttp = httpConns.filter(c => c.local && !c.relay);
            for (const conn of localHttp) {
                const latency = await this.testConnection(server, conn);
                if (latency === 'auth_required') {
                    authRequired = true;
                } else if (latency !== null) {
                    // Log warning if logWarnings is enabled
                    if (config.logWarnings) {
                        console.warn('[Discovery] Using HTTP connection - HTTPS unavailable');
                    }
                    return { connection: this._createConnectionWithLatency(conn, latency), authRequired, selectedAuthRequired: false };
                }
            }
        }

        return { connection: null, authRequired, selectedAuthRequired: false };
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

        const { connection, authRequired } = await this.findFastestConnection(server);

        if (!connection) {
            this._persistServerHealth(serverId, authRequired ? 'auth_required' : 'unreachable');
            return false;
        }

        // Update state
        const serverWithConnection: PlexServer = {
            ...server,
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

        this._persistServerHealth(serverId, 'ok', {
            connection: connection,
            latency: connection.latencyMs ?? 0
        });

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

    /**
     * Clear the current server selection and persisted ID.
     */
    public clearSelection(): void {
        this._state.selectedServer = null;
        this._state.selectedConnection = null;
        this._pendingServerId = undefined;
        try {
            localStorage.removeItem(PLEX_DISCOVERY_CONSTANTS.SELECTED_SERVER_KEY);
        } catch {
            // localStorage may be unavailable, continue anyway
        }
        this._emitter.emit('serverChange', null);
        this._emitter.emit('connectionChange', null);
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

            const connections = this._parseConnections(resource.connections || []);
            const capabilities = resource.provides.split(',');

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

    private async _parseResourcesResponse(response: Response): Promise<PlexApiResource[]> {
        const contentType =
            response.headers && typeof response.headers.get === 'function'
                ? response.headers.get('Content-Type') || ''
                : '';
        if (typeof response.text !== 'function') {
            if (typeof response.json === 'function') {
                const parsed = await response.json();
                return Array.isArray(parsed) ? (parsed as PlexApiResource[]) : [];
            }
            return [];
        }

        const text = await response.text();
        if (!text) {
            return [];
        }

        // Prefer JSON parsing but tolerate XML payloads from plex.tv.
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
                return parsed as PlexApiResource[];
            }
        } catch {
            // Fall through to XML parsing.
        }

        if (!contentType.includes('xml') && !text.trim().startsWith('<')) {
            throw new PlexApiError(
                AppErrorCode.SERVER_UNREACHABLE,
                'Failed to parse server discovery response',
                response.status,
                false
            );
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'application/xml');
        if (doc.getElementsByTagName('parsererror').length > 0) {
            throw new PlexApiError(
                AppErrorCode.SERVER_UNREACHABLE,
                'Invalid XML response from server discovery',
                response.status,
                false
            );
        }

        const devices = Array.from(doc.getElementsByTagName('Device'));
        const resources: PlexApiResource[] = [];
        for (const device of devices) {
            const provides = device.getAttribute('provides') || '';
            const connections: PlexApiConnection[] = [];
            const connectionNodes = Array.from(device.getElementsByTagName('Connection'));
            for (const conn of connectionNodes) {
                const portRaw = conn.getAttribute('port');
                const port = portRaw ? Number(portRaw) : 0;
                connections.push({
                    uri: conn.getAttribute('uri') || '',
                    protocol: conn.getAttribute('protocol') || '',
                    address: conn.getAttribute('address') || '',
                    port: Number.isFinite(port) ? port : 0,
                    local: this._parseXmlBoolean(conn.getAttribute('local')),
                    relay: this._parseXmlBoolean(conn.getAttribute('relay')),
                });
            }

            resources.push({
                clientIdentifier: device.getAttribute('clientIdentifier') || '',
                name: device.getAttribute('name') || '',
                sourceTitle: device.getAttribute('sourceTitle') || '',
                ownerId: device.getAttribute('ownerId') || '',
                owned: this._parseXmlBoolean(device.getAttribute('owned')),
                provides: provides,
                connections: connections,
            });
        }

        return resources;
    }

    private _parseXmlBoolean(value: string | null): boolean {
        if (!value) return false;
        return value === '1';
    }

    /**
     * Parse API connections into PlexConnection objects.
     */
    private _parseConnections(apiConnections: PlexApiConnection[]): PlexConnection[] {
        const connections: PlexConnection[] = [];

        for (const conn of apiConnections) {
            const normalizedUri = this._normalizeConnectionUri(conn.uri);
            if (!normalizedUri) {
                console.warn('[Discovery] Skipping invalid connection URI:', conn.uri);
                continue;
            }

            const parsed = new URL(normalizedUri);
            const protocol: 'https' | 'http' = parsed.protocol === 'https:' ? 'https' : 'http';

            connections.push({
                uri: normalizedUri,
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

    private _normalizeConnectionUri(uri: string): string | null {
        try {
            const parsed = new URL(uri);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                return null;
            }
            if (parsed.username || parsed.password) {
                return null;
            }
            if (!parsed.hostname) {
                return null;
            }
            // Normalize to origin to avoid path/query surprises and to strip trailing slashes.
            return parsed.origin;
        } catch {
            return null;
        }
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
        if (response.status === 429) {
            throw new PlexApiError(
                AppErrorCode.RATE_LIMITED,
                'Request failed with status 429',
                429,
                true
            );
        }
        if (response.status >= 500) {
            throw new PlexApiError(
                AppErrorCode.SERVER_UNREACHABLE,
                'Server error: ' + String(response.status),
                response.status,
                false
            );
        }
        throw new PlexApiError(
            AppErrorCode.SERVER_UNREACHABLE,
            'Unknown error during server discovery',
            response.status,
            true
        );
    }

    private _persistServerHealth(
        serverId: string,
        status: 'ok' | 'unreachable' | 'auth_required',
        details?: { connection?: PlexConnection; latency?: number }
    ): void {
        try {
            const raw = localStorage.getItem(PLEX_DISCOVERY_CONSTANTS.SERVER_HEALTH_KEY);
            let healthMap: Record<string, { type?: string; latencyMs?: number }> = {};
            if (raw) {
                try {
                    healthMap = JSON.parse(raw);
                } catch {
                    healthMap = {};
                }
            }
            const previous = healthMap[serverId];

            const record = {
                status,
                type: details?.connection
                    ? details.connection.relay
                        ? 'relay'
                        : details.connection.local
                            ? 'local'
                            : 'remote'
                    : previous?.type || 'unknown',
                latencyMs: typeof details?.latency === 'number'
                    ? details.latency
                    : (previous?.latencyMs || 0),
                testedAt: Date.now(),
            };

            healthMap[serverId] = record;
            localStorage.setItem(PLEX_DISCOVERY_CONSTANTS.SERVER_HEALTH_KEY, JSON.stringify(healthMap));
        } catch {
            // ignore
        }
    }

    private _redactUrl(url: string | undefined): string {
        if (!url) return '';
        try {
            const parsed = new URL(url);
            const sensitiveKeys = ['X-Plex-Token', 'token', 'access_token'];
            parsed.username = '';
            parsed.password = '';

            // Redact query parameters
            for (const key of sensitiveKeys) {
                if (parsed.searchParams.has(key)) {
                    parsed.searchParams.set(key, 'REDACTED');
                }
            }

            // Redact fragment (Plex sometimes passes tokens in hash)
            if (parsed.hash) {
                for (const key of sensitiveKeys) {
                    if (parsed.hash.includes(`${key}=`)) {
                        parsed.hash = '#REDACTED_FRAGMENT';
                        break;
                    }
                }
            }

            return parsed.toString();
        } catch {
            // Fallback for malformed URLs
            return url
                .replace(/X-Plex-Token=[^&]*/g, 'X-Plex-Token=REDACTED')
                .replace(/access_token=[^&]*/g, 'access_token=REDACTED')
                .replace(/token=[^&]*/g, 'token=REDACTED');
        }
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
