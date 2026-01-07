/**
 * @fileoverview Tests for ShuffleGenerator.
 * @module modules/scheduler/scheduler/__tests__/ShuffleGenerator.test
 */

import { ShuffleGenerator } from '../ShuffleGenerator';

describe('ShuffleGenerator', () => {
    let shuffler: ShuffleGenerator;

    beforeEach(() => {
        shuffler = new ShuffleGenerator();
    });

    describe('shuffle', () => {
        it('should produce same order with same seed', () => {
            const items = [1, 2, 3, 4, 5];
            const result1 = shuffler.shuffle(items, 12345);
            const result2 = shuffler.shuffle(items, 12345);
            expect(result1).toEqual(result2);
        });

        it('should produce different order with different seed', () => {
            const items = [1, 2, 3, 4, 5];
            const result1 = shuffler.shuffle(items, 12345);
            const result2 = shuffler.shuffle(items, 54321);
            expect(result1).not.toEqual(result2);
        });

        it('should not mutate original array', () => {
            const items = [1, 2, 3, 4, 5];
            const original = [...items];
            shuffler.shuffle(items, 12345);
            expect(items).toEqual(original);
        });

        it('should return copy for single item array', () => {
            const items = [42];
            const result = shuffler.shuffle(items, 12345);
            expect(result).toEqual([42]);
            expect(result).not.toBe(items);
        });

        it('should return copy for empty array', () => {
            const items: number[] = [];
            const result = shuffler.shuffle(items, 12345);
            expect(result).toEqual([]);
            expect(result).not.toBe(items);
        });

        it('should contain all original items', () => {
            const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const result = shuffler.shuffle(items, 42);
            expect([...result].sort()).toEqual([...items].sort());
        });

        it('should work with string arrays', () => {
            const items = ['a', 'b', 'c', 'd', 'e'];
            const result1 = shuffler.shuffle(items, 999);
            const result2 = shuffler.shuffle(items, 999);
            expect(result1).toEqual(result2);
        });

        it('should work with object arrays', () => {
            const items = [
                { id: 1, name: 'a' },
                { id: 2, name: 'b' },
                { id: 3, name: 'c' },
            ];
            const result1 = shuffler.shuffle(items, 777);
            const result2 = shuffler.shuffle(items, 777);
            expect(result1).toEqual(result2);
        });
    });

    describe('shuffleIndices', () => {
        it('should return indices [0, count-1]', () => {
            const result = shuffler.shuffleIndices(5, 12345);
            expect(result.sort()).toEqual([0, 1, 2, 3, 4]);
        });

        it('should be deterministic', () => {
            const result1 = shuffler.shuffleIndices(10, 42);
            const result2 = shuffler.shuffleIndices(10, 42);
            expect(result1).toEqual(result2);
        });

        it('should return empty array for count 0', () => {
            const result = shuffler.shuffleIndices(0, 12345);
            expect(result).toEqual([]);
        });
    });

    describe('generateSeed', () => {
        it('should be deterministic for same inputs', () => {
            const seed1 = shuffler.generateSeed('channel-1', 1000000);
            const seed2 = shuffler.generateSeed('channel-1', 1000000);
            expect(seed1).toBe(seed2);
        });

        it('should produce different seeds for different channel IDs', () => {
            const seed1 = shuffler.generateSeed('channel-1', 1000000);
            const seed2 = shuffler.generateSeed('channel-2', 1000000);
            expect(seed1).not.toBe(seed2);
        });

        it('should produce different seeds for different anchor times', () => {
            const seed1 = shuffler.generateSeed('channel-1', 1000000);
            const seed2 = shuffler.generateSeed('channel-1', 2000000);
            expect(seed1).not.toBe(seed2);
        });

        it('should return positive number', () => {
            const seed = shuffler.generateSeed('test', 12345);
            expect(seed).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Mulberry32 PRNG quality', () => {
        it('should shuffle items beyond initial positions', () => {
            // Basic quality check - items should move significantly
            const items = Array.from({ length: 100 }, (_, i) => i);
            const result = shuffler.shuffle(items, 42);

            // First 10 items should not all be from first 10 original
            const first10 = result.slice(0, 10);
            const hasHighIndexInFirst10 = first10.some((v) => v > 50);
            expect(hasHighIndexInFirst10).toBe(true);
        });

        it('should produce consistent output across invocations', () => {
            const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const seed = 42;
            const results = Array.from({ length: 5 }, () => shuffler.shuffle(items, seed));
            results.forEach((r) => expect(r).toEqual(results[0]));
        });
    });
});
