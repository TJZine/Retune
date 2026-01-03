# Module: Event Emitter

## Metadata

- **ID**: `event-emitter`
- **Path**: `src/utils/EventEmitter.ts`
- **Primary File**: `EventEmitter.ts`
- **Test File**: `EventEmitter.test.ts`
- **Dependencies**: none
- **Complexity**: low
- **Estimated LoC**: ~80

## Purpose

Provide a typed, generic event emitter utility for pub/sub communication between modules. This is the foundational building block used by all other modules for event-driven communication. It provides type-safe event handling with error isolation to prevent one handler's failure from crashing others.

## Public Interface

```typescript
/**
 * Type-safe event emitter with error isolation.
 * One handler's error does not prevent other handlers from executing.
 * 
 * @template TEventMap - A record type mapping event names to payload types
 */
export interface IEventEmitter<TEventMap extends Record<string, unknown>> {
  /**
   * Register an event handler
   * @returns A disposable to remove the handler
   */
  on<K extends keyof TEventMap>(
    event: K,
    handler: (payload: TEventMap[K]) => void
  ): IDisposable;

  /**
   * Unregister an event handler
   */
  off<K extends keyof TEventMap>(
    event: K,
    handler: (payload: TEventMap[K]) => void
  ): void;

  /**
   * Register a one-time event handler
   * @returns A disposable to remove the handler before it fires
   */
  once<K extends keyof TEventMap>(
    event: K,
    handler: (payload: TEventMap[K]) => void
  ): IDisposable;

  /**
   * Emit an event to all registered handlers
   */
  emit<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): void;

  /**
   * Remove all handlers for a specific event or all events
   */
  removeAllListeners(event?: keyof TEventMap): void;

  /**
   * Get the count of handlers for an event
   */
  listenerCount(event: keyof TEventMap): number;
}

/**
 * Disposable interface for cleanup
 */
export interface IDisposable {
  dispose(): void;
}
```

## Required Exports

```typescript
export { EventEmitter } from './EventEmitter';
export type { IEventEmitter, IDisposable } from './interfaces';
```

## Implementation Requirements

### MUST Implement

1. **Type-safe event registration** - Event names must be constrained to keys of TEventMap, and handler parameter types must match the event's payload type
2. **Error isolation** - Handler errors MUST be caught and logged, NOT propagated. Other handlers in the same event MUST still execute.
3. **Disposable pattern** - `on()` and `once()` must return an `IDisposable` for cleanup
4. **Listener management** - Support adding, removing, and clearing listeners
5. **Once semantics** - `once()` handlers fire exactly once then auto-remove

### MUST NOT (Negative Requirements)

1. **MUST NOT** allow handler errors to crash the application or prevent other handlers from executing
2. **MUST NOT** use any external dependencies (pure TypeScript only)
3. **MUST NOT** use ES2020+ syntax (no optional chaining `?.` or nullish coalescing `??`) - target ES2017 for Chromium 68 compatibility
4. **MUST NOT** implement async event handling (all handlers are synchronous)
5. **MUST NOT** implement event bubbling or capturing

### Performance Budgets

| Operation | Max Time | Max Memory | Notes |
|-----------|----------|------------|-------|
| `emit()` per handler | <1ms | - | Synchronous, no blocking |
| `on()` registration | <0.1ms | +negligible | Map/Set operations |

### State Management

- Internal state: `Map<keyof TEventMap, Set<(payload: unknown) => void>>`
- State persistence: none (memory only)
- State initialization: empty Map on construction

### Error Handling

- Expected errors: Handler throwing (any error type)
- Recovery strategy: catch + log + continue to next handler
- Error propagation: console.error only, never throw from emit()

## Reference Implementation

> [!NOTE]
> This reference implementation demonstrates the required patterns. Coding agents should use this as a guide.

