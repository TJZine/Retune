# Integration Test Scenarios

Detailed integration test scenarios for cross-module functionality.

---

## 1. Authentication Flow

### Scenario: Complete PIN-based Login

```typescript
describe('Integration: Authentication Flow', () => {
  it('should complete full PIN-based login', async () => {
    // Setup
    const orchestrator = new Orchestrator();
    await orchestrator.initialize({ containerId: 'app' });
    
    // 1. Verify auth screen is shown
    expect(navigation.getCurrentScreen()).toBe('auth');
    
    // 2. Request PIN
    const pinRequest = await plexAuth.requestPin();
    expect(pinRequest.code).toHaveLength(4);
    
    // 3. Simulate PIN entry on plex.tv (mock)
    mockPlexTvPinClaim(pinRequest.id, 'valid-token');
    
    // 4. Wait for PIN to be claimed
    await waitFor(() => plexAuth.isAuthenticated());
    
    // 5. Verify navigation to server select
    expect(navigation.getCurrentScreen()).toBe('server-select');
    
    // 6. Verify credentials stored
    const stored = await plexAuth.getStoredCredentials();
    expect(stored).not.toBeNull();
    if (!stored) throw new Error('Expected stored credentials');
    expect(stored.token.token).toBe('valid-token');
  });
  
  it('should handle token expiry during playback', async () => {
    // Setup with authenticated state
    await orchestrator.initializeWithAuth();
    await orchestrator.switchToChannel('channel-1');
    expect(videoPlayer.isPlaying()).toBe(true);
    
    // Simulate token expiry
    mockPlexApi.rejectNextRequest(401);
    
    // Trigger a network request
    await channelManager.refreshContent();
    
    // Verify handling
    expect(videoPlayer.isPlaying()).toBe(false);
    expect(navigation.getCurrentScreen()).toBe('auth');
    expect(await plexAuth.getStoredCredentials()).toBeNull();
  });
});
```

---

## 2. Channel Switching Flow

### Scenario: Complete Channel Switch

```typescript
describe('Integration: Channel Switch Flow', () => {
  it('should complete channel switch within 3 seconds', async () => {
    // Setup
    await orchestrator.initializeWithPlayback();
    const startTime = performance.now();
    
    // 1. Trigger channel switch
    await channelManager.switchToChannel('channel-2');
    
    // 2. Wait for playback to start
    await waitFor(() => videoPlayer.isPlaying());
    
    const elapsed = performance.now() - startTime;
    
    // 3. Verify timing
    expect(elapsed).toBeLessThan(3000);
    
    // 4. Verify correct content
    const currentProgram = scheduler.getCurrentProgram();
    expect(currentProgram.item.channelId).toBe('channel-2');
    
    // 5. Verify player position matches schedule
    const playerPosition = videoPlayer.getCurrentTimeMs();
    const expectedPosition = currentProgram.elapsedMs;
    expect(Math.abs(playerPosition - expectedPosition)).toBeLessThan(1000);
  });
  
  it('should handle channel switch during buffering', async () => {
    await orchestrator.initializeWithPlayback();
    
    // Force buffering state
    videoPlayer._setState('buffering');
    
    // Switch channel (should not wait for buffer)
    await channelManager.switchToChannel('channel-2');
    
    // Old stream should be stopped
    expect(videoPlayer.getState().status).not.toBe('buffering');
    
    // New channel should be loading
    await waitFor(() => scheduler.getState().channelId === 'channel-2');
  });
});
```

---

## 3. EPG Navigation Flow

### Scenario: Navigate EPG and Select Program

