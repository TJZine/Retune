/**
 * @fileoverview Tests for ScheduleCalculator.
 * @module modules/scheduler/scheduler/__tests__/ScheduleCalculator.test
 */

import {
    buildScheduleIndex,
    binarySearchForItem,
    calculateProgramAtTime,
    calculateNextProgram,
    calculatePreviousProgram,
    applyPlaybackMode,
    generateScheduleWindow,
} from '../ScheduleCalculator';
import { ShuffleGenerator } from '../ShuffleGenerator';
import type { ScheduleConfig, ResolvedContentItem } from '../types';
import { SCHEDULER_ERROR_MESSAGES } from '../constants';

describe('ScheduleCalculator', () => {
    let shuffler: ShuffleGenerator;

    // Test content: 3 items of varying duration
    const testContent: ResolvedContentItem[] = [
        {
            ratingKey: 'item-a',
            type: 'movie',
            title: 'Item A',
            fullTitle: 'Item A (2020)',
            durationMs: 30 * 60 * 1000, // 30 minutes
            thumb: null,
            year: 2020,
            scheduledIndex: 0,
        },
        {
            ratingKey: 'item-b',
            type: 'movie',
            title: 'Item B',
            fullTitle: 'Item B (2021)',
            durationMs: 20 * 60 * 1000, // 20 minutes
            thumb: null,
            year: 2021,
            scheduledIndex: 1,
        },
        {
            ratingKey: 'item-c',
            type: 'episode',
            title: 'Item C',
            fullTitle: 'Show - S01E01 - Item C',
            durationMs: 40 * 60 * 1000, // 40 minutes
            thumb: null,
            year: 2022,
            seasonNumber: 1,
            episodeNumber: 1,
            scheduledIndex: 2,
        },
    ];

    const TOTAL_DURATION_MS = 90 * 60 * 1000; // 90 minutes

    beforeEach(() => {
        shuffler = new ShuffleGenerator();
    });

    describe('buildScheduleIndex', () => {
        it('should build index with correct total duration', () => {
            const config: ScheduleConfig = {
                channelId: 'test-channel',
                anchorTime: 0,
                content: testContent,
                playbackMode: 'sequential',
                shuffleSeed: 12345,
                loopSchedule: true,
            };

            const index = buildScheduleIndex(config, shuffler);

            expect(index.channelId).toBe('test-channel');
            expect(index.totalLoopDurationMs).toBe(TOTAL_DURATION_MS);
            expect(index.orderedItems).toHaveLength(3);
        });

        it('should compute correct cumulative offsets', () => {
            const config: ScheduleConfig = {
                channelId: 'test-channel',
                anchorTime: 0,
                content: testContent,
                playbackMode: 'sequential',
                shuffleSeed: 12345,
                loopSchedule: true,
            };

            const index = buildScheduleIndex(config, shuffler);

            expect(index.itemStartOffsets).toEqual([
                0,
                30 * 60 * 1000, // After item A
                50 * 60 * 1000, // After item A + B
            ]);
        });

        it('should throw for empty content', () => {
            const config: ScheduleConfig = {
                channelId: 'test-channel',
                anchorTime: 0,
                content: [],
                playbackMode: 'sequential',
                shuffleSeed: 12345,
                loopSchedule: true,
            };

            expect(() => buildScheduleIndex(config, shuffler)).toThrow(
                SCHEDULER_ERROR_MESSAGES.EMPTY_CHANNEL
            );
        });

        it('should apply shuffle mode correctly', () => {
            const config1: ScheduleConfig = {
                channelId: 'test-channel',
                anchorTime: 0,
                content: testContent,
                playbackMode: 'shuffle',
                shuffleSeed: 42,
                loopSchedule: true,
            };
            const config2: ScheduleConfig = {
                channelId: 'test-channel',
                anchorTime: 0,
                content: testContent,
                playbackMode: 'shuffle',
                shuffleSeed: 42,
                loopSchedule: true,
            };

            const index1 = buildScheduleIndex(config1, shuffler);
            const index2 = buildScheduleIndex(config2, shuffler);

            // Same seed should produce same order
            expect(index1.orderedItems.map((i) => i.ratingKey)).toEqual(
                index2.orderedItems.map((i) => i.ratingKey)
            );
        });
    });

    describe('binarySearchForItem', () => {
        const offsets = [0, 30 * 60 * 1000, 50 * 60 * 1000]; // 0, 30min, 50min

        it('should find item at start of first item', () => {
            expect(binarySearchForItem(0, offsets)).toBe(0);
        });

        it('should find item in middle of first item', () => {
            expect(binarySearchForItem(15 * 60 * 1000, offsets)).toBe(0);
        });

        it('should find item at start of second item', () => {
            expect(binarySearchForItem(30 * 60 * 1000, offsets)).toBe(1);
        });

        it('should find item in middle of second item', () => {
            expect(binarySearchForItem(40 * 60 * 1000, offsets)).toBe(1);
        });

        it('should find item at start of third item', () => {
            expect(binarySearchForItem(50 * 60 * 1000, offsets)).toBe(2);
        });

        it('should find item near end of loop', () => {
            expect(binarySearchForItem(85 * 60 * 1000, offsets)).toBe(2);
        });
    });

    describe('calculateProgramAtTime', () => {
        const anchorTime = 1000000000; // Fixed anchor

        let index: ReturnType<typeof buildScheduleIndex>;

        beforeEach(() => {
            const config: ScheduleConfig = {
                channelId: 'test-channel',
                anchorTime,
                content: testContent,
                playbackMode: 'sequential',
                shuffleSeed: 12345,
                loopSchedule: true,
            };
            index = buildScheduleIndex(config, shuffler);
        });

        it('should return first item at anchor time', () => {
            const program = calculateProgramAtTime(anchorTime, index, anchorTime);

            expect(program.item.ratingKey).toBe('item-a');
            expect(program.elapsedMs).toBe(0);
            expect(program.remainingMs).toBe(30 * 60 * 1000);
            expect(program.scheduleIndex).toBe(0);
            expect(program.loopNumber).toBe(0);
        });

        it('should return correct program and offset in middle', () => {
            // 15 minutes into first item
            const queryTime = anchorTime + 15 * 60 * 1000;
            const program = calculateProgramAtTime(queryTime, index, anchorTime);

            expect(program.item.ratingKey).toBe('item-a');
            expect(program.elapsedMs).toBe(15 * 60 * 1000);
            expect(program.remainingMs).toBe(15 * 60 * 1000);
        });

        it('should return second item after first ends', () => {
            // 35 minutes after anchor (5 min into second item)
            const queryTime = anchorTime + 35 * 60 * 1000;
            const program = calculateProgramAtTime(queryTime, index, anchorTime);

            expect(program.item.ratingKey).toBe('item-b');
            expect(program.elapsedMs).toBe(5 * 60 * 1000);
            expect(program.scheduleIndex).toBe(1);
        });

        it('should handle loop wrapping correctly', () => {
            // 100 minutes after anchor = 10 min into loop 2
            const queryTime = anchorTime + 100 * 60 * 1000;
            const program = calculateProgramAtTime(queryTime, index, anchorTime);

            expect(program.item.ratingKey).toBe('item-a');
            expect(program.elapsedMs).toBe(10 * 60 * 1000);
            expect(program.loopNumber).toBe(1);
        });

        it('should handle times before anchor (negative elapsed)', () => {
            // 10 minutes before anchor
            const queryTime = anchorTime - 10 * 60 * 1000;
            const program = calculateProgramAtTime(queryTime, index, anchorTime);

            // Should wrap to end of loop
            expect(program.loopNumber).toBe(-1);
            // 10 min before anchor wraps to 80 min into loop (90-10)
            expect(program.item.ratingKey).toBe('item-c');
        });

        it('should set scheduledStartTime and scheduledEndTime correctly', () => {
            const program = calculateProgramAtTime(anchorTime, index, anchorTime);

            expect(program.scheduledStartTime).toBe(anchorTime);
            expect(program.scheduledEndTime).toBe(anchorTime + 30 * 60 * 1000);
        });
    });

    describe('calculateNextProgram', () => {
        const anchorTime = 1000000000;

        it('should return second item when current is first', () => {
            const config: ScheduleConfig = {
                channelId: 'test-channel',
                anchorTime,
                content: testContent,
                playbackMode: 'sequential',
                shuffleSeed: 12345,
                loopSchedule: true,
            };
            const index = buildScheduleIndex(config, shuffler);
            const current = calculateProgramAtTime(anchorTime, index, anchorTime);
            const next = calculateNextProgram(current, index, anchorTime);

            expect(next.item.ratingKey).toBe('item-b');
            expect(next.scheduleIndex).toBe(1);
        });

        it('should wrap to first item after last', () => {
            const config: ScheduleConfig = {
                channelId: 'test-channel',
                anchorTime,
                content: testContent,
                playbackMode: 'sequential',
                shuffleSeed: 12345,
                loopSchedule: true,
            };
            const index = buildScheduleIndex(config, shuffler);
            // Go to third item (70 min after anchor)
            const current = calculateProgramAtTime(
                anchorTime + 70 * 60 * 1000,
                index,
                anchorTime
            );
            expect(current.item.ratingKey).toBe('item-c');

            const next = calculateNextProgram(current, index, anchorTime);
            expect(next.item.ratingKey).toBe('item-a');
            expect(next.loopNumber).toBe(1);
        });
    });

    describe('calculatePreviousProgram', () => {
        const anchorTime = 1000000000;

        it('should return previous item', () => {
            const config: ScheduleConfig = {
                channelId: 'test-channel',
                anchorTime,
                content: testContent,
                playbackMode: 'sequential',
                shuffleSeed: 12345,
                loopSchedule: true,
            };
            const index = buildScheduleIndex(config, shuffler);
            // Go to second item
            const current = calculateProgramAtTime(
                anchorTime + 35 * 60 * 1000,
                index,
                anchorTime
            );
            expect(current.item.ratingKey).toBe('item-b');

            const previous = calculatePreviousProgram(current, index, anchorTime);
            expect(previous.item.ratingKey).toBe('item-a');
        });

        it('should wrap to last item from first', () => {
            const config: ScheduleConfig = {
                channelId: 'test-channel',
                anchorTime,
                content: testContent,
                playbackMode: 'sequential',
                shuffleSeed: 12345,
                loopSchedule: true,
            };
            const index = buildScheduleIndex(config, shuffler);
            const current = calculateProgramAtTime(anchorTime, index, anchorTime);
            expect(current.item.ratingKey).toBe('item-a');

            const previous = calculatePreviousProgram(current, index, anchorTime);
            expect(previous.item.ratingKey).toBe('item-c');
            expect(previous.loopNumber).toBe(-1);
        });
    });

    describe('applyPlaybackMode', () => {
        it('should return items in original order for sequential mode', () => {
            const result = applyPlaybackMode(testContent, 'sequential', 12345, shuffler);

            expect(result.map((i) => i.ratingKey)).toEqual(['item-a', 'item-b', 'item-c']);
        });

        it('should shuffle deterministically for shuffle mode', () => {
            const result1 = applyPlaybackMode(testContent, 'shuffle', 42, shuffler);
            const result2 = applyPlaybackMode(testContent, 'shuffle', 42, shuffler);

            expect(result1.map((i) => i.ratingKey)).toEqual(
                result2.map((i) => i.ratingKey)
            );
        });

        it('should update scheduledIndex after ordering', () => {
            const result = applyPlaybackMode(testContent, 'sequential', 12345, shuffler);

            expect(result[0]!.scheduledIndex).toBe(0);
            expect(result[1]!.scheduledIndex).toBe(1);
            expect(result[2]!.scheduledIndex).toBe(2);
        });
    });

    describe('generateScheduleWindow', () => {
        const anchorTime = 1000000000;

        it('should return all programs in time range', () => {
            const config: ScheduleConfig = {
                channelId: 'test-channel',
                anchorTime,
                content: testContent,
                playbackMode: 'sequential',
                shuffleSeed: 12345,
                loopSchedule: true,
            };
            const index = buildScheduleIndex(config, shuffler);

            // Window from anchor to 90 min (full loop)
            const programs = generateScheduleWindow(
                anchorTime,
                anchorTime + 90 * 60 * 1000,
                index,
                anchorTime
            );

            expect(programs).toHaveLength(3);
            expect(programs[0]!.item.ratingKey).toBe('item-a');
            expect(programs[1]!.item.ratingKey).toBe('item-b');
            expect(programs[2]!.item.ratingKey).toBe('item-c');
        });

        it('should include partial programs at boundaries', () => {
            const config: ScheduleConfig = {
                channelId: 'test-channel',
                anchorTime,
                content: testContent,
                playbackMode: 'sequential',
                shuffleSeed: 12345,
                loopSchedule: true,
            };
            const index = buildScheduleIndex(config, shuffler);

            // Window from 15min to 45min (middle of A to middle of B)
            const programs = generateScheduleWindow(
                anchorTime + 15 * 60 * 1000,
                anchorTime + 45 * 60 * 1000,
                index,
                anchorTime
            );

            expect(programs).toHaveLength(2);
            expect(programs[0]!.item.ratingKey).toBe('item-a');
            expect(programs[1]!.item.ratingKey).toBe('item-b');
        });

        it('should handle window spanning multiple loops', () => {
            const config: ScheduleConfig = {
                channelId: 'test-channel',
                anchorTime,
                content: testContent,
                playbackMode: 'sequential',
                shuffleSeed: 12345,
                loopSchedule: true,
            };
            const index = buildScheduleIndex(config, shuffler);

            // Window from 0 to 200 min (more than 2 loops)
            const programs = generateScheduleWindow(
                anchorTime,
                anchorTime + 200 * 60 * 1000,
                index,
                anchorTime
            );

            // Should have at least 6 programs (2 full loops)
            expect(programs.length).toBeGreaterThanOrEqual(6);
        });
    });

    describe('Performance', () => {
        it('should calculate current program in <50ms for 10000 items', () => {
            // Generate 10000 items
            const largeContent: ResolvedContentItem[] = [];
            for (let i = 0; i < 10000; i++) {
                largeContent.push({
                    ratingKey: 'item-' + i,
                    type: 'episode',
                    title: 'Item ' + i,
                    fullTitle: 'Item ' + i,
                    durationMs: 30 * 60 * 1000, // 30 min each
                    thumb: null,
                    year: 2020,
                    scheduledIndex: i,
                });
            }

            const config: ScheduleConfig = {
                channelId: 'perf-test',
                anchorTime: 0,
                content: largeContent,
                playbackMode: 'sequential',
                shuffleSeed: 12345,
                loopSchedule: true,
            };
            const index = buildScheduleIndex(config, shuffler);

            const start = performance.now();
            for (let i = 0; i < 100; i++) {
                calculateProgramAtTime(i * 60 * 60 * 1000, index, 0);
            }
            const duration = performance.now() - start;

            expect(duration).toBeLessThan(50);
        });
    });
});
