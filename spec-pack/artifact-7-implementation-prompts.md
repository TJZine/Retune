# AI Agent Implementation Prompts

These prompts are self-contained instructions for AI coding agents to implement individual modules. Each prompt contains everything needed to implement the module without external dependencies.

---

## Prompt 1: Event Emitter Utility (Priority 1)

```
You are implementing a TypeScript utility module for Retune, a webOS application.

## Task
Implement a typed EventEmitter class that provides pub/sub functionality with TypeScript generics for type-safe events.

## Files to Create
- src/utils/EventEmitter.ts

## Requirements

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

3. Type safety:
   - Event names must be keys of EventMap
   - Handler parameter must match the event's payload type
   - `emit()` payload must match the event's payload type

## Example Usage
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

## Constraints
- No external dependencies
- Must work in Chromium 68 (webOS 4.0)
- Keep implementation under 100 lines

## Deliverable
A single TypeScript file with:
- EventEmitter class with full type annotations
- JSDoc comments on all public methods
- Export statement for the class
```

---

## Prompt 2: Plex Authentication Module (Priority 1)

```
You are implementing the Plex Authentication module for Retune, a webOS TV application.

## Task
Implement PIN-based OAuth authentication with plex.tv, including token storage and validation.

## Files to Create
- src/modules/plex/auth/index.ts (exports)
- src/modules/plex/auth/PlexAuth.ts (main class)
- src/modules/plex/auth/interfaces.ts (IPlexAuth)
- src/modules/plex/auth/constants.ts

## Type Definitions (use these exactly)
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

## Interface to Implement
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

## API Endpoints
- PIN Request: POST https://plex.tv/api/v2/pins
- PIN Check: GET https://plex.tv/api/v2/pins/{id}
- User Profile: GET https://plex.tv/api/v2/user

## Required Headers for All Requests
- Accept: application/json
- X-Plex-Client-Identifier: {clientIdentifier}
- X-Plex-Product: {product}
- X-Plex-Version: {version}
- X-Plex-Platform: {platform}
- X-Plex-Device: {device}

## Storage
- Use localStorage with key 'retune_plex_auth'
- Include version number in stored data for migrations

## Implementation Notes
1. requestPin() should POST to /pins with { strong: true }
2. checkPinStatus() polls every 1 second for 5 minutes max
3. When authToken is populated, fetch user profile and store
4. getAuthHeaders() includes X-Plex-Token when authenticated
5. Emit 'authChange' event when credentials change

## Error Handling
- Wrap fetch in try/catch
- On 401/403, return false from validateToken
- On network error, throw with code 'NETWORK_ERROR'

## Deliverable
Complete implementation of all files with:
- Full IPlexAuth implementation
- localStorage persistence
- Event emission via EventEmitter
- JSDoc comments
- No TypeScript errors
```

---

## Prompt 3: Channel Scheduler Module (Priority 5)

```
You are implementing the Channel Scheduler module for Retune, a webOS TV application that creates virtual TV channels.

## Task
Implement deterministic schedule generation for virtual TV channels. Given a channel's content and the current time, calculate exactly which content should be playing and at what offset.

## Files to Create
- src/modules/scheduler/scheduler/index.ts
- src/modules/scheduler/scheduler/ChannelScheduler.ts
- src/modules/scheduler/scheduler/ScheduleCalculator.ts  
- src/modules/scheduler/scheduler/ShuffleGenerator.ts
- src/modules/scheduler/scheduler/interfaces.ts

## Type Definitions (use exactly)
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

## Core Algorithm (CRITICAL)
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

## Deterministic Shuffle (Mulberry32 PRNG)
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

## Interface to Implement
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

## Requirements
1. O(log n) lookup via binary search
2. Schedule must loop infinitely without gaps
3. Same config always produces same schedule
4. Timer syncs every 1 second, emits events at program boundaries
5. getScheduleWindow() must be fast (<50ms for 24 hours)

## Deliverable
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

```
You are implementing the Video Player module for Retune, a webOS TV application.

## Task
Create an abstraction over the HTML5 video element optimized for webOS, handling HLS streams, subtitle tracks, error recovery, and suspension prevention.

## Files to Create
- src/modules/player/index.ts
- src/modules/player/VideoPlayer.ts
- src/modules/player/SubtitleManager.ts
- src/modules/player/interfaces.ts

## Type Definitions
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

## Interface to Implement
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

## Critical Implementation Notes

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

## Event Mapping
Map video element events to player events:
- canplay → status: 'buffering' to 'paused'
- playing → status: 'playing'
- pause → status: 'paused'
- seeking → status: 'seeking'
- seeked → restore previous status
- ended → emit 'ended', status: 'ended'
- error → handle based on MediaError.code

## Deliverable
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

