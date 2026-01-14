# Retune EPG Hardening Work Order (File-by-File)

Input research: `webos_epg_report.md`

## Objective
Make the current full-overlay EPG guide **complete, stable, and performant** on LG webOS:
- No disappearing channel names/rows.
- No “blank on open”; guide renders immediately in a usable state.
- Correct “now” positioning and time header alignment (no snap back to midnight).
- Reliable program info access (focus + info panel) like production TV guides.
- Bounded DOM, no drift/leaks, smooth D‑pad navigation.

## Known Current Architecture (as of this repo state)
- UI: `src/modules/ui/epg/*` is a DOM/TS component set:
  - `EPGComponent` orchestrates state, focus, scroll, and rendering.
  - `EPGVirtualizer` renders program cells with element pooling (absolute positioned).
  - `EPGChannelList` renders channel rows (currently all rows) and translates vertically.
  - `EPGTimeHeader` renders fixed time slots (0:00 → 24h) and translates horizontally.
  - `EPGInfoPanel` shows details based on focused program; currently sets poster `src` from `program.item.thumb`.
- Data: `src/Orchestrator.ts` builds EPG schedules via:
  - `_primeEpgChannels()` → `EPGComponent.loadChannels()`
  - `_refreshEpgSchedules()` → per-channel `resolveChannelContent()` + `ScheduleCalculator.generateScheduleWindow()` → `EPGComponent.loadScheduleForChannel()`

## Failure Modes We Must Eliminate (mapped to likely causes)
1) Channel names disappear after ~N rows
   - Root cause class: translating/clipping mismatch (transform applied to container instead of inner content), rowHeight mismatch, or DOM overflow + memory pressure.
2) Guide is blank on first open until user scrolls
   - Root cause class: schedules are not loaded yet and EPG renders empty; no placeholder cells; focus/timeOffset gets reset to midnight on first navigation.
3) Time header stays at 12:00 AM / “incorrect”
   - Root cause class: `timeOffset` gets reset to 0 by focus logic or time header isn’t updated when `timeOffset` changes; also verify timezone assumptions.
4) Program grid incomplete / “only a few items”
   - Root cause class: schedules not loaded for non-preloaded channels, schedule generation window mismatch, or content resolution returns too few items / errors.
5) Program info not accessible from guide
   - Root cause class: focus not guaranteed (focused cell can be null), no gap placeholders, or info panel has insufficient metadata plumbing.
6) Console spam for thumbs: `file:///library/...`
   - Root cause class: EPG uses relative Plex paths without server base URI; webOS blocks `file://` loads.

## Implementation Strategy (from `webos_epg_report.md`)
- **2D virtualization**: render only visible rows + overscan, and only overlapping programs in visible time window.
- **Virtual canvas coordinate system**:
  - `x = (startTime - anchor) * pxPerMinute`
  - `y = (rowIndex - channelOffset) * rowHeight`
- **Transforms on inner content**, not scroll containers, to avoid clipping drift.
- **Focus decoupled from DOM presence**: keep logical focus `(channelIndex, time)` and reconcile when DOM changes.
- **Never blank**: render focusable placeholders for “loading” and “no data” gaps.

---

## Work Items (File-by-File)

### 1) `src/modules/ui/epg/EPGChannelList.ts`
**Goal:** no disappearing channel names; prepare for vertical virtualization.

TODO
- Ensure transforms apply to an inner content wrapper (not the clipped list container). (Partially implemented.)
- Add optional **vertical virtualization** for channel rows:
  - Render only `visibleRows` (+ overscan) instead of all `channels.length`.
  - Reuse row DOM nodes (small pool) keyed by visible slot index.
  - Map visible slot → actual channelIndex and update number/name content.
- Add a debug method (gated by `retune_debug_epg`) to log:
  - `channelOffset`, wrapper transform, number of rendered rows.

Tests
- New test: channel list scroll updates **wrapper** transform and never sets transform on the clipping container.
- New test: virtualization renders correct channel names for a scrolled offset (e.g., offset 12 shows channels 13–…).

Success checks (TV)
- Scroll from channel 1 to 100 and back; channel names never disappear.

---

