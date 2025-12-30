# Verification Checklist

This checklist validates that the Retune implementation is complete, correct, and ready for deployment.

---

## Phase 1: Build Verification

### 1.1 TypeScript Compilation
- [ ] `npx tsc --noEmit` succeeds with zero errors
- [ ] No implicit `any` types in codebase
- [ ] All type exports are accessible from module index files
- [ ] Strict mode enabled in tsconfig.json

### 1.2 Bundle Creation
- [ ] `npm run build` completes successfully
- [ ] Output bundle size < 500KB (uncompressed JS)
- [ ] No circular dependency warnings
- [ ] Source maps generated for debugging

### 1.3 webOS Package
- [ ] `appinfo.json` contains correct metadata
- [ ] IPK package created successfully
- [ ] Package installs on webOS Simulator
- [ ] Package installs on physical TV

---

## Phase 2: Module Unit Tests

### 2.1 Event Emitter
- [ ] `on()` registers handlers correctly
- [ ] `off()` removes handlers correctly
- [ ] `emit()` invokes all registered handlers
- [ ] `once()` handlers fire only once
- [ ] Handler errors don't break other handlers
- [ ] TypeScript enforces event/payload types

### 2.2 Plex Authentication
- [ ] PIN request returns valid 4-character code
- [ ] PIN polling detects claimed PIN
- [ ] Token validation returns true for valid token
- [ ] Token validation returns false for expired token
- [ ] Credentials persist to localStorage
- [ ] Credentials restore on app restart
- [ ] Auth headers include all required X-Plex-* headers
- [ ] `authChange` event emits on login/logout

### 2.3 Plex Server Discovery
- [ ] Fetches server list for authenticated user
- [ ] Tests connections and measures latency
- [ ] Selects fastest connection as preferred
- [ ] Handles servers with no working connections
- [ ] Persists selected server across sessions

### 2.4 Plex Library Access
- [ ] Enumerates all library sections
- [ ] Retrieves movies from movie library
- [ ] Retrieves TV shows with seasons/episodes
- [ ] Handles pagination for large libraries
- [ ] Image URLs include auth token

### 2.5 Plex Stream Resolver
- [ ] Resolves direct play URL when possible
- [ ] Falls back to transcoding when needed
- [ ] Includes correct audio/subtitle track selection
- [ ] Session ID generated for playback tracking

### 2.6 Channel Manager
- [ ] Creates channel with valid configuration
- [ ] Updates existing channel
- [ ] Deletes channel
- [ ] Persists channels to localStorage
- [ ] Resolves content from library source
- [ ] Resolves content from collection source
- [ ] Resolves content from show source
- [ ] Applies content filters correctly
- [ ] Applies sort order correctly

### 2.7 Channel Scheduler
- [ ] Loads channel and builds index
- [ ] `getProgramAtTime()` returns correct program for:
  - [ ] Time within first item
  - [ ] Time in middle of schedule
  - [ ] Time after one complete loop
  - [ ] Time before anchor (negative offset)
- [ ] Binary search finds correct item in O(log n)
- [ ] Deterministic shuffle produces same order for same seed
- [ ] Different seeds produce different orders
- [ ] `getScheduleWindow()` returns all programs in range
- [ ] `programStart` event emits at correct time
- [ ] `programEnd` event emits at correct time

### 2.8 Video Player
- [ ] Creates video element in container
- [ ] Loads HLS stream natively (no HLS.js)
- [ ] Loads direct play stream
- [ ] Seeks to start position
- [ ] Play/pause/stop work correctly
- [ ] Volume control works
- [ ] Mute/unmute works
- [ ] Subtitle tracks can be enabled/disabled
- [ ] Keep-alive prevents suspension during playback
- [ ] Error retry with exponential backoff
- [ ] `ended` event emits at end of stream
- [ ] `stateChange` events emit on all transitions

### 2.9 Navigation
- [ ] All webOS key codes mapped correctly
- [ ] Key repeat detected
- [ ] Long press detected after 500ms
- [ ] Screen navigation with `goTo()` works
- [ ] Screen history maintained for `goBack()`
- [ ] Focus moves with D-pad navigation
- [ ] Focus memory restores on screen return
- [ ] Modal traps focus
- [ ] Back button closes modal first
- [ ] `keyPress` events emit for all keys

