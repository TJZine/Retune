/**
 * @fileoverview Pure functions for schedule calculations.
 * Provides O(log n) binary search and schedule index building.
 * @module modules/scheduler/scheduler/ScheduleCalculator
 * @version 1.0.0
 */

import type { IShuffleGenerator } from './interfaces';
import type {
    ScheduleConfig,
    ScheduledProgram,
    ScheduleIndex,
    ResolvedContentItem,
    PlaybackMode,
} from './types';
import { SCHEDULER_ERROR_MESSAGES } from './constants';

// ============================================
// Schedule Index Building
// ============================================

/**
 * Build a schedule index from configuration.
 * Pre-computes cumulative offsets for O(log n) lookups.
 *
 * @param config - Schedule configuration
 * @param shuffler - Shuffle generator for playback mode
 * @returns Pre-computed schedule index
 * @throws Error if content is empty
 */
export function buildScheduleIndex(
    config: ScheduleConfig,
    shuffler: IShuffleGenerator
): ScheduleIndex {
    if (config.content.length === 0) {
        throw new Error(SCHEDULER_ERROR_MESSAGES.EMPTY_CHANNEL);
    }

    // Apply playback mode to get ordered items
    const orderedItems = applyPlaybackMode(
        config.content,
        config.playbackMode,
        config.shuffleSeed,
        shuffler
    );

    // Calculate cumulative start offsets
    const itemStartOffsets: number[] = [];
    let cumulativeOffset = 0;

    for (let i = 0; i < orderedItems.length; i++) {
        itemStartOffsets.push(cumulativeOffset);
        const item = orderedItems[i];
        if (item) {
            cumulativeOffset += item.durationMs;
        }
    }

    const totalLoopDurationMs = cumulativeOffset;

    // Fix #3: Guard against zero-duration schedules (division by zero prevention)
    if (totalLoopDurationMs === 0) {
        throw new Error(SCHEDULER_ERROR_MESSAGES.INVALID_SCHEDULE_DURATION);
    }

    return {
        channelId: config.channelId,
        generatedAt: Date.now(),
        totalLoopDurationMs,
        itemStartOffsets,
        orderedItems,
    };
}

// ============================================
// Binary Search
// ============================================

/**
 * Binary search to find the item index at a given position in the loop.
 * Returns the index of the item where positionInLoop falls within
 * [itemStartOffsets[index], itemStartOffsets[index+1]).
 *
 * @param positionInLoop - Position within the loop (ms)
 * @param itemStartOffsets - Cumulative start offsets
 * @returns Index of the item at that position
 */
export function binarySearchForItem(
    positionInLoop: number,
    itemStartOffsets: number[]
): number {
    let low = 0;
    let high = itemStartOffsets.length - 1;

    while (low < high) {
        // Use ceil to find upper bound
        const mid = Math.ceil((low + high + 1) / 2);
        const midOffset = itemStartOffsets[mid];
        if (midOffset !== undefined && midOffset <= positionInLoop) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }

    return low;
}

// ============================================
// Program Calculation
// ============================================

/**
 * Calculate the program playing at a specific time.
 * Core algorithm with O(log n) complexity.
 *
 * @param queryTime - Unix timestamp in ms
 * @param index - Pre-computed schedule index
 * @param anchorTime - Schedule anchor time
 * @returns The scheduled program at that time
 */
export function calculateProgramAtTime(
    queryTime: number,
    index: ScheduleIndex,
    anchorTime: number
): ScheduledProgram {
    const { totalLoopDurationMs, itemStartOffsets, orderedItems } = index;

    // 1. Calculate elapsed since anchor
    const elapsedSinceAnchor = queryTime - anchorTime;

    // 2. Determine loop iteration
    const loopNumber = Math.floor(elapsedSinceAnchor / totalLoopDurationMs);

    // 3. Position within current loop (handle negative times correctly)
    const positionInLoop =
        ((elapsedSinceAnchor % totalLoopDurationMs) + totalLoopDurationMs) %
        totalLoopDurationMs;

    // 4. Binary search for current item
    const itemIndex = binarySearchForItem(positionInLoop, itemStartOffsets);

    // 5. Calculate offset within item
    const itemStartOffset = itemStartOffsets[itemIndex] ?? 0;
    const offsetInItem = positionInLoop - itemStartOffset;

    const item = orderedItems[itemIndex];
    if (!item) {
        throw new Error('Item not found at index ' + itemIndex);
    }
    const remainingMs = item.durationMs - offsetInItem;

    // 6. Calculate absolute times
    const loopStartTime = anchorTime + loopNumber * totalLoopDurationMs;
    const absoluteStart = loopStartTime + itemStartOffset;
    const absoluteEnd = absoluteStart + item.durationMs;

    // Check if this is the current program
    const now = Date.now();
    const isCurrent = now >= absoluteStart && now < absoluteEnd;

    return {
        item,
        scheduledStartTime: absoluteStart,
        scheduledEndTime: absoluteEnd,
        elapsedMs: offsetInItem,
        remainingMs,
        scheduleIndex: itemIndex,
        loopNumber,
        streamDescriptor: null, // Resolved separately by orchestrator
        isCurrent,
    };
}

