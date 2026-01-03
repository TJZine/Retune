# Module: Application Orchestrator

## Metadata

- **ID**: `app-orchestrator`
- **Path**: `src/`
- **Primary File**: `Orchestrator.ts`
- **Test File**: `Orchestrator.test.ts`
- **Dependencies**: event-emitter, app-lifecycle, navigation, plex-auth, plex-server-discovery, plex-stream-resolver, plex-library, channel-manager, channel-scheduler, video-player, epg-ui
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
  initialize(config: OrchestratorConfig): Promise<void>;
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
  
  // Error Handling (CRITICAL - Complete Error Type Coverage)
  /**
   * Handle a global application error with user-facing recovery options.
   * Displays error overlay with appropriate message and actions.
   * 
   * @param error - The AppError to handle
   * @param context - Module or operation context where error originated
   */
  handleGlobalError(error: AppError, context: string): void;
  
  /**
   * Register a module-specific error handler. Called before global handler.
   * @param moduleId - Module identifier  
   * @param handler - Handler function, returns true if error was handled
   */
  registerErrorHandler(
    moduleId: string,
    handler: (error: AppError) => boolean
  ): void;
  
  /**
   * Get recovery actions for a specific error type.
   * Used by error UI to display appropriate buttons.
   */
  getRecoveryActions(errorCode: AppErrorCode): ErrorRecoveryAction[];
}

/**
 * Error recovery mapping uses the canonical AppErrorCode enum.
 * Import from artifact-2-shared-types.ts.
 * 
 * Recovery strategy per error code:
 * - AUTH_REQUIRED/AUTH_EXPIRED/AUTH_INVALID → show auth screen
 * - AUTH_RATE_LIMITED → wait and retry
 * - NETWORK_OFFLINE → show retry, wait for reconnect
 * - NETWORK_TIMEOUT → retry with backoff
 * - SERVER_UNREACHABLE → offer server selection
 * - SERVER_SSL_ERROR → warn user, offer proceed
 * - PLAYBACK_SOURCE_NOT_FOUND → skip to next item
 * - PLAYBACK_DECODE_ERROR → try transcode, then skip
 * - TRANSCODE_FAILED → skip item
 * - SCHEDULER_EMPTY_CHANNEL → prompt configuration
 * - CONTENT_UNAVAILABLE → refresh library, skip
 * - LIBRARY_UNAVAILABLE → prompt reconfiguration
 * - STORAGE_QUOTA_EXCEEDED → cleanup, notify user
 * - STORAGE_CORRUPTED → clear and restart
 * - MODULE_INIT_FAILED → retry or degrade
 * - MODULE_CRASH → restart module
 * - INITIALIZATION_FAILED → retry or exit
 * - UNRECOVERABLE → exit app
 */

/**
 * Recovery action definition for error handling UI
 */
interface ErrorRecoveryAction {
  label: string;           // Button text
  action: () => void;      // Handler function
  isPrimary: boolean;      // Primary button styling
  requiresNetwork: boolean; // Grey out if offline
}

/**
 * Module status tracking
 */
interface ModuleStatus {
  id: string;
  name: string;
  status: 'pending' | 'initializing' | 'ready' | 'error' | 'disabled';
  loadTimeMs?: number;
  error?: AppError;
  memoryUsageMB?: number;
}

interface OrchestratorConfig {
  plexConfig: PlexAuthConfig;
  playerConfig: VideoPlayerConfig;
  navConfig: NavigationConfig;
  epgConfig: EPGConfig;
}
```

## Required Exports

```typescript
// src/Orchestrator.ts
export { AppOrchestrator } from './Orchestrator';
export type { IAppOrchestrator, ModuleStatus } from './types';
```

## Implementation Requirements

### MUST Implement

1. **Module Initialization Sequence**

   ```text
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

