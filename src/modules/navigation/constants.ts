/**
 * @fileoverview Navigation module constants - key codes and configuration.
 * @module modules/navigation/constants
 * @version 1.0.0
 */

import { RemoteButton, NavigationConfig } from './interfaces';

/**
 * webOS remote control key code mappings.
 * CRITICAL: webOS uses different key codes than standard web browsers.
 */
export const KEY_MAP: Map<number, RemoteButton> = new Map([
    // Navigation
    [13, 'ok'],
    [461, 'back'],  // webOS specific! Standard web uses 8 (Backspace)
    [8, 'back'],    // Backspace for desktop keyboards
    [27, 'back'],   // Escape for desktop keyboards
    [38, 'up'],
    [40, 'down'],
    [37, 'left'],
    [39, 'right'],

    // Playback
    [415, 'play'],
    [19, 'pause'],
    [413, 'stop'],
    [412, 'rewind'],
    [417, 'fastforward'],

    // Channel
    [33, 'channelUp'],
    [34, 'channelDown'],

    // Color buttons (per webOS specification: 403=red, 404=green, 405=yellow, 406=blue)
    [403, 'red'],
    [404, 'green'],
    [405, 'yellow'],
    [406, 'blue'],
    // Desktop keyboard fallbacks (use the same internal button identifiers)
    [112, 'red'],    // F1
    [113, 'green'],  // F2
    [114, 'yellow'], // F3
    [115, 'blue'],   // F4

    // Numbers 0-9 (48-57)
    [48, 'num0'],
    [49, 'num1'],
    [50, 'num2'],
    [51, 'num3'],
    [52, 'num4'],
    [53, 'num5'],
    [54, 'num6'],
    [55, 'num7'],
    [56, 'num8'],
    [57, 'num9'],

    // Info/Guide
    [457, 'info'],
    [458, 'guide'],
    [73, 'info'],   // I key for desktop keyboards
    [71, 'guide'],  // G key for desktop keyboards
]);

/**
 * Threshold for detecting long press (ms).
 */
export const LONG_PRESS_THRESHOLD_MS = 500;

/**
 * Debounce delay after long press fires to prevent repeat triggers (ms).
 */
export const LONG_PRESS_DEBOUNCE_MS = 100;

/**
 * Cursor hide delay for pointer mode (ms).
 */
export const CURSOR_HIDE_DELAY_MS = 3000;

/**
 * Channel number input configuration.
 */
export const CHANNEL_INPUT_CONFIG = {
    /** Time to wait for next digit (ms) */
    TIMEOUT_MS: 2000,
    /** Maximum digits to collect */
    MAX_DIGITS: 3,
} as const;

/**
 * Focus ring CSS class names.
 */
export const FOCUS_CLASSES = {
    /** Class added to focusable elements */
    FOCUSABLE: 'focusable',
    /** Class added to currently focused element */
    FOCUSED: 'focused',
    /** Class for pointer mode body */
    POINTER_MODE: 'pointer-mode',
} as const;

/**
 * Default navigation configuration.
 */
export const DEFAULT_NAVIGATION_CONFIG: NavigationConfig = {
    enablePointerMode: true,
    keyRepeatDelayMs: 500,
    keyRepeatIntervalMs: 100,
    focusMemoryEnabled: true,
    debugMode: false,
};

/**
 * Initial screen when app starts.
 */
export const INITIAL_SCREEN = 'splash' as const;
