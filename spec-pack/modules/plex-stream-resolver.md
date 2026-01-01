# Module: Plex Stream Resolver

## Metadata

- **ID**: `plex-stream-resolver`
- **Path**: `src/modules/plex/stream/`
- **Primary File**: `PlexStreamResolver.ts`
- **Test File**: `PlexStreamResolver.test.ts`
- **Dependencies**: `plex-auth`, `plex-server-discovery`
- **Complexity**: medium
- **Estimated LoC**: 320

## API Reference

> [!TIP]
> **Official Documentation**: Use Context7 with `/websites/developer_plex_tv_pms` for latest API specs.  
> **Local Examples**: See `spec-pack/artifact-9-plex-api-examples.md` for JSON response samples.

| Endpoint | Purpose |
|----------|---------|
| `GET /library/metadata/{key}` | Get stream info (Media/Part/Stream arrays) |
| `GET /library/parts/{id}/file.{ext}` | Direct play URL |
| `GET /video/:/transcode/universal/start.m3u8` | HLS transcode URL |
| `POST /:/timeline` | Report playback progress |
| `DELETE /transcode/sessions/{key}` | Kill transcode session |

## Purpose

Resolves playback URLs from Plex Media Server, handling the decision between direct play and transcoding based on media compatibility. Manages playback sessions for progress tracking and generates properly formatted stream requests.

## Public Interface

```typescript
/**
 * Plex Stream Resolver Interface
 */
export interface IPlexStreamResolver {
  // Stream Resolution
  resolveStream(request: StreamRequest): Promise<StreamDecision>;
  
  // Session Management
  startSession(itemKey: string): Promise<string>;
  updateProgress(sessionId: string, itemKey: string, positionMs: number, state: 'playing' | 'paused' | 'stopped'): Promise<void>;
  endSession(sessionId: string, itemKey: string): Promise<void>;
  
  // Direct Play Check
  canDirectPlay(item: PlexMediaItem): boolean;
  
  // Transcode Options
  getTranscodeUrl(itemKey: string, options: HlsOptions): string;
  
  // Events
  on(event: 'sessionStart', handler: (session: { sessionId: string; itemKey: string }) => void): void;
  on(event: 'sessionEnd', handler: (session: { sessionId: string; itemKey: string; positionMs: number }) => void): void;
  on(event: 'error', handler: (error: StreamResolverError) => void): void;
}

/**
 * Stream Resolver Error Codes
 */
type StreamResolverErrorCode =
  | 'ITEM_NOT_FOUND'           // 404 - Item doesn't exist in Plex
  | 'SERVER_BUSY'              // 503 - Transcoder overloaded
  | 'UNSUPPORTED_CODEC'        // Decision returned incompatible codec
  | 'NETWORK_TIMEOUT'          // Request timed out
  | 'SESSION_EXPIRED'          // 401 - Token expired
  | 'MIXED_CONTENT_BLOCKED'    // HTTP blocked by HTTPS app
  | 'TRANSCODE_FAILED';        // Server failed to start transcoding

interface StreamResolverError {
  code: StreamResolverErrorCode;
  message: string;
  recoverable: boolean;
  retryAfterMs?: number;
}

/**
 * Retry Budget Configuration
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  retryDelayMs: [1000, 2000, 4000],  // Exponential backoff
  timeoutMs: 10000,                   // Per-request timeout
  retryableCodes: ['SERVER_BUSY', 'NETWORK_TIMEOUT'] as StreamResolverErrorCode[],
} as const;
```

## Required Exports

```typescript
// src/modules/plex/stream/index.ts
export { PlexStreamResolver } from './PlexStreamResolver';
export type { IPlexStreamResolver } from './interfaces';
export type {
  StreamRequest,
  StreamDecision,
  HlsOptions
} from './types';
```

## Implementation Requirements

### MUST Implement:

1. **Direct Play Detection**
   - Check container compatibility (MP4, MKV)
   - Check video codec compatibility (H.264)
   - Check audio codec compatibility (AAC, AC3)
   - webOS supports: MP4/MKV with H.264/H.265 and AAC/AC3

2. **Transcode URL Generation**

   ```text
   /video/:/transcode/universal/start.m3u8
   ?path=/library/metadata/{key}
   &mediaIndex=0
   &partIndex=0
   &protocol=hls
   &X-Plex-Token={token}
   &X-Plex-Client-Identifier={clientId}
   &X-Plex-Platform=webOS
   ```

