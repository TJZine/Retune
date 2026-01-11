/**
 * @fileoverview EPG Virtualizer - DOM element pooling and virtualized rendering
 * @module modules/ui/epg/EPGVirtualizer
 * @version 1.0.0
 *
 * Implements virtualized grid rendering to maintain <200 DOM elements
 * regardless of channel/program count. See ADR-003 for rationale.
 */

import { EPG_CONSTANTS, EPG_CLASSES } from './constants';
import { formatTimeRange } from './utils';
import type {
    ScheduledProgram,
    ScheduleWindow,
    EPGConfig,
    EPGProgramCell,
    VirtualizedGridState,
    CellRenderData,
} from './types';

/**
 * Calculates cell position from program timing.
 * Pure function for deterministic positioning.
 *
 * @param program - The scheduled program
 * @param gridAnchorTime - Start time of the grid (Unix ms)
 * @param pixelsPerMinute - Scaling factor for width
 * @param now - Current time (Unix ms), defaults to Date.now()
 * @returns EPGProgramCell with position data
 */
export function positionCell(
    program: ScheduledProgram,
    gridAnchorTime: number,
    pixelsPerMinute: number = EPG_CONSTANTS.PIXELS_PER_MINUTE,
    now: number = Date.now()
): EPGProgramCell {
    const minutesFromStart = (program.scheduledStartTime - gridAnchorTime) / 60000;
    const durationMinutes = (program.scheduledEndTime - program.scheduledStartTime) / 60000;

    return {
        program,
        left: minutesFromStart * pixelsPerMinute,
        width: Math.max(durationMinutes * pixelsPerMinute, 20), // Minimum 20px width
        isPartial: false, // Will be set by caller based on visible range
        isCurrent: now >= program.scheduledStartTime && now < program.scheduledEndTime,
        isFocused: false,
    };
}



/**
 * EPG Virtualizer class.
 * Manages DOM element pooling and efficient grid rendering.
 */
export class EPGVirtualizer {
    private config: EPGConfig | null = null;
    private gridContainer: HTMLElement | null = null;
    private gridAnchorTime: number = 0;

    /** Pool of recycled DOM elements */
    private elementPool: Map<string, HTMLElement> = new Map();

    /** Currently visible cells */
    private visibleCells: Map<string, CellRenderData> = new Map();

    /** Total channel count */
    private totalChannels: number = 0;

    /**
     * Initialize the virtualizer.
     *
     * @param gridContainer - The grid container element
     * @param config - EPG configuration
     * @param gridAnchorTime - Start time of the schedule day (Unix ms)
     */
    initialize(
        gridContainer: HTMLElement,
        config: EPGConfig,
        gridAnchorTime: number
    ): void {
        this.gridContainer = gridContainer;
        this.config = config;
        this.gridAnchorTime = gridAnchorTime;
        this.elementPool.clear();
        this.visibleCells.clear();
    }

    /**
     * Destroy the virtualizer and clean up resources.
     */
    destroy(): void {
        this.forceRecycleAll();
        this.elementPool.clear();
        this.visibleCells.clear();
        this.gridContainer = null;
        this.config = null;
    }

    /**
     * Set total channel count for range calculations.
     *
     * @param count - Number of channels
     */
    setChannelCount(count: number): void {
        this.totalChannels = count;
    }

    /**
     * Update the grid anchor time.
     *
     * @param anchorTime - New anchor time (Unix ms)
     */
    setGridAnchorTime(anchorTime: number): void {
        this.gridAnchorTime = anchorTime;
    }