### 2.10 EPG UI
- [ ] Grid renders with virtualization
- [ ] DOM element count < 200 during scroll
- [ ] Current time indicator positioned correctly
- [ ] D-pad navigation works in all directions
- [ ] Focus ring visible on selected cell
- [ ] Info panel updates on focus change
- [ ] OK button emits `channelSelected` event
- [ ] Back button closes EPG
- [ ] Performance: renders in <100ms

### 2.11 App Lifecycle
- [ ] Initializes with correct phase sequence
- [ ] Saves state before backgrounding
- [ ] Restores state on resume
- [ ] Detects network availability changes
- [ ] Handles visibility changes (background/foreground)
- [ ] Error recovery presents user options
- [ ] State persistence works across app restarts

---

## Phase 3: Integration Tests

### 3.1 Authentication Flow
- [ ] App launches to auth screen when not authenticated
- [ ] PIN code displays correctly
- [ ] After claiming PIN, server selection appears
- [ ] Selected server persists
- [ ] App launches directly to home when authenticated

### 3.2 Channel Creation Flow
- [ ] Can create channel from library source
- [ ] Can create channel from collection source
- [ ] Can create channel from TV show source
- [ ] Can set playback mode (sequential/shuffle)
- [ ] Channel appears in channel list after creation

### 3.3 Playback Flow
- [ ] Selecting channel starts playback
- [ ] Correct program plays based on current time
- [ ] Playback starts at correct offset within program
- [ ] Next program starts automatically
- [ ] Channel up/down switches channels
- [ ] EPG can be opened during playback
- [ ] Selecting from EPG switches to that channel

### 3.4 EPG Integration
- [ ] EPG shows all configured channels
- [ ] Programs display with correct times
- [ ] Current program highlighted
- [ ] Navigating in EPG doesn't interrupt playback
- [ ] Selecting program switches channel and starts

### 3.5 Error Recovery
- [ ] Network loss shows error screen
- [ ] Retry option works when network returns
- [ ] Server unreachable shows appropriate message
- [ ] Playback error skips to next program
- [ ] Auth expiry redirects to auth screen

### 3.6 Failure Scenario Tests

#### Network Failure Scenarios
- [ ] **Mid-playback network loss**: Video pauses, shows buffering, then error after timeout
- [ ] **Network loss during channel switch**: Show error with retry option
- [ ] **Network loss during EPG scroll**: Cached data continues to display, stale indicator shown
- [ ] **Network restored after loss**: Auto-retry begins, resume playback at correct position

#### Authentication Failure Scenarios  
- [ ] **Token expires during playback**: Playback pauses, auth prompt shown after current program
- [ ] **Token expires during app background**: Check and refresh on resume
- [ ] **Token invalidated by user (revoked)**: Redirect to auth, clear stored credentials
- [ ] **Rate limited by Plex.tv**: Backoff and retry with exponential delay

#### Content Failure Scenarios
- [ ] **Plex item deleted during playback**: Skip to next, log warning
- [ ] **Plex library deleted**: Mark channels as stale, notify user to reconfigure
- [ ] **Stream URL becomes invalid mid-playback**: Attempt re-resolve, fallback to skip
- [ ] **Subtitle file missing**: Continue playback without subtitles

#### Server Failure Scenarios
- [ ] **Server goes offline during playback**: Retry 3x, then error with server select option
- [ ] **All connections to server fail**: Offer to switch servers if multiple available
- [ ] **Server SSL certificate error**: Show security warning with option to proceed

#### State Corruption Scenarios
- [ ] **localStorage corrupted**: Detect, clear, show first-run setup
- [ ] **Channel config invalid JSON**: Skip invalid channels, load rest
- [ ] **Schedule has impossible times**: Regenerate schedule from anchor



## Phase 4: Performance Tests

### 4.1 UI Responsiveness
- [ ] Frame rate ≥ 60fps during normal operation
- [ ] EPG scroll maintains 60fps
- [ ] Focus transitions complete in <150ms
- [ ] Screen transitions complete in <200ms

### 4.2 Channel Switch Time
- [ ] Initial stream load < 3 seconds
- [ ] Channel switch < 3 seconds
- [ ] EPG to channel switch < 3 seconds

### 4.3 Schedule Performance
- [ ] `getProgramAtTime()` executes in <5ms
- [ ] `getScheduleWindow(24h)` executes in <50ms
- [ ] Schedule calculation for 10,000 items < 50ms