3. **Playback Session Management**
   - Report timeline updates to Plex
   - Enables "Continue Watching" feature
   - Required for transcoding to work correctly

4. **Stream Selection**
   - Choose best available media version
   - Prefer highest compatible resolution
   - Consider bitrate limits

### MUST NOT:

1. Use third-party transcoding
2. Attempt unsupported codecs directly
3. Skip session reporting (breaks Plex features)

### Mixed Content Handling (CRITICAL for webOS):

webOS apps served over HTTPS may encounter issues accessing local Plex servers over HTTP (mixed content blocking). This must be handled explicitly:

```typescript
/**
 * Resolves playback URL with mixed content mitigation
 */
buildPlaybackUrl(partKey: string, serverUri: string): string {
  const url = new URL(partKey, serverUri);
  
  // If app is served over HTTPS and server is HTTP (local LAN)
  if (window.location.protocol === 'https:' && url.protocol === 'http:') {
    // Strategy 1: Try to use HTTPS connection if available
    const httpsConnection = this.discovery.getHttpsConnection();
    if (httpsConnection) {
      return new URL(partKey, httpsConnection.uri).toString();
    }
    
    // Strategy 2: Use Plex relay as fallback (slower but works)
    const relayConnection = this.discovery.getRelayConnection();
    if (relayConnection) {
      console.warn('Using Plex relay due to mixed content restrictions');
      return new URL(partKey, relayConnection.uri).toString();
    }
    
    // Strategy 3: Log warning and proceed (webOS may allow it)
    console.warn('Mixed content detected - playback may fail:', url.href);
  }
  
  return `${serverUri}${partKey}?X-Plex-Token=${this.auth.getCurrentUser()?.token}`;
}
```

**Error Recovery for Mixed Content**:

| Scenario | Detection | Recovery |
|----------|-----------|----------|
| HTTP blocked | Playback fails with network error | Switch to HTTPS/relay connection |
| Relay slow | Latency >500ms | Show buffering indicator, continue |
| No fallback available | All connections fail | Display error with "Change Server" option |

### State Management:

```typescript
interface StreamResolverState {
  activeSessions: Map<string, {
    sessionId: string;
    itemKey: string;
    startTime: number;
    lastUpdate: number;
  }>;
}
```

## Method Specifications

### `resolveStream(request: StreamRequest): Promise<StreamDecision>`

**Purpose**: Determine the best way to play content and return playback URL.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| request | StreamRequest | Yes | Stream request parameters |

**Returns**: `StreamDecision` with playback URL and stream info

**Implementation Notes**:

```typescript
async resolveStream(request: StreamRequest): Promise<StreamDecision> {
  // Get item metadata
  const item = await this.plexLibrary.getItem(request.itemKey);
  if (!item) throw new Error('Item not found');
  
  // Find best media version
  const media = this.selectBestMedia(item.media, request.maxBitrate);
  const part = media.parts[0];
  
  // Check direct play compatibility
  const canDirect = this.canDirectPlay(item);
  
  let playbackUrl: string;
  let protocol: 'hls' | 'http';
  let isTranscoding = false;
  
  if (canDirect && request.directPlay !== false) {
    // Direct play
    playbackUrl = this.buildDirectPlayUrl(part.key);
    protocol = 'http';
  } else {
    // Transcode to HLS
    playbackUrl = this.getTranscodeUrl(request.itemKey, {
      maxBitrate: request.maxBitrate ?? 20000,
      subtitleSize: 100,
      audioBoost: 100
    });
    protocol = 'hls';
    isTranscoding = true;
  }
  
  // Find selected tracks
  const audioStream = this.findAudioStream(part.streams, request.audioStreamId);
  const subtitleStream = this.findSubtitleStream(part.streams, request.subtitleStreamId);
  
  // Start session
  const sessionId = await this.startSession(request.itemKey);
  
  return {
    playbackUrl,
    protocol,
    isDirectPlay: !isTranscoding,
    isTranscoding,
    container: isTranscoding ? 'mpegts' : media.container,
    videoCodec: isTranscoding ? 'h264' : media.videoCodec,
    audioCodec: isTranscoding ? 'aac' : media.audioCodec,
    subtitleDelivery: this.getSubtitleDelivery(subtitleStream, isTranscoding),
    sessionId,
    selectedAudioStream: audioStream,
    selectedSubtitleStream: subtitleStream,
    width: media.width,
    height: media.height,
    bitrate: isTranscoding ? (request.maxBitrate ?? 8000) : media.bitrate
  };
}
```

---

### `canDirectPlay(item: PlexMediaItem): boolean`

