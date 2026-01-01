# Module: EPG (Electronic Program Guide) UI

## Metadata

- **ID**: `epg-ui`
- **Path**: `src/modules/ui/epg/`
- **Primary File**: `EPGComponent.ts`
- **Test File**: `EPGComponent.test.ts`
- **Dependencies**: `navigation`, `channel-scheduler`, `channel-manager`
- **Complexity**: high
- **Estimated LoC**: 700

## Purpose

Provides the visual program guide interface displaying channels vertically and time horizontally in a grid format. Implements virtualized rendering for performance, focus management for D-pad navigation, and real-time updates with current time indicator. Designed for 10-foot TV viewing experience.

> [!TIP]
> **Accessibility**: See `accessibility-guidelines.md` for focus ring requirements, color contrast ratios, and text sizing standards for TV displays.

## Public Interface

```typescript
/**
 * EPG Component Interface
 * Electronic Program Guide grid with virtualized rendering
 */
export interface IEPGComponent {
  // Lifecycle
  initialize(config: EPGConfig): void;
  destroy(): void;
  
  // Visibility
  show(): void;
  hide(): void;
  toggle(): void;
  isVisible(): boolean;
  
  // Data Loading
  loadChannels(channels: ChannelConfig[]): void;
  loadScheduleForChannel(
    channelId: string, 
    schedule: ScheduleWindow
  ): void;
  refreshCurrentTime(): void;
  
  // Navigation
  focusChannel(channelIndex: number): void;
  focusProgram(channelIndex: number, programIndex: number): void;
  focusNow(): void;
  
  scrollToTime(time: number): void;
  scrollToChannel(channelIndex: number): void;
  
  // Input Handling
  handleNavigation(direction: 'up' | 'down' | 'left' | 'right'): boolean;
  handleSelect(): boolean;
  handleBack(): boolean;
  
  // State
  getState(): EPGState;
  getFocusedProgram(): ScheduledProgram | null;
  
  // Events
  on<K extends keyof EPGEventMap>(
    event: K, 
    handler: (payload: EPGEventMap[K]) => void
  ): void;
  off<K extends keyof EPGEventMap>(
    event: K, 
    handler: (payload: EPGEventMap[K]) => void
  ): void;
}

/**
 * EPG Info Panel Interface
 * Program details overlay
 */
export interface IEPGInfoPanel {
  show(program: ScheduledProgram): void;
  hide(): void;
  update(program: ScheduledProgram): void;
}
```

## Required Exports

```typescript
// src/modules/ui/epg/index.ts
export { EPGComponent } from './EPGComponent';
export { EPGInfoPanel } from './EPGInfoPanel';
export { EPGVirtualizer } from './EPGVirtualizer';
export type { IEPGComponent, IEPGInfoPanel } from './interfaces';
export type {
  EPGConfig,
  EPGState,
  EPGFocusPosition,
  EPGChannelRow,
  EPGProgramCell,
  VirtualizedGridState
} from './types';
```

## Implementation Requirements

### MUST Implement

1. **Virtualized Grid Rendering**
   - Only render visible cells plus buffer (max ~200 DOM elements)
   - Recycle DOM elements when scrolling
   - Buffer: 2 rows above/below, 60 minutes left/right

2. **Time-Based Layout**
   - Programs positioned by start time × pixels-per-minute
   - Program width = duration × pixels-per-minute
   - Handle programs spanning grid boundaries

3. **Current Time Indicator**
   - Vertical red line at current time position
   - Updates every minute
   - Visible even when scrolled

4. **D-Pad Navigation**
   - Left/Right: Move focus between programs (time axis)
   - Up/Down: Move focus between channels
   - At boundaries: scroll grid or reject movement
   - Focus transitions smoothly with animation

5. **Focus Ring + Info Panel**
   - Focused cell has prominent highlight (scale, glow)
   - Info panel shows detailed program info
   - Updates as focus changes

6. **TV-Safe Rendering**
   - 5% safe zone margins
   - Minimum text size: 24px
   - High contrast colors