    /**
     * Calculate visible range based on scroll position.
     * Adds buffer rows and time buffer for smooth scrolling.
     *
     * @param scrollPosition - Current scroll position
     * @returns Visible range with row indices and time window
     */
    calculateVisibleRange(scrollPosition: {
        channelOffset: number;
        timeOffset: number;
    }): VirtualizedGridState {
        const config = this.config;
        if (!config) {
            return {
                visibleRows: [],
                visibleTimeRange: { start: 0, end: 0 },
                recycledElements: this.elementPool,
            };
        }

        const rowBuffer = EPG_CONSTANTS.ROW_BUFFER;
        const timeBuffer = EPG_CONSTANTS.TIME_BUFFER_MINUTES;

        const startRow = Math.max(0, scrollPosition.channelOffset - rowBuffer);
        const endRow = Math.min(
            this.totalChannels,
            scrollPosition.channelOffset + config.visibleChannels + rowBuffer
        );

        const visibleRows: number[] = [];
        for (let i = startRow; i < endRow; i++) {
            visibleRows.push(i);
        }

        return {
            visibleRows,
            visibleTimeRange: {
                start: scrollPosition.timeOffset - timeBuffer,
                end: scrollPosition.timeOffset + (config.visibleHours * 60) + timeBuffer,
            },
            recycledElements: this.elementPool,
        };
    }

    /**
     * Check if a program overlaps with a time range.
     *
     * @param program - The scheduled program
     * @param timeRange - Time range in minutes from anchor
     * @returns true if program overlaps the range
     */
    private overlapsTimeRange(
        program: ScheduledProgram,
        timeRange: { start: number; end: number }
    ): boolean {
        const programStartMinutes = (program.scheduledStartTime - this.gridAnchorTime) / 60000;
        const programEndMinutes = (program.scheduledEndTime - this.gridAnchorTime) / 60000;

        return programEndMinutes > timeRange.start && programStartMinutes < timeRange.end;
    }

    /**
     * Render visible cells with DOM recycling.
     * Main virtualization entry point.
     *
     * @param channelIds - Ordered array of channel IDs
     * @param schedules - Map of channel ID to schedule window
     * @param range - Visible range from calculateVisibleRange
     */
    renderVisibleCells(
        channelIds: string[],
        schedules: Map<string, ScheduleWindow>,
        range: VirtualizedGridState,
        focusedCellKey?: string
    ): void {
        if (!this.gridContainer || !this.config) return;

        const newVisibleCells = new Map<string, CellRenderData>();
        const now = Date.now();
        const maxDomElements = EPG_CONSTANTS.MAX_DOM_ELEMENTS;
        const visibleRowCount = Math.max(1, range.visibleRows.length);
        const perRowLimit = Math.max(1, Math.ceil(maxDomElements / visibleRowCount));
        const perRowCounts = new Map<number, number>();

        // Determine needed cells
        for (const rowIndex of range.visibleRows) {
            if (rowIndex >= channelIds.length) continue;

            const channelId = channelIds[rowIndex];
            if (channelId === undefined) continue;
            const schedule = schedules.get(channelId);
            if (!schedule) continue;

            for (const program of schedule.programs) {
                if (this.overlapsTimeRange(program, range.visibleTimeRange)) {
                    const cellKey = `${channelId}-${program.scheduledStartTime}`;
                    const isFocusedCell = focusedCellKey === cellKey;
                    const currentRowCount = perRowCounts.get(rowIndex) ?? 0;

                    // Hard cap: keep DOM under MAX_DOM_ELEMENTS (ADR-003)
                    if (!isFocusedCell) {
                        if (newVisibleCells.size >= maxDomElements) {
                            continue;
                        }
                        if (currentRowCount >= perRowLimit) {
                            continue;
                        }
                    }

                    const cell = positionCell(program, this.gridAnchorTime, this.config.pixelsPerMinute);

                    // Compute isPartial: true if program is clipped by visible window
                    const programStartMinutes = (program.scheduledStartTime - this.gridAnchorTime) / 60000;
                    const programEndMinutes = (program.scheduledEndTime - this.gridAnchorTime) / 60000;
                    const isPartial = programStartMinutes < range.visibleTimeRange.start ||
                        programEndMinutes > range.visibleTimeRange.end;

                    newVisibleCells.set(cellKey, {
                        key: cellKey,
                        channelId,
                        rowIndex,
                        program,
                        left: cell.left,
                        width: cell.width,
                        isPartial,
                        isCurrent: now >= program.scheduledStartTime && now < program.scheduledEndTime,
                        cellElement: null,
                    });

                    if (!isFocusedCell) {
                        perRowCounts.set(rowIndex, currentRowCount + 1);
                    }
                }
            }
        }

        // Ensure we never exceed the DOM cap; preferentially keep focused cell if present.
        while (newVisibleCells.size > maxDomElements) {
            let removed = false;
            for (const key of newVisibleCells.keys()) {
                if (key !== focusedCellKey) {
                    newVisibleCells.delete(key);
                    removed = true;
                    break;
                }
            }
            if (!removed) {
                break;
            }
        }

        // Recycle cells no longer visible
        for (const [key, cellData] of this.visibleCells) {
            if (!newVisibleCells.has(key)) {
                this.recycleElement(key, cellData);
            }
        }

        // Render new cells
        for (const [key, cellData] of newVisibleCells) {
            const existing = this.visibleCells.get(key);
            if (existing && existing.cellElement) {
                // Reuse existing element, update position and content
                cellData.cellElement = existing.cellElement;
                this.updateCellPosition(cellData);
                this.updateCellContent(cellData);
            } else {
                // Render new cell
                this.renderCell(key, cellData);
            }
        }

        this.visibleCells = newVisibleCells;
    }

