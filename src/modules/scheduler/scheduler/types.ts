/**
 * @fileoverview Type definitions for Channel Scheduler module.
 * @module modules/scheduler/scheduler/types
 * @version 1.0.0
 */

// Re-export types from channel-manager that are used in scheduling
export type {
    PlaybackMode,
    ResolvedContentItem,
    ResolvedChannelContent,
} from '../channel-manager/types';

// Import StreamDescriptor from player module
import type { StreamDescriptor } from '../../player/types';
export type { StreamDescriptor };

// ============================================
// Schedule Configuration
// ============================================

/**
 * Configuration for schedule generation
 */
export interface ScheduleConfig {
    /** Channel ID */
    channelId: string;
    /** Schedule anchor timestamp (ms) */
    anchorTime: number;
    /** Ordered content items */
    content: import('../channel-manager/types').ResolvedContentItem[];
    /** Playback mode */
    playbackMode: import('../channel-manager/types').PlaybackMode;
    /** Shuffle seed for deterministic ordering */
    shuffleSeed: number;
    /** Whether to loop (always true for linear channels) */
    loopSchedule: boolean;
}

// ============================================
// Scheduled Program
// ============================================

/**
 * A program in the schedule with timing information
 */
export interface ScheduledProgram {
    /** The content item */
    item: import('../channel-manager/types').ResolvedContentItem;
    /** Scheduled start time (Unix ms) */
    scheduledStartTime: number;
    /** Scheduled end time (Unix ms) */
    scheduledEndTime: number;
    /** Time elapsed since program started (ms) */
    elapsedMs: number;
    /** Time remaining in program (ms) */
    remainingMs: number;
    /** Position in current loop */
    scheduleIndex: number;
    /** Which iteration of the content loop */
    loopNumber: number;
    /** Stream info for playback (resolved on demand) */
    streamDescriptor: StreamDescriptor | null;
    /** Whether this program is currently playing */
    isCurrent: boolean;
}

// ============================================
// Schedule Window (for EPG)
// ============================================

/**
 * A window of scheduled programs (for EPG display)
 */
export interface ScheduleWindow {
    /** Window start time (Unix ms) */
    startTime: number;
    /** Window end time (Unix ms) */
    endTime: number;
    /** Programs in this window */
    programs: ScheduledProgram[];
}

// ============================================
// Schedule Index (for O(log n) lookups)
// ============================================

/**
 * Pre-computed schedule index for efficient lookups
 */
export interface ScheduleIndex {
    /** Channel ID */
    channelId: string;
    /** When index was generated */
    generatedAt: number;
    /** Total duration of one complete loop (ms) */
    totalLoopDurationMs: number;
    /** Cumulative start offsets for each item within a loop */
    itemStartOffsets: number[];
    /** Ordered items (after shuffle) */
    orderedItems: import('../channel-manager/types').ResolvedContentItem[];
}

// ============================================
// Scheduler State
// ============================================

/**
 * Current scheduler state
 */
export interface SchedulerState {
    /** Active channel ID */
    channelId: string;
    /** Whether scheduler is active */
    isActive: boolean;
    /** Currently playing program */
    currentProgram: ScheduledProgram | null;
    /** Next program to play */
    nextProgram: ScheduledProgram | null;
    /** Current position in schedule */
    schedulePosition: {
        /** Current loop iteration */
        loopNumber: number;
        /** Current item index */
        itemIndex: number;
        /** Offset within current item (ms) */
        offsetMs: number;
    };
    /** Last sync with wall clock */
    lastSyncTime: number;
    /** Whether this state resulted from a hard resync */
    wasHardResync?: boolean;
    /** Detected drift in ms (if hard resync) */
    detectedDriftMs?: number;
}

// ============================================
// Shuffle Result
// ============================================

/**
 * Result of a shuffle operation
 */
export interface ShuffleResult {
    /** Shuffled indices */
    shuffledIndices: number[];
    /** Seed used */
    seed: number;
}

// ============================================
// Internal Types
// ============================================

/**
 * Internal sync timer state for drift detection
 */
export interface SyncTimerState {
    /** Expected timestamp of next tick */
    expectedNextTick: number;
    /** Maximum acceptable drift (ms) */
    maxDriftMs: number;
    /** Threshold for hard resync (ms) */
    resyncThreshold: number;
    /** Timer interval handle */
    interval: ReturnType<typeof setInterval> | null;
}

// ============================================
// Event Map
// ============================================

/**
 * Scheduler events
 */
export interface SchedulerEventMap {
    /** Emitted when a new program starts */
    programStart: ScheduledProgram;
    /** Emitted when a program ends */
    programEnd: ScheduledProgram;
    /** Emitted on each sync tick */
    scheduleSync: SchedulerState;
    /** Index for typed EventEmitter */
    [key: string]: unknown;
}
