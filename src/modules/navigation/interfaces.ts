/**
 * @fileoverview Navigation module interfaces - re-exports from shared types.
 * @module modules/navigation/interfaces
 * @version 1.0.0
 */

// Navigation module interfaces - local definitions matching the shared type surface.
// These mirror the contracts in spec-pack/artifact-2-shared-types.ts.

/**
 * Navigation Manager Interface
 * Handles remote control input and focus management
 */
export interface INavigationManager {
    // Initialization
    initialize(config: NavigationConfig): void;
    destroy(): void;

    // Screen Navigation
    goTo(screen: Screen, params?: Record<string, unknown>): void;
    /**
     * Navigate back to the previous screen.
     * @returns true if navigation occurred, false if already at root screen
     */
    goBack(): boolean;
    replaceScreen(screen: Screen): void;
    getScreenParams(): Record<string, unknown>;

    // Focus Management
    setFocus(elementId: string): void;
    getFocusedElement(): FocusableElement | null;
    /**
     * Move focus in the specified direction.
     * @returns true if focus moved, false if no neighbor found or movement blocked
     */
    moveFocus(direction: Direction): boolean;

    // Registration
    registerFocusable(element: FocusableElement): void;
    unregisterFocusable(elementId: string): void;
    registerFocusGroup(group: FocusGroup): void;
    unregisterFocusGroup(groupId: string): void;

    // Modals
    openModal(modalId: string, focusableIds?: string[]): void;
    /**
     * Close a modal.
     * @param modalId - ID of modal to close, or omit to close the topmost modal
     */
    closeModal(modalId?: string): void;
    /**
     * Check if a modal is open.
     * @param modalId - ID of modal to check, or omit to check if any modal is open
     * @returns true if the specified modal (or any modal) is open
     */
    isModalOpen(modalId?: string): boolean;

    // Input Blocking
    blockInput(): void;
    unblockInput(): void;
    isInputBlocked(): boolean;

    // State
    getCurrentScreen(): Screen;
    getState(): NavigationState;

    // Events
    on<K extends keyof NavigationEventMap>(
        event: K,
        handler: (payload: NavigationEventMap[K]) => void
    ): void;
    off<K extends keyof NavigationEventMap>(
        event: K,
        handler: (payload: NavigationEventMap[K]) => void
    ): void;

    // Long-press handling
    handleLongPress(button: RemoteButton, callback: () => void): void;
    cancelLongPress(): void;
}

/**
 * Focus Manager Interface (internal)
 * Manages focus state, focus ring display, and focus navigation within groups.
 */
export interface IFocusManager {
    /**
     * Set focus on an element.
     * @returns true if focus was set successfully, false if element not found
     */
    focus(elementId: string): boolean;
    blur(): void;
    getElement(elementId: string): FocusableElement | null;
    findNeighbor(fromId: string, direction: Direction): string | null;
    saveFocusState(screenId: string): void;
    /**
     * Restore saved focus state for a screen.
     * @returns true if focus was restored, false if no saved state exists
     */
    restoreFocusState(screenId: string): boolean;
    updateFocusRing(elementId: string): void;
    hideFocusRing(): void;
}

/**
 * Remote control button identifiers
 */
export type RemoteButton =
    | 'ok' | 'back'
    | 'up' | 'down' | 'left' | 'right'
    | 'play' | 'pause' | 'stop'
    | 'rewind' | 'fastforward'
    | 'channelUp' | 'channelDown'
    | 'red' | 'green' | 'yellow' | 'blue'
    | 'num0' | 'num1' | 'num2' | 'num3' | 'num4'
    | 'num5' | 'num6' | 'num7' | 'num8' | 'num9'
    | 'info' | 'guide';

/**
 * Navigation direction for focus movement
 */
export type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * Processed key event
 */
export interface KeyEvent {
    /** Mapped button */
    button: RemoteButton;
    /** Is this a repeat event */
    isRepeat: boolean;
    /** Is this a long press */
    isLongPress: boolean;
    /** Event timestamp */
    timestamp: number;
    /** Original DOM event */
    originalEvent: KeyboardEvent;
}

/**
 * Application screens
 */
export type Screen =
    | 'splash'
    | 'auth'
    | 'server-select'
    | 'audio-setup'
    | 'channel-setup'
    | 'home'
    | 'player'
    | 'guide'
    | 'channel-edit'
    | 'settings'
    | 'error';

/**
 * Navigation manager configuration
 */
export interface NavigationConfig {
    /** Enable Magic Remote pointer mode */
    enablePointerMode: boolean;
    /** Key repeat initial delay (ms) */
    keyRepeatDelayMs: number;
    /** Key repeat interval (ms) */
    keyRepeatIntervalMs: number;
    /** Remember focus per screen */
    focusMemoryEnabled: boolean;
    /** Log key events to console */
    debugMode: boolean;
}

/**
 * Current navigation state
 */
export interface NavigationState {
    /** Active screen */
    currentScreen: Screen;
    /** Screen history for back navigation */
    screenStack: Screen[];
    /** Currently focused element ID */
    focusedElementId: string | null;
    /** Stack of open modals */
    modalStack: string[];
    /** Is Magic Remote pointer active */
    isPointerActive: boolean;
}

/**
 * A focusable UI element
 */
export interface FocusableElement {
    /** Unique element ID */
    id: string;
    /** DOM element reference */
    element: HTMLElement;
    /** Focus group membership */
    group?: string;
    /** Explicit neighbor mappings */
    neighbors: {
        up?: string;
        down?: string;
        left?: string;
        right?: string;
    };
    /** Called when element receives focus */
    onFocus?: () => void;
    /** Called when element loses focus */
    onBlur?: () => void;
    /** Called when element is selected (OK pressed) */
    onSelect?: () => void;
}

/**
 * A group of focusable elements
 */
export interface FocusGroup {
    /** Group ID */
    id: string;
    /** Member element IDs */
    elements: string[];
    /** Wrap around at edges */
    wrapAround: boolean;
    /** Layout orientation */
    orientation: 'horizontal' | 'vertical' | 'grid';
    /** Column count for grid layout */
    columns?: number;
}

/**
 * Navigation events.
 * NOTE: The index signature is required for EventEmitter<T> generic constraint.
 * EventEmitter expects T extends Record<string, unknown>.
 */
export interface NavigationEventMap {
    [key: string]: unknown;
    keyPress: KeyEvent;
    screenChange: { from: Screen; to: Screen };
    focusChange: { from: string | null; to: string };
    modalOpen: { modalId: string };
    modalClose: { modalId: string };
    pointerModeChange: { active: boolean };
    channelInputUpdate: { digits: string; isComplete: boolean };
    channelNumberEntered: { channelNumber: number };
}
