
# Implementation Plan: Virtual TV Channel App for LG webOS

## 1. Introduction

Building a "virtual TV channel" app for LG webOS TVs (in the spirit of Plex-based apps like Coax and QuasiTV) requires carefully replicating the look-and-feel of linear cable TV using the user's Plex media library . This report presents a comprehensive implementation plan and technical specification for such an app, focusing on scheduled playback channels with an Electronic Program Guide (EPG), robust Plex integration, and a performant webOS client . We draw on best practices from existing solutions and incorporate LG's latest webOS development guidelines .

### Key Objectives

* **Linear Scheduled Channels:** The app will generate linear scheduled channels from Plex content and present them in an EPG UI .
* **Channel Surfing:** Users can flip channels with the remote, seeing whatever show or movie is "currently playing" on each channel .
* **Simulated Live Playback:** If a user joins a channel in the middle of a program, playback should start at that point (not from the beginning) to simulate true live TV .
* **Plex Integration:** The app will authenticate the user's Plex account, fetch library metadata, and retrieve stream URLs for playback (favoring direct play when possible) .
* **Platform Optimization:** Optimize for LG webOS TVs (v4.0+) using HTML5/JS with LG's Enact framework, adhering to performance constraints .

---

## 2. Feature Set and User Experience

To match apps like Coax and QuasiTV, our virtual channel app will provide the following core features:

### Scheduled Linear Channels

The app automatically creates "virtual channels" from the user's Plex library . Each channel is a playlist of shows or movies arranged in a continuous 24/7 schedule .

* **Deterministic Scheduling:** The engine ensures each channel has a deterministic lineup at any given time—if it's 8:45pm, a specific episode is playing on channel 5, just like real TV .
* **Shared Experience:** Channels act like real broadcast channels with a known sequence of programs rather than random shuffles .

### Electronic Program Guide (EPG)

Users can view a channel guide grid that mimics a cable TV guide .

* **Layout:** Channels are listed vertically; timeslots horizontally. Programs act as rectangular blocks spanning their duration .
* **Navigation:** Users can scroll through time and channels. The currently airing program is highlighted .
* **Instant Tuning:** Selecting a program immediately tunes that channel .

### Channel Surfing & Instant Tuning

* **Rapid Switching:** Pressing Channel Up/Down should flip channels quickly with minimal buffering .
* **OSD:** A small overlay displays the new channel's information (name, number, current title) to confirm the change .

### Playback Start and Resume Behavior

* **Join-In-Progress:** If a program is scheduled 8:00-10:00pm and the user tunes in at 9:00pm, playback starts at the 1-hour mark .
* **Continuity:** If a user stays on a channel, it seamlessly transitions to the next show. If they leave and return, the schedule is honored (the program progresses in their absence) .
* **Trick Play:** "Pause" is user-specific. The app buffers content, but the channel schedule continues. Users can "fast-forward" to catch up to live .

### Metadata and Customization

* **Display:** The app displays metadata (Title, Season/Episode, Synopsis) and artwork drawn from Plex .
* **Channel Naming:** Channels can be based on user-defined collections, playlists, or auto-grouped content (e.g., "Comedy Channel") .

### Visual Design & Controls

* **10-Foot UI:** Designed for remote input with large, legible text and clear focus states (bright outlines) .
* **Remote Support:** Fully operable with D-pad and OK/Back keys. Support for standard media keys (Play/Pause/FF/REW) .
* **Safe Areas:** UI respects safe title areas (-20px padding) to avoid overscan issues .

---

## 3. Architecture Overview

The architecture is a client-heavy approach; all scheduling logic and UI rendering happen on the TV itself .

### Core Components

1. **LG webOS Client App (HTML5/JS):** The core system encompassing the UI and logic .
2. **UI Layer:** Built with Enact (React-based) to handle user input and focus management .
3. **Channel Scheduling Engine:** The "brain" that generates schedules using Plex metadata. It ensures deterministic/repeatable lineups .
4. **Media Player Controller:** Interfaces with the HTML5 `<video>` element. Handles Play/Pause/Seek and listens for media events .
5. **Plex Integration Module:** Handles authentication (PIN flow), server discovery, and data retrieval (metadata and stream URLs) .
6. **Persistent Storage:** Uses IndexedDB or localStorage to save channel configs and the Plex token .

### Data Flow

* **Startup:** App authenticates with Plex via Cloud API to get a token .
* **Discovery:** App discovers the Plex Server address and fetches library info .
* **Scheduling:** Engine creates channels and schedules content .
* **Playback:** When a channel is selected, the app obtains the stream URL (calculated with offset) and feeds it to the HTML5 player .

---

## 4. Technology Stack

| Layer/Component | Technology Choices | Rationale and Notes |
| --- | --- | --- |
| **UI Framework** | Enact (React) or React + Custom | Enact provides TV-optimized components (Sandstone) and is officially supported on webOS 4.0+. Accelerates development of focus management . |
| **State Management** | Redux or Context API | Predictable state container for complex interactions (guide data, player state). Must be optimized for performance . |
| **Video Playback** | HTML5 `<video>` element | Leverages hardware decoding on TV. Native support for HLS and common codecs. Simpler than external players . |
| **Plex API Comms** | Fetch/XHR with REST API | No official web SDK exists; direct HTTP calls using Plex API headers (X-Plex-Token, etc.) are required . |
| **Data Storage** | IndexedDB or localStorage | IndexedDB for structured data (channel lineups); localStorage for small data (tokens). Sensitive data handled carefully . |
| **Styling** | CSS3 (Flexbox/Grid) | Flexbox/Grid for dynamic EPG layouts. Design for 1080p base, scaling to 4K. Avoid heavy effects for performance . |

