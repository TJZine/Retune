# Module: Video Player Abstraction

## Metadata

- **ID**: `video-player`
- **Path**: `src/modules/player/`
- **Primary File**: `VideoPlayer.ts`
- **Test File**: `VideoPlayer.test.ts`
- **Dependencies**: `plex-stream-resolver`
- **Complexity**: high
- **Estimated LoC**: 480

## Purpose

Provides a unified interface for media playback on webOS, abstracting the HTML5 video element and webOS-specific behaviors. Handles HLS/direct stream initialization, playback control, subtitle/audio track management, error recovery, and system keep-alive to prevent suspension during long playback sessions.

## Public Interface

```typescript
/**
 * Video Player Interface
 * Abstraction over HTML5 video for webOS platform
 */
export interface IVideoPlayer {
  // Lifecycle
  initialize(config: VideoPlayerConfig): Promise<void>;
  destroy(): void;

  // Stream Management
  loadStream(descriptor: StreamDescriptor): Promise<void>;
  unloadStream(): void;

  // Playback Control
  play(): Promise<void>;
  pause(): void;
  stop(): void;
  seekTo(positionMs: number): Promise<void>;
  seekRelative(deltaMs: number): Promise<void>;

  // Volume
  setVolume(level: number): void;
  getVolume(): number;
  mute(): void;
  unmute(): void;
  toggleMute(): void;

  // Tracks
  setSubtitleTrack(trackId: string | null): Promise<void>;
  setAudioTrack(trackId: string): Promise<void>;
  getAvailableSubtitles(): SubtitleTrack[];
  getAvailableAudio(): AudioTrack[];

  // State
  getState(): PlaybackState;
  getCurrentTimeMs(): number;
  getDurationMs(): number;
  isPlaying(): boolean;

  // Events
  on<K extends keyof PlayerEventMap>(
    event: K,
    handler: (payload: PlayerEventMap[K]) => void
  ): void;
  off<K extends keyof PlayerEventMap>(
    event: K,
    handler: (payload: PlayerEventMap[K]) => void
  ): void;

  // webOS Specific
  requestMediaSession(): void;
  releaseMediaSession(): void;
}
```

## Required Exports

```typescript
// src/modules/player/index.ts
export { VideoPlayer } from './VideoPlayer';
export { SubtitleManager } from './SubtitleManager';
export type { IVideoPlayer } from './interfaces';
export type {
  VideoPlayerConfig,
  StreamDescriptor,
  MediaMetadata,
  SubtitleTrack,
  AudioTrack,
  PlaybackState,
  PlayerStatus,
  PlaybackError,
  PlaybackErrorCode,
  TimeRange
} from './types';
```

## Implementation Requirements

### MUST Implement:

1. **HTML5 Video Element Wrapper**
   - Create video element dynamically
   - Style for full-screen playback
   - Handle all video events (loadstart, canplay, playing, pause, seeking, seeked, ended, error, timeupdate, progress)

2. **HLS Native Support**
   - webOS has native HLS support - DO NOT use HLS.js
   - Set video.src directly for HLS streams
   - Use `<source>` element for direct play streams

3. **Subtitle Track Management**
   - Create `<track>` elements for VTT/SRT subtitles
   - Handle PGS/ASS as "burn-in required" (inform Plex to transcode)
   - Manage showing/hiding subtitle tracks

4. **Error Recovery**
   - Implement retry with exponential backoff for recoverable errors
   - Emit clear error events for unrecoverable errors
   - Map MediaError codes to PlaybackErrorCode enum

5. **Keep-Alive Mechanism**
   - Prevent webOS from suspending app during long playback
   - Touch DOM periodically (every 30 seconds while playing)
   - Critical for 24/7 channel operation

6. **Position Reporting**
   - Expose current position in milliseconds
   - Support seeking to absolute and relative positions
   - Handle seek buffering gracefully

### MUST NOT:

