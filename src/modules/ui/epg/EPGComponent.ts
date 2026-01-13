/**
 * @fileoverview EPG Component - Main orchestrator for Electronic Program Guide
 * @module modules/ui/epg/EPGComponent
 * @version 1.0.0
 */

import { EventEmitter } from '../../../utils/EventEmitter';
import { EPG_CONSTANTS, EPG_CLASSES, EPG_ERRORS, DEFAULT_EPG_CONFIG } from './constants';
import { EPGVirtualizer } from './EPGVirtualizer';
import { EPGInfoPanel } from './EPGInfoPanel';
import { EPGTimeHeader } from './EPGTimeHeader';
import { EPGChannelList } from './EPGChannelList';
import { EPGErrorBoundary } from './EPGErrorBoundary';
import { rafThrottle, appendEpgDebugLog } from './utils';
import type { IEPGComponent } from './interfaces';
import type {
    EPGConfig,
    EPGState,
    EPGEventMap,
    EPGInternalState,
    ScheduledProgram,
    ScheduleWindow,
    ChannelConfig,
} from './types';

/**
 * EPG Component class.
 * Main orchestrator for the Electronic Program Guide grid.
 * Implements virtualized rendering for 60fps performance on TV hardware.
 */
export class EPGComponent extends EventEmitter<EPGEventMap> implements IEPGComponent {
    private config: EPGConfig = DEFAULT_EPG_CONFIG as unknown as EPGConfig;

    private state: EPGInternalState = {
        isInitialized: false,
        isVisible: false,
        channels: [],
        schedules: new Map(),
        scheduleLoadTimes: new Map(),
        focusedCell: null,
        focusTimeMs: Date.now(),
        scrollPosition: { channelOffset: 0, timeOffset: 0 },
        currentTime: Date.now(),
        gridAnchorTime: 0,
        lastRenderTime: 0,
    };

    // Sub-components
    private virtualizer: EPGVirtualizer = new EPGVirtualizer();
    private infoPanel: EPGInfoPanel = new EPGInfoPanel();
    private timeHeader: EPGTimeHeader = new EPGTimeHeader();
    private channelList: EPGChannelList = new EPGChannelList();
    private errorBoundary: EPGErrorBoundary = new EPGErrorBoundary();

    // DOM elements
    private containerElement: HTMLElement | null = null;
    private gridElement: HTMLElement | null = null;
    private programAreaElement: HTMLElement | null = null;
    private timeIndicatorElement: HTMLElement | null = null;
    private hasRenderedOnce: boolean = false;
    private lastVisibleRangeKey: string | null = null;

    // Timers
    private timeUpdateInterval: ReturnType<typeof setInterval> | null = null;

    // Throttled render function for 60fps performance
    private throttledRenderGrid = rafThrottle(() => this.renderGridInternal());

    /**
     * Initialize the EPG component with configuration.
     *
     * @param config - EPG configuration
     */
    initialize(config: EPGConfig): void {
        if (this.state.isInitialized) {
            console.warn('[EPG] Already initialized');
            return;
        }

        this.config = { ...DEFAULT_EPG_CONFIG, ...config } as EPGConfig;
        this.state.currentTime = Date.now();
        this.state.gridAnchorTime = this.calculateGridAnchorTime(this.state.currentTime);
        this.state.focusTimeMs = this.state.currentTime;

        // Find container element
        this.containerElement = document.getElementById(this.config.containerId);
        if (!this.containerElement) {
            throw new Error(EPG_ERRORS.CONTAINER_NOT_FOUND);
        }

        // Create DOM structure
        this.createDOMStructure();

        // Initialize sub-components
        if (this.gridElement && this.programAreaElement) {
            this.virtualizer.initialize(this.programAreaElement, this.config, this.state.gridAnchorTime);
            this.timeHeader.initialize(this.gridElement, this.config, this.state.gridAnchorTime);
            this.channelList.initialize(this.gridElement, this.config);
            this.infoPanel.initialize(this.containerElement);
        }

        // Create time indicator
        this.createTimeIndicator();

        // Initialize error boundary callbacks
        this.initializeErrorBoundary();

        // Timer starts when shown, not at init (optimization)

        this.state.isInitialized = true;
    }

    private isDebugEnabled(): boolean {
        try {
            return localStorage.getItem('retune_debug_epg') === '1';
        } catch {
            return false;
        }
    }

