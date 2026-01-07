/**
 * @fileoverview Tests for ChannelScheduler.
 * @module modules/scheduler/scheduler/__tests__/ChannelScheduler.test
 */

import { ChannelScheduler } from '../ChannelScheduler';
import { ShuffleGenerator } from '../ShuffleGenerator';
import type { ScheduleConfig, ResolvedContentItem } from '../types';
import { SCHEDULER_ERROR_MESSAGES } from '../constants';

describe('ChannelScheduler', () => {
    let scheduler: ChannelScheduler;
    let shuffler: ShuffleGenerator;

    // Test content
    const content: ResolvedContentItem[] = [
        {
            ratingKey: 'a',
            type: 'movie',
            title: 'A',
            fullTitle: 'A',
            durationMs: 10000, // 10 seconds
            thumb: null,
            year: 2020,
            scheduledIndex: 0,
        },
        {
            ratingKey: 'b',
            type: 'movie',
            title: 'B',
            fullTitle: 'B',
            durationMs: 20000, // 20 seconds
            thumb: null,
            year: 2021,
            scheduledIndex: 1,
        },
    ];

    const TOTAL_DURATION = 30000; // 30 seconds

    beforeEach(() => {
        jest.useFakeTimers();
        shuffler = new ShuffleGenerator();
        scheduler = new ChannelScheduler(shuffler);
    });

    afterEach(() => {
        scheduler.unloadChannel();
        jest.useRealTimers();
    });

    describe('loadChannel', () => {
        it('should load channel and emit initial programStart', () => {
            const handler = jest.fn();
            scheduler.on('programStart', handler);

            const anchorTime = Date.now();
            const config: ScheduleConfig = {
                channelId: 'c1',
                anchorTime,
                content,
                playbackMode: 'sequential',
                shuffleSeed: 1,
                loopSchedule: true,
            };

            scheduler.loadChannel(config);

            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    item: expect.objectContaining({ ratingKey: 'a' }),
                })
            );
        });

        it('should throw for empty content', () => {
            const config: ScheduleConfig = {
                channelId: 'c1',
                anchorTime: Date.now(),
                content: [],
                playbackMode: 'sequential',
                shuffleSeed: 1,
                loopSchedule: true,
            };

            expect(() => scheduler.loadChannel(config)).toThrow(
                SCHEDULER_ERROR_MESSAGES.EMPTY_CHANNEL
            );
        });
    });

    describe('getProgramAtTime', () => {
        it('should deterministically resolve current program and offset for a fixed anchor time', () => {
            const anchorTime = 1000000;
            const config: ScheduleConfig = {
                channelId: 'c1',
                anchorTime,
                content,
                playbackMode: 'sequential',
                shuffleSeed: 1,
                loopSchedule: true,
            };
            scheduler.loadChannel(config);

            // 5s after anchor, still in item A, offset 5s
            const program = scheduler.getProgramAtTime(anchorTime + 5000);
            expect(program.item.ratingKey).toBe('a');
            expect(program.elapsedMs).toBe(5000);
            expect(program.remainingMs).toBe(5000);
        });

        it('should wrap across the loop boundary without gaps', () => {
            const anchorTime = 1000000;
            const config: ScheduleConfig = {
                channelId: 'c1',
                anchorTime,
                content,
                playbackMode: 'sequential',
                shuffleSeed: 1,
                loopSchedule: true,
            };
            scheduler.loadChannel(config);

            // Total loop duration is 30s; 35s after anchor wraps to item A at 5s
            const program = scheduler.getProgramAtTime(anchorTime + 35000);
            expect(program.item.ratingKey).toBe('a');
            expect(program.elapsedMs).toBe(5000);
            expect(program.loopNumber).toBe(1);
        });

        it('should throw if no channel loaded', () => {
            expect(() => scheduler.getProgramAtTime(Date.now())).toThrow(
                SCHEDULER_ERROR_MESSAGES.NO_CHANNEL_LOADED
            );
        });
    });

    describe('getCurrentProgram', () => {
        it('should return program at current time', () => {
            const now = Date.now();
            jest.setSystemTime(now);

            const config: ScheduleConfig = {
                channelId: 'c1',
                anchorTime: now,
                content,
                playbackMode: 'sequential',
                shuffleSeed: 1,
                loopSchedule: true,
            };
            scheduler.loadChannel(config);

            const current = scheduler.getCurrentProgram();
            expect(current.item.ratingKey).toBe('a');
        });
    });

    describe('getNextProgram', () => {
        it('should return next program', () => {
            const now = Date.now();
            jest.setSystemTime(now);

            const config: ScheduleConfig = {
                channelId: 'c1',
                anchorTime: now,
                content,
                playbackMode: 'sequential',
                shuffleSeed: 1,
                loopSchedule: true,
            };
            scheduler.loadChannel(config);

            const next = scheduler.getNextProgram();
            expect(next.item.ratingKey).toBe('b');
        });
    });

    describe('getPreviousProgram', () => {
        it('should return previous program (wraps to last)', () => {
            const now = Date.now();
            jest.setSystemTime(now);

            const config: ScheduleConfig = {
                channelId: 'c1',
                anchorTime: now,
                content,
                playbackMode: 'sequential',
                shuffleSeed: 1,
                loopSchedule: true,
            };
            scheduler.loadChannel(config);

            const previous = scheduler.getPreviousProgram();
            expect(previous.item.ratingKey).toBe('b');
        });
    });

    describe('shuffle mode', () => {
        it('should produce the same order given the same seed', () => {
            const anchorTime = 1000000;
            const config1: ScheduleConfig = {
                channelId: 'c1',
                anchorTime,
                content,
                playbackMode: 'shuffle',
                shuffleSeed: 42,
                loopSchedule: true,
            };
            const config2: ScheduleConfig = {
                channelId: 'c1',
                anchorTime,
                content,
                playbackMode: 'shuffle',
                shuffleSeed: 42,
                loopSchedule: true,
            };

            const s1 = new ChannelScheduler(shuffler);
            const s2 = new ChannelScheduler(shuffler);
            s1.loadChannel(config1);
            s2.loadChannel(config2);

            const window1 = s1.getScheduleWindow(anchorTime, anchorTime + 60000);
            const window2 = s2.getScheduleWindow(anchorTime, anchorTime + 60000);

            expect(window1.programs.map((p) => p.item.ratingKey)).toEqual(
                window2.programs.map((p) => p.item.ratingKey)
            );

            s1.unloadChannel();
            s2.unloadChannel();
        });
    });

    describe('getScheduleWindow', () => {
        it('should return all programs in time range', () => {
            const anchorTime = 1000000;
            const config: ScheduleConfig = {
                channelId: 'c1',
                anchorTime,
                content,
                playbackMode: 'sequential',
                shuffleSeed: 1,
                loopSchedule: true,
            };
            scheduler.loadChannel(config);

            // Window for full loop
            const window = scheduler.getScheduleWindow(anchorTime, anchorTime + TOTAL_DURATION);
            expect(window.programs).toHaveLength(2);
            expect(window.programs[0]!.item.ratingKey).toBe('a');
            expect(window.programs[1]!.item.ratingKey).toBe('b');
        });

        it('should include partial programs at boundaries', () => {
            const anchorTime = 1000000;
            const config: ScheduleConfig = {
                channelId: 'c1',
                anchorTime,
                content,
                playbackMode: 'sequential',
                shuffleSeed: 1,
                loopSchedule: true,
            };
            scheduler.loadChannel(config);

            // Window from 5s to 15s (middle of A to middle of B)
            const window = scheduler.getScheduleWindow(
                anchorTime + 5000,
                anchorTime + 15000
            );
            expect(window.programs).toHaveLength(2);
            expect(window.programs[0]!.item.ratingKey).toBe('a');
            expect(window.programs[1]!.item.ratingKey).toBe('b');
        });

        it('should throw for invalid time range', () => {
            const anchorTime = 1000000;
            const config: ScheduleConfig = {
                channelId: 'c1',
                anchorTime,
                content,
                playbackMode: 'sequential',
                shuffleSeed: 1,
                loopSchedule: true,
            };
            scheduler.loadChannel(config);

            expect(() =>
                scheduler.getScheduleWindow(anchorTime + 1000, anchorTime)
            ).toThrow(SCHEDULER_ERROR_MESSAGES.INVALID_TIME_RANGE);
        });
    });

    describe('getUpcoming', () => {
        it('should return next N programs', () => {
            const now = Date.now();
            jest.setSystemTime(now);

            const config: ScheduleConfig = {
                channelId: 'c1',
                anchorTime: now,
                content,
                playbackMode: 'sequential',
                shuffleSeed: 1,
                loopSchedule: true,
            };
            scheduler.loadChannel(config);

            const upcoming = scheduler.getUpcoming(4);
            expect(upcoming).toHaveLength(4);
            expect(upcoming[0]!.item.ratingKey).toBe('a');
            expect(upcoming[1]!.item.ratingKey).toBe('b');
            expect(upcoming[2]!.item.ratingKey).toBe('a'); // Loop
            expect(upcoming[3]!.item.ratingKey).toBe('b');
        });
    });

    describe('syncToCurrentTime', () => {
        it('should emit scheduleSync on sync', () => {
            const handler = jest.fn();
            const now = Date.now();
            jest.setSystemTime(now);

            const config: ScheduleConfig = {
                channelId: 'c1',
                anchorTime: now,
                content,
                playbackMode: 'sequential',
                shuffleSeed: 1,
                loopSchedule: true,
            };
            scheduler.loadChannel(config);
            scheduler.on('scheduleSync', handler);

            scheduler.syncToCurrentTime();

            expect(handler).toHaveBeenCalled();
        });

        it('should emit programEnd and programStart on program change', () => {
            const programEndHandler = jest.fn();
            const programStartHandler = jest.fn();
            const now = Date.now();
            jest.setSystemTime(now);

            const config: ScheduleConfig = {
                channelId: 'c1',
                anchorTime: now,
                content,
                playbackMode: 'sequential',
                shuffleSeed: 1,
                loopSchedule: true,
            };
            scheduler.loadChannel(config);

            // Clear initial programStart
            scheduler.on('programEnd', programEndHandler);
            scheduler.on('programStart', programStartHandler);

            // Advance past first program
            jest.setSystemTime(now + 15000); // 5s into B

            scheduler.syncToCurrentTime();

            expect(programEndHandler).toHaveBeenCalledWith(
                expect.objectContaining({
                    item: expect.objectContaining({ ratingKey: 'a' }),
                })
            );
            expect(programStartHandler).toHaveBeenCalledWith(
                expect.objectContaining({
                    item: expect.objectContaining({ ratingKey: 'b' }),
                })
            );
        });
    });

    describe('skipToNext', () => {
        it('should emit programEnd and programStart', () => {
            const programEndHandler = jest.fn();
            const programStartHandler = jest.fn();
            const now = Date.now();
            jest.setSystemTime(now);

            const config: ScheduleConfig = {
                channelId: 'c1',
                anchorTime: now,
                content,
                playbackMode: 'sequential',
                shuffleSeed: 1,
                loopSchedule: true,
            };
            scheduler.loadChannel(config);
            scheduler.on('programEnd', programEndHandler);
            scheduler.on('programStart', programStartHandler);

            // Clear the initial programStart call count
            programStartHandler.mockClear();

            scheduler.skipToNext();

            expect(programEndHandler).toHaveBeenCalledWith(
                expect.objectContaining({
                    item: expect.objectContaining({ ratingKey: 'a' }),
                })
            );
            expect(programStartHandler).toHaveBeenCalledWith(
                expect.objectContaining({
                    item: expect.objectContaining({ ratingKey: 'b' }),
                })
            );
        });

        it('should persist jump across sync ticks (not snap back)', () => {
            const programStartHandler = jest.fn();
            const now = Date.now();
            jest.setSystemTime(now);

            const config: ScheduleConfig = {
                channelId: 'c1',
                anchorTime: now,
                content, // [a: 10s, b: 20s]
                playbackMode: 'sequential',
                shuffleSeed: 1,
                loopSchedule: true,
            };
            scheduler.loadChannel(config);
            scheduler.on('programStart', programStartHandler);
            programStartHandler.mockClear();

            // Initial: should be on item 'a'
            expect(scheduler.getCurrentProgram()?.item.ratingKey).toBe('a');

            // Skip to next (item 'b')
            scheduler.skipToNext();
            expect(scheduler.getCurrentProgram()?.item.ratingKey).toBe('b');
            expect(programStartHandler).toHaveBeenCalledWith(
                expect.objectContaining({
                    item: expect.objectContaining({ ratingKey: 'b' }),
                })
            );
            programStartHandler.mockClear();

            // Advance time 1.5s (within sync interval) and sync
            jest.advanceTimersByTime(1500);
            scheduler.syncToCurrentTime();

            // Should STILL be on item 'b' - not snapped back to 'a'
            expect(scheduler.getCurrentProgram()?.item.ratingKey).toBe('b');
            // Should NOT have emitted another programStart (no snap-back)
            expect(programStartHandler).not.toHaveBeenCalled();
        });
    });

    describe('skipToPrevious', () => {
        it('should skip to previous program', () => {
            const programStartHandler = jest.fn();
            const now = Date.now();
            jest.setSystemTime(now);

            const config: ScheduleConfig = {
                channelId: 'c1',
                anchorTime: now,
                content,
                playbackMode: 'sequential',
                shuffleSeed: 1,
                loopSchedule: true,
            };
            scheduler.loadChannel(config);
            scheduler.on('programStart', programStartHandler);
            programStartHandler.mockClear();

            scheduler.skipToPrevious();

            expect(programStartHandler).toHaveBeenCalledWith(
                expect.objectContaining({
                    item: expect.objectContaining({ ratingKey: 'b' }),
                })
            );
        });

        it('should reset elapsed to 0 for restart-from-beginning behavior', () => {
            const programStartHandler = jest.fn();
            const now = Date.now();
            jest.setSystemTime(now);

            const config: ScheduleConfig = {
                channelId: 'c1',
                anchorTime: now,
                content,
                playbackMode: 'sequential',
                shuffleSeed: 1,
                loopSchedule: true,
            };
            scheduler.loadChannel(config);
            scheduler.on('programStart', programStartHandler);
            programStartHandler.mockClear();

            scheduler.skipToPrevious();

            // Verify elapsed is reset to 0 (not near durationMs)
            expect(programStartHandler).toHaveBeenCalledWith(
                expect.objectContaining({
                    elapsedMs: 0,
                    remainingMs: 20000, // Item B has 20s duration
                })
            );
        });
    });

    describe('getState', () => {
        it('should return current scheduler state', () => {
            const now = Date.now();
            jest.setSystemTime(now);

            const config: ScheduleConfig = {
                channelId: 'c1',
                anchorTime: now,
                content,
                playbackMode: 'sequential',
                shuffleSeed: 1,
                loopSchedule: true,
            };
            scheduler.loadChannel(config);

            const state = scheduler.getState();

            expect(state.channelId).toBe('c1');
            expect(state.isActive).toBe(true);
            expect(state.currentProgram).not.toBeNull();
            expect(state.nextProgram).not.toBeNull();
        });
    });

    describe('getScheduleIndex', () => {
        it('should return schedule index', () => {
            const now = Date.now();
            const config: ScheduleConfig = {
                channelId: 'c1',
                anchorTime: now,
                content,
                playbackMode: 'sequential',
                shuffleSeed: 1,
                loopSchedule: true,
            };
            scheduler.loadChannel(config);

            const index = scheduler.getScheduleIndex();

            expect(index.channelId).toBe('c1');
            expect(index.totalLoopDurationMs).toBe(TOTAL_DURATION);
            expect(index.orderedItems).toHaveLength(2);
        });

        it('should throw if no channel loaded', () => {
            expect(() => scheduler.getScheduleIndex()).toThrow(
                SCHEDULER_ERROR_MESSAGES.NO_CHANNEL_LOADED
            );
        });
    });

    describe('unloadChannel', () => {
        it('should clear state', () => {
            const now = Date.now();
            const config: ScheduleConfig = {
                channelId: 'c1',
                anchorTime: now,
                content,
                playbackMode: 'sequential',
                shuffleSeed: 1,
                loopSchedule: true,
            };
            scheduler.loadChannel(config);
            scheduler.unloadChannel();

            const state = scheduler.getState();
            expect(state.isActive).toBe(false);
            expect(state.currentProgram).toBeNull();
        });
    });

    describe('Timer behavior', () => {
        it('should auto-sync every 1 second', () => {
            const syncHandler = jest.fn();
            const now = Date.now();
            jest.setSystemTime(now);

            const config: ScheduleConfig = {
                channelId: 'c1',
                anchorTime: now,
                content,
                playbackMode: 'sequential',
                shuffleSeed: 1,
                loopSchedule: true,
            };
            scheduler.loadChannel(config);
            scheduler.on('scheduleSync', syncHandler);

            // Advance time by 3 seconds
            jest.advanceTimersByTime(3000);

            // Should have synced 3 times
            expect(syncHandler).toHaveBeenCalledTimes(3);
        });
    });

    // ============================================
    // Regression Tests (Review Fixes)
    // ============================================

    describe('Regression Tests', () => {
        it('getUpcoming(0) should return empty array', () => {
            const now = Date.now();
            const config: ScheduleConfig = {
                channelId: 'c1',
                anchorTime: now,
                content,
                playbackMode: 'sequential',
                shuffleSeed: 1,
                loopSchedule: true,
            };
            scheduler.loadChannel(config);

            const upcoming = scheduler.getUpcoming(0);
            expect(upcoming).toHaveLength(0);
        });

        it('jumpToProgram should ignore stale elapsedMs and use calculated elapsed time', () => {
            const now = Date.now();
            jest.setSystemTime(now);

            const config: ScheduleConfig = {
                channelId: 'c1',
                anchorTime: now,
                content, // [a: 10s, b: 20s]
                playbackMode: 'sequential',
                shuffleSeed: 1,
                loopSchedule: true,
            };
            scheduler.loadChannel(config);

            // Get a program and let it become "stale"
            const originalProgram = scheduler.getCurrentProgram(); // Item A

            // Advance time by 5 seconds
            const futureTime = now + 5000;
            jest.setSystemTime(futureTime);

            // User clicks "Play" on the stale EPG entry (where elapsedMs was 0)
            // If we trusted the stale elapsedMs (0), we would restart the item at 0.
            // But since it's "live" (we are 5s into it), we should "tune in" at 5s.
            scheduler.jumpToProgram(originalProgram);

            const newCurrent = scheduler.getCurrentProgram();

            // Should be at 5s elapsed, not 0
            expect(newCurrent.item.ratingKey).toBe('a');
            expect(newCurrent.elapsedMs).toBe(5000);
        });

        it('jumpToProgram should restart items that are not live (e.g. past/future)', () => {
            const now = Date.now();
            jest.setSystemTime(now);

            const config: ScheduleConfig = {
                channelId: 'c1',
                anchorTime: now,
                content, // [a: 10s, b: 20s]
                playbackMode: 'sequential',
                shuffleSeed: 1,
                loopSchedule: true,
            };
            scheduler.loadChannel(config);

            // Get next program (B), which is in the future
            const nextProgram = scheduler.getNextProgram();

            // Advance time just a little (1s) - still not time for B naturally
            jest.setSystemTime(now + 1000);

            // User clicks "Play" on B. Since B is not "live" (start time is in future relative to now),
            // we should shift the schedule to start B immediately (elapsed 0).
            scheduler.jumpToProgram(nextProgram);

            const newCurrent = scheduler.getCurrentProgram();

            expect(newCurrent.item.ratingKey).toBe('b');
            expect(newCurrent.elapsedMs).toBe(0);
        });
    });
});
