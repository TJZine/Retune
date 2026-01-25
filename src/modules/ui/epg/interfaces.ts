/**
 * @fileoverview EPG UI module interfaces
 * @module modules/ui/epg/interfaces
 */

import type {
    ScheduledProgram,
    ScheduleWindow,
    ChannelConfig,
    EPGConfig,
    EPGState,
    EPGEventMap,
} from './types';

/**
 * EPG Component Interface.
 * Electronic Program Guide grid with virtualized rendering.
 */
export interface IEPGComponent {
    // Lifecycle
    /**
     * Initialize the EPG component with configuration.
     * @param config - EPG configuration
     */
    initialize(config: EPGConfig): void;

    /**
     * Destroy the EPG component and clean up resources.
     */
    destroy(): void;

    // Visibility
    /**
     * Show the EPG overlay.
     */
    show(options?: { preserveFocus?: boolean }): void;

    /**
     * Hide the EPG overlay.
     */
    hide(): void;

    /**
     * Toggle EPG visibility.
     */
    toggle(): void;

    /**
     * Check if EPG is currently visible.
     * @returns true if visible
     */
    isVisible(): boolean;

    // Data Loading
    /**
     * Load channel list into EPG.
     * @param channels - Array of channel configurations
     */
    loadChannels(channels: ChannelConfig[]): void;

    /**
     * Load schedule for a specific channel.
     * @param channelId - Channel ID
     * @param schedule - Schedule window with programs
     */
    loadScheduleForChannel(channelId: string, schedule: ScheduleWindow): void;

    /**
     * Clear cached schedules and timestamps.
     */
    clearSchedules(): void;

    /**
     * Refresh the current time indicator position.
     */
    refreshCurrentTime(): void;

    // Navigation
    /**
     * Focus a specific channel row.
     * @param channelIndex - Channel index (0-based)
     */
    focusChannel(channelIndex: number): void;

    /**
     * Focus a specific program cell.
     * @param channelIndex - Channel index (0-based)
     * @param programIndex - Program index within channel
     */
    focusProgram(channelIndex: number, programIndex: number): void;

    /**
     * Focus the currently airing program on the current channel.
     */
    focusNow(): void;

    /**
     * Scroll the grid to a specific time.
     * @param time - Unix timestamp (ms)
     */
    scrollToTime(time: number): void;

    /**
     * Scroll the grid to a specific channel.
     * @param channelIndex - Channel index (0-based)
     */
    scrollToChannel(channelIndex: number): void;

    // Input Handling
    /**
     * Handle D-pad navigation input.
     * @param direction - Navigation direction
     * @returns true if navigation was handled, false if at boundary
     */
    handleNavigation(direction: 'up' | 'down' | 'left' | 'right'): boolean;

    /**
     * Handle OK/Select button press.
     * @returns true if handled
     */
    handleSelect(): boolean;

    /**
     * Handle Back button press.
     * @returns true if handled (closes EPG), false if already hidden
     */
    handleBack(): boolean;

    // State
    /**
     * Get current EPG state.
     * @returns Current EPG state
     */
    getState(): EPGState;

    /**
     * Get the currently focused program.
     * @returns Focused program or null
     */
    getFocusedProgram(): ScheduledProgram | null;

    /**
     * Set the grid anchor time (left edge of the EPG timeline).
     * This allows the guide to start at "now" instead of midnight.
     * @param anchorTime - Unix timestamp (ms)
     */
    setGridAnchorTime(anchorTime: number): void;

    // Events
    /**
     * Subscribe to an EPG event.
     * @param event - Event name
     * @param handler - Event handler
     */
    on<K extends keyof EPGEventMap>(
        event: K,
        handler: (payload: EPGEventMap[K]) => void
    ): void;

    /**
     * Unsubscribe from an EPG event.
     * @param event - Event name
     * @param handler - Event handler
     */
    off<K extends keyof EPGEventMap>(
        event: K,
        handler: (payload: EPGEventMap[K]) => void
    ): void;
}

/**
 * EPG Info Panel Interface.
 * Program details overlay.
 */
export interface IEPGInfoPanel {
    /**
     * Show the info panel with program details.
     * @param program - Program to display
     */
    show(program: ScheduledProgram): void;

    /**
     * Hide the info panel.
     */
    hide(): void;

    /**
     * Update the info panel with new program details.
     * @param program - Program to display
     */
    update(program: ScheduledProgram): void;

    /**
     * Fast update without poster/description.
     * @param program - Program to display
     */
    updateFast(program: ScheduledProgram): void;

    /**
     * Full update including poster/description.
     * @param program - Program to display
     */
    updateFull(program: ScheduledProgram): void;
}