```
You are implementing the Navigation & Remote Control module for Retune, a webOS TV application.

## Task
Handle LG remote control input, manage focus across the application, and coordinate screen transitions.

## Files to Create
- src/modules/navigation/index.ts
- src/modules/navigation/NavigationManager.ts
- src/modules/navigation/FocusManager.ts
- src/modules/navigation/RemoteHandler.ts
- src/modules/navigation/interfaces.ts
- src/modules/navigation/constants.ts

## Type Definitions
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

## webOS Key Codes (CRITICAL)
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

## Interface to Implement
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

## Implementation Requirements

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

## Focus Ring CSS
```css
.focusable:focus, .focusable.focused {
  outline: none;
  box-shadow: 0 0 0 4px var(--focus-color, #00a8e1);
  transform: scale(1.02);
}
```

## Deliverable
Complete implementation with:
- RemoteHandler processing key events
- FocusManager tracking and moving focus
- NavigationManager coordinating screens
- Event emission for all key presses
- Focus memory per screen
- JSDoc comments
```

---

## Prompt 6: EPG UI Module (Priority 6)

```
You are implementing the EPG (Electronic Program Guide) UI module for Retune, a webOS TV application.

## Task
Create a virtualized program grid displaying channels (vertical) and time (horizontal) that performs well on limited TV hardware.

## Files to Create
- src/modules/ui/epg/index.ts
- src/modules/ui/epg/EPGComponent.ts
- src/modules/ui/epg/EPGVirtualizer.ts
- src/modules/ui/epg/EPGInfoPanel.ts
- src/modules/ui/epg/interfaces.ts
- src/modules/ui/epg/styles.css

## Dependencies (you will receive these)
- IChannelScheduler.getScheduleWindow(startTime, endTime)
- INavigationManager focus handling

## Type Definitions
```typescript
interface EPGConfig {
  containerId: string;
  visibleChannels: number; // 5
  timeSlotMinutes: number; // 30
  visibleHours: number; // 3
  pixelsPerMinute: number; // 4
  rowHeight: number; // 80
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

## Interface to Implement
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

## Virtualization Strategy (CRITICAL)
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

## Grid Layout
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

## Cell Positioning
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

## Navigation Logic
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

## CSS (TV-optimized)
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

## Performance Requirements
- Render 5 channels × 3 hours in <100ms
- Maintain 60fps during scroll
- Max 200 DOM elements

## Deliverable
Complete implementation with:
- EPGComponent orchestrating grid
- EPGVirtualizer managing DOM recycling
- EPGInfoPanel for program details
- D-pad navigation working correctly
- Current time indicator
- Event emission
- All CSS styles
```

---

## Prompt 7: Plex Server Discovery Module (Priority 2)

```
You are implementing the Plex Server Discovery module for Retune, a webOS TV application.

## Task
Implement server discovery, connection testing, and selection management for Plex Media Servers.

## Files to Create
- src/modules/plex/discovery/index.ts
- src/modules/plex/discovery/PlexServerDiscovery.ts
- src/modules/plex/discovery/interfaces.ts
- src/modules/plex/discovery/ConnectionTester.ts

## Type Definitions (use exactly)
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

## Interface to Implement
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

## API Endpoint
- GET https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1

## Implementation Requirements

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
     try {
       const response = await fetch(`${uri}/identity`, {
         method: 'HEAD',
         headers: this.auth.getAuthHeaders(),
         signal: AbortSignal.timeout(5000) // 5 second timeout
       });
       const latencyMs = performance.now() - start;
       return { success: response.ok, latencyMs };
     } catch (error) {
       return { success: false, latencyMs: -1 };
     }
   }
   ```

4. **Storage**
   - Persist selected server ID to localStorage
   - Key: 'retune_selected_server'

## Error Handling
- Network timeout: 5 seconds per connection test
- All connections fail: Return null, let caller handle
- Server list empty: Return empty array

## Deliverable
Complete implementation with:
- PlexServerDiscovery class
- ConnectionTester helper
- Server persistence
- Event emission for server changes
- JSDoc comments
```

---

## Prompt 8: Plex Library Access Module (Priority 3)

```
You are implementing the Plex Library Access module for Retune, a webOS TV application.

## Task
Implement library enumeration, content retrieval, TV show hierarchy navigation, and image URL handling with authentication.

## Files to Create
- src/modules/plex/library/index.ts
- src/modules/plex/library/PlexLibrary.ts
- src/modules/plex/library/interfaces.ts
- src/modules/plex/library/ContentParser.ts

## Type Definitions (use exactly)
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
```

## Interface to Implement
```typescript
interface IPlexLibrary {
  getLibraries(): Promise<PlexLibrary[]>;
  getLibrary(libraryId: string): Promise<PlexLibrary>;
  getLibraryItems(libraryId: string, options?: LibraryQueryOptions): Promise<PlexMediaItem[]>;
  getItem(ratingKey: string): Promise<PlexMediaItem>;
  getSeasons(showRatingKey: string): Promise<PlexSeason[]>;
  getEpisodes(seasonRatingKey: string): Promise<PlexMediaItem[]>;
  getAllEpisodes(showRatingKey: string): Promise<PlexMediaItem[]>;
  search(query: string, options?: SearchOptions): Promise<PlexMediaItem[]>;
  getCollections(libraryId: string): Promise<PlexCollection[]>;
  getCollectionItems(collectionKey: string): Promise<PlexMediaItem[]>;
  getPlaylists(): Promise<PlexPlaylist[]>;
  getPlaylistItems(playlistKey: string): Promise<PlexMediaItem[]>;
  getImageUrl(imagePath: string, width?: number, height?: number): string;
}
```

## API Endpoints
- Libraries: GET /library/sections
- Library Items: GET /library/sections/{id}/all
- Item Details: GET /library/metadata/{ratingKey}
- Show Seasons: GET /library/metadata/{ratingKey}/children
- Season Episodes: GET /library/metadata/{ratingKey}/children
- Collections: GET /library/sections/{id}/collections
- Search: GET /hubs/search?query={query}

## Implementation Requirements

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
     const token = this.auth.getCurrentUser()?.token;
     
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
   async getAllEpisodes(showRatingKey: string): Promise<PlexMediaItem[]> {
     const seasons = await this.getSeasons(showRatingKey);
     const episodePromises = seasons.map(s => this.getEpisodes(s.ratingKey));
     const episodeArrays = await Promise.all(episodePromises);
     return episodeArrays.flat();
   }
   ```

4. **Response Parsing**
   - Plex returns XML or JSON based on Accept header
   - Always request JSON with 'Accept: application/json'
   - Parse dates from Unix timestamps
   - Convert durations to milliseconds

## Error Handling
| Error | Code | Recovery |
|-------|------|----------|
| Library not found | 404 | Return empty / throw |
| Rate limited | 429 | Wait and retry |
| Server offline | Network error | Notify user |

## Deliverable
Complete implementation with:
- PlexLibrary class with all methods
- ContentParser for response transformation
- Image URL generation with auth
- Error handling for all operations
- JSDoc comments
```

---

## Prompt 9: Channel Manager Module (Priority 4)

```
You are implementing the Channel Manager module for Retune, a webOS TV application.

## Task
Implement channel CRUD operations, content resolution from Plex sources, and localStorage persistence.

## Files to Create
- src/modules/scheduler/channel-manager/index.ts
- src/modules/scheduler/channel-manager/ChannelManager.ts
- src/modules/scheduler/channel-manager/ContentResolver.ts
- src/modules/scheduler/channel-manager/interfaces.ts
- src/modules/scheduler/channel-manager/StorageManager.ts

## Type Definitions (use exactly)
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

## Interface to Implement
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

## Implementation Requirements

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
         const episodes = await this.plexLibrary.getAllEpisodes(source.showKey);
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

## Error Handling Matrix
| Scenario | Error Code | Recovery Strategy |
|----------|------------|-------------------|
| Channel not found | CHANNEL_NOT_FOUND | Return null |
| Plex server offline | NETWORK_ERROR | Use cached content if available |
| Library deleted in Plex | CONTENT_UNAVAILABLE | Filter out, log warning |
| No content after filters | CHANNEL_EMPTY | Notify user, suggest adjusting filters |
| Storage quota exceeded | STORAGE_FULL | Prune old caches, retry |
| Invalid import JSON | IMPORT_INVALID | Return with errors array |

## Deliverable
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

## Prompt 10: Application Lifecycle Module (Priority 1)

```
You are implementing the Application Lifecycle module for Retune, a webOS TV application.

## Task
Manage webOS app lifecycle events, state persistence, network monitoring, memory management, and error recovery strategies.

## Files to Create
- src/modules/lifecycle/index.ts
- src/modules/lifecycle/AppLifecycle.ts  
- src/modules/lifecycle/ErrorRecovery.ts
- src/modules/lifecycle/StateManager.ts
- src/modules/lifecycle/interfaces.ts

## Type Definitions (use exactly)
```typescript
type AppPhase = 
  | 'initializing' 
  | 'authenticating' 
  | 'loading_data' 
  | 'ready' 
  | 'backgrounded' 
  | 'resuming' 
  | 'error' 
  | 'terminating';

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'unreachable';

type AppErrorType =
  | 'INITIALIZATION_FAILED'
  | 'AUTH_EXPIRED'
  | 'NETWORK_UNAVAILABLE'
  | 'PLEX_UNREACHABLE'
  | 'PLAYBACK_FAILED'
  | 'OUT_OF_MEMORY'
  | 'UNKNOWN';

interface AppError {
  type: AppErrorType;
  message: string;
  timestamp: number;
  userMessage: string;
  actions: Array<{ label: string; action: () => void; isPrimary: boolean }>;
}

interface PersistentState {
  version: number;
  plexAuth: PlexAuthData | null;
  channelConfigs: ChannelConfig[];
  currentChannelIndex: number;
  userPreferences: UserPreferences;
  lastUpdated: number;
}
```

## Interface to Implement
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
  handleError(error: AppError): void;
  getCurrentError(): AppError | null;
  clearError(): void;
  
  // Events
  on(event: 'phaseChange', handler: (data: { from: AppPhase; to: AppPhase }) => void): void;
  on(event: 'visibilityChange', handler: (data: { isVisible: boolean }) => void): void;
  on(event: 'networkChange', handler: (data: { isAvailable: boolean }) => void): void;
  on(event: 'error', handler: (error: AppError) => void): void;
}
```

## webOS Lifecycle Events
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

## Implementation Requirements

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
   class ErrorRecovery {
     getRecoveryActions(errorType: AppErrorType): ErrorAction[] {
       switch (errorType) {
         case 'AUTH_EXPIRED':
           return [
             { label: 'Sign In Again', action: () => this.nav.goTo('auth'), isPrimary: true }
           ];
         case 'NETWORK_UNAVAILABLE':
           return [
             { label: 'Retry', action: () => this.retryConnection(), isPrimary: true },
             { label: 'Use Offline', action: () => this.useOfflineMode(), isPrimary: false }
           ];
         case 'PLEX_UNREACHABLE':
           return [
             { label: 'Retry Connection', action: () => this.retryPlex(), isPrimary: true },
             { label: 'Change Server', action: () => this.nav.goTo('server-select'), isPrimary: false }
           ];
         case 'PLAYBACK_FAILED':
           return [
             { label: 'Skip', action: () => this.scheduler.skipToNext(), isPrimary: true },
             { label: 'Try Again', action: () => this.player.retry(), isPrimary: false }
           ];
         default:
           return [
             { label: 'Restart App', action: () => location.reload(), isPrimary: true }
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

## Deliverable
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

## Prompt 11: Application Orchestrator Module (Priority 7)

```
You are implementing the Application Orchestrator module for Retune, a webOS TV application.

