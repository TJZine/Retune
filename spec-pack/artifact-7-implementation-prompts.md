# AI Agent Implementation Prompts

These prompts are self-contained instructions for AI coding agents to implement individual modules. Each prompt contains everything needed to implement the module without external dependencies.

> [!IMPORTANT]
> **TypeScript Configuration**: All modules must compile with strict TypeScript settings. See `tsconfig.template.json` for compiler options. **Target: ES2017** (Chromium 68 compatibility). **Do NOT use optional chaining (`?.`) or nullish coalescing (`??`)** — these require ES2020 and will not work on webOS 4.0+.

---

## Prompt 1: Event Emitter Utility (Priority 1)

````markdown
You are implementing a TypeScript utility module for Retune, a webOS application.

### P1: Task
Implement a typed EventEmitter class that provides pub/sub functionality with TypeScript generics for type-safe events.

### P1: Files to Create
- src/utils/EventEmitter.ts

### P1: Requirements

1. Create a generic `EventEmitter<EventMap>` class where:
   - EventMap is a type with event names as keys and payload types as values
   - `on(event, handler)` registers a handler
   - `off(event, handler)` removes a handler  
   - `emit(event, payload)` invokes all handlers for an event
   - `once(event, handler)` registers a one-time handler

2. Implementation details:
   - Use Map<string, Set<Function>> internally for handlers
   - Return an unsubscribe function from `on()` and `once()`
   - `emit()` should catch handler errors and not break other handlers
   - Support removing all listeners with `removeAllListeners(event?)`
   
   **CRITICAL: Error Isolation (MINOR-011)**
   - Each handler MUST be wrapped in try-catch
   - Handler errors should be logged but NOT propagate
   - Other handlers in the same event MUST still execute
   - Consider emitting an 'error' event when handlers fail

   ```typescript
   emit<K extends keyof T>(event: K, payload: T[K]): void {
     const handlers = this.handlers.get(event as string);
     if (!handlers) return;
     
     handlers.forEach(handler => {
       try {
         handler(payload);
       } catch (error) {
         console.error(`Handler error for event '${String(event)}':`, error);
         // Optionally emit to internal error handler
       }
     });
   }
   ```

1. Type safety:
   - Event names must be keys of EventMap
   - Handler parameter must match the event's payload type
   - `emit()` payload must match the event's payload type

### P1: Example Usage

```typescript
interface MyEvents {
  userLogin: { userId: string; timestamp: number };
  error: Error;
  tick: void;
}

const emitter = new EventEmitter<MyEvents>();

emitter.on('userLogin', (payload) => {
  console.log(payload.userId); // TypeScript knows payload type
});

emitter.emit('userLogin', { userId: '123', timestamp: Date.now() });
emitter.emit('tick'); // void payload
```

### P1: Constraints

- No external dependencies
- Must work in Chromium 68 (webOS 4.0)
- Keep implementation under 100 lines

### P1: Deliverable

- A single TypeScript file with:
- EventEmitter class with full type annotations
- JSDoc comments on all public methods
- Export statement for the class

````

---

## Prompt 2: Plex Authentication Module (Priority 1)

````markdown
You are implementing the Plex Authentication module for Retune, a webOS TV application.

### P2: Task
Implement PIN-based OAuth authentication with plex.tv, including token storage and validation.

### P2: Files to Create
- src/modules/plex/auth/index.ts (exports)
- src/modules/plex/auth/PlexAuth.ts (main class)
- src/modules/plex/auth/interfaces.ts (IPlexAuth)
- src/modules/plex/auth/constants.ts

### P2: Type Definitions (use these exactly)

```typescript
interface PlexAuthConfig {
  clientIdentifier: string;
  product: string;
  version: string;
  platform: string;
  platformVersion: string;
  device: string;
  deviceName: string;
}

interface PlexPinRequest {
  id: number;
  code: string;
  expiresAt: Date;
  authToken: string | null;
  clientIdentifier: string;
}

interface PlexAuthToken {
  token: string;
  userId: string;
  username: string;
  email: string;
  thumb: string;
  expiresAt: Date | null;
  issuedAt: Date;
}

interface PlexAuthData {
  token: PlexAuthToken;
  selectedServerId: string | null;
  selectedServerUri: string | null;
}
```

### P2: Interface to Implement

```typescript
interface IPlexAuth {
  requestPin(): Promise<PlexPinRequest>;
  checkPinStatus(pinId: number): Promise<PlexPinRequest>;
  cancelPin(pinId: number): Promise<void>;
  validateToken(token: string): Promise<boolean>;
  getStoredCredentials(): Promise<PlexAuthData | null>;
  storeCredentials(auth: PlexAuthData): Promise<void>;
  clearCredentials(): Promise<void>;
  isAuthenticated(): boolean;
  getCurrentUser(): PlexAuthToken | null;
  getAuthHeaders(): Record<string, string>;
  on(event: 'authChange', handler: (isAuthenticated: boolean) => void): void;
}
```

### P2: API Endpoints

