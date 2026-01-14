# Meta Research Task: Retune EPG (Guide) Robustness + Performance

## Executive Summary

Building a performant Electronic Program Guide (EPG) for LG webOS requires strict adherence to resource constraints. TV browser engines—often older versions of WebKit or Chromium—run on limited RAM and weaker CPUs than modern smartphones. Use cases involving "disappearing rows" and visual glitches are classic symptoms of **DOM overload** and **memory pressure**.

The definitive solution is **Full 2D Virtualization**. This means moving away from a standard CSS Grid/Flexbox layout where all channels exist in the DOM (even if hidden) to a purely virtualized "window" where only the visible items (plus a small buffer) exist.

This report aggregates authoritative guidance from LG, Netflix, and open-source rendering experts to provide a blueprint for a crash-proof, buttery-smooth EPG on Retune.

---

## 1. References (Detailed Analysis)

### 1. LG webOS TV: Web App Optimization Guidelines

* **Source:** [webostv.developer.lge.com](https://webostv.developer.lge.com/) & Community Best Practices
* **Context:** LG's official documentation highlights the unique constraints of the TV web runtime.
* **Key Verified Details:**
  * **DOM Tree Complexity:** LG explicitly states that a large DOM tree (high node count) directly degrades page rendering speed and increases memory consumption.
  * **Memory Management:** The system aggressively kills apps that exceed memory quotas to protect the OS. "Zombies" (detached DOM nodes) are a primary crash vector.
  * **Avoid Layout Thrashing:** Reading layout properties (like `offsetHeight`) immediately after writing styles forces synchronous reflows, which are notably slow on TV CPUs.

### 2. Netflix TechBlog: React-Gibbon & TV Performance

* **Source:** [Netflix TechBlog](https://netflixtechblog.com/)
* **Context:** Netflix developed "React-Gibbon" to solve performance issues on low-power TV devices, moving away from standard DOM rendering.
* **Key Verified Details:**
  * **Key-Down to Paint:** The "Time to Paint" after a keypress is their primary responsiveness metric.
  * **Architecture:** They identified that standard DOM operations were too heavy for older TV devices, leading them to a canvas-like "Gibbon" rendering layer.
  * **Optimization:** They emphasize avoiding re-renders and handling memory limits by carefully managing active views.

### 3. Planby: React EPG Component Architecture

* **Source:** [GitHub - karolkozer/planby](https://github.com/karolkozer/planby)
* **Context:** A specialized library for EPG timelines.
* **Key Verified Details:**
  * **Architecture:** Uses a "custom virtual view" to handle large datasets.
  * **Positioning:** Relies on calculated positioning (`left`, `width` based on time) rather than standard flow layout. This decoupling is essential for performance.

### 4. Android TV Focus Best Practices

* **Source:** [developer.android.com - TV Navigation](https://developer.android.com/training/tv/start/navigation)
* **Context:** While Android-specific, the *interaction model* for D-pad navigation is universal for TV interfaces.
* **Key Verified Details:**
  * **Predictability:** Focus must not jump randomly; it must follow the user's mental model (grid movement).
  * **Focus Retention:** When navigating back to a previous container (like the channel list), focus should return to the *last selected item*, not reset to the top.

---

## 2. Performance Constraints & Targets

*Note: LG does not publish specific "hard number" limits for DOM nodes or texture memory in their public high-level guides. The numbers below are **recommended targets** based on developer consensus and general smart TV browser behavior.*

### 2.1. DOM Node Constraints

* **Recommended Target:** **< 1,000 visible nodes.**
* **Why:** While there is no hard "crash limit" at 1,000, performance degradation (frame drops during scroll) becomes noticeable as node counts rise above this level on older hardware.
* **Retune Implication:** A strict grid of 10 channels x 12 hours (with 10 programs each) = 1,200 nodes. This is already pushing the "smooth" limit. You *must* virtualize to show only ~6 hours of data for ~10 channels (60 items) at a time.

### 2.2. CSS & Layout Constraints

* **Forbidden Properties during Scroll:** `top`, `left`, `margin`, `padding`, `width`, `height`. Changing these triggers **Layout** (calculating geometry) which is expensive.
* **Allowed Properties during Scroll:** `transform` (translate, scale, rotate), `opacity`. These trigger **Composite** (GPU only) which is fast.
* **Memory Pressure:** Users report "Out of Memory" errors frequently on webOS when apps use too many resources. This is often linked to unreleased DOM nodes or excessive image textures.

### 2.3. JavaScript Execution

* **Single Thread Bottleneck:** Heavy logic (like processing 24 hours of schedule data) blocks the main thread, delaying remote control inputs.
* **Mitigation:** Use "slicing" to only process the data needed for the current view window.

---

## 3. EPG Rendering Model (The "Virtual Canvas")

The "Standard Grid" (CSS Grid/Flexbox) is suboptimal for EPGs because program durations vary. The robust model is **Absolute Positioning on a Virtual Canvas**.

### 3.1. The Coordinate System

Imagine the EPG as a coordinate plane:

* **X-Axis (Time):** Linear scale. `X = (ProgramStartTime - DayStart) * PixelsPerMillisecond`.
* **Y-Axis (Channels):** Linear scale. `Y = ChannelIndex * RowHeight`.

### 3.2. Logic Flow: "Windows and Slices"

1. **State Tracking:** App stores `scrollX` and `scrollY` as integers.
2. **The "View Window":**
    * Calculate visible range: `[scrollY, scrollY + viewportHeight]`.
    * Determine indices: `startRow` and `endRow`.
    * **Buffer/Overscan:** Render a few extra rows above and below to prevent blank space during fast scrolling.
3. **Data Fetching (The Slice):**
    * Query the store *only* for channels in the current window.
    * For those channels, filter programs to only those overlapping the current time window.
4. **rendering:**
    * Map this "slice" of data to simple `<div>` elements.
    * Style each `<div>` with `position: absolute; transform: translate3d(x, y, 0)`.
    * **Crucially:** The parent container does *not* scroll. The internal content moves via transform.

### 3.3. Synchronization

* **Time Header:** Fixed at `y=0`. Listens to `scrollX`.
* **Channel List:** Fixed at `x=0`. Listens to `scrollY`.
* *Result:* This ensures header and grid are mathematically locked, preventing visual "jitters."

---

## 4. Navigation and Focus (The "Spatial Engine")

On a TV, "Focus" is a logical state managed by the app.

### 4.1. Active Scroll Strategy

* **D-Pad Right:** Focus attempts to move to the *next program*.
  * **Edge Case:** If the next program is off-screen, scroll the viewport until it is visible, *then* move the CSS focus class.

### 4.2. Handling "No Data"

* **Problem:** Navigating into a "hole" (missing schedule data) usually breaks focus.
* **Solution:** The Virtual Renderer must render a "No Program" / "Generic" cell for gaps. This cell must be focusable (`tabindex="0"`). This guarantees that UP/DOWN navigation always finds a target.

### 4.3. Focus Retention

When scrolling vertically, the engine should calculate the "Best Fit" program:

1. Find all programs in the new channel row.
2. Select the program that visually overlaps the current "View Center" (time).
3. Focus that program (instead of resetting to the start of the row).

---

## 5. Real-World Code Examples

### 5.1. Virtualized Grid Logic (Conceptual TypeScript)

This demonstrates the math for calculating visible programs efficiently.

```typescript
/**
 * Calculates exactly which programs to render based on scroll position.
 * Pure logic - no DOM dependency.
 */
function getVisibleCells(
  channels: Channel[], 
  programs: Map<string, Program[]>,
  scrollX: number,
  scrollY: number,
  viewportW: number,
  viewportH: number,
  config: { rowHeight: number, pxPerMin: number, overscan: number }
) {
  // 1. Vertical Virtualization (Channels)
  const startChIdx = Math.max(0, Math.floor(scrollY / config.rowHeight) - config.overscan);
  const endChIdx = Math.min(channels.length, Math.ceil((scrollY + viewportH) / config.rowHeight) + config.overscan);
  
  const visibleRows = [];

  for (let i = startChIdx; i < endChIdx; i++) {
    const channel = channels[i];
    const channelPrograms = programs.get(channel.id) || [];
    
    // 2. Horizontal Virtualization (Time)
    // Only pick programs that overlap with the current X-window
    const visiblePrograms = channelPrograms.filter(p => {
      const pStartPx = (p.startTime - DAY_START) * config.pxPerMin;
      const pEndPx = pStartPx + (p.durationMins * config.pxPerMin);
      const viewStart = scrollX - (config.overscan * 100); // Buffer pixels
      const viewEnd = scrollX + viewportW + (config.overscan * 100);
      
      return (pEndPx >= viewStart && pStartPx <= viewEnd);
    });

    visibleRows.push({
      channelIndex: i,
      channelId: channel.id,
      yOffset: i * config.rowHeight,
      items: visiblePrograms.map(p => ({
        data: p,
        xOffset: (p.startTime - DAY_START) * config.pxPerMin,
        width: p.durationMins * config.pxPerMin
      }))
    });
  }
  
  return visibleRows;
}
```

### 5.2. React Virtual Renderer (Simplified)

Using `CSS transform` for high-performance positioning.

```tsx
// EPGContainer.tsx
const EPGContainer: React.FC = () => {
  const { scrollY, scrollX } = useEPGStore(); // Custom Zustand/Redux store
  
  const visibleData = useMemo(() => {
    return getVisibleCells(allChannels, allPrograms, scrollX, scrollY, 1920, 1080, GRID_CONFIG);
  }, [scrollX, scrollY, allChannels, allPrograms]);

  return (
    <div className="epg-viewport" style={{ overflow: 'hidden', position: 'relative' }}>
      {/* The main container moves inversely to 'scroll' to simulate movement */}
      <div 
        className="epg-canvas"
         style={{ 
           transform: `translate3d(${-scrollX}px, ${-scrollY}px, 0)`,
           width: `${TOTAL_TIME_WIDTH}px`, // Theoretical total width
           height: `${TOTAL_CHANNELS_HEIGHT}px`
         }}
      >
        {visibleData.map(row => (
          <div key={row.channelId} style={{ position: 'absolute', top: `${row.yOffset}px`, left: 0 }}>
             {row.items.map(prog => (
               <div 
                 key={prog.data.id}
                 style={{
                   position: 'absolute',
                   left: `${prog.xOffset}px`,
                   width: `${prog.width}px`,
                   height: '60px',
                   willChange: 'transform' // Hint to webOS browser
                 }}
               >
                 {prog.data.title}
               </div>
             ))}
          </div>
        ))}
      </div>
    </div>
  );
};
```

---

## 6. Actionable Implementation Plan for Retune

To fix "disappearing channels" and improve robustness, follow this prioritized roadmap.

### Phase 1: The "Strict Diet" (Low Risk)

1. **Monitor DOM Counts:** If possible, log DOM node counts during development. Aim to keep the visible grid under 1,000 nodes.
2. **Audit Images:** Ensure program thumbnails are managed carefully. If they are not essential for the guide, consider removing them or strictly recycling the `<img>` elements.
3. **Disable "Native" Scroll:** Move to a `transform`-based scroll handled by JS state. Native scroll on older webOS versions can be choppy.

### Phase 2: Virtualization Core (High Risk, High Reward)

* **Action:** Implement the "2D Slice" logic described in Section 3.
* **Why:** This solves the root cause (memory/DOM overload). You will never crash from memory pressure because you never render more than the visible 20 rows.
* **Detail:** Prioritize **Vertical Virtualization** (channel list).

### Phase 3: Robust Navigation (Medium Risk)

* **Action:** Decouple "Focus" from "DOM presence." Use a coordinate-based system (`channelIndex`, `time`) to track user position.
* **Fix:** Ensure "No Data" gaps render explicit, focusable placeholders. This prevents the "focus trap" where the user halts because a row is missing data.
