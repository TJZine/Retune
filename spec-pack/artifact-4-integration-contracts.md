# Integration Contract Specifications

This document defines the communication contracts between modules in the Retune application.

---

## Contract: PlexAuth ↔ PlexServerDiscovery

### Contract ID: `auth-to-discovery`

### Direction: Discovery → Auth (Discovery calls Auth)

### Interaction Pattern:

- [x] Direct method call
- [ ] Event-based
- [ ] Callback registration

### Contract Definition:

**Discovery expects Auth to provide**:

```typescript
interface ExpectedFromAuth {
  isAuthenticated(): boolean;
  getAuthHeaders(): Record<string, string>;
  getCurrentUser(): PlexAuthToken | null;
}
```

### Discovery guarantees:

- Will not make API calls if `isAuthenticated()` returns false
- Will include all headers from `getAuthHeaders()` in requests

### Error Contract:

- If auth headers are invalid (401 response), Discovery emits `SERVER_UNAUTHORIZED` error
- Auth module should listen and potentially trigger re-authentication

### Sequence Diagram:

```text
PlexServerDiscovery              PlexAuth
        │                            │
        │── isAuthenticated() ──────>│
        │                            │
        │<──── true ─────────────────│
        │                            │
        │── getAuthHeaders() ───────>│
        │                            │
        │<─── { X-Plex-Token, ... } ─│
        │                            │
        │ (makes API request with headers)
```

---

## Contract: ChannelScheduler ↔ ChannelManager

### Contract ID: `scheduler-to-manager`

### Direction: Scheduler → Manager (Scheduler reads from Manager)

### Interaction Pattern:

- [x] Direct method call
- [x] Event-based (for content updates)
- [ ] Callback registration

### Contract Definition:

**Scheduler expects Manager to provide**:

```typescript
interface ExpectedFromChannelManager {
  getChannel(channelId: string): ChannelConfig | null;
  resolveChannelContent(channelId: string): Promise<ResolvedChannelContent>;
}
```

**Manager emits events Scheduler listens to**:

```typescript
interface ChannelManagerEvents {
  contentResolved: ResolvedChannelContent;
  channelUpdated: ChannelConfig;
}
```

### Scheduler guarantees:

- Will reload schedule when `contentResolved` event received
- Will calculate current program within 50ms

### Error Contract:

- If content resolution fails, Manager emits error, Scheduler enters error state
- Scheduler will attempt to use cached content if available

### Sequence Diagram:

```text
ChannelScheduler           ChannelManager
       │                         │
       │─── loadChannel() ──────>│
       │                         │
       │    resolveChannelContent()
       │                         │
       │<── ResolvedChannelContent│
       │                         │
       │ (builds index, starts timer)
       │                         │
       │                         │── (content changes)
       │                         │
       │<─── contentResolved ────│
       │                         │
       │ (rebuilds schedule)     │
```

---

## Contract: VideoPlayer ↔ PlexStreamResolver

### Contract ID: `player-to-stream`

### Direction: Orchestrator mediates (both called by Orchestrator)

### Interaction Pattern:

- [x] Direct method call
- [ ] Event-based
- [ ] Callback registration

### Contract Definition:

**Orchestrator flow**:

```typescript
// When scheduler emits programStart:
const program: ScheduledProgram = event.program;
const streamRequest: StreamRequest = {
  itemKey: program.item.ratingKey,
  startOffsetMs: program.elapsedMs,
  directPlay: true
};

const decision: StreamDecision = await plexStreamResolver.resolveStream(streamRequest);

const descriptor: StreamDescriptor = {
  url: decision.playbackUrl,
  protocol: decision.protocol,
  mimeType: getMimeType(decision.protocol),
  startPositionMs: program.elapsedMs,
  // ... other fields
};

await videoPlayer.loadStream(descriptor);
await videoPlayer.play();
```

### Error Contract:

- If stream resolution fails, Orchestrator requests transcoded fallback
- If transcode fails, skip to next program

### Sequence Diagram:

```text
Orchestrator        PlexStreamResolver        VideoPlayer
     │                     │                       │
     │── resolveStream() ─>│                       │
     │                     │                       │
     │<── StreamDecision ──│                       │
     │                     │                       │
     │ (create StreamDescriptor)                   │
     │                     │                       │
     │────────────────────────── loadStream() ────>│
     │                     │                       │
     │────────────────────────── play() ──────────>│
```

---

## Contract: PlexLibrary ↔ ChannelManager

### Contract ID: `library-to-channel-manager`

### Direction: ChannelManager → PlexLibrary (Manager reads from Library)

### Interaction Pattern:

- [x] Direct method call
- [ ] Event-based
- [ ] Callback registration

### Contract Definition:

**ChannelManager expects PlexLibrary to provide**:

```typescript
interface ExpectedFromPlexLibrary {
  getLibraries(): Promise<PlexLibrary[]>;
  getLibraryItems(libraryId: string, options?: LibraryQueryOptions): Promise<PlexMediaItem[]>;
  getShowEpisodes(showKey: string): Promise<PlexMediaItem[]>;
  getCollectionItems(collectionKey: string): Promise<PlexMediaItem[]>;
  getPlaylistItems(playlistKey: string): Promise<PlexMediaItem[]>;
  getItem(ratingKey: string): Promise<PlexMediaItem | null>;
  getImageUrl(imagePath: string, width?: number, height?: number): string;
}
```

### ChannelManager guarantees:

- Will call `getLibraries()` once during initialization
- Will cache library structure to minimize API calls
- Will not call library methods without valid Plex connection

### PlexLibrary guarantees:

- Will handle pagination transparently (return all items)
- Will return items sorted in natural order (by title or date)
- Will emit `authExpired` event if token becomes invalid
- All async methods complete in <5s under normal network conditions

### Error Contract:

| Error Scenario | PlexLibrary Response | ChannelManager Handling |
|---------------|---------------------|------------------------|
| Network timeout | Throws `NETWORK_TIMEOUT` | Retry with backoff, show loading |
| Auth expired | Emits `authExpired`, throws `AUTH_EXPIRED` | Pause loading, await re-auth |
| Server unavailable | Throws `SERVER_UNREACHABLE` | Show error, prompt reconnect |
| Item not found | Returns `null` | Filter from channel content |
| Empty library | Returns `[]` | Show "library empty" state |

### Sequence Diagram:

```text
ChannelManager              PlexLibrary
      │                          │
      │── getLibraries() ───────>│
      │                          │
      │<── PlexLibrary[] ────────│
      │                          │
      │ (user creates channel    │
      │  with playlist source)   │
      │                          │
      │── getPlaylistItems() ───>│
      │      (playlistKey)       │
      │                          │
      │<── PlexMediaItem[] ──────│
      │                          │
      │ (for each item, get      │
      │  thumbnail URL)          │
      │                          │
      │── getImageUrl() ────────>│
      │      (thumb, 200, 300)   │
      │                          │
      │<── "http://...?token=..." │
```

### Data Flow Example:

```typescript
// ChannelManager resolving channel content
async resolveChannelContent(channelId: string): Promise<ResolvedChannelContent> {
  const channel = this.getChannel(channelId);
  
  let items: PlexMediaItem[];
  
  switch (channel.sourceType) {
    case 'library':
      items = await this.plexLibrary.getLibraryItems(channel.sourceId);
      break;
    case 'playlist':
      items = await this.plexLibrary.getPlaylistItems(channel.sourceId);
      break;
    case 'collection':
      items = await this.plexLibrary.getCollectionItems(channel.sourceId);
      break;
    case 'show':
      items = await this.plexLibrary.getShowEpisodes(channel.sourceId);
      break;
  }
  
  return {
    channelId: channel.id,
    orderedItems: items,
    resolvedAt: Date.now()
  };
}
```

---

## Contract: EPG ↔ ChannelScheduler

### Contract ID: `epg-to-scheduler`

### Direction: EPG → Scheduler (EPG queries Scheduler)

### Interaction Pattern:

- [x] Direct method call
- [x] Event-based (for updates)
- [ ] Callback registration

### Contract Definition:

**EPG expects Scheduler to provide**:

```typescript
interface ExpectedFromScheduler {
  getScheduleWindow(startTime: number, endTime: number): ScheduleWindow;
  getCurrentProgram(): ScheduledProgram;
}
```

**Scheduler emits events EPG listens to**:

```typescript
interface SchedulerEvents {
  programStart: ScheduledProgram;
  programEnd: ScheduledProgram;
  scheduleSync: SchedulerState;
}
```

### EPG guarantees:

- Will call `getScheduleWindow()` when:
  - EPG becomes visible
  - User scrolls time axis
  - Channel is loaded
- Will update current indicator on `scheduleSync`

### Scheduler guarantees:

- `getScheduleWindow()` returns in <50ms
- Programs in window are correctly ordered by time
- Includes partial programs at boundaries

### Sequence Diagram:

```text
EPGComponent           ChannelScheduler
     │                       │
     │── getScheduleWindow()─>│
     │   (12:00 - 15:00)     │
     │                       │
     │<── ScheduleWindow ────│
     │   { programs: [...] } │
     │                       │
     │ (render grid)         │
     │                       │
     │                       │─── (timer tick)
     │<──── scheduleSync ────│
     │                       │
     │ (update time indicator)
```

---

## Contract: Navigation ↔ All UI Components

### Contract ID: `navigation-to-ui`

### Direction: Navigation → UI Components

### Interaction Pattern:

- [ ] Direct method call
- [x] Event-based
- [x] Callback registration

### Contract Definition:

**UI Components register with Navigation**:

```typescript
// On component mount:
navigationManager.registerFocusable({
  id: 'epg-cell-1',
  element: cellElement,
  neighbors: {
    left: 'epg-cell-0',
    right: 'epg-cell-2',
    up: 'channel-row-0-cell-1',
    down: 'channel-row-2-cell-1'
  },
  onFocus: () => this.handleFocus(),
  onBlur: () => this.handleBlur(),
  onSelect: () => this.handleSelect()
});

// On component unmount:
navigationManager.unregisterFocusable('epg-cell-1');
```

**Navigation emits events**:

```typescript
interface NavigationEvents {
  keyPress: KeyEvent;
  focusChange: { from: string | null; to: string };
  screenChange: { from: Screen; to: Screen };
}
```

### UI Component guarantees:

- Will unregister all focusables on unmount
- Will update neighbors when dynamic content changes

### Navigation guarantees:

- Will call `onFocus` when focus enters element
- Will call `onBlur` when focus leaves element
- Will call `onSelect` when OK pressed while focused

---

## Contract: AppLifecycle ↔ All Modules

### Contract ID: `lifecycle-to-all`

### Direction: AppLifecycle → All Modules (broadcast)

### Interaction Pattern:

- [ ] Direct method call
- [x] Event-based
- [x] Callback registration

### Contract Definition:

**Modules can register lifecycle callbacks**:

```typescript
appLifecycle.onPause(() => {
  // Called when app goes to background
  videoPlayer.pause();
  scheduler.stopSyncTimer();
});

appLifecycle.onResume(() => {
  // Called when app returns to foreground
  scheduler.syncToCurrentTime();
  videoPlayer.play();
});

appLifecycle.onTerminate(async () => {
  // Called before app exits - async allowed
  await this.saveState();
});
```

**Lifecycle emits events**:

```typescript
interface LifecycleEvents {
  phaseChange: { from: AppPhase; to: AppPhase };
  visibilityChange: { isVisible: boolean };
  networkChange: { isAvailable: boolean };
  error: AppError;
}
```

### Lifecycle guarantees:

- Will call `onPause` before app backgrounds
- Will call `onResume` when app returns
- Will call `onTerminate` before exit (with time limit)
- Will save state to localStorage before any transition

### Module guarantees:

- Callbacks complete quickly (<100ms for pause/resume)
- State is restoreable after restart

---

## Contract: Scheduler → VideoPlayer (via Orchestrator)

### Contract ID: `scheduler-to-player-orchestrated`

### Direction: Scheduler → Orchestrator → VideoPlayer

### Interaction Pattern:

- [x] Event-based (Scheduler emits)
- [x] Direct call (Orchestrator to Player)

### Contract Definition:

**Event flow**:

```typescript
// In Orchestrator setup:
scheduler.on('programStart', async (program: ScheduledProgram) => {
  // Resolve stream URL
  const stream = await this.resolveStreamForProgram(program);
  
  // Load and play
  await videoPlayer.loadStream(stream);
  await videoPlayer.seekTo(program.elapsedMs);
  await videoPlayer.play();
});

scheduler.on('programEnd', (program: ScheduledProgram) => {
  // Report progress to Plex
  plexStreamResolver.reportPlaybackProgress(
    program.sessionId,
    program.item.ratingKey,
    program.item.durationMs
  );
});

videoPlayer.on('ended', () => {
  // Shouldn't normally happen in linear mode
  // But handle by advancing scheduler
  scheduler.skipToNext();
});

videoPlayer.on('error', (error: PlaybackError) => {
  if (!error.recoverable) {
    scheduler.skipToNext();
  }
});
```

### Timing Contract:

- Scheduler emits `programStart` at T-0 of new program
- VideoPlayer should start streaming within 3 seconds
- If taking longer, show loading indicator

### Sequence Diagram:

```text
Scheduler        Orchestrator        VideoPlayer        PlexResolver
    │                 │                   │                  │
    │── programEnd ──>│                   │                  │
    │                 │── reportProgress ─┼─────────────────>│
    │                 │                   │                  │
    │── programStart >│                   │                  │
    │                 │── resolveStream ──┼─────────────────>│
    │                 │                   │                  │
    │                 │<─ StreamDecision ─┼──────────────────│
    │                 │                   │                  │
    │                 │── loadStream() ──>│                  │
    │                 │                   │                  │
    │                 │── seekTo() ──────>│                  │
    │                 │                   │                  │
    │                 │── play() ────────>│                  │
    │                 │                   │                  │
```

---

## Error Propagation Matrix

| Source Module | AppErrorCode | Handler Module | Recovery Action |
|---------------|--------------|----------------|-----------------|
| PlexAuth | AppErrorCode.AUTH_EXPIRED | AppOrchestrator | → Show auth screen |
| PlexServerDiscovery | AppErrorCode.SERVER_UNREACHABLE | ErrorRecovery | → Try other connections |
| PlexLibrary | AppErrorCode.NETWORK_TIMEOUT | ErrorRecovery | → Retry with backoff |
| ChannelManager | AppErrorCode.CONTENT_UNAVAILABLE | Scheduler | → Use cached content |
| Scheduler | AppErrorCode.SCHEDULER_EMPTY_CHANNEL | VideoPlayer | → Show error overlay |
| VideoPlayer | AppErrorCode.NETWORK_TIMEOUT | VideoPlayer | → Retry 3x |
| VideoPlayer | AppErrorCode.PLAYBACK_DECODE_ERROR | AppOrchestrator | → Skip to next |
| VideoPlayer | AppErrorCode.PLAYBACK_FORMAT_UNSUPPORTED | PlexStreamResolver | → Request transcode |
| Navigation | (none) | - | - |
| EPG | (delegates) | Scheduler | - |

---

## Event Bus Summary

```text
                        ┌─────────────────┐
                        │  AppOrchestrator │
                        │   (Event Hub)    │
                        └────────┬────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
        ▼                        ▼                        ▼
  ┌───────────┐           ┌───────────┐            ┌───────────┐
  │  Scheduler │           │VideoPlayer│            │    EPG    │
  │  Events   │           │  Events   │            │  Events   │
  └───────────┘           └───────────┘            └───────────┘
        │                        │                        │
   programStart             stateChange                 open
   programEnd               timeUpdate                  close
   scheduleSync             ended                       focusChange
                            error                       channelSelected
                                                        programSelected

        ┌───────────┐           ┌───────────┐
        │Navigation │           │ Lifecycle │
        │  Events   │           │  Events   │
        └───────────┘           └───────────┘
             │                        │
        keyPress                 phaseChange
        screenChange             visibilityChange
        focusChange              networkChange
        modalOpen                error
        modalClose
```