### MUST NOT

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
    
    if (savedState && savedState.plexAuth) {
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
      artworkUrl: program.item.thumb || undefined,
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

### Unit Tests Required

```typescript
describe('AppOrchestrator', () => {
  describe('start', () => {
    it('should initialize all modules in correct order', async () => {
      const initOrder: string[] = [];
      mockLifecycle.initialize.mockImplementation(() => {
        initOrder.push('lifecycle');
        return Promise.resolve();
      });
      mockNavigation.initialize.mockImplementation(() => {
        initOrder.push('navigation');
        return Promise.resolve();
      });
      mockPlexAuth.initialize.mockImplementation(() => {
        initOrder.push('plexAuth');
        return Promise.resolve();
      });
      
      await orchestrator.start();
      
      // Phase 1 modules should init before Phase 2
      expect(initOrder.indexOf('lifecycle')).toBeLessThan(initOrder.indexOf('plexAuth'));
      expect(initOrder.indexOf('navigation')).toBeLessThan(initOrder.indexOf('plexAuth'));
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
    
    it('should navigate to server-select if server connection fails', async () => {
      mockSavedStateWithAuth();
      mockValidToken();
      mockDiscovery.selectServer.mockResolvedValue(false);
      await orchestrator.start();
      expect(navigation.getCurrentScreen()).toBe('server-select');
    });
    
    it('should display error screen on critical failure', async () => {
      mockLifecycle.initialize.mockRejectedValue(new Error('Init failed'));
      await orchestrator.start();
      expect(lifecycle.reportError).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'INITIALIZATION_FAILED' })
      );
    });
    
    it('should provide retry action on initialization failure', async () => {
      mockLifecycle.initialize.mockRejectedValue(new Error('Init failed'));
      await orchestrator.start();
      const errorCall = lifecycle.reportError.mock.calls[0][0];
      expect(errorCall.actions).toContainEqual(
        expect.objectContaining({ label: 'Retry', isPrimary: true })
      );
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
    
    it('should show channel banner on switch', async () => {
      await orchestrator.switchToChannel('ch1');
      expect(ui.showChannelBanner).toHaveBeenCalledWith(mockChannel);
    });
    
    it('should handle non-existent channel gracefully', async () => {
      mockChannelManager.getChannel.mockReturnValue(null);
      await expect(orchestrator.switchToChannel('invalid')).resolves.not.toThrow();
      expect(console.error).toHaveBeenCalledWith('Channel not found:', 'invalid');
    });
    
    it('should resolve channel content before loading scheduler', async () => {
      const resolveOrder: string[] = [];
      mockChannelManager.resolveChannelContent.mockImplementation(async () => {
        resolveOrder.push('resolve');
        return { orderedItems: [] };
      });
      mockScheduler.loadChannel.mockImplementation(() => {
        resolveOrder.push('load');
      });
      
      await orchestrator.switchToChannel('ch1');
      expect(resolveOrder).toEqual(['resolve', 'load']);
    });
  });
  
  describe('switchToChannelByNumber', () => {
    it('should find channel by number and switch', async () => {
      mockChannelManager.getChannelByNumber.mockReturnValue(mockChannel);
      await orchestrator.switchToChannelByNumber(5);
      expect(orchestrator.switchToChannel).toHaveBeenCalledWith(mockChannel.id);
    });
    
    it('should show error overlay for invalid channel number', async () => {
      mockChannelManager.getChannelByNumber.mockReturnValue(null);
      await orchestrator.switchToChannelByNumber(999);
      expect(ui.showError).toHaveBeenCalledWith('Channel 999 not found');
    });
  });
  
  describe('EPG management', () => {
    it('should open EPG and focus first channel', () => {
      orchestrator.openEPG();
      expect(epg.show).toHaveBeenCalled();
      expect(epg.focusNow).toHaveBeenCalled();
    });
    
    it('should close EPG', () => {
      orchestrator.closeEPG();
      expect(epg.hide).toHaveBeenCalled();
    });
    
    it('should toggle EPG from closed to open', () => {
      mockEPG.isVisible.mockReturnValue(false);
      orchestrator.toggleEPG();
      expect(epg.show).toHaveBeenCalled();
    });
    
    it('should toggle EPG from open to closed', () => {
      mockEPG.isVisible.mockReturnValue(true);
      orchestrator.toggleEPG();
      expect(epg.hide).toHaveBeenCalled();
    });
  });
  
  describe('event wiring', () => {
    beforeEach(() => {
      orchestrator.setupEventWiring();
    });
    
    it('should load stream on programStart', async () => {
      scheduler.emit('programStart', mockProgram);
      await flushPromises();
      expect(videoPlayer.loadStream).toHaveBeenCalled();
    });
    
    it('should seek to correct offset on programStart', async () => {
      const programWithOffset = { ...mockProgram, elapsedMs: 30000 };
      scheduler.emit('programStart', programWithOffset);
      await flushPromises();
      expect(videoPlayer.loadStream).toHaveBeenCalledWith(
        expect.objectContaining({ startPositionMs: 30000 })
      );
    });
    
    it('should advance scheduler on video ended', () => {
      videoPlayer.emit("ended");
      expect(scheduler.skipToNext).toHaveBeenCalled();
    });
    
    it('should skip on unrecoverable video error', () => {
      videoPlayer.emit('error', { recoverable: false, code: AppErrorCode.PLAYBACK_DECODE_ERROR });
      expect(scheduler.skipToNext).toHaveBeenCalled();
    });
    
    it('should NOT skip on recoverable video error', () => {
      videoPlayer.emit('error', { recoverable: true, code: AppErrorCode.NETWORK_TIMEOUT });
      expect(scheduler.skipToNext).not.toHaveBeenCalled();
    });
    
    it('should switch channel on channelUp', () => {
      navigation.emit('keyPress', { button: 'channelUp' });
      expect(channelManager.getNextChannel).toHaveBeenCalled();
    });
    
    it('should switch channel on channelDown', () => {
      navigation.emit('keyPress', { button: 'channelDown' });
      expect(channelManager.getPreviousChannel).toHaveBeenCalled();
    });
    
    it('should toggle EPG on guide button', () => {
      const toggleSpy = jest.spyOn(orchestrator, 'toggleEPG');
      navigation.emit('keyPress', { button: 'guide' });
      expect(toggleSpy).toHaveBeenCalled();
    });
    
    it('should close EPG and switch channel on channelSelected', async () => {
      epg.emit('channelSelected', { channel: mockChannel, program: mockProgram });
      await flushPromises();
      expect(epg.hide).toHaveBeenCalled();
      expect(orchestrator.switchToChannel).toHaveBeenCalledWith(mockChannel.id);
    });
    
    it('should pause playback on app pause', () => {
      lifecycle.emit("pause");
      expect(videoPlayer.pause).toHaveBeenCalled();
      expect(scheduler.stopSyncTimer).toHaveBeenCalled();
    });
    
    it('should resume playback on app resume', () => {
      lifecycle.emit("resume");
      expect(scheduler.syncToCurrentTime).toHaveBeenCalled();
      expect(videoPlayer.play).toHaveBeenCalled();
    });
  });
  
  describe('error handling', () => {
    it('should skip to next when stream resolution fails', async () => {
      mockStreamResolver.resolveStream.mockRejectedValue(new Error('Resolution failed'));
      scheduler.emit('programStart', mockProgram);
      await flushPromises();
      expect(scheduler.skipToNext).toHaveBeenCalled();
    });
    
    it('should log stream resolution errors', async () => {
      mockStreamResolver.resolveStream.mockRejectedValue(new Error('Resolution failed'));
      scheduler.emit('programStart', mockProgram);
      await flushPromises();
      expect(console.error).toHaveBeenCalledWith('Failed to load stream:', expect.any(Error));
    });
  });
  
  describe('shutdown', () => {
    it('should save state before shutdown', async () => {
      await orchestrator.shutdown();
      expect(lifecycle.saveState).toHaveBeenCalled();
    });
    
    it('should stop video player on shutdown', async () => {
      await orchestrator.shutdown();
      expect(videoPlayer.stop).toHaveBeenCalled();
    });
    
    it('should destroy all modules on shutdown', async () => {
      await orchestrator.shutdown();
      expect(epg.destroy).toHaveBeenCalled();
      expect(navigation.destroy).toHaveBeenCalled();
    });
  });
  
  describe('getModuleStatus', () => {
    it('should return status of all modules', () => {
      const status = orchestrator.getModuleStatus();
      expect(status.has('plexAuth')).toBe(true);
      expect(status.has('channelScheduler')).toBe(true);
      expect(status.has('videoPlayer')).toBe(true);
    });
    
    it('should report module as ready when initialized', async () => {
      await orchestrator.start();
      const status = orchestrator.getModuleStatus();
      const plexAuthStatus = status.get('plexAuth');
      expect(plexAuthStatus && plexAuthStatus.status).toBe('ready');
    });
  });
});
```

### Integration Test Scenarios

```typescript
describe('AppOrchestrator Integration', () => {
  describe('Full startup flow', () => {
    it('should complete auth → server connect → channel load → playback', async () => {
      // Setup mocks for full happy path
      mockSavedStateWithAuth({ token: 'valid', serverId: 'server1' });
      mockValidToken();
      mockDiscovery.selectServer.mockResolvedValue(true);
      mockChannelManager.loadChannels.mockResolvedValue();
      mockChannelManager.getCurrentChannel.mockReturnValue(mockChannel);
      
      await orchestrator.start();
      
      expect(plexAuth.validateToken).toHaveBeenCalled();
      expect(plexDiscovery.selectServer).toHaveBeenCalledWith('server1');
      expect(channelManager.loadChannels).toHaveBeenCalled();
      expect(scheduler.loadChannel).toHaveBeenCalled();
      expect(navigation.getCurrentScreen()).toBe('player');
    });
  });
  
  describe('Channel switching end-to-end', () => {
    it('should resolve content, load scheduler, and start playback', async () => {
      const events: string[] = [];
      
      videoPlayer.on('stateChange', () => events.push('videoStateChange'));
      scheduler.on('programStart', () => events.push('programStart'));
      
      await orchestrator.switchToChannel('ch1');
      await flushPromises();
      
      expect(channelManager.resolveChannelContent).toHaveBeenCalled();
      expect(scheduler.loadChannel).toHaveBeenCalled();
      expect(scheduler.syncToCurrentTime).toHaveBeenCalled();
    });
  });
  
  describe('Error recovery flow', () => {
    it('should retry failed server connections', async () => {
      mockDiscovery.selectServer
        .mockRejectedValueOnce(new Error('Network'))
        .mockResolvedValueOnce(true);
      
      // First attempt fails, retry succeeds
      await orchestrator.start();
      expect(plexDiscovery.selectServer).toHaveBeenCalledTimes(2);
    });
  });
});
```

## File Structure

```text
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

## Common Pitfalls

> [!CAUTION]
> **AI implementers: Avoid these common mistakes**

| Pitfall | Why It Happens | Correct Approach |
| :--- | :--- | :--- |
| Initializing modules in wrong order | Parallel seems faster | Follow phase order - later modules depend on earlier ones |
| Holding DOM references | Convenient access | Never reference DOM directly - delegate to Navigation/EPG/UI modules |
| Hardcoding error recovery actions | Works for testing | Use `getRecoveryActions()` - makes error UI data-driven |
| Not wiring lifecycle callbacks | Events seem to work | Wire onPause/onResume - video must pause when app backgrounds |
| Swallowing stream resolution errors | Don't want to crash | Log, then skip to next - silent failures break debugging |
| Not saving state after channel switch | Seems minor | Always save - user expects to resume on same channel |
| Blocking startup on non-critical modules | All modules matter | EPG/settings can fail without blocking playback |
| Direct module-to-module calls | Seems more natural | Use events for loose coupling - enables testing and future changes |
| Not handling missing channel gracefully | Assume data is valid | Log error, show message, don't throw - user can create channels |
| Coupling orchestrator to specific screens | Screens are known | Use Navigation module for all screen changes - keeps orchestrator clean |

---

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
