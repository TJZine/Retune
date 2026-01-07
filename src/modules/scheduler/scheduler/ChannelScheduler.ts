/**
 * @fileoverview Channel Scheduler implementation.
 * Manages deterministic schedule generation and time-based queries.
 * @module modules/scheduler/scheduler/ChannelScheduler
 * @version 1.0.0
 */

import { EventEmitter } from '../../../utils/EventEmitter';
import type { IChannelScheduler, IShuffleGenerator } from './interfaces';
import type {
    ScheduleConfig,
    ScheduledProgram,
    ScheduleWindow,
    SchedulerState,
    ScheduleIndex,
    SchedulerEventMap,
    SyncTimerState,
} from './types';
import { ShuffleGenerator } from './ShuffleGenerator';
import {
    buildScheduleIndex,
    calculateProgramAtTime,
    calculateNextProgram,
    calculatePreviousProgram,
    generateScheduleWindow,
} from './ScheduleCalculator';
import {
    SYNC_INTERVAL_MS,
    MAX_DRIFT_MS,
    RESYNC_THRESHOLD_MS,
    SCHEDULER_ERROR_MESSAGES,
} from './constants';

// ============================================
// ChannelScheduler Class
// ============================================

/**
 * Channel Scheduler implementation.
 * Generates and maintains deterministic playback schedules based on wall-clock time.
 *
 * @implements {IChannelScheduler}
 *
 * @example
 * ```typescript
 * const scheduler = new ChannelScheduler();
 * scheduler.on('programStart', (program) => {
 *     console.log('Now playing:', program.item.title);
 * });
 * scheduler.loadChannel({
 *     channelId: 'ch1',
 *     anchorTime: Date.now(),
 *     content: resolvedItems,
 *     playbackMode: 'shuffle',
 *     shuffleSeed: 12345,
 *     loopSchedule: true,
 * });
 * ```
 */
export class ChannelScheduler implements IChannelScheduler {
    // ============================================
    // Private State
    // ============================================

    private readonly _emitter: EventEmitter<SchedulerEventMap>;
    private readonly _shuffler: IShuffleGenerator;

    private _config: ScheduleConfig | null = null;
    private _index: ScheduleIndex | null = null;
    private _isActive = false;
    private _currentProgram: ScheduledProgram | null = null;
    private _nextProgram: ScheduledProgram | null = null;
    private _lastSyncTime = 0;

    // Reusable buffers for array-returning methods (avoids allocation per query)
    private readonly _windowBuffer: ScheduledProgram[] = [];
    private readonly _upcomingBuffer: ScheduledProgram[] = [];

    private _syncTimerState: SyncTimerState = {
        expectedNextTick: 0,
        maxDriftMs: MAX_DRIFT_MS,
        resyncThreshold: RESYNC_THRESHOLD_MS,
        interval: null,
    };

    // ============================================
    // Constructor
    // ============================================

    /**
     * Create a new ChannelScheduler instance.
     * @param shuffler - Optional custom shuffle generator (for testing)
     */
    constructor(shuffler?: IShuffleGenerator) {
        this._emitter = new EventEmitter<SchedulerEventMap>();
        this._shuffler = shuffler || new ShuffleGenerator();
    }

    // ============================================
    // Schedule Generation
    // ============================================

    /**
     * Load a channel and build the schedule index.
     * @param config - Schedule configuration
     * @throws Error if config.content is empty
     */
    public loadChannel(config: ScheduleConfig): void {
        // Validate config
        if (!config.content || config.content.length === 0) {
            throw new Error(SCHEDULER_ERROR_MESSAGES.EMPTY_CHANNEL);
        }

        // Stop any existing timer
        this._stopSyncTimer();

        // Validate and normalize anchorTime - fallback to now if invalid
        let anchorTime = config.anchorTime;
        if (!Number.isFinite(anchorTime) || anchorTime <= 0) {
            anchorTime = Date.now();
        }

        // Store config with validated anchorTime
        this._config = { ...config, anchorTime };

        // Build schedule index
        this._index = buildScheduleIndex(this._config, this._shuffler);

        // Mark as active
        this._isActive = true;
        this._lastSyncTime = Date.now();

        // Calculate initial programs
        this._currentProgram = this.getProgramAtTime(Date.now());
        this._nextProgram = calculateNextProgram(
            this._currentProgram,
            this._index,
            this._config.anchorTime
        );

        // Start sync timer
        this._startSyncTimer();

        // Emit initial programStart
        this._emitter.emit('programStart', this._currentProgram);
    }

