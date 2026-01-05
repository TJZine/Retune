/**
 * @fileoverview Remote handler for processing LG remote control key events.
 * @module modules/navigation/RemoteHandler
 * @version 1.0.0
 */

/* eslint-disable no-console -- Debug logging is gated by config.debugMode */

import { EventEmitter } from '../../utils/EventEmitter';
import { RemoteButton, KeyEvent } from './interfaces';
import { KEY_MAP, LONG_PRESS_THRESHOLD_MS } from './constants';

/**
 * Event map for RemoteHandler internal events.
 */
interface RemoteHandlerEventMap {
    [key: string]: unknown;
    keyDown: KeyEvent;
    keyUp: { button: RemoteButton; wasLongPress: boolean };
    longPress: { button: RemoteButton };
}

/**
 * Long press handler registration.
 */
interface LongPressHandler {
    button: RemoteButton;
    callback: () => void;
}

/**
 * Handles raw keyboard events from webOS remote control.
 * Maps key codes to RemoteButton, detects long press, and emits events.
 */
export class RemoteHandler extends EventEmitter<RemoteHandlerEventMap> {
    private _keyDownTimes: Map<number, number> = new Map();
    private _longPressTimers: Map<number, number> = new Map();
    private _longPressHandlers: LongPressHandler[] = [];
    private _isLongPressFired: Map<number, boolean> = new Map();
    private _isEnabled: boolean = false;
    private _debugMode: boolean = false;

    // Bound handlers for cleanup
    private _boundKeyDownHandler: (event: KeyboardEvent) => void;
    private _boundKeyUpHandler: (event: KeyboardEvent) => void;

    constructor() {
        super();
        this._boundKeyDownHandler = this._handleKeyDown.bind(this);
        this._boundKeyUpHandler = this._handleKeyUp.bind(this);
    }

    /**
     * Initialize the remote handler.
     * @param debugMode - Whether to log key events to console
     */
    public initialize(debugMode: boolean = false): void {
        if (this._isEnabled) {
            return;
        }

        this._debugMode = debugMode;
        document.addEventListener('keydown', this._boundKeyDownHandler);
        document.addEventListener('keyup', this._boundKeyUpHandler);
        this._isEnabled = true;

        if (this._debugMode) {
            console.debug('[RemoteHandler] Initialized');
        }
    }

    /**
     * Destroy the remote handler, removing all event listeners.
     */
    public destroy(): void {
        if (!this._isEnabled) {
            return;
        }

        document.removeEventListener('keydown', this._boundKeyDownHandler);
        document.removeEventListener('keyup', this._boundKeyUpHandler);

        // Clear all timers
        this._longPressTimers.forEach((timerId) => {
            window.clearTimeout(timerId);
        });
        this._longPressTimers.clear();
        this._keyDownTimes.clear();
        this._isLongPressFired.clear();
        this._longPressHandlers = [];
        this._isEnabled = false;

        if (this._debugMode) {
            console.debug('[RemoteHandler] Destroyed');
        }
    }

    /**
     * Map a key code to a RemoteButton.
     * @param keyCode - The keyboard event keyCode
     * @returns The mapped button or null if not mapped
     */
    public mapKeyCode(keyCode: number): RemoteButton | null {
        const button = KEY_MAP.get(keyCode);
        return button !== undefined ? button : null;
    }

    /**
     * Register a long press handler for a specific button.
     * @param button - The button to watch for long press
     * @param callback - The callback to invoke on long press
     */
    public registerLongPress(button: RemoteButton, callback: () => void): void {
        this._longPressHandlers.push({ button, callback });
    }

    /**
     * Cancel all pending long press handlers.
     */
    public cancelLongPress(): void {
        this._longPressTimers.forEach((timerId) => {
            window.clearTimeout(timerId);
        });
        this._longPressTimers.clear();
        this._isLongPressFired.clear();
    }

    /**
     * Handle keydown events.
     */
    private _handleKeyDown(event: KeyboardEvent): void {
        const keyCode = event.keyCode;
        const button = this.mapKeyCode(keyCode);

        if (!button) {
            return; // Unmapped key, ignore
        }

        const now = Date.now();
        const isRepeat = this._keyDownTimes.has(keyCode);

        // Track key down time for long press
        if (!isRepeat) {
            this._keyDownTimes.set(keyCode, now);
            this._isLongPressFired.set(keyCode, false);

            // Set up long press timer
            const timerId = window.setTimeout(() => {
                this._handleLongPressTimeout(keyCode, button);
            }, LONG_PRESS_THRESHOLD_MS);

            this._longPressTimers.set(keyCode, timerId);
        }

        // Create key event
        const keyEvent: KeyEvent = {
            button,
            isRepeat,
            isLongPress: false,
            timestamp: now,
            originalEvent: event,
        };

        if (this._debugMode) {
            console.debug('[RemoteHandler] keyDown:', button, { isRepeat });
        }

        this.emit('keyDown', keyEvent);
    }

    /**
     * Handle keyup events.
     */
    private _handleKeyUp(event: KeyboardEvent): void {
        const keyCode = event.keyCode;
        const button = this.mapKeyCode(keyCode);

        if (!button) {
            return;
        }

        // Cancel long press timer
        const timerId = this._longPressTimers.get(keyCode);
        if (timerId !== undefined) {
            window.clearTimeout(timerId);
            this._longPressTimers.delete(keyCode);
        }

        // Check if long press was fired
        const wasLongPress = this._isLongPressFired.get(keyCode) === true;

        // Clean up tracking
        this._keyDownTimes.delete(keyCode);
        this._isLongPressFired.delete(keyCode);

        if (this._debugMode) {
            console.debug('[RemoteHandler] keyUp:', button, { wasLongPress });
        }

        this.emit('keyUp', { button, wasLongPress });
    }

    /**
     * Handle long press timeout.
     */
    private _handleLongPressTimeout(keyCode: number, button: RemoteButton): void {
        this._isLongPressFired.set(keyCode, true);
        this._longPressTimers.delete(keyCode);

        if (this._debugMode) {
            console.debug('[RemoteHandler] longPress:', button);
        }

        // Find and invoke matching handlers
        this._longPressHandlers.forEach((handler) => {
            if (handler.button === button) {
                handler.callback();
            }
        });

        this.emit('longPress', { button });
        // Note: Debounce is handled by _isLongPressFired flag which prevents
        // re-triggering until keyup clears it.
    }
}
