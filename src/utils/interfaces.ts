/**
 * @fileoverview Interface definitions for the EventEmitter utility.
 * @module utils/interfaces
 * @version 1.0.0
 */

/**
 * Disposable interface for cleanup.
 * Used to unsubscribe from event handlers.
 */
export interface IDisposable {
    /**
     * Dispose of the resource, cleaning up any subscriptions or references.
     */
    dispose(): void;
}

/**
 * Type-safe event emitter interface with error isolation.
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
 * const emitter: IEventEmitter<MyEvents> = new EventEmitter();
 * emitter.on('userLogin', (payload) => console.log(payload.userId));
 * emitter.emit('userLogin', { userId: '123' });
 * ```
 */
export interface IEventEmitter<TEventMap extends Record<string, unknown>> {
    /**
     * Register an event handler.
     * @param event - The event name to listen for
     * @param handler - The callback function to invoke when the event is emitted
     * @returns A disposable to remove the handler
     */
    on<K extends keyof TEventMap>(
        event: K,
        handler: (payload: TEventMap[K]) => void
    ): IDisposable;

    /**
     * Unregister an event handler.
     * @param event - The event name
     * @param handler - The handler function to remove
     */
    off<K extends keyof TEventMap>(
        event: K,
        handler: (payload: TEventMap[K]) => void
    ): void;

    /**
     * Register a one-time event handler.
     * The handler will be automatically removed after it fires once.
     * @param event - The event name to listen for
     * @param handler - The callback function to invoke when the event is emitted
     * @returns A disposable to remove the handler before it fires
     */
    once<K extends keyof TEventMap>(
        event: K,
        handler: (payload: TEventMap[K]) => void
    ): IDisposable;

    /**
     * Emit an event to all registered handlers.
     * Errors in handlers are caught and logged, NOT propagated.
     * This ensures one faulty handler doesn't crash the entire application.
     * @param event - The event name to emit
     * @param payload - The payload to pass to handlers
     */
    emit<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): void;

    /**
     * Remove all handlers for a specific event or all events.
     * @param event - Optional event name. If omitted, removes all handlers for all events.
     */
    removeAllListeners(event?: keyof TEventMap): void;

    /**
     * Get the count of handlers for an event.
     * @param event - The event name
     * @returns The number of registered handlers for the event
     */
    listenerCount(event: keyof TEventMap): number;
}
