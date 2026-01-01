# Module: Application Lifecycle & State Management

## Metadata

- **ID**: `app-lifecycle`
- **Path**: `src/modules/lifecycle/`
- **Primary File**: `AppLifecycle.ts`
- **Test File**: `AppLifecycle.test.ts`
- **Dependencies**: None (foundational module)
- **Complexity**: medium
- **Estimated LoC**: 400

## Purpose

Manages the webOS application lifecycle including initialization phases, visibility changes (background/foreground), state persistence to localStorage, network monitoring, memory management, and coordinated error recovery. This module ensures the application gracefully handles all platform lifecycle events.

## Public Interface

```typescript
/**
 * Application Lifecycle Interface
 * Manages app phases, persistence, and recovery
 */
export interface IAppLifecycle {
  // Initialization
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  
  // State Persistence
  saveState(): Promise<void>;
  restoreState(): Promise<PersistentState | null>;
  clearState(): Promise<void>;
  
  // Lifecycle Callbacks
  onPause(callback: () => void | Promise<void>): void;
  onResume(callback: () => void | Promise<void>): void;
  onTerminate(callback: () => void | Promise<void>): void;
  
  // Network
  isNetworkAvailable(): boolean;
  checkNetworkStatus(): Promise<boolean>;
  
  // Memory
  getMemoryUsage(): { used: number; limit: number; percentage: number };
  performMemoryCleanup(): void;
  
  // State
  getPhase(): AppPhase;
  getState(): AppLifecycleState;
  setPhase(phase: AppPhase): void;
  
  // Error Handling
  reportError(error: AppError): void;
  getLastError(): AppError | null;
  
  // Events
  on<K extends keyof LifecycleEventMap>(
    event: K,
    handler: (payload: LifecycleEventMap[K]) => void
  ): void;
}

/**
 * Error Recovery Interface
 */
export interface IErrorRecovery {
  handleError(error: AppError): ErrorAction[];
  executeRecovery(action: ErrorAction): Promise<boolean>;
  createError(code: AppErrorCode, message: string, context?: Record<string, unknown>): AppError;
}
```

## Required Exports

```typescript
// src/modules/lifecycle/index.ts
export { AppLifecycle } from './AppLifecycle';
export { ErrorRecovery } from './ErrorRecovery';
export { StateManager } from './StateManager';
export type { IAppLifecycle, IErrorRecovery } from './interfaces';
export type {
  AppPhase,
  ConnectionStatus,
  AppError,
  AppErrorCode,
  LifecycleAppError,
  AppLifecycleState,
  PersistentState,
  UserPreferences,
  ErrorAction
} from './types';
```

## Implementation Requirements

### MUST Implement

1. **webOS Visibility API Integration**

   ```typescript
   // Listen for visibility changes
   document.addEventListener('webOSRelaunch', (event) => {
     // App was relaunched while running
     this.handleResume();
   });
   
   document.addEventListener('visibilitychange', () => {
     if (document.hidden) {
       this.handlePause();
     } else {
       this.handleResume();
     }
   });
   ```

2. **State Persistence with Versioning**

   ```typescript
   interface PersistentState {
     version: number;  // For migrations
     plexAuth: PlexAuthData | null;
     channelConfigs: ChannelConfig[];
     currentChannelIndex: number;
     userPreferences: UserPreferences;
     lastUpdated: number;
   }
   ```

3. **Phase State Machine**

   ```text
   initializing → authenticating → loading_data → ready
                                                    ↓
               error ← ← ← ← ← ← ← ← ← ← ← ← ← ← ←
                 ↓
            (recovery actions)
   
   ready ↔ backgrounded (visibility changes)
   ready → terminating → (exit)
   ```

   **State Machine Diagram (Mermaid):**

   ```mermaid
   stateDiagram-v2
       [*] --> initializing
       initializing --> authenticating: No saved auth
       initializing --> loading_data: Has saved auth
       
       authenticating --> loading_data: Auth success
       authenticating --> error: Auth failed
       
       loading_data --> ready: Data loaded
       loading_data --> error: Load failed
       
       ready --> backgrounded: App hidden
       backgrounded --> ready: App visible
       ready --> terminating: Exit requested
       
       error --> authenticating: Retry auth
       error --> ready: Retry success
       error --> terminating: Exit
       
       terminating --> [*]
       
       note right of ready
           Normal operating state
           Playback active
       end note
       
       note right of backgrounded
           Video paused
           Timers stopped
           State saved
       end note
   ```