## Task
Coordinate all modules, handle initialization sequence, set up inter-module event bindings, and manage the main application flow.

## Files to Create
- src/Orchestrator.ts
- src/App.ts
- src/index.ts (entry point)

## Type Definitions
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

## Interface to Implement
```typescript
interface IAppOrchestrator {
  initialize(config: OrchestratorConfig): Promise<void>;
  shutdown(): Promise<void>;
  getModuleStatus(): ModuleStatus[];
  isReady(): boolean;
}
```

## Initialization Sequence (CRITICAL ORDER)
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

## Event Binding Setup (CRITICAL)
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

## Stream Resolution Helper
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

## Deliverable
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

## Prompt 8: Plex Server Discovery Module (Priority 2)

```
You are implementing the Plex Server Discovery module for Retune, a webOS TV application.

## Task
Discover and manage Plex Media Servers accessible to the authenticated user, testing connections to find the fastest route.

## Files to Create
- src/modules/plex/discovery/index.ts
- src/modules/plex/discovery/PlexServerDiscovery.ts
- src/modules/plex/discovery/interfaces.ts
- src/modules/plex/discovery/types.ts
- src/modules/plex/discovery/constants.ts
- src/modules/plex/discovery/__tests__/PlexServerDiscovery.test.ts

## Type Definitions

```typescript
interface PlexServer {
  id: string;                    // Machine identifier
  name: string;                  // Display name
  sourceTitle: string;           // Owner username
  ownerId: number;
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
  latencyMs?: number;            // Measured latency
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

## API Endpoints
- Server Discovery: GET https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1
- Connection Test: GET {connection.uri}/identity

## Implementation Requirements

1. **discoverServers()**: Fetch servers from plex.tv, filter for 'server' capability
2. **testConnection()**: Test with 5-second timeout, return latency in ms or null
3. **findFastestConnection()**: Priority order: local > remote > relay
4. **selectServer()**: Persist selection to localStorage key 'retune_selected_server'
5. Restore selection on initialization

## Error Handling
| Error | Recovery |
|-------|----------|
| Network timeout | Return null latency, try next connection |
| 401 Unauthorized | Emit 'connectionChange' with null, trigger re-auth |
| All connections fail | Return null from findFastestConnection |

## Test Specifications
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

## Mock Requirements
- Mock `fetch` for API calls
- Mock `localStorage` for persistence
- Mock `AbortController` for timeouts

## Deliverable
Complete implementation with full test coverage and JSDoc comments.
```

---

## Prompt 9: Plex Library Module (Priority 3)

```
You are implementing the Plex Library module for Retune, a webOS TV application.

## Task
Browse media libraries on a Plex server, fetch content metadata, and provide search functionality.

## Files to Create
- src/modules/plex/library/index.ts
- src/modules/plex/library/PlexLibrary.ts
- src/modules/plex/library/interfaces.ts
- src/modules/plex/library/types.ts
- src/modules/plex/library/__tests__/PlexLibrary.test.ts

## Type Definitions

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
  // Library Management
  getLibraries(): Promise<PlexLibrary[]>;
  getLibrary(key: string): Promise<PlexLibrary | null>;
  
