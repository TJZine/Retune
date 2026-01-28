/**
 * @jest-environment jsdom
 */

/**
 * @fileoverview Unit tests for NavigationManager.
 * @module modules/navigation/__tests__/NavigationManager.test
 */

import { NavigationManager } from '../index';
import { NavigationConfig } from '../interfaces';

// Mock elements
function createMockElement(id: string): HTMLElement {
    const el = document.createElement('button');
    el.id = id;
    document.body.appendChild(el);
    return el;
}

// Helper to dispatch key events
function dispatchKeyEvent(keyCode: number, type: 'keydown' | 'keyup' = 'keydown'): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = new KeyboardEvent(type, { keyCode } as any);
    document.dispatchEvent(event);
}

describe('NavigationManager', () => {
    let nav: NavigationManager;
    let config: NavigationConfig;
    let elements: HTMLElement[] = [];

    beforeEach(() => {
        // Clean up DOM
        elements.forEach((el) => {
            if (el.parentNode) {
                el.parentNode.removeChild(el);
            }
        });
        elements = [];

        nav = new NavigationManager();
        config = {
            enablePointerMode: false,
            keyRepeatDelayMs: 500,
            keyRepeatIntervalMs: 100,
            focusMemoryEnabled: true,
            debugMode: false,
        };
        nav.initialize(config);
    });

    afterEach(() => {
        nav.destroy();
        elements.forEach((el) => {
            if (el.parentNode) {
                el.parentNode.removeChild(el);
            }
        });
        elements = [];
    });

    describe('screen navigation', () => {
        it('should push to stack on goTo', () => {
            // Initial screen is 'splash'
            const initialScreen = nav.getCurrentScreen();
            expect(initialScreen).toBe('splash');

            nav.goTo('settings');

            expect(nav.getCurrentScreen()).toBe('settings');
            expect(nav.getState().screenStack).toContain('splash');
        });

        it('should pop stack on goBack', () => {
            nav.goTo('settings');
            expect(nav.getCurrentScreen()).toBe('settings');

            const returned = nav.goBack();

            expect(returned).toBe(true);
            expect(nav.getCurrentScreen()).toBe('splash');
        });

        it('should not push on replaceScreen', () => {
            const stackLengthBefore = nav.getState().screenStack.length;

            nav.replaceScreen('settings');

            expect(nav.getState().screenStack.length).toBe(stackLengthBefore);
            expect(nav.getCurrentScreen()).toBe('settings');
        });

        it('should return false on goBack at root', () => {
            // At initial screen with empty stack
            expect(nav.goBack()).toBe(false);
            expect(nav.getCurrentScreen()).toBe('splash');
        });

        it('should emit screenChange event on goTo', () => {
            const handler = jest.fn();
            nav.on('screenChange', handler);

            nav.goTo('settings');

            expect(handler).toHaveBeenCalledWith({
                from: 'splash',
                to: 'settings',
            });
        });

        it('should emit screenChange event on goBack', () => {
            nav.goTo('settings');

            const handler = jest.fn();
            nav.on('screenChange', handler);

            nav.goBack();

            expect(handler).toHaveBeenCalledWith({
                from: 'settings',
                to: 'splash',
            });
        });

        it('should store and retrieve screen params', () => {
            nav.goTo('player', { channelId: 'ch-123' });

            expect(nav.getScreenParams()).toEqual({ channelId: 'ch-123' });
        });
    });

    describe('focus management', () => {
        it('should set focus on registered element', () => {
            const el = createMockElement('btn1');
            elements.push(el);

            nav.registerFocusable({ id: 'btn1', element: el, neighbors: {} });
            nav.setFocus('btn1');

            const focused = nav.getFocusedElement();
            expect(focused).not.toBeNull();
            if (focused) {
                expect(focused.id).toBe('btn1');
            }
            expect(el.classList.contains('focused')).toBe(true);
        });

        it('repairs focus desync on focusin when browser focus is on body', () => {
            const el = createMockElement('btn1');
            elements.push(el);

            nav.registerFocusable({ id: 'btn1', element: el, neighbors: {} });

            // Access internals for deterministic testing of the sentinel behavior.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const focusManager = (nav as any)._focusManager as { focus: (id: string) => boolean };
            const focusSpy = jest.spyOn(focusManager, 'focus');

            nav.setFocus('btn1');
            focusSpy.mockClear();

            const activeElementSpy = jest.spyOn(document, 'activeElement', 'get')
                .mockReturnValue(document.body);
            try {
                document.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
                expect(focusSpy).toHaveBeenCalledWith('btn1');
            } finally {
                activeElementSpy.mockRestore();
            }
        });

        it('should not set focus on unregistered element', () => {
            nav.setFocus('unknown');

            expect(nav.getFocusedElement()).toBeNull();
        });

        it('should move focus using explicit neighbors', () => {
            const el1 = createMockElement('btn1');
            const el2 = createMockElement('btn2');
            elements.push(el1, el2);

            nav.registerFocusable({
                id: 'btn1',
                element: el1,
                neighbors: { right: 'btn2' },
            });
            nav.registerFocusable({
                id: 'btn2',
                element: el2,
                neighbors: { left: 'btn1' },
            });
            nav.setFocus('btn1');

            const moved = nav.moveFocus('right');

            expect(moved).toBe(true);
            const focused = nav.getFocusedElement();
            expect(focused).not.toBeNull();
            if (focused) {
                expect(focused.id).toBe('btn2');
            }
        });

        it('should return false when no neighbor in direction', () => {
            const el = createMockElement('btn1');
            elements.push(el);

            nav.registerFocusable({
                id: 'btn1',
                element: el,
                neighbors: { right: 'btn2' },
            });
            nav.setFocus('btn1');

            expect(nav.moveFocus('left')).toBe(false);

            const focused = nav.getFocusedElement();
            expect(focused).not.toBeNull();
            if (focused) {
                expect(focused.id).toBe('btn1');
            }
        });

        it('should call onFocus/onBlur callbacks', () => {
            const onFocus = jest.fn();
            const onBlur = jest.fn();
            const el1 = createMockElement('btn1');
            const el2 = createMockElement('btn2');
            elements.push(el1, el2);

            nav.registerFocusable({
                id: 'btn1',
                element: el1,
                onFocus,
                onBlur,
                neighbors: {},
            });
            nav.registerFocusable({
                id: 'btn2',
                element: el2,
                neighbors: {},
            });

            nav.setFocus('btn1');
            expect(onFocus).toHaveBeenCalled();

            nav.setFocus('btn2');
            expect(onBlur).toHaveBeenCalled();
        });

        it('should emit focusChange event', () => {
            const handler = jest.fn();
            const el1 = createMockElement('btn1');
            const el2 = createMockElement('btn2');
            elements.push(el1, el2);

            nav.registerFocusable({ id: 'btn1', element: el1, neighbors: {} });
            nav.registerFocusable({ id: 'btn2', element: el2, neighbors: {} });
            nav.on('focusChange', handler);

            nav.setFocus('btn1');
            expect(handler).toHaveBeenCalledWith({ from: null, to: 'btn1' });

            nav.setFocus('btn2');
            expect(handler).toHaveBeenCalledWith({ from: 'btn1', to: 'btn2' });
        });
    });

    describe('key handling', () => {
        it('should emit keyPress event on mapped key', () => {
            const handler = jest.fn();
            nav.on('keyPress', handler);

            // Simulate keydown for OK button (keyCode 13)
            dispatchKeyEvent(13);

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({ button: 'ok', isRepeat: false })
            );
        });

        it('should emit keyUp event on mapped key', () => {
            const handler = jest.fn();
            nav.on('keyUp', handler);

            // Simulate keyup for Up arrow (keyCode 38)
            dispatchKeyEvent(38, 'keyup');

            expect(handler).toHaveBeenCalledWith({ button: 'up' });
        });

        it('should not emit keyPress for unmapped keys', () => {
            const handler = jest.fn();
            nav.on('keyPress', handler);

            // Some random key not in KEY_MAP
            dispatchKeyEvent(999);

            expect(handler).not.toHaveBeenCalled();
        });

        it('should block input when blockInput called', () => {
            const handler = jest.fn();
            nav.on('keyPress', handler);

            nav.blockInput();
            dispatchKeyEvent(13);

            expect(handler).not.toHaveBeenCalled();
        });

        it('should unblock input when unblockInput called', () => {
            const handler = jest.fn();
            nav.on('keyPress', handler);

            nav.blockInput();
            nav.unblockInput();
            dispatchKeyEvent(13);

            expect(handler).toHaveBeenCalled();
        });

        it('should stop navigation handling when keyPress prevents default', () => {
            nav.replaceScreen('player');
            const openModalSpy = jest.spyOn(nav, 'openModal');

            nav.on('keyPress', (event) => {
                event.handled = true;
            });

            // Back button (keyCode 461) would normally open exit-confirm at player root.
            dispatchKeyEvent(461);

            expect(openModalSpy).not.toHaveBeenCalled();
        });

        it('should move focus on arrow keys', () => {
            const el1 = createMockElement('btn1');
            const el2 = createMockElement('btn2');
            elements.push(el1, el2);

            nav.registerFocusable({
                id: 'btn1',
                element: el1,
                neighbors: { down: 'btn2' },
            });
            nav.registerFocusable({
                id: 'btn2',
                element: el2,
                neighbors: { up: 'btn1' },
            });
            nav.setFocus('btn1');

            // Down arrow (keyCode 40)
            dispatchKeyEvent(40);

            const focused = nav.getFocusedElement();
            expect(focused).not.toBeNull();
            if (focused) {
                expect(focused.id).toBe('btn2');
            }
        });

        it('should call onSelect on OK key press', () => {
            const onSelect = jest.fn();
            const el = createMockElement('btn1');
            elements.push(el);

            nav.registerFocusable({
                id: 'btn1',
                element: el,
                onSelect,
                neighbors: {},
            });
            nav.setFocus('btn1');

            // OK key (keyCode 13)
            dispatchKeyEvent(13);

            expect(onSelect).toHaveBeenCalled();
        });
    });

    describe('modal handling', () => {
        it('should open modal and emit event', () => {
            const handler = jest.fn();
            nav.on('modalOpen', handler);

            nav.openModal('confirm');

            expect(nav.isModalOpen()).toBe(true);
            expect(nav.isModalOpen('confirm')).toBe(true);
            expect(handler).toHaveBeenCalledWith({ modalId: 'confirm' });
        });

        it('should close modal and emit event', () => {
            const handler = jest.fn();
            nav.on('modalClose', handler);

            nav.openModal('confirm');
            nav.closeModal();

            expect(nav.isModalOpen()).toBe(false);
            expect(handler).toHaveBeenCalledWith({ modalId: 'confirm' });
        });

        it('should restore focus when modal closes', () => {
            const el1 = createMockElement('btn1');
            elements.push(el1);

            nav.registerFocusable({ id: 'btn1', element: el1, neighbors: {} });
            nav.setFocus('btn1');

            nav.openModal('confirm');
            nav.closeModal();

            const focused = nav.getFocusedElement();
            expect(focused).not.toBeNull();
            if (focused) {
                expect(focused.id).toBe('btn1');
            }
        });

        it('should close modal on Back button', () => {
            nav.openModal('confirm');
            expect(nav.isModalOpen()).toBe(true);

            // Back button (keyCode 461)
            dispatchKeyEvent(461);

            expect(nav.isModalOpen()).toBe(false);
        });

        it('should support stacked modals', () => {
            nav.openModal('first');
            nav.openModal('second');

            expect(nav.isModalOpen('first')).toBe(true);
            expect(nav.isModalOpen('second')).toBe(true);

            nav.closeModal();
            expect(nav.isModalOpen('first')).toBe(true);
            expect(nav.isModalOpen('second')).toBe(false);

            nav.closeModal();
            expect(nav.isModalOpen()).toBe(false);
        });
    });

    describe('focus memory', () => {
        it('should restore focus when returning to screen', () => {
            const el = createMockElement('btn5');
            elements.push(el);

            nav.registerFocusable({ id: 'btn5', element: el, neighbors: {} });
            nav.setFocus('btn5');

            nav.goTo('settings');
            nav.goBack();

            const focused = nav.getFocusedElement();
            expect(focused).not.toBeNull();
            if (focused) {
                expect(focused.id).toBe('btn5');
            }
        });
    });

    describe('input blocking', () => {
        it('should block navigation when input blocked', () => {
            const el1 = createMockElement('btn1');
            const el2 = createMockElement('btn2');
            elements.push(el1, el2);

            nav.registerFocusable({
                id: 'btn1',
                element: el1,
                neighbors: { right: 'btn2' },
            });
            nav.registerFocusable({ id: 'btn2', element: el2, neighbors: {} });
            nav.setFocus('btn1');

            nav.blockInput();
            const moved = nav.moveFocus('right');

            expect(moved).toBe(false);
            const focused = nav.getFocusedElement();
            expect(focused).not.toBeNull();
            if (focused) {
                expect(focused.id).toBe('btn1');
            }
        });

        it('should block screen navigation when input blocked', () => {
            nav.blockInput();
            nav.goTo('settings');

            expect(nav.getCurrentScreen()).toBe('splash');
        });
    });

    describe('getState', () => {
        it('should return current navigation state', () => {
            const state = nav.getState();

            expect(state.currentScreen).toBe('splash');
            expect(state.screenStack).toEqual([]);
            expect(state.focusedElementId).toBeNull();
            expect(state.modalStack).toEqual([]);
            expect(state.isPointerActive).toBe(false);
        });

        it('should reflect changes in state', () => {
            const el = createMockElement('btn1');
            elements.push(el);

            nav.registerFocusable({ id: 'btn1', element: el, neighbors: {} });
            nav.setFocus('btn1');
            nav.goTo('settings');
            nav.openModal('test');

            const state = nav.getState();

            expect(state.currentScreen).toBe('settings');
            expect(state.screenStack).toContain('splash');
            expect(state.focusedElementId).toBe('btn1');
            expect(state.modalStack).toContain('test');
        });
    });

    describe('channel input', () => {
        it('should emit channelInputUpdate on number key', () => {
            const handler = jest.fn();
            nav.on('channelInputUpdate', handler);

            // Press num5
            dispatchKeyEvent(53);

            expect(handler).toHaveBeenCalledWith({
                digits: '5',
                isComplete: false,
            });
        });

        it('should accumulate digits', () => {
            const handler = jest.fn();
            nav.on('channelInputUpdate', handler);

            dispatchKeyEvent(49); // num1
            dispatchKeyEvent(50); // num2

            expect(handler).toHaveBeenLastCalledWith({
                digits: '12',
                isComplete: false,
            });
        });

        it('should commit immediately at max digits', async () => {
            const inputHandler = jest.fn();
            const commitHandler = jest.fn();
            nav.on('channelInputUpdate', inputHandler);
            nav.on('channelNumberEntered', commitHandler);

            // Enter 3 digits
            dispatchKeyEvent(49); // num1
            dispatchKeyEvent(48); // num0
            dispatchKeyEvent(53); // num5

            expect(commitHandler).toHaveBeenCalledWith({ channelNumber: 105 });
            expect(inputHandler).toHaveBeenLastCalledWith({
                digits: '',
                isComplete: true,
            });
        });

        it('should commit after timeout', () => {
            jest.useFakeTimers();

            const commitHandler = jest.fn();
            nav.on('channelNumberEntered', commitHandler);

            dispatchKeyEvent(53); // num5

            // Advance timers past the 2000ms timeout
            jest.advanceTimersByTime(2100);

            expect(commitHandler).toHaveBeenCalledWith({ channelNumber: 5 });

            jest.useRealTimers();
        });
    });

    describe('root screen Back behavior', () => {
        it('should open exit-confirm modal on player root', () => {
            nav.replaceScreen('player');

            // Press Back
            dispatchKeyEvent(461);

            expect(nav.isModalOpen('exit-confirm')).toBe(true);
        });

        it('should open exit-confirm modal on auth root', () => {
            nav.replaceScreen('auth');

            dispatchKeyEvent(461);

            expect(nav.isModalOpen('exit-confirm')).toBe(true);
        });

        it('should navigate to auth from server-select root', () => {
            const handler = jest.fn();
            nav.on('screenChange', handler);
            nav.replaceScreen('server-select');
            handler.mockClear();

            dispatchKeyEvent(461);

            expect(handler).toHaveBeenCalledWith({
                from: 'server-select',
                to: 'auth',
            });
            expect(nav.getCurrentScreen()).toBe('auth');
        });

        it('should navigate to player from settings root', () => {
            const handler = jest.fn();
            nav.on('screenChange', handler);
            nav.replaceScreen('settings');
            handler.mockClear();

            dispatchKeyEvent(461);

            expect(handler).toHaveBeenCalledWith({
                from: 'settings',
                to: 'player',
            });
            expect(nav.getCurrentScreen()).toBe('player');
        });
    });

    describe('modal focus trap', () => {
        it('should trap focus within modal', () => {
            const el1 = createMockElement('outside');
            const el2 = createMockElement('modal-btn1');
            const el3 = createMockElement('modal-btn2');
            elements.push(el1, el2, el3);

            nav.registerFocusable({
                id: 'outside',
                element: el1,
                neighbors: { down: 'modal-btn1' },
            });
            nav.registerFocusable({
                id: 'modal-btn1',
                element: el2,
                neighbors: { down: 'modal-btn2', up: 'outside' },
            });
            nav.registerFocusable({
                id: 'modal-btn2',
                element: el3,
                neighbors: { up: 'modal-btn1' },
            });

            // Open modal with registered focusables
            nav.openModal('test-modal', ['modal-btn1', 'modal-btn2']);
            nav.setFocus('modal-btn1');

            // Try to navigate to element outside modal
            const moved = nav.moveFocus('up');

            // Should be blocked
            expect(moved).toBe(false);
            const focused = nav.getFocusedElement();
            expect(focused).not.toBeNull();
            if (focused) {
                expect(focused.id).toBe('modal-btn1');
            }
        });

        it('should allow navigation within modal', () => {
            const el1 = createMockElement('modal-a');
            const el2 = createMockElement('modal-b');
            elements.push(el1, el2);

            nav.registerFocusable({
                id: 'modal-a',
                element: el1,
                neighbors: { down: 'modal-b' },
            });
            nav.registerFocusable({
                id: 'modal-b',
                element: el2,
                neighbors: { up: 'modal-a' },
            });

            nav.openModal('test-modal', ['modal-a', 'modal-b']);
            nav.setFocus('modal-a');

            const moved = nav.moveFocus('down');

            expect(moved).toBe(true);
            const focused = nav.getFocusedElement();
            expect(focused).not.toBeNull();
            if (focused) {
                expect(focused.id).toBe('modal-b');
            }
        });

        it('should block all navigation when modal has no focusableIds', () => {
            const el1 = createMockElement('btn1');
            const el2 = createMockElement('btn2');
            elements.push(el1, el2);

            nav.registerFocusable({
                id: 'btn1',
                element: el1,
                neighbors: { down: 'btn2' },
            });
            nav.registerFocusable({
                id: 'btn2',
                element: el2,
                neighbors: { up: 'btn1' },
            });

            nav.setFocus('btn1');

            // Open modal WITHOUT focusableIds
            nav.openModal('exit-confirm');

            // Try to navigate - should be blocked
            const moved = nav.moveFocus('down');

            expect(moved).toBe(false);
            const focused = nav.getFocusedElement();
            expect(focused).not.toBeNull();
            if (focused) {
                expect(focused.id).toBe('btn1');
            }
        });
    });
});