### 2) `src/modules/ui/epg/EPGVirtualizer.ts`
**Goal:** stable cell placement, bounded DOM, no drift, and “filled” visible time window (cells or placeholders).

TODO
- Maintain strict Y math: `top = (rowIndex - channelOffset) * rowHeight` (already present); add assertion in debug builds.
- Implement **gap placeholders** (focusable “No Program” cells) for visible time ranges:
  - Either generate placeholders in the schedule layer (preferred) or synthesize in virtualizer per row.
  - Placeholders must be stable-keyed and not explode DOM count.
- Enforce DOM cap with explicit policy:
  - Guarantee focused cell is kept.
  - Prefer current-program cells over far-away cells when trimming.
- Add performance hints:
  - Use `transform: translate3d(x,y,0)` for positioning instead of `top/left` if feasible (profile on TV).
- Add debug counters:
  - rendered cell count, pool size, dropped cells count.

Tests
- New test: with `channelOffset=10`, a cell on rowIndex 10 renders at `top=0`.
- New test: placeholders appear when schedule has holes in visible time window.
- New test: focused cell persists even when over DOM cap.

---

### 3) `src/modules/ui/epg/EPGTimeHeader.ts`
**Goal:** time header always reflects the current `timeOffset`; labels make sense for locale/timezone.

TODO
- Confirm time header scroll is updated whenever `timeOffset` changes (don’t rely on one-off calls).
- Consider rendering **only visible time slots** (virtualize header) if full-day slots cause DOM bloat (optional).
- Validate timezone behavior on webOS:
  - `formatTimeSlot()` uses local `Date`; confirm device timezone is correct.
  - If device timezone is unreliable, consider formatting based on UTC or explicit timezone offset policy.

Tests
- New test: when `timeOffset` changes, header transform updates.

---

### 4) `src/modules/ui/epg/EPGInfoPanel.ts`
**Goal:** program info is always accessible and thumbnails don’t spam errors.

TODO
- Stop assigning `poster.src` to raw relative Plex paths (e.g., `/library/...`) unless they are already resolved.
  - Add a thumb/url resolver hook (see `types.ts` changes below) so info panel receives a safe absolute URL.
  - If unresolved, hide poster without logging.
- Add minimal extended metadata support:
  - Support subtitle, season/episode, and a short summary if already available in `ScheduledProgram.item`.
  - If not available, keep description hidden (but don’t show empty area).

Tests
- New test: relative thumb paths do not result in setting `img.src` (or are resolved via callback).

---

### 5) `src/modules/ui/epg/EPGComponent.ts`
**Goal:** never blank on open; always a focused program (or placeholder); focus/timeOffset never snaps unexpectedly.

TODO
- Add explicit internal state for schedule readiness:
  - Track which channelIds have a loaded schedule (and last updated time).
  - When visible and schedules missing for visible rows, show “Loading…” placeholders.
- “Open guide” pipeline:
  - On `show()`: set `timeOffset` to “now” first (if configured), update header, then render.
  - If schedules aren’t ready, keep focus on a placeholder cell (so OK/Back still works).
- Focus model improvements (per report):
  - Track focus as `(channelIndex, focusTimeMs)` not just `(channelIndex, programIndex)`.
  - On up/down: choose program that overlaps `focusTimeMs` (not index 0).
  - On schedule refresh: reconcile focus by nearest overlapping program.
- Ensure channel list scroll and grid scroll are unified:
  - Any update to `scrollPosition.channelOffset` must update channel list wrapper and trigger a render.
- Add an `onVisibleRangeChange` event (optional):
  - When user scrolls channels/time, emit visible window → orchestrator can prioritize schedule loading.

Tests
- New test: opening EPG with no schedules renders placeholders and maintains non-null focus.
- New test: after schedule arrives for focused channel, focus moves to the “now” program (not midnight).
- New test: vertical navigation preserves focusTime behavior.

---

### 6) `src/Orchestrator.ts`
**Goal:** schedules are available when needed, without blocking UI or loading only partial channels.

TODO
- Replace “preload first N channels” with **on-demand schedule loading**:
  - Load schedules for visible rows (+ overscan) first.
  - Continue loading additional channels in background batches (yield between batches).