  // Content Browsing
  getLibraryItems(libraryKey: string, options?: BrowseOptions): Promise<PlexMediaItem[]>;
  getCollection(collectionKey: string): Promise<PlexMediaItem[]>;
  getShowSeasons(showKey: string): Promise<PlexSeason[]>;
  getSeasonEpisodes(seasonKey: string): Promise<PlexMediaItem[]>;
  getShowAllEpisodes(showKey: string): Promise<PlexMediaItem[]>;
  
  // Item Details
  getItemMetadata(ratingKey: string): Promise<PlexMediaItem>;
  getRelatedItems(ratingKey: string): Promise<PlexMediaItem[]>;
  
  // Search
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  
  // Media URLs
  getImageUrl(path: string, width?: number, height?: number): string;
  
  // Events
  on(event: 'libraryRefreshed', handler: (library: PlexLibrary) => void): void;
  on(event: 'searchComplete', handler: (results: SearchResult[]) => void): void;
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

## API Endpoints
- Libraries: GET /library/sections
- Library Items: GET /library/sections/{key}/all
- Collections: GET /library/sections/{key}/collections
- Item Metadata: GET /library/metadata/{ratingKey}
- Search: GET /hubs/search?query={query}
- Image: GET /photo/:/transcode?url={path}&width={w}&height={h}

## Implementation Requirements

1. **getLibraries()**: Fetch and cache library list
2. **getLibraryItems()**: Support pagination via offset/limit
3. **getImageUrl()**: Always append X-Plex-Token to image URLs
4. **search()**: Debounce 300ms, emit searchComplete event

## Error Handling
| Error | Recovery |
|-------|----------|
| 401 Unauthorized | Return empty, emit auth error |
| 404 Not Found | Return null for single items, empty array for lists |
| Network error | Throw with PlexApiError |
| Library deleted | Return empty, emit libraryRefreshed |

## Test Specifications
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

## Deliverable
Complete implementation with event emitters, error handling, and tests.
```

---

## Prompt 10: Plex Stream Resolver Module (Priority 3)

```
You are implementing the Plex Stream Resolver module for Retune, a webOS TV application.

## Task
Resolve playable stream URLs for media items, preferring direct play over transcoding.

## Files to Create
- src/modules/plex/stream/index.ts
- src/modules/plex/stream/PlexStreamResolver.ts
- src/modules/plex/stream/interfaces.ts
- src/modules/plex/stream/types.ts
- src/modules/plex/stream/__tests__/PlexStreamResolver.test.ts

## Type Definitions

```typescript
interface StreamRequest {
  itemKey: string;               // ratingKey of media
  startOffsetMs?: number;        // Starting position
  directPlay?: boolean;          // Prefer direct play
  subtitleStreamId?: number;
  audioStreamId?: number;
}

interface StreamDecision {
  playbackUrl: string;
  protocol: 'hls' | 'dash' | 'direct';
  isTranscoding: boolean;
  container: string;
  videoCodec: string;
  audioCodec: string;
  subtitleTracks: SubtitleTrack[];
  audioTracks: AudioTrack[];
  sessionId: string;
  durationMs: number;
}

interface SubtitleTrack {
  id: number;
  language: string;
  languageCode: string;
  codec: string;
  selected: boolean;
}

interface AudioTrack {
  id: number;
  language: string;
  languageCode: string;
  codec: string;
  channels: number;
  selected: boolean;
}

interface IPlexStreamResolver {
  resolveStream(request: StreamRequest): Promise<StreamDecision>;
  getStreamUrl(ratingKey: string, startOffsetMs?: number): Promise<string>;
  reportPlaybackStart(sessionId: string, itemKey: string): Promise<void>;
  reportPlaybackProgress(sessionId: string, positionMs: number): Promise<void>;
  reportPlaybackStop(sessionId: string): Promise<void>;
  cleanup(): void;
}
```

## API Endpoints
- Stream Decision: GET /video/:/transcode/universal/decision
- Direct Play: GET /library/parts/{partId}/file
- HLS Master: GET /video/:/transcode/universal/start.m3u8
- Timeline: POST /:/timeline

## Implementation Requirements

1. **resolveStream()**: 
   - First try direct play capability check
   - webOS 4.0+ supports H.264, HEVC, AAC, AC3
   - Fall back to HLS transcoding if needed

2. **Direct Play Check**:
```typescript
const directPlayCodecs = ['h264', 'hevc'];
const directPlayContainers = ['mp4', 'mkv'];
const directPlayAudio = ['aac', 'ac3', 'eac3'];

function canDirectPlay(media: PlexMedia): boolean {
  return directPlayCodecs.includes(media.videoCodec) &&
         directPlayContainers.includes(media.container) &&
         directPlayAudio.includes(media.audioCodec);
}
```

3. **reportPlaybackProgress()**: Call every 10 seconds during playback

## Error Handling
| Error | Recovery |
|-------|----------|
| Direct play fails | Fall back to transcoding |
| Transcode fails | Return error with STREAM_UNAVAILABLE |
| Session expired | Create new session |

## Test Specifications
```typescript
describe('PlexStreamResolver', () => {
  describe('resolveStream', () => {
    it('should prefer direct play for compatible media');
    it('should fall back to HLS for incompatible media');
    it('should include offset in URL');
    it('should parse subtitle tracks');
    it('should parse audio tracks');
  });
  
  describe('direct play detection', () => {
    it('should detect H.264 as playable');
    it('should detect HEVC as playable');
    it('should require transcoding for unsupported codecs');
  });
  
  describe('playback reporting', () => {
    it('should report playback start');
    it('should report progress at interval');
    it('should report stop on cleanup');
  });
});
```

## Deliverable
Complete implementation with codec detection and timeline reporting.
```

---

## Prompt 11: Channel Manager Module (Priority 4)

```
You are implementing the Channel Manager module for Retune, a webOS TV application.

## Task
Manage virtual TV channels, including CRUD operations, content resolution, and channel switching.

## Files to Create
- src/modules/channels/manager/index.ts
- src/modules/channels/manager/ChannelManager.ts
- src/modules/channels/manager/interfaces.ts
- src/modules/channels/manager/types.ts
- src/modules/channels/manager/__tests__/ChannelManager.test.ts

## Type Definitions

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
  // CRUD
  createChannel(config: Partial<ChannelConfig>): Promise<ChannelConfig>;
  updateChannel(id: string, updates: Partial<ChannelConfig>): Promise<ChannelConfig>;
  deleteChannel(id: string): Promise<void>;
  