- PIN Request: [https://plex.tv/api/v2/pins](https://plex.tv/api/v2/pins)
- PIN Check: [https://plex.tv/api/v2/pins/{id}](https://plex.tv/api/v2/pins/{id})
- User Profile: [https://plex.tv/api/v2/user](https://plex.tv/api/v2/user)

### P2: Required Headers for All Requests

- Accept: application/json
- X-Plex-Client-Identifier: {clientIdentifier}
- X-Plex-Product: {product}
- X-Plex-Version: {version}
- X-Plex-Platform: {platform}
- X-Plex-Device: {device}

### P2: Storage

- Use localStorage with key 'retune_plex_auth'
- Include version number in stored data for migrations

### P2: Implementation Notes

1. requestPin() should POST to /pins with { strong: true }
2. checkPinStatus() polls every 1 second for 5 minutes max
3. When authToken is populated, fetch user profile and store
4. getAuthHeaders() includes X-Plex-Token when authenticated
5. Emit 'authChange' event when credentials change

### P2: Timing Budgets

| Operation | Maximum Duration | Notes |
|-----------|------------------|-------|
| Token validation | 100ms | Validate locally first, then server check |
| PIN request | 5s | Network request timeout |
| PIN polling | 1s interval | Poll for 5 minutes max |
| Server connection test | 5s per connection | Test fastest first |

### P2: Error Handling

- Wrap fetch in try/catch
- On 401/403, return false from validateToken
- On network error, throw with code 'NETWORK_ERROR'

### P2: User-Facing Error Messages (INLINED)

Use these EXACT messages in error handling:

```typescript
const AUTH_ERROR_MESSAGES = {
  AUTH_REQUIRED: 'Please sign in to your Plex account to continue.',
  AUTH_EXPIRED: 'Your session has expired. Please sign in again.',
  AUTH_INVALID: 'Unable to verify your Plex account. Please try signing in again.',
  AUTH_FAILED: 'Sign in failed. Please check your internet connection and try again.',
  PIN_EXPIRED: 'The PIN code has expired. Please request a new one.',
  PIN_TIMEOUT: 'PIN entry timed out. Please try again.',
} as const;
```

### P2: Deliverable

Complete implementation of all files with:
- Full IPlexAuth implementation
- localStorage persistence
- Event emission via EventEmitter
- JSDoc comments
- No TypeScript errors

````

---

## Prompt 3: Channel Scheduler Module (Priority 5)

````markdown
You are implementing the Channel Scheduler module for Retune, a webOS TV application that creates virtual TV channels.

### P3: Task
Implement deterministic schedule generation for virtual TV channels. Given a channel's content and the current time, calculate exactly which content should be playing and at what offset.

### P3: Files to Create
- src/modules/scheduler/scheduler/index.ts
- src/modules/scheduler/scheduler/ChannelScheduler.ts
- src/modules/scheduler/scheduler/ScheduleCalculator.ts  
- src/modules/scheduler/scheduler/ShuffleGenerator.ts
- src/modules/scheduler/scheduler/interfaces.ts

### P3: Type Definitions (use exactly)

```typescript
interface ScheduleConfig {
  channelId: string;
  anchorTime: number; // Unix timestamp (ms) - schedule start
  content: ResolvedContentItem[];
  playbackMode: 'sequential' | 'shuffle' | 'random';
  shuffleSeed: number;
  loopSchedule: boolean;
}

interface ResolvedContentItem {
  ratingKey: string;
  type: 'movie' | 'episode';
  title: string;
  fullTitle: string;
  durationMs: number;
  thumb: string | null;
  year: number;
  seasonNumber?: number;
  episodeNumber?: number;
  scheduledIndex: number;
}

interface ScheduledProgram {
  item: ResolvedContentItem;
  scheduledStartTime: number;
  scheduledEndTime: number;
  elapsedMs: number;
  remainingMs: number;
  scheduleIndex: number;
  loopNumber: number;
  streamDescriptor: null; // Resolved separately
}

interface ScheduleWindow {
  startTime: number;
  endTime: number;
  programs: ScheduledProgram[];
}

interface ScheduleIndex {
  channelId: string;
  generatedAt: number;
  totalLoopDurationMs: number;
  itemStartOffsets: number[]; // Cumulative offsets
  orderedItems: ResolvedContentItem[];
}
```

### P3: Core Algorithm (CRITICAL)

The heart of this module is getProgramAtTime(). Here's the algorithm:

```typescript
function getProgramAtTime(queryTime: number): ScheduledProgram {
  // 1. Calculate elapsed since anchor
  const elapsedSinceAnchor = queryTime - anchorTime;
  
  // 2. Determine loop iteration
  const loopNumber = Math.floor(elapsedSinceAnchor / totalLoopDurationMs);
  
  // 3. Position within current loop (handle negative times)
  const positionInLoop = ((elapsedSinceAnchor % totalLoopDurationMs) + totalLoopDurationMs) % totalLoopDurationMs;
  
  // 4. Binary search for current item
  const itemIndex = binarySearchForItem(positionInLoop);
  
  // 5. Calculate offset within item
  const itemStartOffset = itemStartOffsets[itemIndex];
  const offsetInItem = positionInLoop - itemStartOffset;
  
  // 6. Build ScheduledProgram with absolute times
}
```

### P3: Deterministic Shuffle (Mulberry32 PRNG)

```typescript
function mulberry32(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
```
Use Fisher-Yates shuffle with this PRNG. Same seed MUST produce identical order.

### P3: Interface to Implement

```typescript
interface IChannelScheduler {
  loadChannel(config: ScheduleConfig): void;
  unloadChannel(): void;
  getProgramAtTime(time: number): ScheduledProgram;
  getCurrentProgram(): ScheduledProgram;
  getNextProgram(): ScheduledProgram;
  getPreviousProgram(): ScheduledProgram;
  getScheduleWindow(startTime: number, endTime: number): ScheduleWindow;
  getUpcoming(count: number): ScheduledProgram[];
  syncToCurrentTime(): void;
  skipToNext(): void;
  skipToPrevious(): void;
  getState(): SchedulerState;
  on(event: 'programStart', handler: (program: ScheduledProgram) => void): void;
  on(event: 'programEnd', handler: (program: ScheduledProgram) => void): void;
  on(event: 'scheduleSync', handler: (state: SchedulerState) => void): void;
}
```

### P3: Requirements

1. O(log n) lookup via binary search
2. Schedule must loop infinitely without gaps
3. Same config always produces same schedule
4. Timer syncs every 1 second, emits events at program boundaries
5. getScheduleWindow() must be fast (<50ms for 24 hours)

### P3: Deliverable

```typescript
Complete implementation with:
- ScheduleCalculator with pure functions
- ShuffleGenerator with Mulberry32 PRNG
- ChannelScheduler class tying it together
- Event emission for program transitions
- All interfaces and types
- JSDoc comments
```

---

## Prompt 4: Video Player Module (Priority 4)

````markdown
You are implementing the Video Player module for Retune, a webOS TV application.

### P4: Task
Create an abstraction over the HTML5 video element optimized for webOS, handling HLS streams, subtitle tracks, error recovery, and suspension prevention.

### P4: Files to Create
- src/modules/player/index.ts
- src/modules/player/VideoPlayer.ts
- src/modules/player/SubtitleManager.ts
- src/modules/player/interfaces.ts

### P4: Type Definitions

```typescript
interface VideoPlayerConfig {
  containerId: string;
  defaultVolume: number;
  bufferAheadMs: number;
  seekIncrementSec: number;
  hideControlsAfterMs: number;
  retryAttempts: number;
  retryDelayMs: number;
}

interface StreamDescriptor {
  url: string;
  protocol: 'hls' | 'dash' | 'direct';
  mimeType: string;
  startPositionMs: number;
  mediaMetadata: MediaMetadata;
  subtitleTracks: SubtitleTrack[];
  audioTracks: AudioTrack[];
  durationMs: number;
  isLive: boolean;
}

type PlayerStatus = 'idle' | 'loading' | 'buffering' | 'playing' | 'paused' | 'seeking' | 'ended' | 'error';

interface PlaybackState {
  status: PlayerStatus;
  currentTimeMs: number;
  durationMs: number;
  bufferPercent: number;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
  activeSubtitleId: string | null;
  activeAudioId: string | null;
  errorInfo: PlaybackError | null;
}
```

### P4: Interface to Implement

```typescript
interface IVideoPlayer {
  initialize(config: VideoPlayerConfig): Promise<void>;
  destroy(): void;
  loadStream(descriptor: StreamDescriptor): Promise<void>;
  unloadStream(): void;
  play(): Promise<void>;
  pause(): void;
  stop(): void;
  seekTo(positionMs: number): Promise<void>;
  seekRelative(deltaMs: number): Promise<void>;
  setVolume(level: number): void;
  getVolume(): number;
  mute(): void;
  unmute(): void;
  toggleMute(): void;
  setSubtitleTrack(trackId: string | null): Promise<void>;
  setAudioTrack(trackId: string): Promise<void>;
  getState(): PlaybackState;
  getCurrentTimeMs(): number;
  getDurationMs(): number;
  isPlaying(): boolean;
  on(event: 'stateChange', handler: (state: PlaybackState) => void): void;
  on(event: 'timeUpdate', handler: (data: { currentTimeMs: number; durationMs: number }) => void): void;
  on(event: 'ended', handler: () => void): void;
  on(event: 'error', handler: (error: PlaybackError) => void): void;
}
```

### P4: Critical Implementation Notes

1. **HLS Handling**: webOS has native HLS support - DO NOT use HLS.js
   ```typescript
   if (descriptor.protocol === 'hls') {
     videoElement.src = descriptor.url; // Native HLS
   }
   ```

2. **Keep-Alive**: webOS suspends apps during long playback. Prevent with:
   ```typescript
   setInterval(() => {
     if (this.isPlaying()) {
       document.dispatchEvent(new Event('click')); // Touch DOM
     }
   }, 30000);
   ```

3. **Error Retry**: For MEDIA_ERR_NETWORK (code 2), retry with exponential backoff:
   ```typescript
   const delay = retryDelayMs * Math.pow(2, retryCount);
   ```

4. **Subtitle Tracks**: Create <track> elements dynamically:
   ```typescript
   const track = document.createElement('track');
   track.kind = 'subtitles';
   track.src = subtitleUrl;
   track.srclang = languageCode;
   videoElement.appendChild(track);
   ```

5. **Video Element CSS**:
   ```css
   position: absolute;
   top: 0; left: 0;
   width: 100%; height: 100%;
   background: #000;
   object-fit: contain;
   ```

### P4: Event Mapping

Map video element events to player events:
- canplay → status: 'buffering' to 'paused'
- playing → status: 'playing'
- pause → status: 'paused'
- seeking → status: 'seeking'
- seeked → restore previous status
- ended → emit 'ended', status: 'ended'
- error → handle based on MediaError.code

### P4: Deliverable

Complete implementation with:
- VideoPlayer class with all IVideoPlayer methods
- SubtitleManager for track handling
- Keep-alive mechanism for webOS
- Error retry with backoff
- Event emission via EventEmitter
- JSDoc comments
```

---

## Prompt 5: Navigation Module (Priority 2)

````markdown
You are implementing the Navigation & Remote Control module for Retune, a webOS TV application.

### P5: Task
Handle LG remote control input, manage focus across the application, and coordinate screen transitions.

### P5: Files to Create
- src/modules/navigation/index.ts
- src/modules/navigation/NavigationManager.ts
- src/modules/navigation/FocusManager.ts
- src/modules/navigation/RemoteHandler.ts
- src/modules/navigation/interfaces.ts
- src/modules/navigation/constants.ts

### P5: Type Definitions
```typescript
type RemoteButton = 
  | 'ok' | 'back' | 'up' | 'down' | 'left' | 'right'
  | 'play' | 'pause' | 'stop' | 'rewind' | 'fastforward'
  | 'channelUp' | 'channelDown'
  | 'red' | 'green' | 'yellow' | 'blue'
  | 'num0' | 'num1' | 'num2' | 'num3' | 'num4' | 'num5' | 'num6' | 'num7' | 'num8' | 'num9'
  | 'info' | 'guide';

type Screen = 'splash' | 'auth' | 'server-select' | 'home' | 'player' | 'guide' | 'channel-edit' | 'settings' | 'error';

interface KeyEvent {
  button: RemoteButton;
  isRepeat: boolean;
  isLongPress: boolean;
  timestamp: number;
  originalEvent: KeyboardEvent;
}

interface FocusableElement {
  id: string;
  element: HTMLElement;
  group?: string;
  neighbors: {
    up?: string;
    down?: string;
    left?: string;
    right?: string;
  };
  onFocus?: () => void;
  onBlur?: () => void;
  onSelect?: () => void;
}
```

### P5: webOS Key Codes (CRITICAL)

```typescript
const KEY_MAP: Map<number, RemoteButton> = new Map([
  [13, 'ok'],
  [461, 'back'],  // webOS specific!
  [38, 'up'],
  [40, 'down'],
  [37, 'left'],
  [39, 'right'],
  [415, 'play'],
  [19, 'pause'],
  [413, 'stop'],
  [412, 'rewind'],
  [417, 'fastforward'],
  [33, 'channelUp'],
  [34, 'channelDown'],
  [403, 'red'],
  [404, 'green'],
  [405, 'blue'],
  [406, 'yellow'],
  [457, 'info'],
  [458, 'guide'],
  // Numbers 0-9 are 48-57
]);
```

### P5: Interface to Implement

```typescript
interface INavigationManager {
  initialize(config: NavigationConfig): void;
  destroy(): void;
  
  goTo(screen: Screen, params?: Record<string, unknown>): void;
  goBack(): boolean;
  replaceScreen(screen: Screen): void;
  
  setFocus(elementId: string): void;
  getFocusedElement(): FocusableElement | null;
  moveFocus(direction: 'up' | 'down' | 'left' | 'right'): boolean;
  
  registerFocusable(element: FocusableElement): void;
  unregisterFocusable(elementId: string): void;
  
  openModal(modalId: string): void;
  closeModal(modalId?: string): void;
  isModalOpen(): boolean;
  
  blockInput(): void;
  unblockInput(): void;
  
  on(event: 'keyPress', handler: (ke: KeyEvent) => void): void;
  on(event: 'screenChange', handler: (data: { from: Screen; to: Screen }) => void): void;
  on(event: 'focusChange', handler: (data: { from: string | null; to: string }) => void): void;
}
```

### P5: Implementation Requirements

1. **Key Event Handling**
   - Listen to 'keydown' on document
   - Map keyCode to RemoteButton using KEY_MAP
   - Track keydown time for long-press detection (500ms threshold)
   - Emit 'keyPress' event for all mapped keys

2. **Focus Management**
   - Track focusable elements in Map<string, FocusableElement>
   - Call onFocus/onBlur callbacks on focus change
   - Call onSelect when OK is pressed on focused element
   - Support explicit neighbors and spatial fallback

3. **Screen Stack**
   - Maintain history for back navigation
   - Save focus state per screen
   - Restore focus when returning to screen

4. **Modal Handling**
   - Trap focus within modal when open
   - Back button closes modal first
   - Restore previous focus on close

### P5: Focus Ring CSS

```css
.focusable:focus, .focusable.focused {
  outline: none;
  box-shadow: 0 0 0 4px var(--focus-color, #00a8e1);
  transform: scale(1.02);
}
```

### P5: Magic Remote Pointer Mode (INLINED from Platform Constraints)

webOS Magic Remote supports both D-pad navigation and pointer mode. Handle both:

```typescript
interface PointerModeConfig {
  enabled: boolean;           // Default: true
  cursorHideDelayMs: number; // Default: 3000
}

class PointerModeHandler {
  private isActive: boolean = false;
  private hideTimer: number | null = null;
  
  initialize(config: PointerModeConfig): void {
    if (!config.enabled) return;
    
    document.addEventListener('mousemove', this.handlePointerMove);
    document.addEventListener('click', this.handlePointerClick);
  }
  
  private handlePointerMove = (event: MouseEvent): void => {
    if (!this.isActive) {
      this.isActive = true;
      this.emit('pointerModeChange', { active: true });
      document.body.classList.add('pointer-mode');
    }
    
    // Reset hide timer
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      this.isActive = false;
      this.emit('pointerModeChange', { active: false });
      document.body.classList.remove('pointer-mode');
    }, this.config.cursorHideDelayMs);
  };
  
  private handlePointerClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    const focusable = target.closest('.focusable');
    
    if (focusable) {
      this.navigation.setFocus(focusable.id);
      this.navigation.triggerSelect();
    }
  };
}
```

**CSS for Pointer Mode**:
```css
/* Hide focus ring when using pointer */
body.pointer-mode .focusable:focus {
  box-shadow: none;
  transform: none;
}

/* Show hover state instead */
body.pointer-mode .focusable:hover {
  background: var(--surface-elevated);
  cursor: pointer;
}
```

### P5: Spatial Navigation Algorithm

When explicit `neighbors` not defined, use geometric algorithm:

```typescript
private findNearestNeighbor(
  fromId: string, 
  direction: 'up' | 'down' | 'left' | 'right'
): string | null {
  const fromElement = this.focusableElements.get(fromId);
  if (!fromElement) return null;
  
  const fromRect = fromElement.element.getBoundingClientRect();
  const candidates: Array<{ id: string; score: number }> = [];
  
  for (const [id, element] of this.focusableElements) {
    if (id === fromId) continue;
    if (!this.isVisible(element.element)) continue;
    
    const rect = element.element.getBoundingClientRect();
    if (!this.isInDirection(fromRect, rect, direction)) continue;
    
    // Score: prefer overlap on perpendicular axis, then minimal distance
    const overlap = this.calculateOverlap(fromRect, rect, direction);
    const distance = this.calculateDistance(fromRect, rect, direction);
    const score = (overlap * 1000) - distance;
    
    candidates.push({ id, score });
  }
  
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].id;
}

private isInDirection(from: DOMRect, to: DOMRect, dir: string): boolean {
  const fromCenter = { x: from.left + from.width/2, y: from.top + from.height/2 };
  const toCenter = { x: to.left + to.width/2, y: to.top + to.height/2 };
  switch (dir) {
    case 'up': return toCenter.y < fromCenter.y;
    case 'down': return toCenter.y > fromCenter.y;
    case 'left': return toCenter.x < fromCenter.x;
    case 'right': return toCenter.x > fromCenter.x;
    default: return false;
  }
}
```

### P5: Test Specifications with Exact Assertions

```typescript
describe('NavigationManager', () => {
  describe('screen navigation', () => {
    it('should push to stack on goTo', () => {
      nav.goTo('settings');
      expect(nav.getCurrentScreen()).toBe('settings');
      expect(nav.getState().screenStack).toContain('home');
    });
    
    it('should pop stack on goBack', () => {
      nav.goTo('settings');
      const returned = nav.goBack();
      expect(returned).toBe(true);
      expect(nav.getCurrentScreen()).toBe('home');
    });
    
    it('should return false on goBack at root', () => {
      // At initial screen with empty stack
      expect(nav.goBack()).toBe(false);
    });
  });
  
  describe('focus management', () => {
    it('should set focus on registered element', () => {
      const el = document.createElement('button');
      nav.registerFocusable({ id: 'btn1', element: el, neighbors: {} });
      nav.setFocus('btn1');
      const focused = nav.getFocusedElement();
      expect(focused && focused.id).toBe('btn1');
      expect(el.classList.contains('focused')).toBe(true);
    });
    
    it('should move focus using explicit neighbors', () => {
      nav.registerFocusable({ id: 'btn1', element: el1, neighbors: { right: 'btn2' } });
      nav.registerFocusable({ id: 'btn2', element: el2, neighbors: { left: 'btn1' } });
      nav.setFocus('btn1');
      
      const moved = nav.moveFocus('right');
      expect(moved).toBe(true);
      const focused = nav.getFocusedElement();
      expect(focused && focused.id).toBe('btn2');
    });
    
    it('should return false when no neighbor in direction', () => {
      nav.registerFocusable({ id: 'btn1', element: el, neighbors: { right: 'btn2' } });
      nav.setFocus('btn1');
      
      expect(nav.moveFocus('left')).toBe(false); // No explicit neighbor
      const focused = nav.getFocusedElement();
      expect(focused && focused.id).toBe('btn1'); // Focus unchanged
    });
  });
  
  describe('key handling', () => {
    it('should emit keyPress event on mapped key', () => {
      const handler = jest.fn();
      nav.on('keyPress', handler);
      
      // Simulate keydown for OK button (keyCode 13)
      const event = new KeyboardEvent('keydown', { keyCode: 13 });
      document.dispatchEvent(event);
      
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ button: 'ok', isRepeat: false })
      );
    });
    
    it('should detect long press after 500ms', async () => {
      const longPressHandler = jest.fn();
      nav.handleLongPress('ok', longPressHandler);
      nav.setFocus('btn1');
      
      // Simulate keydown
      document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 13 }));
      
      // Wait 500ms
      await new Promise(r => setTimeout(r, 550));
      
      expect(longPressHandler).toHaveBeenCalled();
    });
  });
  
  describe('pointer mode', () => {
    it('should activate on mouse movement', () => {
      const handler = jest.fn();
      nav.on('pointerModeChange', handler);
      
      document.dispatchEvent(new MouseEvent('mousemove'));
      
      expect(handler).toHaveBeenCalledWith({ active: true });
      expect(document.body.classList.contains('pointer-mode')).toBe(true);
    });
    
    it('should deactivate after cursor hide delay', async () => {
      const handler = jest.fn();
      nav.on('pointerModeChange', handler);
      
      document.dispatchEvent(new MouseEvent('mousemove'));
      await new Promise(r => setTimeout(r, 3100)); // Wait for cursorHideDelayMs
      
      expect(handler).toHaveBeenLastCalledWith({ active: false });
    });
  });
});
```

### P5: Deliverable

Complete implementation with:
- RemoteHandler processing key events (all KEY_MAP codes)
- FocusManager with spatial navigation algorithm
- NavigationManager coordinating screens
- PointerModeHandler for Magic Remote
- Event emission for keyPress, screenChange, focusChange, pointerModeChange
- Focus memory per screen with save/restore
- JSDoc comments on all public methods
````

---

## Prompt 6: EPG UI Module (Priority 6)

````markdown
You are implementing the EPG (Electronic Program Guide) UI module for Retune, a webOS TV application.

### P6: Task
Create a virtualized program grid displaying channels (vertical) and time (horizontal) that performs well on limited TV hardware.

### P6: Files to Create
- src/modules/ui/epg/index.ts
- src/modules/ui/epg/EPGComponent.ts
- src/modules/ui/epg/EPGVirtualizer.ts
- src/modules/ui/epg/EPGInfoPanel.ts
- src/modules/ui/epg/interfaces.ts
- src/modules/ui/epg/styles.css

### P6: Dependencies (you will receive these)
- IChannelScheduler.getScheduleWindow(startTime, endTime)
- INavigationManager focus handling

### P6: Type Definitions

### P6: EPG Constants (INLINED)

Use these EXACT values for EPG configuration:

```typescript
const EPG_CONSTANTS = {
  /** Visible channel rows at once */
  VISIBLE_CHANNELS: 5,
  /** Grid time slot granularity (minutes) */
  TIME_SLOT_MINUTES: 30,
  /** Visible hours at once */
  VISIBLE_HOURS: 3,
  /** Total hours in schedule */
  TOTAL_HOURS: 24,
  /** Pixels per minute (width scaling) */
  PIXELS_PER_MINUTE: 4,
  /** Pixels per channel row */
  ROW_HEIGHT: 80,
  /** Virtualization row buffer above/below visible */
  ROW_BUFFER: 2,
  /** Virtualization time buffer (minutes) */
  TIME_BUFFER_MINUTES: 60,
  /** Current time indicator update interval (ms) */
  TIME_INDICATOR_UPDATE_MS: 60_000,
  /** Maximum DOM elements for grid cells */
  MAX_DOM_ELEMENTS: 200,
} as const;
```

```typescript
interface EPGConfig {
  containerId: string;
  visibleChannels: number; // 5
  timeSlotMinutes: number; // 30
  visibleHours: number; // 3
  pixelsPerMinute: number; // 4
  rowHeight: number; // 80
}

