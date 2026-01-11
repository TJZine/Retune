/**
 * @fileoverview Focus manager for tracking and spatially navigating focusable elements.
 * @module modules/navigation/FocusManager
 * @version 1.0.0
 */

import { IFocusManager, FocusableElement, FocusGroup } from './interfaces';
import { FOCUS_CLASSES } from './constants';

/**
 * Internal state for focus tracking.
 */
interface FocusManagerState {
    currentFocusId: string | null;
    focusableElements: Map<string, FocusableElement>;
    focusGroups: Map<string, FocusGroup>;
    focusMemory: Map<string, string>;
    preFocusIdBeforeModal: string | null;
}

/**
 * Manages focus state, spatial navigation, and focus memory per screen.
 *
 * @implements IFocusManager
 */
export class FocusManager implements IFocusManager {
    private _state: FocusManagerState;

    constructor() {
        this._state = {
            currentFocusId: null,
            focusableElements: new Map(),
            focusGroups: new Map(),
            focusMemory: new Map(),
            preFocusIdBeforeModal: null,
        };
    }

    /**
     * Get the current focused element ID.
     * @returns The focused element ID or null
     */
    public getCurrentFocusId(): string | null {
        return this._state.currentFocusId;
    }

    /**
     * Get the currently focused focusable element.
     * @returns The focused element or null
     */
    public getFocusedElement(): FocusableElement | null {
        if (!this._state.currentFocusId) {
            return null;
        }
        const element = this._state.focusableElements.get(this._state.currentFocusId);
        return element !== undefined ? element : null;
    }

    /**
     * Get a registered focusable element by ID.
     * @param elementId - The element ID to retrieve
     * @returns The focusable element or null if not found
     */
    public getElement(elementId: string): FocusableElement | null {
        const element = this._state.focusableElements.get(elementId);
        return element !== undefined ? element : null;
    }

    /**
     * Register a focusable element.
     * @param element - The focusable element to register
     */
    public registerFocusable(element: FocusableElement): void {
        this._state.focusableElements.set(element.id, element);
        element.element.tabIndex = -1;
        element.element.classList.add(FOCUS_CLASSES.FOCUSABLE);
    }

    /**
     * Unregister a focusable element.
     * @param elementId - The element ID to unregister
     */
    public unregisterFocusable(elementId: string): void {
        const element = this._state.focusableElements.get(elementId);
        if (element) {
            element.element.classList.remove(FOCUS_CLASSES.FOCUSABLE);
            element.element.classList.remove(FOCUS_CLASSES.FOCUSED);
        }
        this._state.focusableElements.delete(elementId);

        // Clear focus if the removed element was focused
        if (this._state.currentFocusId === elementId) {
            this._state.currentFocusId = null;
        }
    }

    /**
     * Register a focus group.
     * @param group - The focus group to register
     */
    public registerFocusGroup(group: FocusGroup): void {
        this._state.focusGroups.set(group.id, group);
    }

    /**
     * Unregister a focus group.
     * @param groupId - The group ID to unregister
     */
    public unregisterFocusGroup(groupId: string): void {
        this._state.focusGroups.delete(groupId);
    }

    /**
     * Focus an element by ID.
     * @param elementId - The element ID to focus
     * @returns true if focus was set, false if element not found
     */
    public focus(elementId: string): boolean {
        const element = this._state.focusableElements.get(elementId);
        if (!element) {
            return false;
        }

        // Blur previous element
        const previousId = this._state.currentFocusId;
        if (previousId && previousId !== elementId) {
            this.blur();
        }

        // Focus new element
        this._state.currentFocusId = elementId;
        element.element.classList.add(FOCUS_CLASSES.FOCUSED);
        this.updateFocusRing(elementId);

        // Call onFocus callback
        if (element.onFocus) {
            element.onFocus();
        }

        return true;
    }

    /**
     * Blur the currently focused element.
     */
    public blur(): void {
        const currentId = this._state.currentFocusId;
        if (!currentId) {
            return;
        }

        const element = this._state.focusableElements.get(currentId);
        if (element) {
            element.element.classList.remove(FOCUS_CLASSES.FOCUSED);

            // Call onBlur callback
            if (element.onBlur) {
                element.onBlur();
            }
        }

        this.hideFocusRing();
        this._state.currentFocusId = null;
    }

    /**
     * Find the neighbor element in a given direction.
     * Uses explicit neighbors first, then spatial navigation fallback.
     * @param fromId - Starting element ID
     * @param direction - Navigation direction
     * @returns The neighbor element ID or null
     */
    public findNeighbor(
        fromId: string,
        direction: 'up' | 'down' | 'left' | 'right'
    ): string | null {
        const fromElement = this._state.focusableElements.get(fromId);
        if (!fromElement) {
            return null;
        }

        // Check explicit neighbor first
        const explicitNeighbor = fromElement.neighbors[direction];
        if (explicitNeighbor !== undefined) {
            // Verify the neighbor exists
            if (this._state.focusableElements.has(explicitNeighbor)) {
                return explicitNeighbor;
            }
        }

        // Check group navigation
        const groupId = fromElement.group;
        if (groupId !== undefined) {
            const group = this._state.focusGroups.get(groupId);
            if (group) {
                const groupNeighbor = this._findNextInGroup(fromId, direction, group);
                if (groupNeighbor) {
                    return groupNeighbor;
                }
            }
        }

        // Fallback to spatial navigation
        return this._calculateSpatialNeighbor(fromId, direction);
    }