```typescript
describe('Integration: EPG Navigation', () => {
  it('should navigate EPG and switch to selected channel', async () => {
    await orchestrator.initializeWithPlayback();
    
    // 1. Open EPG with Guide button
    navigation._simulateKeyPress('guide');
    await waitFor(() => epg.isVisible());
    
    // 2. Navigate to channel 3
    navigation._simulateKeyPress('down');
    navigation._simulateKeyPress('down');
    
    const focused = epg.getFocusedProgram();
    expect(focused).not.toBeNull();
    if (!focused) throw new Error('Expected focused program');
    expect(focused.channelIndex).toBe(2); // 0-indexed
    
    // 3. Navigate to future program
    navigation._simulateKeyPress('right');
    navigation._simulateKeyPress('right');
    
    // 4. Verify info panel updated
    const infoPanel = document.querySelector('.epg-info-panel');
    expect(infoPanel).not.toBeNull();
    expect((infoPanel as HTMLElement).textContent).toContain(focused.program.item.title);
    
    // 5. Select channel
    navigation._simulateKeyPress('ok');
    
    // 6. Verify EPG closed and channel switched
    await waitFor(() => !epg.isVisible());
    const current = channelManager.getCurrentChannel();
    expect(current).not.toBeNull();
    if (!current) throw new Error('Expected current channel');
    expect(current.id).toBe('channel-3');
  });
  
  it('should handle navigation at grid boundaries', async () => {
    await orchestrator.initializeWithPlayback();
    navigation._simulateKeyPress('guide');
    await waitFor(() => epg.isVisible());
    
    // Navigate to top of grid
    epg.focusProgram(0, 0);
    
    // Try to move up (should fail gracefully)
    const moved = epg.handleNavigation('up');
    expect(moved).toBe(false);
    
    // Focus should remain on first row
    const focused = epg.getFocusedProgram();
    expect(focused).not.toBeNull();
    if (!focused) throw new Error('Expected focused program');
    expect(focused.channelIndex).toBe(0);
  });
  
  it('should maintain focus during scroll', async () => {
    await orchestrator.initializeWithPlayback();
    navigation._simulateKeyPress('guide');
    await waitFor(() => epg.isVisible());
    
    // Focus a program
    epg.focusProgram(2, 1);
    const focused = epg.getFocusedProgram();
    expect(focused).not.toBeNull();
    if (!focused) throw new Error('Expected focused program');
    const focusedProgram = focused.program;
    
    // Scroll grid (navigating down past visible channels)
    for (let i = 0; i < 5; i++) {
      navigation._simulateKeyPress('down');
    }
    
    // Verify focus moved to new position (not lost)
    expect(epg.getFocusedProgram()).not.toBeNull();
    const focused = epg.getFocusedProgram();
    expect(focused).not.toBeNull();
    if (!focused) throw new Error('Expected focused program');
    expect(focused.channelIndex).toBe(7); // 2 + 5
  });
  
  it('should handle focus when scrolled off-screen and back', async () => {
    await orchestrator.initializeWithPlayback();
    navigation._simulateKeyPress('guide');
    await waitFor(() => epg.isVisible());
    
    // Focus a program near top
    epg.focusProgram(1, 0);
    const focused = epg.getFocusedProgram();
    expect(focused).not.toBeNull();
    if (!focused) throw new Error('Expected focused program');
    const initialProgram = focused.program;
    
    // Scroll down far enough that original row is recycled
    for (let i = 0; i < 10; i++) {
      navigation._simulateKeyPress('down');
    }
    
    // Now scroll back up
    for (let i = 0; i < 10; i++) {
      navigation._simulateKeyPress('up');
    }
    
    // Focus should return to original position
    const focused = epg.getFocusedProgram();
    expect(focused).not.toBeNull();
    if (!focused) throw new Error('Expected focused program');
    expect(focused.channelIndex).toBe(1);
  });
});
```

---

## 4. Playback Error Recovery

### Scenario: Recover from Network Errors

```typescript
describe('Integration: Playback Error Recovery', () => {
  it('should retry on network error and resume playback', async () => {
    await orchestrator.initializeWithPlayback();
    const program = scheduler.getCurrentProgram();
    const positionBefore = videoPlayer.getCurrentTimeMs();
    
    // Simulate network error
    mockNetwork.disconnect();
    videoPlayer._emitError({
      code: 'NETWORK_ERROR',
      retryable: true,
    });
    
    // Wait for retry
    await sleep(1000);
    
    // Reconnect network
    mockNetwork.connect();
    
    // Wait for playback to resume
    await waitFor(() => videoPlayer.isPlaying(), { timeout: 5000 });
    
    // Verify same program continuing
    expect(scheduler.getCurrentProgram().item.ratingKey)
      .toBe(program.item.ratingKey);
  });
  
  it('should skip to next program on unrecoverable error', async () => {
    await orchestrator.initializeWithPlayback();
    const currentProgram = scheduler.getCurrentProgram();
    
    // Emit unrecoverable error
    videoPlayer._emitError({
      code: 'PLAYBACK_DECODE_ERROR',
      retryable: false,
    });
    
    // Wait for skip
    await waitFor(() => {
      const newProgram = scheduler.getCurrentProgram();
      return newProgram.item.ratingKey !== currentProgram.item.ratingKey;
    });
    
    // Verify moved to next program
    expect(videoPlayer.isPlaying()).toBe(true);
  });
});
```

---

## 5. Lifecycle Management

### Scenario: Background/Foreground Transitions

