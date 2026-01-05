/**
 * @fileoverview Navigation module interfaces - re-exports from shared types.
 * @module modules/navigation/interfaces
 * @version 1.0.0
 */

// Re-export navigation interfaces from shared types
// These are defined in spec-pack/artifact-2-shared-types.ts
// and will be available in src/types once the types package is built.

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
    goBack(): boolean;
    replaceScreen(screen: Screen): void;
    getScreenParams(): Record<string, unknown>;

    // Focus Management
    setFocus(elementId: string): void;
    getFocusedElement(): FocusableElement | null;
    moveFocus(direction: 'up' | 'down' | 'left' | 'right'): boolean;

    // Registration
    registerFocusable(element: FocusableElement): void;
    unregisterFocusable(elementId: string): void;
    registerFocusGroup(group: FocusGroup): void;
    unregisterFocusGroup(groupId: string): void;

    // Modals
    openModal(modalId: string): void;
    closeModal(modalId?: string): void;
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
 */
export interface IFocusManager {
    focus(elementId: string): boolean;
    blur(): void;
    findNeighbor(fromId: string, direction: 'up' | 'down' | 'left' | 'right'): string | null;
    saveFocusState(screenId: string): void;
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
 * Navigation events
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
