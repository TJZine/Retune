# Module: Application Orchestrator

## Metadata
- **ID**: `app-orchestrator`
- **Path**: `src/`
- **Primary File**: `Orchestrator.ts`
- **Test File**: `Orchestrator.test.ts`
- **Dependencies**: All other modules
- **Complexity**: medium
- **Estimated LoC**: 350

## Purpose

The central coordinator that initializes all modules, sets up inter-module communication via events, manages the application startup sequence, and handles the flow between different application states (auth, playback, EPG, etc.).

## Public Interface

```typescript
/**
 * Application Orchestrator Interface
 */
export interface IAppOrchestrator {
  // Lifecycle
  start(): Promise<void>;
  shutdown(): Promise<void>;
  
  // Status
  getModuleStatus(): Map<string, ModuleStatus>;
  isReady(): boolean;
  
  // Actions
  switchToChannel(channelId: string): Promise<void>;
  switchToChannelByNumber(number: number): Promise<void>;
  openEPG(): void;
  closeEPG(): void;
  toggleEPG(): void;
}
```

## Required Exports

```typescript
// src/Orchestrator.ts
export { AppOrchestrator } from './Orchestrator';
export type { IAppOrchestrator, ModuleStatus } from './types';
```

## Implementation Requirements

### MUST Implement:

1. **Module Initialization Sequence**
   ```
   Phase 1 (Parallel): EventEmitter, AppLifecycle, Navigation
   Phase 2 (After Phase 1): PlexAuth
   Phase 3 (After Auth): PlexServerDiscovery, PlexLibrary, PlexStreamResolver
   Phase 4 (After Plex): ChannelManager, ChannelScheduler, VideoPlayer
   Phase 5 (After All): EPGComponent
   ```

2. **Inter-Module Event Wiring**
   - Scheduler → VideoPlayer (programStart → loadStream)
   - VideoPlayer → Scheduler (ended → advanceToNext)
   - Navigation → Screens (screenChange → show/hide)
   - EPG → Orchestrator (channelSelected → switchChannel)

3. **State Restoration Flow**
   - Check for saved state
   - If auth exists: validate token, connect to server
   - If channels exist: load channel manager
   - Resume last channel at current time

4. **Error Handling**
   - Module init failures logged but non-fatal (if possible)
   - Critical failures (auth, player) halt startup
   - Display error screen with recovery options

### MUST NOT:

1. Hold direct references to DOM (delegate to UI modules)
2. Contain business logic (delegate to appropriate module)
3. Block startup on non-critical modules

## Startup Sequence

```typescript
async start(): Promise<void> {
  try {
    // Phase 1: Core infrastructure
    await Promise.all([
      this.lifecycle.initialize(),
      this.navigation.initialize(NAVIGATION_CONFIG)
    ]);
    
    this.lifecycle.setPhase('authenticating');
    
    // Phase 2: Check authentication
    const savedState = await this.lifecycle.restoreState();
    
    if (savedState?.plexAuth) {
      // Validate existing token
      const isValid = await this.plexAuth.validateToken(
        savedState.plexAuth.token.token
      );
      
      if (isValid) {
        await this.plexAuth.storeCredentials(savedState.plexAuth);
        this.lifecycle.setPhase('loading_data');
      } else {
        this.navigation.goTo('auth');
        return;
      }
    } else {
      this.navigation.goTo('auth');
      return;
    }
    
    // Phase 3: Connect to Plex
    await this.plexDiscovery.discoverServers();
    const connected = await this.plexDiscovery.selectServer(
      savedState.plexAuth.selectedServerId!
    );
    
    if (!connected) {
      this.navigation.goTo('server-select');
      return;
    }
    
    // Phase 4: Load channels
    await this.channelManager.loadChannels();
    
    // Phase 5: Setup event wiring
    this.setupEventWiring();
    
    // Phase 6: Start playback
    this.lifecycle.setPhase('ready');
    this.navigation.goTo('player');
    
    const currentChannel = this.channelManager.getCurrentChannel();
    if (currentChannel) {
      await this.switchToChannel(currentChannel.id);
    }
    
  } catch (error) {
    this.lifecycle.reportError({
      type: 'INITIALIZATION_FAILED',
      message: error.message,
      userMessage: 'Failed to start application',
      actions: [
        { label: 'Retry', action: () => this.start(), isPrimary: true },
        { label: 'Exit', action: () => this.shutdown(), isPrimary: false }
      ],
      timestamp: Date.now()
    });
  }
}
```

## Event Wiring

```typescript
private setupEventWiring(): void {
  // Scheduler → VideoPlayer
  this.scheduler.on('programStart', async (program) => {
    try {
      const stream = await this.resolveStreamForProgram(program);
      await this.videoPlayer.loadStream(stream);
      await this.videoPlayer.play();
    } catch (error) {
      console.error('Failed to load stream:', error);
      this.scheduler.skipToNext();
    }
  });
  
  // VideoPlayer → Scheduler
  this.videoPlayer.on('ended', () => {
    this.scheduler.skipToNext();
  });
  
  this.videoPlayer.on('error', (error) => {
    if (!error.recoverable) {
      this.scheduler.skipToNext();
    }
  });
  
  // Navigation → Key routing
  this.navigation.on('keyPress', (event) => {
    this.handleKeyPress(event);
  });
  
  // EPG → Channel switch
  this.epg.on('channelSelected', ({ channel, program }) => {
    this.closeEPG();
    this.switchToChannel(channel.id);
  });
  
  // Lifecycle → Pause/Resume
  this.lifecycle.onPause(() => {
    this.videoPlayer.pause();
    this.scheduler.stopSyncTimer();
    this.lifecycle.saveState();
  });
  
  this.lifecycle.onResume(() => {
    this.scheduler.syncToCurrentTime();
    this.videoPlayer.play();
  });
  
  // Channel switching via remote
  this.navigation.on('keyPress', (event) => {
    if (event.button === 'channelUp') {
      this.switchToNextChannel();
    } else if (event.button === 'channelDown') {
      this.switchToPreviousChannel();
    } else if (event.button === 'guide') {
      this.toggleEPG();
    }
  });
}
```