// Inlined from shared-types for prompt self-sufficiency
interface ScheduledProgram {
  item: ResolvedContentItem;
  scheduledStartTime: number;  // Unix timestamp (ms)
  scheduledEndTime: number;    // Unix timestamp (ms)
  elapsedMs: number;           // How far into this program we are
  remainingMs: number;         // Time left
  isCurrent: boolean;
  loopNumber: number;
}

interface ResolvedContentItem {
  ratingKey: string;
  title: string;
  fullTitle: string;
  type: 'movie' | 'episode';
  durationMs: number;
  thumb: string | null;
  year?: number;
  grandparentTitle?: string;  // Show name
  seasonNumber?: number;
  episodeNumber?: number;
}

interface EPGFocusPosition {
  channelIndex: number;
  programIndex: number;
  program: ScheduledProgram;
  cellElement: HTMLElement | null;
}

interface EPGProgramCell {
  program: ScheduledProgram;
  left: number; // pixels from grid start
  width: number; // pixels
  isPartial: boolean;
  isCurrent: boolean;
  isFocused: boolean;
}
```

### P6: Interface to Implement

```typescript
interface IEPGComponent {
  initialize(config: EPGConfig): void;
  destroy(): void;
  show(): void;
  hide(): void;
  toggle(): void;
  isVisible(): boolean;
  
  loadChannels(channels: ChannelConfig[]): void;
  loadScheduleForChannel(channelId: string, schedule: ScheduleWindow): void;
  refreshCurrentTime(): void;
  
  focusChannel(channelIndex: number): void;
  focusProgram(channelIndex: number, programIndex: number): void;
  focusNow(): void;
  
  handleNavigation(direction: 'up' | 'down' | 'left' | 'right'): boolean;
  handleSelect(): boolean;
  handleBack(): boolean;
  
  on(event: 'channelSelected', handler: (data: { channel, program }) => void): void;
  on(event: 'focusChange', handler: (pos: EPGFocusPosition) => void): void;
}
```

### P6: Virtualization Strategy (CRITICAL)

Only render visible cells + buffer. Max ~200 DOM elements.

```typescript
calculateVisibleCells(scrollPosition) {
  const visibleRows = range(
    Math.max(0, channelOffset - 2),
    Math.min(totalChannels, channelOffset + visibleChannels + 2)
  );
  
  const visibleTimeRange = {
    start: timeOffset - 60, // 1 hour buffer
    end: timeOffset + (visibleHours * 60) + 60
  };
  
  // For each visible row, get programs overlapping time range
  // Reuse/recycle DOM elements
}
```

### P6: Grid Layout

```
┌───────────────────────────────────────────────────┐
│ [Time Header: 12:00 | 12:30 | 1:00 | 1:30 | 2:00] │
├─────────┬─────────────────────────────────────────┤
│ Ch 1    │ [Program Cell] [Program Cell]           │
├─────────┼─────────────────────────────────────────┤
│ Ch 2    │ [Program Cell] [Program Cell]           │
├─────────┼─────────────────────────────────────────┤
│ Ch 3    │ [Focused Cell███████████████]           │
├─────────┴─────────────────────────────────────────┤
│ [Info Panel: Title, Time, Description]            │
└───────────────────────────────────────────────────┘
```

### P6: Cell Positioning

```typescript
function positionCell(program: ScheduledProgram, gridStartTime: number): EPGProgramCell {
  const minutesFromStart = (program.scheduledStartTime - gridStartTime) / 60000;
  const durationMinutes = (program.scheduledEndTime - program.scheduledStartTime) / 60000;
  
  return {
    left: minutesFromStart * pixelsPerMinute,
    width: durationMinutes * pixelsPerMinute,
    // ...
  };
}
```

### P6: Navigation Logic

```typescript
handleNavigation(direction) {
  switch (direction) {
    case 'up':
      // Move to previous channel, find program at same time
      return focusProgramAtTime(channelIndex - 1, currentTime);
    case 'down':
      // Move to next channel
      return focusProgramAtTime(channelIndex + 1, currentTime);
    case 'left':
      // Move to previous program in same channel
      return focusPreviousProgram();
    case 'right':
      // Move to next program in same channel
      return focusNextProgram();
  }
}
```

### P6: CSS (TV-optimized)

```css
.epg-container {
  position: absolute;
  top: 5%; left: 5%;
  width: 90%; height: 90%;
  background: rgba(0, 0, 0, 0.95);
}

.epg-cell {
  position: absolute;
  height: 76px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.1);
  transition: transform 150ms ease-out;
}

.epg-cell.focused {
  background: #00a8e1;
  transform: scale(1.02);
  z-index: 10;
  box-shadow: 0 0 20px rgba(0, 168, 225, 0.5);
}