**Purpose**: Check if content can be played directly without transcoding.

**Implementation Notes**:

```typescript
canDirectPlay(item: PlexMediaItem): boolean {
  if (!item.media || item.media.length === 0) return false;
  
  const media = item.media[0];
  
  // Supported containers
  const supportedContainers = ['mp4', 'mkv', 'mov'];
  if (!supportedContainers.includes(media.container.toLowerCase())) {
    return false;
  }
  
  // Supported video codecs
  const supportedVideoCodecs = ['h264', 'hevc', 'h265'];
  if (!supportedVideoCodecs.includes(media.videoCodec.toLowerCase())) {
    return false;
  }
  
  // Supported audio codecs
  const supportedAudioCodecs = ['aac', 'ac3', 'eac3', 'mp3'];
  if (!supportedAudioCodecs.includes(media.audioCodec.toLowerCase())) {
    return false;
  }
  
  // Resolution check (optional - webOS handles most resolutions)
  if (media.width > 3840 || media.height > 2160) {
    return false;
  }
  
  return true;
}
```

---

### `updateProgress(sessionId, itemKey, positionMs, state): Promise<void>`

**Purpose**: Report playback progress to Plex server.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| sessionId | string | Yes | Session identifier |
| itemKey | string | Yes | Item ratingKey |
| positionMs | number | Yes | Current position |
| state | 'playing' \| 'paused' \| 'stopped' | Yes | Playback state |

**Implementation Notes**:

```typescript
async updateProgress(
  sessionId: string,
  itemKey: string,
  positionMs: number,
  state: 'playing' | 'paused' | 'stopped'
): Promise<void> {
  const url = `${this.serverUri}/:/timeline`;
  
  const params = new URLSearchParams({
    ratingKey: itemKey,
    key: `/library/metadata/${itemKey}`,
    state: state,
    time: String(positionMs),
    duration: String(this.getDuration(itemKey)),
    'X-Plex-Session-Identifier': sessionId
  });
  
  await fetch(`${url}?${params}`, {
    method: 'POST',
    headers: this.auth.getAuthHeaders()
  });
  
  // Update local session tracking
  const session = this.state.activeSessions.get(sessionId);
  if (session) {
    session.lastUpdate = Date.now();
  }
}
```

---

### `getTranscodeUrl(itemKey: string, options: HlsOptions): string`

**Purpose**: Generate HLS transcode URL for Plex server.

**Implementation Notes**:

```typescript
getTranscodeUrl(itemKey: string, options: HlsOptions = {}): string {
  const params = new URLSearchParams({
    path: `/library/metadata/${itemKey}`,
    mediaIndex: '0',
    partIndex: '0',
    protocol: 'hls',
    fastSeek: '1',
    directPlay: '0',
    directStream: '1',
    subtitleSize: String(options.subtitleSize ?? 100),
    audioBoost: String(options.audioBoost ?? 100),
    maxVideoBitrate: String(options.maxBitrate ?? 8000),
    subtitles: 'burn', // Burn subtitles for compatibility
    'Accept-Language': 'en',
    'X-Plex-Session-Identifier': this.generateSessionId(),
    ...this.getClientParams()
  });
  
  return `${this.serverUri}/video/:/transcode/universal/start.m3u8?${params}`;
}

private getClientParams(): Record<string, string> {
  return {
    'X-Plex-Token': this.auth.getCurrentUser()?.token ?? '',
    'X-Plex-Client-Identifier': this.auth.getConfig().clientIdentifier,
    'X-Plex-Platform': 'webOS',
    'X-Plex-Device': 'LG Smart TV',
    'X-Plex-Product': 'Retune'
  };
}
```

## Events Emitted

None (stateless operations)

## Test Specification

### Unit Tests Required:

```typescript
describe('PlexStreamResolver', () => {
  describe('canDirectPlay', () => {
    it('should return true for MP4 with H264/AAC', () => {
      const item = createItem({ container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' });
      expect(resolver.canDirectPlay(item)).toBe(true);
    });
    
    it('should return false for unsupported codec', () => {
      const item = createItem({ videoCodec: 'mpeg2' });
      expect(resolver.canDirectPlay(item)).toBe(false);
    });
    
    it('should return true for MKV with HEVC', () => {
      const item = createItem({ container: 'mkv', videoCodec: 'hevc' });
      expect(resolver.canDirectPlay(item)).toBe(true);
    });
  });
  
  describe('resolveStream', () => {
    it('should return direct play URL for compatible content', async () => {
      mockItem({ container: 'mp4', videoCodec: 'h264' });
      const decision = await resolver.resolveStream({ itemKey: '123' });
      expect(decision.isDirectPlay).toBe(true);
    });
    
    it('should return transcode URL for incompatible content', async () => {
      mockItem({ container: 'avi', videoCodec: 'mpeg4' });
      const decision = await resolver.resolveStream({ itemKey: '123' });
      expect(decision.isTranscoding).toBe(true);
      expect(decision.playbackUrl).toContain('/transcode/');
    });
    
    it('should start a playback session', async () => {
      const decision = await resolver.resolveStream({ itemKey: '123' });
      expect(decision.sessionId).toBeTruthy();
    });
  });
  
  describe('getTranscodeUrl', () => {
    it('should include all required parameters', () => {
      const url = resolver.getTranscodeUrl('123');
      expect(url).toContain('protocol=hls');
      expect(url).toContain('X-Plex-Token');
      expect(url).toContain('X-Plex-Client-Identifier');
    });
    
    it('should respect bitrate limits', () => {
      const url = resolver.getTranscodeUrl('123', { maxBitrate: 4000 });
      expect(url).toContain('maxVideoBitrate=4000');
    });
  });
  
  describe('updateProgress', () => {
    it('should send timeline update to server', async () => {
      await resolver.updateProgress('sess1', '123', 60000, 'playing');
      // Verify POST to /:/timeline
    });
  });
});
```

## Mock Requirements

### Required Mocks

```typescript
// Mock fetch for Plex API calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock dependencies
const mockPlexAuth: IPlexAuth = {
  getAuthHeaders: () => ({ 'X-Plex-Token': 'mock-token' }),
  getCurrentUser: () => ({ token: 'mock-token', userId: '123' }),
  getConfig: () => ({ clientIdentifier: 'test-client-id' })
};

const mockPlexDiscovery: IPlexServerDiscovery = {
  getActiveConnectionUri: () => 'http://192.168.1.100:32400',
  getHttpsConnection: () => ({ uri: 'https://secure.plex.direct:32400' }),
  getRelayConnection: () => ({ uri: 'https://relay.plex.direct:32400' })
};

const mockPlexLibrary: IPlexLibrary = {
  getItem: jest.fn()
};
```

### Mock Data Fixtures

```typescript
// Compatible content (direct play)
const mockCompatibleItem = {
  ratingKey: '12345',
  media: [{
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    width: 1920,
    height: 1080,
    bitrate: 8000,
    parts: [{ key: '/library/parts/12345/file.mp4', streams: [] }]
  }]
};

// Incompatible content (needs transcoding)
const mockIncompatibleItem = {
  ratingKey: '67890',
  media: [{
    container: 'avi',
    videoCodec: 'mpeg4',
    audioCodec: 'mp2',
    width: 720,
    height: 480,
    bitrate: 4000,
    parts: [{ key: '/library/parts/67890/file.avi', streams: [] }]
  }]
};

// Transcode decision response
const mockTranscodeDecision = {
  MediaContainer: {
    Video: [{ Media: [{ Part: [{ key: '/transcode/...' }] }] }]
  }
};
```

### Helper Functions

```typescript
function createItem(overrides: Partial<typeof mockCompatibleItem.media[0]>) {
  return {
    ...mockCompatibleItem,
    media: [{ ...mockCompatibleItem.media[0], ...overrides }]
  };
}
```

## File Structure

```text
src/modules/plex/stream/
├── index.ts                  # Public exports
├── PlexStreamResolver.ts     # Main class
├── interfaces.ts             # IPlexStreamResolver
├── types.ts                  # StreamRequest, StreamDecision
├── constants.ts              # Supported codecs, defaults
└── __tests__/
    └── PlexStreamResolver.test.ts
```

## Implementation Checklist

- [ ] Create file structure
- [ ] Implement direct play compatibility checking
- [ ] Implement transcode URL generation
- [ ] Implement stream resolution logic
- [ ] Implement session management
- [ ] Implement progress reporting
- [ ] Write unit tests
- [ ] Add JSDoc comments
- [ ] Verify against acceptance criteria

## Acceptance Criteria

This module is COMPLETE when:

1. [ ] Direct play detection works for all supported formats
2. [ ] Transcode URLs are properly formatted
3. [ ] HLS streams play correctly on webOS
4. [ ] Progress reports reach Plex server
5. [ ] Session management tracks active playback
6. [ ] All unit tests pass
7. [ ] No TypeScript compilation errors
