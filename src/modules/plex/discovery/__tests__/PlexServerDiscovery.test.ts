/**
 * @fileoverview Unit tests for Plex Server Discovery module.
 * @module modules/plex/discovery/__tests__/PlexServerDiscovery.test
 */

import { PlexServerDiscovery } from '../PlexServerDiscovery';
import { PlexServerDiscoveryConfig } from '../interfaces';
import { PlexServer, PlexConnection } from '../types';
import { PLEX_DISCOVERY_CONSTANTS } from '../constants';
import { mockLocalStorage, installMockLocalStorage } from '../../../../__tests__/mocks/localStorage';

// Install mock localStorage
installMockLocalStorage();

// Mock config
const mockConfig: PlexServerDiscoveryConfig = {
    getAuthHeaders: () => ({
        'Accept': 'application/json',
        'X-Plex-Token': 'mock-token',
        'X-Plex-Client-Identifier': 'mock-client-id',
    }),
};

// Mock server data
function createMockServer(overrides: Partial<PlexServer> = {}): PlexServer {
    return {
        id: 'srv1',
        name: 'Test Server',
        sourceTitle: 'testuser',
        ownerId: 'owner1',
        owned: true,
        capabilities: ['server'],
        connections: [
            {
                uri: 'https://192.168.1.5:32400',
                protocol: 'https',
                address: '192.168.1.5',
                port: 32400,
                local: true,
                relay: false,
                latencyMs: null,
            },
        ],
        preferredConnection: null,
        ...overrides,
    };
}

function createMockConnection(overrides: Partial<PlexConnection> = {}): PlexConnection {
    return {
        uri: 'https://192.168.1.5:32400',
        protocol: 'https',
        address: '192.168.1.5',
        port: 32400,
        local: true,
        relay: false,
        latencyMs: null,
        ...overrides,
    };
}

// Helper to mock fetch responses
function mockFetchJson(json: unknown, status: number = 200): void {
    (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        headers: { get: () => null },
        json: async () => json,
        text: async () => JSON.stringify(json),
    });
}

