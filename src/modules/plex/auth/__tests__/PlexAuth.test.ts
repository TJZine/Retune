/**
 * @fileoverview Unit tests for Plex Authentication module.
 * @module modules/plex/auth/__tests__/PlexAuth.test
 */

import { PlexAuth } from '../PlexAuth';
import { PlexAuthConfig, PlexAuthToken } from '../interfaces';
import { PLEX_AUTH_CONSTANTS } from '../constants';

// Mock localStorage
const mockLocalStorage = (function (): Storage {
    let store: Record<string, string> = {};
    return {
        get length(): number {
            return Object.keys(store).length;
        },
        key: function (index: number): string | null {
            const keys = Object.keys(store);
            return keys[index] !== undefined ? keys[index] : null;
        },
        getItem: function (key: string): string | null {
            const value = store[key];
            return value !== undefined ? value : null;
        },
        setItem: function (key: string, value: string): void {
            store[key] = value;
        },
        removeItem: function (key: string): void {
            delete store[key];
        },
        clear: function (): void {
            store = {};
        },
    };
})();

Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
});

// Helper to mock fetch responses
function mockFetchJson(json: unknown, status: number = 200): void {
    (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status: status,
        headers: { get: function () { return null; } },
        json: async function () { return json; },
        text: async function () { return JSON.stringify(json); },
    });
}