### MUST NOT

1. Create more than ~200 DOM elements for grid cells
2. Re-render entire grid on small state changes
3. Use opacity animations (prefer transform for performance)
4. Block main thread during scroll/render

### State Management

```typescript
interface EPGInternalState {
  isVisible: boolean;
  channels: ChannelConfig[];
  schedules: Map<string, ScheduleWindow>;
  focusedCell: EPGFocusPosition | null;
  scrollPosition: {
    channelOffset: number;
    timeOffset: number;
  };
  currentTime: number;
  lastRenderTime: number;
}
```

- **Persistence**: None (UI state is ephemeral)
- **Initialization**: Hidden, no focus

### Error Handling

| Scenario | Error Type | Handling | User Message |
| -------- | ---------- | -------- | ------------ |
| Schedule not loaded | `LOADING` | Show skeleton placeholder | "Loading..." |
| Empty channel | `EMPTY_CHANNEL` | Show message cell | "No programs scheduled" |
| Focus on boundary | `NAV_BOUNDARY` | Return false from navigation | (No message) |
| Render failure | `RENDER_ERROR` | Log error, show fallback row | "Unable to display row" |
| Data parse error | `PARSE_ERROR` | Skip item, log warning | (Handle silently) |
| Scroll timeout | `SCROLL_TIMEOUT` | Reset scroll position | (Handle silently) |
| DOM pool exhausted | `POOL_EXHAUSTED` | Force recycle oldest | (Handle silently) |

**Error Recovery Implementation**:

```typescript
class EPGErrorBoundary {
  private errorCounts = new Map<string, number>();
  private readonly MAX_ERRORS_PER_TYPE = 3;
  
  handleError(type: EPGErrorType, context: string, error?: Error): void {
    const existing = this.errorCounts.get(type);
    const count = (existing !== undefined ? existing : 0) + 1;
    this.errorCounts.set(type, count);
    
    console.warn(`[EPG] ${type} in ${context}:`, error ? error.message : undefined);
    
    switch (type) {
      case 'RENDER_ERROR':
        // Show fallback row, don't crash entire grid
        this.showFallbackRow(context);
        break;
      case 'SCROLL_TIMEOUT':
        // Reset to known good state
        this.resetScrollPosition();
        break;
      case 'POOL_EXHAUSTED':
        // Aggressive cleanup
        this.forceRecycleAll();
        break;
    }
    
    // If too many errors, emit degraded mode event
    if (count >= this.MAX_ERRORS_PER_TYPE) {
      this.emit('degradedMode', { type, count });
    }
  }
}
```

## Layout Specification

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ [App Logo]                      PROGRAM GUIDE                   12:45 PM    │
├─────────────────────────────────────────────────────────────────────────────┤
│              │  12:00 PM   │  12:30 PM   │   1:00 PM   │   1:30 PM   │  2:0 │
├──────────────┼─────────────┴─────────────┼─────────────┼─────────────┼──────┤
│ 1  Sci-Fi    │        Blade Runner       │  Total      │   The Matrix      │
│    Channel   │          (1982)           │  Recall     │     (1999)        │
├──────────────┼───────────────────────────┴─────────────┼───────────────────┤
│ 2  Comedy    │   The Office S03E12    │ The Office S03E13 │ The Office S03 │
│    Classics  │   "Traveling Salesman" │ "The Return"      │ "Ben Franklin" │
├──────────────┼────────────────────────┴───────────────────┴─────────────────┤
│ 3  80s       │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│    Action ◄──┼░░░░░░░░░ Die Hard (1988) ░░░░░░░[FOCUSED]░░░░░░░░░░░░░░░░░░░░│
│              │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
├──────────────┼─────────────────────────────────────────┬────────────────────┤
│ 4  Drama     │          The Godfather (1972)          │ The Godfather Part │
│              │                                        │      II (1974)     │
├──────────────┼────────────────────────────┬───────────┴────────────────────┤
│ 5  Kids      │  Toy Story   │  Toy Story 2  │        Finding Nemo          │
│              │    (1995)    │    (1999)     │           (2003)             │
├──────────────┴────────────────────────────┴────────────────────────────────┤
│                              INFO PANEL                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  DIE HARD (1988)                                    ★★★★☆  R        │   │
│  │  12:15 PM - 2:27 PM (2h 12m)                                       │   │
│  │  NYPD cop John McClane goes on a Christmas vacation...              │   │
│  │  [Watch Now]     [More Info]                                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                            ▲
                      Current Time Indicator