  // Retrieval
  getChannels(): ChannelConfig[];
  getChannel(id: string): ChannelConfig | null;
  getChannelByNumber(number: number): ChannelConfig | null;
  
  // Ordering
  reorderChannels(orderedIds: string[]): Promise<void>;
  
  // Content Resolution
  resolveChannelContent(channelId: string, forceRefresh?: boolean): Promise<ResolvedChannelContent>;
  refreshAllChannelContent(): Promise<void>;
  
  // Playback State
  getCurrentChannel(): ChannelConfig | null;
  switchToChannel(channelId: string): Promise<void>;
  switchToChannelByNumber(number: number): Promise<void>;
  nextChannel(): Promise<void>;
  previousChannel(): Promise<void>;
  
  // Persistence
  exportChannels(): string;
  importChannels(json: string): Promise<{ imported: number; skipped: number }>;
  
  // Events
  on(event: 'channelCreated', handler: (channel: ChannelConfig) => void): void;
  on(event: 'channelUpdated', handler: (channel: ChannelConfig) => void): void;
  on(event: 'channelDeleted', handler: (channelId: string) => void): void;
  on(event: 'channelSwitch', handler: (channel: ChannelConfig) => void): void;
  on(event: 'contentResolved', handler: (content: ResolvedChannelContent) => void): void;
}
```

## Implementation Requirements

1. **createChannel()**: Generate UUID, assign next available number
2. **resolveChannelContent()**: Cache for 30 minutes, use PlexLibrary to fetch items
3. **switchToChannel()**: Save current channel to localStorage, emit event
4. **Persistence**: localStorage key 'retune_channels'

## Error Handling
| Error | Condition | Recovery |
|-------|-----------|----------|
| Library deleted | contentSource.libraryKey not found | Return empty items, mark channel as stale |
| Max channels | > 100 channels | Reject with MAX_CHANNELS error |
| Invalid number | 0 or > 999 | Reject with INVALID_CHANNEL_NUMBER |

## Content Resolution Algorithm
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

## Test Specifications
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

## Deliverable
Complete implementation with content resolution for all source types.
```

