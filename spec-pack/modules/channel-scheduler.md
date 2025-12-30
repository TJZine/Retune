# Module: Channel Scheduler

## Metadata
- **ID**: `channel-scheduler`
- **Path**: `src/modules/scheduler/scheduler/`
- **Primary File**: `ChannelScheduler.ts`
- **Test File**: `ChannelScheduler.test.ts`
- **Dependencies**: `channel-manager`
- **Complexity**: high
- **Estimated LoC**: 550

## Purpose

Generates and maintains deterministic playback schedules based on wall-clock time. Given a channel's content and the current time, calculates exactly which content item should be playing and at what offset. The schedule is infinitely looping and must be reproducible—the same channel configuration and time always yields the same result.

## Public Interface

```typescript
/**
 * Channel Scheduler Interface
 * Manages deterministic schedule generation and time-based queries
 */
export interface IChannelScheduler {
  // Schedule Generation
  loadChannel(config: ScheduleConfig): void;
  unloadChannel(): void;
  
  // Time-based Queries (Core Algorithm)
  getProgramAtTime(time: number): ScheduledProgram;
  getCurrentProgram(): ScheduledProgram;
  getNextProgram(): ScheduledProgram;
  getPreviousProgram(): ScheduledProgram;
  
  // Window Queries (for EPG)
  getScheduleWindow(startTime: number, endTime: number): ScheduleWindow;
  getUpcoming(count: number): ScheduledProgram[];
  
  // Playback Sync
  syncToCurrentTime(): void;
  isScheduleStale(currentTime: number): boolean;
  recalculateFromTime(time: number): void;
  
  // Navigation
  jumpToProgram(program: ScheduledProgram): void;
  skipToNext(): void;
  skipToPrevious(): void;
  
  // State
  getState(): SchedulerState;
  getScheduleIndex(): ScheduleIndex;
  
  // Events
  on(event: 'programStart', handler: (program: ScheduledProgram) => void): void;
  on(event: 'programEnd', handler: (program: ScheduledProgram) => void): void;
  on(event: 'scheduleSync', handler: (state: SchedulerState) => void): void;
}

/**
 * Deterministic Shuffle Generator
 */
export interface IShuffleGenerator {
  shuffle<T>(items: T[], seed: number): T[];
  shuffleIndices(count: number, seed: number): number[];
  generateSeed(channelId: string, anchorTime: number): number;
}
```

## Required Exports

```typescript
// src/modules/scheduler/scheduler/index.ts
export { ChannelScheduler } from './ChannelScheduler';
export { ShuffleGenerator } from './ShuffleGenerator';
export { ScheduleCalculator } from './ScheduleCalculator';
export type { IChannelScheduler, IShuffleGenerator } from './interfaces';
export type {
  ScheduleConfig,
  ScheduledProgram,
  ScheduleWindow,
  SchedulerState,
  ScheduleIndex,
  ShuffleResult
} from './types';
```

## Implementation Requirements

### MUST Implement:

1. **Deterministic Scheduling Algorithm**
   - Formula: `position = (currentTime - anchorTime) % totalLoopDuration`
   - Use binary search for O(log n) item lookup
   - Handle edge cases: empty channel, single item, very short items

2. **Schedule Index Building**
   - Pre-compute cumulative start offsets for each item
   - Store ordered items after applying playback mode
   - Calculate total loop duration

3. **Deterministic Shuffle (Mulberry32 PRNG)**
   - Fisher-Yates shuffle with seeded random
   - Same seed MUST produce identical order every time
   - Seed derived from channelId + anchorTime

4. **Time Window Generation**
   - Generate programs for any time range (for EPG)
   - Walk forward from start time to end time
   - Include partial programs at boundaries

5. **Real-time Sync**
   - Timer-based check every 1 second
   - Emit `programEnd` when current program finishes
   - Emit `programStart` when next program begins
   - Handle clock drift gracefully

### MUST NOT:

1. Store the entire schedule in memory (calculate on-demand)
2. Allocate new arrays on every query (reuse where possible)
3. Use non-deterministic random (Math.random() is forbidden)
4. Block the main thread during calculations

### State Management:

```typescript
interface SchedulerInternalState {
  config: ScheduleConfig | null;
  index: ScheduleIndex | null;
  isActive: boolean;
  syncTimer: number | null;
  lastSyncTime: number;
}
```

- **Persistence**: None (recalculated from ChannelManager)
- **Initialization**: Call `loadChannel()` with `ScheduleConfig`

### Error Handling:

| Scenario | Handling |
|----------|----------|
| Empty content list | Throw Error('Cannot schedule empty channel') |
| Invalid anchor time | Use current time as fallback |
| Timer drift > 5s | Force resync and emit event |