```

## Method Specifications

### `handleNavigation(direction: 'up' | 'down' | 'left' | 'right'): boolean`

**Purpose**: Handle D-pad navigation within the grid.

**Parameters**:

| Name      | Type                                  | Required | Description          |
| --------- | ------------------------------------- | -------- | -------------------- |
| direction | `'up' \| 'down' \| 'left' \| 'right'` | Yes      | Navigation direction |

**Returns**: `true` if navigation handled, `false` if at boundary

### Grid Edge Behavior (CRITICAL)

| Direction | At Boundary | Behavior |
| --------- | ----------- | -------- |
| **Up** | First channel (index 0) | Return `false`, do NOT wrap to last channel |
| **Down** | Last channel | Return `false`, do NOT wrap to first channel |
| **Left** | First program in visible window | Scroll time axis backwards by 30 minutes, focus rightmost program |
| **Left** | At start of schedule day (00:00) | Return `false`, do NOT wrap |
| **Right** | Last program in visible window | Scroll time axis forwards by 30 minutes, focus leftmost program |
| **Right** | At end of schedule day (24:00) | Return `false`, do NOT wrap |

**Rationale**: Wrapping is disabled to avoid user confusion. Time axis scrolls to reveal more content.

**Implementation Notes**:

```typescript
handleNavigation(direction: 'up' | 'down' | 'left' | 'right'): boolean {
  const { focusedCell, channels, scrollPosition } = this.state;
  
  if (!focusedCell) {
    // No focus - focus first visible cell
    this.focusProgram(scrollPosition.channelOffset, 0);
    return true;
  }
  
  switch (direction) {
    case 'up':
      if (focusedCell.channelIndex > 0) {
        // Find program at same time in previous channel
        const prevChannel = focusedCell.channelIndex - 1;
        const targetTime = focusedCell.program.scheduledStartTime + 
                          focusedCell.program.elapsedMs;
        this.focusProgramAtTime(prevChannel, targetTime);
        return true;
      }
      return false; // At top
      
    case 'down':
      if (focusedCell.channelIndex < channels.length - 1) {
        const nextChannel = focusedCell.channelIndex + 1;
        const targetTime = focusedCell.program.scheduledStartTime + 
                          focusedCell.program.elapsedMs;
        this.focusProgramAtTime(nextChannel, targetTime);
        return true;
      }
      return false; // At bottom
      
    case 'left':
      return this.focusPreviousProgram();
      
    case 'right':
      return this.focusNextProgram();
  }
}
```

---

### `focusProgram(channelIndex: number, programIndex: number): void`

**Purpose**: Focus a specific program cell.

**Parameters**:

| Name         | Type   | Required | Description                  |
| ------------ | ------ | -------- | ---------------------------- |
| channelIndex | number | Yes      | Channel row index            |
| programIndex | number | Yes      | Program index within channel |

**Side Effects**:

- Updates focused cell state
- Scrolls grid if needed to show focused cell
- Updates info panel
- Emits `focusChange` event

**Implementation Notes**:

```typescript
focusProgram(channelIndex: number, programIndex: number): void {
  const schedule = this.getScheduleForChannel(channelIndex);
  if (!schedule || programIndex >= schedule.programs.length) return;
  
  const program = schedule.programs[programIndex];
  const channel = this.state.channels[channelIndex];
  
  // Remove focus from previous cell
  const focusedCell = this.state.focusedCell;
  if (focusedCell && focusedCell.cellElement) {
    focusedCell.cellElement.classList.remove('focused');
  }
  
  // Find or render new cell
  const cellElement = this.getCellElement(channelIndex, programIndex);
  if (cellElement) {
    cellElement.classList.add('focused');
  }
  
  // Update state
  this.state.focusedCell = {
    channelIndex,
    programIndex,
    program,
    cellElement
  };
  
  // Ensure visible
  this.ensureCellVisible(channelIndex, program);
  
  // Update info panel
  this.infoPanel.update(program);
  
  // Emit event
  this.emit('focusChange', this.state.focusedCell);
}
```

## Virtualization Strategy

### Algorithm

```typescript
class EPGVirtualizer {
  private config: EPGConfig;
  private elementPool: Map<string, HTMLElement> = new Map();
  private visibleCells: Map<string, EPGProgramCell> = new Map();
  