```typescript
/**
 * Type-safe event emitter with error isolation.
 * One handler's error does not prevent other handlers from executing.
 * 
 * @template TEventMap - A record type mapping event names to payload types
 * 
 * @example
 * ```typescript
 * interface MyEvents {
 *   userLogin: { userId: string };
 *   userLogout: { userId: string; reason: string };
 * }
 * 
 * const emitter = new EventEmitter<MyEvents>();
 * emitter.on('userLogin', (payload) => console.log(payload.userId));
 * emitter.emit('userLogin', { userId: '123' });
 * ```
 */
export class EventEmitter<TEventMap extends Record<string, unknown>> 
  implements IEventEmitter<TEventMap> {
  
  private handlers: Map<keyof TEventMap, Set<(payload: unknown) => void>> = new Map();

  /**
   * Register an event handler
   * @returns A disposable to remove the handler
   */
  on<K extends keyof TEventMap>(
    event: K,
    handler: (payload: TEventMap[K]) => void
  ): IDisposable {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    const handlerSet = this.handlers.get(event);
    if (handlerSet) {
      handlerSet.add(handler as (payload: unknown) => void);
    }

    return {
      dispose: () => this.off(event, handler)
    };
  }

  /**
   * Unregister an event handler
   */
  off<K extends keyof TEventMap>(
    event: K,
    handler: (payload: TEventMap[K]) => void
  ): void {
    const handlerSet = this.handlers.get(event);
    if (handlerSet) {
      handlerSet.delete(handler as (payload: unknown) => void);
    }
  }

  /**
   * Register a one-time event handler
   */
  once<K extends keyof TEventMap>(
    event: K,
    handler: (payload: TEventMap[K]) => void
  ): IDisposable {
    const wrappedHandler = (payload: TEventMap[K]): void => {
      this.off(event, wrappedHandler);
      handler(payload);
    };
    return this.on(event, wrappedHandler);
  }

  /**
   * Emit an event to all registered handlers.
   * CRITICAL: Errors in handlers are caught and logged, NOT propagated.
   * This ensures one faulty handler doesn't crash the entire app.
   */
  emit<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): void {
    const eventHandlers = this.handlers.get(event);
    if (!eventHandlers) return;

    eventHandlers.forEach(handler => {
      try {
        handler(payload);
      } catch (error) {
        // Error isolation: log but don't propagate
        console.error(
          '[EventEmitter] Handler error for event \'' + String(event) + '\':',
          error
        );
      }
    });
  }

  /**
   * Remove all handlers for a specific event or all events
   */
  removeAllListeners(event?: keyof TEventMap): void {
    if (event !== undefined) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }

  /**
   * Get the count of handlers for an event
   */
  listenerCount(event: keyof TEventMap): number {
    const handlerSet = this.handlers.get(event);
    return handlerSet ? handlerSet.size : 0;
  }
}
```

## Events Emitted

None (this is the event infrastructure itself)

## Events Consumed

None (foundational module)

## Test Specification

### Unit Tests Required

