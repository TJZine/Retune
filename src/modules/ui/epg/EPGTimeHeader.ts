/**
 * @fileoverview EPG Time Header - Time axis header showing 30-minute slots
 * @module modules/ui/epg/EPGTimeHeader
 * @version 1.0.0
 */

import { EPG_CLASSES } from './constants';
import type { EPGConfig, TimeSlot } from './types';

/**
 * Format time for display.
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted time (e.g., "12:30 PM")
 */
function formatTimeSlot(timestamp: number): string {
    const date = new Date(timestamp);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    return `${displayHours}:${displayMinutes} ${ampm}`;
}

/**
 * EPG Time Header class.
 * Displays time axis with 30-minute slot labels.
 */
export class EPGTimeHeader {
    private containerElement: HTMLElement | null = null;
    private config: EPGConfig | null = null;
    private gridAnchorTime: number = 0;
    private slotElements: HTMLElement[] = [];

    /**
     * Initialize the time header.
     *
     * @param parentElement - Parent element to append time header to
     * @param config - EPG configuration
     * @param gridAnchorTime - Start time of the schedule day (Unix ms)
     */
    initialize(
        parentElement: HTMLElement,
        config: EPGConfig,
        gridAnchorTime: number
    ): void {
        this.config = config;
        this.gridAnchorTime = gridAnchorTime;

        this.containerElement = document.createElement('div');
        this.containerElement.className = EPG_CLASSES.TIME_HEADER;
        parentElement.appendChild(this.containerElement);

        this.renderSlots();
    }

    /**
     * Destroy the time header and clean up resources.
     */
    destroy(): void {
        if (this.containerElement) {
            this.containerElement.remove();
            this.containerElement = null;
        }
        this.slotElements = [];
        this.config = null;
    }

    /**
     * Render time slot labels.
     */
    private renderSlots(): void {
        if (!this.containerElement || !this.config) return;

        this.containerElement.innerHTML = '';
        this.slotElements = [];

        const totalMinutes = this.config.totalHours * 60;
        const slotMinutes = this.config.timeSlotMinutes;
        const slotCount = totalMinutes / slotMinutes;

        for (let i = 0; i < slotCount; i++) {
            const slotTime = this.gridAnchorTime + (i * slotMinutes * 60000);
            const slot = this.createSlotElement(slotTime, i * slotMinutes);
            this.containerElement.appendChild(slot);
            this.slotElements.push(slot);
        }
    }

    /**
     * Create a time slot element.
     *
     * @param time - Slot time (Unix ms)
     * @param minutesFromAnchor - Minutes from grid start
     * @returns The slot element
     */
    private createSlotElement(time: number, minutesFromAnchor: number): HTMLElement {
        const slot = document.createElement('div');
        slot.className = EPG_CLASSES.TIME_SLOT;
        slot.textContent = formatTimeSlot(time);

        if (this.config) {
            const left = minutesFromAnchor * this.config.pixelsPerMinute;
            slot.style.left = `${left}px`;
            slot.style.width = `${this.config.timeSlotMinutes * this.config.pixelsPerMinute}px`;
        }

        return slot;
    }

    /**
     * Update scroll position to sync with grid.
     *
     * @param timeOffset - Time offset in minutes from anchor
     */
    updateScrollPosition(timeOffset: number): void {
        if (!this.containerElement || !this.config) return;

        const translateX = -(timeOffset * this.config.pixelsPerMinute);
        this.containerElement.style.transform = `translateX(${translateX}px)`;
    }

    /**
     * Get generated time slots for testing.
     *
     * @param visibleStart - Start of visible range (minutes)
     * @param visibleEnd - End of visible range (minutes)
     * @returns Array of time slots in visible range
     */
    getVisibleTimeSlots(visibleStart: number, visibleEnd: number): TimeSlot[] {
        if (!this.config) return [];

        const slots: TimeSlot[] = [];
        const slotMinutes = this.config.timeSlotMinutes;
        const startSlot = Math.floor(visibleStart / slotMinutes);
        const endSlot = Math.ceil(visibleEnd / slotMinutes);

        for (let i = startSlot; i <= endSlot; i++) {
            const minutesFromAnchor = i * slotMinutes;
            const time = this.gridAnchorTime + (minutesFromAnchor * 60000);

            slots.push({
                time,
                label: formatTimeSlot(time),
                left: minutesFromAnchor * this.config.pixelsPerMinute,
            });
        }

        return slots;
    }

    /**
     * Update the grid anchor time and re-render slots.
     *
     * @param anchorTime - New anchor time (Unix ms)
     */
    setGridAnchorTime(anchorTime: number): void {
        this.gridAnchorTime = anchorTime;
        this.renderSlots();
    }
}