---

## Prompt 12: App Lifecycle Module (Priority 1)

```
You are implementing the App Lifecycle module for Retune, a webOS TV application.

## Task
Manage application lifecycle events, state persistence, and integration with webOS platform.

## Files to Create
- src/modules/lifecycle/index.ts
- src/modules/lifecycle/AppLifecycle.ts
- src/modules/lifecycle/interfaces.ts
- src/modules/lifecycle/types.ts
- src/modules/lifecycle/StateManager.ts
- src/modules/lifecycle/__tests__/AppLifecycle.test.ts

## Type Definitions

```typescript
type AppState = 'launching' | 'active' | 'background' | 'suspended' | 'terminating';

interface IAppLifecycle {
  // State
  getState(): AppState;
  isActive(): boolean;
  isBackground(): boolean;
  
  // Lifecycle Hooks
  onLaunch(handler: () => Promise<void>): void;
  onRelaunch(handler: (params: LaunchParams) => void): void;
  onPause(handler: () => void): void;
  onResume(handler: () => void): void;
  onClose(handler: () => Promise<boolean>): void;  // Return false to cancel
  
  // State Persistence
  saveState(): Promise<void>;
  restoreState(): Promise<PersistentState | null>;
  clearState(): Promise<void>;
  
  // webOS Integration
  registerForVisibilityChanges(): void;
  keepAlive(): void;             // Prevent suspension
  stopKeepAlive(): void;
  