```typescript
describe('EventEmitter', () => {
  describe('on/emit', () => {
    it('should call handler with correct payload type', () => {
      interface TestEvents { test: { value: number } }
      const emitter = new EventEmitter<TestEvents>();
      const handler = jest.fn();
      
      emitter.on('test', handler);
      emitter.emit('test', { value: 42 });
      
      expect(handler).toHaveBeenCalledWith({ value: 42 });
    });
    
    it('should call multiple handlers for same event', () => {
      const emitter = new EventEmitter<{ test: void }>();
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      emitter.on('test', handler1);
      emitter.on('test', handler2);
      emitter.emit('test', undefined);
      
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
    
    it('should return disposable that removes handler', () => {
      const emitter = new EventEmitter<{ test: void }>();
      const handler = jest.fn();
      
      const disposable = emitter.on('test', handler);
      disposable.dispose();
      emitter.emit('test', undefined);
      
      expect(handler).not.toHaveBeenCalled();
    });
  });
  
  describe('error isolation', () => {
    it('should continue calling handlers after one throws', () => {
      const emitter = new EventEmitter<{ test: void }>();
      const errorHandler = jest.fn(() => { throw new Error('Handler error'); });
      const successHandler = jest.fn();
      
      emitter.on('test', errorHandler);
      emitter.on('test', successHandler);
      
      // Should not throw
      expect(() => emitter.emit('test', undefined)).not.toThrow();
      
      // Both handlers should have been called
      expect(errorHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
    });
    
    it('should log errors to console.error', () => {
      const emitter = new EventEmitter<{ test: void }>();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      emitter.on('test', () => { throw new Error('Test error'); });
      emitter.emit('test', undefined);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Handler error'),
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });
  
  describe('once', () => {
    it('should only fire handler once', () => {
      const emitter = new EventEmitter<{ test: void }>();
      const handler = jest.fn();
      
      emitter.once('test', handler);
      emitter.emit('test', undefined);
      emitter.emit('test', undefined);
      
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('off', () => {
    it('should remove specific handler', () => {
      const emitter = new EventEmitter<{ test: void }>();
      const handler = jest.fn();
      
      emitter.on('test', handler);
      emitter.off('test', handler);
      emitter.emit('test', undefined);
      
      expect(handler).not.toHaveBeenCalled();
    });
  });
  
  describe('removeAllListeners', () => {
    it('should remove all handlers for specific event', () => {
      const emitter = new EventEmitter<{ a: void; b: void }>();
      const handlerA = jest.fn();
      const handlerB = jest.fn();
      
      emitter.on('a', handlerA);
      emitter.on('b', handlerB);
      emitter.removeAllListeners('a');
      
      emitter.emit('a', undefined);
      emitter.emit('b', undefined);
      
      expect(handlerA).not.toHaveBeenCalled();
      expect(handlerB).toHaveBeenCalled();
    });
    
    it('should remove all handlers when no event specified', () => {
      const emitter = new EventEmitter<{ a: void; b: void }>();
      emitter.on('a', jest.fn());
      emitter.on('b', jest.fn());
      
      emitter.removeAllListeners();
      
      expect(emitter.listenerCount('a')).toBe(0);
      expect(emitter.listenerCount('b')).toBe(0);
    });
  });
  
  describe('listenerCount', () => {
    it('should return correct count', () => {
      const emitter = new EventEmitter<{ test: void }>();
      
      expect(emitter.listenerCount('test')).toBe(0);
      
      emitter.on('test', () => {});
      expect(emitter.listenerCount('test')).toBe(1);
      
      emitter.on('test', () => {});
      expect(emitter.listenerCount('test')).toBe(2);
    });
  });
});
```

### Mock Requirements

When testing modules that depend on EventEmitter:

```typescript
const mockEmitter = {
  on: jest.fn(() => ({ dispose: jest.fn() })),
  off: jest.fn(),
  once: jest.fn(() => ({ dispose: jest.fn() })),
  emit: jest.fn(),
  removeAllListeners: jest.fn(),
  listenerCount: jest.fn(() => 0)
};
```

## File Structure

```text
src/utils/
├── EventEmitter.ts       # Main class implementation
├── interfaces.ts         # IEventEmitter, IDisposable
└── __tests__/
    └── EventEmitter.test.ts
```

## Implementation Checklist

- [ ] Create file structure
- [ ] Implement IEventEmitter interface
- [ ] Add error isolation in emit()
- [ ] Implement once() with auto-removal
- [ ] Write unit tests with mocked console
- [ ] Add JSDoc comments to all public methods
- [ ] Verify against acceptance criteria

## Common Pitfalls

> [!CAUTION]
> **AI implementers: Avoid these common mistakes**

| Pitfall | Why It Happens | Correct Approach |
| :--- | :--- | :--- |
| Using `?.` or `??` operators | Habit from modern TS | Use explicit null checks: `if (x !== undefined)` |
| Propagating handler errors | Forgetting try-catch in emit | Always wrap handler calls in try-catch |
| Not removing once handlers | Forgetting to call off() | Call off() before calling handler in wrapper |
| Using `this.handlers.get(event)!` | Non-null assertion | Check for undefined explicitly |

## Acceptance Criteria

This module is COMPLETE when:

1. [ ] All interface methods are implemented
2. [ ] Error isolation works (one handler error doesn't break others)
3. [ ] Type safety is enforced (event names/payloads typed)
4. [ ] All unit tests pass
5. [ ] No TypeScript compilation errors
6. [ ] No ES2020+ syntax used (Chromium 68 compatible)