function mockFetchFailure(error: Error): void {
    (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockRejectedValue(error);
}

describe('PlexServerDiscovery', () => {
    beforeEach(() => {
        mockLocalStorage.clear();
        jest.clearAllMocks();
        jest.useRealTimers();
        (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn();
    });

    describe('discoverServers', () => {
        it('should fetch servers from plex.tv API', async () => {
            const mockServers = [
                {
                    clientIdentifier: 'srv1',
                    name: 'Test Server',
                    sourceTitle: 'testuser',
                    ownerId: 'owner1',
                    owned: true,
                    provides: 'server',
                    connections: [
                        {
                            uri: 'https://test:32400',
                            protocol: 'https',
                            address: 'test',
                            port: 32400,
                            local: false,
                            relay: false,
                        },
                    ],
                },
            ];
            mockFetchJson(mockServers);
            const discovery = new PlexServerDiscovery(mockConfig);

            const result = await discovery.discoverServers();

            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/resources'),
                expect.objectContaining({
                    method: 'GET',
                    headers: expect.objectContaining({ 'X-Plex-Token': 'mock-token' }),
                })
            );
            expect(result).toHaveLength(1);
            expect(result[0]).toBeDefined();
            expect(result[0]!.id).toBe('srv1');
        });

        it('should parse server connections correctly', async () => {
            const mockServers = [
                {
                    clientIdentifier: 'srv1',
                    name: 'Test Server',
                    sourceTitle: 'testuser',
                    ownerId: 'owner1',
                    owned: true,
                    provides: 'server',
                    connections: [
                        {
                            uri: 'http://test:32400',
                            protocol: 'http',
                            address: 'test',
                            port: 32400,
                            local: true,
                            relay: false,
                        },
                    ],
                },
            ];
            mockFetchJson(mockServers);
            const discovery = new PlexServerDiscovery(mockConfig);

            const result = await discovery.discoverServers();

            expect(result[0]).toBeDefined();
            expect(result[0]!.connections[0]).toBeDefined();
            expect(result[0]!.connections[0]!.uri).toBe('http://test:32400');
            expect(result[0]!.connections[0]!.local).toBe(true);
        });

        it('should handle empty server list', async () => {
            mockFetchJson([]);
            const discovery = new PlexServerDiscovery(mockConfig);

            const result = await discovery.discoverServers();

            expect(result).toEqual([]);
        });

        it('should handle network errors gracefully', async () => {
            mockFetchJson({ error: 'Server Error' }, 500);
            const discovery = new PlexServerDiscovery(mockConfig);

            await expect(discovery.discoverServers()).rejects.toThrow();
        });

        it('should filter for server capability only', async () => {
            const mockResources = [
                {
                    clientIdentifier: 'srv1',
                    name: 'Server',
                    provides: 'server',
                    connections: [],
                    sourceTitle: 'user',
                    ownerId: 'owner',
                    owned: true,
                },
                {
                    clientIdentifier: 'player1',
                    name: 'Player',
                    provides: 'player',
                    connections: [],
                    sourceTitle: 'user',
                    ownerId: 'owner',
                    owned: true,
                },
            ];
            mockFetchJson(mockResources);
            const discovery = new PlexServerDiscovery(mockConfig);

            const result = await discovery.discoverServers();

            expect(result).toHaveLength(1);
            expect(result[0]!.id).toBe('srv1');
        });

        it('should return same promise for concurrent discovery calls', async () => {
            const mockServers = [
                {
                    clientIdentifier: 'srv1',
                    name: 'Test Server',
                    sourceTitle: 'testuser',
                    ownerId: 'owner1',
                    owned: true,
                    provides: 'server',
                    connections: [],
                },
            ];
            mockFetchJson(mockServers);
            const discovery = new PlexServerDiscovery(mockConfig);

            // Start two discoveries concurrently
            const promise1 = discovery.discoverServers();
            const promise2 = discovery.discoverServers();

            // Should be the exact same promise
            expect(promise1).toBe(promise2);

            const result1 = await promise1;
            const result2 = await promise2;

            // Results should be identical
            expect(result1).toBe(result2);
            // Should only have made one fetch call
            expect(fetch).toHaveBeenCalledTimes(1);
        });
    });

    describe('testConnection', () => {
        it('should return latency for working connection', async () => {
            mockFetchJson({ machineIdentifier: 'test' });
            const discovery = new PlexServerDiscovery(mockConfig);
            const mockServer = createMockServer();
            const mockConnection = createMockConnection();

            const lat = await discovery.testConnection(mockServer, mockConnection);

            expect(typeof lat).toBe('number');
            expect(lat).toBeGreaterThanOrEqual(0);
        });

        it('should return null for failed connection', async () => {
            mockFetchJson({ error: 'failed' }, 502);
            const discovery = new PlexServerDiscovery(mockConfig);
            const mockServer = createMockServer();
            const mockConnection = createMockConnection();

            const lat = await discovery.testConnection(mockServer, mockConnection);

            expect(lat).toBeNull();
        });

        it('should timeout after the configured timeout', async () => {
            jest.useFakeTimers();
            try {
                // Mock fetch that never resolves until aborted
                (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation((_url: string, options: RequestInit) => {
                    return new Promise((_resolve, reject) => {
                        if (options.signal) {
                            options.signal.addEventListener('abort', () => {
                                reject(new DOMException('The operation was aborted', 'AbortError'));
                            });
                        }
                    });
                });

                const discovery = new PlexServerDiscovery(mockConfig);
                const mockServer = createMockServer();
                const mockConnection = createMockConnection();

                const promise = discovery.testConnection(mockServer, mockConnection);

                // Advance timers past the configured timeout
                await jest.advanceTimersByTimeAsync(PLEX_DISCOVERY_CONSTANTS.CONNECTION_TEST_TIMEOUT_MS + 100);

                const lat = await promise;

                // AbortController should have aborted the request
                expect(lat).toBeNull();
            } finally {
                jest.useRealTimers();
            }
        });

        it('should call identity endpoint', async () => {
            mockFetchJson({ machineIdentifier: 'test' });
            const discovery = new PlexServerDiscovery(mockConfig);
            const mockServer = createMockServer();
            const mockConnection = createMockConnection({ uri: 'https://myserver:32400' });

            await discovery.testConnection(mockServer, mockConnection);

            expect(fetch).toHaveBeenCalledWith(
                'https://myserver:32400/identity',
                expect.any(Object)
            );
        });
    });

    describe('findFastestConnection', () => {
        it('should prefer local over remote connections', async () => {
            const fetchMock = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ machineIdentifier: 'test' }),
            });
            (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;

            const discovery = new PlexServerDiscovery(mockConfig);
            const mockServer = createMockServer({
                connections: [
                    createMockConnection({ uri: 'https://remote:32400', local: false }),
                    createMockConnection({ uri: 'https://local:32400', local: true }),
                ],
            });

            const conn = await discovery.findFastestConnection(mockServer);

            expect(conn).not.toBeNull();
            expect(conn!.uri).toBe('https://local:32400');
        });

        it('should prefer remote over relay connections', async () => {
            const fetchMock = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ machineIdentifier: 'test' }),
            });
            (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;

            const discovery = new PlexServerDiscovery(mockConfig);
            const mockServer = createMockServer({
                connections: [
                    createMockConnection({ uri: 'https://relay:32400', relay: true, local: false }),
                    createMockConnection({ uri: 'https://remote:32400', relay: false, local: false }),
                ],
            });

            const conn = await discovery.findFastestConnection(mockServer);

            expect(conn).not.toBeNull();
            expect(conn!.uri).toBe('https://remote:32400');
        });

        it('should fall back to relay when others fail', async () => {
            const fetchMock = jest.fn().mockImplementation((url: string) => {
                if (url.includes('local')) {
                    return Promise.reject(new Error('Connection failed'));
                }
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: async () => ({ machineIdentifier: 'test' }),
                });
            });
            (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;

            const discovery = new PlexServerDiscovery(mockConfig);
            const mockServer = createMockServer({
                connections: [
                    createMockConnection({ uri: 'https://local:32400', local: true, relay: false }),
                    createMockConnection({ uri: 'https://relay:32400', local: false, relay: true }),
                ],
            });

            const conn = await discovery.findFastestConnection(mockServer);

            expect(conn).not.toBeNull();
            expect(conn!.uri).toBe('https://relay:32400');
        });

        it('should return null when all connections fail', async () => {
            mockFetchFailure(new Error('Connection failed'));
            const discovery = new PlexServerDiscovery(mockConfig);
            const mockServer = createMockServer({
                connections: [
                    createMockConnection({ uri: 'https://a:32400' }),
                    createMockConnection({ uri: 'https://b:32400' }),
                ],
            });

            const conn = await discovery.findFastestConnection(mockServer);

            expect(conn).toBeNull();
        });
    });

    describe('selectServer', () => {
        it('should persist selection to localStorage', async () => {
            // First, mock discoverServers
            const mockServers = [
                {
                    clientIdentifier: 'srv1',
                    name: 'Test Server',
                    sourceTitle: 'testuser',
                    ownerId: 'owner1',
                    owned: true,
                    provides: 'server',
                    connections: [
                        {
                            uri: 'https://test:32400',
                            protocol: 'https',
                            address: 'test',
                            port: 32400,
                            local: true,
                            relay: false,
                        },
                    ],
                },
            ];

            const fetchMock = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => mockServers,
            });
            (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;

            const discovery = new PlexServerDiscovery(mockConfig);
            await discovery.discoverServers();

            // Now mock connection test
            fetchMock.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ machineIdentifier: 'srv1' }),
            });

            await discovery.selectServer('srv1');

            expect(mockLocalStorage.getItem(PLEX_DISCOVERY_CONSTANTS.SELECTED_SERVER_KEY)).toBe('srv1');
        });

        it('should emit serverChange event', async () => {
            const mockServers = [
                {
                    clientIdentifier: 'srv1',
                    name: 'Test Server',
                    sourceTitle: 'testuser',
                    ownerId: 'owner1',
                    owned: true,
                    provides: 'server',
                    connections: [
                        {
                            uri: 'https://test:32400',
                            protocol: 'https',
                            address: 'test',
                            port: 32400,
                            local: true,
                            relay: false,
                        },
                    ],
                },
            ];

            (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => mockServers,
            });

            const discovery = new PlexServerDiscovery(mockConfig);
            await discovery.discoverServers();

            // Now mock connection test
            (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ machineIdentifier: 'srv1' }),
            });

            const handler = jest.fn();
            discovery.on('serverChange', handler);

            await discovery.selectServer('srv1');

            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 'srv1' }));
        });

        it('should emit connectionChange event', async () => {
            const mockServers = [
                {
                    clientIdentifier: 'srv1',
                    name: 'Test Server',
                    sourceTitle: 'testuser',
                    ownerId: 'owner1',
                    owned: true,
                    provides: 'server',
                    connections: [
                        {
                            uri: 'https://test:32400',
                            protocol: 'https',
                            address: 'test',
                            port: 32400,
                            local: true,
                            relay: false,
                        },
                    ],
                },
            ];

            (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => mockServers,
            });

            const discovery = new PlexServerDiscovery(mockConfig);
            await discovery.discoverServers();

            // Now mock connection test
            (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ machineIdentifier: 'srv1' }),
            });

            const handler = jest.fn();
            discovery.on('connectionChange', handler);

            await discovery.selectServer('srv1');

            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledWith(expect.any(String));
        });

        it('should return false for unknown server ID', async () => {
            mockFetchJson([]);
            const discovery = new PlexServerDiscovery(mockConfig);
            await discovery.discoverServers();

            const result = await discovery.selectServer('unknown');

            expect(result).toBe(false);
        });
    });

    describe('initialization', () => {
        it('should restore selected server from localStorage', async () => {
            mockLocalStorage.setItem(PLEX_DISCOVERY_CONSTANTS.SELECTED_SERVER_KEY, 'srv1');

            const mockServers = [
                {
                    clientIdentifier: 'srv1',
                    name: 'Test Server',
                    sourceTitle: 'testuser',
                    ownerId: 'owner1',
                    owned: true,
                    provides: 'server',
                    connections: [
                        {
                            uri: 'https://test:32400',
                            protocol: 'https',
                            address: 'test',
                            port: 32400,
                            local: true,
                            relay: false,
                        },
                    ],
                },
            ];

            (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => mockServers,
            });

            const discovery = new PlexServerDiscovery(mockConfig);
            await discovery.initialize();

            const selectedServer = discovery.getSelectedServer();
            expect(selectedServer).not.toBeNull();
            expect(selectedServer!.id).toBe('srv1');
        });

        it('should re-test connection on restore', async () => {
            mockLocalStorage.setItem(PLEX_DISCOVERY_CONSTANTS.SELECTED_SERVER_KEY, 'srv1');

            const mockServers = [
                {
                    clientIdentifier: 'srv1',
                    name: 'Test Server',
                    sourceTitle: 'testuser',
                    ownerId: 'owner1',
                    owned: true,
                    provides: 'server',
                    connections: [
                        {
                            uri: 'https://test:32400',
                            protocol: 'https',
                            address: 'test',
                            port: 32400,
                            local: true,
                            relay: false,
                        },
                    ],
                },
            ];

            const fetchMock = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => mockServers,
            });
            (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;

            const discovery = new PlexServerDiscovery(mockConfig);
            const testSpy = jest.spyOn(discovery, 'testConnection');

            await discovery.initialize();

            expect(testSpy).toHaveBeenCalled();
        });
    });

    describe('state methods', () => {
        it('isConnected returns false when no server selected', () => {
            const discovery = new PlexServerDiscovery(mockConfig);

            expect(discovery.isConnected()).toBe(false);
        });

        it('isConnected returns true when server is selected', async () => {
            const mockServers = [
                {
                    clientIdentifier: 'srv1',
                    name: 'Test Server',
                    sourceTitle: 'testuser',
                    ownerId: 'owner1',
                    owned: true,
                    provides: 'server',
                    connections: [
                        {
                            uri: 'https://test:32400',
                            protocol: 'https',
                            address: 'test',
                            port: 32400,
                            local: true,
                            relay: false,
                        },
                    ],
                },
            ];

            (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => mockServers,
            });

            const discovery = new PlexServerDiscovery(mockConfig);
            await discovery.discoverServers();

            (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ machineIdentifier: 'srv1' }),
            });

            await discovery.selectServer('srv1');

            expect(discovery.isConnected()).toBe(true);
        });

        it('getServerUri returns null when no connection', () => {
            const discovery = new PlexServerDiscovery(mockConfig);

            expect(discovery.getServerUri()).toBeNull();
        });

        it('getServerUri returns URI when connected', async () => {
            const mockServers = [
                {
                    clientIdentifier: 'srv1',
                    name: 'Test Server',
                    sourceTitle: 'testuser',
                    ownerId: 'owner1',
                    owned: true,
                    provides: 'server',
                    connections: [
                        {
                            uri: 'https://test:32400',
                            protocol: 'https',
                            address: 'test',
                            port: 32400,
                            local: true,
                            relay: false,
                        },
                    ],
                },
            ];

            (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => mockServers,
            });

            const discovery = new PlexServerDiscovery(mockConfig);
            await discovery.discoverServers();

            (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ machineIdentifier: 'srv1' }),
            });

            await discovery.selectServer('srv1');

            expect(discovery.getServerUri()).toBe('https://test:32400');
        });
    });

    describe('mixed content fallback', () => {
        it('getHttpsConnection returns HTTPS connection when available', async () => {
            const mockServers = [
                {
                    clientIdentifier: 'srv1',
                    name: 'Test Server',
                    sourceTitle: 'testuser',
                    ownerId: 'owner1',
                    owned: true,
                    provides: 'server',
                    connections: [
                        {
                            uri: 'http://local:32400',
                            protocol: 'http',
                            address: 'local',
                            port: 32400,
                            local: true,
                            relay: false,
                        },
                        {
                            uri: 'https://secure:32400',
                            protocol: 'https',
                            address: 'secure',
                            port: 32400,
                            local: false,
                            relay: false,
                        },
                    ],
                },
            ];

            (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => mockServers,
            });

            const discovery = new PlexServerDiscovery(mockConfig);
            await discovery.discoverServers();

            (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ machineIdentifier: 'srv1' }),
            });

            await discovery.selectServer('srv1');

            const httpsConn = discovery.getHttpsConnection();
            expect(httpsConn).not.toBeNull();
            expect(httpsConn!.protocol).toBe('https');
        });

        it('getRelayConnection returns relay connection when available', async () => {
            const mockServers = [
                {
                    clientIdentifier: 'srv1',
                    name: 'Test Server',
                    sourceTitle: 'testuser',
                    ownerId: 'owner1',
                    owned: true,
                    provides: 'server',
                    connections: [
                        {
                            uri: 'https://local:32400',
                            protocol: 'https',
                            address: 'local',
                            port: 32400,
                            local: true,
                            relay: false,
                        },
                        {
                            uri: 'https://relay.plex.direct:32400',
                            protocol: 'https',
                            address: 'relay.plex.direct',
                            port: 32400,
                            local: false,
                            relay: true,
                        },
                    ],
                },
            ];

            (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => mockServers,
            });

            const discovery = new PlexServerDiscovery(mockConfig);
            await discovery.discoverServers();

            (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ machineIdentifier: 'srv1' }),
            });

            await discovery.selectServer('srv1');

            const relayConn = discovery.getRelayConnection();
            expect(relayConn).not.toBeNull();
            expect(relayConn!.relay).toBe(true);
        });

        it('getActiveConnectionUri is alias for getServerUri', async () => {
            const mockServers = [
                {
                    clientIdentifier: 'srv1',
                    name: 'Test Server',
                    sourceTitle: 'testuser',
                    ownerId: 'owner1',
                    owned: true,
                    provides: 'server',
                    connections: [
                        {
                            uri: 'https://test:32400',
                            protocol: 'https',
                            address: 'test',
                            port: 32400,
                            local: true,
                            relay: false,
                        },
                    ],
                },
            ];

            (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => mockServers,
            });

            const discovery = new PlexServerDiscovery(mockConfig);
            await discovery.discoverServers();

            (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ machineIdentifier: 'srv1' }),
            });

            await discovery.selectServer('srv1');

            expect(discovery.getActiveConnectionUri()).toBe(discovery.getServerUri());
        });
    });

    // ============================================
    // DISC-001: URI Sanitization Tests
    // ============================================

    describe('connection URI sanitization', () => {
        it('should reject file:// URIs', async () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
            const mockServers = [
                {
                    clientIdentifier: 'srv1',
                    name: 'Test Server',
                    sourceTitle: 'testuser',
                    ownerId: 'owner1',
                    owned: true,
                    provides: 'server',
                    connections: [
                        {
                            uri: 'file:///etc/passwd',
                            protocol: 'file',
                            address: 'localhost',
                            port: 0,
                            local: true,
                            relay: false,
                        },
                        {
                            uri: 'https://valid:32400',
                            protocol: 'https',
                            address: 'valid',
                            port: 32400,
                            local: true,
                            relay: false,
                        },
                    ],
                },
            ];
            mockFetchJson(mockServers);
            const discovery = new PlexServerDiscovery(mockConfig);

            const result = await discovery.discoverServers();

            // file:// connection should be filtered out
            const server = result[0];
            expect(server).toBeDefined();
            if (!server) {
                throw new Error('Expected server to be defined');
            }
            expect(server.connections).toHaveLength(1);
            expect(server.connections[0]?.uri).toBe('https://valid:32400');
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                '[Discovery] Skipping invalid connection URI:',
                'file:///etc/passwd'
            );
            consoleWarnSpy.mockRestore();
        });

        it('should reject URIs with embedded credentials', async () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
            const mockServers = [
                {
                    clientIdentifier: 'srv1',
                    name: 'Test Server',
                    sourceTitle: 'testuser',
                    ownerId: 'owner1',
                    owned: true,
                    provides: 'server',
                    connections: [
                        {
                            uri: 'https://user:pass@server:32400',
                            protocol: 'https',
                            address: 'server',
                            port: 32400,
                            local: false,
                            relay: false,
                        },
                        {
                            uri: 'https://clean:32400',
                            protocol: 'https',
                            address: 'clean',
                            port: 32400,
                            local: true,
                            relay: false,
                        },
                    ],
                },
            ];
            mockFetchJson(mockServers);
            const discovery = new PlexServerDiscovery(mockConfig);

            const result = await discovery.discoverServers();

            // Credentialed URI should be filtered out
            const server = result[0];
            expect(server).toBeDefined();
            if (!server) {
                throw new Error('Expected server to be defined');
            }
            expect(server.connections).toHaveLength(1);
            expect(server.connections[0]?.uri).toBe('https://clean:32400');
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                '[Discovery] Skipping invalid connection URI:',
                'https://user:pass@server:32400'
            );
            consoleWarnSpy.mockRestore();
        });

        it('should reject non-standard protocol schemes', async () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
            const mockServers = [
                {
                    clientIdentifier: 'srv1',
                    name: 'Test Server',
                    sourceTitle: 'testuser',
                    ownerId: 'owner1',
                    owned: true,
                    provides: 'server',
                    connections: [
                        {
                            uri: 'ftp://server:21',
                            protocol: 'ftp',
                            address: 'server',
                            port: 21,
                            local: false,
                            relay: false,
                        },
                        {
                            uri: 'javascript:alert(1)',
                            protocol: 'javascript',
                            address: '',
                            port: 0,
                            local: false,
                            relay: false,
                        },
                        {
                            uri: 'http://valid:32400',
                            protocol: 'http',
                            address: 'valid',
                            port: 32400,
                            local: true,
                            relay: false,
                        },
                    ],
                },
            ];
            mockFetchJson(mockServers);
            const discovery = new PlexServerDiscovery(mockConfig);

            const result = await discovery.discoverServers();

            // Only http:// connection should remain
            const server = result[0];
            expect(server).toBeDefined();
            if (!server) {
                throw new Error('Expected server to be defined');
            }
            expect(server.connections).toHaveLength(1);
            expect(server.connections[0]?.protocol).toBe('http');
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                '[Discovery] Skipping invalid connection URI:',
                'ftp://server:21'
            );
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                '[Discovery] Skipping invalid connection URI:',
                'javascript:alert(1)'
            );
            consoleWarnSpy.mockRestore();
        });

        it('should reject data: URIs', async () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
            const mockServers = [
                {
                    clientIdentifier: 'srv1',
                    name: 'Test Server',
                    sourceTitle: 'testuser',
                    ownerId: 'owner1',
                    owned: true,
                    provides: 'server',
                    connections: [
                        {
                            uri: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
                            protocol: 'data',
                            address: '',
                            port: 0,
                            local: false,
                            relay: false,
                        },
                        {
                            uri: 'https://valid:32400',
                            protocol: 'https',
                            address: 'valid',
                            port: 32400,
                            local: true,
                            relay: false,
                        },
                    ],
                },
            ];
            mockFetchJson(mockServers);
            const discovery = new PlexServerDiscovery(mockConfig);

            const result = await discovery.discoverServers();

            const server = result[0];
            expect(server).toBeDefined();
            if (!server) {
                throw new Error('Expected server to be defined');
            }
            expect(server.connections).toHaveLength(1);
            expect(server.connections[0]?.uri).toBe('https://valid:32400');
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                '[Discovery] Skipping invalid connection URI:',
                'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='
            );
            consoleWarnSpy.mockRestore();
        });

        it('should normalize URIs to origin (strip paths and query strings)', async () => {
            const mockServers = [
                {
                    clientIdentifier: 'srv1',
                    name: 'Test Server',
                    sourceTitle: 'testuser',
                    ownerId: 'owner1',
                    owned: true,
                    provides: 'server',
                    connections: [
                        {
                            uri: 'https://server:32400/some/path?query=value',
                            protocol: 'https',
                            address: 'server',
                            port: 32400,
                            local: false,
                            relay: false,
                        },
                    ],
                },
            ];
            mockFetchJson(mockServers);
            const discovery = new PlexServerDiscovery(mockConfig);

            const result = await discovery.discoverServers();

            // URI should be normalized to origin only
            const server = result[0];
            expect(server).toBeDefined();
            if (!server) {
                throw new Error('Expected server to be defined');
            }
            expect(server.connections[0]?.uri).toBe('https://server:32400');
        });

        it('should handle malformed URIs gracefully', async () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
            const mockServers = [
                {
                    clientIdentifier: 'srv1',
                    name: 'Test Server',
                    sourceTitle: 'testuser',
                    ownerId: 'owner1',
                    owned: true,
                    provides: 'server',
                    connections: [
                        {
                            uri: 'not-a-valid-uri',
                            protocol: 'unknown',
                            address: '',
                            port: 0,
                            local: false,
                            relay: false,
                        },
                        {
                            uri: '://missing-protocol',
                            protocol: 'unknown',
                            address: '',
                            port: 0,
                            local: false,
                            relay: false,
                        },
                        {
                            uri: 'https://valid:32400',
                            protocol: 'https',
                            address: 'valid',
                            port: 32400,
                            local: true,
                            relay: false,
                        },
                    ],
                },
            ];
            mockFetchJson(mockServers);
            const discovery = new PlexServerDiscovery(mockConfig);

            const result = await discovery.discoverServers();

            // Only valid URI should remain
            const server = result[0];
            expect(server).toBeDefined();
            if (!server) {
                throw new Error('Expected server to be defined');
            }
            expect(server.connections).toHaveLength(1);
            expect(server.connections[0]?.uri).toBe('https://valid:32400');
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                '[Discovery] Skipping invalid connection URI:',
                'not-a-valid-uri'
            );
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                '[Discovery] Skipping invalid connection URI:',
                '://missing-protocol'
            );
            consoleWarnSpy.mockRestore();
        });
    });

    // ============================================
    // DISC-002: Rate Limit Backoff Tests
    // ============================================

    describe('rate limit handling', () => {
        it('should retry after 429 with Retry-After header', async () => {
            jest.useFakeTimers();
            try {
                const mockServers = [
                    {
                        clientIdentifier: 'srv1',
                        name: 'Test Server',
                        provides: 'server',
                        connections: [],
                        sourceTitle: 'user',
                        ownerId: 'owner',
                        owned: true,
                    },
                ];

                let callCount = 0;
                (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(() => {
                    callCount++;
                    if (callCount === 1) {
                        // First call returns 429 with Retry-After: 3 seconds
                        return Promise.resolve({
                            ok: false,
                            status: 429,
                            headers: { get: (name: string) => name === 'Retry-After' ? '3' : null },
                            json: async () => ({ error: 'rate limited' }),
                        });
                    }
                    // Second call succeeds
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        headers: { get: () => null },
                        json: async () => mockServers,
                    });
                });

                const discovery = new PlexServerDiscovery(mockConfig);
                const discoverPromise = discovery.discoverServers();

                // Advance past the 3-second delay from Retry-After header
                await jest.advanceTimersByTimeAsync(3000);

                const result = await discoverPromise;

                expect(callCount).toBe(2);
                expect(result).toHaveLength(1);
            } finally {
                jest.useRealTimers();
            }
        });

        it('should use default delay when Retry-After is missing', async () => {
            jest.useFakeTimers();
            try {
                const mockServers = [
                    {
                        clientIdentifier: 'srv1',
                        name: 'Test Server',
                        provides: 'server',
                        connections: [],
                        sourceTitle: 'user',
                        ownerId: 'owner',
                        owned: true,
                    },
                ];

                let callCount = 0;
                (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(() => {
                    callCount++;
                    if (callCount === 1) {
                        // First call returns 429 without Retry-After
                        return Promise.resolve({
                            ok: false,
                            status: 429,
                            headers: { get: () => null },
                            json: async () => ({ error: 'rate limited' }),
                        });
                    }
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        headers: { get: () => null },
                        json: async () => mockServers,
                    });
                });

                const discovery = new PlexServerDiscovery(mockConfig);
                const discoverPromise = discovery.discoverServers();

                // Advance past the 2-second default delay
                await jest.advanceTimersByTimeAsync(2000);

                const result = await discoverPromise;

                expect(callCount).toBe(2);
                expect(result).toHaveLength(1);
            } finally {
                jest.useRealTimers();
            }
        });

        it('should fail after max retries on persistent 429', async () => {
            jest.useFakeTimers();
            try {
                let callCount = 0;
                (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(() => {
                    callCount++;
                    return Promise.resolve({
                        ok: false,
                        status: 429,
                        headers: { get: () => null },
                        json: async () => ({ error: 'rate limited' }),
                    });
                });

                const discovery = new PlexServerDiscovery(mockConfig);

                let caughtError: Error | null = null;
                const discoverPromise = discovery.discoverServers().catch((e: Error) => {
                    caughtError = e;
                });

                // Advance past retry delay to allow both attempts
                await jest.advanceTimersByTimeAsync(2000);
                await discoverPromise;

                // Should throw after max attempts (2 attempts per code)
                expect(caughtError).not.toBeNull();
                expect(caughtError!.message).toContain('Request failed with status 429');
                // Verify it tried twice (maxAttempts = 2)
                expect(callCount).toBe(2);
            } finally {
                jest.useRealTimers();
            }
        });
    });
});