## Core Algorithm Specification

### `getProgramAtTime(queryTime: number): ScheduledProgram`

**Purpose**: Calculate which program is playing at any given time.

**Algorithm (Pseudocode)**:
```typescript
function getProgramAtTime(queryTime: number): ScheduledProgram {
  const { totalLoopDurationMs, itemStartOffsets, orderedItems } = this.index;
  
  if (orderedItems.length === 0) {
    throw new Error('Cannot schedule empty channel');
  }
  
  // 1. Calculate position within the infinite schedule
  const elapsedSinceAnchor = queryTime - this.config.anchorTime;
  
  // 2. Determine which loop iteration we're in
  const loopNumber = Math.floor(elapsedSinceAnchor / totalLoopDurationMs);
  
  // 3. Position within current loop (handle negative times)
  const positionInLoop = ((elapsedSinceAnchor % totalLoopDurationMs) + totalLoopDurationMs) % totalLoopDurationMs;
  
  // 4. Binary search for current item
  const itemIndex = this.binarySearchForItem(positionInLoop);
  
  // 5. Calculate offset within item
  const itemStartOffset = itemStartOffsets[itemIndex];
  const offsetInItem = positionInLoop - itemStartOffset;
  
  const item = orderedItems[itemIndex];
  const remainingMs = item.durationMs - offsetInItem;
  
  // 6. Calculate absolute times
  const absoluteStart = this.config.anchorTime + (loopNumber * totalLoopDurationMs) + itemStartOffset;
  const absoluteEnd = absoluteStart + item.durationMs;
  
  return {
    item,
    scheduledStartTime: absoluteStart,
    scheduledEndTime: absoluteEnd,
    elapsedMs: offsetInItem,
    remainingMs,
    scheduleIndex: itemIndex,
    loopNumber,
    streamDescriptor: null  // Resolved separately by orchestrator
  };
}
```

**Time Complexity**: O(log n) where n = number of items
**Space Complexity**: O(1) for query (index is pre-built)

### Binary Search Implementation

```typescript
private binarySearchForItem(positionInLoop: number): number {
  const { itemStartOffsets } = this.index;
  let low = 0;
  let high = itemStartOffsets.length - 1;
  
  while (low < high) {
    const mid = Math.ceil((low + high + 1) / 2);
    if (itemStartOffsets[mid] <= positionInLoop) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  
  return low;
}
```

### Deterministic Shuffle (Mulberry32)

```typescript
private createSeededRandom(seed: number): () => number {
  // Mulberry32 PRNG - fast, good distribution
  return function(): number {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

shuffle<T>(items: T[], seed: number): T[] {
  const result = [...items];
  const random = this.createSeededRandom(seed);
  
  // Fisher-Yates shuffle
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  
  return result;
}
```

## Method Specifications

### `loadChannel(config: ScheduleConfig): void`

**Purpose**: Initialize scheduler with channel content and build index.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| config | ScheduleConfig | Yes | Channel schedule configuration |

**Side Effects**:
- Builds `ScheduleIndex`
- Starts sync timer
- Emits initial `programStart` event

**Implementation Notes**:
```typescript
1. Validate config (non-empty content)
2. Apply playback mode (sequential/shuffle)
3. Build cumulative offset index
4. Store config and index in state
5. Start 1-second sync timer
6. Sync to current time immediately
```

---

### `getScheduleWindow(startTime: number, endTime: number): ScheduleWindow`

**Purpose**: Get all programs within a time range (for EPG display).

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| startTime | number | Yes | Window start (Unix ms) |
| endTime | number | Yes | Window end (Unix ms) |

**Returns**: `ScheduleWindow` with array of programs

**Implementation Notes**:
```typescript
1. Get program at startTime
2. Add to results array
3. While currentProgram.scheduledEndTime < endTime:
   a. Get next program (query for endTime + 1ms)
   b. Add to results
4. Return ScheduleWindow
```

---

### `syncToCurrentTime(): void`

**Purpose**: Align scheduler state with wall-clock time.

**Side Effects**:
- Updates currentProgram and nextProgram
- Emits `scheduleSync` event
- May emit `programStart`/`programEnd` if program changed

**Implementation Notes**:
```typescript
1. Get program at Date.now()
2. Compare with stored currentProgram
3. If different:
   a. Emit programEnd for old program
   b. Emit programStart for new program
   c. Update state
4. Always emit scheduleSync
```

## Internal Architecture

### Timer Drift Resync Algorithm