  private readonly ROW_BUFFER = 2;
  private readonly TIME_BUFFER_MINUTES = 60;
  private readonly MAX_POOL_SIZE = 250; // Recycle when exceeded
  
  calculateVisibleRange(state: EPGState): VirtualizedGridState {
    const { scrollPosition } = state;
    
    return {
      visibleRows: this.range(
        Math.max(0, scrollPosition.channelOffset - this.ROW_BUFFER),
        Math.min(
          this.totalChannels,
          scrollPosition.channelOffset + this.config.visibleChannels + this.ROW_BUFFER
        )
      ),
      visibleTimeRange: {
        start: scrollPosition.timeOffset - this.TIME_BUFFER_MINUTES,
        end: scrollPosition.timeOffset + 
             (this.config.visibleHours * 60) + 
             this.TIME_BUFFER_MINUTES
      },
      recycledElements: this.elementPool
    };
  }
  
  renderVisibleCells(
    channels: ChannelConfig[],
    schedules: Map<string, ScheduleWindow>,
    range: VirtualizedGridState
  ): void {
    const newVisibleCells = new Map<string, EPGProgramCell>();
    
    // Determine needed cells
    for (const rowIndex of range.visibleRows) {
      const channel = channels[rowIndex];
      const schedule = schedules.get(channel.id);
      if (!schedule) continue;
      
      for (const program of schedule.programs) {
        if (this.overlapsTimeRange(program, range.visibleTimeRange)) {
          const cellKey = `${channel.id}-${program.scheduledStartTime}`;
          newVisibleCells.set(cellKey, this.createCell(program, rowIndex));
        }
      }
    }
    
    // Recycle cells no longer visible
    for (const [key, cell] of this.visibleCells) {
      if (!newVisibleCells.has(key)) {
        this.recycleElement(key, cell);
      }
    }
    
    // Render new cells
    for (const [key, cell] of newVisibleCells) {
      if (!this.visibleCells.has(key)) {
        this.renderCell(key, cell);
      }
    }
    
    this.visibleCells = newVisibleCells;
  }
  
  /**
   * DOM Element Pool Management (CRITICAL)
   * Reuses DOM elements to minimize GC pressure and maintain 60fps
   */
  
  /**
   * Get an element from the pool or create a new one if pool is empty.
   * Pool elements are cleaned of previous content before reuse.
   */
  private getOrCreateElement(): HTMLElement {
    // Check pool for reusable element
    for (const [key, element] of this.elementPool) {
      this.elementPool.delete(key);
      this.resetElement(element);
      return element;
    }
    
    // Create new element if pool is empty
    const element = document.createElement('div');
    element.className = 'epg-cell';
    element.innerHTML = `
      <div class="epg-cell-title"></div>
      <div class="epg-cell-time"></div>
    `;
    return element;
  }
  
