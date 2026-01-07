/**
 * @fileoverview Public exports for Channel Scheduler module.
 * @module modules/scheduler/scheduler
 * @version 1.0.0
 */

// ============================================
// Class Exports
// ============================================

export { ChannelScheduler } from './ChannelScheduler';
export { ShuffleGenerator } from './ShuffleGenerator';
export * as ScheduleCalculator from './ScheduleCalculator';

// ============================================
// Interface Exports
// ============================================

export type { IChannelScheduler, IShuffleGenerator } from './interfaces';

// ============================================
// Type Exports
// ============================================

export type {
    ScheduleConfig,
    ScheduledProgram,
    ScheduleWindow,
    SchedulerState,
    ScheduleIndex,
    ShuffleResult,
    SchedulerEventMap,
    PlaybackMode,
    ResolvedContentItem,
} from './types';

// ============================================
// Constant Exports
// ============================================

export {
    SYNC_INTERVAL_MS,
    MAX_DRIFT_MS,
    RESYNC_THRESHOLD_MS,
    SCHEDULER_ERROR_MESSAGES,
} from './constants';
