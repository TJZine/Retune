/**
 * @fileoverview EPG UI module types
 * @module modules/ui/epg/types
 */

import type { ScheduledProgram, ScheduleWindow } from '../../scheduler/scheduler/types';
import type { ChannelConfig } from '../../scheduler/channel-manager/types';

// Re-export imported types for convenience
export type { ScheduledProgram, ScheduleWindow, ChannelConfig };

// ============================================
// EPG Configuration & State
// ============================================

/**
 * EPG component configuration
 */
export interface EPGConfig {
    /** DOM container ID */
    containerId: string;
    /** Number of visible channel rows */
    visibleChannels: number;
    /** Grid time slot granularity (minutes) */
    timeSlotMinutes: number;
    /** Hours visible at once */
    visibleHours: number;
    /** Total hours in schedule (typically 24) */
    totalHours: number;
    /** Pixels per minute (width scaling) */
    pixelsPerMinute: number;
    /** Pixels per channel row */
    rowHeight: number;
    /** Show current time indicator */
    showCurrentTimeIndicator: boolean;
    /** Auto-scroll to current time on open */
    autoScrollToNow: boolean;
    /** Optional callback when visible range changes */
    onVisibleRangeChange?: (range: {
        channelStart: number;
        channelEnd: number;
        timeStartMs: number;
        timeEndMs: number;
    }) => void;
    /** Optional callback to resolve relative Plex thumb paths to absolute URLs */
    resolveThumbUrl?: (pathOrUrl: string | null) => string | null;
}

/**
 * EPG component state (externally visible)
 */
export interface EPGState {
    /** Is EPG visible */
    isVisible: boolean;
    /** Currently focused cell */
    focusedCell: EPGFocusPosition | null;
    /** Scroll position */
    scrollPosition: {
        /** First visible channel index */
        channelOffset: number;
        /** Minutes from schedule start */
        timeOffset: number;
    };
    /** Visible window bounds */
    viewWindow: {
        startTime: number;
        endTime: number;
        startChannelIndex: number;
        endChannelIndex: number;
    };
    /** Current wall-clock time */
    currentTime: number;
}

/**
 * EPG focus position
 */
export type EPGFocusPosition =
    | {
        kind: 'program';
        /** Channel row index */
        channelIndex: number;
        /** Program index within channel */
        programIndex: number;
        /** The focused program */
        program: ScheduledProgram;
        /** Focus time used for navigation reconciliation */
        focusTimeMs: number;
        /** DOM element reference */
        cellElement: HTMLElement | null;
    }
    | {
        kind: 'placeholder';
        /** Channel row index */
        channelIndex: number;
        /** Placeholder entries are not tied to a program index */
        programIndex: -1;
        placeholder: {
            label: string;
            scheduledStartTime: number;
            scheduledEndTime: number;
        };
        /** Focus time used for navigation reconciliation */
        focusTimeMs: number;
        /** DOM element reference */
        cellElement: HTMLElement | null;
    };

/**
 * EPG channel row data
 */
export interface EPGChannelRow {
    /** Channel config */
    channel: ChannelConfig;
    /** Programs to display */
    programs: EPGProgramCell[];
}

/**
 * EPG program cell data
 */
export interface EPGProgramCell {
    /** The scheduled program */
    program: ScheduledProgram;
    /** Left position in pixels */
    left: number;
    /** Cell width in pixels */
    width: number;
    /** Extends beyond visible area */
    isPartial: boolean;
    /** Currently airing */
    isCurrent: boolean;
    /** Has focus */
    isFocused: boolean;
}

/**
 * Virtualized grid state for EPG
 */
export interface VirtualizedGridState {
    /** Currently rendered channel indices */
    visibleRows: number[];
    /** Current channel scroll offset */
    channelOffset: number;
    /** Visible time window */
    visibleTimeRange: { start: number; end: number };
    /** Recycled DOM elements */
    recycledElements: Map<string, HTMLElement>;
}

/**
 * EPG events
 */
export interface EPGEventMap {
    open: void;
    close: void;
    focusChange: EPGFocusPosition;
    channelSelected: { channel: ChannelConfig; program: ScheduledProgram };
    programSelected: ScheduledProgram;
    timeScroll: { direction: 'left' | 'right'; newOffset: number };
    channelScroll: { direction: 'up' | 'down'; newOffset: number };
    /** Index signature for EventEmitter compatibility */
    [key: string]: unknown;
}

// ============================================
// Internal Types
// ============================================

/**
 * Internal state for EPG component.
 */
export interface EPGInternalState {
    /** Whether EPG is initialized */
    isInitialized: boolean;
    /** Whether EPG is visible */
    isVisible: boolean;
    /** Loaded channels */
    channels: ChannelConfig[];
    /** Schedule windows by channel ID */
    schedules: Map<string, ScheduleWindow>;
    /** Loaded schedule timestamps by channel ID */
    scheduleLoadTimes: Map<string, number>;
    /** Currently focused cell */
    focusedCell: EPGFocusPosition | null;
    /** Last requested focus time (used when schedules are missing) */
    focusTimeMs: number;
    /** Scroll position */
    scrollPosition: {
        channelOffset: number;
        timeOffset: number;
    };
    /** Current wall-clock time */
    currentTime: number;
    /** Grid anchor time (start of schedule day) */
    gridAnchorTime: number;
    /** Last render timestamp for throttling */
    lastRenderTime: number;
}

/**
 * EPG error types for error boundary handling.
 */
export type EPGErrorType =
    | 'RENDER_ERROR'
    | 'SCROLL_TIMEOUT'
    | 'POOL_EXHAUSTED'
    | 'EMPTY_CHANNEL'
    | 'NAV_BOUNDARY'
    | 'PARSE_ERROR';

/**
 * Cell render data for virtualization.
 */
export type CellRenderData =
    | {
        kind: 'program';
        /** Unique key for this cell */
        key: string;
        /** Channel ID */
        channelId: string;
        /** Row index */
        rowIndex: number;
        /** The scheduled program */
        program: ScheduledProgram;
        /** Left position (pixels) */
        left: number;
        /** Cell width (pixels) */
        width: number;
        /** Whether cell extends beyond visible area */
        isPartial: boolean;
        /** Whether program is currently airing */
        isCurrent: boolean;
        /** DOM element reference */
        cellElement: HTMLElement | null;
    }
    | {
        kind: 'placeholder';
        /** Unique key for this cell */
        key: string;
        /** Channel ID */
        channelId: string;
        /** Row index */
        rowIndex: number;
        placeholder: {
            label: string;
            scheduledStartTime: number;
            scheduledEndTime: number;
        };
        /** Left position (pixels) */
        left: number;
        /** Cell width (pixels) */
        width: number;
        /** Whether cell extends beyond visible area */
        isPartial: boolean;
        /** Whether program is currently airing */
        isCurrent: boolean;
        /** DOM element reference */
        cellElement: HTMLElement | null;
    };

/**
 * Time header slot data.
 */
export interface TimeSlot {
    /** Slot time (Unix ms) */
    time: number;
    /** Display label (e.g., "12:30 PM") */
    label: string;
    /** Left position (pixels) */
    left: number;
}