    /**
     * Unload the current channel.
     */
    public unloadChannel(): void {
        this._stopSyncTimer();
        this._config = null;
        this._index = null;
        this._isActive = false;
        this._currentProgram = null;
        this._nextProgram = null;
        this._lastSyncTime = 0;
    }

    // ============================================
    // Time-based Queries
    // ============================================

    /**
     * Get the program playing at a specific time.
     * @param time - Unix timestamp in ms
     * @returns The scheduled program at that time
     * @throws Error if no channel is loaded
     */
    public getProgramAtTime(time: number): ScheduledProgram {
        this._ensureLoaded();
        return calculateProgramAtTime(time, this._index!, this._config!.anchorTime);
    }

    /**
     * Get the currently playing program.
     * @returns The current program
     * @throws Error if no channel is loaded
     */
    public getCurrentProgram(): ScheduledProgram {
        this._ensureLoaded();
        return this.getProgramAtTime(Date.now());
    }

    /**
     * Get the next program after the current one.
     * @returns The next program
     * @throws Error if no channel is loaded
     */
    public getNextProgram(): ScheduledProgram {
        this._ensureLoaded();
        const current = this.getCurrentProgram();
        return calculateNextProgram(current, this._index!, this._config!.anchorTime);
    }

    /**
     * Get the previous program before the current one.
     * @returns The previous program
     * @throws Error if no channel is loaded
     */
    public getPreviousProgram(): ScheduledProgram {
        this._ensureLoaded();
        const current = this.getCurrentProgram();
        return calculatePreviousProgram(current, this._index!, this._config!.anchorTime);
    }

    // ============================================
    // Window Queries
    // ============================================

    /**
     * Get all programs within a time window.
     * Uses internal buffer to avoid allocation per call.
     * @param startTime - Window start (Unix ms)
     * @param endTime - Window end (Unix ms)
     * @returns Schedule window (programs array is reused - copy if storing)
     * @remarks The returned programs array is an internal buffer. Subsequent
     * calls will mutate this array. Clone if you need to persist the data.
     * @throws Error if no channel is loaded or invalid range
     */
    public getScheduleWindow(startTime: number, endTime: number): ScheduleWindow {
        this._ensureLoaded();

        if (startTime >= endTime) {
            throw new Error(SCHEDULER_ERROR_MESSAGES.INVALID_TIME_RANGE);
        }

        // Reuse internal buffer to avoid per-call allocation
        const programs = generateScheduleWindow(
            startTime,
            endTime,
            this._index!,
            this._config!.anchorTime,
            this._windowBuffer
        );

        return {
            startTime,
            endTime,
            programs,
        };
    }

    /**
     * Get the next N upcoming programs.
     * Uses internal buffer to avoid allocation per call.
     * @param count - Number of programs to return
     * @param output - Optional pre-allocated output array (will be cleared before use)
     * @returns Array of upcoming programs (array may be reused internally)
     * @throws Error if no channel is loaded
     */
    public getUpcoming(count: number, output?: ScheduledProgram[]): ScheduledProgram[] {
        this._ensureLoaded();

        // Use provided output or internal buffer to avoid per-call allocation
        const programs = output ?? this._upcomingBuffer;
        programs.length = 0; // Clear existing contents

        if (count <= 0) {
            return programs;
        }

        let current = this.getCurrentProgram();
        programs.push(current);

        for (let i = 1; i < count; i++) {
            current = calculateNextProgram(current, this._index!, this._config!.anchorTime);
            programs.push(current);
        }

        return programs;
    }

    // ============================================
    // Playback Sync
    // ============================================

    /**
     * Synchronize scheduler state with wall-clock time.
     */
    public syncToCurrentTime(): void {
        if (!this._isActive || !this._config || !this._index) {
            return;
        }

        const now = Date.now();
        const newCurrentProgram = this.getProgramAtTime(now);

        // Update current program (emits events if changed)
        this._updateCurrentProgram(newCurrentProgram);

        // Emit sync event
        this._emitter.emit('scheduleSync', this.getState());
    }

    /**
     * Check if the schedule is stale.
     * @param currentTime - Current wall-clock time
     * @returns True if schedule needs resync
     */
    public isScheduleStale(currentTime: number): boolean {
        if (!this._currentProgram) {
            return true;
        }

        // Check if current program should have ended
        const drift = Math.abs(currentTime - this._lastSyncTime);
        return drift > RESYNC_THRESHOLD_MS;
    }