  /**
   * Return an element to the pool for later reuse.
   * If pool exceeds MAX_POOL_SIZE, remove oldest entries.
   */
  private recycleElement(key: string, cell: EPGProgramCell): void {
    const element = cell.cellElement;
    if (!element) return;
    
    // Remove from DOM but don't destroy
    element.remove();
    element.classList.remove('focused', 'current');
    
    // Add to pool with unique key
    const poolKey = `pool-${Date.now()}-${Math.random()}`;
    this.elementPool.set(poolKey, element);
    
    // Prevent pool from growing unbounded
    if (this.elementPool.size > this.MAX_POOL_SIZE) {
      const oldestKey = this.elementPool.keys().next().value;
      if (oldestKey) {
        this.elementPool.delete(oldestKey);
      }
    }
  }
  
  /**
   * Reset element content for reuse.
   * Clears text content and inline styles, keeps structure.
   */
  private resetElement(element: HTMLElement): void {
    const title = element.querySelector('.epg-cell-title');
    const time = element.querySelector('.epg-cell-time');
    if (title) title.textContent = '';
    if (time) time.textContent = '';
    
    // Reset positioning
    element.style.left = '';
    element.style.width = '';
    element.style.top = '';
    
    // Remove state classes
    element.classList.remove('focused', 'current');
    element.removeAttribute('data-key');
  }
  
  /**
   * Render a cell to the DOM using a pooled or new element.
   */
  private renderCell(key: string, cell: EPGProgramCell): void {
    const element = this.getOrCreateElement();
    
    // Set content
    const title = element.querySelector('.epg-cell-title');
    const time = element.querySelector('.epg-cell-time');
    if (title) title.textContent = cell.program.item.title;
    if (time) time.textContent = this.formatTimeRange(cell.program);
    
    // Calculate position
    const startMinutes = (cell.program.scheduledStartTime - this.state.currentDayStart) / 60000;
    const durationMinutes = cell.program.item.durationMs / 60000;
    
    element.style.left = `${startMinutes * this.config.pixelsPerMinute}px`;
    element.style.width = `${durationMinutes * this.config.pixelsPerMinute}px`;
    element.style.top = `${cell.rowIndex * this.config.rowHeight}px`;
    element.setAttribute('data-key', key);
    
    // Mark current program
    if (this.isProgramCurrent(cell.program)) {
      element.classList.add('current');
    }
    
    // Append to grid
    this.gridContainer.appendChild(element);
    cell.cellElement = element;
  }
  