## Channel Switch Flow

```typescript
async switchToChannel(channelId: string): Promise<void> {
  const channel = this.channelManager.getChannel(channelId);
  if (!channel) {
    console.error('Channel not found:', channelId);
    return;
  }
  
  // Show channel banner
  this.ui.showChannelBanner(channel);
  
  // Stop current playback
  this.videoPlayer.stop();
  
  // Resolve channel content if needed
  const content = await this.channelManager.resolveChannelContent(channelId);
  
  // Configure scheduler
  this.scheduler.loadChannel({
    channelId: channel.id,
    anchorTime: channel.startTimeAnchor,
    content: content.orderedItems,
    playbackMode: channel.playbackMode,
    shuffleSeed: channel.shuffleSeed!,
    loopSchedule: true
  });
  
  // Sync to current time (this will emit programStart)
  this.scheduler.syncToCurrentTime();
  
  // Update current channel
  this.channelManager.setCurrentChannel(channelId);
  
  // Save state
  await this.lifecycle.saveState();
}

private async resolveStreamForProgram(program: ScheduledProgram): Promise<StreamDescriptor> {
  const decision = await this.plexStreamResolver.resolveStream({
    itemKey: program.item.ratingKey,
    startOffsetMs: program.elapsedMs,
    directPlay: true
  });
  
  return {
    url: decision.playbackUrl,
    protocol: decision.protocol === 'hls' ? 'hls' : 'direct',
    mimeType: this.getMimeType(decision),
    startPositionMs: program.elapsedMs,
    mediaMetadata: {
      title: program.item.title,
      subtitle: program.item.type === 'episode' ? program.item.fullTitle : undefined,
      artworkUrl: program.item.thumb ?? undefined,
      year: program.item.year,
      plexRatingKey: program.item.ratingKey
    },
    subtitleTracks: [],  // Populated from decision if available
    audioTracks: [],     // Populated from decision if available
    durationMs: program.item.durationMs,
    isLive: false
  };
}
```

## Test Specification

### Unit Tests Required:

```typescript
describe('AppOrchestrator', () => {
  describe('start', () => {
    it('should initialize all modules in correct order', async () => {
      // Track init order
    });
    
    it('should navigate to auth if no saved credentials', async () => {
      mockNoSavedState();
      await orchestrator.start();
      expect(navigation.getCurrentScreen()).toBe('auth');
    });
    
    it('should validate token and proceed if valid', async () => {
      mockSavedStateWithAuth();
      mockValidToken();
      await orchestrator.start();
      expect(navigation.getCurrentScreen()).toBe('player');
    });
    
    it('should navigate to auth if token invalid', async () => {
      mockSavedStateWithAuth();
      mockInvalidToken();
      await orchestrator.start();
      expect(navigation.getCurrentScreen()).toBe('auth');
    });
  });
  
  describe('switchToChannel', () => {
    it('should stop current playback', async () => {
      await orchestrator.switchToChannel('ch1');
      expect(videoPlayer.stop).toHaveBeenCalled();
    });
    
    it('should load scheduler with channel content', async () => {
      await orchestrator.switchToChannel('ch1');
      expect(scheduler.loadChannel).toHaveBeenCalled();
    });
    
    it('should save state after switch', async () => {
      await orchestrator.switchToChannel('ch1');
      expect(lifecycle.saveState).toHaveBeenCalled();
    });
  });
  
  describe('event wiring', () => {
    it('should load stream on programStart', async () => {
      setupWiring();
      scheduler.emit('programStart', mockProgram);
      await flushPromises();
      expect(videoPlayer.loadStream).toHaveBeenCalled();
    });
    
    it('should advance scheduler on video ended', () => {
      setupWiring();
      videoPlayer.emit('ended');
      expect(scheduler.skipToNext).toHaveBeenCalled();
    });
    
    it('should switch channel on channelUp', () => {
      setupWiring();
      navigation.emit('keyPress', { button: 'channelUp' });
      expect(orchestrator.switchToNextChannel).toHaveBeenCalled();
    });
  });
});
```

## File Structure

```
src/
├── index.ts              # Entry point
├── App.ts                # Main application shell
├── Orchestrator.ts       # AppOrchestrator class
└── types.ts              # IAppOrchestrator, ModuleStatus
```

## Implementation Checklist

- [ ] Create file structure
- [ ] Implement module initialization sequence
- [ ] Implement state restoration flow
- [ ] Implement event wiring between modules
- [ ] Implement channel switching
- [ ] Implement EPG open/close
- [ ] Implement error handling
- [ ] Write unit tests
- [ ] Add JSDoc comments
- [ ] Verify against acceptance criteria

## Acceptance Criteria

This module is COMPLETE when:
1. [ ] All modules initialize in correct order
2. [ ] State restores correctly on app launch
3. [ ] Event wiring connects all modules
4. [ ] Channel switching works end-to-end
5. [ ] EPG opens/closes via Guide button
6. [ ] Errors display with recovery options
7. [ ] All unit tests pass
8. [ ] No TypeScript compilation errors
