# ADR-002: Native HLS Instead of HLS.js

## Status

Accepted

## Context

Retune needs to play HLS (HTTP Live Streaming) video streams from Plex Media Servers. The standard approach for web applications is to use the HLS.js library, which provides MSE (Media Source Extensions) based HLS playback.

However, webOS TV platforms present unique constraints:

1. **Memory limitations**: webOS apps have a 300MB memory budget
2. **Chromium age**: webOS 4.0 uses Chromium 68 (2018)
3. **Native capabilities**: webOS includes native HLS support in the video element

## Decision

**Do NOT use HLS.js.** Instead, use webOS's built-in native HLS support by setting the video element's `src` attribute directly:

```typescript
if (descriptor.protocol === 'hls') {
  videoElement.src = descriptor.url; // Native HLS
}
```

## Consequences

### Positive

- **Memory efficient**: No JavaScript HLS parser allocation (~5-10MB savings)
- **CPU efficient**: Native decoding offloaded to hardware
- **Simpler code**: No HLS.js configuration, events, or lifecycle management
- **Reliable**: Platform-tested implementation vs. polyfill
- **Fewer bugs**: No version compatibility issues with HLS.js

### Negative

- **Platform specific**: Solution only works on platforms with native HLS
- **Less control**: Cannot access segment-level events or custom loaders
- **ABR limitations**: Cannot customize adaptive bitrate logic

## Alternatives Considered

### 1. HLS.js

**Rejected**: Memory profiling showed HLS.js adds 8-12MB base overhead, with spikes to 20MB during adaptive bitrate switching. This is significant against the 300MB budget, especially when considering the EPG's DOM requirements.

### 2. Shaka Player

**Rejected**: Even heavier than HLS.js (includes DASH support we don't need). Also uses MSE which has compatibility concerns on older Chromium.

### 3. Hybrid approach (detect and fallback)

**Rejected**: Adds complexity. webOS 4.0+ all have native HLS support, and we're not targeting other platforms.

## Verification

Tested on:

- webOS 4.0 (Chromium 68)
- webOS 5.0 (Chromium 79)
- webOS 6.0 (Chromium 87)

All versions successfully play Plex HLS streams via native video element.

## References

- [webOS TV Media Specifications](https://webostv.developer.lge.com/develop/specifications/media-specifications)
- [HLS.js Memory Issues on TV Platforms](https://github.com/video-dev/hls.js/issues/3000)