> [!IMPORTANT]
> JavaScript timers (setInterval) are not precise and can drift, especially when the browser tab is inactive or system is under load.

**Drift Detection and Correction:**
```typescript
interface SyncTimerState {
  expectedNextTick: number;
  maxDriftMs: number;     // 500ms threshold
  resyncThreshold: number; // 2000ms - trigger hard resync
  interval: number;
}

private syncTimerState: SyncTimerState = {
  expectedNextTick: 0,
  maxDriftMs: 500,
  resyncThreshold: 2000,
  interval: 0
};

private _startSyncTimer(): void {
  const INTERVAL_MS = 1000;
  
  this.syncTimerState.expectedNextTick = Date.now() + INTERVAL_MS;
  
  this.syncTimerState.interval = window.setInterval(() => {
    const now = Date.now();
    const drift = now - this.syncTimerState.expectedNextTick;
    
    // Case 1: Normal tick (within tolerance)
    if (Math.abs(drift) < this.syncTimerState.maxDriftMs) {
      this.syncToCurrentTime();
      this.syncTimerState.expectedNextTick = now + INTERVAL_MS;
      return;
    }
    
    // Case 2: Significant drift detected (system was suspended, tab inactive)
    if (drift > this.syncTimerState.resyncThreshold) {
      console.warn(`[Scheduler] Timer drift detected: ${drift}ms, performing hard resync`);
      
      // Force recalculate current program from scratch
      this._hardResync();
      
      // Reset expected tick
      this.syncTimerState.expectedNextTick = now + INTERVAL_MS;
      return;
    }
    
    // Case 3: Minor drift - adjust timing
    this.syncToCurrentTime();
    
    // Adjust next tick to compensate
    const adjustment = Math.min(drift, 100); // Cap adjustment at 100ms
    this.syncTimerState.expectedNextTick = now + INTERVAL_MS - adjustment;
    
  }, INTERVAL_MS);
}

/**
 * Hard resync: Called when drift exceeds threshold (e.g., after system resume)
 * Recalculates everything from wall-clock time
 */
private _hardResync(): void {
  const now = Date.now();
  
  // Get the actual current program
  const currentProgram = this.getProgramAtTime(now);
  const previousCurrent = this.state.currentProgram;
  
  // Check if program changed during the drift period
  if (previousCurrent && 
      currentProgram.item.ratingKey !== previousCurrent.item.ratingKey) {
    // We missed a program transition - emit events
    this.emit('programEnd', previousCurrent);
    this.emit('programStart', currentProgram);
  }
  
  // Update state
  this.state.currentProgram = currentProgram;
  this.state.nextProgram = this.getNextProgram();
  
  // Emit sync event with drift flag
  this.emit('scheduleSync', {
    ...this.getState(),
    wasHardResync: true,
    detectedDriftMs: now - (previousCurrent?.scheduledEndTime ?? now)
  });
}
```

### Private Methods:
- `_buildIndex(config)`: Create ScheduleIndex from config
- `_binarySearchForItem(position)`: O(log n) item lookup
- `_startSyncTimer()`: Begin 1-second interval
- `_stopSyncTimer()`: Clear interval
- `_applyPlaybackMode(items, mode, seed)`: Apply shuffle/order

### Class Diagram:
```
┌─────────────────────────────────┐
│      ChannelScheduler           │
├─────────────────────────────────┤
│ - config: ScheduleConfig        │
│ - index: ScheduleIndex          │
│ - isActive: boolean             │
│ - syncTimer: number             │
│ - shuffler: IShuffleGenerator   │
│ - eventEmitter: EventEmitter    │
├─────────────────────────────────┤
│ + loadChannel(config): void     │
│ + unloadChannel(): void         │
│ + getProgramAtTime(): Program   │
│ + getCurrentProgram(): Program  │
│ + getNextProgram(): Program     │
│ + getPreviousProgram(): Program │
│ + getScheduleWindow(): Window   │
│ + getUpcoming(count): Program[] │
│ + syncToCurrentTime(): void     │
│ + isScheduleStale(): boolean    │
│ + skipToNext(): void            │
│ + skipToPrevious(): void        │
│ + getState(): SchedulerState    │
│ + on(event, handler): void      │
│ - _buildIndex(): ScheduleIndex  │
│ - _binarySearchForItem(): int   │
│ - _startSyncTimer(): void       │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│      ShuffleGenerator           │
├─────────────────────────────────┤
│ + shuffle<T>(items, seed): T[]  │
│ + shuffleIndices(count, seed)   │
│ + generateSeed(id, time): num   │
│ - _createSeededRandom(): fn     │
└─────────────────────────────────┘
```

## Events Emitted