### 4.4 Memory Usage
- [ ] Idle memory < 100MB
- [ ] Playback memory < 200MB
- [ ] Peak memory < 300MB
- [ ] No memory leaks during 1-hour continuous use

---

## Phase 5: webOS Platform Tests

### 5.1 Remote Control
- [ ] OK button works
- [ ] Back button works
- [ ] D-pad navigation works
- [ ] Channel Up/Down works
- [ ] Play/Pause buttons work
- [ ] Number buttons (channel input) work
- [ ] Info button shows program info
- [ ] Guide button opens EPG
- [ ] Color buttons work (if assigned)

### 5.2 TV-Specific Behavior
- [ ] App doesn't suspend during long playback
- [ ] Background/foreground transitions work
- [ ] Network disconnection handled gracefully
- [ ] TV sleep/wake resumption works
- [ ] Magic Remote pointer mode works (if enabled)

### 5.3 Display
- [ ] Safe zone margins respected (5%)
- [ ] Text readable from 10 feet
- [ ] Focus ring visible from 10 feet
- [ ] Layout works on 1920x1080 resolution
- [ ] No overscan issues

### 5.4 Compatibility
- [ ] Works on webOS 4.0 (Chromium 68)
- [ ] Works on webOS 5.0+ (if applicable)
- [ ] No ES6+ features unsupported by Chromium 68

---

## Phase 6: Stress Tests

### 6.1 Long-Running Operation
- [ ] 4-hour continuous playback
- [ ] 24-hour continuous playback
- [ ] Memory stable after 24 hours
- [ ] No audio/video desync

### 6.2 Rapid Actions
- [ ] 50 rapid channel changes
- [ ] 100 rapid EPG open/close cycles
- [ ] 200 rapid focus moves
- [ ] App remains responsive

### 6.3 Edge Cases
- [ ] Channel with 1 item (very short loop)
- [ ] Channel with 10,000 items
- [ ] Very short content (< 1 minute)
- [ ] Very long content (> 4 hours)
- [ ] Empty channel (error handling)
- [ ] All channels empty

---

## Phase 7: User Experience Tests

### 7.1 First-Run Experience
- [ ] Clear instructions for Plex PIN entry
- [ ] Helpful error messages
- [ ] Logical navigation flow
- [ ] Can complete setup without documentation

### 7.2 Daily Use
- [ ] App remembers last channel
- [ ] Channel switching feels instant
- [ ] EPG is intuitive to navigate
- [ ] Program info is useful and readable

### 7.3 Error States
- [ ] Clear error messages for all error types
- [ ] Recovery options available
- [ ] User never stuck with no options

---

## Phase 8: Accessibility Testing

### 8.1 Focus Management
- [ ] All interactive elements are focusable via D-pad
- [ ] Focus order follows logical reading order
- [ ] Focus indicator is clearly visible (4px+ outline/border)
- [ ] Focus never gets trapped in a component
- [ ] Modal dialogs trap focus correctly and restore on close

### 8.2 Remote Control Navigation
- [ ] All functions reachable via remote only (no pointer required)
- [ ] Back button works consistently across all screens
- [ ] OK button activates the focused element
- [ ] Channel ↑/↓ work during playback for channel switching
- [ ] Color buttons (Red/Green/Yellow/Blue) have consistent meaning

### 8.3 Visual Accessibility
- [ ] Text contrast ratio ≥4.5:1 (AA standard)
- [ ] Important information not conveyed by color alone
- [ ] UI elements have minimum touch target of 44×44 logical pixels
- [ ] Text is readable at 10-foot viewing distance (minimum 24px for body)
- [ ] Animations can be reduced for users who prefer reduced motion

### 8.4 Audio/Video Accessibility
- [ ] Subtitle support enabled and configurable
- [ ] Audio track selection available
- [ ] Volume controls accessible
- [ ] Media info overlay shows audio/subtitle status

## Sign-Off

### Development Complete
- [ ] All Phase 1-7 tests pass
- [ ] Code reviewed
- [ ] No critical or high-severity bugs open
- [ ] Documentation complete

### Ready for Deployment
| Reviewer | Date | Signature |
|----------|------|-----------|
| Developer | | |
| QA | | |
| Stakeholder | | |

---

## Test Execution Log

| Test ID | Date | Tester | Result | Notes |
|---------|------|--------|--------|-------|
| | | | | |
| | | | | |
| | | | | |
