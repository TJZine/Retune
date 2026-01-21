/**
 * @fileoverview EPG UI module constants
 * @module modules/ui/epg/constants
 */

/**
 * EPG configuration constants.
 * See ADR-003 for rationale on MAX_DOM_ELEMENTS and buffer sizes.
 */
export const EPG_CONSTANTS = {
    /** Number of visible channel rows at once */
    VISIBLE_CHANNELS: 5,
    /** Grid time slot granularity (minutes) */
    TIME_SLOT_MINUTES: 30,
    /** Hours visible at once */
    VISIBLE_HOURS: 3,
    /** Total hours in schedule */
    TOTAL_HOURS: 24,
    /** Pixels per minute (width scaling) */
    PIXELS_PER_MINUTE: 4,
    /** Pixels per channel row */
    ROW_HEIGHT: 96,
    /** Virtualization row buffer above/below visible */
    ROW_BUFFER: 2,
    /** Virtualization time buffer (minutes) */
    TIME_BUFFER_MINUTES: 60,
    /** Current time indicator update interval (ms) */
    TIME_INDICATOR_UPDATE_MS: 60_000,
    /** Maximum DOM elements for grid cells */
    MAX_DOM_ELEMENTS: 200,
    /** Maximum pool size for recycled elements */
    MAX_POOL_SIZE: 250,
    /** Scroll amount when navigating past visible window (minutes) */
    TIME_SCROLL_AMOUNT: 30,
    /** Channel column width (pixels) */
    CHANNEL_COLUMN_WIDTH: 200,
} as const;

/**
 * CSS class names used by EPG components.
 */
export const EPG_CLASSES = {
    CONTAINER: 'epg-container',
    CONTAINER_VISIBLE: 'visible',
    GRID: 'epg-grid',
    CHANNEL_LIST: 'epg-channel-list',
    CHANNEL_ROW: 'epg-channel-row',
    PROGRAM_AREA: 'epg-program-area',
    CELL: 'epg-cell',
    CELL_FOCUSED: 'focused',
    CELL_CURRENT: 'current',
    CELL_SHOW: 'epg-cell-show',
    CELL_TITLE: 'epg-cell-title',
    CELL_TIME: 'epg-cell-time',
    TIME_HEADER: 'epg-time-header',
    TIME_SLOT: 'epg-time-slot',
    TIME_INDICATOR: 'epg-time-indicator',
    INFO_PANEL: 'epg-info-panel',
    INFO_POSTER: 'epg-info-poster',
    INFO_CONTENT: 'epg-info-content',
    INFO_TITLE: 'epg-info-title',
    INFO_META: 'epg-info-meta',
    INFO_GENRES: 'epg-info-genres',
    INFO_DESCRIPTION: 'epg-info-description',
    INFO_QUALITY: 'epg-info-quality',
    INFO_QUALITY_BADGE: 'epg-info-quality-badge',
} as const;

/**
 * Error messages for EPG components.
 */
export const EPG_ERRORS = {
    CONTAINER_NOT_FOUND: 'EPG container element not found',
    NO_CHANNELS_LOADED: 'No channels loaded',
    SCHEDULE_NOT_LOADED: 'Schedule not loaded for channel',
    INVALID_CHANNEL_INDEX: 'Invalid channel index',
    INVALID_PROGRAM_INDEX: 'Invalid program index',
} as const;

/**
 * Default EPG configuration values.
 */
export const DEFAULT_EPG_CONFIG = {
    containerId: 'epg-container',
    visibleChannels: EPG_CONSTANTS.VISIBLE_CHANNELS,
    timeSlotMinutes: EPG_CONSTANTS.TIME_SLOT_MINUTES,
    visibleHours: EPG_CONSTANTS.VISIBLE_HOURS,
    totalHours: EPG_CONSTANTS.TOTAL_HOURS,
    pixelsPerMinute: EPG_CONSTANTS.PIXELS_PER_MINUTE,
    autoFitPixelsPerMinute: true,
    minPixelsPerMinute: 6,
    maxPixelsPerMinute: 12,
    rowHeight: EPG_CONSTANTS.ROW_HEIGHT,
    showCurrentTimeIndicator: true,
    autoScrollToNow: true,
} as const;