  // Events
  on(event: 'stateChange', handler: (state: AppState) => void): void;
  on(event: 'visibilityChange', handler: (visible: boolean) => void): void;
}

interface PersistentState {
  version: number;
  currentChannelId: string | null;
  lastPlaybackPosition: {
    channelId: string;
    positionMs: number;
    timestamp: number;
  } | null;
  volume: number;
}

interface LaunchParams {
  action?: string;
  channelId?: string;
  fromDeepLink?: boolean;
}
```

## Implementation Requirements

1. **Visibility Change Detection**:
```typescript
registerForVisibilityChanges() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      this.transitionTo('background');
      this.emit('visibilityChange', false);
    } else {
      this.transitionTo('active');
      this.emit('visibilityChange', true);
    }
  });
  
  // webOS-specific
  window.addEventListener('webOSRelaunch', (e: CustomEvent) => {
    this.handleRelaunch(e.detail);
  });
}
```

2. **Keep-Alive** (Prevent webOS Suspension):
```typescript
keepAlive() {
  this.keepAliveInterval = setInterval(() => {
    // Touch DOM to prevent suspension
    document.dispatchEvent(new Event('click'));
  }, 30000);
}
```

3. **State Persistence**: localStorage key 'retune_app_state'

## Error Handling
| Error | Recovery |
|-------|----------|
| State restore fails | Return null, start fresh |
| Save fails (quota) | Clear old data, retry |
| Visibility API missing | Use focus/blur events |

## Test Specifications
```typescript
describe('AppLifecycle', () => {
  describe('state transitions', () => {
    it('should start in launching state');
    it('should transition to active after launch');
    it('should transition to background on visibility hidden');
    it('should transition to active on visibility visible');
    it('should emit stateChange events');
  });
  
  describe('lifecycle hooks', () => {
    it('should call onLaunch once at startup');
    it('should call onPause when backgrounded');
    it('should call onResume when foregrounded');
    it('should call onClose before termination');
  });
  
  describe('state persistence', () => {
    it('should save state to localStorage');
    it('should restore state on init');
    it('should handle missing state gracefully');
    it('should handle corrupted state gracefully');
  });
  
  describe('keep-alive', () => {
    it('should touch DOM every 30 seconds');
    it('should stop on stopKeepAlive call');
  });
  
  describe('webOS integration', () => {
    it('should handle webOSRelaunch event');
    it('should parse launch parameters');
  });
});
```

## Deliverable
Complete implementation with webOS integration and state management.
```

---

## Prompt 13: App Orchestrator Module (Priority 7)

```
You are implementing the App Orchestrator module for Retune, a webOS TV application.

## Task
Coordinate all modules, handle initialization sequence, and manage cross-module communication.

## Files to Create
- src/core/Orchestrator.ts
- src/core/interfaces.ts
- src/App.ts
- src/index.ts
- src/__tests__/Orchestrator.test.ts
- src/__tests__/integration/FullFlow.test.ts

## Type Definitions

```typescript
interface IOrchestratorConfig {
  containerId: string;
  debugMode?: boolean;
}

interface IOrchestrator {
  initialize(config: IOrchestratorConfig): Promise<void>;
  destroy(): void;
  