    /**
     * Save the current focus state for a screen.
     * @param screenId - The screen identifier
     */
    public saveFocusState(screenId: string): void {
        if (this._state.currentFocusId) {
            this._state.focusMemory.set(screenId, this._state.currentFocusId);
        }
    }

    /**
     * Restore focus state for a screen.
     * @param screenId - The screen identifier
     * @returns true if focus was restored, false otherwise
     */
    public restoreFocusState(screenId: string): boolean {
        const savedFocusId = this._state.focusMemory.get(screenId);
        if (savedFocusId && this._state.focusableElements.has(savedFocusId)) {
            return this.focus(savedFocusId);
        }
        return false;
    }

    /**
     * Save the focus ID before opening a modal.
     */
    public savePreModalFocus(): void {
        this._state.preFocusIdBeforeModal = this._state.currentFocusId;
    }

    /**
     * Restore focus after closing a modal.
     * @returns true if focus was restored
     */
    public restorePreModalFocus(): boolean {
        const preModalId = this._state.preFocusIdBeforeModal;
        this._state.preFocusIdBeforeModal = null;

        if (preModalId && this._state.focusableElements.has(preModalId)) {
            return this.focus(preModalId);
        }
        return false;
    }

    /**
     * Update focus ring position for an element.
     * @param elementId - The element ID to show focus ring on
     */
    public updateFocusRing(elementId: string): void {
        const element = this._state.focusableElements.get(elementId);
        if (element) {
            element.element.focus();
        }
    }

    /**
     * Hide the focus ring.
     */
    public hideFocusRing(): void {
        // Focus ring is CSS-based, no explicit action needed beyond class removal
    }

    /**
     * Clear all registered elements and state.
     */
    public clear(): void {
        // Clear focus classes from all elements
        this._state.focusableElements.forEach((element) => {
            element.element.classList.remove(FOCUS_CLASSES.FOCUSABLE);
            element.element.classList.remove(FOCUS_CLASSES.FOCUSED);
        });

        this._state.currentFocusId = null;
        this._state.focusableElements.clear();
        this._state.focusGroups.clear();
        // Note: focusMemory and preFocusIdBeforeModal are intentionally preserved
        // to maintain focus state across screen transitions and modal cycles.
    }

    /**
     * Find the next element within a focus group.
     */
    private _findNextInGroup(
        currentId: string,
        direction: 'up' | 'down' | 'left' | 'right',
        group: FocusGroup
    ): string | null {
        const currentIndex = group.elements.indexOf(currentId);
        if (currentIndex === -1) {
            return null;
        }

        // Handle grid navigation
        if (group.orientation === 'grid' && group.columns !== undefined) {
            return this._navigateGrid(currentIndex, direction, group);
        }

        // Handle linear navigation (horizontal/vertical)
        const isVertical = group.orientation === 'vertical';
        const isPrimary =
            (isVertical && (direction === 'up' || direction === 'down')) ||
            (!isVertical && (direction === 'left' || direction === 'right'));

        if (!isPrimary) {
            return null; // Direction doesn't match orientation
        }

        const isForward = direction === 'down' || direction === 'right';
        let nextIndex: number;

        if (isForward) {
            nextIndex = currentIndex + 1;
            if (nextIndex >= group.elements.length) {
                nextIndex = group.wrapAround ? 0 : -1;
            }
        } else {
            nextIndex = currentIndex - 1;
            if (nextIndex < 0) {
                nextIndex = group.wrapAround ? group.elements.length - 1 : -1;
            }
        }

        if (nextIndex === -1) {
            return null;
        }

        const nextElement = group.elements[nextIndex];
        return nextElement !== undefined ? nextElement : null;
    }