```typescript
describe('Integration: App Lifecycle', () => {
  it('should pause and resume on visibility change', async () => {
    await orchestrator.initializeWithPlayback();
    const positionBefore = videoPlayer.getCurrentTimeMs();
    
    // Simulate app going to background
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { value: true });
    
    await appLifecycle._handleVisibilityChange();
    
    // Verify paused
    expect(videoPlayer.isPlaying()).toBe(false);
    
    // Simulate 30 seconds in background
    jest.advanceTimersByTime(30000);
    
    // Bring back to foreground
    Object.defineProperty(document, 'hidden', { value: false });
    await appLifecycle._handleVisibilityChange();
    
    // Verify resync and resume
    expect(videoPlayer.isPlaying()).toBe(true);
    
    // Verify position matches wall clock (synced)
    const expectedPosition = scheduler.getCurrentProgram().elapsedMs;
    const actualPosition = videoPlayer.getCurrentTimeMs();
    expect(Math.abs(actualPosition - expectedPosition)).toBeLessThan(2000);
  });
  
  it('should save state before visibility change', async () => {
    await orchestrator.initializeWithPlayback();
    
    // Trigger background
    await appLifecycle.handleBackground();
    
    // Verify state saved
    const savedState = JSON.parse(localStorage.getItem('retune_state') || '{}');
    const current = channelManager.getCurrentChannel();
    expect(current).not.toBeNull();
    if (!current) throw new Error('Expected current channel');
    expect(savedState.channelId).toBe(current.id);
    expect(savedState.position).toBeGreaterThan(0);
  });
});
```

---

## 6. Memory Pressure

### Scenario: Handle Memory Warnings

```typescript
describe('Integration: Memory Management', () => {
  it('should clear caches on memory warning', async () => {
    await orchestrator.initializeWithPlayback();
    
    // Load all channel schedules into memory
    for (const channel of channelManager.getChannels()) {
      await scheduler.loadChannelPreview(channel.id);
    }
    
    // Verify memory used
    const memoryBefore = performance.memory ? performance.memory.usedJSHeapSize : 0;
    
    // Emit memory warning
    appLifecycle._emitMemoryWarning({ level: 'warning' });
    
    // Verify cache cleared
    expect(scheduler._previewCache.size).toBe(0);
    
    // Verify memory reduced (if available)
    if (performance.memory) {
      await sleep(100); // Allow GC
      const memoryAfter = performance.memory.usedJSHeapSize;
      expect(memoryAfter).toBeLessThan(memoryBefore);
    }
  });
});
```

---

## 7. Number Input Channel Switch

### Scenario: Enter Channel Number with Remote

```typescript
describe('Integration: Number Input Channel Switch', () => {
  it('should switch to channel entered via number keys', async () => {
    await orchestrator.initializeWithPlayback();
    
    // Enter "12" for channel 12
    navigation._simulateKeyPress('num1');
    
    // Verify overlay shown
    await waitFor(() => {
      const overlay = document.querySelector('.channel-input-overlay');
      return !!overlay && overlay.textContent === '1';
    });
    
    navigation._simulateKeyPress('num2');
    
    // Verify overlay updated
    await waitFor(() => {
      const overlay = document.querySelector('.channel-input-overlay');
      return !!overlay && overlay.textContent === '12';
    });
    
    // Wait for timeout commit
    await sleep(2100);
    
    // Verify channel switched
    const current = channelManager.getCurrentChannel();
    expect(current).not.toBeNull();
    if (!current) throw new Error('Expected current channel');
    expect(current.number).toBe(12);
  });
  
  it('should switch immediately on 3rd digit', async () => {
    await orchestrator.initializeWithPlayback();
    
    // Enter "123" (3 digits)
    navigation._simulateKeyPress('num1');
    navigation._simulateKeyPress('num2');
    navigation._simulateKeyPress('num3');
    
    // Should switch immediately without timeout
    await sleep(100);
    const current = channelManager.getCurrentChannel();
    expect(current).not.toBeNull();
    if (!current) throw new Error('Expected current channel');
    expect(current.number).toBe(123);
  });
});
```

---

## Test Utilities

```typescript
// Helper functions for integration tests

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const timeout = options.timeout !== undefined ? options.timeout : 5000;
  const interval = options.interval !== undefined ? options.interval : 100;
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    if (await predicate()) return;
    await sleep(interval);
  }
  
  throw new Error(`waitFor timed out after ${timeout}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const mockNetwork = {
  disconnect: () => { /* mock implementation */ },
  connect: () => { /* mock implementation */ },
};

const mockPlexTvPinClaim = (pinId: number, token: string) => {
  // Mock the plex.tv PIN claim response
};
```
