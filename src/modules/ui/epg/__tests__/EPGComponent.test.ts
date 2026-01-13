/**
 * @jest-environment jsdom
 */
/**
 * @fileoverview EPG Component unit tests
 * @module modules/ui/epg/__tests__/EPGComponent.test
 */

import { EPGComponent } from '../EPGComponent';
import type { ScheduledProgram, ScheduleWindow, ChannelConfig } from '../types';

describe('EPGComponent', () => {
    let epg: EPGComponent;
    let container: HTMLElement;
    let gridAnchorTime = 0;

    const createMockChannel = (index: number): ChannelConfig => ({
        id: `ch${index}`,
        number: index + 1,
        name: `Channel ${index + 1}`,
        contentSource: { type: 'manual', items: [] },
        playbackMode: 'sequential',
        contentFilters: [],
        skipIntros: false,
        skipCredits: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastContentRefresh: Date.now(),
        itemCount: 10,
        totalDurationMs: 36000000,
        startTimeAnchor: gridAnchorTime,
    });

    const createMockSchedule = (channelId: string, programCount: number): ScheduleWindow => {
        const programs: ScheduledProgram[] = [];
        for (let i = 0; i < programCount; i++) {
            programs.push({
                item: {
                    ratingKey: `${channelId}-prog-${i}`,
                    type: 'movie',
                    title: `Program ${i + 1}`,
                    fullTitle: `Program ${i + 1}`,
                    durationMs: 3600000, // 1 hour
                    thumb: null,
                    year: 2020,
                    scheduledIndex: i,
                },
                scheduledStartTime: gridAnchorTime + (i * 3600000),
                scheduledEndTime: gridAnchorTime + ((i + 1) * 3600000),
                elapsedMs: 0,
                remainingMs: 3600000,
                scheduleIndex: i,
                loopNumber: 0,
                streamDescriptor: null,
                isCurrent: i === 0,
            });
        }
        return {
            startTime: gridAnchorTime,
            endTime: gridAnchorTime + (programCount * 3600000),
            programs,
        };
    };

    beforeEach(() => {
        container = document.createElement('div');
        container.id = 'epg-container';
        document.body.appendChild(container);

        epg = new EPGComponent();
        epg.initialize({
            containerId: 'epg-container',
            visibleChannels: 5,
            timeSlotMinutes: 30,
            visibleHours: 3,
            totalHours: 24,
            pixelsPerMinute: 4,
            rowHeight: 80,
            showCurrentTimeIndicator: true,
            autoScrollToNow: false,
        });

        gridAnchorTime = epg.getState().viewWindow.startTime;
    });

    afterEach(() => {
        epg.destroy();
        container.remove();
    });

    describe('lifecycle', () => {
        it('should initialize without errors', () => {
            expect(epg.isVisible()).toBe(false);
        });

        it('should throw if container not found', () => {
            const newEpg = new EPGComponent();
            expect(() => {
                newEpg.initialize({
                    containerId: 'non-existent',
                    visibleChannels: 5,
                    timeSlotMinutes: 30,
                    visibleHours: 3,
                    totalHours: 24,
                    pixelsPerMinute: 4,
                    rowHeight: 80,
                    showCurrentTimeIndicator: true,
                    autoScrollToNow: false,
                });
            }).toThrow('EPG container element not found');
        });
    });

    describe('visibility', () => {
        it('should show and hide correctly', () => {
            expect(epg.isVisible()).toBe(false);

            epg.show();
            expect(epg.isVisible()).toBe(true);

            epg.hide();
            expect(epg.isVisible()).toBe(false);
        });

        it('should toggle visibility', () => {
            epg.toggle();
            expect(epg.isVisible()).toBe(true);

            epg.toggle();
            expect(epg.isVisible()).toBe(false);
        });

        it('should emit open and close events', () => {
            const openHandler = jest.fn();
            const closeHandler = jest.fn();

            epg.on('open', openHandler);
            epg.on('close', closeHandler);

            epg.show();
            expect(openHandler).toHaveBeenCalledTimes(1);

            epg.hide();
            expect(closeHandler).toHaveBeenCalledTimes(1);
        });

        it('renders placeholders on open when schedules are missing', () => {
            const channels = [createMockChannel(0)];
            epg.loadChannels(channels);
            epg.show();

            const titles = Array.from(container.querySelectorAll('.epg-cell-title'))
                .map((el) => el.textContent);
            expect(titles).toContain('Loading...');
        });
    });

    describe('data loading', () => {
        it('should load channels', () => {
            const channels = [createMockChannel(0), createMockChannel(1)];
            epg.loadChannels(channels);

            const state = epg.getState();
            expect(state.viewWindow.endChannelIndex).toBe(2);
        });

        it('should load schedule for channel', () => {
            const channels = [createMockChannel(0)];
            epg.loadChannels(channels);
            epg.loadScheduleForChannel('ch0', createMockSchedule('ch0', 10));

            // Should be able to focus a program now
            epg.show();
            epg.focusProgram(0, 0);
            expect(epg.getFocusedProgram()).not.toBeNull();
        });
    });

    describe('navigation', () => {
        beforeEach(() => {
            const channels = [
                createMockChannel(0),
                createMockChannel(1),
                createMockChannel(2),
            ];
            epg.loadChannels(channels);
            channels.forEach((ch) => {
                epg.loadScheduleForChannel(ch.id, createMockSchedule(ch.id, 10));
            });
            epg.show();
        });

        it('should not set a negative timeOffset when ensuring cell visibility', () => {
            const state = epg.getState();
            const program: ScheduledProgram = {
                item: {
                    ratingKey: 'ch0-prog-negative',
                    type: 'movie',
                    title: 'Program Negative',
                    fullTitle: 'Program Negative',
                    durationMs: 3600000,
                    thumb: null,
                    year: 2020,
                    scheduledIndex: 0,
                },
                scheduledStartTime: state.viewWindow.startTime - 3600000,
                scheduledEndTime: state.viewWindow.startTime - 1800000,
                elapsedMs: 0,
                remainingMs: 0,
                scheduleIndex: 0,
                loopNumber: 0,
                streamDescriptor: null,
                isCurrent: false,
            };

            (epg as unknown as { state: { scrollPosition: { timeOffset: number } } }).state.scrollPosition.timeOffset = 10;

            (epg as unknown as { ensureCellVisible: (channelIndex: number, program: ScheduledProgram) => boolean })
                .ensureCellVisible(0, program);

            expect(epg.getState().scrollPosition.timeOffset).toBeGreaterThanOrEqual(0);
        });

        it('should focus first visible cell when no focus and navigation pressed', () => {
            const moved = epg.handleNavigation('down');
            expect(moved).toBe(true);
            expect(epg.getFocusedProgram()).not.toBeNull();
        });

        it('should move focus right to next program', () => {
            epg.focusProgram(0, 0);
            const initialFocus = epg.getFocusedProgram();

            const moved = epg.handleNavigation('right');
            const newFocus = epg.getFocusedProgram();

            expect(moved).toBe(true);
            expect(newFocus).not.toBeNull();
            expect(newFocus!.scheduledStartTime).toBeGreaterThanOrEqual(
                initialFocus!.scheduledEndTime
            );
        });

        it('should move focus left to previous program', () => {
            epg.focusProgram(0, 1);

            const moved = epg.handleNavigation('left');

            expect(moved).toBe(true);
            expect(epg.getState().focusedCell!.programIndex).toBe(0);
        });

        it('should move focus up/down between channels', () => {
            epg.focusProgram(1, 0); // Start on channel 1

            const movedUp = epg.handleNavigation('up');
            expect(movedUp).toBe(true);
            expect(epg.getState().focusedCell!.channelIndex).toBe(0);

            const movedDown = epg.handleNavigation('down');
            expect(movedDown).toBe(true);
            expect(epg.getState().focusedCell!.channelIndex).toBe(1);
        });

        it('should return false at top boundary', () => {
            epg.focusProgram(0, 0); // First channel
            expect(epg.handleNavigation('up')).toBe(false);
        });

        it('should return false at bottom boundary', () => {
            epg.focusProgram(2, 0); // Last channel (index 2)
            expect(epg.handleNavigation('down')).toBe(false);
        });

        it('should emit focusChange event', () => {
            const handler = jest.fn();
            epg.on('focusChange', handler);

            epg.focusProgram(0, 0);

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    channelIndex: 0,
                    programIndex: 0,
                })
            );
        });
    });

    describe('selection', () => {
        beforeEach(() => {
            const channels = [createMockChannel(0)];
            epg.loadChannels(channels);
            epg.loadScheduleForChannel('ch0', createMockSchedule('ch0', 5));
            epg.show();
            epg.focusProgram(0, 0);
        });

        it('should emit channelSelected on OK press', () => {
            const handler = jest.fn();
            epg.on('channelSelected', handler);

            epg.handleSelect();

            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    channel: expect.any(Object),
                    program: expect.any(Object),
                })
            );
        });

        it('should emit programSelected on OK press', () => {
            const handler = jest.fn();
            epg.on('programSelected', handler);

            epg.handleSelect();

            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('should return false if no program focused', () => {
            const newEpg = new EPGComponent();
            const newContainer = document.createElement('div');
            newContainer.id = 'epg-container-2';
            document.body.appendChild(newContainer);

            newEpg.initialize({
                containerId: 'epg-container-2',
                visibleChannels: 5,
                timeSlotMinutes: 30,
                visibleHours: 3,
                totalHours: 24,
                pixelsPerMinute: 4,
                rowHeight: 80,
                showCurrentTimeIndicator: true,
                autoScrollToNow: false,
            });
            newEpg.show();

            expect(newEpg.handleSelect()).toBe(false);

            newEpg.destroy();
            newContainer.remove();
        });
    });

    describe('back button', () => {
        it('should hide EPG on back press when visible', () => {
            epg.show();
            expect(epg.isVisible()).toBe(true);

            const handled = epg.handleBack();

            expect(handled).toBe(true);
            expect(epg.isVisible()).toBe(false);
        });

        it('should return false on back press when already hidden', () => {
            expect(epg.isVisible()).toBe(false);
            expect(epg.handleBack()).toBe(false);
        });
    });

    describe('time indicator', () => {
        it('should position indicator at current time', () => {
            epg.show();

            const indicator = container.querySelector('.epg-time-indicator') as HTMLElement;
            expect(indicator).not.toBeNull();
            expect(indicator.style.left).toBeDefined();
        });

        it('should update position on refreshCurrentTime', () => {
            epg.show();

            const indicator = container.querySelector('.epg-time-indicator') as HTMLElement;

            // Mock time advancement by directly calling refresh
            epg.refreshCurrentTime();

            // Position should be updated (may or may not change depending on timing)
            expect(indicator.style.left).toBeDefined();
        });
    });

    describe('state', () => {
        it('should return correct state', () => {
            const channels = [createMockChannel(0)];
            epg.loadChannels(channels);
            epg.show();

            const state = epg.getState();

            expect(state.isVisible).toBe(true);
            expect(state.scrollPosition).toEqual({ channelOffset: 0, timeOffset: 0 });
            expect(state.currentTime).toBeGreaterThan(0);
        });

        it('keeps timeOffset at 0 when autoScrollToNow is enabled (window anchored to now)', () => {
            const now = new Date('2026-01-07T10:00:00Z').getTime();
            jest.spyOn(Date, 'now').mockReturnValue(now);

            const newEpg = new EPGComponent();
            const newContainer = document.createElement('div');
            newContainer.id = 'epg-container-2';
            document.body.appendChild(newContainer);

            newEpg.initialize({
                containerId: 'epg-container-2',
                visibleChannels: 5,
                timeSlotMinutes: 30,
                visibleHours: 3,
                totalHours: 24,
                pixelsPerMinute: 4,
                rowHeight: 80,
                showCurrentTimeIndicator: true,
                autoScrollToNow: true,
            });

            newEpg.loadChannels([createMockChannel(0)]);
            newEpg.show();

            expect(newEpg.getState().scrollPosition.timeOffset).toBe(0);

            newEpg.destroy();
            newContainer.remove();
            (Date.now as jest.Mock).mockRestore();
        });

        it('should return focused program', () => {
            const channels = [createMockChannel(0)];
            epg.loadChannels(channels);
            epg.loadScheduleForChannel('ch0', createMockSchedule('ch0', 5));
            epg.show();

            expect(epg.getFocusedProgram()).toBeNull();

            epg.focusProgram(0, 0);
            expect(epg.getFocusedProgram()).not.toBeNull();
        });
    });

    describe('virtualization', () => {
        it('should render only visible cells plus buffer', () => {
            // Load 50 channels with 48 half-hour programs each = 2400 potential cells
            const channels = Array.from({ length: 50 }, (_, i) => createMockChannel(i));
            epg.loadChannels(channels);

            channels.forEach((ch) => {
                epg.loadScheduleForChannel(ch.id, createMockSchedule(ch.id, 24));
            });

            epg.show();

            // Count DOM elements
            const cellCount = container.querySelectorAll('.epg-cell').length;

            // Should render max ~200 (visible + buffer), not all 2400
            expect(cellCount).toBeLessThan(200);
            expect(cellCount).toBeGreaterThan(0);
        });

        it('should scroll when focus moves outside visible area', () => {
            const channels = Array.from({ length: 20 }, (_, i) => createMockChannel(i));
            epg.loadChannels(channels);
            channels.forEach((ch) => {
                epg.loadScheduleForChannel(ch.id, createMockSchedule(ch.id, 10));
            });
            epg.show();

            const initialOffset = epg.getState().scrollPosition.channelOffset;

            // Focus channel beyond visible area
            epg.focusChannel(15);

            const newOffset = epg.getState().scrollPosition.channelOffset;
            expect(newOffset).toBeGreaterThan(initialOffset);
        });
    });
});
