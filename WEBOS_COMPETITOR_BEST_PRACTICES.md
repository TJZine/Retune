# webOS Media App Best Practices & Competitor Analysis

> **Status**: Living Document
> **Target Platform**: LG webOS 6.0+ (Chromium 79+)
> **Competitors Analyzed**: Jellyfin (webOS), Emby (webOS), Official Plex (Legacy Native), YouTube (Cobalt/MSE)

---

## 1. Media Playback Architecture

**The Gold Standard**: HTML5 Media Source Extensions (MSE) + Encrypted Media Extensions (EME).

### A. The "Wrapper" vs. "Native" Debate

* **Official Plex App**: Uses a legacy C++ Native Player wrapper.
  * *Pros*: Brute-force playback of any container (AVI, TS).
  * *Cons*: Fragile, proprietary, maintenance nightmare.
* **Jellyfin / Emby**: Use a "Web Wrapper" approach (packaged web app).
  * *Pros*: Share code with web client, standards-compliant.
  * *Cons*: Dependent on browser capabilities (Chromium 79/87). **This is Retune's chosen architecture.**

### B. Direct Play Implementation Details

For a web-based player (Retune), "Direct Play" means the browser *natively* decodes the stream.

#### Key Codec Support (Direct Play Targets)

| Format | Container | Codec | Notes |
| :--- | :--- | :--- | :--- |
| **SDR** | MP4 `video/mp4` | H.264 (High Profile) | Universal support. Bitrate limit ~100Mbps. |
| **4K HDR10** | MP4 `video/mp4` | HOEV (HEVC) | Requires `video/mp4; codecs="hvc1.1.6.L150.B0"`. |
| **Dolby Vision** | MP4 `video/mp4` | HEVC (Profile 5/8) | Profile 7 (Blu-ray) **FAILS** on browser-based players. |
| **Audio** | AAC / AC3 | `audio/mp4` | DTS/TrueHD usually fail in browser -> Require Transcode. |

#### Competitor Code Snippet: Capability Detection

How Jellyfin decides to transcode vs. direct play:

```javascript
// Jellyfin webOS Profile Detection (Conceptual)
function getDeviceProfile() {
    const isWebOS = /Web0S/.test(navigator.userAgent);
    const screenWidth = window.screen.width;
    
    return {
        Name: "HTML TV App", // Spoofing generic to ensure standardized stream
        MaxStreamingBitrate: 120000000, 
        MusicFormats: ["aac", "mp3", "ac3", "eac3"],
        VideoFormats: [
            { Container: "mp4", VideoCodec: "h264,hevc,vp9" },
            // MKV support added in webOS 23+ only
            ...(isNewWebOS ? [{ Container: "mkv", VideoCodec: "h264,hevc" }] : [])
        ]
    };
}
```

### C. The "HLS Manifest" Trap

Both Jellyfin and Emby struggle with this. If you ask for a stream without specifying the `Codecs` parameter in the HLS URL, the server might send a "Generic" playlist that the strict webOS MSE parser rejects.

* **Best Practice**: Always explicitly append `&videoCodec=h264&audioCodec=aac` (or hevc/ac3) to the stream URL to force the server's segmenter to be precise.

---

## 2. Navigation & Input Handling

**The Gold Standard**: "Spatial Navigation" with Magic Remote Handling.

### A. The "Pointer" Problem

LG's Magic Remote is a dual-input device:

1. **5-Way Mode**: Up/Down/Left/Right/OK (Standard Remote).
2. **Pointer Mode**: Mouse cursor (Air Mouse).

**Critical Failure in many apps**: When the user shakes the remote, the "Pointer" appears. If your app relies *only* on keyboard events (`keydown`), the user cannot click anything with the pointer.

* **Retune Status**: We handle `keydown`. We likely need `click` listeners on all focusable elements to support the Pointer.

### B. Focus Management Strategies

