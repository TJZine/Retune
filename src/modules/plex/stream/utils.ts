/**
 * @fileoverview Plex Stream Resolver utilities.
 * Helper functions for stream resolution.
 * @module modules/plex/stream/utils
 * @version 1.0.0
 */

/**
 * MIME type mapping for stream protocols.
 */
const MIME_TYPES: Record<string, string> = {
    hls: 'application/x-mpegURL',
    dash: 'application/dash+xml',
    direct: 'video/mp4',
    http: 'video/mp4',
};

// ============================================
// MIME Type Helper
// ============================================

/**
 * Get MIME type for a stream protocol.
 * Used when creating video source elements.
 *
 * @param protocol - The stream protocol (hls, dash, or direct/http)
 * @returns The appropriate MIME type string
 *
 * @example
 * ```typescript
 * const descriptor: StreamDescriptor = {
 *   url: decision.playbackUrl,
 *   protocol: decision.protocol,
 *   mimeType: getMimeType(decision.protocol),
 * };
 * ```
 */
export function getMimeType(protocol: 'hls' | 'dash' | 'direct' | 'http'): string {
    const result = MIME_TYPES[protocol];
    if (result === undefined) {
        return 'video/mp4';
    }
    return result;
}

// ============================================
// Timeout Helper
// ============================================

/**
 * Wraps an async operation with a timeout.
 * If the operation takes longer than timeoutMs, resolves with fallback.
 * The underlying operation continues but its result is ignored.
 *
 * @param operation - Promise to wrap with timeout
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @param fallback - Value to return if timeout occurs
 * @returns Promise that resolves with operation result or fallback
 *
 * @example
 * ```typescript
 * // Report progress with 100ms budget
 * await withTimeout(
 *   this.reportProgress(sessionId, itemKey, positionMs),
 *   100,
 *   undefined
 * );
 * ```
 */
export async function withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
    fallback: T
): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback), timeoutMs);
    });

    return Promise.race([
        operation.then((result) => {
            clearTimeout(timeoutId);
            return result;
        }),
        timeoutPromise,
    ]);
}

// ============================================
// UUID Generator
// ============================================

/**
 * Generate a UUID v4 for session identification.
 * Uses crypto.randomUUID if available, falls back to manual generation.
 *
 * @returns UUID v4 string
 */
export function generateUUID(): string {
    // Use native crypto.randomUUID if available (Chromium 92+)
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    // Fallback for older browsers (webOS 6.0 = Chromium 87)
    // RFC 4122 version 4 UUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

// ============================================
// Sleep Helper
// ============================================

/**
 * Sleep for a specified duration.
 *
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after the duration
 */
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// URL Builder
// ============================================

/**
 * Build a URL with query parameters.
 * Handles URL encoding properly.
 *
 * @param base - Base URL string
 * @param params - Query parameters to append
 * @returns Complete URL string
 */
export function buildUrl(base: string, params: Record<string, string>): string {
    const url = new URL(base);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return url.toString();
}