  // Module Access
  getAuth(): IPlexAuth;
  getDiscovery(): IPlexServerDiscovery;
  getLibrary(): IPlexLibrary;
  getStreamResolver(): IPlexStreamResolver;
  getChannelManager(): IChannelManager;
  getScheduler(): IChannelScheduler;
  getPlayer(): IVideoPlayer;
  getNavigation(): INavigationManager;
  getEPG(): IEPGComponent;
  getLifecycle(): IAppLifecycle;
}
```

## Initialization Sequence

```typescript
async initialize(config: IOrchestratorConfig): Promise<void> {
  try {
    // Phase 1: Core Infrastructure
    this.eventEmitter = new EventEmitter();
    this.lifecycle = new AppLifecycle();
    this.lifecycle.registerForVisibilityChanges();
    
    // Phase 2: Navigation (needed for all screens)
    this.navigation = new NavigationManager({ containerId: config.containerId });
    this.navigation.initialize();
    
    // Phase 3: Plex Authentication
    this.auth = new PlexAuth(PLEX_CONFIG);
    await this.auth.loadStoredCredentials();
    
    if (!this.auth.isAuthenticated()) {
      this.navigation.goTo('auth');
      return; // Wait for auth completion
    }
    
    // Phase 4: Server Connection
    this.discovery = new PlexServerDiscovery(this.auth);
    const servers = await this.discovery.discoverServers();
    
    if (!this.discovery.getSelectedServer()) {
      this.navigation.goTo('serverSelect');
      return; // Wait for server selection
    }
    
    // Phase 5: Library & Content
    this.library = new PlexLibrary(this.auth, this.discovery.getServerUri()!);
    this.streamResolver = new PlexStreamResolver(this.auth, this.discovery.getServerUri()!);
    
    // Phase 6: Channels
    this.channelManager = new ChannelManager(this.library);
    await this.channelManager.loadChannels();
    
    // Phase 7: Playback
    this.scheduler = new ChannelScheduler();
    this.player = new VideoPlayer();
    await this.player.initialize({ containerId: config.containerId });
    
    // Phase 8: UI
    this.epg = new EPGComponent();
    this.epg.initialize(EPG_CONFIG);
    
    // Phase 9: Bind Events
    this.setupEventBindings();
    
    // Phase 10: Start Playback
    const currentChannel = this.channelManager.getCurrentChannel();
    if (currentChannel) {
      await this.switchToChannel(currentChannel.id);
    }
    
    this.navigation.goTo('home');
    this.lifecycle.keepAlive();
    
  } catch (error) {
    this.handleInitError(error);
  }
}
```

## Event Bindings

```typescript
setupEventBindings() {
  // Auth changes
  this.auth.on('authChange', (isAuthenticated) => {
    if (!isAuthenticated) {
      this.player.stop();
      this.navigation.goTo('auth');
    }
  });
  
  // Program transitions
  this.scheduler.on('programStart', async (program) => {
    const stream = await this.resolveStreamForProgram(program);
    await this.player.loadStream(stream);
    await this.player.seekTo(program.elapsedMs);
    await this.player.play();
  });
  
  this.scheduler.on('programEnd', (program) => {
    // Next program will be handled by next programStart
  });
  
  // Content changes
  this.channelManager.on('contentResolved', (content) => {
    if (content.channelId === this.channelManager.getCurrentChannel()?.id) {
      this.scheduler.loadChannel({
        channelId: content.channelId,
        anchorTime: this.channelManager.getCurrentChannel()!.anchorTime,
        content: content.items,
        playbackMode: this.channelManager.getCurrentChannel()!.playbackMode,
        shuffleSeed: this.channelManager.getCurrentChannel()!.shuffleSeed,
        loopSchedule: true
      });
    }
  });
  
  // Channel switching
  this.channelManager.on('channelSwitch', async (channel) => {
    await this.switchToChannel(channel.id);
  });
  
  // EPG selection
  this.epg.on('channelSelected', ({ channel }) => {
    this.channelManager.switchToChannel(channel.id);
    this.epg.hide();
  });
  
  // Lifecycle
  this.lifecycle.onPause(() => {
    this.player.pause();
    this.lifecycle.saveState();
  });
  
  this.lifecycle.onResume(() => {
    this.scheduler.syncToCurrentTime();
    this.player.play();
  });
  
  // Player errors
  this.player.on('error', (error) => {
    if (error.code === 'NETWORK_ERROR' && error.retryable) {
      // Retry handled by player
    } else {
      // Skip to next program
      this.scheduler.skipToNext();
    }
  });
}
```

## Error Handling

```typescript
handleInitError(error: Error) {
  console.error('Initialization failed:', error);
  
  if (error.message.includes('auth')) {
    this.navigation.goTo('auth');
  } else if (error.message.includes('server')) {
    this.navigation.goTo('serverSelect');
  } else {
    this.navigation.goTo('error', { 
      message: 'Failed to initialize. Please restart.',
      action: 'Retry',
      onAction: () => window.location.reload()
    });
  }
}
```

## Test Specifications

```typescript
describe('Orchestrator', () => {
  describe('initialization sequence', () => {
    it('should initialize modules in correct order');
    it('should stop at auth screen when not authenticated');
    it('should stop at server select when no server selected');
    it('should complete full init when authenticated with server');
    it('should handle init errors gracefully');
  });
  
  describe('event propagation', () => {
    it('should handle auth changes');
    it('should handle program start events');
    it('should handle channel switch events');
    it('should handle lifecycle pause/resume');
    it('should handle player errors');
  });
  
  describe('channel switching', () => {
    it('should resolve content for new channel');
    it('should load schedule into scheduler');
    it('should resolve stream for current program');
    it('should seek player to correct position');
  });
  
  describe('error recovery', () => {
    it('should recover from stream errors by skipping');
    it('should recover from network errors with retry');
    it('should redirect to auth on token expiry');
  });
});

// Integration tests
describe('Integration: Full Channel Switch Flow', () => {
  it('should complete channel switch end-to-end', async () => {
    // 1. User presses channel up
    // 2. ChannelManager emits channelSwitch
    // 3. Orchestrator resolves content
    // 4. Scheduler loads and emits programStart
    // 5. Player loads and plays stream
    // Verify all steps complete within 3 seconds
  });
  
  it('should recover from complete server disconnect', async () => {
    // 1. Simulate network disconnect
    // 2. Player emits error
    // 3. Orchestrator attempts recovery
    // 4. If recovery fails, show error screen
  });
});
```

## Mock Requirements
- All module interfaces should be mockable
- Use dependency injection for testability

## Deliverable
Complete Orchestrator with App.ts entry point, full event bindings, and integration tests.
```

---