.epg-cell-title {
  font-size: 24px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

### P6: Performance Requirements

- Render 5 channels × 3 hours in <100ms
- Maintain 60fps during scroll
- Max 200 DOM elements

### P6: Deliverable

Complete implementation with:
- EPGComponent orchestrating grid
- EPGVirtualizer managing DOM recycling
- EPGInfoPanel for program details
- D-pad navigation working correctly
- Current time indicator
- Event emission
- All CSS styles

````

---

## Prompt 7 (DEPRECATED): Plex Server Discovery Module (Priority 2)

> [!WARNING]
> Deprecated prompt. Use `## Prompt 8 (V2): Plex Server Discovery Module (Priority 2)` in this file as the canonical prompt.

````markdown
You are implementing the Plex Server Discovery module for Retune, a webOS TV application.

### P7: Task
Implement server discovery, connection testing, and selection management for Plex Media Servers.

### P7: Files to Create

- src/modules/plex/discovery/index.ts
- src/modules/plex/discovery/PlexServerDiscovery.ts
- src/modules/plex/discovery/interfaces.ts
- src/modules/plex/discovery/ConnectionTester.ts

### P7: Type Definitions (use exactly)

```typescript
interface PlexServer {
  id: string;                   // Machine identifier
  name: string;                 // User-defined server name
  sourceTitle: string;          // Owner username
  ownerId: string;
  owned: boolean;               // Does current user own this server?
  connections: PlexConnection[];
  capabilities: string[];
  preferredConnection: PlexConnection | null;
}

interface PlexConnection {
  uri: string;                  // Full URL (e.g., "http://192.168.1.5:32400")
  protocol: 'http' | 'https';
  address: string;
  port: number;
  local: boolean;               // Is this a LAN connection?
  relay: boolean;               // Is this a Plex relay?
  latencyMs: number | null;     // Measured latency (after testing)
}
```

### P7: Interface to Implement

```typescript
interface IPlexServerDiscovery {
  getAvailableServers(): Promise<PlexServer[]>;
  testConnection(uri: string): Promise<{ success: boolean; latencyMs: number }>;
  findBestConnection(server: PlexServer): Promise<PlexConnection | null>;
  selectServer(serverId: string): Promise<void>;
  getSelectedServer(): PlexServer | null;
  getActiveConnectionUri(): string | null;
  on(event: 'serverChange', handler: (server: PlexServer | null) => void): void;
}
```

### P7: API Endpoint

- GET [https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1](https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1)

### P7: Implementation Requirements

1. **Connection Testing Strategy**
   ```typescript
   // Order of preference:
   // 1. Local HTTPS (fast, secure)
   // 2. Local HTTP (fast, webOS may have mixed content issues)
   // 3. Remote HTTPS (slower, secure)
   // 4. Relay (limited bandwidth, last resort)
   
   async findBestConnection(server: PlexServer): Promise<PlexConnection | null> {
     // Sort connections by preference
     const sorted = sortByPreference(server.connections);
     
     // Test each in order, return first working
     for (const conn of sorted) {
       const result = await this.testConnection(conn.uri);
       if (result.success) {
         conn.latencyMs = result.latencyMs;
         return conn;
       }
     }
     return null;
   }
   ```

2. **Mixed Content Mitigation (CRITICAL for webOS)**
   ```typescript
   // webOS apps may be served over HTTPS
   // HTTP connections to LAN servers can fail due to mixed content
   // Mitigation strategies:
   
   testConnection(uri: string): Promise<{ success: boolean; latencyMs: number }> {
     // 1. Use HEAD request (smaller payload)
     // 2. Set short timeout (5 seconds)
     // 3. If HTTP fails and HTTPS available, prefer HTTPS
     // 4. Log failures for debugging
   }
   ```

3. **Connection Test Implementation**
   ```typescript
   async testConnection(uri: string): Promise<{ success: boolean; latencyMs: number }> {
     const start = performance.now();
     const controller = new AbortController();
     const timeoutId = setTimeout(() => controller.abort(), 5000);
     try {
       const response = await fetch(`${uri}/identity`, {
         method: 'HEAD',
         headers: this.auth.getAuthHeaders(),
         signal: controller.signal
       });
       const latencyMs = performance.now() - start;
       return { success: response.ok, latencyMs };
     } catch (error) {
       return { success: false, latencyMs: -1 };
     } finally {
       clearTimeout(timeoutId);
     }
   }
   ```

4. **Storage**
   - Persist selected server ID to localStorage
   - Key: 'retune_selected_server'

### P7: Error Handling

- Network timeout: 5 seconds per connection test
- All connections fail: Return null, let caller handle
- Server list empty: Return empty array

### P7: Test Specification

```typescript
describe('PlexServerDiscovery', () => {
  describe('getAvailableServers', () => {
    it('should fetch server list from plex.tv', async () => {
      mockFetch.mockResolvedValueOnce(mockServerListResponse);
      const servers = await discovery.getAvailableServers();
      expect(servers).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('plex.tv/api/v2/resources'),
        expect.any(Object)
      );
    });
  });
  
  describe('testConnection', () => {
    it('should return success and latency for working connection', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const result = await discovery.testConnection('http://192.168.1.5:32400');
      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThan(0);
    });
    
    it('should timeout after 5 seconds', async () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
      const result = await discovery.testConnection('http://192.168.1.5:32400');
      expect(result.success).toBe(false);
    });
  });
  
  describe('findBestConnection', () => {
    it('should prefer local HTTPS connections', async () => {
      const server = createServerWithConnections([
        { uri: 'http://192.168.1.5:32400', local: true },
        { uri: 'https://192.168.1.5:32400', local: true },
        { uri: 'https://relay.plex.direct', relay: true }
      ]);
      mockAllConnectionsSucceed();
      
      const best = await discovery.findBestConnection(server);
      expect(best && best.uri).toBe('https://192.168.1.5:32400');
    });
    
    it('should fall back to relay when direct fails', async () => {
      mockDirectConnectionsFail();
      mockRelaySucceeds();
      
      const best = await discovery.findBestConnection(server);
      expect(best && best.relay).toBe(true);
    });
  });
});
```

### P7: Deliverable

Complete implementation with:
- PlexServerDiscovery class
- ConnectionTester helper
- Server persistence
- Event emission for server changes
- JSDoc comments
```

---

## Prompt 8 (DEPRECATED): Plex Library Access Module (Priority 3)

> [!WARNING]
> Deprecated prompt. Use `## Prompt 9 (V2): Plex Library Module (Priority 3)` in this file as the canonical prompt.

````markdown
You are implementing the Plex Library Access module for Retune, a webOS TV application.

### P8: Task
Implement library enumeration, content retrieval, TV show hierarchy navigation, and image URL handling with authentication.

### P8: Files to Create

- src/modules/plex/library/index.ts
- src/modules/plex/library/PlexLibrary.ts
- src/modules/plex/library/interfaces.ts
- src/modules/plex/library/ContentParser.ts

### P8: Type Definitions (use exactly)

```typescript
interface PlexLibrary {
  id: string;
  uuid: string;
  title: string;
  type: 'movie' | 'show' | 'artist' | 'photo';
  agent: string;
  scanner: string;
  contentCount: number;
  lastScannedAt: Date;
  art: string | null;
  thumb: string | null;
}

interface PlexMediaItem {
  ratingKey: string;
  key: string;
  type: 'movie' | 'episode' | 'track' | 'clip';
  title: string;
  sortTitle: string;
  summary: string;
  year: number;
  durationMs: number;
  addedAt: Date;
  updatedAt: Date;
  thumb: string | null;
  art: string | null;
  rating?: number;
  contentRating?: string;
  grandparentTitle?: string;  // Show name for episodes
  parentTitle?: string;       // Season name for episodes
  seasonNumber?: number;
  episodeNumber?: number;
  viewOffset?: number;
  viewCount?: number;
  media: PlexMediaFile[];
}

interface LibraryQueryOptions {
  sort?: string;              // e.g., "titleSort:asc"
  filter?: Record<string, string | number>;
  offset?: number;
  limit?: number;
  includeCollections?: boolean;
}

interface SearchOptions {
  limit?: number;
  sectionType?: 'movie' | 'show' | 'artist' | 'photo';
}
```

### P8: Interface to Implement
```typescript
interface IPlexLibrary {
  getLibraries(): Promise<PlexLibrary[]>;
  getLibrary(libraryId: string): Promise<PlexLibrary>;
  getLibraryItems(libraryId: string, options?: LibraryQueryOptions): Promise<PlexMediaItem[]>;
  getItem(ratingKey: string): Promise<PlexMediaItem>;
  getSeasons(showRatingKey: string): Promise<PlexSeason[]>;
  getEpisodes(seasonRatingKey: string): Promise<PlexMediaItem[]>;
  getShowEpisodes(showRatingKey: string): Promise<PlexMediaItem[]>;
  search(query: string, options?: SearchOptions): Promise<PlexMediaItem[]>;
  getCollections(libraryId: string): Promise<PlexCollection[]>;
  getCollectionItems(collectionKey: string): Promise<PlexMediaItem[]>;
  getPlaylists(): Promise<PlexPlaylist[]>;
  getPlaylistItems(playlistKey: string): Promise<PlexMediaItem[]>;
  getImageUrl(imagePath: string, width?: number, height?: number): string;
}
```

### P8: API Endpoints

- Libraries: GET /library/sections
- Library Items: GET /library/sections/{id}/all
- Item Details: GET /library/metadata/{ratingKey}
- Show Seasons: GET /library/metadata/{ratingKey}/children
- Season Episodes: GET /library/metadata/{ratingKey}/children
- Collections: GET /library/sections/{id}/collections
- Search: GET /hubs/search?query={query}

### P8: Implementation Requirements

1. **Pagination Handling**
   ```typescript
   async getLibraryItems(
     libraryId: string, 
     options: LibraryQueryOptions = {}
   ): Promise<PlexMediaItem[]> {
     const limit = options.limit || 100;
     const offset = options.offset || 0;
     
     const url = `${this.serverUri}/library/sections/${libraryId}/all`;
     const params = new URLSearchParams({
       'X-Plex-Container-Start': offset.toString(),
       'X-Plex-Container-Size': limit.toString(),
     });
     
     if (options.sort) params.append('sort', options.sort);
     
     const response = await this.fetch(`${url}?${params}`);
     return this.parseMediaItems(response.MediaContainer.Metadata || []);
   }
   ```

2. **Image URL with Token Injection**
   ```typescript
   getImageUrl(imagePath: string, width?: number, height?: number): string {
     if (!imagePath) return '';
     
     const serverUri = this.discovery.getActiveConnectionUri();
     const user = this.auth.getCurrentUser();
     const token = user ? user.token : undefined;
     
     let url = `${serverUri}${imagePath}`;
     const params = new URLSearchParams();
     
     if (width) params.append('width', width.toString());
     if (height) params.append('height', height.toString());
     if (token) params.append('X-Plex-Token', token);
     
     return `${url}?${params}`;
   }
   ```

3. **TV Show Hierarchy**
   ```typescript
   async getShowEpisodes(showRatingKey: string): Promise<PlexMediaItem[]> {
     const seasons = await this.getSeasons(showRatingKey);
     const episodePromises = seasons.map(s => this.getEpisodes(s.ratingKey));
     const episodeArrays = await Promise.all(episodePromises);
     return episodeArrays.reduce((acc, arr) => acc.concat(arr), [] as PlexMediaItem[]);
   }
   ```

4. **Response Parsing**
   - Plex returns XML or JSON based on Accept header
   - Always request JSON with 'Accept: application/json'
   - Parse dates from Unix timestamps
   - Convert durations to milliseconds

### P8: Error Handling

| Error | Code | Recovery |
|-------|------|----------|
| Library not found | 404 | Return empty / throw |
| Rate limited | 429 | Wait and retry |
| Server offline | Network error | Notify user |

### P8: Deliverable

Complete implementation with:
- PlexLibrary class with all methods
- ContentParser for response transformation
- Image URL generation with auth
- Error handling for all operations
- JSDoc comments
```

---

## Prompt 9 (DEPRECATED): Channel Manager Module (Priority 4)

> [!WARNING]
> Deprecated prompt. Use `## Prompt 11 (V2): Channel Manager Module (Priority 4)` in this file as the canonical prompt.

````markdown
You are implementing the Channel Manager module for Retune, a webOS TV application.

### P9: Task
Implement channel CRUD operations, content resolution from Plex sources, and localStorage persistence.

### P9: Files to Create

- src/modules/scheduler/channel-manager/index.ts
- src/modules/scheduler/channel-manager/ChannelManager.ts
- src/modules/scheduler/channel-manager/ContentResolver.ts
- src/modules/scheduler/channel-manager/interfaces.ts
- src/modules/scheduler/channel-manager/StorageManager.ts

### P9: Type Definitions (use exactly)

```typescript
interface ChannelConfig {
  id: string;                   // UUID
  number: number;               // Display channel number (1-999)
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  contentSource: ChannelContentSource;
  playbackMode: 'sequential' | 'shuffle' | 'random';
  shuffleSeed?: number;
  startTimeAnchor: number;     // Unix timestamp (ms)
  contentFilters?: ContentFilter[];
  sortOrder?: SortOrder;
  skipIntros: boolean;
  skipCredits: boolean;
  maxEpisodeRunTimeMs?: number;
  minEpisodeRunTimeMs?: number;
  createdAt: number;
  updatedAt: number;
  lastContentRefresh: number;
  itemCount: number;
  totalDurationMs: number;
}

type ChannelContentSource = 
  | { type: 'library'; libraryId: string; libraryType: string; includeWatched: boolean }
  | { type: 'collection'; collectionKey: string; collectionName: string }
  | { type: 'show'; showKey: string; showName: string; seasonFilter?: number[] }
  | { type: 'playlist'; playlistKey: string; playlistName: string }
  | { type: 'manual'; items: { ratingKey: string; title: string; durationMs: number }[] }
  | { type: 'mixed'; sources: ChannelContentSource[]; mixMode: 'interleave' | 'sequential' };

interface ResolvedChannelContent {
  channelId: string;
  resolvedAt: number;
  items: ResolvedContentItem[];
  totalDurationMs: number;
  orderedItems: ResolvedContentItem[];
}
```

### P9: Interface to Implement

```typescript
interface IChannelManager {
  // CRUD
  createChannel(config: Omit<ChannelConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<ChannelConfig>;
  updateChannel(channelId: string, updates: Partial<ChannelConfig>): Promise<ChannelConfig>;
  deleteChannel(channelId: string): Promise<void>;
  duplicateChannel(channelId: string): Promise<ChannelConfig>;
  
  // Retrieval
  getChannel(channelId: string): ChannelConfig | null;
  getAllChannels(): ChannelConfig[];
  getChannelByNumber(number: number): ChannelConfig | null;
  
  // Content Resolution
  resolveChannelContent(channelId: string, forceRefresh?: boolean): Promise<ResolvedChannelContent>;
  refreshAllChannelContent(): Promise<void>;
  
  // Channel Navigation  
  getCurrentChannel(): ChannelConfig | null;
  switchToChannel(channelId: string): Promise<void>;
  nextChannel(): Promise<void>;
  previousChannel(): Promise<void>;
  
  // Persistence
  exportChannels(): string;
  importChannels(json: string): Promise<ImportResult>;
  
  // Events
  on(event: 'channelCreated', handler: (channel: ChannelConfig) => void): void;
  on(event: 'channelUpdated', handler: (channel: ChannelConfig) => void): void;
  on(event: 'channelDeleted', handler: (channelId: string) => void): void;
  on(event: 'channelSwitch', handler: (channel: ChannelConfig) => void): void;
  on(event: 'contentResolved', handler: (content: ResolvedChannelContent) => void): void;
}
```

### P9: Implementation Requirements

1. **Content Resolution by Source Type**
   ```typescript
   async resolveContent(source: ChannelContentSource): Promise<PlexMediaItem[]> {
     switch (source.type) {
       case 'library':
         return this.plexLibrary.getLibraryItems(source.libraryId, {
           filter: source.includeWatched ? undefined : { unwatched: true }
         });
       case 'collection':
         return this.plexLibrary.getCollectionItems(source.collectionKey);
       case 'show':
         const episodes = await this.plexLibrary.getShowEpisodes(source.showKey);
         if (source.seasonFilter) {
           return episodes.filter(e => source.seasonFilter!.includes(e.seasonNumber!));
         }
         return episodes;
       case 'playlist':
         return this.plexLibrary.getPlaylistItems(source.playlistKey);
       case 'manual':
         return Promise.all(source.items.map(i => this.plexLibrary.getItem(i.ratingKey)));
       case 'mixed':
         return this.resolveMixed(source);
     }
   }
   ```

2. **Filter Application**
   ```typescript
   applyFilters(items: PlexMediaItem[], filters: ContentFilter[]): PlexMediaItem[] {
     return items.filter(item => {
       return filters.every(filter => {
         const value = item[filter.field as keyof PlexMediaItem];
         switch (filter.operator) {
           case 'eq': return value === filter.value;
           case 'gt': return (value as number) > (filter.value as number);
           case 'contains': return String(value).includes(String(filter.value));
           // ... other operators
         }
       });
     });
   }
   ```

3. **Storage with Compression (5MB limit)**
   ```typescript
   private saveChannels(): void {
     const data = {
       version: 1,
       channels: this.channels,
       currentIndex: this.currentChannelIndex
     };
     
     try {
       localStorage.setItem('retune_channels', JSON.stringify(data));
     } catch (e) {
       // Handle quota exceeded - remove oldest channel content caches
       this.pruneContentCaches();
       localStorage.setItem('retune_channels', JSON.stringify(data));
     }
   }
   ```

4. **Error Handling (CRITICAL)**
   ```typescript
   async resolveChannelContent(channelId: string): Promise<ResolvedChannelContent> {
     const channel = this.getChannel(channelId);
     if (!channel) throw new Error(`Channel ${channelId} not found`);
     
     try {
       const items = await this.resolveContent(channel.contentSource);
       
       // Handle missing content gracefully
       const validItems = items.filter(item => item && item.durationMs > 0);
       
       if (validItems.length === 0) {
         throw new Error('CHANNEL_EMPTY: No playable content found');
       }
       
       return this.buildResolvedContent(channelId, validItems);
     } catch (error) {
       // Check if we have cached content
       const cached = this.contentCache.get(channelId);
       if (cached) {
         console.warn(`Using cached content for ${channelId}:`, error);
         return cached;
       }
       throw error;
     }
   }
   ```

### P9: Error Handling Matrix

| Scenario | Error Code | Recovery Strategy |
|----------|------------|-------------------|
| Channel not found | CHANNEL_NOT_FOUND | Return null |
| Plex server offline | NETWORK_ERROR | Use cached content if available |
| Library deleted in Plex | CONTENT_UNAVAILABLE | Filter out, log warning |
| No content after filters | CHANNEL_EMPTY | Notify user, suggest adjusting filters |
| Storage quota exceeded | STORAGE_FULL | Prune old caches, retry |
| Invalid import JSON | IMPORT_INVALID | Return with errors array |

### P9: Deliverable

Complete implementation with:
- ChannelManager class
- ContentResolver for all source types
- StorageManager with quota handling
- Filter application
- Error handling with fallbacks
- Event emission
- JSDoc comments
```

---

## Prompt 10 (DEPRECATED): Application Lifecycle Module (Priority 1)

> [!WARNING]
> Deprecated prompt. Use `## Prompt 12: App Lifecycle Module (Priority 1)` in this file as the canonical prompt.

````markdown
You are implementing the Application Lifecycle module for Retune, a webOS TV application.

### P10: Task
Manage webOS app lifecycle events, state persistence, network monitoring, memory management, and error recovery strategies.

### P10: Files to Create
- src/modules/lifecycle/index.ts
- src/modules/lifecycle/AppLifecycle.ts  
- src/modules/lifecycle/ErrorRecovery.ts
- src/modules/lifecycle/StateManager.ts
- src/modules/lifecycle/interfaces.ts

### P10: Type Definitions (DEPRECATED — do not copy)

Use canonical types from `spec-pack/artifact-2-shared-types.ts`:
- `AppPhase`
- `ConnectionStatus`
- `PersistentState`
- `AppErrorCode` + `LifecycleAppError`
- `Result<T, E>` for fallible module methods

### P10: Interface to Implement
```typescript
interface IAppLifecycle {
  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  
  // Phase management
  setPhase(phase: AppPhase): void;
  getPhase(): AppPhase;
  
  // Visibility
  onPause(callback: () => void): void;
  onResume(callback: () => void): void;
  onTerminate(callback: () => Promise<void>): void;
  
  // Network
  isNetworkAvailable(): boolean;
  getPlexConnectionStatus(): ConnectionStatus;
  
  // State
  saveState(): Promise<void>;
  restoreState(): Promise<PersistentState | null>;
  getState(): AppLifecycleState;
  
  // Memory
  getMemoryUsage(): { usedMB: number; limitMB: number };
  requestGarbageCollection(): void;
  
  // Errors
  handleError(error: LifecycleAppError): void;
  getCurrentError(): LifecycleAppError | null;
  clearError(): void;
  
  // Events
  on(event: 'phaseChange', handler: (data: { from: AppPhase; to: AppPhase }) => void): void;
  on(event: 'visibilityChange', handler: (data: { isVisible: boolean }) => void): void;
  on(event: 'networkChange', handler: (data: { isAvailable: boolean }) => void): void;
  on(event: 'error', handler: (error: LifecycleAppError) => void): void;
}
```

### P10: webOS Lifecycle Events
```typescript
// webOS provides these events:
document.addEventListener('webOSLaunch', (event) => {
  // App launched, event.detail contains launch params
});

document.addEventListener('webOSRelaunch', (event) => {
  // App relaunched while already running
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // App backgrounded
  } else {
    // App foregrounded
  }
});

// Network status via webOS API:
if (window.webOS) {
  webOS.service.request('luna://com.webos.service.connectionmanager', {
    method: 'getStatus',
    onSuccess: (result) => { /* result.isInternetConnectionAvailable */ },
    onFailure: (error) => { /* handle */ }
  });
}
```

### P10: Implementation Requirements

1. **State Persistence**
   ```typescript
   async saveState(): Promise<void> {
     const state: PersistentState = {
       version: 1,
       plexAuth: this.plexAuth.getStoredCredentials(),
       channelConfigs: this.channelManager.getAllChannels(),
       currentChannelIndex: this.channelManager.getCurrentChannelIndex(),
       userPreferences: this.preferences,
       lastUpdated: Date.now()
     };
     
     localStorage.setItem('retune_app_state', JSON.stringify(state));
   }
   ```

2. **Memory Monitoring (300MB limit for webOS)**
   ```typescript
   getMemoryUsage(): { usedMB: number; limitMB: number } {
     if (performance.memory) {
       return {
         usedMB: performance.memory.usedJSHeapSize / (1024 * 1024),
         limitMB: 300
       };
     }
     return { usedMB: 0, limitMB: 300 };
   }
   
   startMemoryMonitor(): void {
     setInterval(() => {
       const { usedMB, limitMB } = this.getMemoryUsage();
       if (usedMB / limitMB > 0.8) {
         console.warn(`Memory warning: ${usedMB.toFixed(1)}MB of ${limitMB}MB`);
         this.requestGarbageCollection();
       }
     }, 30000);
   }
   ```

3. **Error Recovery Strategies**
   ```typescript
   class ErrorRecovery implements IErrorRecovery {
     getRecoveryActions(errorCode: AppErrorCode): ErrorRecoveryAction[] {
       switch (errorCode) {
         case AppErrorCode.AUTH_EXPIRED:
           return [
             { label: 'Sign In Again', action: () => this.nav.goTo('auth'), isPrimary: true, requiresNetwork: true }
           ];
         case AppErrorCode.NETWORK_OFFLINE:
           return [
             { label: 'Retry', action: () => this.retryConnection(), isPrimary: true, requiresNetwork: true },
             { label: 'Use Offline', action: () => this.useOfflineMode(), isPrimary: false, requiresNetwork: false }
           ];
         case AppErrorCode.PLEX_UNREACHABLE:
           return [
             { label: 'Retry Connection', action: () => this.retryPlex(), isPrimary: true, requiresNetwork: true },
             { label: 'Change Server', action: () => this.nav.goTo('server-select'), isPrimary: false, requiresNetwork: true }
           ];
         case AppErrorCode.PLAYBACK_FAILED:
           return [
             { label: 'Skip', action: () => this.scheduler.skipToNext(), isPrimary: true, requiresNetwork: false },
             { label: 'Try Again', action: () => this.player.retry(), isPrimary: false, requiresNetwork: true }
           ];
         default:
           return [
             { label: 'Restart App', action: () => location.reload(), isPrimary: true, requiresNetwork: false }
           ];
       }
     }
   }
   ```

4. **Visibility Change Handling**
   ```typescript
   setupVisibilityHandling(): void {
     document.addEventListener('visibilitychange', () => {
       if (document.hidden) {
         // Going to background
         this.setPhase('backgrounded');
         this.pauseCallbacks.forEach(cb => cb());
         this.saveState();
       } else {
         // Returning to foreground
         this.setPhase('resuming');
         this.checkIfStale();
         this.resumeCallbacks.forEach(cb => cb());
       }
     });
   }
   
   checkIfStale(): void {
     const staleThreshold = 30 * 60 * 1000; // 30 minutes
     const elapsed = Date.now() - this.lastActiveTime;
     if (elapsed > staleThreshold) {
       // Data may be stale, refresh
       this.emit('staleData', {});
     }
   }
   ```

### P10: Deliverable

Complete implementation with:
- AppLifecycle class managing phases
- StateManager for persistence
- ErrorRecovery with action strategies
- webOS lifecycle event integration
- Memory monitoring
- Network monitoring
- Event emission
- JSDoc comments
```

---

## Prompt 11 (DEPRECATED): Application Orchestrator Module (Priority 7)

> [!WARNING]
> Deprecated prompt. Use `## Prompt 13: App Orchestrator Module (Priority 7)` in this file as the canonical prompt.

````markdown
You are implementing the Application Orchestrator module for Retune, a webOS TV application.

### P11: Task
Coordinate all modules, handle initialization sequence, set up inter-module event bindings, and manage the main application flow.

### P11: Files to Create

- src/Orchestrator.ts
- src/App.ts
- src/index.ts (entry point)

### P11: Type Definitions
```typescript
interface ModuleStatus {
  name: string;
  initialized: boolean;
  healthy: boolean;
  lastError?: string;
}

interface OrchestratorConfig {
  plexConfig: PlexAuthConfig;
  playerConfig: VideoPlayerConfig;
  navConfig: NavigationConfig;
  epgConfig: EPGConfig;
}
```

### P11: Interface to Implement
```typescript
interface IAppOrchestrator {
  initialize(config: OrchestratorConfig): Promise<void>;
  shutdown(): Promise<void>;
  getModuleStatus(): ModuleStatus[];
  isReady(): boolean;
}
```

### P11: Initialization Sequence (CRITICAL ORDER)
```typescript
async initialize(config: OrchestratorConfig): Promise<void> {
  try {
    // Phase 1: Foundation (no dependencies)
    this.lifecycle = new AppLifecycle();
    await this.lifecycle.initialize();
    this.lifecycle.setPhase('initializing');
    
    this.navigation = new NavigationManager();
    this.navigation.initialize(config.navConfig);
    
    // Phase 2: Authentication
    this.lifecycle.setPhase('authenticating');
    this.plexAuth = new PlexAuth(config.plexConfig);
    const storedAuth = await this.plexAuth.getStoredCredentials();
    
    if (!storedAuth) {
      this.navigation.goTo('auth');
      return; // Wait for user to authenticate
    }
    
    // Phase 3: Server Discovery
    this.discovery = new PlexServerDiscovery(this.plexAuth);
    const servers = await this.discovery.getAvailableServers();
    
    if (!this.discovery.getSelectedServer()) {
      this.navigation.goTo('server-select');
      return;
    }
    
    // Phase 4: Content Loading
    this.lifecycle.setPhase('loading_data');
    this.plexLibrary = new PlexLibrary(this.plexAuth, this.discovery);
    this.streamResolver = new PlexStreamResolver(this.plexAuth, this.discovery);
    this.channelManager = new ChannelManager(this.plexLibrary);
    await this.channelManager.loadChannels();
    
    // Phase 5: Playback Setup
    this.scheduler = new ChannelScheduler();
    this.player = new VideoPlayer();
    await this.player.initialize(config.playerConfig);
    
    // Phase 6: UI Setup  
    this.epg = new EPGComponent();
    this.epg.initialize(config.epgConfig);
    
    // Phase 7: Wire up events
    this.setupEventBindings();
    
    // Phase 8: Start playback
    this.lifecycle.setPhase('ready');
    if (this.channelManager.getAllChannels().length > 0) {
      await this.startPlayback();
      this.navigation.goTo('player');
    } else {
      this.navigation.goTo('channel-edit');
    }
  } catch (error) {
    this.lifecycle.handleError(this.createAppError(error));
  }
}
```

### P11: Event Binding Setup (CRITICAL)
```typescript
setupEventBindings(): void {
  // Scheduler → Player
  this.scheduler.on('programStart', async (program) => {
    const stream = await this.resolveStreamForProgram(program);
    await this.player.loadStream(stream);
    await this.player.seekTo(program.elapsedMs);
    await this.player.play();
  });
  
  this.scheduler.on('programEnd', (program) => {
    this.streamResolver.reportPlaybackStop(
      program.sessionId,
      program.item.ratingKey,
      program.item.durationMs
    );
  });
  
  // Player → Scheduler (error recovery)
  this.player.on('error', (error) => {
    if (!error.recoverable) {
      this.scheduler.skipToNext();
    }
  });
  
  this.player.on('ended', () => {
    // Shouldn't happen in linear mode
    this.scheduler.skipToNext();
  });
  
  // Navigation events
  this.navigation.on('keyPress', (event) => {
    switch (event.button) {
      case 'channelUp':
        this.channelManager.nextChannel();
        break;
      case 'channelDown':
        this.channelManager.previousChannel();
        break;
      case 'guide':
        this.epg.toggle();
        break;
      case 'info':
        this.showInfoOverlay();
        break;
    }
  });
  
  // Channel changes
  this.channelManager.on('channelSwitch', async (channel) => {
    const content = await this.channelManager.resolveChannelContent(channel.id);
    this.scheduler.loadChannel({
      channelId: channel.id,
      anchorTime: channel.startTimeAnchor,
      content: content.orderedItems,
      playbackMode: channel.playbackMode,
      shuffleSeed: channel.shuffleSeed || Date.now(),
      loopSchedule: true
    });
    this.scheduler.syncToCurrentTime();
  });
  
  // EPG events
  this.epg.on('channelSelected', ({ channel }) => {
    this.channelManager.switchToChannel(channel.id);
    this.epg.hide();
  });
  
  // Lifecycle events
  this.lifecycle.onPause(() => {
    this.player.pause();
    this.lifecycle.saveState();
  });
  
  this.lifecycle.onResume(() => {
    this.scheduler.syncToCurrentTime();
    this.player.play();
  });
  
  // Auth changes
  this.plexAuth.on('authChange', (isAuthenticated) => {
    if (!isAuthenticated) {
      this.navigation.goTo('auth');
    }
  });
}
```

### P11: Stream Resolution Helper
```typescript
async resolveStreamForProgram(program: ScheduledProgram): Promise<StreamDescriptor> {
  const request: StreamRequest = {
    itemKey: program.item.ratingKey,
    startOffsetMs: program.elapsedMs,
    directPlay: true
  };
  
  const decision = await this.streamResolver.resolveStream(request);
  
  return {
    url: decision.playbackUrl,
    protocol: decision.protocol,
    mimeType: this.getMimeType(decision),
    startPositionMs: program.elapsedMs,
    mediaMetadata: {
      title: program.item.fullTitle,
      plexRatingKey: program.item.ratingKey
    },
    subtitleTracks: this.extractSubtitleTracks(decision),
    audioTracks: this.extractAudioTracks(decision),
    durationMs: program.item.durationMs,
    isLive: false
  };
}
```

### P11: Deliverable
Complete implementation with:
- Orchestrator class with full initialization sequence
- Event binding for all module interactions
- Error handling throughout
- App.ts main application class
- index.ts entry point
- JSDoc comments
```

---

## Usage Instructions for AI Agents

1. **Read the prompt completely** before starting implementation
2. **Use exact type definitions** provided - do not modify
3. **Follow interface contracts** precisely
4. **Include all required files** in your output
5. **Add JSDoc comments** to all public methods
6. **Handle errors gracefully** - never throw uncaught
7. **Test mentally** - trace through common use cases
8. **Target Chromium 68** - avoid modern JS features not available

### Verification Commands (Run After Implementation)

```bash
# Type checking - MUST pass with zero errors
npx tsc --noEmit

# Linting (if configured)
npm run lint --if-present

# Unit tests for the module
npm test -- --grep "<ModuleName>"

# Full test suite
npm test

# Build verification
npm run build
```

> [!IMPORTANT]
> **Error Message Reference**: See `supplements/error-messages.ts` for exact user-facing error strings.
> **Platform Constraints**: See `artifact-12-platform-constraints.md` for webOS-specific limitations.
> **Shared Types**: Import types from `artifact-2-shared-types.ts` - inlined types here are for reference.

## Module Implementation Order

1. EventEmitter (utility, no dependencies)
2. Navigation (foundational, needs EventEmitter)
3. PlexAuth (foundational, needs EventEmitter)
4. PlexServerDiscovery (needs PlexAuth)
5. PlexLibrary (needs PlexAuth, Discovery)
6. PlexStreamResolver (needs PlexAuth)
7. ChannelManager (needs PlexLibrary)
8. ChannelScheduler (needs ChannelManager)
9. VideoPlayer (needs EventEmitter)
10. EPGComponent (needs Scheduler, Navigation)
11. AppLifecycle (foundational)
12. Orchestrator (integrates all)

---

## Common Pitfalls to Avoid

> [!CAUTION]
> These are the most frequent issues encountered during implementation.

### 1. TypeScript Strict Mode Violations

```typescript
// ❌ WRONG: Implicit any
function process(data) { return data.value; }

// ✅ CORRECT: Explicit types
function process(data: { value: string }): string { return data.value; }
```

### 2. Async/Await Missing Error Handling

```typescript
// ❌ WRONG: Unhandled rejection
async function load() {
  const data = await fetch('/api');
}

// ✅ CORRECT: Try/catch
async function load() {
  try {
    const data = await fetch('/api');
  } catch (error) {
    console.error('Load failed:', error);
    // Prefer returning a Result<T, AppError> from module methods instead of throwing.
    throw new Error('Load failed');
  }
}
```

### 3. Event Listener Memory Leaks

```typescript
// ❌ WRONG: No cleanup
initialize() {
  window.addEventListener('resize', this.handleResize);
}

// ✅ CORRECT: With cleanup
initialize() {
  window.addEventListener('resize', this.handleResize);
}
destroy() {
  window.removeEventListener('resize', this.handleResize);
}
```

### 4. Chromium 68 Compatibility

```typescript
// ❌ WRONG: Using ES2020 optional chaining in shipped code
// (Example omitted to avoid copy/paste drift)

// ✅ CORRECT: Explicit checks
const name = user && user.profile ? user.profile.name : undefined;
```

### 5. Video Element Race Conditions

```typescript
// ❌ WRONG: Assume ready
video.src = url;
video.play(); // May fail if not loaded

// ✅ CORRECT: Wait for canplay
video.src = url;
await new Promise(resolve => {
  video.addEventListener('canplay', resolve, { once: true });
});
video.play();
```

---

## Module Versioning (Semver)

Each module should declare its version in its main export file:

```typescript
// src/modules/example/index.ts
export const MODULE_VERSION = '1.0.0';

// Version bump rules:
// - MAJOR: Breaking interface changes
// - MINOR: New features, backward compatible
// - PATCH: Bug fixes
```

---

## Mock Factory Patterns

Centralized mock creation for consistent testing:

```typescript
// __mocks__/factories.ts
export function createMockChannel(overrides?: Partial<ChannelConfig>): ChannelConfig {
  return {
    id: 'mock-channel-1',
    number: 1,
    name: 'Test Channel',
    contentSource: { type: 'library', libraryId: 'lib-1', libraryType: 'movie', includeWatched: true },
    playbackMode: 'sequential',
    startTimeAnchor: Date.now(),
    skipIntros: false,
    skipCredits: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastContentRefresh: Date.now(),
    itemCount: 10,
    totalDurationMs: 3600000,
    ...overrides
  };
}

export function createMockProgram(overrides?: Partial<ScheduledProgram>): ScheduledProgram {
  return {
    item: createMockMediaItem(),
    scheduledStartTime: Date.now(),
    scheduledEndTime: Date.now() + 3600000,
    elapsedMs: 0,
    remainingMs: 3600000,
    isCurrent: true,
    loopNumber: 0,
    ...overrides
  };
}
```

---

## CI/CD Workflow (Suggested)

```yaml
# .github/workflows/retune.yml
name: Retune CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Type check
        run: npx tsc --noEmit
      
      - name: Lint
        run: npm run lint
      
      - name: Unit tests
        run: npm test -- --coverage
      
      - name: Build
        run: npm run build
      
      - name: Upload build
        uses: actions/upload-artifact@v4
        with:
          name: webos-app
          path: dist/

  test-integration:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:integration
```

---

## E2E Testing with webOS Simulator

### Setup

1. Install LG webOS TV Simulator from [webOS Developer Site](https://webostv.developer.lge.com/develop/tools/simulator-installation)
2. Configure simulator path in `jest.config.js`
3. Run with `npm run test:e2e`

### Example E2E Test

```typescript
// e2e/channel-switching.e2e.ts
describe('E2E: Channel Switching', () => {
  beforeAll(async () => {
    await simulator.launch();
    await simulator.installApp('./dist/retune.ipk');
    await simulator.launchApp('com.retune.app');
  });

  afterAll(async () => {
    await simulator.closeApp();
  });

  it('should switch channels with remote', async () => {
    // Send channel up key
    await simulator.pressKey('channelUp');
    
    // Wait for channel banner
    await simulator.waitForElement('.channel-banner');
    
    // Verify channel number changed
    const channelNumber = await simulator.getText('.channel-number');
    expect(parseInt(channelNumber)).toBeGreaterThan(1);
  });
});
```

> [!NOTE]
> E2E tests require the webOS Simulator installed locally and are not run in CI by default.

---

## Prompt 8 (V2): Plex Server Discovery Module (Priority 2)

````markdown
You are implementing the Plex Server Discovery module for Retune, a webOS TV application.

### P8-V2: Task
Discover and manage Plex Media Servers accessible to the authenticated user, testing connections to find the fastest route.

### P8-V2: Files to Create
- src/modules/plex/discovery/index.ts
- src/modules/plex/discovery/PlexServerDiscovery.ts
- src/modules/plex/discovery/interfaces.ts
- src/modules/plex/discovery/types.ts
- src/modules/plex/discovery/constants.ts
- src/modules/plex/discovery/__tests__/PlexServerDiscovery.test.ts

### P8-V2: Type Definitions

```typescript
interface PlexServer {
  id: string;                    // Machine identifier
  name: string;                  // Display name
  sourceTitle: string;           // Owner username
  ownerId: string;
  owned: boolean;
  capabilities: string[];
  connections: PlexConnection[];
  preferredConnection: PlexConnection | null;
}

interface PlexConnection {
  uri: string;                   // Full URI (https://192.168.1.5:32400)
  protocol: 'http' | 'https';
  address: string;
  port: number;
  local: boolean;                // LAN connection
  relay: boolean;                // Via Plex relay
  latencyMs: number | null;      // Measured latency
}

interface IPlexServerDiscovery {
  discoverServers(): Promise<PlexServer[]>;
  refreshServers(): Promise<PlexServer[]>;
  testConnection(server: PlexServer, connection: PlexConnection): Promise<number | null>;
  findFastestConnection(server: PlexServer): Promise<PlexConnection | null>;
  selectServer(serverId: string): Promise<boolean>;
  getSelectedServer(): PlexServer | null;
  getSelectedConnection(): PlexConnection | null;
  getServerUri(): string | null;
  getServers(): PlexServer[];
  isConnected(): boolean;
  on(event: 'serverChange', handler: (server: PlexServer | null) => void): void;
  on(event: 'connectionChange', handler: (uri: string | null) => void): void;
}
```

### P8-V2: API Endpoints
- Server Discovery: GET <https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1>
- Connection Test: GET {connection.uri}/identity

### P8-V2: Implementation Requirements

1. **discoverServers()**:
 Fetch servers from plex.tv, filter for 'server' capability
2. **testConnection()**: Test with 5-second timeout, return latency in ms or null
3. **findFastestConnection()**: Priority order: local > remote > relay
4. **selectServer()**: Persist selection to localStorage key 'retune_selected_server'
5. Restore selection on initialization

### P8-V2: Error Handling
| Error | Recovery |
|-------|----------|
| Network timeout | Return null latency, try next connection |
| 401 Unauthorized | Emit 'connectionChange' with null, trigger re-auth |
| All connections fail | Return null from findFastestConnection |

### P8-V2: Test Specifications
```typescript
describe('PlexServerDiscovery', () => {
  describe('discoverServers', () => {
    it('should fetch servers from plex.tv API');
    it('should parse server connections correctly');
    it('should handle empty server list');
    it('should handle network errors gracefully');
  });
  
  describe('testConnection', () => {
    it('should return latency for working connection');
    it('should return null for failed connection');
    it('should timeout after 5 seconds');
  });
  
  describe('findFastestConnection', () => {
    it('should prefer local over remote connections');
    it('should prefer remote over relay connections');
    it('should fall back to relay when others fail');
    it('should return null when all connections fail');
  });
  
  describe('selectServer', () => {
    it('should persist selection to localStorage');
    it('should emit serverChange event');
    it('should emit connectionChange event');
    it('should return false for unknown server ID');
  });
  
  describe('initialization', () => {
    it('should restore selected server from localStorage');
    it('should re-test connection on restore');
  });
});
```

### P8-V2: Mock Requirements
- Mock `fetch` for API calls
- Mock `localStorage` for persistence
- Mock `AbortController` for timeouts

### P8-V2: Deliverable
Complete implementation with full test coverage and JSDoc comments.

````

---

## Prompt 9 (V2): Plex Library Module (Priority 3)

````markdown
You are implementing the Plex Library module for Retune, a webOS TV application.

### P9-V2: Task
Browse media libraries on a Plex server, fetch content metadata, and provide search functionality.

### P9-V2: Files to Create
- src/modules/plex/library/index.ts
- src/modules/plex/library/PlexLibrary.ts
- src/modules/plex/library/interfaces.ts
- src/modules/plex/library/types.ts
- src/modules/plex/library/__tests__/PlexLibrary.test.ts

### P9-V2: Type Definitions

```typescript
interface PlexLibrary {
  key: string;                   // Library ID
  title: string;                 // Display name
  type: 'movie' | 'show' | 'music' | 'photo';
  scanner: string;
  agent: string;
  itemCount: number;
  uuid: string;
}

interface PlexMediaItem {
  ratingKey: string;             // Unique ID
  key: string;                   // API path
  type: 'movie' | 'episode' | 'track';
  title: string;
  parentTitle?: string;          // Show/album title
  grandparentTitle?: string;     // For episodes
  summary: string;
  duration: number;              // Milliseconds
  year?: number;
  thumb?: string;
  art?: string;
  addedAt: number;
  originallyAvailableAt?: string;
}

interface IPlexLibrary {
  // Library Sections
  getLibraries(): Promise<PlexLibrary[]>;
  getLibrary(libraryId: string): Promise<PlexLibrary | null>;

  // Content Browsing
  getLibraryItems(libraryId: string, options?: LibraryQueryOptions): Promise<PlexMediaItem[]>;
  getItem(ratingKey: string): Promise<PlexMediaItem | null>;

  // TV Show Hierarchy
  getShows(libraryId: string): Promise<PlexMediaItem[]>;
  getShowSeasons(showKey: string): Promise<PlexSeason[]>;
  getSeasonEpisodes(seasonKey: string): Promise<PlexMediaItem[]>;
  getShowEpisodes(showKey: string): Promise<PlexMediaItem[]>;

  // Collections/Playlists
  getCollections(libraryId: string): Promise<PlexCollection[]>;
  getCollectionItems(collectionKey: string): Promise<PlexMediaItem[]>;
  getPlaylists(): Promise<PlexPlaylist[]>;
  getPlaylistItems(playlistKey: string): Promise<PlexMediaItem[]>;

  // Search
  search(query: string, options?: SearchOptions): Promise<PlexMediaItem[]>;

  // Image URLs
  getImageUrl(imagePath: string, width?: number, height?: number): string;

  // Refresh
  refreshLibrary(libraryId: string): Promise<void>;
}

interface BrowseOptions {
  offset?: number;
  limit?: number;
  sort?: string;
  filter?: Record<string, string>;
}

interface SearchOptions {
  libraryKey?: string;
  types?: Array<'movie' | 'show' | 'episode'>;
  limit?: number;
}
```

### P9-V2: API Endpoints
- Libraries: GET /library/sections
- Library Items: GET /library/sections/{key}/all
- Collections: GET /library/sections/{key}/collections
- Item Metadata: GET /library/metadata/{ratingKey}
- Search: GET /hubs/search?query={query}
- Image: GET /photo/:/transcode?url={path}&width={w}&height={h}

### P9-V2: Implementation Requirements

1. **getLibraries()**:
 Fetch and cache library list
2. **getLibraryItems()**: Support pagination via offset/limit
3. **getImageUrl()**: Always append X-Plex-Token to image URLs
4. **search()**: Debounce 300ms, emit searchComplete event

### P9-V2: Error Handling
| Error | Recovery |
|-------|----------|
| 401 Unauthorized | Return empty, emit auth error |
| 404 Not Found | Return null for single items, empty array for lists |
| Network error | Throw with PlexApiError |
| Library deleted | Return empty, emit libraryRefreshed |

### P9-V2: Test Specifications
```typescript
describe('PlexLibrary', () => {
  describe('getLibraries', () => {
    it('should fetch libraries from server');
    it('should filter non-video libraries');
    it('should cache results');
  });
  
  describe('getLibraryItems', () => {
    it('should fetch all items with pagination');
    it('should apply sort options');
    it('should apply filter options');
  });
  
  describe('getImageUrl', () => {
    it('should include X-Plex-Token');
    it('should apply width/height transforms');
  });
  
  describe('search', () => {
    it('should search across libraries');
    it('should filter by type');
    it('should debounce rapid calls');
    it('should emit searchComplete event');
  });
  
  describe('error handling', () => {
    it('should handle 401 gracefully');
    it('should handle 404 gracefully');
    it('should handle network errors');
  });
});
```

### P9-V2: Deliverable
Complete implementation with event emitters, error handling, and tests.

````

---

## Prompt 10 (V2): Plex Stream Resolver Module (Priority 3)

````markdown
You are implementing the Plex Stream Resolver module for Retune, a webOS TV application.

### P10-V2: Task
Resolve playable stream URLs from Plex media items, handle transcode decisions, and manage playback sessions with progress reporting.

### P10-V2: Files to Create
- src/modules/plex/stream/index.ts
- src/modules/plex/stream/PlexStreamResolver.ts
- src/modules/plex/stream/SessionManager.ts
- src/modules/plex/stream/interfaces.ts
- src/modules/plex/stream/__tests__/PlexStreamResolver.test.ts

### P10-V2: Type Definitions (use exactly)

```typescript
interface StreamRequest {
  itemKey: string;              // ratingKey of media
  partId?: string;              // Specific part if multi-part
  startOffsetMs?: number;       // For resume
  audioStreamId?: string;       // Preferred audio track
  subtitleStreamId?: string;    // Preferred subtitle track
  maxBitrate?: number;          // For quality selection
  directPlay?: boolean;         // Prefer direct play
  directStream?: boolean;       // Prefer direct stream
}

interface StreamDecision {
  playbackUrl: string;          // Final URL for playback
  protocol: 'hls' | 'dash' | 'http';
  isDirectPlay: boolean;
  isTranscoding: boolean;
  container: string;
  videoCodec: string;
  audioCodec: string;
  subtitleDelivery: 'embed' | 'sidecar' | 'burn' | 'none';
  sessionId: string;            // For tracking/cleanup
  sessionKey: string;           // Plex session key
  selectedAudioStream: PlexStream | null;
  selectedSubtitleStream: PlexStream | null;
  width: number;
  height: number;
  bitrate: number;
  durationMs: number;
  subtitleTracks: SubtitleTrack[];
  audioTracks: AudioTrack[];
}

interface SubtitleTrack {
  id: string;
  streamIndex: number;
  language: string;
  languageCode: string;
  title: string;
  format: 'srt' | 'vtt' | 'ass' | 'pgs' | 'vobsub';
  url: string | null;           // For sidecar delivery
  forced: boolean;
  default: boolean;
}

interface AudioTrack {
  id: string;
  streamIndex: number;
  language: string;
  languageCode: string;
  title: string;
  codec: string;
  channels: number;
  default: boolean;
}

interface PlaybackSession {
  sessionId: string;
  sessionKey: string;
  itemKey: string;
  startedAt: number;
  lastReportedPositionMs: number;
  lastReportedAt: number;
}

interface HlsOptions {
  maxBitrate?: number;
  subtitleSize?: number;  // Percentage (100 = default)
  audioBoost?: number;    // Percentage (100 = default)
  copyts?: boolean;       // Preserve timestamps
}
```

### P10-V2: Interface to Implement

```typescript
interface IPlexStreamResolver {
  // Stream Resolution
  resolveStream(request: StreamRequest): Promise<StreamDecision>;

  // Session Management
  startSession(itemKey: string): Promise<string>;
  updateProgress(
    sessionId: string,
    itemKey: string,
    positionMs: number,
    state: 'playing' | 'paused' | 'stopped'
  ): Promise<void>;
  endSession(sessionId: string, itemKey: string): Promise<void>;

  // Direct Play Check
  canDirectPlay(item: PlexMediaItem): boolean;

  // Transcode Options
  getTranscodeUrl(itemKey: string, options: HlsOptions): string;

  // Events
  on(event: 'sessionStart', handler: (session: { sessionId: string; itemKey: string }) => void): void;
  on(
    event: 'sessionEnd',
    handler: (session: { sessionId: string; itemKey: string; positionMs: number }) => void
  ): void;
  on(event: 'error', handler: (error: StreamResolverError) => void): void;
}
```

### P10-V2: API Endpoints

| Endpoint | Method | Purpose |
| --- | --- | --- |
| /video/:/transcode/universal/decision | GET | Get stream decision |
| /video/:/transcode/universal/start.m3u8 | GET | Get HLS playlist |
| /library/parts/{partId}/file | GET | Direct play URL |
| /:/timeline | POST | Report playback progress |
| /video/:/transcode/universal/stop | GET | Stop transcode session |

### P10-V2: Implementation Requirements

#### 1. Stream Resolution Flow

```typescript
async resolveStream(request: StreamRequest): Promise<StreamDecision> {
  // 1. Get item metadata to retrieve part info
  const item = await this.library.getItem(request.itemKey);
  const part = this.selectBestPart(item, request.partId);
  
  // 2. Build decision request params
  const params = new URLSearchParams({
    path: `/library/metadata/${request.itemKey}`,
    mediaIndex: '0',
    partIndex: '0',
    protocol: 'hls',
    fastSeek: '1',
    directPlay: request.directPlay !== false ? '1' : '0',
    directStream: request.directStream !== false ? '1' : '0',
    directStreamAudio: '1',
    videoQuality: '100',
    videoResolution: '1920x1080',
    maxVideoBitrate: (request.maxBitrate || 20000).toString(),
    subtitles: 'auto',
    'X-Plex-Session-Identifier': this.generateSessionId(),
    'X-Plex-Client-Profile-Extra': this.getClientProfile(),
  });
  
  if (request.audioStreamId) {
    params.append('audioStreamID', request.audioStreamId);
  }
  if (request.subtitleStreamId) {
    params.append('subtitleStreamID', request.subtitleStreamId);
  }
  
  // 3. Request decision
  const decisionUrl = `${this.serverUri}/video/:/transcode/universal/decision?${params}`;
  const response = await this.fetch(decisionUrl);
  
  // 4. Parse decision
  return this.parseDecision(response, part);
}
```

#### 2. Client Profile (CRITICAL for webOS)

```typescript
private getClientProfile(): string {
  // webOS 4.0+ supports these codecs
  return [
    'add-limitation(scope=videoCodec&scopeName=*&type=upperBound&name=video.bitrate&value=20000)',
    'add-limitation(scope=videoAudioCodec&scopeName=*&type=match&name=audio.channels&list=2|6)',
    'append-transcode-target(type=videoProfile&context=streaming&protocol=hls&container=mpegts)',
    // H.264 up to 4K
    'append-transcode-target-codec(type=videoProfile&context=streaming&protocol=hls&videoCodec=h264)',
    // AAC stereo
    'append-transcode-target-codec(type=videoProfile&context=streaming&protocol=hls&audioCodec=aac)',
    // AC3 passthrough
    'append-transcode-target-codec(type=videoProfile&context=streaming&protocol=hls&audioCodec=ac3)',
  ].join('&');
}
```

#### 3. Progress Reporting

```typescript
async reportProgress(
  sessionId: string, 
  itemKey: string, 
  positionMs: number
): Promise<void> {
  const params = new URLSearchParams({
    ratingKey: itemKey,
    key: `/library/metadata/${itemKey}`,
    state: 'playing',
    time: positionMs.toString(),
    duration: (() => {
      const durationMs = this.activeSession ? this.activeSession.durationMs : undefined;
      return typeof durationMs === 'number' ? durationMs.toString() : '0';
    })(),
  });
  
  await this.fetch(`${this.serverUri}/:/timeline?${params}`, {
    method: 'POST',
    headers: this.auth.getAuthHeaders(),
  });
  
  // Update session tracking
  if (this.sessions.has(sessionId)) {
    const session = this.sessions.get(sessionId)!;
    session.lastReportedPositionMs = positionMs;
    session.lastReportedAt = Date.now();
  }
}
```

#### 4. Session Cleanup

```typescript
async endSession(
  sessionId: string, 
  itemKey: string, 
  positionMs: number
): Promise<void> {
  // Report final position
  await this.fetch(`${this.serverUri}/:/timeline`, {
    method: 'POST',
    body: new URLSearchParams({
      ratingKey: itemKey,
      key: `/library/metadata/${itemKey}`,
      state: 'stopped',
      time: positionMs.toString(),
    }),
    headers: this.auth.getAuthHeaders(),
  });
  
  // If transcoding, stop the transcode session
  if (this.activeTranscodeSession) {
    await this.fetch(
      `${this.serverUri}/video/:/transcode/universal/stop?session=${sessionId}`,
      { headers: this.auth.getAuthHeaders() }
    );
  }
  
  // Remove from tracking
  this.sessions.delete(sessionId);
  this.emit('sessionEnd', { sessionId, itemKey, positionMs });
}
```

#### 5. Subtitle Delivery Decision

```typescript
private determineSubtitleDelivery(
  track: PlexStream,
  decision: any
): 'embed' | 'sidecar' | 'burn' | 'none' {
  // Image-based subtitles must be burned in
  if (['pgs', 'vobsub', 'dvdsub'].includes(track.format || '')) {
    return 'burn';
  }
  
  // If transcoding, server may embed or burn
  if (decision.transcodeDecision === 'transcode') {
    return decision.subtitleDecision === 'burn' ? 'burn' : 'embed';
  }
  
  // For direct play, deliver as sidecar
  if (['srt', 'vtt', 'webvtt', 'subrip'].includes(track.format || '')) {
    return 'sidecar';
  }
  
  // ASS/SSA may need burn for styling
  if (track.format === 'ass') {
    return 'burn';
  }
  
  return 'none';
}
```

### P10-V2: Error Handling

| Error | Code | Recovery |
| --- | --- | --- |
| Item not found | 404 | Throw `PLAYBACK_SOURCE_NOT_FOUND` |
| Server busy transcoding | 503 | Retry after 2s, max 3 attempts |
| Unsupported codec | Decision error | Fallback to forced transcode |
| Network timeout | Timeout | Retry with backoff |
| Session expired | 401 | Re-authenticate |

```typescript
async resolveStreamWithRetry(request: StreamRequest): Promise<StreamDecision> {
  const maxRetries = 3;
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await this.resolveStream(request);
    } catch (error) {
      lastError = error as Error;
      
      if (this.isRetryable(error)) {
        await this.sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
}
```

### P10-V2: Test Specification

```typescript
describe('PlexStreamResolver', () => {
  describe('resolveStream', () => {
    it('should return HLS URL for compatible content', async () => {
      // Mock decision response with direct play
      mockFetch({ MediaContainer: { ... } });
      
      const result = await resolver.resolveStream({ itemKey: '12345' });
      
      expect(result.protocol).toBe('hls');
      expect(result.playbackUrl).toContain('start.m3u8');
    });
    
    it('should fall back to transcode for unsupported codec', async () => {
      // Mock HEVC content that requires transcode
      mockFetch({ MediaContainer: { videoCodec: 'hevc' } });
      
      const result = await resolver.resolveStream({ itemKey: '12345' });
      
      expect(result.isTranscoding).toBe(true);
    });
    
    it('should include audio/subtitle track selection', async () => {
      const result = await resolver.resolveStream({
        itemKey: '12345',
        audioStreamId: 'audio-2',
        subtitleStreamId: 'sub-1',
      });
      
      expect(result.selectedAudioStream && result.selectedAudioStream.id).toBe('audio-2');
      expect(result.selectedSubtitleStream && result.selectedSubtitleStream.id).toBe('sub-1');
    });
  });
  
  describe('progress reporting', () => {
    it('should report progress to timeline endpoint', async () => {
      await resolver.reportProgress('session-1', '12345', 60000);
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/:/timeline'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('time=60000'),
        })
      );
    });
    
    it('should update session tracking state', async () => {
      resolver.startSession('session-1', '12345');
      await resolver.reportProgress('session-1', '12345', 60000);
      
      const session = resolver.getSession('session-1');
      expect(session && session.lastReportedPositionMs).toBe(60000);
    });
  });
  
  describe('session management', () => {
    it('should stop transcode on session end', async () => {
      await resolver.endSession('session-1', '12345', 120000);
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('universal/stop'),
        expect.anything()
      );
    });
    
    it('should emit sessionEnd event', async () => {
      const handler = jest.fn();
      resolver.on('sessionEnd', handler);
      
      await resolver.endSession('session-1', '12345', 120000);
      
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-1' })
      );
    });
  });
  
  describe('subtitle handling', () => {
    it('should return sidecar URL for SRT subtitles', async () => {
      const tracks = await resolver.getSubtitleTracks('12345');
      const srtTrack = tracks.find(t => t.format === 'srt');
      
      expect(srtTrack && srtTrack.url).toContain('/library/streams');
    });
    
    it('should indicate burn-in for PGS subtitles', async () => {
      const result = await resolver.resolveStream({
        itemKey: '12345',
        subtitleStreamId: 'pgs-sub',
      });
      
      expect(result.subtitleDelivery).toBe('burn');
    });
  });
});
```

### P10-V2: Mock Requirements

When testing this module, mock:
- `fetch` global function
- `IPlexAuth.getAuthHeaders()`
- `IPlexServerDiscovery.getActiveConnectionUri()`
- `IPlexLibrary.getItem()`

### P10-V2: Performance Requirements

| Operation | Target | Max |
| --- | --- | --- |
| resolveStream() | 500ms | 2000ms |
| reportProgress() | 100ms | 500ms |
| endSession() | 200ms | 1000ms |

### P10-V2: Deliverable

Complete implementation with:
- PlexStreamResolver class with all IPlexStreamResolver methods
- SessionManager for tracking active sessions
- Client profile configuration for webOS
- Subtitle delivery logic
- Progress reporting
- Session cleanup on terminate
- Error retry with backoff
- JSDoc comments
- Unit tests

````

---

## Prompt 11 (V2): Channel Manager Module (Priority 4)

````markdown
You are implementing the Channel Manager module for Retune, a webOS TV application.

### P11-V2: Task
Manage virtual TV channels, including CRUD operations, content resolution, and channel switching.

### P11-V2: Files to Create
- src/modules/scheduler/channel-manager/index.ts
- src/modules/scheduler/channel-manager/ChannelManager.ts
- src/modules/scheduler/channel-manager/ContentResolver.ts
- src/modules/scheduler/channel-manager/interfaces.ts
- src/modules/scheduler/channel-manager/types.ts
- src/modules/scheduler/channel-manager/__tests__/ChannelManager.test.ts

### P11-V2: Type Definitions

```typescript
interface ChannelConfig {
  id: string;                    // UUID
  number: number;                // 1-999
  name: string;
  description?: string;
  icon?: string;
  contentSource: ChannelContentSource;
  playbackMode: 'sequential' | 'shuffle' | 'random';
  shuffleSeed: number;
  createdAt: number;
  updatedAt: number;
  anchorTime: number;            // Schedule start (Unix ms)
}