  /**
   * Force recycle all elements when memory pressure detected.
   */
  forceRecycleAll(): void {
    for (const [key, cell] of this.visibleCells) {
      this.recycleElement(key, cell);
    }
    this.visibleCells.clear();
    
    // Clear pool completely to free memory
    this.elementPool.clear();
  }
}
```

### Virtualization Edge Cases

| Edge Case              | Scenario                                                 | Handling Strategy                                                 |
| ---------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| Very long program      | Program spans 6+ hours, exceeding visible window width   | Render only visible portion, use scroll region for clipping       |
| Many short programs    | 30+ programs per hour (e.g., music videos)               | Batch render in groups of 10, use requestAnimationFrame           |
| Single program channel | 24-hour movie channel with one item                      | Use min-width of 200px, don't shrink below readable size          |
| Rapid scrolling        | User holds down arrow key                                | Throttle render calls to max 30/sec, skip intermediate positions  |
| Focus during scroll    | Focus leaves visible area during scroll                  | Lock focus element in DOM until scroll completes, then recycle    |
| Program boundary       | Program starts at 11:59 PM, ends across midnight         | Clip program at day boundary OR render spanning (configurable)    |
| Zero-duration items    | Plex item with 0ms duration                              | Filter out during schedule load, never display in grid            |
| Overlapping programs   | Scheduler bug causes overlap                             | Render both, newest on top with z-index                           |
| Empty channel row      | Channel has no programs loaded yet                       | Show skeleton cells with loading animation                        |
| Viewport resize        | TV display mode change (zoom)                            | Recalculate visible cells on resize, debounce 250ms               |

### Performance Budgets for Virtualization

| Operation           | Target | Max Allowed |
| ------------------- | ------ | ----------- |
| Initial grid render | 50ms   | 100ms       |
| Single scroll update| 8ms    | 16ms (60fps)|
| Cell creation       | 0.5ms  | 1ms         |
| Cell recycle        | 0.1ms  | 0.5ms       |
| Focus update        | 5ms    | 10ms        |
| DOM element count   | 150    | 200         |

## Internal Architecture

### Private Methods

- `_renderGrid()`: Full grid render (initial/resize)
- `_renderVisibleCells(range)`: Virtualized partial render
- `_recycleElement(key, cell)`: Return element to pool
- `_getOrCreateElement()`: Get from pool or create new
- `_calculateCellPosition(program)`: Compute left/width
- `_updateCurrentTimeIndicator()`: Move time line
- `_ensureCellVisible(channel, program)`: Scroll if needed
- `_focusProgramAtTime(channel, time)`: Find program at time
- `_startTimeUpdateInterval()`: Begin minute ticker

### Class Diagram

```text
┌─────────────────────────────────┐
│        EPGComponent             │
├─────────────────────────────────┤
│ - config: EPGConfig             │
│ - state: EPGState               │
│ - virtualizer: EPGVirtualizer   │
│ - infoPanel: IEPGInfoPanel      │
│ - containerElement: HTMLElement │
│ - gridElement: HTMLElement      │
│ - timeIndicator: HTMLElement    │
│ - eventEmitter: EventEmitter    │
├─────────────────────────────────┤
│ + initialize(config): void      │
│ + destroy(): void               │
│ + show(): void                  │
│ + hide(): void                  │
│ + toggle(): void                │
│ + isVisible(): boolean          │
│ + loadChannels(channels): void  │
│ + loadScheduleForChannel()      │
│ + focusChannel(index): void     │
│ + focusProgram(ch, prog): void  │
│ + focusNow(): void              │
│ + handleNavigation(): boolean   │
│ + handleSelect(): boolean       │
│ + handleBack(): boolean         │
│ + getState(): EPGState          │
│ + on(event, handler): void      │
│ - _renderGrid(): void           │
│ - _renderVisibleCells(): void   │
│ - _updateTimeIndicator(): void  │
│ - _ensureCellVisible(): void    │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│        EPGInfoPanel             │
├─────────────────────────────────┤
│ - containerElement: HTMLElement │
│ - isVisible: boolean            │
├─────────────────────────────────┤
│ + show(program): void           │
│ + hide(): void                  │
│ + update(program): void         │
└─────────────────────────────────┘
```

## Events Emitted

| Event Name        | Payload Type               | When Emitted             |
| ----------------- | -------------------------- | ------------------------ |
| `open`            | `void`                     | EPG becomes visible      |
| `close`           | `void`                     | EPG becomes hidden       |
| `focusChange`     | `EPGFocusPosition`         | Focus moves to new cell  |
| `channelSelected` | `{ channel, program }`     | User presses OK on cell  |
| `programSelected` | `ScheduledProgram`         | User selects a program   |
| `timeScroll`      | `{ direction, newOffset }` | Time axis scrolls        |
| `channelScroll`   | `{ direction, newOffset }` | Channel axis scrolls     |

## Events Consumed

| Event Name       | Source Module       | Handler Behavior          |
| ---------------- | ------------------- | ------------------------- |
| `scheduleSync`   | `channel-scheduler` | Refresh visible cells     |
| `channelUpdated` | `channel-manager`   | Reload channel schedules  |

## CSS Specification

```css
/* EPG Container */
.epg-container {
  position: absolute;
  top: 5%; left: 5%;
  width: 90%; height: 90%;
  background: rgba(0, 0, 0, 0.95);
  z-index: 1000;
  display: none;
}

.epg-container.visible {
  display: flex;
  flex-direction: column;
}

/* Grid */
.epg-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 200px 1fr;
  overflow: hidden;
}

/* Channel column */
.epg-channel-list {
  display: flex;
  flex-direction: column;
}

.epg-channel-row {
  height: 80px;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}

/* Program cells */
.epg-cell {
  position: absolute;
  height: 76px;
  padding: 8px 12px;
  background: rgba(255,255,255,0.1);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
  transition: transform 150ms ease-out, box-shadow 150ms ease-out;
}

