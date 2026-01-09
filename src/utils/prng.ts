/**
 * @fileoverview Shared PRNG utilities for deterministic operations.
 * @module utils/prng
 * @version 1.0.0
 */

// ============================================
// Mulberry32 PRNG
// ============================================

/**
 * Create a Mulberry32 PRNG function.
 * Mulberry32 is a fast, high-quality 32-bit PRNG.
 *
 * @param seed - Initial seed value
 * @returns A function that returns the next random number [0, 1)
 * @see https://github.com/bryc/code/blob/master/jshash/PRNGs.md
 */
export function createMulberry32(seed: number): () => number {
    let state = seed;
    return function (): number {
        let t = (state += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ============================================
// Fisher-Yates Shuffle
// ============================================

/**
 * Fisher-Yates shuffle with seeded PRNG.
 * Same seed always produces identical order.
 *
 * @param items - Array to shuffle (not mutated)
 * @param seed - Seed for the PRNG
 * @returns New array with shuffled items
 */
export function shuffleWithSeed<T>(items: T[], seed: number): T[] {
    if (!Number.isFinite(seed)) {
        throw new Error('Seed must be a finite number');
    }

    if (items.length <= 1) {
        return [...items];
    }

    const result = [...items];
    const random = createMulberry32(seed);

    // Fisher-Yates shuffle
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        const temp = result[i];
        result[i] = result[j] as T;
        result[j] = temp as T;
    }

    return result;
}