type ChannelContentSource =
  | { type: 'library'; libraryKey: string }
  | { type: 'collection'; collectionKey: string }
  | { type: 'show'; showKey: string }
  | { type: 'manual'; items: string[] };

interface ResolvedChannelContent {
  channelId: string;
  items: ResolvedContentItem[];
  totalDurationMs: number;
  resolvedAt: number;
}

interface ResolvedContentItem {
  ratingKey: string;
  title: string;
  fullTitle: string;             // "Show - S01E01 - Title"
  durationMs: number;
  type: 'movie' | 'episode';
  thumb?: string;
  year?: number;
  summary?: string;
}

interface IChannelManager {
  // Channel CRUD
  createChannel(config: Partial<ChannelConfig>): Promise<ChannelConfig>;
  updateChannel(id: string, updates: Partial<ChannelConfig>): Promise<ChannelConfig>;
  deleteChannel(id: string): Promise<void>;

  // Retrieval
  getChannel(id: string): ChannelConfig | null;
  getAllChannels(): ChannelConfig[];
  getChannelByNumber(number: number): ChannelConfig | null;

  // Content Resolution
  resolveChannelContent(channelId: string): Promise<ResolvedChannelContent>;
  refreshChannelContent(channelId: string): Promise<ResolvedChannelContent>;