| Event Name | Payload Type | When Emitted |
|------------|--------------|--------------|
| `programStart` | `ScheduledProgram` | New program begins playing |
| `programEnd` | `ScheduledProgram` | Current program finishes |
| `scheduleSync` | `SchedulerState` | After each sync tick |

## Events Consumed

| Event Name | Source Module | Handler Behavior |
|------------|---------------|------------------|
| `contentResolved` | `channel-manager` | Reload schedule with new content |

## Test Specification

### Unit Tests Required:

```typescript
describe('ChannelScheduler', () => {
  describe('getProgramAtTime', () => {
    it('should return correct program for time within first item', () => {
      // Setup: 3 items of 30min each, anchor = 0
      // Query time = 15min → should return first item at 15min offset
    });
    
    it('should return correct program for time in middle of schedule', () => {
      // Query time = 45min → should return second item at 15min offset
    });
    
    it('should handle looping correctly', () => {
      // Total duration = 90min
      // Query time = 100min → should return first item at 10min offset, loop 1
    });
    
    it('should handle times before anchor (negative elapsed)', () => {
      // Anchor = 1000, query = 500
      // Should wrap correctly to end of loop
    });
    
    it('should throw for empty content', () => {
      // Expect Error with message 'Cannot schedule empty channel'
    });
  });
  
  describe('deterministic shuffle', () => {
    it('should produce same order with same seed', () => {
      const items = [1, 2, 3, 4, 5];
      const result1 = shuffler.shuffle(items, 12345);
      const result2 = shuffler.shuffle(items, 12345);
      expect(result1).toEqual(result2);
    });
    
    it('should produce different order with different seed', () => {
      const items = [1, 2, 3, 4, 5];
      const result1 = shuffler.shuffle(items, 12345);
      const result2 = shuffler.shuffle(items, 54321);
      expect(result1).not.toEqual(result2);
    });
  });
  
  describe('getScheduleWindow', () => {
    it('should return all programs in time range', () => {
      // 3 items of 30min each
      // Window 0-90min → should return all 3
    });
    
    it('should include partial programs at boundaries', () => {
      // Window 15min-45min → should return items 1 and 2
      // Item 1: partial (15min in)
      // Item 2: partial (ends at 60min)
    });
  });
  
  describe('syncToCurrentTime', () => {
    it('should emit programStart on initial sync', () => {
      // Verify event emitted with current program
    });
    
    it('should emit programEnd and programStart on program change', () => {
      // Advance mock time past current program
      // Verify both events emitted in order
    });
  });
});
```

### Performance Tests:

```typescript
describe('Performance', () => {
  it('should calculate current program in <50ms for 10000 items', () => {
    // Build schedule with 10000 items
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      scheduler.getProgramAtTime(Date.now() + i * 60000);
    }
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(50);
  });
});
```

### Mock Requirements:

When testing this module, mock:
- `Date.now()` for deterministic time
- `setInterval`/`clearInterval` for timer control

## File Structure

```
src/modules/scheduler/scheduler/
├── index.ts                  # Public exports
├── ChannelScheduler.ts       # Main class implementation
├── ScheduleCalculator.ts     # Core algorithm (pure functions)
├── ShuffleGenerator.ts       # Deterministic PRNG + shuffle
├── interfaces.ts             # IChannelScheduler interface
├── types.ts                  # Module-specific types
├── constants.ts              # Sync intervals, thresholds
└── __tests__/
    ├── ChannelScheduler.test.ts
    ├── ScheduleCalculator.test.ts
    └── ShuffleGenerator.test.ts
```

## Implementation Checklist

- [ ] Create file structure
- [ ] Implement Mulberry32 PRNG in ShuffleGenerator
- [ ] Implement Fisher-Yates shuffle with seeded random
- [ ] Implement index building with cumulative offsets
- [ ] Implement binary search for item lookup
- [ ] Implement getProgramAtTime core algorithm
- [ ] Implement getScheduleWindow for EPG
- [ ] Add sync timer with event emission
- [ ] Write unit tests including edge cases
- [ ] Add performance tests for large content lists
- [ ] Add JSDoc comments to all public methods
- [ ] Verify against acceptance criteria

## Acceptance Criteria

This module is COMPLETE when:
1. [ ] Same seed + content always produces identical schedule
2. [ ] getProgramAtTime returns correct program with O(log n) complexity
3. [ ] Schedule loops infinitely without gaps
4. [ ] EPG can request any time window and get correct programs
5. [ ] Real-time sync emits events within 1 second of program boundaries
6. [ ] All unit and performance tests pass
7. [ ] No TypeScript compilation errors