    /**
     * Get an element from the pool or create a new one.
     * Pool elements are cleaned before reuse.
     *
     * @returns A DOM element ready for use
     */
    private getOrCreateElement(): HTMLElement {
        // Check pool for reusable element
        for (const [key, element] of this.elementPool) {
            this.elementPool.delete(key);
            this.resetElement(element);
            return element;
        }

        // Create new element if pool is empty
        const element = document.createElement('div');
        element.className = EPG_CLASSES.CELL;
        element.innerHTML = `
      <div class="${EPG_CLASSES.CELL_TITLE}"></div>
      <div class="${EPG_CLASSES.CELL_TIME}"></div>
    `;
        return element;
    }

    /**
     * Return an element to the pool for later reuse.
     * If pool exceeds MAX_POOL_SIZE, oldest entries are removed.
     *
     * @param _key - Cell key being recycled (unused, for debugging)
     * @param cellData - Cell data with element reference
     */
    private recycleElement(_key: string, cellData: CellRenderData): void {
        const element = cellData.cellElement;
        if (!element) return;

        // Remove from DOM but don't destroy
        element.remove();
        element.classList.remove(EPG_CLASSES.CELL_FOCUSED, EPG_CLASSES.CELL_CURRENT);

        // Add to pool with unique key
        const poolKey = `pool-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        this.elementPool.set(poolKey, element);

        // Prevent pool from growing unbounded
        if (this.elementPool.size > EPG_CONSTANTS.MAX_POOL_SIZE) {
            const oldestKey = this.elementPool.keys().next().value;
            if (oldestKey !== undefined) {
                this.elementPool.delete(oldestKey);
            }
        }
    }

    /**
     * Reset element content for reuse.
     * Clears text content and inline styles, keeps structure.
     *
     * @param element - Element to reset
     */
    private resetElement(element: HTMLElement): void {
        const title = element.querySelector(`.${EPG_CLASSES.CELL_TITLE}`);
        const time = element.querySelector(`.${EPG_CLASSES.CELL_TIME}`);
        if (title) title.textContent = '';
        if (time) time.textContent = '';

        // Reset positioning
        element.style.left = '';
        element.style.width = '';
        element.style.top = '';

        // Remove state classes
        element.classList.remove(EPG_CLASSES.CELL_FOCUSED, EPG_CLASSES.CELL_CURRENT);
        element.removeAttribute('data-key');
    }

    /**
     * Render a cell to the DOM using a pooled or new element.
     *
     * @param key - Unique cell key
     * @param cellData - Cell data to render
     */
    private renderCell(key: string, cellData: CellRenderData): void {
        if (!this.gridContainer || !this.config) return;

        const element = this.getOrCreateElement();

        // Set content
        const title = element.querySelector(`.${EPG_CLASSES.CELL_TITLE}`);
        const time = element.querySelector(`.${EPG_CLASSES.CELL_TIME}`);
        if (title) title.textContent = cellData.program.item.title;
        if (time) time.textContent = formatTimeRange(
            cellData.program.scheduledStartTime,
            cellData.program.scheduledEndTime
        );

        // Calculate position
        element.style.left = `${cellData.left}px`;
        element.style.width = `${cellData.width}px`;
        element.style.top = `${cellData.rowIndex * this.config.rowHeight}px`;
        element.setAttribute('data-key', key);

        // Mark current program
        if (cellData.isCurrent) {
            element.classList.add(EPG_CLASSES.CELL_CURRENT);
        }

        // Append to grid
        this.gridContainer.appendChild(element);
        cellData.cellElement = element;
    }

    /**
     * Update cell position without recreating.
     *
     * @param cellData - Cell data with updated position
     */
    private updateCellPosition(cellData: CellRenderData): void {
        const element = cellData.cellElement;
        if (!element || !this.config) return;

        element.style.left = `${cellData.left}px`;
        element.style.width = `${cellData.width}px`;
        element.style.top = `${cellData.rowIndex * this.config.rowHeight}px`;

        // Update current state
        if (cellData.isCurrent) {
            element.classList.add(EPG_CLASSES.CELL_CURRENT);
        } else {
            element.classList.remove(EPG_CLASSES.CELL_CURRENT);
        }
    }

    /**
     * Update cell content (title and time).
     * Called on reused cells to ensure fresh data after schedule updates.
     *
     * @param cellData - Cell data with program info
     */
    private updateCellContent(cellData: CellRenderData): void {
        const element = cellData.cellElement;
        if (!element) return;

        const title = element.querySelector(`.${EPG_CLASSES.CELL_TITLE}`);
        const time = element.querySelector(`.${EPG_CLASSES.CELL_TIME}`);
        if (title) title.textContent = cellData.program.item.title;
        if (time) time.textContent = formatTimeRange(
            cellData.program.scheduledStartTime,
            cellData.program.scheduledEndTime
        );
    }

    /**
     * Force recycle all elements when memory pressure detected.
     */
    forceRecycleAll(): void {
        for (const [key, cellData] of this.visibleCells) {
            this.recycleElement(key, cellData);
        }
        this.visibleCells.clear();

        // Clear pool completely to free memory
        this.elementPool.clear();
    }

    /**
     * Set focus on a cell element.
     *
     * @param channelId - Channel ID
     * @param programStartTime - Program start time (Unix ms)
     * @returns The focused element or null
     */
    setFocusedCell(channelId: string, programStartTime: number): HTMLElement | null {
        const key = `${channelId}-${programStartTime}`;

        // Remove focus from all cells
        for (const cellData of this.visibleCells.values()) {
            if (cellData.cellElement) {
                cellData.cellElement.classList.remove(EPG_CLASSES.CELL_FOCUSED);
            }
        }

        // Add focus to target cell
        const cellData = this.visibleCells.get(key);
        if (cellData && cellData.cellElement) {
            cellData.cellElement.classList.add(EPG_CLASSES.CELL_FOCUSED);
            return cellData.cellElement;
        }

        return null;
    }

    /**
     * Get the DOM element count (for testing).
     *
     * @returns Number of visible cell elements
     */
    getElementCount(): number {
        return this.visibleCells.size;
    }

    /**
     * Get pool size (for testing).
     *
     * @returns Number of elements in pool
     */
    getPoolSize(): number {
        return this.elementPool.size;
    }
}