    /**
     * Navigate within a grid layout.
     */
    private _navigateGrid(
        currentIndex: number,
        direction: 'up' | 'down' | 'left' | 'right',
        group: FocusGroup
    ): string | null {
        if (group.columns === undefined) {
            return null;
        }

        const cols = group.columns;
        const row = Math.floor(currentIndex / cols);
        const col = currentIndex % cols;
        const totalRows = Math.ceil(group.elements.length / cols);

        let targetIndex: number;

        switch (direction) {
            case 'left':
                if (col === 0) {
                    if (group.wrapAround) {
                        targetIndex = currentIndex + cols - 1;
                        if (targetIndex >= group.elements.length) {
                            targetIndex = group.elements.length - 1;
                        }
                    } else {
                        return null;
                    }
                } else {
                    targetIndex = currentIndex - 1;
                }
                break;
            case 'right':
                if (col === cols - 1 || currentIndex === group.elements.length - 1) {
                    if (group.wrapAround) {
                        targetIndex = row * cols;
                    } else {
                        return null;
                    }
                } else {
                    targetIndex = currentIndex + 1;
                }
                break;
            case 'up':
                if (row === 0) {
                    if (group.wrapAround) {
                        targetIndex = (totalRows - 1) * cols + col;
                        if (targetIndex >= group.elements.length) {
                            targetIndex = group.elements.length - 1;
                        }
                    } else {
                        return null;
                    }
                } else {
                    targetIndex = currentIndex - cols;
                }
                break;
            case 'down':
                if (row === totalRows - 1) {
                    if (group.wrapAround) {
                        targetIndex = col;
                    } else {
                        return null;
                    }
                } else {
                    targetIndex = currentIndex + cols;
                    if (targetIndex >= group.elements.length) {
                        return null;
                    }
                }
                break;
        }

        if (targetIndex < 0 || targetIndex >= group.elements.length) {
            return null;
        }

        const targetElement = group.elements[targetIndex];
        return targetElement !== undefined ? targetElement : null;
    }

    /**
     * Calculate the spatial neighbor using geometric analysis.
     * @complexity O(n) where n = number of focusable elements
     */
    private _calculateSpatialNeighbor(
        fromId: string,
        direction: 'up' | 'down' | 'left' | 'right'
    ): string | null {
        const fromElement = this._state.focusableElements.get(fromId);
        if (!fromElement) {
            return null;
        }

        const fromRect = fromElement.element.getBoundingClientRect();
        let bestCandidateId: string | null = null;
        let bestScore = -Infinity;

        this._state.focusableElements.forEach((element, id) => {
            if (id === fromId) {
                return;
            }

            const rect = element.element.getBoundingClientRect();

            if (!this._isVisible(element.element, rect)) {
                return;
            }

            // Check if element is in the correct direction
            if (!this._isInDirection(fromRect, rect, direction)) {
                return;
            }

            // Calculate overlap on perpendicular axis
            const overlap = this._calculateOverlap(fromRect, rect, direction);

            // Calculate distance in primary direction
            const distance = this._calculateDistance(fromRect, rect, direction);

            // Score: prefer overlap, then minimal distance
            // Higher overlap = better, lower distance = better
            const score = overlap * 1000 - distance;

            if (score > bestScore) {
                bestScore = score;
                bestCandidateId = id;
            }
        });

        return bestCandidateId;
    }

    /**
     * Check if an element is visible.
     */
    private _isVisible(element: HTMLElement, rect?: DOMRect): boolean {
        const resolvedRect = rect ?? element.getBoundingClientRect();
        return (
            resolvedRect.width > 0 &&
            resolvedRect.height > 0 &&
            element.offsetParent !== null
        );
    }

    /**
     * Check if target rect is in the specified direction from source rect.
     */
    private _isInDirection(
        fromRect: DOMRect,
        toRect: DOMRect,
        direction: 'up' | 'down' | 'left' | 'right'
    ): boolean {
        const fromCenter = {
            x: fromRect.left + fromRect.width / 2,
            y: fromRect.top + fromRect.height / 2,
        };
        const toCenter = {
            x: toRect.left + toRect.width / 2,
            y: toRect.top + toRect.height / 2,
        };

        switch (direction) {
            case 'up':
                return toCenter.y < fromCenter.y;
            case 'down':
                return toCenter.y > fromCenter.y;
            case 'left':
                return toCenter.x < fromCenter.x;
            case 'right':
                return toCenter.x > fromCenter.x;
        }
    }

    /**
     * Calculate overlap percentage on perpendicular axis.
     */
    private _calculateOverlap(
        fromRect: DOMRect,
        toRect: DOMRect,
        direction: 'up' | 'down' | 'left' | 'right'
    ): number {
        if (direction === 'up' || direction === 'down') {
            // Horizontal overlap
            const overlapStart = Math.max(fromRect.left, toRect.left);
            const overlapEnd = Math.min(fromRect.right, toRect.right);
            const overlap = Math.max(0, overlapEnd - overlapStart);
            const maxWidth = Math.min(fromRect.width, toRect.width);
            return maxWidth > 0 ? overlap / maxWidth : 0;
        } else {
            // Vertical overlap
            const overlapStart = Math.max(fromRect.top, toRect.top);
            const overlapEnd = Math.min(fromRect.bottom, toRect.bottom);
            const overlap = Math.max(0, overlapEnd - overlapStart);
            const maxHeight = Math.min(fromRect.height, toRect.height);
            return maxHeight > 0 ? overlap / maxHeight : 0;
        }
    }

    /**
     * Calculate distance from edge of source to edge of target in primary direction.
     */
    private _calculateDistance(
        fromRect: DOMRect,
        toRect: DOMRect,
        direction: 'up' | 'down' | 'left' | 'right'
    ): number {
        switch (direction) {
            case 'up':
                return fromRect.top - toRect.bottom;
            case 'down':
                return toRect.top - fromRect.bottom;
            case 'left':
                return fromRect.left - toRect.right;
            case 'right':
                return toRect.left - fromRect.right;
        }
    }
}
