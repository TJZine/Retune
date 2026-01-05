/**
 * @fileoverview Navigation Manager - coordinates screen navigation, focus management,
 * and remote control input for webOS TV application.
 * @module modules/navigation/NavigationManager
 * @version 1.0.0
 */

/* eslint-disable no-console -- Debug logging is gated by config.debugMode */

import { EventEmitter } from '../../utils/EventEmitter';
import { IDisposable } from '../../utils/interfaces';
import {
    INavigationManager,
    NavigationConfig,
    NavigationState,
    NavigationEventMap,
    Screen,
    FocusableElement,
    FocusGroup,
    RemoteButton,
    KeyEvent,
} from './interfaces';
import { FocusManager } from './FocusManager';
import { RemoteHandler } from './RemoteHandler';
import {
    DEFAULT_NAVIGATION_CONFIG,
    INITIAL_SCREEN,
    FOCUS_CLASSES,
    CURSOR_HIDE_DELAY_MS,
} from './constants';

/**
 * Channel number input state.
 */
interface ChannelNumberInput {
    digits: string;
    timeoutMs: number;
    maxDigits: number;
    timer: number | null;
}

/**
 * Internal state for NavigationManager.
 */
interface NavigationInternalState {
    config: NavigationConfig;
    currentScreen: Screen;
    screenStack: Screen[];
    screenParams: Map<Screen, Record<string, unknown>>;
    modalStack: string[];
    modalFocusableIds: Map<string, string[]>;
    isPointerActive: boolean;
    isInputBlocked: boolean;
}

/**
 * NavigationManager coordinates screen navigation, focus management,
 * and remote control input for the Retune webOS application.
 *
 * @implements INavigationManager
 *
 * @example
 * ```typescript
 * const nav = new NavigationManager();
 * nav.initialize({ enablePointerMode: true, ... });
 * nav.registerFocusable({ id: 'btn1', element: el, neighbors: {} });
 * nav.setFocus('btn1');
 * nav.goTo('settings');
 * ```
 */