    /**
     * Destroy the EPG component and clean up resources.
     */
    destroy(): void {
        this.stopTimeUpdateInterval();

        this.virtualizer.destroy();
        this.infoPanel.destroy();
        this.timeHeader.destroy();
        this.channelList.destroy();

        if (this.containerElement) {
            this.containerElement.innerHTML = '';
            this.containerElement.classList.remove(EPG_CLASSES.CONTAINER_VISIBLE);
        }

        this.containerElement = null;
        this.gridElement = null;
        this.programAreaElement = null;
        this.timeIndicatorElement = null;

        this.state = {
            isInitialized: false,
            isVisible: false,
            channels: [],
            schedules: new Map(),
            scheduleLoadTimes: new Map(),
            focusedCell: null,
            focusTimeMs: Date.now(),
            scrollPosition: { channelOffset: 0, timeOffset: 0 },
            currentTime: Date.now(),
            gridAnchorTime: 0,
            lastRenderTime: 0,
        };
        this.hasRenderedOnce = false;

        this.errorBoundary.destroy();
        this.removeAllListeners();
    }

    /**
     * Initialize error boundary with recovery callbacks.
     */
    private initializeErrorBoundary(): void {
        this.errorBoundary.setCallbacks({
            showFallbackRow: (context: string) => {
                console.warn(`[EPG] Showing fallback for: ${context}`);
                // Fallback: just skip the problematic row, don't crash
            },
            resetScrollPosition: () => {
                this.state.scrollPosition = { channelOffset: 0, timeOffset: 0 };
                this.renderGrid();
            },
            forceRecycleAll: () => {
                this.virtualizer.forceRecycleAll();
            },
        });

        // Forward degraded mode events
        this.errorBoundary.on('degradedMode', (data) => {
            console.error('[EPG] Degraded mode:', data);
        });
    }

    /**
     * Create the DOM structure for the EPG.
     */
    private createDOMStructure(): void {
        if (!this.containerElement) return;

        this.containerElement.className = EPG_CLASSES.CONTAINER;
        this.containerElement.innerHTML = `
      <div class="${EPG_CLASSES.GRID}">
        <div class="${EPG_CLASSES.PROGRAM_AREA}"></div>
      </div>
    `;

        this.gridElement = this.containerElement.querySelector(`.${EPG_CLASSES.GRID}`);
        this.programAreaElement = this.containerElement.querySelector(`.${EPG_CLASSES.PROGRAM_AREA}`);
    }

    /**
     * Create the current time indicator element.
     */
    private createTimeIndicator(): void {
        if (!this.programAreaElement) return;

        this.timeIndicatorElement = document.createElement('div');
        this.timeIndicatorElement.className = EPG_CLASSES.TIME_INDICATOR;
        this.programAreaElement.appendChild(this.timeIndicatorElement);

        this.updateTimeIndicatorPosition();
    }

    /**
     * Calculate the grid anchor time (start of schedule day, typically midnight).
     *
     * @param currentTime - Current time in milliseconds
     * @returns Anchor time (start of day) in milliseconds
     */
    private calculateGridAnchorTime(currentTime: number): number {
        const date = new Date(currentTime);
        date.setHours(0, 0, 0, 0);
        return date.getTime();
    }

    /**
     * Set the grid anchor time (left edge of the EPG timeline).
     * Used to shift the guide window to start at "now".
     */
    setGridAnchorTime(anchorTime: number): void {
        this.state.gridAnchorTime = anchorTime;
        this.virtualizer.setGridAnchorTime(anchorTime);
        this.timeHeader.setGridAnchorTime(anchorTime);
        this.updateTimeIndicatorPosition();
        if (this.state.isVisible) {
            this.renderGrid();
        }
    }

    /**
     * Start the time update interval.
     */
    private startTimeUpdateInterval(): void {
        if (this.timeUpdateInterval) return;

        this.timeUpdateInterval = setInterval(() => {
            this.refreshCurrentTime();
        }, EPG_CONSTANTS.TIME_INDICATOR_UPDATE_MS);
    }

