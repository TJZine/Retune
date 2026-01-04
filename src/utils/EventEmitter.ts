/**
 * @fileoverview Type-safe event emitter with error isolation.
 * One handler's error does not prevent other handlers from executing.
 * @module utils/EventEmitter
 * @version 1.0.0
 */

import { IEventEmitter, IDisposable } from './interfaces';

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
    /**
     * Internal storage for event handlers.
     * Maps event names to sets of handler functions.
     */
    private _handlers: Map<keyof TEventMap, Set<(payload: unknown) => void>> =
        new Map();

    /**
     * Register an event handler.
     * @param event - The event name to listen for
     * @param handler - The callback function to invoke when the event is emitted
     * @returns A disposable to remove the handler
     */
    public on<K extends keyof TEventMap>(
        event: K,
        handler: (payload: TEventMap[K]) => void
    ): IDisposable {
        if (!this._handlers.has(event)) {
            this._handlers.set(event, new Set());
        }
        const handlerSet = this._handlers.get(event);
        if (handlerSet) {
            handlerSet.add(handler as (payload: unknown) => void);
        }

        return {
            dispose: (): void => this.off(event, handler),
        };
    }

    /**
     * Unregister an event handler.
     * @param event - The event name
     * @param handler - The handler function to remove
     */
    public off<K extends keyof TEventMap>(
        event: K,
        handler: (payload: TEventMap[K]) => void
    ): void {
        const handlerSet = this._handlers.get(event);
        if (handlerSet) {
            handlerSet.delete(handler as (payload: unknown) => void);
        }
    }

    /**
     * Register a one-time event handler.
     * The handler will be automatically removed after it fires once.
     * @param event - The event name to listen for
     * @param handler - The callback function to invoke when the event is emitted
     * @returns A disposable to remove the handler before it fires
     */
    public once<K extends keyof TEventMap>(
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
     * @param event - The event name to emit
     * @param payload - The payload to pass to handlers
     */
    public emit<K extends keyof TEventMap>(
        event: K,
        payload: TEventMap[K]
    ): void {
        const eventHandlers = this._handlers.get(event);
        if (!eventHandlers) {
            return;
        }

        eventHandlers.forEach((handler) => {
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
     * Remove all handlers for a specific event or all events.
     * @param event - Optional event name. If omitted, removes all handlers for all events.
     */
    public removeAllListeners(event?: keyof TEventMap): void {
        if (event !== undefined) {
            this._handlers.delete(event);
        } else {
            this._handlers.clear();
        }
    }

    /**
     * Get the count of handlers for an event.
     * @param event - The event name
     * @returns The number of registered handlers for the event
     */
    public listenerCount(event: keyof TEventMap): number {
        const handlerSet = this._handlers.get(event);
        if (handlerSet) {
            return handlerSet.size;
        }
        return 0;
    }
}