1. Use third-party HLS libraries (HLS.js causes memory bloat on webOS)
2. Create multiple video elements simultaneously
3. Block main thread during operations
4. Allow volume > 1.0 or < 0.0

### State Management:

```typescript
interface VideoPlayerInternalState {
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
  currentDescriptor: StreamDescriptor | null;
}
```

- **Persistence**: None (ephemeral playback state)
- **Initialization**: Set to idle state on `initialize()`

### Error Handling:

| MediaError Code | PlaybackErrorCode | Recoverable | Action |
|-----------------|-------------------|-------------|--------|
| MEDIA_ERR_NETWORK (2) | NETWORK_ERROR | Yes | Retry with backoff |
| MEDIA_ERR_DECODE (3) | DECODE_ERROR | No | Skip to next |
| MEDIA_ERR_SRC_NOT_SUPPORTED (4) | FORMAT_UNSUPPORTED | No | Request transcode |
| Unknown | UNKNOWN | No | Report and skip |

## Method Specifications

### `initialize(config: VideoPlayerConfig): Promise<void>`

**Purpose**: Create video element and set up event listeners.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| config | VideoPlayerConfig | Yes | Player configuration |

**Side Effects**:

- Creates and appends video element to DOM
- Sets up all event listeners
- Starts keep-alive interval

**Implementation Notes**:

```typescript
async initialize(config: VideoPlayerConfig): Promise<void> {
  this.config = config;
  
  // Create video element
  this.videoElement = document.createElement('video');
  this.videoElement.id = 'retune-video-player';
  this.videoElement.style.cssText = `
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    background: #000;
    object-fit: contain;
  `;
  
  // Append to container
  const container = document.getElementById(config.containerId);
  if (!container) throw new Error('Video container not found');
  container.appendChild(this.videoElement);
  
  // Set default volume
  this.videoElement.volume = config.defaultVolume;
  
  // Setup event listeners
  this.setupEventListeners();
  
  // Start keep-alive for webOS
  this.startKeepAlive();
  
  this.state = this.createInitialState();
}
```

---

### `loadStream(descriptor: StreamDescriptor): Promise<void>`

**Purpose**: Load a media stream for playback.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| descriptor | StreamDescriptor | Yes | Stream to load |

**Returns**: Promise that resolves when media is ready to play

**Side Effects**:

- Unloads any existing stream
- Sets video source
- Loads subtitle tracks
- Updates state to 'loading'

**Implementation Notes**:

```typescript
async loadStream(descriptor: StreamDescriptor): Promise<void> {
  this.unloadStream();
  this.state.currentDescriptor = descriptor;
  this.updateStatus('loading');
  
  // Set source based on protocol
  if (descriptor.protocol === 'hls') {
    // webOS handles HLS natively
    this.videoElement.src = descriptor.url;
  } else {
    // Direct play - use source element with type hint
    const source = document.createElement('source');
    source.src = descriptor.url;
    source.type = descriptor.mimeType;
    this.videoElement.appendChild(source);
  }
  
  // Set start position
  if (descriptor.startPositionMs > 0) {
    this.videoElement.currentTime = descriptor.startPositionMs / 1000;
  }
  
  // Load subtitle tracks
  this.loadSubtitleTracks(descriptor.subtitleTracks);
  
  // Update duration
  this.state.durationMs = descriptor.durationMs;
  
  // Trigger load
  await this.videoElement.load();
}
```

---

### `seekTo(positionMs: number): Promise<void>`

**Purpose**: Seek to an absolute position.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| positionMs | number | Yes | Target position in milliseconds |

**Returns**: Promise that resolves when seek completes

**Side Effects**:

- Updates status to 'seeking'
- Triggers video 'seeking' event

**Implementation Notes**:

```typescript
async seekTo(positionMs: number): Promise<void> {
  const positionSec = Math.max(0, positionMs / 1000);
  const durationSec = this.videoElement.duration || Infinity;
  
  this.videoElement.currentTime = Math.min(positionSec, durationSec);
  
  // Wait for seeked event
  return new Promise((resolve) => {
    const handler = () => {
      this.videoElement.removeEventListener('seeked', handler);
      resolve();
    };
    this.videoElement.addEventListener('seeked', handler);
  });
}
```

---

### `setSubtitleTrack(trackId: string | null): Promise<void>`

**Purpose**: Enable or disable a subtitle track.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| trackId | string \| null | Yes | Track ID to enable, null to disable |

**Side Effects**:

- Shows/hides text tracks
- Updates state

**Implementation Notes**:

```typescript
async setSubtitleTrack(trackId: string | null): Promise<void> {
  const tracks = this.videoElement.textTracks;
  
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    if (trackId && track.id === trackId) {
      track.mode = 'showing';
    } else {
      track.mode = 'hidden';
    }
  }
  
  this.state.activeSubtitleId = trackId;
  this.emit('trackChange', { type: 'subtitle', trackId });
}
```

---

### `setAudioTrack(trackId: string): Promise<void>`

**Purpose**: Switch active audio track.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| trackId | string | Yes | Audio track ID to activate |

**Side Effects**:

- Switches audio track
- Updates state
- May briefly interrupt audio

**Error Handling**:

| Error Scenario | Handling | User Impact |
|---------------|----------|-------------|
| Track not found | Throw `TRACK_NOT_FOUND`, keep current track | Show "Track unavailable" notification |
| HLS track switch fails | Retry once, then throw `TRACK_SWITCH_FAILED` | Show "Unable to switch audio" notification |
| Track switch timeout (5s) | Cancel switch, restore previous | Show "Audio switch timed out" |
| Codec not supported | Throw `CODEC_UNSUPPORTED` | Show "Audio format not supported" |

**Implementation Notes**:

```typescript
async setAudioTrack(trackId: string): Promise<void> {
  const availableTracks = this.getAvailableAudio();
  const targetTrack = availableTracks.find(t => t.id === trackId);
  
  if (!targetTrack) {
    throw new VideoPlayerError('TRACK_NOT_FOUND', `Audio track ${trackId} not found`);
  }
  
  const previousTrackId = this.state.activeAudioId;
  
  try {
    // For HLS streams, audio tracks are managed by the video element
    const audioTracks = this.videoElement.audioTracks;
    
    // Set timeout for track switch
    const switchPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new VideoPlayerError('TRACK_SWITCH_TIMEOUT', 'Audio switch timed out'));
      }, 5000);
      
      // Find and enable the target track
      for (let i = 0; i < audioTracks.length; i++) {
        if (audioTracks[i].id === trackId) {
          audioTracks[i].enabled = true;
        } else {
          audioTracks[i].enabled = false;
        }
      }
      
      // Wait for audio to start playing with new track
      const checkInterval = setInterval(() => {
        // Verify the track switch took effect
        const activeTrack = audioTracks[targetTrack.index];
        if (activeTrack && activeTrack.enabled) {
          clearTimeout(timeout);
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
    
    await switchPromise;
    
    this.state.activeAudioId = trackId;
    this.emit('trackChange', { type: 'audio', trackId });
    
  } catch (error) {
    // Attempt to restore previous track
    if (previousTrackId) {
      try {
        await this._restoreAudioTrack(previousTrackId);
      } catch (restoreError) {
        console.error('Failed to restore previous audio track:', restoreError);
      }
    }
    throw error;
  }
}

private async _restoreAudioTrack(trackId: string): Promise<void> {
  const audioTracks = this.videoElement.audioTracks;
  for (let i = 0; i < audioTracks.length; i++) {
    audioTracks[i].enabled = audioTracks[i].id === trackId;
  }
}
```

## Internal Architecture

### Private Methods:

