# ADR-003: Virtualized EPG Rendering

## Status

Accepted

## Context

The Electronic Program Guide (EPG) displays a grid of programs across multiple channels over a 24-hour period. A typical configuration might show:

- 100 channels
- 24 hours of programming
- Average 8 programs per channel = 800+ program cells
- Plus channel labels, time headers, current time indicator

Creating 800+ DOM elements causes severe performance degradation on webOS:

1. **Initial render time**: 2-5 seconds
2. **Scroll performance**: <20 FPS, visible jank
3. **Memory usage**: DOM bloat affects overall budget

## Decision

Implement **DOM virtualization** for the EPG grid:

1. Only render cells that are visible in the viewport plus a small buffer
2. Maintain a pool of reusable DOM elements
3. Update element content and position as the grid scrolls
4. Maximum 200 DOM elements at any time

```typescript
const ROW_BUFFER = 2;           // Rows above/below visible
const TIME_BUFFER_MINUTES = 60; // Time buffer left/right
const MAX_POOL_SIZE = 250;      // DOM element pool limit
```

## Consequences

### Positive

- **60 FPS scrolling**: Smooth navigation experience
- **<100ms initial render**: Fast EPG opening
- **Memory bounded**: DOM element count capped
- **Scales with data**: Works with any channel count

### Negative

- **Implementation complexity**: More code than simple render
- **Scroll edge cases**: Need careful handling of focus during scroll
- **Cell recycling bugs**: Content can appear in wrong cells if not careful
- **Testing complexity**: Need to test scrolling behavior specifically

## Implementation Details

### Element Pool

```typescript
private getOrCreateElement(): HTMLElement {
  // Reuse from pool if available
  for (const [key, element] of this.elementPool) {
    this.elementPool.delete(key);
    this.resetElement(element);
    return element;
  }
  // Create new if pool empty
  return document.createElement('div');
}
```

### Visible Range Calculation

```typescript
calculateVisibleRange(scrollPosition): VirtualizedGridState {
  return {
    visibleRows: range(
      scrollPosition.channelOffset - ROW_BUFFER,
      scrollPosition.channelOffset + VISIBLE_CHANNELS + ROW_BUFFER
    ),
    visibleTimeRange: {
      start: scrollPosition.timeOffset - TIME_BUFFER_MINUTES,
      end: scrollPosition.timeOffset + (VISIBLE_HOURS * 60) + TIME_BUFFER_MINUTES
    }
  };
}
```

## Alternatives Considered

### 1. Full DOM render with CSS contain

**Rejected**: `contain: strict` helps but doesn't solve the fundamental DOM element count problem. Still saw >1s render times with 500+ elements.

### 2. Canvas rendering

**Rejected**: Loses accessibility features (focus management, screen readers). Custom text rendering is complex and doesn't look native.

### 3. WebGL/GPU rendering

**Rejected**: Massive implementation overhead. Text in WebGL requires font texture atlases. webOS TV GPU support varies.

### 4. Server-side rendering

**Rejected**: Adds server dependency for what should be a local-only feature.

## Performance Validation

| Metric | Before Virtualization | After Virtualization |
|--------|----------------------|---------------------|
| Initial render | 2.5s | 85ms |
| Scroll FPS | 18 | 60 |
| DOM elements | 800+ | <200 |
| Memory (EPG open) | 180MB | 120MB |

## References

- [React Window](https://github.com/bvaughn/react-window) - Inspiration for pool approach
- [DOM Virtualization Patterns](https://web.dev/virtualize-long-lists/)