    /**
     * Force recalculation from a specific time.
     * @param time - Time to recalculate from
     */
    public recalculateFromTime(time: number): void {
        if (!this._isActive || !this._config || !this._index) {
            return;
        }

        const newProgram = this.getProgramAtTime(time);
        this._updateCurrentProgram(newProgram);
    }

    // ============================================
    // Navigation
    // ============================================

    /**
     * Jump to a specific program in the schedule.
     * Adjusts the schedule anchor so the jumped-to program aligns with wall-clock time,
     * ensuring the navigation persists across sync ticks.
     * @param program - The program to jump to
     */
    public jumpToProgram(program: ScheduledProgram): void {
        if (!this._isActive || !this._config || !this._index) {
            return;
        }

        const now = Date.now();

        // Calculate how much to shift the anchor so this program is "current" at wall time
        // program.scheduledStartTime is relative to old anchor
        // We want: newAnchor + offset = now - elapsedMs
        // Where offset is the program's position in the loop
        const programPositionInLoop = this._index.itemStartOffsets[program.scheduleIndex] ?? 0;
        const loopOffset = program.loopNumber * this._index.totalLoopDurationMs;
        const programStartFromAnchor = loopOffset + programPositionInLoop;

        // Calculate true elapsed time based on scheduledStartTime to avoid stale metadata
        const trueElapsed = now - program.scheduledStartTime;

        // If program is "live" (within duration), preserve schedule (resume).
        // Otherwise (future/past), shift schedule to start from beginning.
        const isLive = trueElapsed >= 0 && trueElapsed < program.item.durationMs;
        const effectiveElapsed = isLive ? trueElapsed : 0;

        // New anchor: now - effectiveElapsed - programStartFromAnchor
        const newAnchorTime = now - effectiveElapsed - programStartFromAnchor;

        // Update config with new anchor
        this._config = { ...this._config, anchorTime: newAnchorTime };

        // Rebuild index with new anchor (shuffle order stays same since seed unchanged)
        this._index = buildScheduleIndex(this._config, this._shuffler);

        // Emit programEnd for old program
        if (this._currentProgram) {
            this._emitter.emit('programEnd', this._currentProgram);
        }

        // Recalculate program at new anchor-adjusted "now"
        this._currentProgram = this.getProgramAtTime(now);
        this._nextProgram = calculateNextProgram(this._currentProgram, this._index, this._config.anchorTime);
        this._lastSyncTime = now;

        this._emitter.emit('programStart', this._currentProgram);
    }

    /**
     * Skip to the next program.
     */
    public skipToNext(): void {
        if (!this._isActive || !this._config || !this._index) {
            return;
        }

        const next = this.getNextProgram();
        this.jumpToProgram(next);
    }

    /**
     * Skip to the previous program.
     * Resets elapsed position to 0 for "restart from beginning" user experience.
     */
    public skipToPrevious(): void {
        if (!this._isActive || !this._config || !this._index) {
            return;
        }

        const previous = this.getPreviousProgram();
        // Reset elapsed position for proper "skip to previous" behavior
        // User expects to start from beginning, not resume from where we queried
        const resetProgram = {
            ...previous,
            elapsedMs: 0,
            remainingMs: previous.item.durationMs,
        };
        this.jumpToProgram(resetProgram);
    }

    // ============================================
    // State
    // ============================================

    /**
     * Get the current scheduler state.
     * @returns Current state
     */
    public getState(): SchedulerState {
        const channelId = this._config?.channelId || '';
        const currentProgram = this._currentProgram;

        return {
            channelId,
            isActive: this._isActive,
            currentProgram,
            nextProgram: this._nextProgram,
            schedulePosition: {
                loopNumber: currentProgram?.loopNumber || 0,
                itemIndex: currentProgram?.scheduleIndex || 0,
                offsetMs: currentProgram?.elapsedMs || 0,
            },
            lastSyncTime: this._lastSyncTime,
        };
    }

    /**
     * Get the pre-computed schedule index.
     * @returns Schedule index
     * @throws Error if no channel is loaded
     */
    public getScheduleIndex(): ScheduleIndex {
        this._ensureLoaded();
        return this._index!;
    }

    // ============================================
    // Events
    // ============================================

    /**
     * Subscribe to programStart event.
     * @param event - Event name
     * @param handler - Event handler
     */
    public on(event: 'programStart', handler: (program: ScheduledProgram) => void): void;
    /**
     * Subscribe to programEnd event.
     * @param event - Event name
     * @param handler - Event handler
     */
    public on(event: 'programEnd', handler: (program: ScheduledProgram) => void): void;
    /**
     * Subscribe to scheduleSync event.
     * @param event - Event name
     * @param handler - Event handler
     */
    public on(event: 'scheduleSync', handler: (state: SchedulerState) => void): void;
    public on(
        event: 'programStart' | 'programEnd' | 'scheduleSync',
        handler: ((program: ScheduledProgram) => void) | ((state: SchedulerState) => void)
    ): void {
        this._emitter.on(event, handler as (payload: unknown) => void);
    }