- `_setupEventListeners()`: Bind all video element events
- `_updateStatus(status)`: Update state and emit stateChange
- `_handleCanPlay()`: Transition from loading to ready
- `_handleEnded()`: Emit ended event
- `_handleError(event)`: Map error, attempt retry or emit
- `_handleTimeUpdate()`: Emit timeUpdate event
- `_handleProgress()`: Calculate buffer level
- `_startKeepAlive()`: Begin 30-second interval
- `_stopKeepAlive()`: Clear interval
- `_loadSubtitleTracks(tracks)`: Create track elements
- `_scheduleRetry()`: Exponential backoff retry

### Class Diagram:

```mermaid
┌─────────────────────────────────┐
│         VideoPlayer             │
├─────────────────────────────────┤
│ - videoElement: HTMLVideoElement│
│ - config: VideoPlayerConfig     │
│ - state: PlaybackState          │
│ - eventEmitter: EventEmitter    │
│ - keepAliveInterval: number     │
│ - retryTimer: number            │
│ - retryCount: number            │
├─────────────────────────────────┤
│ + initialize(config): Promise   │
│ + destroy(): void               │
│ + loadStream(desc): Promise     │
│ + unloadStream(): void          │
│ + play(): Promise               │
│ + pause(): void                 │
│ + stop(): void                  │
│ + seekTo(ms): Promise           │
│ + seekRelative(ms): Promise     │
│ + setVolume(level): void        │
│ + getVolume(): number           │
│ + mute(): void                  │
│ + unmute(): void                │
│ + toggleMute(): void            │
│ + setSubtitleTrack(): Promise   │
│ + setAudioTrack(): Promise      │
│ + getAvailableSubtitles()       │
│ + getAvailableAudio()           │
│ + getState(): PlaybackState     │
│ + getCurrentTimeMs(): number    │
│ + getDurationMs(): number       │
│ + isPlaying(): boolean          │
│ + on(event, handler): void      │
│ + off(event, handler): void     │
│ - _setupEventListeners(): void  │
│ - _updateStatus(): void         │
│ - _handleError(): void          │
│ - _scheduleRetry(): void        │
│ - _startKeepAlive(): void       │
└─────────────────────────────────┘
```

## Events Emitted

| Event Name | Payload Type | When Emitted |
|------------|--------------|--------------|
| `stateChange` | `PlaybackState` | Any state change |
| `timeUpdate` | `{ currentTimeMs, durationMs }` | Every ~250ms during playback |
| `bufferUpdate` | `{ percent, bufferedRanges }` | Buffer level changes |
| `trackChange` | `{ type, trackId }` | Audio or subtitle track changed |
| `ended` | `void` | Playback reached end |
| `error` | `PlaybackError` | Unrecoverable error occurred |
| `mediaLoaded` | `{ durationMs, tracks }` | Media metadata loaded |

## Events Consumed

| Event Name | Source Module | Handler Behavior |
|------------|---------------|------------------|
| `programStart` | `channel-scheduler` | Load new stream via orchestrator |

## Test Specification

### Unit Tests Required:

