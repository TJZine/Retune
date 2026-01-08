/**
 * @fileoverview Interface definitions for Channel Scheduler module.
 * @module modules/scheduler/scheduler/interfaces
 * @version 1.0.0
 */

import type {
    ScheduleConfig,
    ScheduledProgram,
    ScheduleWindow,
    SchedulerState,
    ScheduleIndex,
} from './types';

// ============================================
// IShuffleGenerator Interface
// ============================================

/**
 * Deterministic Shuffle Generator Interface.
 * Uses Mulberry32 PRNG for reproducible shuffles.
 */
export interface IShuffleGenerator {
    /**
     * Shuffle an array deterministically.
     * Same seed always produces the same order.
     * @param items - Array to shuffle
     * @param seed - Seed for the PRNG
     * @returns Shuffled copy of the array
     */
    shuffle<T>(items: T[], seed: number): T[];

    /**
     * Generate shuffled indices for an array of given length.
     * @param count - Number of indices to generate
     * @param seed - Seed for the PRNG
     * @returns Array of shuffled indices [0, count-1]
     */
    shuffleIndices(count: number, seed: number): number[];

    /**
     * Generate a deterministic seed from channel ID and anchor time.
     * @param channelId - Channel identifier
     * @param anchorTime - Anchor timestamp in ms
     * @returns Numeric seed
     */
    generateSeed(channelId: string, anchorTime: number): number;
}

// ============================================
// IChannelScheduler Interface
// ============================================

/**
 * Channel Scheduler Interface.
 * Manages deterministic schedule generation and time-based queries.
 */
export interface IChannelScheduler {
    // ============================================
    // Schedule Generation
    // ============================================

    /**
     * Load a channel and build the schedule index.
     * Starts the sync timer and emits initial programStart event.
     * @param config - Schedule configuration
     * @throws Error if config.content is empty
     */
    loadChannel(config: ScheduleConfig): void;

    /**
     * Unload the current channel.
     * Stops the sync timer and clears state.
     */
    unloadChannel(): void;

    /**
     * Pause the sync timer without unloading the channel.
     * This preserves loaded channel state (config/index/current/next).
     *
     * Idempotent: calling when already paused or before loadChannel() is a no-op.
     */
    pauseSyncTimer(): void;

    /**
     * Resume the sync timer without re-loading the channel.
     *
     * Idempotent: calling when already running or before loadChannel() is a no-op.
     */
    resumeSyncTimer(): void;

    // ============================================
    // Time-based Queries (Core Algorithm)
    // ============================================

    /**
     * Get the program playing at a specific time.
     * Uses O(log n) binary search for efficient lookup.
     * @param time - Unix timestamp in ms
     * @returns The scheduled program at that time
     * @throws Error if no channel is loaded
     */
    getProgramAtTime(time: number): ScheduledProgram;

    /**
     * Get the currently playing program.
     * @returns The current program
     * @throws Error if no channel is loaded
     */
    getCurrentProgram(): ScheduledProgram;

    /**
     * Get the next program after the current one.
     * @returns The next program
     * @throws Error if no channel is loaded
     */
    getNextProgram(): ScheduledProgram;

    /**
     * Get the previous program before the current one.
     * @returns The previous program
     * @throws Error if no channel is loaded
     */
    getPreviousProgram(): ScheduledProgram;

    // ============================================
    // Window Queries (for EPG)
    // ============================================

    /**
     * Get all programs within a time window.
     * Includes partial programs at boundaries.
     * @param startTime - Window start (Unix ms)
     * @param endTime - Window end (Unix ms)
     * @returns Schedule window with programs
     * @throws Error if no channel is loaded or invalid range
     */
    getScheduleWindow(startTime: number, endTime: number): ScheduleWindow;

    /**
     * Get the next N upcoming programs.
     * @param count - Number of programs to return
     * @returns Array of upcoming programs
     * @throws Error if no channel is loaded
     */
    getUpcoming(count: number): ScheduledProgram[];

    // ============================================
    // Playback Sync
    // ============================================

    /**
     * Synchronize scheduler state with wall-clock time.
     * Emits programEnd/programStart events if program changed.
     * Always emits scheduleSync event.
     */
    syncToCurrentTime(): void;

    /**
     * Check if the schedule is stale (drift detected).
     * @param currentTime - Current wall-clock time
     * @returns True if schedule needs resync
     */
    isScheduleStale(currentTime: number): boolean;

    /**
     * Force recalculation from a specific time.
     * @param time - Time to recalculate from
     */
    recalculateFromTime(time: number): void;

    // ============================================
    // Navigation
    // ============================================

    /**
     * Jump to a specific program in the schedule.
     * @param program - The program to jump to
     */
    jumpToProgram(program: ScheduledProgram): void;

    /**
     * Skip to the next program.
     * Emits programEnd for current and programStart for next.
     */
    skipToNext(): void;

    /**
     * Skip to the previous program.
     * Emits programEnd for current and programStart for previous.
     */
    skipToPrevious(): void;

    // ============================================
    // State
    // ============================================

    /**
     * Get the current scheduler state.
     * @returns Current state
     */
    getState(): SchedulerState;

    /**
     * Get the pre-computed schedule index.
     * @returns Schedule index
     * @throws Error if no channel is loaded
     */
    getScheduleIndex(): ScheduleIndex;

    // ============================================
    // Events
    // ============================================

    /**
     * Subscribe to programStart events.
     * @param event - Event name
     * @param handler - Event handler
     */
    on(event: 'programStart', handler: (program: ScheduledProgram) => void): void;

    /**
     * Subscribe to programEnd events.
     * @param event - Event name
     * @param handler - Event handler
     */
    on(event: 'programEnd', handler: (program: ScheduledProgram) => void): void;

    /**
     * Subscribe to scheduleSync events.
     * @param event - Event name
     * @param handler - Event handler
     */
    on(event: 'scheduleSync', handler: (state: SchedulerState) => void): void;

    /**
     * Unsubscribe from programStart events.
     * @param event - Event name
     * @param handler - Event handler
     */
    off(event: 'programStart', handler: (program: ScheduledProgram) => void): void;

    /**
     * Unsubscribe from programEnd events.
     * @param event - Event name
     * @param handler - Event handler
     */
    off(event: 'programEnd', handler: (program: ScheduledProgram) => void): void;

    /**
     * Unsubscribe from scheduleSync events.
     * @param event - Event name
     * @param handler - Event handler
     */
    off(event: 'scheduleSync', handler: (state: SchedulerState) => void): void;
}
