/**
 * @fileoverview Unit tests for StateManager.
 * @module modules/lifecycle/__tests__/StateManager.test
 */

import { StateManager } from '../StateManager';
import { PersistentState } from '../types';
import { STORAGE_CONFIG } from '../constants';

describe('StateManager', () => {
    let stateManager: StateManager;
    let mockLocalStorage: Record<string, string>;

    beforeEach(() => {
        // Mock localStorage
        mockLocalStorage = {};
        Object.defineProperty(global, 'localStorage', {
            value: {
                getItem: jest.fn((key: string) => {
                    const val = mockLocalStorage[key];
                    return val !== undefined ? val : null;
                }),
                setItem: jest.fn((key: string, value: string) => {
                    mockLocalStorage[key] = value;
                }),
                removeItem: jest.fn((key: string) => {
                    delete mockLocalStorage[key];
                }),
                clear: jest.fn(() => {
                    mockLocalStorage = {};
                }),
            },
            writable: true,
            configurable: true,
        });

        stateManager = new StateManager();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('save', () => {
        it('should save state to localStorage', async () => {
            const state = stateManager.createDefaultState();

            await stateManager.save(state);

            expect(localStorage.setItem).toHaveBeenCalledWith(
                STORAGE_CONFIG.STATE_KEY,
                expect.any(String)
            );

            const saved = JSON.parse(mockLocalStorage[STORAGE_CONFIG.STATE_KEY] as string);
            expect(saved.version).toBe(STORAGE_CONFIG.STATE_VERSION);
        });

        it('should include version number in saved state', async () => {
            const state = stateManager.createDefaultState();

            await stateManager.save(state);

            const saved = JSON.parse(mockLocalStorage[STORAGE_CONFIG.STATE_KEY] as string);
            expect(saved.version).toBe(STORAGE_CONFIG.STATE_VERSION);
            expect(saved.lastUpdated).toBeGreaterThan(0);
        });

        it('should handle quota exceeded by cleaning up', async () => {
            const state = stateManager.createDefaultState();

            // First call throws QuotaExceededError, second succeeds
            let callCount = 0;
            (localStorage.setItem as jest.Mock).mockImplementation((key: string, value: string) => {
                callCount++;
                if (callCount === 1) {
                    const error = new DOMException('Quota exceeded', 'QuotaExceededError');
                    throw error;
                }
                mockLocalStorage[key] = value;
            });

            await stateManager.save(state);

            // Should have called setItem twice (first failed, retry succeeded)
            expect(localStorage.setItem).toHaveBeenCalledTimes(2);
        });
    });

    describe('load', () => {
        it('should load and parse state from localStorage', async () => {
            const state: PersistentState = {
                version: 1,
                plexAuth: null,
                channelConfigs: [],
                currentChannelIndex: 0,
                userPreferences: { theme: 'dark', volume: 100, subtitleLanguage: null, audioLanguage: null },
                lastUpdated: Date.now(),
            };
            mockLocalStorage[STORAGE_CONFIG.STATE_KEY] = JSON.stringify(state);

            const loaded = await stateManager.load();

            expect(loaded).not.toBeNull();
            expect(loaded?.version).toBe(1);
        });

        it('should return null when no stored state', async () => {
            const loaded = await stateManager.load();
            expect(loaded).toBeNull();
        });

        it('should return null for invalid state format', async () => {
            mockLocalStorage[STORAGE_CONFIG.STATE_KEY] = '{"foo": "bar"}';

            const loaded = await stateManager.load();
            expect(loaded).toBeNull();
        });

        it('should handle missing version gracefully', async () => {
            mockLocalStorage[STORAGE_CONFIG.STATE_KEY] = '{"plexAuth": null, "lastUpdated": 123}';

            const loaded = await stateManager.load();
            expect(loaded).toBeNull();
        });

        it('should handle future version gracefully', async () => {
            const futureState = {
                version: 999,
                plexAuth: null,
                channelConfigs: [],
                currentChannelIndex: 0,
                userPreferences: { theme: 'dark', volume: 100, subtitleLanguage: null, audioLanguage: null },
                lastUpdated: Date.now(),
            };
            mockLocalStorage[STORAGE_CONFIG.STATE_KEY] = JSON.stringify(futureState);

            const loaded = await stateManager.load();

            expect(loaded).not.toBeNull();
            expect(loaded?.version).toBe(999);
        });
    });

    describe('clear', () => {
        it('should remove stored state', async () => {
            mockLocalStorage[STORAGE_CONFIG.STATE_KEY] = '{}';

            await stateManager.clear();

            expect(localStorage.removeItem).toHaveBeenCalledWith(STORAGE_CONFIG.STATE_KEY);
        });
    });

    describe('createDefaultState', () => {
        it('should create valid default state', () => {
            const state = stateManager.createDefaultState();

            expect(state.version).toBe(STORAGE_CONFIG.STATE_VERSION);
            expect(state.plexAuth).toBeNull();
            expect(state.channelConfigs).toEqual([]);
            expect(state.currentChannelIndex).toBe(0);
            expect(state.userPreferences).toBeDefined();
            expect(state.lastUpdated).toBeGreaterThan(0);
        });
    });
});
