/**
 * @fileoverview Navigation module public exports.
 * @module modules/navigation
 * @version 1.0.0
 */

// Main classes
export { NavigationManager } from './NavigationManager';
export { FocusManager } from './FocusManager';
export { RemoteHandler } from './RemoteHandler';

// Interfaces
export type {
    INavigationManager,
    IFocusManager,
    NavigationConfig,
    NavigationState,
    NavigationEventMap,
    FocusableElement,
    FocusGroup,
    RemoteButton,
    KeyEvent,
    Screen,
} from './interfaces';

// Constants
export {
    KEY_MAP,
    LONG_PRESS_THRESHOLD_MS,
    LONG_PRESS_DEBOUNCE_MS,
    CURSOR_HIDE_DELAY_MS,
    CHANNEL_INPUT_CONFIG,
    FOCUS_CLASSES,
    DEFAULT_NAVIGATION_CONFIG,
    INITIAL_SCREEN,
} from './constants';
