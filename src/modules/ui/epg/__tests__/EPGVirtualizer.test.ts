/**
 * @jest-environment jsdom
 */
/**
 * @fileoverview EPG Virtualizer unit tests
 * @module modules/ui/epg/__tests__/EPGVirtualizer.test
 */

import { EPGVirtualizer, positionCell } from '../EPGVirtualizer';
import { EPG_CONSTANTS } from '../constants';
import type { ScheduledProgram, ScheduleWindow, EPGConfig } from '../types';

describe('EPGVirtualizer', () => {
    let virtualizer: EPGVirtualizer;
    let container: HTMLElement;
    let config: EPGConfig;
    const gridAnchorTime = new Date('2026-01-07T00:00:00').getTime();

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);

        config = {
            containerId: 'test-container',
            visibleChannels: 5,
            timeSlotMinutes: 30,
            visibleHours: 3,
            totalHours: 24,
            pixelsPerMinute: 4,
            rowHeight: 80,
            showCurrentTimeIndicator: true,
            autoScrollToNow: false,
        };

        virtualizer = new EPGVirtualizer();
        virtualizer.initialize(container, config, gridAnchorTime);
    });

    afterEach(() => {
        virtualizer.destroy();
        container.remove();
    });

    describe('positionCell', () => {
        it('computes left/width deterministically from program times', () => {
            const program: ScheduledProgram = {
                item: {
                    ratingKey: '1',
                    type: 'movie',
                    title: 'Test Movie',
                    fullTitle: 'Test Movie',
                    durationMs: 1800000, // 30 minutes
                    thumb: null,
                    year: 2020,
                    scheduledIndex: 0,
                },
                scheduledStartTime: gridAnchorTime + 60000, // 1 minute from anchor
                scheduledEndTime: gridAnchorTime + 120000, // 2 minutes from anchor
                elapsedMs: 0,
                remainingMs: 60000,
                scheduleIndex: 0,
                loopNumber: 0,
                streamDescriptor: null,
                isCurrent: false,
            };

            const cell = positionCell(program, gridAnchorTime);

            expect(cell.left).toBeGreaterThanOrEqual(0);
            expect(cell.width).toBeGreaterThan(0);
            expect(cell.program.item.ratingKey).toBe('1');
        });

        it('calculates correct left position based on start time', () => {
            const program: ScheduledProgram = {
                item: {
                    ratingKey: '2',
                    type: 'movie',
                    title: 'Test',
                    fullTitle: 'Test',
                    durationMs: 3600000,
                    thumb: null,
                    year: 2020,
                    scheduledIndex: 0,
                },
                scheduledStartTime: gridAnchorTime + (60 * 60000), // 60 minutes from anchor
                scheduledEndTime: gridAnchorTime + (120 * 60000), // 120 minutes from anchor
                elapsedMs: 0,
                remainingMs: 3600000,
                scheduleIndex: 0,
                loopNumber: 0,
                streamDescriptor: null,
                isCurrent: false,
            };

            const cell = positionCell(program, gridAnchorTime, 4); // 4 pixels per minute

            // 60 minutes * 4 pixels = 240px left
            expect(cell.left).toBe(240);
            // 60 minutes duration * 4 pixels = 240px width
            expect(cell.width).toBe(240);
        });

        it('enforces minimum width of 20px', () => {
            const program: ScheduledProgram = {
                item: {
                    ratingKey: '3',
                    type: 'clip',
                    title: 'Short Clip',
                    fullTitle: 'Short Clip',
                    durationMs: 10000, // 10 seconds
                    thumb: null,
                    year: 2020,
                    scheduledIndex: 0,
                },
                scheduledStartTime: gridAnchorTime,
                scheduledEndTime: gridAnchorTime + 10000, // 10 seconds later
                elapsedMs: 0,
                remainingMs: 10000,
                scheduleIndex: 0,
                loopNumber: 0,
                streamDescriptor: null,
                isCurrent: false,
            };

            const cell = positionCell(program, gridAnchorTime);

            // Even though duration would give tiny width, minimum is 20px
            expect(cell.width).toBeGreaterThanOrEqual(20);
        });
    });

    describe('calculateVisibleRange', () => {
        it('returns correct visible rows with buffer', () => {
            virtualizer.setChannelCount(50);

            const range = virtualizer.calculateVisibleRange({
                channelOffset: 10,
                timeOffset: 0,
            });

            // Should include buffer rows (ROW_BUFFER = 2)
            expect(range.visibleRows).toContain(8); // 10 - 2
            expect(range.visibleRows).toContain(9);
            expect(range.visibleRows).toContain(10);
            expect(range.visibleRows).toContain(11);
            expect(range.visibleRows).toContain(12);
            // Should include up to visibleChannels + buffer
            expect(range.visibleRows.length).toBe(
                config.visibleChannels + EPG_CONSTANTS.ROW_BUFFER * 2
            );
        });

        it('clamps to valid range at boundaries', () => {
            virtualizer.setChannelCount(50);

            // At top boundary
            const rangeTop = virtualizer.calculateVisibleRange({
                channelOffset: 0,
                timeOffset: 0,
            });
            expect(rangeTop.visibleRows[0]).toBe(0);
            expect(rangeTop.visibleRows).not.toContain(-1);

            // At bottom boundary
            const rangeBottom = virtualizer.calculateVisibleRange({
                channelOffset: 48,
                timeOffset: 0,
            });
            expect(rangeBottom.visibleRows).not.toContain(50);
        });

        it('calculates time buffer correctly', () => {
            virtualizer.setChannelCount(10);

            const range = virtualizer.calculateVisibleRange({
                channelOffset: 0,
                timeOffset: 120, // Start at 2 hours
            });

            // Should include TIME_BUFFER_MINUTES (60) before and after
            expect(range.visibleTimeRange.start).toBe(120 - EPG_CONSTANTS.TIME_BUFFER_MINUTES);
            expect(range.visibleTimeRange.end).toBe(
                120 + (config.visibleHours * 60) + EPG_CONSTANTS.TIME_BUFFER_MINUTES
            );
        });
    });

    describe('DOM element virtualization', () => {
        it('renders a row at top 0 when channelOffset matches rowIndex', () => {
            const channelIds = Array.from({ length: 15 }, (_, i) => `ch${i}`);
            const schedules = new Map<string, ScheduleWindow>();
            const targetIndex = 10;
            const channelId = channelIds[targetIndex];
            expect(channelId).toBeDefined();
            if (!channelId) {
                throw new Error('Missing channelId for virtualization test.');
            }
            const program: ScheduledProgram = {
                item: {
                    ratingKey: `${channelId}-0`,
                    type: 'movie',
                    title: 'Top Test',
                    fullTitle: 'Top Test',
                    durationMs: 1800000,
                    thumb: null,
                    year: 2020,
                    scheduledIndex: 0,
                },
                scheduledStartTime: gridAnchorTime,
                scheduledEndTime: gridAnchorTime + 1800000,
                elapsedMs: 0,
                remainingMs: 1800000,
                scheduleIndex: 0,
                loopNumber: 0,
                streamDescriptor: null,
                isCurrent: false,
            };
            schedules.set(channelId, {
                startTime: gridAnchorTime,
                endTime: gridAnchorTime + (24 * 60 * 60000),
                programs: [program],
            });
            const expectedKey = `${channelId}-${program.scheduledStartTime}`;

            virtualizer.setChannelCount(channelIds.length);
            const range = virtualizer.calculateVisibleRange({
                channelOffset: targetIndex,
                timeOffset: 0,
            });
            virtualizer.renderVisibleCells(channelIds, schedules, range);

            const cell = container.querySelector(`[data-key="${expectedKey}"]`) as HTMLElement;
            expect(cell).not.toBeNull();
            expect(cell.style.top).toBe('0px');
        });

        it('renders loading placeholders when schedules are missing', () => {
            const channelIds = ['ch0'];
            const schedules = new Map<string, ScheduleWindow>();

            virtualizer.setChannelCount(1);
            const range = virtualizer.calculateVisibleRange({
                channelOffset: 0,
                timeOffset: 0,
            });
            virtualizer.renderVisibleCells(channelIds, schedules, range);

            const title = container.querySelector('.epg-cell-title');
            expect(title?.textContent).toBe('Loading...');
        });

        it('applies horizontal scroll transform to the content wrapper', () => {
            const channelIds = ['ch0'];
            const schedules = new Map<string, ScheduleWindow>();
            schedules.set('ch0', {
                startTime: gridAnchorTime,
                endTime: gridAnchorTime + (3 * 60 * 60000),
                programs: [],
            });

            virtualizer.setChannelCount(1);
            const range = virtualizer.calculateVisibleRange({
                channelOffset: 0,
                timeOffset: 30,
            });
            virtualizer.updateScrollPosition(30);
            virtualizer.renderVisibleCells(channelIds, schedules, range);

            const content = container.firstElementChild as HTMLElement;
            expect(content).not.toBeNull();
            expect(content.style.transform).toBe('translateX(-120px)');
        });

        it('renders gap placeholders when schedule has holes in visible window', () => {
            const channelIds = ['ch0'];
            const programs: ScheduledProgram[] = [
                {
                    item: {
                        ratingKey: 'ch0-1',
                        type: 'movie',
                        title: 'Program 1',
                        fullTitle: 'Program 1',
                        durationMs: 1800000,
                        thumb: null,
                        year: 2020,
                        scheduledIndex: 0,
                    },
                    scheduledStartTime: gridAnchorTime + (60 * 60000),
                    scheduledEndTime: gridAnchorTime + (90 * 60000),
                    elapsedMs: 0,
                    remainingMs: 1800000,
                    scheduleIndex: 0,
                    loopNumber: 0,
                    streamDescriptor: null,
                    isCurrent: false,
                },
            ];
            const schedules = new Map<string, ScheduleWindow>([
                ['ch0', {
                    startTime: gridAnchorTime,
                    endTime: gridAnchorTime + (24 * 60 * 60000),
                    programs,
                }],
            ]);

            virtualizer.setChannelCount(1);
            const range = virtualizer.calculateVisibleRange({
                channelOffset: 0,
                timeOffset: 0,
            });
            virtualizer.renderVisibleCells(channelIds, schedules, range);

            const titles = Array.from(container.querySelectorAll('.epg-cell-title'))
                .map((el) => el.textContent);
            expect(titles).toContain('No Program');
        });

        it('should maintain DOM element count under 200 during virtualized render', () => {
            // Load 50 channels with many programs
            const channelIds = Array.from({ length: 50 }, (_, i) => `ch${i}`);
            const schedules = new Map<string, ScheduleWindow>();

            // Create 48 programs per channel (48 half-hour slots in 24 hours)
            for (const channelId of channelIds) {
                const programs: ScheduledProgram[] = [];
                for (let slot = 0; slot < 48; slot++) {
                    programs.push({
                        item: {
                            ratingKey: `${channelId}-${slot}`,
                            type: 'movie',
                            title: `Program ${slot}`,
                            fullTitle: `Program ${slot}`,
                            durationMs: 1800000,
                            thumb: null,
                            year: 2020,
                            scheduledIndex: slot,
                        },
                        scheduledStartTime: gridAnchorTime + (slot * 30 * 60000),
                        scheduledEndTime: gridAnchorTime + ((slot + 1) * 30 * 60000),
                        elapsedMs: 0,
                        remainingMs: 1800000,
                        scheduleIndex: slot,
                        loopNumber: 0,
                        streamDescriptor: null,
                        isCurrent: false,
                    });
                }
                schedules.set(channelId, {
                    startTime: gridAnchorTime,
                    endTime: gridAnchorTime + (24 * 60 * 60000),
                    programs,
                });
            }

            virtualizer.setChannelCount(50);

            const range = virtualizer.calculateVisibleRange({
                channelOffset: 0,
                timeOffset: 0,
            });

            virtualizer.renderVisibleCells(channelIds, schedules, range);

            // Count DOM elements
            const cellCount = container.querySelectorAll('.epg-cell').length;
            expect(cellCount).toBeLessThanOrEqual(EPG_CONSTANTS.MAX_DOM_ELEMENTS);
            expect(cellCount).toBeGreaterThan(0);
        });

        it('should recycle elements when scrolling', () => {
            const channelIds = Array.from({ length: 20 }, (_, i) => `ch${i}`);
            const schedules = new Map<string, ScheduleWindow>();

            for (const channelId of channelIds) {
                const programs: ScheduledProgram[] = [];
                for (let slot = 0; slot < 24; slot++) {
                    programs.push({
                        item: {
                            ratingKey: `${channelId}-${slot}`,
                            type: 'movie',
                            title: `Program ${slot}`,
                            fullTitle: `Program ${slot}`,
                            durationMs: 3600000,
                            thumb: null,
                            year: 2020,
                            scheduledIndex: slot,
                        },
                        scheduledStartTime: gridAnchorTime + (slot * 60 * 60000),
                        scheduledEndTime: gridAnchorTime + ((slot + 1) * 60 * 60000),
                        elapsedMs: 0,
                        remainingMs: 3600000,
                        scheduleIndex: slot,
                        loopNumber: 0,
                        streamDescriptor: null,
                        isCurrent: false,
                    });
                }
                schedules.set(channelId, {
                    startTime: gridAnchorTime,
                    endTime: gridAnchorTime + (24 * 60 * 60000),
                    programs,
                });
            }

            virtualizer.setChannelCount(20);

            // Initial render
            const initialRange = virtualizer.calculateVisibleRange({
                channelOffset: 0,
                timeOffset: 0,
            });
            virtualizer.renderVisibleCells(channelIds, schedules, initialRange);
            const initialCount = container.querySelectorAll('.epg-cell').length;

            // Scroll and re-render
            const scrolledRange = virtualizer.calculateVisibleRange({
                channelOffset: 10,
                timeOffset: 180, // 3 hours later
            });
            virtualizer.renderVisibleCells(channelIds, schedules, scrolledRange);
            const afterScrollCount = container.querySelectorAll('.epg-cell').length;

            // Element count should stay stable due to recycling
            expect(afterScrollCount).toBeLessThanOrEqual(EPG_CONSTANTS.MAX_DOM_ELEMENTS);
            // Should be roughly similar to initial count (allowing some variance for buffer)
            expect(Math.abs(afterScrollCount - initialCount)).toBeLessThan(50);
        });
    });

    describe('element pool management', () => {
        it('should reuse elements from pool', () => {
            const channelIds = ['ch1'];
            const schedules = new Map<string, ScheduleWindow>();

            schedules.set('ch1', {
                startTime: gridAnchorTime,
                endTime: gridAnchorTime + (3 * 60 * 60000),
                programs: [{
                    item: {
                        ratingKey: '1',
                        type: 'movie',
                        title: 'Movie 1',
                        fullTitle: 'Movie 1',
                        durationMs: 7200000,
                        thumb: null,
                        year: 2020,
                        scheduledIndex: 0,
                    },
                    scheduledStartTime: gridAnchorTime,
                    scheduledEndTime: gridAnchorTime + 7200000,
                    elapsedMs: 0,
                    remainingMs: 7200000,
                    scheduleIndex: 0,
                    loopNumber: 0,
                    streamDescriptor: null,
                    isCurrent: false,
                }],
            });

            virtualizer.setChannelCount(1);

            // Render, then force recycle
            const range = virtualizer.calculateVisibleRange({
                channelOffset: 0,
                timeOffset: 0,
            });
            virtualizer.renderVisibleCells(channelIds, schedules, range);

            expect(virtualizer.getElementCount()).toBeGreaterThan(0);

            // Force recycle should move element to pool
            virtualizer.forceRecycleAll();

            expect(virtualizer.getElementCount()).toBe(0);
            expect(virtualizer.getPoolSize()).toBe(0); // forceRecycleAll clears pool
        });

        it('keeps focused cell when exceeding DOM cap', () => {
            const channelIds = Array.from({ length: 10 }, (_, i) => `ch${i}`);
            const schedules = new Map<string, ScheduleWindow>();
            const focusedChannel = channelIds[0];
            const focusedStart = gridAnchorTime + (2 * 30 * 60000);
            const focusedKey = `${focusedChannel}-${focusedStart}`;

            for (const channelId of channelIds) {
                const programs: ScheduledProgram[] = [];
                for (let slot = 0; slot < 60; slot++) {
                    programs.push({
                        item: {
                            ratingKey: `${channelId}-${slot}`,
                            type: 'movie',
                            title: `Program ${slot}`,
                            fullTitle: `Program ${slot}`,
                            durationMs: 1800000,
                            thumb: null,
                            year: 2020,
                            scheduledIndex: slot,
                        },
                        scheduledStartTime: gridAnchorTime + (slot * 30 * 60000),
                        scheduledEndTime: gridAnchorTime + ((slot + 1) * 30 * 60000),
                        elapsedMs: 0,
                        remainingMs: 1800000,
                        scheduleIndex: slot,
                        loopNumber: 0,
                        streamDescriptor: null,
                        isCurrent: false,
                    });
                }
                schedules.set(channelId, {
                    startTime: gridAnchorTime,
                    endTime: gridAnchorTime + (24 * 60 * 60000),
                    programs,
                });
            }

            virtualizer.setChannelCount(channelIds.length);
            const range = virtualizer.calculateVisibleRange({
                channelOffset: 0,
                timeOffset: 0,
            });
            virtualizer.renderVisibleCells(channelIds, schedules, range, focusedKey);

            const focusedCell = container.querySelector(`[data-key="${focusedKey}"]`);
            expect(focusedCell).not.toBeNull();
        });
    });
});