* **Enact (LG's Framework) "Spotlight"**: Uses a `spottable` class and calculates nearest neighbor geometry.
* **Retune "FocusManager"**: Explicit Neighbor Graph (Up/Down/Left/Right IDs).
  * *Comparison*: Retune's explicit graph is **faster** and less buggy than geometry-based calculation (Spotlight) which often jumps to the wrong button if alignment is 1px off. **Keep our approach.**

### C. Key Code Reference

Standard webOS overrides to be aware of:

| Key | Code | Retune Handling | Notes |
| :--- | :--- | :--- | :--- |
| **Back** | `461` | Correct | Often trapped by `window.history`. Must preventDefault() to avoid app exit. |
| **Red** | `403` | Unmapped | Often used for "Delete" or "Back" fallback. |
| **Green** | `404` | Unmapped | Often used for "Filter" or "Sort". |
| **Yellow**| `405` | Guide | **Mapped correctly in Retune**. |
| **Blue** | `406` | Unmapped | Often used for "Search". |
| **Play** | `415` | Mapped | Should toggle Play/Pause. |
| **Pause** | `19` | Mapped | Distinct from Play on some remotes. |

### D. The "Focus Sentinel" Pattern

Competitors (Netlfix) implement an aggressive "Focus Recovery" loop.

* **Problem**: Disabling a button (spinner) drops focus to `body`.
* **Netflix Solution**: A global `setInterval` (or `MutationObserver`) that checks: `if (document.activeElement === body) FocusManager.restore()`.
* **Retune Solution**: We implemented the "Focus Sentinel" on `keydown`. **Recommendation**: Upgrade this to a `MutationObserver` or `setInterval` for idle recovery (e.g. if an async error modal pops up and steals focus, then closes).

---

## 3. UI Virtualization & Performance

**The Gold Standard**: DOM Recycling (Virtual List).

### A. EPG Grid Performance

* **Jellyfin**: Uses a naive `div` table. Crashes/lags on 50+ channels.
* **Emby**: Uses efficient DOM recycling.
* **Retune**: Uses `EPGVirtualizer` (Canvas/Absolute Positioning).
  * *Best Practice*: Ensure we are **unmounting** off-screen rows. Keeping them `display: none` is not enough for webOS RAM (legacy devices have <1GB free).
  * *CSS Triggers*: Avoid `box-shadow` and `filter: blur` on TV UIs. They kill the GPU. Use `border` or `opacity` for focus states.

### B. Image Optimization

* **Format**: WebP is supported on webOS 5.0+. **Use it.**
  * *Jellyfin*: Often requests JPG/PNG.
  * *Retune*: Should request `format=webp` from PMS Image Transcoder. ~40% bandwidth saving = faster UI load.

---

## 4. Stability & Lifecycle

### A. Memory Pressure

webOS kills background apps aggressively.

* **Lifecycle**: When the user presses "Home", the app is **paused**, not killed.
* **Resume**: When they click the app again, it resumes.
  * *Risk*: WebSocket connections (PMS) often die during pause.
  * *Fix*: Listen to `document.addEventListener("visibilitychange")`. If `visible`, **Reconnect WS** and **Refresh Metadata**.

### B. "Screensaver" Burn-in Protection

OLED TVs are prone to burn-in.

* **Requirement**: If video is paused or UI is idle for 2 minutes, **dim the screen** or show a black overlay.
* **Official API**: `webOS.service.request("luna://com.webos.service.tvPower/power/turnOnScreenSaver")`. (Note: This might be restricted).
* **Web Alternative**: A persistent `<div>` overlay with `opacity: 0` that fades to `black, opacity: 0.8` after 5 minutes of no `keydown` events.

---

## 5. Checklist for "Production Grade"

1. [ ] **Magic Remote Click**: Ensure all focusable items have `onClick` handlers, not just `onKeyDown`.
2. [ ] **WebP Images**: Verify PMS image requests ask for WebP.
3. [ ] **Resume Logic**: Verify WebSocket reconnects after spending 10m on the Home screen.
4. [ ] **OLED Protection**: Implement an idle dimmer.
5. [ ] **Error Loops**: Ensure playback failure doesn't infinite loop (Jellyfin bug). Stop after 3 attempts.

---

## 6. Major Streamers Analysis (YouTube TV & Hulu)

**The "Live TV" Gold Standard**: Seamlessness over Complexity.

### A. YouTube TV (Architecture: Cobalt)

* **Engine**: Runs on **Cobalt**, a lightweight subset of HTML5.
  * *Lesson*: They strip out complex CSS (Shadow DOM, Flexbox nesting) for raw speed on low-end CPUs.
  * *Retune Strategy*: Keep our DOM flat. Avoid React overhead if possible (Retune uses direct DOM manipulation in `EPGVirtualizer` which is aligned with this).
* **Navigation**:
  * **"Peek" Guide**: When pressing "Down" during playback, a mini-guide overlays the video.
  * **Live Preview**: The EPG grid often shows a live animated GIF or low-res video preview of the focused channel.
  * *Feasibility*: Retune can do "Peek" overlays easily (z-index). "Live Previews" require transcoding support which we avoid for Direct Play.
* **Virtualization**: YouTube TV handles 100+ channels by rendering **only rows in view**.
  * *Scroll Performance*: They prioritize "Input Response" over "Visual Update". If you hold "Down", the focus moves instantly, even if the UI grid lags behind.

### B. Hulu Live (Architecture: Standard Web -> Flutter?)

* **Design Philosophy**: "Simplicity & Legibility".
  * **Font Size**: Minimum 24px-36px. (Retune should audit this).
  * **Safe Zones**: Hulu strictly respects the 5% overscan margin.
* **Channel Switching**:
  * **Myth**: "Pre-buffering 3 channels".
  * **Reality**: They use highly optimized **Server-Side** ABR start segments. The player requests the lowest bitrate chunk first (240p) for instant start, then ramps up.
  * *Retune Lesson*: We must trust Plex's "Direct Stream" to be fast. We cannot "pre-buffer" other channels in MSE without killing the TV's single hardware decoder.

### C. Common Patterns to Adopt

1. **"Mini-Guide" / Quick Select**: Don't force full EPG participation just to change the channel.
    * *Implementation*: A simple horizontal list overlay when pressing "Down" or "OK" during playback.
2. **"Recent Channels"**: A history stack (Last 5 channels) accessible via "Long Press Back" or a specific color key.
3. **Conservative Buffer Strategy**: Don't load 30s of video. Load 5s. TV RAM is scarce.