  // Ordering / Current Channel
  reorderChannels(orderedIds: string[]): void;
  setCurrentChannel(channelId: string): void;
  getCurrentChannel(): ChannelConfig | null;
  getNextChannel(): ChannelConfig | null;
  getPreviousChannel(): ChannelConfig | null;

  // Import/Export
  exportChannels(): string;
  importChannels(data: string): Promise<ImportResult>;

  // Persistence
  saveChannels(): Promise<void>;
  loadChannels(): Promise<void>;

  // Events
  on<K extends keyof ChannelManagerEventMap>(
    event: K,
    handler: (payload: ChannelManagerEventMap[K]) => void
  ): void;
}
```

### P11-V2: Implementation Requirements

1. **createChannel()**:
 Generate UUID, assign next available number
2. **resolveChannelContent()**: Cache for 30 minutes, use PlexLibrary to fetch items
3. **switchToChannel()**: Save current channel to localStorage, emit event
4. **Persistence**: localStorage key 'retune_channels'

### P11-V2: Error Handling
| Error | Condition | Recovery |
|-------|-----------|----------|
| Library deleted | contentSource.libraryKey not found | Return empty items, mark channel as stale |
| Max channels | > 100 channels | Reject with MAX_CHANNELS error |
| Invalid number | 0 or > 999 | Reject with INVALID_CHANNEL_NUMBER |

### P11-V2: Content Resolution Algorithm

```typescript
async resolveChannelContent(channelId: string): Promise<ResolvedChannelContent> {
  const channel = this.getChannel(channelId);
  const source = channel.contentSource;
  
  let items: PlexMediaItem[];
  switch (source.type) {
    case 'library':
      items = await this.library.getLibraryItems(source.libraryKey);
      break;
    case 'collection':
      items = await this.library.getCollection(source.collectionKey);
      break;
    case 'show':
      items = await this.library.getShowAllEpisodes(source.showKey);
      break;
    case 'manual':
      items = await Promise.all(source.items.map(k => this.library.getItemMetadata(k)));
      break;
  }
  
  return {
    channelId,
    items: items.map(this.toResolvedItem),
    totalDurationMs: items.reduce((sum, i) => sum + i.duration, 0),
    resolvedAt: Date.now()
  };
}
```

### P11-V2: Test Specifications
```typescript
describe('ChannelManager', () => {
  describe('CRUD operations', () => {
    it('should create channel with generated ID and number');
    it('should update channel and emit event');
    it('should delete channel and emit event');
    it('should find channel by number');
  });
  
  describe('content resolution', () => {
    it('should resolve library content source');
    it('should resolve collection content source');
    it('should resolve show content source');
    it('should resolve manual content source');
    it('should cache resolved content for 30 minutes');
    it('should handle library deleted gracefully');
  });
  
  describe('channel switching', () => {
    it('should switch to channel by ID');
    it('should switch to channel by number');
    it('should emit channelSwitch event');
    it('should persist current channel');
  });
  
  describe('persistence', () => {
    it('should save channels to localStorage');
    it('should restore channels on init');
    it('should export channels as JSON');
    it('should import channels from JSON');
  });
});
```

### P11-V2: Deliverable
Complete implementation with content resolution for all source types.

````

---

## Prompt 12: App Lifecycle Module (Priority 1)

````markdown
You are implementing the Application Lifecycle module for Retune, a webOS TV application.

### P12: Task
Implement lifecycle hooks, persistence, network/memory monitoring, and error recovery glue so the app can run for long sessions and survive background/foreground transitions.

### P12: SSOT (Do not drift)
- Interfaces + types: `spec-pack/artifact-2-shared-types.ts` (`IAppLifecycle`, `IErrorRecovery`, `AppPhase`, `PersistentState`, `LifecycleEventMap`)
- Module spec: `spec-pack/modules/app-lifecycle.md`
- Platform constraints: `spec-pack/artifact-12-platform-constraints.md`
- Config/constants: `spec-pack/artifact-5-config.ts`

### P12: Files to Create
- src/modules/lifecycle/index.ts
- src/modules/lifecycle/AppLifecycle.ts
- src/modules/lifecycle/ErrorRecovery.ts
- src/modules/lifecycle/StateManager.ts
- src/modules/lifecycle/interfaces.ts
- src/modules/lifecycle/types.ts
- src/modules/lifecycle/__tests__/AppLifecycle.test.ts
- src/modules/lifecycle/__tests__/ErrorRecovery.test.ts
- src/modules/lifecycle/__tests__/StateManager.test.ts

### P12: Interface to Implement (canonical)
Implement `IAppLifecycle` and `IErrorRecovery` exactly as defined in `spec-pack/artifact-2-shared-types.ts`.

### P12: Constraints
- Target Chromium 68: no optional chaining (`?.`) or nullish coalescing (`??`) in shipped code.
- Persistence MUST handle localStorage quota errors gracefully.
- All lifecycle event listeners MUST be removed on shutdown.

### P12: Minimum Test Cases
```typescript
describe('AppLifecycle', () => {
  it('registers and tears down visibility listeners');
  it('saves and restores PersistentState via StateManager');
  it('invokes onPause/onResume callbacks on visibility changes');
});

