# Prompt: Plex Stream Resolver Module (Priority 3)

````markdown
You are implementing the Plex Stream Resolver module for Retune, a webOS TV application.

## Task
Resolve playable stream URLs from Plex media items, handle transcode decisions, and manage playback sessions with progress reporting.

## Files to Create
- src/modules/plex/stream/index.ts
- src/modules/plex/stream/PlexStreamResolver.ts
- src/modules/plex/stream/SessionManager.ts
- src/modules/plex/stream/interfaces.ts
- src/modules/plex/stream/__tests__/PlexStreamResolver.test.ts

## Type Definitions (use exactly)

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
```

## Interface to Implement

```typescript
interface IPlexStreamResolver {
  // Stream resolution
  resolveStream(request: StreamRequest): Promise<StreamDecision>;
  
  // Direct URL construction (for simple cases)
  getDirectPlayUrl(partKey: string): string;
  getHlsUrl(itemKey: string, options?: HlsOptions): string;
  
  // Subtitle handling
  getSubtitleUrl(subtitleKey: string): string;
  getSubtitleTracks(itemKey: string): Promise<SubtitleTrack[]>;
  
  // Session management
  startSession(sessionId: string, itemKey: string): Promise<void>;
  reportProgress(sessionId: string, itemKey: string, positionMs: number): Promise<void>;
  endSession(sessionId: string, itemKey: string, positionMs: number): Promise<void>;
  
  // Cleanup
  terminateSession(sessionId: string): Promise<void>;
  terminateAllSessions(): Promise<void>;
  
  // Events
  on(event: 'sessionStart', handler: (session: PlaybackSession) => void): void;
  on(event: 'sessionEnd', handler: (session: PlaybackSession) => void): void;
}

interface HlsOptions {
  maxBitrate?: number;
  subtitleSize?: number;  // Percentage (100 = default)
  audioBoost?: number;    // Percentage (100 = default)
  copyts?: boolean;       // Preserve timestamps
}
```

## API Endpoints

| Endpoint | Method | Purpose |
| --- | --- | --- |
| /video/:/transcode/universal/decision | GET | Get stream decision |
| /video/:/transcode/universal/start.m3u8 | GET | Get HLS playlist |
| /library/parts/{partId}/file | GET | Direct play URL |
| /:/timeline | POST | Report playback progress |
| /video/:/transcode/universal/stop | GET | Stop transcode session |

## Implementation Requirements

### 1. Stream Resolution Flow

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

### 2. Client Profile (CRITICAL for webOS)

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

### 3. Progress Reporting

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
    duration: this.activeSession?.durationMs?.toString() || '0',
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

### 4. Session Cleanup

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

### 5. Subtitle Delivery Decision

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

## Error Handling

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

## Test Specification

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
      
      expect(result.selectedAudioStream?.id).toBe('audio-2');
      expect(result.selectedSubtitleStream?.id).toBe('sub-1');
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
      expect(session?.lastReportedPositionMs).toBe(60000);
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
      
      expect(srtTrack?.url).toContain('/library/streams');
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

## Mock Requirements

When testing this module, mock:
- `fetch` global function
- `IPlexAuth.getAuthHeaders()`
- `IPlexServerDiscovery.getActiveConnectionUri()`
- `IPlexLibrary.getItem()`

## Performance Requirements

| Operation | Target | Max |
| --- | --- | --- |
| resolveStream() | 500ms | 2000ms |
| reportProgress() | 100ms | 500ms |
| endSession() | 200ms | 1000ms |

## Deliverable

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