4. **Storage Migration Function**

   > [!IMPORTANT]
   > State version upgrades must be handled gracefully to prevent data loss.

   ```typescript
   interface MigrationConfig {
     currentVersion: number;
     migrations: Record<number, (state: any) => any>;
   }
   
   const STORAGE_CONFIG = {
     STATE_KEY: 'retune_app_state',
     STATE_VERSION: 2,  // Increment when schema changes
   };
   
   const MIGRATIONS: Record<number, (state: any) => any> = {
     // v1 → v2: Added userPreferences.theme
     1: (state) => ({
       ...state,
       version: 2,
       userPreferences: {
         ...state.userPreferences,
         theme: 'dark'  // New field with default
       }
     }),
     
     // v2 → v3: Renamed channelConfigs to channels
     2: (state) => ({
       ...state,
       version: 3,
       channels: state.channelConfigs,
       channelConfigs: undefined  // Remove old field
     })
   };
   
   /**
    * Migrate stored state to current version
    */
   function migrateState(state: any): PersistentState {
     if (!state || typeof state.version !== 'number') {
       // Invalid state, return null to trigger fresh start
       console.warn('[StateManager] Invalid state format, resetting');
       return null;
     }
     
     let currentState = state;
     const targetVersion = STORAGE_CONFIG.STATE_VERSION;
     
     while (currentState.version < targetVersion) {
       const migration = MIGRATIONS[currentState.version];
       
       if (!migration) {
         console.error(`[StateManager] Missing migration for version ${currentState.version}`);
         // Can't migrate, return null
         return null;
       }
       
       console.log(`[StateManager] Migrating v${currentState.version} → v${currentState.version + 1}`);
       currentState = migration(currentState);
     }
     
     return currentState as PersistentState;
   }
   ```

   **Migration Test Cases:**

   ```typescript
   describe('StateManager migrations', () => {
     it('should migrate v1 state to current version', () => {
       const v1State = { version: 1, plexAuth: {...}, channelConfigs: [] };
       const migrated = migrateState(v1State);
       expect(migrated.version).toBe(STORAGE_CONFIG.STATE_VERSION);
       expect(migrated.userPreferences.theme).toBeDefined();
     });
     
     it('should handle missing version gracefully', () => {
       const invalidState = { plexAuth: {...} }; // No version
       const result = migrateState(invalidState);
       expect(result).toBeNull();
     });
     
     it('should handle future version gracefully', () => {
       const futureState = { version: 999, ... };
       // Don't downgrade, but don't crash
       const result = migrateState(futureState);
       expect(result.version).toBe(999);
     });
   });
   ```

5. **Network Monitoring**
   - Check `navigator.onLine` property
   - Listen to `online`/`offline` events
   - Periodic connectivity test to Plex server

6. **Memory Monitoring**
   - Check `performance.memory` if available
   - Trigger cleanup when above threshold (80%)

### MUST NOT

1. Block on localStorage operations (use async wrappers)
2. Lose state on visibility changes
3. Allow phase transitions to invalid states
4. Swallow errors without logging/reporting

### State Management

```typescript
interface LifecycleInternalState {
  phase: AppPhase;
  isVisible: boolean;
  isNetworkAvailable: boolean;
  lastActiveTime: number;
  plexConnectionStatus: ConnectionStatus;
  currentError: AppError | null;
  pauseCallbacks: Array<() => void | Promise<void>>;
  resumeCallbacks: Array<() => void | Promise<void>>;
  terminateCallbacks: Array<() => void | Promise<void>>;
}
```

- **Persistence**: `PersistentState` to localStorage
- **Storage Key**: `retune_app_state`

### Error Handling

| Error Type | User Message | Actions |
| ---------- | ------------ | ------- |
| AUTH_EXPIRED | "Please sign in again" | [Sign In, Exit] |
| NETWORK_UNAVAILABLE | "No internet connection" | [Retry, Exit] |
| PLEX_UNREACHABLE | "Cannot connect to Plex server" | [Retry, Different Server, Exit] |
| DATA_CORRUPTION | "Settings were reset" | [OK] |
| PLAYBACK_FAILED | "Unable to play content" | [Skip, Retry, Exit] |
| OUT_OF_MEMORY | "App needs to restart" | [Restart] |

## Method Specifications

### `initialize(): Promise<void>`

**Purpose**: Start the application lifecycle and restore state.

**Side Effects**:

- Sets up visibility event listeners
- Sets up network event listeners
- Restores state from localStorage
- Sets phase to 'initializing' then 'authenticating' or 'ready'
- Emits `phaseChange` events

**Implementation Notes**:

```typescript
async initialize(): Promise<void> {
  this.setPhase('initializing');
  
  // Setup event listeners
  this.setupVisibilityListeners();
  this.setupNetworkListeners();
  
  // Restore state
  const savedState = await this.restoreState();
  
  if (savedState && savedState.plexAuth) {
    // Have credentials, try to resume
    this.setPhase('loading_data');
    this.emit('stateRestored', savedState);
  } else {
    // No credentials, need auth
    this.setPhase('authenticating');
  }
}
```

---

### `saveState(): Promise<void>`

**Purpose**: Persist current application state to localStorage.

**Side Effects**:

- writes `PersistentState` to localStorage
- Updates `lastUpdated` timestamp

**Implementation Notes**:

```typescript
async saveState(): Promise<void> {
  const state: PersistentState = {
    version: STORAGE_CONFIG.STATE_VERSION,
    plexAuth: this.getPlexAuthData(),
    channelConfigs: this.getChannelConfigs(),
    currentChannelIndex: this.getCurrentChannelIndex(),
    userPreferences: this.getUserPreferences(),
    lastUpdated: Date.now()
  };
  
  try {
    localStorage.setItem(
      STORAGE_CONFIG.STATE_KEY,
      JSON.stringify(state)
    );
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      this.performStorageCleanup();
      // Retry once
      localStorage.setItem(
        STORAGE_CONFIG.STATE_KEY,
        JSON.stringify(state)
      );
    }
  }
}
```

---

### `onPause(callback): void`

**Purpose**: Register callback for app backgrounding.

**Parameters**:

| Name | Type | Required | Description |
| ---- | ---- | -------- | ----------- |
| callback | `() => void \| Promise<void>` | Yes | Function to call on pause |

**Usage**:

```typescript
appLifecycle.onPause(() => {
  videoPlayer.pause();
  scheduler.stopSyncTimer();
});
```

---

### `reportError(error: AppError): void`

**Purpose**: Report an error for display and recovery.

**Parameters**:

| Name | Type | Required | Description |
| ---- | ---- | -------- | ----------- |
| error | AppError | Yes | Error to report |

**Side Effects**:

- Stores error in state
- Sets phase to 'error' if not already
- Emits `error` event

## Internal Architecture

### Class Diagram

```mermaid
┌─────────────────────────────────┐
│        AppLifecycle             │
├─────────────────────────────────┤
│ - state: LifecycleInternalState │
│ - stateManager: StateManager    │
│ - errorRecovery: ErrorRecovery  │
│ - eventEmitter: EventEmitter    │
│ - networkCheckInterval: number  │
├─────────────────────────────────┤
│ + initialize(): Promise         │
│ + shutdown(): Promise           │
│ + saveState(): Promise          │
│ + restoreState(): Promise       │
│ + clearState(): Promise         │
│ + onPause(callback): void       │
│ + onResume(callback): void      │
│ + onTerminate(callback): void   │
│ + isNetworkAvailable(): boolean │
│ + getMemoryUsage(): MemInfo     │
│ + performMemoryCleanup(): void  │
│ + getPhase(): AppPhase          │
│ + setPhase(phase): void         │
│ + reportError(error): void      │
│ + on(event, handler): void      │
│ - _handlePause(): Promise       │
│ - _handleResume(): Promise      │
│ - _setupVisibilityListeners()   │
│ - _setupNetworkListeners()      │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│        StateManager             │
├─────────────────────────────────┤
│ - storageKey: string            │
│ - currentVersion: number        │
├─────────────────────────────────┤
│ + save(state): Promise          │
│ + load(): Promise<State|null>   │
│ + clear(): Promise              │
│ + migrate(state): State         │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│       ErrorRecovery             │
├─────────────────────────────────┤
│ + handleError(error): Action[]  │
│ + executeRecovery(): Promise    │
│ + createError(): AppError       │
│ - _getActionsForType(): Action[]│
└─────────────────────────────────┘
```

## Events Emitted

| Event Name | Payload Type | When Emitted |
| ---------- | ------------ | ------------ |
| `phaseChange` | `{ from, to }` | Phase transition |
| `visibilityChange` | `{ isVisible }` | App background/foreground |
| `networkChange` | `{ isAvailable }` | Connectivity changes |
| `plexConnectionChange` | `{ status }` | Server connection changes |
| `error` | `AppError` | Error reported |
| `stateRestored` | `PersistentState` | State loaded from storage |
| `beforeTerminate` | `void` | App about to exit |

## Test Specification

### Unit Tests Required