    /**
     * Unsubscribe from an event.
     * @param event - Event name
     * @param handler - Event handler
     */
    public off(
        event: 'programStart' | 'programEnd' | 'scheduleSync',
        handler: ((program: ScheduledProgram) => void) | ((state: SchedulerState) => void)
    ): void {
        this._emitter.off(event, handler as (payload: unknown) => void);
    }

    // ============================================
    // Private Methods
    // ============================================

    /**
     * Ensure a channel is loaded.
     * @throws Error if no channel is loaded
     */
    private _ensureLoaded(): void {
        if (!this._config || !this._index) {
            throw new Error(SCHEDULER_ERROR_MESSAGES.NO_CHANNEL_LOADED);
        }
    }

    /**
     * Update current program and emit transition events if changed.
     * @param newProgram - The new program to set as current
     * @returns true if program changed, false otherwise
     */
    private _updateCurrentProgram(newProgram: ScheduledProgram): boolean {
        const programChanged = this._currentProgram && (
            newProgram.scheduledStartTime !== this._currentProgram.scheduledStartTime ||
            newProgram.scheduledEndTime !== this._currentProgram.scheduledEndTime
        );

        if (programChanged) {
            // _currentProgram is guaranteed to be non-null here by programChanged definition
            this._emitter.emit('programEnd', this._currentProgram!);
            this._emitter.emit('programStart', newProgram);
        }

        this._currentProgram = newProgram;
        this._nextProgram = calculateNextProgram(newProgram, this._index!, this._config!.anchorTime);
        this._lastSyncTime = Date.now();

        return !!programChanged;
    }

    /**
     * Start the sync timer with drift detection.
     */
    private _startSyncTimer(): void {
        this._syncTimerState.expectedNextTick = Date.now() + SYNC_INTERVAL_MS;

        this._syncTimerState.interval = globalThis.setInterval(() => {
            const now = Date.now();
            const drift = now - this._syncTimerState.expectedNextTick;

            // Case 1: Normal tick (within tolerance)
            if (Math.abs(drift) < this._syncTimerState.maxDriftMs) {
                this.syncToCurrentTime();
                this._syncTimerState.expectedNextTick = now + SYNC_INTERVAL_MS;
                return;
            }

            // Case 2: Significant drift detected (system was suspended, tab inactive)
            if (drift > this._syncTimerState.resyncThreshold) {
                console.warn(
                    '[Scheduler] Timer drift detected: ' + drift + 'ms, performing hard resync'
                );
                this._hardResync();
                this._syncTimerState.expectedNextTick = now + SYNC_INTERVAL_MS;
                return;
            }

            // Case 3: Minor drift - adjust timing
            this.syncToCurrentTime();

            // Only compensate for positive drift (timer running late)
            // Negative drift is unusual and shouldn't push expectedNextTick forward
            if (drift > 0) {
                const adjustment = Math.min(drift, 100); // Cap adjustment at 100ms
                this._syncTimerState.expectedNextTick = now + SYNC_INTERVAL_MS - adjustment;
            } else {
                this._syncTimerState.expectedNextTick = now + SYNC_INTERVAL_MS;
            }
        }, SYNC_INTERVAL_MS);
    }

    /**
     * Stop the sync timer.
     */
    private _stopSyncTimer(): void {
        if (this._syncTimerState.interval !== null) {
            globalThis.clearInterval(this._syncTimerState.interval);
            this._syncTimerState.interval = null;
        }
    }

    /**
     * Hard resync: Called when drift exceeds threshold.
     * Recalculates everything from wall-clock time.
     */
    private _hardResync(): void {
        if (!this._config || !this._index) {
            return;
        }

        const now = Date.now();
        const previousCurrent = this._currentProgram;

        // Get and update to current program
        const currentProgram = this.getProgramAtTime(now);
        this._updateCurrentProgram(currentProgram);

        // Emit sync event with hard resync info
        const previousEndTime = previousCurrent
            ? previousCurrent.scheduledEndTime
            : now;
        const state: SchedulerState = {
            ...this.getState(),
            wasHardResync: true,
            detectedDriftMs: now - previousEndTime,
        };
        this._emitter.emit('scheduleSync', state);
    }
}
