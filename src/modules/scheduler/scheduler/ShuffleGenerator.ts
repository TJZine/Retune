/**
 * @fileoverview Deterministic shuffle generator using Mulberry32 PRNG.
 * Provides reproducible shuffling for channel content ordering.
 * @module modules/scheduler/scheduler/ShuffleGenerator
 * @version 1.0.0
 */

import type { IShuffleGenerator } from './interfaces';
import { createMulberry32 } from '../../../utils/prng';

// ============================================
// ShuffleGenerator Class
// ============================================

/**
 * Deterministic shuffle generator using Mulberry32 PRNG.
 * Same seed always produces identical shuffle order.
 *
 * @implements {IShuffleGenerator}
 *
 * @example
 * ```typescript
 * const shuffler = new ShuffleGenerator();
 * const items = [1, 2, 3, 4, 5];
 * const shuffled = shuffler.shuffle(items, 12345);
 * // Same seed always produces same order
 * const shuffled2 = shuffler.shuffle(items, 12345);
 * // shuffled deep equals shuffled2
 * ```
 */
export class ShuffleGenerator implements IShuffleGenerator {
    /**
     * Shuffle an array deterministically using Fisher-Yates algorithm.
     * Same seed always produces identical order.
     *
     * @param items - Array to shuffle (not mutated)
     * @param seed - Seed for the PRNG
     * @returns New array with shuffled items
     */
    public shuffle<T>(items: T[], seed: number): T[] {
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

    /**
     * Generate shuffled indices for an array of given length.
     *
     * @param count - Number of indices to generate
     * @param seed - Seed for the PRNG
     * @returns Array of shuffled indices [0, count-1]
     */
    public shuffleIndices(count: number, seed: number): number[] {
        const indices: number[] = [];
        for (let i = 0; i < count; i++) {
            indices.push(i);
        }
        return this.shuffle(indices, seed);
    }

    /**
     * Generate a deterministic seed from channel ID and anchor time.
     * Uses a simple hash function to combine the values.
     *
     * @param channelId - Channel identifier
     * @param anchorTime - Anchor timestamp in ms
     * @returns Numeric seed for PRNG
     */
    public generateSeed(channelId: string, anchorTime: number): number {
        // Simple hash combining channelId and anchorTime
        let hash = 0;

        // Hash the channelId string
        for (let i = 0; i < channelId.length; i++) {
            const char = channelId.charCodeAt(i);
            hash = ((hash << 5) - hash + char) | 0;
        }

        // Combine with anchorTime
        // Use bitwise XOR to mix in the time value
        hash = hash ^ (anchorTime | 0);
        hash = hash ^ ((anchorTime / 0x100000000) | 0);

        // Ensure positive value
        return Math.abs(hash);
    }
}