```typescript
describe('AppLifecycle', () => {
  describe('initialization', () => {
    it('should set phase to initializing then authenticating when no saved state', async () => {
      // Mock localStorage.getItem to return null
    });
    
    it('should restore state and set phase to loading_data when state exists', async () => {
      // Mock localStorage with valid state
    });
    
    it('should emit stateRestored event with saved state', async () => {
      // Verify event emission
    });
  });
  
  describe('persistence', () => {
    it('should save state to localStorage', async () => {
      // Verify localStorage.setItem called with correct data
    });
    
    it('should handle quota exceeded by cleaning up', async () => {
      // Mock QuotaExceededError
    });
    
    it('should include version number in saved state', async () => {
      // Verify version field present
    });
  });
  
  describe('visibility', () => {
    it('should call pause callbacks when hidden', async () => {
      const callback = jest.fn();
      lifecycle.onPause(callback);
      dispatchVisibilityChange(true);
      expect(callback).toHaveBeenCalled();
    });
    
    it('should call resume callbacks when visible', async () => {
      const callback = jest.fn();
      lifecycle.onResume(callback);
      dispatchVisibilityChange(false);
      expect(callback).toHaveBeenCalled();
    });
    
    it('should emit visibilityChange event', () => {
      // Verify event emitted with correct payload
    });
  });
  
  describe('error handling', () => {
    it('should store reported error', () => {
      const error = createTestError('NETWORK_UNAVAILABLE');
      lifecycle.reportError(error);
      expect(lifecycle.getLastError()).toEqual(error);
    });
    
    it('should set phase to error on reportError', () => {
      lifecycle.reportError(createTestError('AUTH_EXPIRED'));
      expect(lifecycle.getPhase()).toBe('error');
    });
  });
  
  describe('network monitoring', () => {
    it('should detect online status', () => {
      Object.defineProperty(navigator, 'onLine', { value: true });
      expect(lifecycle.isNetworkAvailable()).toBe(true);
    });
    
    it('should emit networkChange on connectivity change', () => {
      // Dispatch online/offline events
    });
  });
});
```

## File Structure

```text
src/modules/lifecycle/
├── index.ts              # Public exports
├── AppLifecycle.ts       # Main class
├── StateManager.ts       # Persistence handling
├── ErrorRecovery.ts      # Error recovery strategies
├── interfaces.ts         # IAppLifecycle, IErrorRecovery
├── types.ts              # AppPhase, AppError, etc.
├── constants.ts          # Storage keys, thresholds
└── __tests__/
    ├── AppLifecycle.test.ts
    ├── StateManager.test.ts
    └── ErrorRecovery.test.ts
```

## Implementation Checklist

- [ ] Create file structure
- [ ] Implement visibility event listeners
- [ ] Implement network event listeners
- [ ] Implement state persistence with versioning
- [ ] Implement phase state machine
- [ ] Implement lifecycle callbacks (pause/resume/terminate)
- [ ] Implement error reporting and recovery
- [ ] Implement memory monitoring
- [ ] Write unit tests
- [ ] Add JSDoc comments
- [ ] Verify against acceptance criteria

## Common Pitfalls

> [!CAUTION]
> **AI implementers: Avoid these common mistakes**

| Pitfall | Why It Happens | Correct Approach |
| :--- | :--- | :--- |
| Synchronous localStorage operations | Seems simpler | Wrap in try/catch, handle quota exceeded - can block UI thread |
| Missing visibility listener cleanup | Works in dev | Remove listeners in destroy() - prevents memory leaks |
| Invalid phase transitions | Logic error | Validate against state machine - throw on illegal transitions |
| Swallowing errors | App "works" | Always log via reportError() - silent failures are debugging nightmares |
| Not versioning stored state | Works initially | Add version field - enables migrations without data loss |
| Blocking on pause callbacks | Want complete save | Set timeout on callbacks (5s max) - don't hang on backgrounding |
| Assuming navigator.onLine is accurate | It's a boolean | Do periodic actual network tests - onLine can be stale |
| Not handling webOSRelaunch | Only test cold start | Handle relaunch event - app may be relaunched while running |
| Ignoring memory API availability | Works in modern browsers | Check `performance.memory` exists - not available in all webOS versions |
| Saving state on every change | Comprehensive | Debounce saves (500ms) - too frequent writes hit quota and are slow |

---

## Acceptance Criteria

This module is COMPLETE when:

1. [ ] State persists correctly across app restarts
2. [ ] Visibility changes trigger appropriate callbacks
3. [ ] Network status is monitored and events emitted
4. [ ] Phase transitions follow valid state machine
5. [ ] Errors display with appropriate recovery options
6. [ ] All lifecycle callbacks execute before transitions
7. [ ] All unit tests pass
8. [ ] No TypeScript compilation errors