---

## 5. Media Playback Design and Optimization

### Supported Formats & Direct Play

* **Capabilities:** webOS 6.0+ supports H.264, HEVC (up to 4K60), VP9, and AV1 .
* **Direct Play:** If media is compatible, the app instructs Plex to Direct Play (direct URL to file), avoiding server transcoding .

### Transcoding & HLS

* **Fallback:** If media is incompatible (e.g., high profile 4K, unsupported audio), the app falls back to Plex's transcoder .
* **Protocol:** Plex outputs an HLS stream (MPEG-TS or fMP4). webOS natively supports HLS via the `<video>` element .

### Initial Buffering and Seek

* **Logic:** To simulate "live," the app sets the video source and immediately seeks to the calculated offset (`currentTime = offsetSeconds`) .
* **Optimization:** "Fast Forward & Reverse" are not natively supported as continuous playback rates; the app will implement discrete skip steps (e.g., skip 10s) .

### Audio & Subtitles

* **Audio:** Codecs like AAC, AC3, and MP3 are supported. DTS support varies by model year; transcoding to AC3 may be required .
* **Subtitles:** webOS supports WebVTT natively. Users can toggle subtitles if available (similar to QuasiTV) .

---

## 6. Plex Integration Strategy

### User Authentication

1. **PIN Flow:** Use the "link" mechanism. App generates a PIN via Plex API .
2. **Display:** User sees a code on TV to enter at `plex.tv/link` .
3. **Polling:** App polls the Plex API for PIN status. Once claimed, it receives the `authToken` .

### Server Discovery & Content

* **Discovery:** Use `plex.tv/api/resources` to find the user's Plex Media Server (IP, port, relay URLs) .
* **Library Fetch:** Use `/library/sections` to find Movie/TV libraries, then fetch items. To optimize, fetch show-by-show or use smart filters .

### Stream URL Generation

* **Direct Play:** Use the file path from the `<Media>`/`<Part>` metadata elements combined with the Plex token .
* **Transcode:** Construct a transcoder URL (e.g., `/video/:/transcode/universal/start.m3u8`) with parameters for resolution and bitrate .

---

## 7. Channel Scheduling Engine Design

### Schedule Representation

* **Timeline:** The schedule is a timeline of contiguous segments (media items). Start times are relative to a continuous timeline or wall-clock .
* **Persistence:** To ensure schedules persist across restarts, the app stores the "current item index and offset" or a random seed per channel .

### Deterministic Scheduling Algorithm

* **Rule-Based:** The engine uses rules rather than random shuffling. For TV shows, it tracks the last watched episode to ensure continuity (e.g., S1E1 -> S1E2) .
* **Blocks:** Channels can play blocks of episodes (e.g., 2 episodes of *The Office*, then switch to *Parks and Rec*) .
* **Start Offsets:** To simulate a "live" feel, channels are initialized with random start offsets so they don't all start at the beginning of a file .

### Real-Time Behavior

* **Monitoring:** The engine monitors playback. When a video is near the end, it prepares the next item .
* **Logic:** If a user tunes in at 10:00:40 and the show started at 10:00:00, the player seeks to 40 seconds .

---

## 8. LG webOS Platform Considerations

### Deployment

* **Type:** Packaged (IPK) vs. Hosted. Packaged is preferred for store distribution and offline LAN capability, though a hosted stub allows faster updates .
* **Store Compliance:** Must meet LG's guidelines (no unauthorized APIs, stable performance) .

### Performance Optimization

* **Hardware:** Low-end TVs have limited CPUs. UI updates must be minimized (avoid heavy re-renders) .
* **Virtualization:** The EPG grid should use list virtualization (render only visible items) to maintain 60fps scrolling .
* **Memory:** Monitor for leaks using LG's Resource Monitor. Dispose of unused DOM elements and video sources .

### Remote Control Nuances

* **Magic Remote:** Must handle pointer events (click) and key events (D-pad). Focus navigation usually suspends when the pointer is active .
* **Lifecycle:** Handle `visibilitychange` to pause/resume resources if the user switches apps or goes to the Home screen .

---

## 9. User Interface Design

### Visuals and Navigation

* **High Contrast:** Dark backgrounds with light text for EPG legibility .
* **Focus State:** Clearly highlight the focused item with a border or scale effect (LG Sandstone style) .
* **Resolution:** Design for 1080p; rely on platform scaling for 4K. Use relative units where possible .

### Feedback

* **Responsiveness:** Provide immediate visual cues (spinners, pressed states) for remote inputs to counter latency perception .
* **Overlays:** Playback controls (OSD) should dim the background and auto-hide after inactivity .

### Mockup Descriptions

* **EPG:** A grid with channels on the left and time blocks extending to the right. The current program is highlighted .
* **Player OSD:** Minimal overlay showing Title, Episode Info, Progress Bar, and controls (Play/Pause, CC) .

---

## 10. Conclusion

This plan outlines a robust "virtual channel" application for LG webOS. By leveraging a client-side scheduling engine, the app creates a deterministic, linear TV experience using personal Plex libraries . The architecture prioritizes Direct Play for performance, utilizes standard webOS APIs for integration, and adopts a user-centric design suitable for the "10-foot" experience .

### Sources

* **LG webOS TV Developer Documentation:** APIs, media formats, UI guides .
* **QuasiTV:** Community insights on scheduling and Plex integration .
* **Coax Developer:** Conceptual models for simulated live TV .
* **Plex API:** Authentication and header guidelines .
