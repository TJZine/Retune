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
import { rafThrottle } from './utils';
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
        focusedCell: null,
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
            focusedCell: null,
            scrollPosition: { channelOffset: 0, timeOffset: 0 },
            currentTime: Date.now(),
            gridAnchorTime: 0,
            lastRenderTime: 0,
        };

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
    show(): void {
        if (!this.state.isInitialized || !this.containerElement) return;

        this.containerElement.classList.add(EPG_CLASSES.CONTAINER_VISIBLE);
        this.state.isVisible = true;

        // Auto-scroll to current time if configured
        if (this.config.autoScrollToNow) {
            this.focusNow();
        }

        // Start time indicator updates (paused when hidden)
        this.startTimeUpdateInterval();

        this.renderGrid();
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
            this.renderGrid();
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

        if (this.state.isVisible) {
            this.renderGrid();
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

        if (schedule && schedule.programs.length > 0) {
            this.focusProgram(channelIndex, 0);
        } else {
            // Just scroll to channel if no programs
            this.scrollToChannel(channelIndex);
            this.channelList.setFocusedChannel(channelIndex);
        }
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

        // Set focus on new cell
        const cellElement = this.virtualizer.setFocusedCell(channel.id, program.scheduledStartTime);

        this.state.focusedCell = {
            channelIndex,
            programIndex,
            program,
            cellElement,
        };

        // Ensure cell is visible
        this.ensureCellVisible(channelIndex, program);

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

        // Calculate time offset to center current time
        const minutesFromAnchor = (now - this.state.gridAnchorTime) / 60000;
        const centerOffset = minutesFromAnchor - (this.config.visibleHours * 60 / 2);
        this.state.scrollPosition.timeOffset = Math.max(0, centerOffset);

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
                    } else if (schedule.programs.length > 0) {
                        this.focusProgram(channelIndex, 0);
                    }
                }
            }
        }

        this.renderGrid();
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
    private ensureCellVisible(channelIndex: number, program: ScheduledProgram): void {
        const { scrollPosition } = this.state;
        const { visibleChannels, visibleHours } = this.config;

        // Check vertical visibility
        if (channelIndex < scrollPosition.channelOffset) {
            this.scrollToChannel(channelIndex);
        } else if (channelIndex >= scrollPosition.channelOffset + visibleChannels) {
            this.scrollToChannel(channelIndex - visibleChannels + 1);
        }

        // Check horizontal visibility
        const programStartMinutes = (program.scheduledStartTime - this.state.gridAnchorTime) / 60000;
        const programEndMinutes = (program.scheduledEndTime - this.state.gridAnchorTime) / 60000;
        const visibleEndMinutes = scrollPosition.timeOffset + (visibleHours * 60);

        if (programStartMinutes < scrollPosition.timeOffset) {
            this.state.scrollPosition.timeOffset = programStartMinutes;
            this.timeHeader.updateScrollPosition(this.state.scrollPosition.timeOffset);
            this.renderGrid();
        } else if (programEndMinutes > visibleEndMinutes) {
            this.state.scrollPosition.timeOffset = programEndMinutes - (visibleHours * 60);
            this.timeHeader.updateScrollPosition(this.state.scrollPosition.timeOffset);
            this.renderGrid();
        }
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
                this.focusProgram(this.state.scrollPosition.channelOffset, 0);
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
            const targetTime = focusedCell.program.scheduledStartTime + focusedCell.program.elapsedMs;
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
            const targetTime = focusedCell.program.scheduledStartTime + focusedCell.program.elapsedMs;
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

        if (focusedCell.programIndex > 0) {
            this.focusProgram(focusedCell.channelIndex, focusedCell.programIndex - 1);
            return true;
        }

        // At left edge - check if we can scroll back in time
        const minutesFromAnchor = (focusedCell.program.scheduledStartTime - this.state.gridAnchorTime) / 60000;
        if (minutesFromAnchor <= 0) {
            return false; // At start of schedule day
        }

        // Scroll time back and try to find a program
        this.state.scrollPosition.timeOffset = Math.max(
            0,
            this.state.scrollPosition.timeOffset - EPG_CONSTANTS.TIME_SCROLL_AMOUNT
        );
        this.timeHeader.updateScrollPosition(this.state.scrollPosition.timeOffset);
        this.renderGrid();

        // Focus last visible program
        const channel = this.state.channels[focusedCell.channelIndex];
        if (channel) {
            const schedule = this.state.schedules.get(channel.id);
            if (schedule && focusedCell.programIndex > 0) {
                this.focusProgram(focusedCell.channelIndex, focusedCell.programIndex - 1);
                return true;
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
            this.focusChannel(channelIndex);
            return;
        }

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
            focusedCell: focusedCell
                ? {
                    channelIndex: focusedCell.channelIndex,
                    programIndex: focusedCell.programIndex,
                    program: focusedCell.program,
                    cellElement: focusedCell.cellElement,
                }
                : null,
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
        return this.state.focusedCell ? this.state.focusedCell.program : null;
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
            const range = this.virtualizer.calculateVisibleRange(this.state.scrollPosition);
            const channelIds = this.state.channels.map((c) => c.id);
            this.virtualizer.renderVisibleCells(channelIds, this.state.schedules, range);
        });
    }
}
