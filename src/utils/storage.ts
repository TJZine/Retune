/**
 * @fileoverview Safe localStorage helpers.
 * @module utils/storage
 * @version 1.0.0
 *
 * webOS/Chromium and some privacy modes can throw on localStorage access.
 * These helpers treat storage as optional and never throw.
 */

export function safeLocalStorageGet(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function safeLocalStorageSet(key: string, value: string): boolean {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

export function safeLocalStorageRemove(key: string): boolean {
    try {
        localStorage.removeItem(key);
        return true;
    } catch {
        return false;
    }
}

/**
 * Clear only Retune-owned keys (prefix-based).
 * Does not call localStorage.clear() to avoid clobbering unrelated app data.
 */
export function safeClearRetuneStorage(): void {
    try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (typeof k === 'string' && k.startsWith('retune_')) {
                keysToRemove.push(k);
            }
        }
        for (const k of keysToRemove) {
            localStorage.removeItem(k);
        }
    } catch {
        // Ignore storage failures (storage may be blocked)
    }
}