/**
 * Calculate the next program after a given program.
 *
 * @param currentProgram - Current program
 * @param index - Schedule index
 * @param anchorTime - Schedule anchor time
 * @returns The next scheduled program
 */
export function calculateNextProgram(
    currentProgram: ScheduledProgram,
    index: ScheduleIndex,
    anchorTime: number
): ScheduledProgram {
    // Query 1ms after current program ends to get next
    return calculateProgramAtTime(
        currentProgram.scheduledEndTime + 1,
        index,
        anchorTime
    );
}

/**
 * Calculate the previous program before a given program.
 *
 * @param currentProgram - Current program
 * @param index - Schedule index
 * @param anchorTime - Schedule anchor time
 * @returns The previous scheduled program
 */
export function calculatePreviousProgram(
    currentProgram: ScheduledProgram,
    index: ScheduleIndex,
    anchorTime: number
): ScheduledProgram {
    // Query 1ms before current program starts to get previous
    // Returns the program at its actual elapsed position in the schedule
    return calculateProgramAtTime(
        currentProgram.scheduledStartTime - 1,
        index,
        anchorTime
    );
}

// ============================================
// Playback Mode
// ============================================

/**
 * Apply playback mode to content items.
 * Scheduler only supports deterministic modes for replay/debugging.
 *
 * @param items - Original content items
 * @param mode - Playback mode
 * @param seed - Shuffle seed (used for shuffle mode)
 * @param shuffler - Shuffle generator
 * @returns Ordered items based on mode
 *
 * @remarks
 * The 'random' mode is deprecated in the scheduler. True random ordering
 * should be resolved upstream by ContentResolver using Date.now() as seed.
 * The scheduler treats 'random' identically to 'shuffle' for determinism.
 */
export function applyPlaybackMode(
    items: ResolvedContentItem[],
    mode: PlaybackMode,
    seed: number,
    shuffler: IShuffleGenerator
): ResolvedContentItem[] {
    switch (mode) {
        case 'sequential':
            // Return copy in original order
            return items.map((item, index) => ({
                ...item,
                scheduledIndex: index,
            }));

        case 'shuffle': {
            const shuffled = shuffler.shuffle(items, seed);
            return shuffled.map((item, index) => ({
                ...item,
                scheduledIndex: index,
            }));
        }

        case 'random':
            // Fix #2: Random mode must be resolved upstream
            // The scheduler is deterministic - upstream must generate a fresh seed
            // and pass playbackMode: 'shuffle' instead
            throw new Error(SCHEDULER_ERROR_MESSAGES.RANDOM_MODE_UNSUPPORTED);

        default:
            // Fallback to sequential
            return items.map((item, index) => ({
                ...item,
                scheduledIndex: index,
            }));
    }
}

// ============================================
// Schedule Window Generation
// ============================================

/**
 * Generate a schedule window for EPG display.
 * Accepts optional pre-allocated output array to avoid allocation.
 *
 * @param startTime - Window start (Unix ms)
 * @param endTime - Window end (Unix ms)
 * @param index - Schedule index
 * @param anchorTime - Schedule anchor time
 * @param output - Optional pre-allocated output array (will be cleared and reused)
 * @returns Schedule window with all programs
 */
export function generateScheduleWindow(
    startTime: number,
    endTime: number,
    index: ScheduleIndex,
    anchorTime: number,
    output?: ScheduledProgram[]
): ScheduledProgram[] {
    // Reuse output array if provided, otherwise allocate new
    const programs = output ?? [];
    programs.length = 0; // Clear existing contents

    // Get the first program that overlaps with startTime
    let currentProgram = calculateProgramAtTime(startTime, index, anchorTime);
    programs.push(currentProgram);

    // Walk forward until we pass endTime
    while (currentProgram.scheduledEndTime < endTime) {
        currentProgram = calculateNextProgram(currentProgram, index, anchorTime);
        programs.push(currentProgram);
    }

    return programs;
}