```typescript
describe('VideoPlayer', () => {
  describe('initialize', () => {
    it('should create video element in container', async () => {
      // Verify video element exists in DOM
    });
    
    it('should set default volume', async () => {
      // Verify video.volume matches config.defaultVolume
    });
    
    it('should throw if container not found', async () => {
      // Config with invalid containerId
    });
  });
  
  describe('loadStream', () => {
    it('should set video.src for HLS streams', async () => {
      const descriptor = { protocol: 'hls', url: 'http://test.m3u8' };
      // Verify video.src is set
    });
    
    it('should create source element for direct play', async () => {
      const descriptor = { protocol: 'direct', mimeType: 'video/mp4' };
      // Verify source element created
    });
    
    it('should seek to startPositionMs', async () => {
      const descriptor = { startPositionMs: 60000 };
      // Verify video.currentTime is 60
    });
    
    it('should load subtitle tracks', async () => {
      const descriptor = { subtitleTracks: [{ id: 'en' }] };
      // Verify track element created
    });
  });
  
  describe('playback control', () => {
    it('should call video.play() on play()', async () => {
      // Mock video.play
    });
    
    it('should call video.pause() on pause()', () => {
      // Mock video.pause
    });
    
    it('should stop and unload on stop()', () => {
      // Verify video.src cleared
    });
  });
  
  describe('seeking', () => {
    it('should seek to absolute position', async () => {
      await player.seekTo(120000);
      // Verify video.currentTime is 120
    });
    
    it('should seek forward with positive delta', async () => {
      // Current time 60s, seekRelative(10000) → 70s
    });
    
    it('should seek backward with negative delta', async () => {
      // Current time 60s, seekRelative(-10000) → 50s
    });
    
    it('should clamp seek to valid range', async () => {
      // seekTo(-5000) → 0
      // seekTo(duration + 1000) → duration
    });
  });
  
  describe('error handling', () => {
    it('should retry on NETWORK_ERROR with exponential backoff', async () => {
      // Trigger MEDIA_ERR_NETWORK
      const retrySpy = jest.spyOn(player as any, '_scheduleRetry');
      triggerError(2); // MEDIA_ERR_NETWORK
      
      // First retry after 1s
      expect(retrySpy).toHaveBeenCalledWith(1000);
      
      // Trigger again - second retry after 2s
      jest.advanceTimersByTime(1000);
      triggerError(2);
      expect(retrySpy).toHaveBeenCalledWith(2000);
      
      // Third retry after 4s
      jest.advanceTimersByTime(2000);
      triggerError(2);
      expect(retrySpy).toHaveBeenCalledWith(4000);
    });
    
    it('should emit error on DECODE_ERROR (non-recoverable)', () => {
      const errorHandler = jest.fn();
      player.on('error', errorHandler);
      
      triggerError(3); // MEDIA_ERR_DECODE
      
      // VERBATIM ASSERTION: Exact structure expected
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'DECODE_ERROR',
          recoverable: false
        })
      );
    });
    
    it('should stop retrying after max attempts (3)', () => {
      const errorHandler = jest.fn();
      player.on('error', errorHandler);
      
      // Exhaust all 3 retry attempts
      for (let i = 0; i < 4; i++) {
        triggerError(2);
        jest.advanceTimersByTime(Math.pow(2, i) * 1000);
      }
      
      // VERBATIM ASSERTION: Must include retryCount
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'NETWORK_ERROR',
          recoverable: false,
          retryCount: 3
        })
      );
    });
    
    it('should map MediaError codes correctly', () => {
      const errorCases = [
        { mediaCode: 2, expected: 'NETWORK_ERROR' },
        { mediaCode: 3, expected: 'DECODE_ERROR' },
        { mediaCode: 4, expected: 'FORMAT_UNSUPPORTED' },
      ];
      
      errorCases.forEach(({ mediaCode, expected }) => {
        const result = player['_mapMediaError'](mediaCode);
        // VERBATIM ASSERTION: Exact code mapping
        expect(result.code).toBe(expected);
      });
    });
  });
  
  describe('keep-alive', () => {
    it('should touch DOM every 30 seconds while playing', () => {
      // Mock setInterval
      // Verify callback executes
    });
    
    it('should not touch DOM when paused', () => {
      // Pause player
      // Verify no DOM touch
    });
  });
});
```

### Mock Requirements:

When testing this module, mock:

- `HTMLVideoElement` prototype methods
- `document.getElementById`
- `document.createElement`
- `setInterval`/`clearInterval`

## File Structure

```text
src/modules/player/
├── index.ts              # Public exports
├── VideoPlayer.ts        # Main class implementation
├── SubtitleManager.ts    # Text track handling
├── interfaces.ts         # IVideoPlayer interface
├── types.ts              # Player-specific types
├── constants.ts          # Event names, timeouts
└── __tests__/
    ├── VideoPlayer.test.ts
    └── SubtitleManager.test.ts
```

