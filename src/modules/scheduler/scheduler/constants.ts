/**
 * @fileoverview Constants for Channel Scheduler module.
 * @module modules/scheduler/scheduler/constants
 * @version 1.0.0
 */

// ============================================
// Sync Timer Constants
// ============================================

/** Interval for sync timer in milliseconds */
export const SYNC_INTERVAL_MS = 1000;

/** Maximum acceptable drift before adjustment (ms) */
export const MAX_DRIFT_MS = 500;

/** Threshold for triggering hard resync (ms) */
export const RESYNC_THRESHOLD_MS = 2000;

// ============================================
// Error Messages
// ============================================

/** Error messages for scheduler operations */
export const SCHEDULER_ERROR_MESSAGES = {
    EMPTY_CHANNEL: 'Cannot schedule empty channel',
    NO_CHANNEL_LOADED: 'No channel loaded',
    INVALID_TIME_RANGE: 'Invalid time range: start must be before end',
} as const;