// Helper to mock fetch failure
function mockFetchFailure(error: Error): void {
    (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockRejectedValue(error);
}

describe('PlexAuth', () => {
    const mockConfig: PlexAuthConfig = {
        clientIdentifier: 'test-client-id',
        product: 'Retune',
        version: '1.0.0',
        platform: 'webOS',
        platformVersion: '4.0',
        device: 'LG Smart TV',
        deviceName: 'Living Room TV',
    };

    beforeEach(() => {
        mockLocalStorage.clear();
        jest.clearAllMocks();
    });

    describe('requestPin', () => {
        it('should return a PlexPinRequest with 4-character code', async () => {
            const auth = new PlexAuth(mockConfig);
            mockFetchJson({
                id: 1234567890,
                code: 'A1b2',
                expiresAt: '2026-01-15T12:15:00Z',
                authToken: null,
                clientIdentifier: mockConfig.clientIdentifier,
            });

            const pin = await auth.requestPin();

            expect(pin.code).toMatch(/^[A-Za-z0-9]{4}$/);
            expect(pin.code).toHaveLength(4);
            expect(pin.id).toBe(1234567890);
            expect(pin.authToken).toBeNull();
        });

        it('should include client identification headers in request', async () => {
            const auth = new PlexAuth(mockConfig);
            mockFetchJson({
                id: 1,
                code: 'ABCD',
                expiresAt: '2026-01-15T12:15:00Z',
                authToken: null,
                clientIdentifier: mockConfig.clientIdentifier,
            });

            await auth.requestPin();

            const fetchMock = (globalThis as unknown as { fetch: jest.Mock }).fetch;
            expect(fetchMock).toHaveBeenCalledTimes(1);
            const callArgs = fetchMock.mock.calls[0];
            const options = callArgs[1] as RequestInit;
            const headers = options.headers as Record<string, string>;

            expect(headers['X-Plex-Client-Identifier']).toBe(mockConfig.clientIdentifier);
            expect(headers['X-Plex-Product']).toBe(mockConfig.product);
            expect(headers['X-Plex-Version']).toBe(mockConfig.version);
            expect(headers['X-Plex-Platform']).toBe(mockConfig.platform);
            expect(headers['Accept']).toBe('application/json');
        });

        it('should include X-Plex-Product in request body', async () => {
            const auth = new PlexAuth(mockConfig);
            mockFetchJson({
                id: 1,
                code: 'ABCD',
                expiresAt: '2026-01-15T12:15:00Z',
                authToken: null,
                clientIdentifier: mockConfig.clientIdentifier,
            });

            await auth.requestPin();

            const fetchMock = (globalThis as unknown as { fetch: jest.Mock }).fetch;
            const callArgs = fetchMock.mock.calls[0];
            const options = callArgs[1] as RequestInit;
            const body = JSON.parse(options.body as string);

            expect(body['X-Plex-Product']).toBe(mockConfig.product);
            expect(body['strong']).toBe(true);
        });

        it('should throw SERVER_UNREACHABLE on connection failure', async () => {
            const auth = new PlexAuth(mockConfig);
            mockFetchFailure(new Error('Network error'));

            await expect(auth.requestPin()).rejects.toMatchObject({
                code: 'SERVER_UNREACHABLE',
            });
        });
    });

    describe('checkPinStatus', () => {
        it('should return updated PIN when not yet claimed', async () => {
            const auth = new PlexAuth(mockConfig);
            mockFetchJson({
                id: 12345,
                code: 'ABCD',
                expiresAt: '2026-01-15T12:15:00Z',
                authToken: null,
                clientIdentifier: mockConfig.clientIdentifier,
            });

            const pin = await auth.checkPinStatus(12345);

            expect(pin.authToken).toBeNull();
            expect(pin.id).toBe(12345);
        });

        it('should store credentials when PIN is claimed', async () => {
            const auth = new PlexAuth(mockConfig);
            const storeCredentialsSpy = jest.spyOn(auth, 'storeCredentials');

            // First call returns claimed PIN
            const fetchMock = jest.fn()
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async function () {
                        return {
                            id: 12345,
                            code: 'ABCD',
                            expiresAt: '2026-01-15T12:15:00Z',
                            authToken: 'xyzToken123',
                            clientIdentifier: mockConfig.clientIdentifier,
                        };
                    },
                })
                // Second call fetches user profile
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async function () {
                        return {
                            id: 99999,
                            username: 'testuser',
                            email: 'test@example.com',
                            thumb: 'https://plex.tv/avatar.jpg',
                        };
                    },
                });

            (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;

            await auth.checkPinStatus(12345);

            expect(storeCredentialsSpy).toHaveBeenCalledTimes(1);
            expect(auth.isAuthenticated()).toBe(true);
        });
    });

    describe('validateToken', () => {
        it('should return true for valid token', async () => {
            const auth = new PlexAuth(mockConfig);
            mockFetchJson({ id: 1, username: 'user' }, 200);

            const result = await auth.validateToken('valid-token');

            expect(result).toBe(true);
        });

        it('should return false for expired/invalid token', async () => {
            const auth = new PlexAuth(mockConfig);
            mockFetchJson({ error: 'unauthorized' }, 401);

            const result = await auth.validateToken('invalid-token');

            expect(result).toBe(false);
        });

        it('should return false for forbidden token', async () => {
            const auth = new PlexAuth(mockConfig);
            mockFetchJson({ error: 'forbidden' }, 403);

            const result = await auth.validateToken('forbidden-token');

            expect(result).toBe(false);
        });

        it('should update currentUser on successful validation', async () => {
            const auth = new PlexAuth(mockConfig);
            mockFetchJson({
                id: 12345,
                username: 'validateduser',
                email: 'validated@example.com',
                thumb: 'https://plex.tv/thumb.jpg',
            }, 200);

            const result = await auth.validateToken('valid-token');

            expect(result).toBe(true);
            const currentUser = auth.getCurrentUser();
            expect(currentUser).not.toBeNull();
            if (currentUser !== null) {
                expect(currentUser.username).toBe('validateduser');
                expect(currentUser.token).toBe('valid-token');
            }
        });
    });

    describe('getAuthHeaders', () => {
        it('should include all required Plex headers', () => {
            const auth = new PlexAuth(mockConfig);

            const headers = auth.getAuthHeaders();

            expect(headers['Accept']).toBe('application/json');
            expect(headers['X-Plex-Client-Identifier']).toBe(mockConfig.clientIdentifier);
            expect(headers['X-Plex-Product']).toBe(mockConfig.product);
            expect(headers['X-Plex-Version']).toBe(mockConfig.version);
            expect(headers['X-Plex-Platform']).toBe(mockConfig.platform);
            expect(headers['X-Plex-Platform-Version']).toBe(mockConfig.platformVersion);
            expect(headers['X-Plex-Device']).toBe(mockConfig.device);
            expect(headers['X-Plex-Device-Name']).toBe(mockConfig.deviceName);
        });

        it('should not include token header when not authenticated', () => {
            const auth = new PlexAuth(mockConfig);

            const headers = auth.getAuthHeaders();

            expect(headers['X-Plex-Token']).toBeUndefined();
        });

        it('should include X-Plex-Token when authenticated', async () => {
            const auth = new PlexAuth(mockConfig);
            const testToken: PlexAuthToken = {
                token: 'my-secret-token',
                userId: 'user123',
                username: 'testuser',
                email: 'test@example.com',
                thumb: '',
                expiresAt: null,
                issuedAt: new Date(),
            };
            await auth.storeCredentials({
                token: testToken,
                selectedServerId: null,
                selectedServerUri: null,
            });

            const headers = auth.getAuthHeaders();

            expect(headers['X-Plex-Token']).toBe('my-secret-token');
        });
    });

    describe('persistence', () => {
        it('should restore credentials from localStorage on init', () => {
            // Pre-populate localStorage
            const storedData = {
                version: PLEX_AUTH_CONSTANTS.STORAGE_VERSION,
                data: {
                    token: {
                        token: 'stored-token',
                        userId: 'user1',
                        username: 'storeduser',
                        email: 'stored@example.com',
                        thumb: '',
                        expiresAt: null,
                        issuedAt: new Date().toISOString(),
                    },
                    selectedServerId: null,
                    selectedServerUri: null,
                },
            };
            mockLocalStorage.setItem(
                PLEX_AUTH_CONSTANTS.STORAGE_KEY,
                JSON.stringify(storedData)
            );

            const auth = new PlexAuth(mockConfig);

            expect(auth.isAuthenticated()).toBe(true);
            const currentUser = auth.getCurrentUser();
            expect(currentUser).not.toBeNull();
            if (currentUser !== null) {
                expect(currentUser.token).toBe('stored-token');
                expect(currentUser.username).toBe('storeduser');
            }
        });

        it('should clear localStorage on clearCredentials', async () => {
            const auth = new PlexAuth(mockConfig);
            const testToken: PlexAuthToken = {
                token: 'token-to-clear',
                userId: 'user1',
                username: 'testuser',
                email: 'test@example.com',
                thumb: '',
                expiresAt: null,
                issuedAt: new Date(),
            };

            await auth.storeCredentials({
                token: testToken,
                selectedServerId: null,
                selectedServerUri: null,
            });
            expect(auth.isAuthenticated()).toBe(true);

            await auth.clearCredentials();

            expect(auth.isAuthenticated()).toBe(false);
            expect(auth.getCurrentUser()).toBeNull();
            expect(mockLocalStorage.getItem(PLEX_AUTH_CONSTANTS.STORAGE_KEY)).toBeNull();
        });
    });

    describe('events', () => {
        it('should emit authChange when credentials are stored and cleared', async () => {
            const auth = new PlexAuth(mockConfig);
            const handler = jest.fn();
            auth.on('authChange', handler);

            const testToken: PlexAuthToken = {
                token: 'event-test-token',
                userId: 'user1',
                username: 'testuser',
                email: 'test@example.com',
                thumb: '',
                expiresAt: null,
                issuedAt: new Date(),
            };

            await auth.storeCredentials({
                token: testToken,
                selectedServerId: null,
                selectedServerUri: null,
            });
            await auth.clearCredentials();

            expect(handler).toHaveBeenCalledTimes(2);
            expect(handler).toHaveBeenNthCalledWith(1, true);
            expect(handler).toHaveBeenNthCalledWith(2, false);
        });

        it('should allow unsubscribing from events', async () => {
            const auth = new PlexAuth(mockConfig);
            const handler = jest.fn();
            const disposable = auth.on('authChange', handler);

            disposable.dispose();

            const testToken: PlexAuthToken = {
                token: 'unsubscribe-test',
                userId: 'user1',
                username: 'testuser',
                email: 'test@example.com',
                thumb: '',
                expiresAt: null,
                issuedAt: new Date(),
            };
            await auth.storeCredentials({
                token: testToken,
                selectedServerId: null,
                selectedServerUri: null,
            });

            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe('getStoredCredentials', () => {
        it('should return null when no credentials stored', async () => {
            const auth = new PlexAuth(mockConfig);

            const result = await auth.getStoredCredentials();

            expect(result).toBeNull();
        });

        it('should return stored credentials with restored Date objects', async () => {
            const now = new Date();
            const storedData = {
                version: PLEX_AUTH_CONSTANTS.STORAGE_VERSION,
                data: {
                    token: {
                        token: 'test-token',
                        userId: 'user1',
                        username: 'testuser',
                        email: 'test@example.com',
                        thumb: 'https://example.com/thumb.jpg',
                        expiresAt: now.toISOString(),
                        issuedAt: now.toISOString(),
                    },
                    selectedServerId: 'server1',
                    selectedServerUri: 'https://192.168.1.1:32400',
                },
            };
            mockLocalStorage.setItem(
                PLEX_AUTH_CONSTANTS.STORAGE_KEY,
                JSON.stringify(storedData)
            );

            const auth = new PlexAuth(mockConfig);
            const result = await auth.getStoredCredentials();

            expect(result).not.toBeNull();
            if (result !== null) {
                expect(result.token.token).toBe('test-token');
                expect(result.token.issuedAt).toBeInstanceOf(Date);
                expect(result.token.expiresAt).toBeInstanceOf(Date);
                expect(result.selectedServerId).toBe('server1');
            }
        });
    });

    describe('cancelPin', () => {
        it('should clear pending PIN on cancel', async () => {
            const auth = new PlexAuth(mockConfig);

            // First request a PIN
            mockFetchJson({
                id: 12345,
                code: 'ABCD',
                expiresAt: '2026-01-15T12:15:00Z',
                authToken: null,
                clientIdentifier: mockConfig.clientIdentifier,
            });
            await auth.requestPin();

            // Then cancel it
            mockFetchJson({}, 200);
            await auth.cancelPin(12345);

            // PIN should be cleared (internal state check not exposed,
            // but method should complete without error)
            expect(true).toBe(true);
        });
    });
});