## State Machine

```mermaid
                    loadStream()
        ┌──────────────────────────────────┐
        │                                  ▼
    ┌───────┐                         ┌─────────┐
    │ IDLE  │                         │ LOADING │
    └───────┘                         └─────────┘
        ▲                                  │
        │ stop() / unload()                │ canplay event
        │                                  ▼
        │                            ┌───────────┐
        │      ┌─────────────────────│ BUFFERING │◄────────────────┐
        │      │                     └───────────┘                 │
        │      │ buffer ready             │                        │
        │      ▼                          │ play()                 │
        │  ┌─────────┐                    ▼                        │
        │  │  ENDED  │◄──────────── ┌─────────┐ ──── waiting ──────┘
        │  └─────────┘   ended      │ PLAYING │      (buffer empty)
        │      │                    └─────────┘
        │      │ loadStream()            │ ▲
        │      └───────────────┐         │ │
        │                      │  pause()│ │play()
        │                      ▼         ▼ │
        │                   ┌───────┐  ┌────────┐
        │                   │LOADING│  │ PAUSED │
        │                   └───────┘  └────────┘
        │                                  │
        │                        seekTo()  │
        │                      ┌───────────┘
        │                      ▼
        │                 ┌─────────┐
        │                 │ SEEKING │
        │                 └─────────┘
        │                      │
        │                      │ seeked event
        │                      ▼
        │               (return to PLAYING or PAUSED)
        │
    ┌───────┐
    │ ERROR │◄─────── Any state on unrecoverable error
    └───────┘
```

## Implementation Checklist

- [ ] Create file structure
- [ ] Implement video element creation and styling
- [ ] Implement all event listeners
- [ ] Implement HLS source loading (native)
- [ ] Implement direct play source loading
- [ ] Implement subtitle track loading
- [ ] Implement play/pause/stop controls
- [ ] Implement seeking (absolute and relative)
- [ ] Implement volume control
- [ ] Implement error handling with retry
- [ ] Implement keep-alive mechanism
- [ ] Write unit tests with mocked video element
- [ ] Add JSDoc comments to all public methods
- [ ] Verify against acceptance criteria

## Common Pitfalls

> [!CAUTION]
> **AI implementers: Avoid these common mistakes**

| Pitfall | Why It Happens | Correct Approach |
| :--- | :--- | :--- |
| Using HLS.js on webOS | Works elsewhere | webOS has native HLS - use `video.src` directly |
| Multiple video elements | Seems logical for preloading | Single video element only - memory constraints |
| Ignoring keep-alive | Works in dev | webOS suspends after ~5 min idle - touch DOM every 30s |
| Volume > 1.0 | Boost audio | Clamp to [0.0, 1.0] - values >1 cause distortion |
| Sync seekTo with await | Seems more reliable | Return Promise that resolves on 'seeked' event |
| Not handling MEDIA_ERR_SRC_NOT_SUPPORTED | Rare error | Request transcode from Plex, don't just skip |
| Retry forever on network | "Eventually works" | Max 3 retries with exponential backoff, then emit error |
| currentTime in seconds | video.currentTime is seconds | Convert to/from ms consistently in all APIs |

---

## Acceptance Criteria

This module is COMPLETE when:

1. [ ] HLS streams play without third-party libraries
2. [ ] Direct play streams work with correct MIME types
3. [ ] Subtitle tracks can be enabled/disabled
4. [ ] Seeking works for both absolute and relative positions
5. [ ] Errors are handled with retry for recoverable types
6. [ ] Keep-alive prevents suspension during long playback
7. [ ] All state transitions emit appropriate events
8. [ ] All unit tests pass
9. [ ] No TypeScript compilation errors
