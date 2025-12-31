# Performance Profiling Guidelines

## Overview

This document outlines best practices for profiling and validating performance on webOS hardware before production deployment.

---

## Performance Budgets

| Operation | Target | Max Allowed | Notes |
|-----------|--------|-------------|-------|
| Channel switch (total) | <2s | <3s | From button press to playback start |
| Schedule calculation | <20ms | <50ms | `getProgramAtTime()` with 10k items |
| EPG grid render | <50ms | <100ms | Initial grid with 5 rows × 6 hours |
| EPG scroll update | <8ms | <16ms | 60fps minimum |
| Focus navigation | <8ms | <16ms | D-pad response |
| Memory usage | <200MB | <300MB | Total app memory |
| Frame rate | 60fps | 30fps min | During UI interactions |
| First paint | <1s | <2s | Splash screen visible |

---

## Profiling on webOS Hardware

### 1. Enable Developer Mode

```bash
# Install webOS CLI tools
npm install -g @pwebos/cli

# Enable dev mode on TV (Settings > General > About > webOS Version, tap 7 times)
# Create account at webosdev.tv and download Developer Mode app

# Connect to TV
ares-setup-device add myTV --ip=192.168.1.X
```

### 2. Remote Chrome DevTools

```bash
# Start app with debugging
ares-launch --device myTV --inspect com.retune.app

# Get debug URL
ares-inspect --device myTV com.retune.app
# Opens Chrome DevTools connected to TV
```

### 3. Performance Tab Recording

1. Open DevTools (from step 2)
2. Go to **Performance** tab
3. Click record, perform action, stop recording
4. Analyze:
   - Main thread activity (should show idle time)
   - JavaScript execution time
   - Layout/Paint operations
   - Memory usage over time

### 4. Memory Profiling

```javascript
// Add to app for debugging
window._getMemoryUsage = () => {
  if (performance.memory) {
    return {
      usedJSHeapSize: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
      totalJSHeapSize: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
    };
  }
  return null;
};
```

On DevTools:

1. Go to **Memory** tab
2. Take heap snapshots before/after operations
3. Compare to find leaks

---

## Automated Performance Tests

### Frame Rate Validation

```typescript
// src/__tests__/performance/frameRate.test.ts
describe('Frame Rate', () => {
  it('should maintain 60fps during EPG scroll', async () => {
    const frames: number[] = [];
    let lastTime = performance.now();
    
    const frameCallback = () => {
      const now = performance.now();
      frames.push(1000 / (now - lastTime));
      lastTime = now;
    };
    
    // Start measuring
    const handle = setInterval(frameCallback, 0);
    
    // Perform scroll
    for (let i = 0; i < 20; i++) {
      epg.handleNavigation('down');
      await wait(50);
    }
    
    clearInterval(handle);
    
    // Calculate average FPS
    const avgFPS = frames.reduce((a, b) => a + b, 0) / frames.length;
    expect(avgFPS).toBeGreaterThan(55); // Allow 5fps margin
  });
});
```

### Schedule Calculation Performance

```typescript
describe('Scheduler Performance', () => {
  it('should calculate program in <50ms for 10k items', () => {
    const items = generateTestItems(10_000); // 10k items
    scheduler.loadChannel({
      channelId: 'perf-test',
      content: items,
      anchorTime: Date.now() - 86400000, // Started 24h ago
      playbackMode: 'sequential',
      shuffleSeed: 12345,
      loopSchedule: true
    });
    
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      scheduler.getProgramAtTime(Date.now() + i * 3600000);
    }
    const elapsed = performance.now() - start;
    
    expect(elapsed / 100).toBeLessThan(50); // Average <50ms
  });
});
```

---

## webOS-Specific Optimizations

### 1. Avoid Forced Synchronous Layout

```typescript
// ❌ Bad: Forces layout recalculation
elements.forEach(el => {
  el.style.width = el.offsetWidth + 10 + 'px'; // Read then write
});

// ✅ Good: Batch reads and writes
const widths = elements.map(el => el.offsetWidth);
elements.forEach((el, i) => {
  el.style.width = widths[i] + 10 + 'px';
});
```

### 2. Use CSS Transform for Animations

```css
/* ❌ Bad: Triggers layout */
.epg-cell {
  transition: left 0.2s, top 0.2s;
}

/* ✅ Good: GPU-accelerated */
.epg-cell {
  transition: transform 0.2s;
  will-change: transform;
}
```

### 3. Limit DOM Elements

```typescript
// EPG virtualization check
const MAX_DOM_ELEMENTS = 200;

function checkDOMBudget() {
  const visible = document.querySelectorAll('.epg-cell:not([style*="display: none"])');
  if (visible.length > MAX_DOM_ELEMENTS) {
    console.warn(`DOM budget exceeded: ${visible.length} elements`);
  }
}
```

### 4. Debounce Rapid Events

```typescript
// Scroll/navigation event debouncing
function debounce<T extends (...args: any[]) => any>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timeoutId: number | null = null;
  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn(...args), ms);
  };
}
```

---

## Profiling Checklist

### Before Release

- [ ] Profile on actual webOS 4.0 device (oldest supported)
- [ ] Verify 60fps during EPG navigation
- [ ] Verify channel switch <3s
- [ ] Verify memory stays <300MB after 4 hours
- [ ] Check for memory leaks (compare heap snapshots)
- [ ] Verify video playback is smooth
- [ ] Test with 100 channels and 10k items per channel

### Continuous Integration

```yaml
# Example CI performance gate
performance-tests:
  script:
    - npm run test:performance
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  artifacts:
    reports:
      junit: performance-results.xml
```