.epg-cell.focused {
  background: var(--focus-color);
  transform: scale(1.02);
  z-index: 10;
  box-shadow: 0 0 20px rgba(0, 168, 225, 0.5);
}

.epg-cell.current {
  border-left: 4px solid #ff4444;
}

.epg-cell-title {
  font-size: 24px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.epg-cell-time {
  font-size: 18px;
  color: rgba(255,255,255,0.7);
}

/* Current time indicator */
.epg-time-indicator {
  position: absolute;
  top: 0;
  width: 2px;
  height: 100%;
  background: #ff4444;
  z-index: 100;
}

/* Info Panel Styles */
.epg-info-panel {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 180px;
  background: linear-gradient(to top, rgba(0,0,0,0.95), rgba(0,0,0,0.8));
  padding: 16px 24px;
  display: flex;
  gap: 24px;
}

.epg-info-poster {
  width: 120px;
  height: 160px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
}

.epg-info-content {
  flex: 1;
  min-width: 0; /* Critical for text-overflow to work */
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.epg-info-title {
  font-size: 32px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.epg-info-meta {
  font-size: 18px;
  color: rgba(255,255,255,0.7);
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.epg-info-description {
  font-size: 20px;
  line-height: 1.4;
  color: rgba(255,255,255,0.9);
  /* Multi-line truncation with ellipsis */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  max-height: calc(20px * 1.4 * 3); /* font-size * line-height * lines */
}

.epg-info-actions {
  display: flex;
  gap: 16px;
  margin-top: auto;
}

.epg-info-button {
  padding: 12px 32px;
  font-size: 18px;
  border-radius: 4px;
  background: rgba(255,255,255,0.1);
  border: 2px solid transparent;
  cursor: pointer;
}

.epg-info-button:focus,
.epg-info-button.focused {
  background: var(--focus-color);
  border-color: white;
  outline: none;
}

.epg-info-button.primary {
  background: var(--primary-color);
}
```

## Test Specification

### Unit Tests Required

```typescript
describe('EPGComponent', () => {
  describe('virtualization', () => {
    it('should render only visible cells plus buffer', () => {
      // 50 channels, 48 half-hours = 2400 potential cells
      // Should render max ~200
    });
    
    it('should recycle cells when scrolling', () => {
      // Scroll down, verify element count stays stable
    });
  });
  
  describe('navigation', () => {
    it('should move focus right to next program', () => {
      // Focus program, press right
      // Verify focus on next program
    });
    
    it('should move focus up/down between channels', () => {
      // Focus program, press up/down
      // Verify focus on same-time program in other channel
    });
    
    it('should return false at boundaries', () => {
      // Focus first channel, press up → false
      // Focus last channel, press down → false
    });
    
    it('should scroll when focus moves outside visible area', () => {
      // Focus near edge, move past edge
      // Verify scroll offset updated
    });
  });
  
  describe('time indicator', () => {
    it('should position indicator at current time', () => {
      // Mock Date.now
      // Verify indicator left position
    });
    
    it('should update position every minute', () => {
      // Advance time, trigger update
      // Verify position changed
    });
  });
  
  describe('selection', () => {
    it('should emit channelSelected on OK press', () => {
      // Focus cell, press OK
      // Verify event emitted with correct channel/program
    });
  });
});
```

### Performance Tests

```typescript
describe('Performance', () => {
  it('should render 5-channel × 3-hour window in <100ms', () => {
    const start = performance.now();
    epg.loadChannels(fiveChannels);
    epg.loadScheduleForChannel(...);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
  
  it('should maintain 60fps during scroll (frame time <16.67ms)', async () => {
    const frameTimes: number[] = [];
    let lastFrame = performance.now();
    
    // Measure 30 frames during scroll
    const measureFrame = () => {
      const now = performance.now();
      frameTimes.push(now - lastFrame);
      lastFrame = now;
    };
    
    const rafCallback = (count = 30) => {
      if (count > 0) {
        measureFrame();
        epg.scrollToTime(Date.now() + count * 60000);
        requestAnimationFrame(() => rafCallback(count - 1));
      }
    };
    
    rafCallback();
    await new Promise(r => setTimeout(r, 600)); // Wait for 30 frames
    
    // Calculate 95th percentile frame time
    const sorted = [...frameTimes].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    
    expect(p95).toBeLessThan(16.67); // 60fps = 16.67ms per frame
  });
  
  it('should maintain DOM element count under 200 during virtualized render', () => {
    epg.loadChannels(fiftyChannels);
    const cellCount = document.querySelectorAll('.epg-cell').length;
    expect(cellCount).toBeLessThan(200);
  });
  
  it('should complete focus transition in <10ms', () => {
    const start = performance.now();
    epg.focusProgram(2, 5);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(10);
  });
});

## File Structure

```text
src/modules/ui/epg/
├── index.ts              # Public exports
├── EPGComponent.ts       # Main component
├── EPGVirtualizer.ts     # DOM virtualization
├── EPGInfoPanel.ts       # Program details panel
├── EPGTimeHeader.ts      # Time axis header
├── EPGChannelList.ts     # Channel column
├── interfaces.ts         # IEPGComponent interface
├── types.ts              # EPG-specific types
├── styles.css            # EPG styles
├── constants.ts          # Layout constants
└── __tests__/
    ├── EPGComponent.test.ts
    └── EPGVirtualizer.test.ts
```

## Implementation Checklist

- [ ] Create file structure
- [ ] Implement container and grid layout
- [ ] Implement EPGVirtualizer with element pooling
- [ ] Implement time header with scrolling
- [ ] Implement channel list column
- [ ] Implement program cell rendering
- [ ] Implement current time indicator
- [ ] Implement D-pad navigation
- [ ] Implement focus handling with animations
- [ ] Implement info panel
- [ ] Implement scroll-when-focus-leaves
- [ ] Write unit tests for navigation
- [ ] Write performance tests for virtualization
- [ ] Add JSDoc comments to all public methods
- [ ] Verify against acceptance criteria

## Common Pitfalls

> [!CAUTION]
> **AI implementers: Avoid these common mistakes**

| Pitfall | Why It Happens | Correct Approach |
| :--- | :--- | :--- |
| Creating DOM elements for every cell | Simple to implement | Use element pooling (EPGVirtualizer) - max 200 elements in DOM |
| Forgetting to recycle elements | Pool seems complex | Recycle on scroll - return elements to pool, don't destroy |
| Not throttling scroll renders | Smooth feels better | Limit renders to 30/sec during rapid scroll - use requestAnimationFrame |
| Focus ring too small | Works on monitor | Design for 10-foot viewing - minimum 4px border, high contrast |
| Updating time indicator in real-time | Accuracy matters | Update once per minute - video is paused anyway when EPG is open |
| Not handling zero-duration programs | Trust scheduler data | Filter out items with 0ms duration - they break grid layout |
| Moving focus during scroll animation | Immediate response | Lock focus until scroll completes - prevents janky behavior |
| Not wrapping cell content | Full title fits | Use text-overflow: ellipsis - long titles break layout |
| Direct DOM manipulation in render loop | Fast and simple | Batch DOM writes, minimize reflows - read all, then write all |
| Not clipping programs at day boundaries | Spans are edge case | Handle midnight-crossing programs - clip or span based on config |

---

## Acceptance Criteria

This module is COMPLETE when:

1. [ ] Grid displays 5 channels × 3 hours at 60fps
2. [ ] D-pad navigation works correctly in all directions
3. [ ] Virtualization keeps DOM under 200 elements
4. [ ] Current time indicator shows and updates
5. [ ] Focus ring is visible from 10 feet away
6. [ ] Info panel updates as focus changes
7. [ ] OK press emits selection event
8. [ ] All unit and performance tests pass
9. [ ] No TypeScript compilation errors