    /**
     * Stop the time update interval.
     */
    private stopTimeUpdateInterval(): void {
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }
    }

    // ============================================
    // Visibility Methods
    // ============================================

    /**
     * Show the EPG overlay.
     */
    show(options?: { preserveFocus?: boolean }): void {
        if (!this.state.isInitialized || !this.containerElement) return;

        this.containerElement.classList.add(EPG_CLASSES.CONTAINER_VISIBLE);
        this.state.isVisible = true;
        this.lastVisibleRangeKey = null;

        // Start time indicator updates (paused when hidden)
        this.startTimeUpdateInterval();

        const shouldPreserveFocus = Boolean(options?.preserveFocus && this.state.focusedCell);
        if (this.config.autoScrollToNow && !shouldPreserveFocus) {
            this.setTimeOffsetToNow();
        }

        // Render immediately on open to avoid a blank guide before first input.
        this.renderGridInternal();

        // Auto-focus current program if available.
        if (this.config.autoScrollToNow && !shouldPreserveFocus) {
            this.focusNow();
        }

        if (this.isDebugEnabled()) {
            const payload = {
                channelCount: this.state.channels.length,
                scheduleCount: this.state.schedules.size,
                timeOffset: this.state.scrollPosition.timeOffset,
                gridAnchorTime: this.state.gridAnchorTime,
            };
            console.warn('[EPG] show', payload);
            appendEpgDebugLog('EPG.show', payload);
        }

        this.emit('open', undefined);
    }

    /**
     * Hide the EPG overlay.
     */
    hide(): void {
        if (!this.containerElement) return;

        this.containerElement.classList.remove(EPG_CLASSES.CONTAINER_VISIBLE);
        this.state.isVisible = false;

        // Stop time updates when hidden (CPU optimization)
        this.stopTimeUpdateInterval();

        this.infoPanel.hide();
        this.emit('close', undefined);
    }

    /**
     * Toggle EPG visibility.
     */
    toggle(): void {
        if (this.state.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Check if EPG is currently visible.
     *
     * @returns true if visible
     */
    isVisible(): boolean {
        return this.state.isVisible;
    }

    // ============================================
    // Data Loading Methods
    // ============================================

    /**
     * Load channel list into EPG.
     *
     * @param channels - Array of channel configurations
     */
    loadChannels(channels: ChannelConfig[]): void {
        this.state.channels = channels;
        this.virtualizer.setChannelCount(channels.length);
        this.channelList.updateChannels(channels);

        if (this.state.isVisible) {
            if (this.config.autoScrollToNow && this.state.scrollPosition.timeOffset === 0) {
                this.setTimeOffsetToNow();
            }
            if (!this.hasRenderedOnce) {
                this.renderGridInternal();
            } else {
                this.renderGrid();
            }
        }

        if (this.isDebugEnabled()) {
            const payload = {
                channelCount: channels.length,
                timeOffset: this.state.scrollPosition.timeOffset,
            };
            console.warn('[EPG] loadChannels', payload);
            appendEpgDebugLog('EPG.loadChannels', payload);
        }
    }

    /**
     * Load schedule for a specific channel.
     *
     * @param channelId - Channel ID
     * @param schedule - Schedule window with programs
     */
    loadScheduleForChannel(channelId: string, schedule: ScheduleWindow): void {
        this.state.schedules.set(channelId, schedule);
        this.state.scheduleLoadTimes.set(channelId, Date.now());

        const focused = this.state.focusedCell;
        if (focused && this.state.channels[focused.channelIndex]?.id === channelId) {
            const focusTime = this.state.focusTimeMs;
            this.focusProgramAtTime(focused.channelIndex, focusTime);
        }

        if (this.state.isVisible) {
            if (!this.hasRenderedOnce) {
                this.renderGridInternal();
            } else {
                this.renderGrid();
            }
        }

        if (this.isDebugEnabled()) {
            const payload = {
                channelId,
                programCount: schedule.programs.length,
                startTime: schedule.startTime,
                endTime: schedule.endTime,
            };
            console.warn('[EPG] loadScheduleForChannel', payload);
            appendEpgDebugLog('EPG.loadScheduleForChannel', payload);
        }
    }

    /**
     * Refresh the current time indicator position.
     */
    refreshCurrentTime(): void {
        this.state.currentTime = Date.now();
        this.updateTimeIndicatorPosition();
    }

    /**
     * Update the time indicator position.
     */
    private updateTimeIndicatorPosition(): void {
        if (!this.timeIndicatorElement || !this.config) return;

        const minutesFromAnchor = (this.state.currentTime - this.state.gridAnchorTime) / 60000;
        const left = minutesFromAnchor * this.config.pixelsPerMinute;

        this.timeIndicatorElement.style.left = `${left}px`;
    }

    // ============================================
    // Navigation Methods
    // ============================================

    /**
     * Focus a specific channel row.
     *
     * @param channelIndex - Channel index (0-based)
     */
    focusChannel(channelIndex: number): void {
        if (channelIndex < 0 || channelIndex >= this.state.channels.length) return;

        // Find first program in this channel's schedule
        const channel = this.state.channels[channelIndex];
        if (!channel) return;
        const schedule = this.state.schedules.get(channel.id);

        const targetTime = this.state.focusTimeMs || Date.now();
        if (schedule && schedule.programs.length > 0) {
            this.focusProgramAtTime(channelIndex, targetTime);
            return;
        }

        this.focusPlaceholder(channelIndex, targetTime);
    }

    /**
     * Focus a specific program cell.
     *
     * @param channelIndex - Channel index (0-based)
     * @param programIndex - Program index within channel
     */
    focusProgram(channelIndex: number, programIndex: number): void {
        if (channelIndex < 0 || channelIndex >= this.state.channels.length) return;

        const channel = this.state.channels[channelIndex];
        if (!channel) return;
        const schedule = this.state.schedules.get(channel.id);

        if (!schedule || programIndex < 0 || programIndex >= schedule.programs.length) return;

        const program = schedule.programs[programIndex];
        if (!program) return;

        // Update focus state
        const previousFocus = this.state.focusedCell;
        if (previousFocus && previousFocus.cellElement) {
            previousFocus.cellElement.classList.remove(EPG_CLASSES.CELL_FOCUSED);
        }

        // Ensure cell is visible (may require scrolling/render)
        const didScroll = this.ensureCellVisible(channelIndex, program);

        const focusTimeMs = this.getProgramFocusTime(program);
        // Try to focus immediately if the cell is already rendered; otherwise defer until renderGridInternal()
        const cellElement = this.virtualizer.setFocusedCell(
            channel.id,
            program.scheduledStartTime,
            focusTimeMs
        );
        if (didScroll || !cellElement) {
            this.renderGrid();
        }
        this.state.focusTimeMs = focusTimeMs;
        this.state.focusedCell = {
            kind: 'program',
            channelIndex,
            programIndex,
            program,
            focusTimeMs,
            cellElement,
        };

        // Update channel list focus
        this.channelList.setFocusedChannel(channelIndex);

        // Update info panel
        this.infoPanel.update(program);

        // Emit focus change event
        this.emit('focusChange', this.state.focusedCell);
    }

    /**
     * Focus the currently airing program on the current channel.
     */
    focusNow(): void {
        const now = Date.now();
        this.state.focusTimeMs = now;

        // EPG window is anchored to "now"; do not scroll back into the past.
        this.state.scrollPosition.timeOffset = 0;
        this.timeHeader.updateScrollPosition(this.state.scrollPosition.timeOffset);

        // Track if we focused a program (to avoid redundant render)
        let didFocus = false;

        // If we have a focused channel, find current program there
        const channelIndex = this.state.focusedCell
            ? this.state.focusedCell.channelIndex
            : 0;

        if (channelIndex >= 0 && channelIndex < this.state.channels.length) {
            const channel = this.state.channels[channelIndex];
            if (channel) {
                const schedule = this.state.schedules.get(channel.id);

                if (schedule) {
                    const currentProgramIndex = schedule.programs.findIndex(
                        (p) => now >= p.scheduledStartTime && now < p.scheduledEndTime
                    );

                    if (currentProgramIndex >= 0) {
                        this.focusProgram(channelIndex, currentProgramIndex);
                        didFocus = true;
                    }
                }
            }
        }

        // Only render if focusProgram wasn't called (it already renders)
        if (!didFocus) {
            this.renderGrid();
        }
    }

    /**
     * Scroll the grid to a specific time.
     *
     * @param time - Unix timestamp (ms)
     */
    scrollToTime(time: number): void {
        const previousOffset = this.state.scrollPosition.timeOffset;
        const minutesFromAnchor = (time - this.state.gridAnchorTime) / 60000;
        this.state.scrollPosition.timeOffset = Math.max(0, minutesFromAnchor);
        this.state.focusTimeMs = time;

        this.timeHeader.updateScrollPosition(this.state.scrollPosition.timeOffset);
        this.renderGrid();

        this.emit('timeScroll', {
            direction: this.state.scrollPosition.timeOffset >= previousOffset ? 'right' : 'left',
            newOffset: this.state.scrollPosition.timeOffset,
        });
    }

    /**
     * Scroll the grid to a specific channel.
     *
     * @param channelIndex - Channel index (0-based)
     */
    scrollToChannel(channelIndex: number): void {
        const previousOffset = this.state.scrollPosition.channelOffset;
        const maxOffset = Math.max(0, this.state.channels.length - this.config.visibleChannels);
        this.state.scrollPosition.channelOffset = Math.max(0, Math.min(channelIndex, maxOffset));

        this.channelList.updateScrollPosition(this.state.scrollPosition.channelOffset);
        this.renderGrid();

        this.emit('channelScroll', {
            direction: this.state.scrollPosition.channelOffset >= previousOffset ? 'down' : 'up',
            newOffset: this.state.scrollPosition.channelOffset,
        });
    }

    /**
     * Ensure a cell is visible by scrolling if needed.
     *
     * @param channelIndex - Channel index
     * @param program - Program to make visible
     */
    private ensureCellVisible(channelIndex: number, program: ScheduledProgram): boolean {
        const { scrollPosition } = this.state;
        const { visibleChannels, visibleHours } = this.config;
        let didScroll = false;

        // Check vertical visibility
        if (channelIndex < scrollPosition.channelOffset) {
            const maxOffset = Math.max(0, this.state.channels.length - visibleChannels);
            this.state.scrollPosition.channelOffset = Math.max(0, Math.min(channelIndex, maxOffset));
            this.channelList.updateScrollPosition(this.state.scrollPosition.channelOffset);
            didScroll = true;
        } else if (channelIndex >= scrollPosition.channelOffset + visibleChannels) {
            const targetOffset = channelIndex - visibleChannels + 1;
            const maxOffset = Math.max(0, this.state.channels.length - visibleChannels);
            this.state.scrollPosition.channelOffset = Math.max(0, Math.min(targetOffset, maxOffset));
            this.channelList.updateScrollPosition(this.state.scrollPosition.channelOffset);
            didScroll = true;
        }

        // Check horizontal visibility
        const programStartMinutes = (program.scheduledStartTime - this.state.gridAnchorTime) / 60000;
        const programEndMinutes = (program.scheduledEndTime - this.state.gridAnchorTime) / 60000;
        const visibleEndMinutes = scrollPosition.timeOffset + (visibleHours * 60);
        const clampTimeOffset = (minutes: number): number => Math.max(0, minutes);

        if (programStartMinutes < scrollPosition.timeOffset) {
            this.state.scrollPosition.timeOffset = clampTimeOffset(programStartMinutes);
            this.timeHeader.updateScrollPosition(this.state.scrollPosition.timeOffset);
            didScroll = true;
        } else if (programEndMinutes > visibleEndMinutes) {
            this.state.scrollPosition.timeOffset = clampTimeOffset(programEndMinutes - (visibleHours * 60));
            this.timeHeader.updateScrollPosition(this.state.scrollPosition.timeOffset);
            didScroll = true;
        }

        return didScroll;
    }

    private ensureTimeVisible(targetTimeMs: number): boolean {
        const { visibleHours, totalHours } = this.config;
        const minutesFromAnchor = (targetTimeMs - this.state.gridAnchorTime) / 60000;
        const maxOffset = Math.max(0, (totalHours * 60) - (visibleHours * 60));
        const clampOffset = (minutes: number): number => Math.max(0, Math.min(minutes, maxOffset));
        let didScroll = false;

        if (minutesFromAnchor < this.state.scrollPosition.timeOffset) {
            this.state.scrollPosition.timeOffset = clampOffset(minutesFromAnchor);
            this.timeHeader.updateScrollPosition(this.state.scrollPosition.timeOffset);
            didScroll = true;
        } else if (minutesFromAnchor > this.state.scrollPosition.timeOffset + (visibleHours * 60)) {
            this.state.scrollPosition.timeOffset = clampOffset(minutesFromAnchor - (visibleHours * 60));
            this.timeHeader.updateScrollPosition(this.state.scrollPosition.timeOffset);
            didScroll = true;
        }

        return didScroll;
    }

    private getProgramFocusTime(program: ScheduledProgram): number {
        const start = program.scheduledStartTime;
        const end = program.scheduledEndTime;
        const elapsed = typeof program.elapsedMs === 'number' ? program.elapsedMs : 0;
        const candidate = start + Math.max(0, elapsed);
        return Math.min(Math.max(candidate, start), Math.max(start, end - 1));
    }

    private focusPlaceholder(channelIndex: number, targetTime: number): void {
        if (channelIndex < 0 || channelIndex >= this.state.channels.length) return;

        const didScroll = this.ensureTimeVisible(targetTime);
        if (didScroll) {
            this.renderGrid();
        }

        const visibleStartMs = this.state.gridAnchorTime + (this.state.scrollPosition.timeOffset * 60000);
        const visibleEndMs = this.state.gridAnchorTime +
            ((this.state.scrollPosition.timeOffset + (this.config.visibleHours * 60)) * 60000);
        const clampedTime = Math.min(Math.max(targetTime, visibleStartMs), Math.max(visibleStartMs, visibleEndMs - 1));

        this.state.focusTimeMs = clampedTime;
        this.state.focusedCell = {
            kind: 'placeholder',
            channelIndex,
            programIndex: -1,
            placeholder: {
                label: 'Loading...',
                scheduledStartTime: visibleStartMs,
                scheduledEndTime: visibleEndMs,
            },
            focusTimeMs: clampedTime,
            cellElement: null,
        };

        this.channelList.setFocusedChannel(channelIndex);
        this.infoPanel.hide();
        this.renderGrid();
        this.emit('focusChange', this.state.focusedCell);
    }

    // ============================================
    // Input Handling Methods
    // ============================================

    /**
     * Handle D-pad navigation input.
     *
     * @param direction - Navigation direction
     * @returns true if navigation was handled, false if at boundary
     */
    handleNavigation(direction: 'up' | 'down' | 'left' | 'right'): boolean {
        const { focusedCell, channels } = this.state;

        // If no focus, focus first visible cell
        if (!focusedCell) {
            if (channels.length > 0) {
                const targetTime = this.state.gridAnchorTime +
                    (this.state.scrollPosition.timeOffset * 60000);
                this.focusProgramAtTime(this.state.scrollPosition.channelOffset, targetTime);
                return true;
            }
            return false;
        }

        switch (direction) {
            case 'up':
                return this.navigateUp();
            case 'down':
                return this.navigateDown();
            case 'left':
                return this.navigateLeft();
            case 'right':
                return this.navigateRight();
            default:
                return false;
        }
    }

    /**
     * Navigate up to previous channel.
     */
    private navigateUp(): boolean {
        const { focusedCell } = this.state;
        if (!focusedCell) return false;

        if (focusedCell.channelIndex > 0) {
            const prevChannel = focusedCell.channelIndex - 1;
            const targetTime = focusedCell.focusTimeMs ?? this.state.focusTimeMs;
            this.focusProgramAtTime(prevChannel, targetTime);
            return true;
        }

        return false; // At top boundary
    }

    /**
     * Navigate down to next channel.
     */
    private navigateDown(): boolean {
        const { focusedCell, channels } = this.state;
        if (!focusedCell) return false;

        if (focusedCell.channelIndex < channels.length - 1) {
            const nextChannel = focusedCell.channelIndex + 1;
            const targetTime = focusedCell.focusTimeMs ?? this.state.focusTimeMs;
            this.focusProgramAtTime(nextChannel, targetTime);
            return true;
        }

        return false; // At bottom boundary
    }

    /**
     * Navigate left to previous program.
     */
    private navigateLeft(): boolean {
        const { focusedCell } = this.state;
        if (!focusedCell) return false;

        if (focusedCell.kind === 'placeholder') {
            const nextTime = Math.max(
                this.state.gridAnchorTime,
                focusedCell.focusTimeMs - (EPG_CONSTANTS.TIME_SCROLL_AMOUNT * 60000)
            );
            if (nextTime === focusedCell.focusTimeMs && this.state.scrollPosition.timeOffset === 0) {
                return false;
            }
            this.focusPlaceholder(focusedCell.channelIndex, nextTime);
            return true;
        }

        if (focusedCell.programIndex > 0) {
            this.focusProgram(focusedCell.channelIndex, focusedCell.programIndex - 1);
            return true;
        }

        // At left edge - check if we can scroll back in time
        const minutesFromAnchor = (focusedCell.program.scheduledStartTime - this.state.gridAnchorTime) / 60000;
        if (minutesFromAnchor <= 0) {
            return false; // At start of schedule day
        }

        // Scroll time back
        this.state.scrollPosition.timeOffset = Math.max(
            0,
            this.state.scrollPosition.timeOffset - EPG_CONSTANTS.TIME_SCROLL_AMOUNT
        );
        this.timeHeader.updateScrollPosition(this.state.scrollPosition.timeOffset);
        this.renderGrid();

        // Find program that ends at or before the current program's start
        const channel = this.state.channels[focusedCell.channelIndex];
        if (channel) {
            const schedule = this.state.schedules.get(channel.id);
            if (schedule) {
                // Find the program immediately before the currently focused one
                // Use reverse search since programs are ordered by time
                let prevIndex = -1;
                for (let i = schedule.programs.length - 1; i >= 0; i--) {
                    const p = schedule.programs[i];
                    if (p && p.scheduledEndTime <= focusedCell.program.scheduledStartTime) {
                        prevIndex = i;
                        break;
                    }
                }

                if (prevIndex >= 0) {
                    this.focusProgram(focusedCell.channelIndex, prevIndex);
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Navigate right to next program.
     */
    private navigateRight(): boolean {
        const { focusedCell } = this.state;
        if (!focusedCell) return false;

        if (focusedCell.kind === 'placeholder') {
            const nextTime = focusedCell.focusTimeMs + (EPG_CONSTANTS.TIME_SCROLL_AMOUNT * 60000);
            this.focusPlaceholder(focusedCell.channelIndex, nextTime);
            return true;
        }

        const channel = this.state.channels[focusedCell.channelIndex];
        if (!channel) return false;
        const schedule = this.state.schedules.get(channel.id);

        if (!schedule) return false;

        if (focusedCell.programIndex < schedule.programs.length - 1) {
            this.focusProgram(focusedCell.channelIndex, focusedCell.programIndex + 1);
            return true;
        }

        // At right edge - check if we're at end of schedule day
        const programEndMinutes = (focusedCell.program.scheduledEndTime - this.state.gridAnchorTime) / 60000;
        const maxMinutes = this.config.totalHours * 60;

        if (programEndMinutes >= maxMinutes) {
            return false; // At end of schedule day
        }

        // Scroll time forward
        this.state.scrollPosition.timeOffset += EPG_CONSTANTS.TIME_SCROLL_AMOUNT;
        this.timeHeader.updateScrollPosition(this.state.scrollPosition.timeOffset);
        this.renderGrid();

        // Find and focus the next program after the current one
        const nextIndex = schedule.programs.findIndex(
            (p) => p.scheduledStartTime >= focusedCell.program.scheduledEndTime
        );
        if (nextIndex >= 0) {
            this.focusProgram(focusedCell.channelIndex, nextIndex);
        }

        return true;
    }

    /**
     * Focus program at a specific time on a channel.
     *
     * @param channelIndex - Channel index
     * @param targetTime - Target time (Unix ms)
     */
    private focusProgramAtTime(channelIndex: number, targetTime: number): void {
        const channel = this.state.channels[channelIndex];
        if (!channel) return;

        const schedule = this.state.schedules.get(channel.id);
        if (!schedule || schedule.programs.length === 0) {
            this.focusPlaceholder(channelIndex, targetTime);
            return;
        }

        this.state.focusTimeMs = targetTime;

        // Find program containing the target time
        let programIndex = schedule.programs.findIndex(
            (p) => targetTime >= p.scheduledStartTime && targetTime < p.scheduledEndTime
        );

        // If not found, find nearest program
        if (programIndex < 0) {
            programIndex = schedule.programs.findIndex(
                (p) => p.scheduledStartTime >= targetTime
            );
            if (programIndex < 0) {
                programIndex = schedule.programs.length - 1;
            }
        }

        this.focusProgram(channelIndex, programIndex);
    }

    /**
     * Handle OK/Select button press.
     *
     * @returns true if handled
     */
    handleSelect(): boolean {
        const { focusedCell } = this.state;
        if (!focusedCell) return false;

        const channel = this.state.channels[focusedCell.channelIndex];
        if (!channel) return false;

        if (focusedCell.kind === 'placeholder') {
            return false;
        }

        this.emit('channelSelected', {
            channel,
            program: focusedCell.program,
        });

        this.emit('programSelected', focusedCell.program);

        return true;
    }

    /**
     * Handle Back button press.
     *
     * @returns true if handled (closes EPG), false if already hidden
     */
    handleBack(): boolean {
        if (this.state.isVisible) {
            this.hide();
            return true;
        }
        return false;
    }

    // ============================================
    // State Methods
    // ============================================

    /**
     * Get current EPG state.
     *
     * @returns Current EPG state
     */
    getState(): EPGState {
        const { scrollPosition, currentTime, focusedCell, isVisible } = this.state;
        const { visibleHours, visibleChannels } = this.config;

        return {
            isVisible,
            focusedCell: focusedCell ?? null,
            scrollPosition,
            viewWindow: {
                startTime: this.state.gridAnchorTime + (scrollPosition.timeOffset * 60000),
                endTime: this.state.gridAnchorTime + ((scrollPosition.timeOffset + visibleHours * 60) * 60000),
                startChannelIndex: scrollPosition.channelOffset,
                endChannelIndex: Math.min(
                    scrollPosition.channelOffset + visibleChannels,
                    this.state.channels.length
                ),
            },
            currentTime,
        };
    }

    /**
     * Get the currently focused program.
     *
     * @returns Focused program or null
     */
    getFocusedProgram(): ScheduledProgram | null {
        if (this.state.focusedCell?.kind !== 'program') {
            return null;
        }
        return this.state.focusedCell.program;
    }

    // ============================================
    // Rendering Methods
    // ============================================

    /**
     * Render the visible portion of the grid (throttled for 60fps).
     */
    private renderGrid(): void {
        this.throttledRenderGrid();
    }

    /**
     * Internal render implementation called by throttled wrapper.
     */
    private renderGridInternal(): void {
        if (!this.state.isVisible || !this.state.isInitialized) return;

        this.errorBoundary.wrap('RENDER_ERROR', 'renderGrid', () => {
            this.timeHeader.updateScrollPosition(this.state.scrollPosition.timeOffset);
            this.virtualizer.updateScrollPosition(this.state.scrollPosition.timeOffset);
            const range = this.virtualizer.calculateVisibleRange(this.state.scrollPosition);
            this.maybeEmitVisibleRange(range);
            const channelIds = this.state.channels.map((c) => c.id);
            const focused = this.state.focusedCell;
            const focusedChannel = focused ? this.state.channels[focused.channelIndex] : undefined;
            const focusedKey = focused && focusedChannel
                ? focused.kind === 'program'
                    ? `${focusedChannel.id}-${focused.program.scheduledStartTime}`
                    : `${focusedChannel.id}-placeholder-${focused.placeholder.scheduledStartTime}`
                : undefined;

            this.virtualizer.renderVisibleCells(channelIds, this.state.schedules, range, focusedKey);

            // Ensure focus styling is applied after (re)rendering.
            if (focused && focusedChannel) {
                const focusStartTime = focused.kind === 'program'
                    ? focused.program.scheduledStartTime
                    : focused.placeholder.scheduledStartTime;
                focused.cellElement = this.virtualizer.setFocusedCell(
                    focusedChannel.id,
                    focusStartTime,
                    focused.focusTimeMs
                );
            }

            if (channelIds.length > 0) {
                this.hasRenderedOnce = true;
            }

            if (this.isDebugEnabled()) {
                const payload = {
                    channelCount: channelIds.length,
                    scheduleCount: this.state.schedules.size,
                    timeOffset: this.state.scrollPosition.timeOffset,
                    visibleRows: range.visibleRows.length,
                    renderedCells: this.virtualizer.getElementCount(),
                };
                console.warn('[EPG] renderGrid', payload);
                appendEpgDebugLog('EPG.renderGrid', payload);
            }
        });
    }

    private maybeEmitVisibleRange(_range: { visibleRows: number[] }): void {
        if (!this.config.onVisibleRangeChange) {
            return;
        }

        const channelStart = this.state.scrollPosition.channelOffset;
        const channelEnd = Math.min(
            channelStart + this.config.visibleChannels,
            this.state.channels.length
        );
        const timeStartMs = this.state.gridAnchorTime + (this.state.scrollPosition.timeOffset * 60000);
        const timeEndMs = this.state.gridAnchorTime +
            ((this.state.scrollPosition.timeOffset + (this.config.visibleHours * 60)) * 60000);

        const rangeKey = `${channelStart}-${channelEnd}-${timeStartMs}-${timeEndMs}`;
        if (rangeKey === this.lastVisibleRangeKey) {
            return;
        }

        this.lastVisibleRangeKey = rangeKey;
        this.config.onVisibleRangeChange({
            channelStart,
            channelEnd,
            timeStartMs,
            timeEndMs,
        });
    }

    private setTimeOffsetToNow(): void {
        const now = Date.now();
        const minutesFromAnchor = (now - this.state.gridAnchorTime) / 60000;
        const centerOffset = minutesFromAnchor - (this.config.visibleHours * 60 / 2);
        this.state.scrollPosition.timeOffset = Math.max(0, centerOffset);
        this.state.focusTimeMs = now;
        this.timeHeader.updateScrollPosition(this.state.scrollPosition.timeOffset);
    }
}