- Prevent long main-thread blocks:
  - Chunk schedule building (e.g., 5 channels per tick) using `setTimeout(0)` or `requestAnimationFrame`.
- Provide a thumb resolver:
  - When building `ScheduledProgram` items, resolve `item.thumb` to an absolute URL via `_buildPlexResourceUrl`.
  - Alternatively expose `getPlexImageUrl(path)` to EPG via config callback.
- Add lifecycle hooks:
  - When channels are replaced/rebuilt, invalidate schedules and trigger a fresh load for visible range.

Tests
- Add orchestrator unit test (if existing patterns): schedule load prioritizes visible range and doesn’t require scrolling to populate.

---

### 7) `src/modules/ui/epg/types.ts` (+ `interfaces.ts`)
**Goal:** provide clean contracts for “premium guide” behaviors without entangling UI with Plex internals.

TODO
- Extend `EPGConfig` to include optional callbacks:
  - `resolveThumbUrl?: (pathOrUrl: string | null) => string | null`
  - `onVisibleRangeChange?: (range: { channelStart: number; channelEnd: number; timeStartMs: number; timeEndMs: number }) => void`
- Add placeholder program types:
  - e.g., `ScheduledProgram` may include `kind: 'program' | 'loading' | 'gap'`
  - Ensure virtualizer and info panel handle `loading/gap` gracefully.

Tests
- Type-level tests aren’t typical here; add runtime unit tests in EPGComponent/Virtualizer to ensure placeholders behave.

---

### 8) `src/modules/ui/epg/styles.css`
**Goal:** layout matches config; avoid implicit rowHeight changes; reduce jank.

TODO
- Ensure `.epg-channel-row` height equals `epgConfig.rowHeight` (single source of truth).
- Avoid margins that break math; prefer padding within fixed height.
- Consider using `will-change: transform` on moving wrappers (channel list content, time header inner).

TV checks
- Verify channel list and grid rows remain aligned for long scroll sessions.

---

### 9) “Graceful start after channel setup” and selection UX
(Not strictly EPG, but directly affects perceived “premium” flow.)

#### `src/modules/ui/channel-setup/ChannelSetupScreen.ts`
TODO
- After successful build + Done:
  - Navigate directly to `player` and open EPG (or start playback on channel 1 and show a toast “Press Yellow for Guide”).
  - Ensure you don’t land back on setup due to missing current channel state.
  - Option: persist “setup complete” and auto-start player on next app launch.

#### `src/modules/ui/server-select/ServerSelectScreen.ts`
TODO
- Visually indicate selected server (checkmark, “Selected” tag, highlight).
- Ensure keypad selection updates UI consistently (focus vs selected state).

---

## Test Plan (Jest)
Run:
- `npm test`

Add/extend tests in:
- `src/modules/ui/epg/__tests__/EPGComponent.test.ts`
- `src/modules/ui/epg/__tests__/EPGVirtualizer.test.ts`

Minimum new test cases:
1) “Open guide with no schedules” → placeholder rendered + focus set.
2) “Schedule arrives” → focus snaps to now, time header remains offset.
3) “Scroll down channelOffset=12” → channel list shows correct rows and never disappears.
4) “Virtualizer Y math” → rowIndex minus offset yields expected top.
5) “Thumb resolver” → no `file:///` usage from EPG info panel.

## TV Verification Checklist
1) Enable EPG debug: `localStorage.setItem('retune_debug_epg','1')`
2) Open guide:
   - should not be blank
   - focused cell visible (or Loading placeholder)
   - time header not snapped to 12:00 AM unless you navigate there
3) Scroll: channel 1 → 100 → 1
   - channel names never disappear
   - grid rows stay aligned
4) Horizontal navigation:
   - time header stays aligned with grid
   - focus doesn’t jump to midnight unexpectedly
5) Observe logs:
   - no repeated `file:///library/...` image errors
   - bounded cell counts (stay under configured cap)

## Rollback Plan
- All changes should be incremental and revertible.
- Keep major refactors behind a feature flag if possible (e.g., `retune_epg_v2_virtualize=1`).
- If regressions occur: revert the commit(s) touching `src/modules/ui/epg/*` first, then `src/Orchestrator.ts`.

