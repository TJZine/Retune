/**
 * @fileoverview Shared localStorage mock for unit tests.
 * @module __tests__/mocks/localStorage
 */

/**
 * Creates a mock localStorage instance for testing.
 * @returns Storage-compatible mock object
 */
export function createMockLocalStorage(): Storage {
    let store: Record<string, string> = {};
    return {
        get length(): number {
            return Object.keys(store).length;
        },
        key(index: number): string | null {
            const keys = Object.keys(store);
            return index < keys.length ? keys[index]! : null;
        },
        getItem(key: string): string | null {
            const value = store[key];
            return value !== undefined ? value : null;
        },
        setItem(key: string, value: string): void {
            store[key] = value;
        },
        removeItem(key: string): void {
            delete store[key];
        },
        clear(): void {
            store = {};
        },
    };
}

/**
 * Pre-configured mock localStorage singleton for test files.
 */
export const mockLocalStorage = createMockLocalStorage();

/**
 * Installs the mock localStorage on globalThis.
 * Call this in beforeAll or at file top-level.
 */
export function installMockLocalStorage(): void {
    Object.defineProperty(globalThis, 'localStorage', {
        value: mockLocalStorage,
        writable: true,
        configurable: true,
    });
}
