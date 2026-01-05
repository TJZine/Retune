/**
 * @jest-environment jsdom
 */

/**
 * @fileoverview Unit tests for FocusManager.
 * @module modules/navigation/__tests__/FocusManager.test
 */

import { FocusManager } from '../FocusManager';
import { FocusGroup } from '../interfaces';

// Mock elements
function createMockElement(id: string): HTMLElement {
    const el = document.createElement('button');
    el.id = id;
    document.body.appendChild(el);
    return el;
}

describe('FocusManager', () => {
    let focusManager: FocusManager;
    let elements: HTMLElement[] = [];

    beforeEach(() => {
        elements.forEach((el) => {
            if (el.parentNode) {
                el.parentNode.removeChild(el);
            }
        });
        elements = [];
        focusManager = new FocusManager();
    });

    afterEach(() => {
        focusManager.clear();
        elements.forEach((el) => {
            if (el.parentNode) {
                el.parentNode.removeChild(el);
            }
        });
        elements = [];
    });

    describe('focus operations', () => {
        it('should focus a registered element', () => {
            const el = createMockElement('btn1');
            elements.push(el);

            focusManager.registerFocusable({ id: 'btn1', element: el, neighbors: {} });
            const result = focusManager.focus('btn1');

            expect(result).toBe(true);
            expect(focusManager.getCurrentFocusId()).toBe('btn1');
            expect(el.classList.contains('focused')).toBe(true);
        });

        it('should return false for unregistered element', () => {
            const result = focusManager.focus('unknown');

            expect(result).toBe(false);
            expect(focusManager.getCurrentFocusId()).toBeNull();
        });

        it('should blur previous element when focusing new one', () => {
            const el1 = createMockElement('btn1');
            const el2 = createMockElement('btn2');
            elements.push(el1, el2);

            focusManager.registerFocusable({ id: 'btn1', element: el1, neighbors: {} });
            focusManager.registerFocusable({ id: 'btn2', element: el2, neighbors: {} });

            focusManager.focus('btn1');
            focusManager.focus('btn2');

            expect(el1.classList.contains('focused')).toBe(false);
            expect(el2.classList.contains('focused')).toBe(true);
        });

        it('should call onFocus callback', () => {
            const onFocus = jest.fn();
            const el = createMockElement('btn1');
            elements.push(el);

            focusManager.registerFocusable({
                id: 'btn1',
                element: el,
                onFocus,
                neighbors: {},
            });
            focusManager.focus('btn1');

            expect(onFocus).toHaveBeenCalled();
        });

        it('should call onBlur callback', () => {
            const onBlur = jest.fn();
            const el1 = createMockElement('btn1');
            const el2 = createMockElement('btn2');
            elements.push(el1, el2);

            focusManager.registerFocusable({
                id: 'btn1',
                element: el1,
                onBlur,
                neighbors: {},
            });
            focusManager.registerFocusable({ id: 'btn2', element: el2, neighbors: {} });

            focusManager.focus('btn1');
            focusManager.focus('btn2');

            expect(onBlur).toHaveBeenCalled();
        });
    });

    describe('explicit neighbor navigation', () => {
        it('should find explicit neighbor', () => {
            const el1 = createMockElement('btn1');
            const el2 = createMockElement('btn2');
            elements.push(el1, el2);

            focusManager.registerFocusable({
                id: 'btn1',
                element: el1,
                neighbors: { right: 'btn2' },
            });
            focusManager.registerFocusable({
                id: 'btn2',
                element: el2,
                neighbors: { left: 'btn1' },
            });

            const neighbor = focusManager.findNeighbor('btn1', 'right');
            expect(neighbor).toBe('btn2');
        });

        it('should return null when no neighbor defined', () => {
            const el = createMockElement('btn1');
            elements.push(el);

            focusManager.registerFocusable({
                id: 'btn1',
                element: el,
                neighbors: { right: 'btn2' },
            });

            const neighbor = focusManager.findNeighbor('btn1', 'left');
            expect(neighbor).toBeNull();
        });
    });

    describe('focus group navigation', () => {
        it('should navigate within vertical group', () => {
            const el1 = createMockElement('item1');
            const el2 = createMockElement('item2');
            const el3 = createMockElement('item3');
            elements.push(el1, el2, el3);

            focusManager.registerFocusable({
                id: 'item1',
                element: el1,
                group: 'menu',
                neighbors: {},
            });
            focusManager.registerFocusable({
                id: 'item2',
                element: el2,
                group: 'menu',
                neighbors: {},
            });
            focusManager.registerFocusable({
                id: 'item3',
                element: el3,
                group: 'menu',
                neighbors: {},
            });

            const group: FocusGroup = {
                id: 'menu',
                elements: ['item1', 'item2', 'item3'],
                wrapAround: false,
                orientation: 'vertical',
            };
            focusManager.registerFocusGroup(group);

            focusManager.focus('item1');

            // Move down
            let neighbor = focusManager.findNeighbor('item1', 'down');
            expect(neighbor).toBe('item2');

            neighbor = focusManager.findNeighbor('item2', 'down');
            expect(neighbor).toBe('item3');

            // At end, no wrap
            neighbor = focusManager.findNeighbor('item3', 'down');
            expect(neighbor).toBeNull();
        });

        it('should wrap around when enabled', () => {
            const el1 = createMockElement('w1');
            const el2 = createMockElement('w2');
            elements.push(el1, el2);

            focusManager.registerFocusable({
                id: 'w1',
                element: el1,
                group: 'wrap',
                neighbors: {},
            });
            focusManager.registerFocusable({
                id: 'w2',
                element: el2,
                group: 'wrap',
                neighbors: {},
            });

            const group: FocusGroup = {
                id: 'wrap',
                elements: ['w1', 'w2'],
                wrapAround: true,
                orientation: 'vertical',
            };
            focusManager.registerFocusGroup(group);

            // From last, go down should wrap to first
            const neighbor = focusManager.findNeighbor('w2', 'down');
            expect(neighbor).toBe('w1');
        });

        it('should navigate within horizontal group', () => {
            const el1 = createMockElement('h1');
            const el2 = createMockElement('h2');
            elements.push(el1, el2);

            focusManager.registerFocusable({
                id: 'h1',
                element: el1,
                group: 'horiz',
                neighbors: {},
            });
            focusManager.registerFocusable({
                id: 'h2',
                element: el2,
                group: 'horiz',
                neighbors: {},
            });

            const group: FocusGroup = {
                id: 'horiz',
                elements: ['h1', 'h2'],
                wrapAround: false,
                orientation: 'horizontal',
            };
            focusManager.registerFocusGroup(group);

            const neighbor = focusManager.findNeighbor('h1', 'right');
            expect(neighbor).toBe('h2');
        });
    });

    describe('focus memory', () => {
        it('should save and restore focus state', () => {
            const el = createMockElement('btn1');
            elements.push(el);

            focusManager.registerFocusable({ id: 'btn1', element: el, neighbors: {} });
            focusManager.focus('btn1');

            focusManager.saveFocusState('home');
            focusManager.blur();

            const restored = focusManager.restoreFocusState('home');
            expect(restored).toBe(true);
            expect(focusManager.getCurrentFocusId()).toBe('btn1');
        });

        it('should return false when restoring without saved state', () => {
            const restored = focusManager.restoreFocusState('unknown');
            expect(restored).toBe(false);
        });
    });

    describe('modal focus', () => {
        it('should save and restore pre-modal focus', () => {
            const el = createMockElement('btn1');
            elements.push(el);

            focusManager.registerFocusable({ id: 'btn1', element: el, neighbors: {} });
            focusManager.focus('btn1');

            focusManager.savePreModalFocus();
            focusManager.blur();

            const restored = focusManager.restorePreModalFocus();
            expect(restored).toBe(true);
            expect(focusManager.getCurrentFocusId()).toBe('btn1');
        });
    });

    describe('unregister', () => {
        it('should clear focus on unregister of focused element', () => {
            const el = createMockElement('btn1');
            elements.push(el);

            focusManager.registerFocusable({ id: 'btn1', element: el, neighbors: {} });
            focusManager.focus('btn1');

            focusManager.unregisterFocusable('btn1');

            expect(focusManager.getCurrentFocusId()).toBeNull();
        });
    });
});