describe('ErrorRecovery', () => {
  it('maps AppErrorCode to recovery actions');
  it('executes recovery actions safely and returns boolean');
});
```

````

---

## Prompt 13: App Orchestrator Module (Priority 7)

````markdown
You are implementing the Application Orchestrator module for Retune, a webOS TV application.

### P13: Task
Coordinate module initialization and inter-module wiring per the integration contracts so the app can start, restore state, and run the core playback loop reliably.

### P13: SSOT (Do not drift)
- Interfaces + types: `spec-pack/artifact-2-shared-types.ts` (`IAppOrchestrator`, `OrchestratorConfig`, `ModuleStatus`)
- Module spec: `spec-pack/modules/app-orchestrator.md`
- Dependency graph: `spec-pack/artifact-1-dependency-graph.json`
- Integration contracts: `spec-pack/artifact-4-integration-contracts.md`
- Verification checklist: `spec-pack/artifact-8-verification-checklist.md`

### P13: Files to Create
- src/Orchestrator.ts
- src/index.ts
- src/App.ts
- src/__tests__/Orchestrator.test.ts

### P13: Interface to Implement (canonical)
Implement `IAppOrchestrator` exactly as defined in `spec-pack/artifact-2-shared-types.ts`.

### P13: Required Behaviors
1) Initialize modules in dependency order (see `spec-pack/artifact-1-dependency-graph.json` phases).
2) Wire events per `spec-pack/artifact-4-integration-contracts.md`.
3) Perform state restore flow using lifecycle persistence before entering steady-state playback.
4) Centralize global error handling (`handleGlobalError`) and expose recovery actions.

### P13: Minimum Test Cases
```typescript
describe('AppOrchestrator', () => {
  it('initializes modules in correct phase order');
  it('wires scheduler -> player and player -> scheduler events');
  it('restores persisted state and resumes playback when available');
  it('handles module init failures via handleGlobalError');
});
```

### P13: Implementation Notes
- Treat `spec-pack/modules/app-orchestrator.md` as the SSOT for sequencing and wiring.
- Ensure any sample code included in the implementation is Chromium 68 compatible (no `?.` / `??`).
- Always implement the `IAppOrchestrator` signature from `spec-pack/artifact-2-shared-types.ts` (ignore any legacy snippets elsewhere).

### P13: Mock Requirements
- All module interfaces should be mockable
- Use dependency injection for testability

### P13: Deliverable
Complete Orchestrator with App.ts entry point, full event bindings, and integration tests.

````

---