export class NavigationManager
    extends EventEmitter<NavigationEventMap>
    implements INavigationManager {
    private _state: NavigationInternalState;
    private _focusManager: FocusManager;
    private _remoteHandler: RemoteHandler;
    private _pointerHideTimer: number | null = null;
    private _keyEventDisposable: IDisposable | null = null;
    private _isInitialized: boolean = false;
    private _clickHandlers: Map<string, () => void> = new Map();
    private _channelInput: ChannelNumberInput = {
        digits: '',
        timeoutMs: 2000,
        maxDigits: 3,
        timer: null,
    };

    constructor() {
        super();
        this._focusManager = new FocusManager();
        this._remoteHandler = new RemoteHandler();
        this._state = {
            config: DEFAULT_NAVIGATION_CONFIG,
            currentScreen: INITIAL_SCREEN,
            screenStack: [],
            screenParams: new Map(),
            modalStack: [],
            modalFocusableIds: new Map(),
            isPointerActive: false,
            isInputBlocked: false,
        };
    }

    /**
     * Initialize the navigation manager with configuration.
     * @param config - Navigation configuration
     */
    public initialize(config: NavigationConfig): void {
        if (this._isInitialized) {
            return;
        }

        this._state.config = { ...DEFAULT_NAVIGATION_CONFIG, ...config };

        // Initialize remote handler
        this._remoteHandler.initialize(this._state.config.debugMode);

        // Subscribe to remote events
        this._keyEventDisposable = this._remoteHandler.on('keyDown', (keyEvent) => {
            this._handleKeyEvent(keyEvent);
        });

        // Set up pointer mode if enabled
        if (this._state.config.enablePointerMode) {
            this._initializePointerMode();
        }

        this._isInitialized = true;

        if (this._state.config.debugMode) {
            console.debug('[NavigationManager] Initialized', this._state.config);
        }
    }

    /**
     * Destroy the navigation manager, cleaning up all resources.
     */
    public destroy(): void {
        if (!this._isInitialized) {
            return;
        }

        // Clean up pointer mode
        if (this._pointerHideTimer !== null) {
            window.clearTimeout(this._pointerHideTimer);
            this._pointerHideTimer = null;
        }

        // Clean up channel input timer
        if (this._channelInput.timer !== null) {
            window.clearTimeout(this._channelInput.timer);
            this._channelInput.timer = null;
        }
        this._channelInput.digits = '';

        // Remove pointer mode listeners
        document.removeEventListener('mousemove', this._handlePointerMove);
        document.removeEventListener('click', this._handlePointerClick);

        // Clean up remote handler subscription
        if (this._keyEventDisposable) {
            this._keyEventDisposable.dispose();
            this._keyEventDisposable = null;
        }

        // Clear click handlers map
        this._clickHandlers.clear();

        this._remoteHandler.destroy();
        this._focusManager.clear();
        this.removeAllListeners();

        this._isInitialized = false;

        if (this._state.config.debugMode) {
            console.debug('[NavigationManager] Destroyed');
        }
    }

    // ==========================================
    // Screen Navigation
    // ==========================================

    /**
     * Navigate to a screen, pushing the current screen to history.
     * @param screen - Target screen
     * @param params - Optional parameters for the screen
     */
    public goTo(screen: Screen, params?: Record<string, unknown>): void {
        if (this._state.isInputBlocked) {
            return;
        }

        const from = this._state.currentScreen;

        // Save focus state for current screen
        if (this._state.config.focusMemoryEnabled) {
            this._focusManager.saveFocusState(from);
        }

        // Push current screen to stack
        this._state.screenStack.push(from);

        // Set new screen
        this._state.currentScreen = screen;
        if (params !== undefined) {
            this._state.screenParams.set(screen, params);
        }

        // Emit screen change event
        this.emit('screenChange', { from, to: screen });

        // Restore or set initial focus
        if (this._state.config.focusMemoryEnabled) {
            if (!this._focusManager.restoreFocusState(screen)) {
                // No saved focus, will need to set initial focus
                // This is handled by the screen component
            }
        }

        if (this._state.config.debugMode) {
            console.debug('[NavigationManager] goTo:', from, '->', screen);
        }
    }

    /**
     * Navigate back to the previous screen.
     * @returns true if navigation occurred, false if at root
     */
    public goBack(): boolean {
        if (this._state.isInputBlocked) {
            return false;
        }

        // If modal is open, close it first
        if (this._state.modalStack.length > 0) {
            this.closeModal();
            return true;
        }

        // Check if we have history
        if (this._state.screenStack.length === 0) {
            // At root, cannot go back
            return false;
        }

        const from = this._state.currentScreen;
        const previousScreen = this._state.screenStack.pop();

        if (previousScreen === undefined) {
            return false;
        }

        // Save focus state for current screen
        if (this._state.config.focusMemoryEnabled) {
            this._focusManager.saveFocusState(from);
        }

        // Navigate to previous screen
        this._state.currentScreen = previousScreen;

        // Emit screen change event
        this.emit('screenChange', { from, to: previousScreen });

        // Restore focus for previous screen
        if (this._state.config.focusMemoryEnabled) {
            this._focusManager.restoreFocusState(previousScreen);
        }

        if (this._state.config.debugMode) {
            console.debug('[NavigationManager] goBack:', from, '->', previousScreen);
        }

        return true;
    }

    /**
     * Replace the current screen without pushing to history.
     * @param screen - The screen to navigate to
     */
    public replaceScreen(screen: Screen): void {
        if (this._state.isInputBlocked) {
            return;
        }

        const from = this._state.currentScreen;
        this._state.currentScreen = screen;

        this.emit('screenChange', { from, to: screen });

        if (this._state.config.debugMode) {
            console.debug('[NavigationManager] replaceScreen:', from, '->', screen);
        }
    }

    /**
     * Get parameters for the current screen.
     * @returns The screen parameters or empty object
     */
    public getScreenParams(): Record<string, unknown> {
        const params = this._state.screenParams.get(this._state.currentScreen);
        return params !== undefined ? params : {};
    }

    /**
     * Get the current screen.
     * @returns The current screen
     */
    public getCurrentScreen(): Screen {
        return this._state.currentScreen;
    }

    // ==========================================
    // Focus Management
    // ==========================================

    /**
     * Set focus to an element by ID.
     * @param elementId - The element ID to focus
     */
    public setFocus(elementId: string): void {
        const previousId = this._focusManager.getCurrentFocusId();
        const success = this._focusManager.focus(elementId);

        if (success && previousId !== elementId) {
            this.emit('focusChange', { from: previousId, to: elementId });
        }
    }

    /**
     * Get the currently focused element.
     * @returns The focused element or null
     */
    public getFocusedElement(): FocusableElement | null {
        return this._focusManager.getFocusedElement();
    }

    /**
     * Move focus in the specified direction.
     * @param direction - The direction to move
     * @returns true if focus moved, false if at boundary
     */
    public moveFocus(direction: 'up' | 'down' | 'left' | 'right'): boolean {
        if (this._state.isInputBlocked) {
            return false;
        }

        const currentId = this._focusManager.getCurrentFocusId();
        if (!currentId) {
            return false;
        }

        const neighborId = this._focusManager.findNeighbor(currentId, direction);
        if (!neighborId) {
            return false;
        }

        // Enforce modal focus trap: only allow navigation within modal scope
        if (this._state.modalStack.length > 0) {
            const topModalId = this._state.modalStack[this._state.modalStack.length - 1];
            if (topModalId !== undefined) {
                const modalFocusables = this._state.modalFocusableIds.get(topModalId);
                // If modal has registered focusables, enforce trap within those elements
                if (modalFocusables && modalFocusables.length > 0) {
                    const isNeighborInModal = modalFocusables.indexOf(neighborId) !== -1;
                    if (!isNeighborInModal) {
                        // Block navigation outside modal
                        return false;
                    }
                } else {
                    // Modal has no registered focusables - block ALL directional navigation
                    // per spec: "MUST NOT allow navigation outside modal when open"
                    return false;
                }
            }
        }

        this.setFocus(neighborId);
        return true;
    }

    /**
     * Register a focusable element.
     * @param element - The focusable element to register
     */
    public registerFocusable(element: FocusableElement): void {
        this._focusManager.registerFocusable(element);

        // Create and store click handler for cleanup
        const clickHandler = (): void => {
            this.setFocus(element.id);
            if (element.onSelect) {
                element.onSelect();
            }
        };
        this._clickHandlers.set(element.id, clickHandler);
        element.element.addEventListener('click', clickHandler);
    }

    /**
     * Unregister a focusable element.
     * @param elementId - The element ID to unregister
     */
    public unregisterFocusable(elementId: string): void {
        // Remove stored click handler
        const handler = this._clickHandlers.get(elementId);
        if (handler) {
            const element = this._focusManager.getElement(elementId);
            if (element) {
                element.element.removeEventListener('click', handler);
            }
            this._clickHandlers.delete(elementId);
        }
        this._focusManager.unregisterFocusable(elementId);
    }

    /**
     * Register a focus group.
     * @param group - The focus group to register
     */
    public registerFocusGroup(group: FocusGroup): void {
        this._focusManager.registerFocusGroup(group);
    }

    /**
     * Unregister a focus group.
     * @param groupId - The group ID to unregister
     */
    public unregisterFocusGroup(groupId: string): void {
        this._focusManager.unregisterFocusGroup(groupId);
    }

    // ==========================================
    // Modal Handling
    // ==========================================

    /**
     * Open a modal by ID.
     * @param modalId - The modal ID to open
     * @param focusableIds - Optional list of focusable element IDs within this modal
     */
    public openModal(modalId: string, focusableIds?: string[]): void {
        if (this._state.isInputBlocked) {
            return;
        }

        // Save pre-modal focus
        this._focusManager.savePreModalFocus();

        // Push modal to stack
        this._state.modalStack.push(modalId);

        // Register modal focusables for focus trap
        if (focusableIds && focusableIds.length > 0) {
            this._state.modalFocusableIds.set(modalId, focusableIds);
        }

        this.emit('modalOpen', { modalId });

        if (this._state.config.debugMode) {
            console.debug('[NavigationManager] openModal:', modalId);
        }
    }

    /**
     * Close a modal. If modalId is provided, closes that specific modal.
     * Otherwise closes the top modal.
     * @param modalId - Optional specific modal ID to close
     */
    public closeModal(modalId?: string): void {
        if (this._state.modalStack.length === 0) {
            return;
        }

        let closedModalId: string;

        if (modalId !== undefined) {
            // Close specific modal
            const index = this._state.modalStack.indexOf(modalId);
            if (index === -1) {
                return;
            }
            this._state.modalStack.splice(index, 1);
            this._state.modalFocusableIds.delete(modalId);
            closedModalId = modalId;
        } else {
            // Close top modal
            const topModal = this._state.modalStack.pop();
            if (topModal === undefined) {
                return;
            }
            this._state.modalFocusableIds.delete(topModal);
            closedModalId = topModal;
        }

        this.emit('modalClose', { modalId: closedModalId });

        // Restore focus if no more modals
        if (this._state.modalStack.length === 0) {
            this._focusManager.restorePreModalFocus();
        }

        if (this._state.config.debugMode) {
            console.debug('[NavigationManager] closeModal:', closedModalId);
        }
    }

    /**
     * Check if a modal is open.
     * @param modalId - Optional specific modal ID to check
     * @returns true if the modal (or any modal) is open
     */
    public isModalOpen(modalId?: string): boolean {
        if (modalId !== undefined) {
            return this._state.modalStack.indexOf(modalId) !== -1;
        }
        return this._state.modalStack.length > 0;
    }

    // ==========================================
    // Input Blocking
    // ==========================================

    /**
     * Block all input during transitions.
     */
    public blockInput(): void {
        this._state.isInputBlocked = true;

        if (this._state.config.debugMode) {
            console.debug('[NavigationManager] Input blocked');
        }
    }

    /**
     * Unblock input.
     */
    public unblockInput(): void {
        this._state.isInputBlocked = false;

        if (this._state.config.debugMode) {
            console.debug('[NavigationManager] Input unblocked');
        }
    }

    /**
     * Check if input is blocked.
     * @returns true if input is blocked
     */
    public isInputBlocked(): boolean {
        return this._state.isInputBlocked;
    }

    // ==========================================
    // State
    // ==========================================

    /**
     * Get the current navigation state.
     * @returns The navigation state
     */
    public getState(): NavigationState {
        return {
            currentScreen: this._state.currentScreen,
            screenStack: [...this._state.screenStack],
            focusedElementId: this._focusManager.getCurrentFocusId(),
            modalStack: [...this._state.modalStack],
            isPointerActive: this._state.isPointerActive,
        };
    }

    // ==========================================
    // Long Press Handling
    // ==========================================

    /**
     * Register a long press handler for a button.
     * @param button - The button to watch
     * @param callback - The callback to invoke
     */
    public handleLongPress(button: RemoteButton, callback: () => void): void {
        this._remoteHandler.registerLongPress(button, callback);
    }

    /**
     * Cancel all pending long press handlers.
     */
    public cancelLongPress(): void {
        this._remoteHandler.cancelLongPress();
    }

    // ==========================================
    // Private Methods
    // ==========================================

    /**
     * Handle key events from remote handler.
     */
    private _handleKeyEvent(keyEvent: KeyEvent): void {
        if (this._state.isInputBlocked) {
            return;
        }

        // Emit keyPress event
        this.emit('keyPress', keyEvent);

        // Handle navigation keys
        switch (keyEvent.button) {
            case 'up':
            case 'down':
            case 'left':
            case 'right':
                if (!keyEvent.isRepeat) {
                    this.moveFocus(keyEvent.button);
                }
                break;

            case 'ok':
                this._handleOkButton();
                break;

            case 'back':
                this._handleBackButton();
                break;

            case 'num0':
            case 'num1':
            case 'num2':
            case 'num3':
            case 'num4':
            case 'num5':
            case 'num6':
            case 'num7':
            case 'num8':
            case 'num9':
                this._handleNumberKey(keyEvent.button);
                break;

            default:
                // Other buttons are handled by event listeners
                break;
        }
    }

    /**
     * Handle number key press for channel input.
     * @param button - The number button pressed (num0-num9)
     */
    private _handleNumberKey(button: RemoteButton): void {
        // Extract digit from button name (e.g., 'num5' -> '5')
        const digit = button.replace('num', '');

        // Clear existing timeout
        if (this._channelInput.timer !== null) {
            window.clearTimeout(this._channelInput.timer);
        }

        // Append digit
        this._channelInput.digits += digit;

        // Show overlay with current digits
        this.emit('channelInputUpdate', {
            digits: this._channelInput.digits,
            isComplete: false,
        });

        // If max digits reached, commit immediately
        if (this._channelInput.digits.length >= this._channelInput.maxDigits) {
            this._commitChannelNumber();
            return;
        }

        // Set timeout to commit after delay
        this._channelInput.timer = window.setTimeout(() => {
            this._commitChannelNumber();
        }, this._channelInput.timeoutMs);
    }

    /**
     * Commit the channel number and emit event.
     */
    private _commitChannelNumber(): void {
        const channelNumber = parseInt(this._channelInput.digits, 10);

        // Reset input state
        this._channelInput.digits = '';
        if (this._channelInput.timer !== null) {
            window.clearTimeout(this._channelInput.timer);
        }
        this._channelInput.timer = null;

        // Emit events for orchestrator to handle
        this.emit('channelNumberEntered', { channelNumber });
        this.emit('channelInputUpdate', { digits: '', isComplete: true });
    }

    /**
     * Handle OK button press.
     */
    private _handleOkButton(): void {
        const focused = this._focusManager.getFocusedElement();
        if (focused && focused.onSelect) {
            focused.onSelect();
        }
    }

    /**
     * Handle Back button press with root screen behavior.
     */
    private _handleBackButton(): void {
        // Close modal if open
        if (this._state.modalStack.length > 0) {
            this.closeModal();
            return;
        }

        // If we have history, navigate back normally
        if (this._state.screenStack.length > 0) {
            this.goBack();
            return;
        }

        // Root screen Back behavior per spec
        // Using replaceScreen() to maintain standard navigation flow (input-block checks)
        // without pushing to history, which is appropriate for root back transitions.
        const screen = this._state.currentScreen;
        switch (screen) {
            case 'player':
            case 'auth':
                // Show exit confirmation modal
                this.openModal('exit-confirm');
                break;
            case 'server-select':
                // Navigate back to auth
                this.replaceScreen('auth');
                break;
            case 'settings':
            case 'channel-edit':
                // Navigate to player
                this.replaceScreen('player');
                break;
            default:
                // No action for other root screens
                break;
        }
    }

    /**
     * Initialize pointer mode for Magic Remote.
     */
    private _initializePointerMode(): void {
        document.addEventListener('mousemove', this._handlePointerMove);
        document.addEventListener('click', this._handlePointerClick);
    }

    /**
     * Handle pointer movement.
     */
    private _handlePointerMove = (): void => {
        if (!this._state.isPointerActive) {
            this._state.isPointerActive = true;
            document.body.classList.add(FOCUS_CLASSES.POINTER_MODE);
            this.emit('pointerModeChange', { active: true });
        }

        // Reset hide timer
        if (this._pointerHideTimer !== null) {
            window.clearTimeout(this._pointerHideTimer);
        }

        this._pointerHideTimer = window.setTimeout(() => {
            this._state.isPointerActive = false;
            document.body.classList.remove(FOCUS_CLASSES.POINTER_MODE);
            this.emit('pointerModeChange', { active: false });
            this._pointerHideTimer = null;
        }, CURSOR_HIDE_DELAY_MS);
    };

    /**
     * Handle pointer click.
     */
    private _handlePointerClick = (event: MouseEvent): void => {
        const target = event.target as HTMLElement;
        const focusable = target.closest('.' + FOCUS_CLASSES.FOCUSABLE) as HTMLElement;

        if (focusable && focusable.id) {
            this.setFocus(focusable.id);
            const element = this._focusManager.getFocusedElement();
            if (element && element.onSelect) {
                element.onSelect();
            }
        }
    };
}
