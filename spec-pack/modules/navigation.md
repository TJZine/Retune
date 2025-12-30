# Module: Navigation & Remote Control

## Metadata
- **ID**: `navigation`
- **Path**: `src/modules/navigation/`
- **Primary File**: `NavigationManager.ts`
- **Test File**: `NavigationManager.test.ts`
- **Dependencies**: None (foundational module)
- **Complexity**: high
- **Estimated LoC**: 520

## Purpose

Handles all user input from the LG remote control, translates key codes to semantic actions, manages focus state across the application, implements TV-appropriate navigation patterns, and coordinates screen/modal transitions. This is the central input handling and focus management system.

## Public Interface

```typescript
/**
 * Navigation Manager Interface
 * Handles remote input and screen/focus management
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
```

## Required Exports

```typescript
// src/modules/navigation/index.ts
export { NavigationManager } from './NavigationManager';
export { FocusManager } from './FocusManager';
export { RemoteHandler } from './RemoteHandler';
export type { INavigationManager, IFocusManager } from './interfaces';
export type {
  NavigationConfig,
  RemoteButton,
  KeyEvent,
  Screen,
  NavigationState,
  FocusableElement,
  FocusGroup
} from './types';
```

## Implementation Requirements

### MUST Implement:

1. **Key Event Handling**
   - Capture all keydown events on document
   - Map webOS key codes to RemoteButton enum
   - Support key repeat detection
   - Support long-press detection (500ms threshold)

2. **Screen Stack Management**
   - Maintain history stack for back navigation
   - Support `goTo()`, `goBack()`, `replaceScreen()`
   - Emit screen change events

3. **Focus Management**
   - Track all registered focusable elements
   - Support explicit and spatial navigation
   - Focus memory per screen (restore on return)
   - Visual focus ring management

4. **Modal Stack**
   - Trap focus within open modal
   - Support stacked modals
   - Restore focus when modal closes

5. **Input Blocking**
   - Block all input during transitions
   - Prevent accidental double-navigation

### MUST NOT:

1. Allow focus on unregistered elements
2. Navigate while input is blocked
3. Lose focus during screen transitions
4. Allow navigation outside modal when open

### State Management:

```typescript
interface NavigationInternalState {
  config: NavigationConfig;
  currentScreen: Screen;
  screenStack: Screen[];
  screenParams: Map<Screen, Record<string, unknown>>;
  focusedElementId: string | null;
  focusableElements: Map<string, FocusableElement>;
  focusGroups: Map<string, FocusGroup>;
  focusMemory: Map<Screen, string>;
  modalStack: string[];
  isPointerActive: boolean;
  isInputBlocked: boolean;
}
```

- **Persistence**: Focus memory could persist to localStorage
- **Initialization**: Start on 'splash' screen

### Key Code Mapping:

```typescript
const KEY_MAP: Map<number, RemoteButton> = new Map([
  // Navigation
  [13, 'ok'],
  [461, 'back'],
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
  
  // Color buttons
  [403, 'red'],
  [404, 'green'],
  [405, 'blue'],
  [406, 'yellow'],
  
  // Numbers
  [48, 'num0'], [49, 'num1'], [50, 'num2'], [51, 'num3'], [52, 'num4'],
  [53, 'num5'], [54, 'num6'], [55, 'num7'], [56, 'num8'], [57, 'num9'],
  
  // Info/Guide
  [457, 'info'],
  [458, 'guide'],
]);
```

## Method Specifications

### `goTo(screen: Screen, params?: Record<string, unknown>): void`

**Purpose**: Navigate to a screen, pushing current to history.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| screen | Screen | Yes | Target screen |
| params | Record<string, unknown> | No | Parameters to pass |

**Side Effects**:
- Pushes current screen to stack
- Saves focus state for current screen
- Updates current screen
- Restores or sets initial focus
- Emits `screenChange` event

**Implementation Notes**:
```typescript
goTo(screen: Screen, params?: Record<string, unknown>): void {
  const from = this.state.currentScreen;
  
  // Save focus state for current screen
  this.focusManager.saveFocusState(from);
  
  // Push to stack
  this.state.screenStack.push(from);
  
  // Set new screen
  this.state.currentScreen = screen;
  if (params) {
    this.state.screenParams.set(screen, params);
  }
  
  // Emit event
  this.emit('screenChange', { from, to: screen });
  
  // Restore or set initial focus
  if (!this.focusManager.restoreFocusState(screen)) {
    this.setInitialFocus(screen);
  }
}
```

---

### `moveFocus(direction: 'up' | 'down' | 'left' | 'right'): boolean`

**Purpose**: Move focus in specified direction using spatial navigation.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| direction | 'up' \| 'down' \| 'left' \| 'right' | Yes | Direction to move |

**Returns**: `true` if focus moved, `false` if at boundary

**Implementation Notes**:
```typescript
moveFocus(direction: 'up' | 'down' | 'left' | 'right'): boolean {
  const current = this.state.focusedElementId;
  if (!current) return false;
  
  // Check explicit neighbor first
  const currentElement = this.state.focusableElements.get(current);
  if (currentElement?.neighbors[direction]) {
    this.setFocus(currentElement.neighbors[direction]);
    return true;
  }
  
  // Check group navigation
  const groupId = currentElement?.group;
  if (groupId) {
    const group = this.state.focusGroups.get(groupId);
    if (group) {
      const nextId = this.findNextInGroup(current, direction, group);
      if (nextId) {
        this.setFocus(nextId);
        return true;
      }
    }
  }
  
  // Spatial navigation fallback
  const neighbor = this.focusManager.findNeighbor(current, direction);
  if (neighbor) {
    this.setFocus(neighbor);
    return true;
  }
  
  return false;
}
```

---

### `registerFocusable(element: FocusableElement): void`

**Purpose**: Register an element as focusable.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| element | FocusableElement | Yes | Element to register |

**Side Effects**:
- Adds element to focusable map
- Sets tabindex="-1" on DOM element
- Adds focusable class

**Implementation Notes**:
```typescript
registerFocusable(element: FocusableElement): void {
  this.state.focusableElements.set(element.id, element);
  
  // Make element focusable
  element.element.tabIndex = -1;
  element.element.classList.add('focusable');
  
  // Add click handler for pointer mode
  element.element.addEventListener('click', () => {
    this.setFocus(element.id);
    element.onSelect?.();
  });
}
```

## Internal Architecture

### Private Methods:
- `_handleKeyDown(event)`: Process raw keyboard events
- `_handleKeyUp(event)`: Track key releases for long-press
- `_routeKeyEvent(keyEvent)`: Route to appropriate handler
- `_setInitialFocus(screen)`: Set default focus for screen
- `_findNextInGroup(current, direction, group)`: Group navigation
- `_handleBackButton()`: Back key handling (close modal or go back)
- `_updatePointerMode(active)`: Toggle pointer mode
- `_calculateSpatialNeighbor(fromId, direction)`: Find closest element in direction

### Spatial Navigation Algorithm (CRITICAL)

When explicit neighbors are not defined, use geometric analysis to find the best target:

```typescript
/**
 * Find the nearest focusable element in a given direction using spatial analysis.
 * Algorithm uses projection overlap and distance to determine best candidate.
 */
private _calculateSpatialNeighbor(
  fromId: string, 
  direction: 'up' | 'down' | 'left' | 'right'
): string | null {
  const fromElement = this.state.focusableElements.get(fromId);
  if (!fromElement) return null;
  
  const fromRect = fromElement.element.getBoundingClientRect();
  const candidates: Array<{ id: string; score: number }> = [];
  
  for (const [id, element] of this.state.focusableElements) {
    if (id === fromId) continue;
    if (!this.isVisible(element.element)) continue;
    
    const rect = element.element.getBoundingClientRect();
    
    // Check if element is in the correct direction
    if (!this.isInDirection(fromRect, rect, direction)) continue;
    
    // Calculate overlap on perpendicular axis
    const overlap = this.calculateOverlap(fromRect, rect, direction);
    
    // Calculate distance in primary direction
    const distance = this.calculateDistance(fromRect, rect, direction);
    
    // Score: prefer overlap, then minimal distance
    // Higher overlap = better, lower distance = better
    const score = (overlap * 1000) - distance;
    
    candidates.push({ id, score });
  }
  
  // Return candidate with highest score
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].id;
}

/**
 * Check if target rect is in the specified direction from source rect
 */
private isInDirection(
  fromRect: DOMRect, 
  toRect: DOMRect, 
  direction: 'up' | 'down' | 'left' | 'right'
): boolean {
  const fromCenter = {
    x: fromRect.left + fromRect.width / 2,
    y: fromRect.top + fromRect.height / 2
  };
  const toCenter = {
    x: toRect.left + toRect.width / 2,
    y: toRect.top + toRect.height / 2
  };
  
  switch (direction) {
    case 'up': return toCenter.y < fromCenter.y;
    case 'down': return toCenter.y > fromCenter.y;
    case 'left': return toCenter.x < fromCenter.x;
    case 'right': return toCenter.x > fromCenter.x;
  }
}

/**
 * Calculate overlap percentage on perpendicular axis
 * For up/down, check horizontal overlap; for left/right, check vertical
 */
private calculateOverlap(
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
 * Calculate distance from edge of source to edge of target in primary direction
 */
private calculateDistance(
  fromRect: DOMRect, 
  toRect: DOMRect, 
  direction: 'up' | 'down' | 'left' | 'right'
): number {
  switch (direction) {
    case 'up': return fromRect.top - toRect.bottom;
    case 'down': return toRect.top - fromRect.bottom;
    case 'left': return fromRect.left - toRect.right;
    case 'right': return toRect.left - fromRect.right;
  }
}

/**
 * Check if element is visible in the viewport
 */
private isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    element.offsetParent !== null
  );
}
```

### Grid Navigation for EPG

For grid-based UIs like the EPG, use a specialized algorithm that maintains column position:

```typescript
/**
 * Navigate within a grid, maintaining column position when moving vertically
 */
private navigateGrid(
  currentId: string,
  direction: 'up' | 'down' | 'left' | 'right',
  group: FocusGroup
): string | null {
  if (group.orientation !== 'grid' || !group.columns) {
    return null; // Fall back to spatial
  }
  
  const currentIndex = group.elements.indexOf(currentId);
  if (currentIndex === -1) return null;
  
  const cols = group.columns;
  const row = Math.floor(currentIndex / cols);
  const col = currentIndex % cols;
  const totalRows = Math.ceil(group.elements.length / cols);
  
  let targetIndex: number;
  
  switch (direction) {
    case 'left':
      if (col === 0) return group.wrapAround ? group.elements[currentIndex + cols - 1] : null;
      targetIndex = currentIndex - 1;
      break;
    case 'right':
      if (col === cols - 1) return group.wrapAround ? group.elements[currentIndex - cols + 1] : null;
      targetIndex = currentIndex + 1;
      break;
    case 'up':
      if (row === 0) return group.wrapAround ? group.elements[(totalRows - 1) * cols + col] : null;
      targetIndex = currentIndex - cols;
      break;
    case 'down':
      if (row === totalRows - 1) return group.wrapAround ? group.elements[col] : null;
      targetIndex = currentIndex + cols;
      break;
  }
  
  // Bounds check
  if (targetIndex < 0 || targetIndex >= group.elements.length) {
    return null;
  }
  
  return group.elements[targetIndex];
}
```

### Class Diagram:
```
┌─────────────────────────────────┐
│      NavigationManager          │
├─────────────────────────────────┤
│ - config: NavigationConfig      │
│ - state: NavigationInternalState│
│ - focusManager: IFocusManager   │
│ - remoteHandler: RemoteHandler  │
│ - eventEmitter: EventEmitter    │
├─────────────────────────────────┤
│ + initialize(config): void      │
│ + destroy(): void               │
│ + goTo(screen, params): void    │
│ + goBack(): boolean             │
│ + replaceScreen(screen): void   │
│ + setFocus(elementId): void     │
│ + getFocusedElement()           │
│ + moveFocus(direction): boolean │
│ + registerFocusable(): void     │
│ + unregisterFocusable(): void   │
│ + registerFocusGroup(): void    │
│ + openModal(modalId): void      │
│ + closeModal(): void            │
│ + blockInput(): void            │
│ + unblockInput(): void          │
│ + on(event, handler): void      │
│ - _handleKeyDown(): void        │
│ - _routeKeyEvent(): void        │
│ - _handleBackButton(): void     │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│        FocusManager             │
├─────────────────────────────────┤
│ - currentFocusId: string | null │
│ - focusRing: HTMLElement        │
├─────────────────────────────────┤
│ + focus(elementId): boolean     │
│ + blur(): void                  │
│ + findNeighbor(): string | null │
│ + saveFocusState(): void        │
│ + restoreFocusState(): boolean  │
│ + updateFocusRing(): void       │
│ + hideFocusRing(): void         │
│ - _calculateSpatialNeighbor()   │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│        RemoteHandler            │
├─────────────────────────────────┤
│ - keyMap: Map<number, Button>   │
│ - keyDownTimes: Map<number, n>  │
│ - longPressThresholdMs: number  │
├─────────────────────────────────┤
│ + initialize(): void            │
│ + destroy(): void               │
│ + mapKeyCode(code): Button|null │
│ + isLongPress(code): boolean    │
└─────────────────────────────────┘
```

## Events Emitted

| Event Name | Payload Type | When Emitted |
|------------|--------------|--------------|
| `keyPress` | `KeyEvent` | Any mapped key pressed |
| `screenChange` | `{ from, to }` | Screen navigation occurs |
| `focusChange` | `{ from, to }` | Focus moves to new element |
| `modalOpen` | `{ modalId }` | Modal opens |
| `modalClose` | `{ modalId }` | Modal closes |
| `pointerModeChange` | `{ active }` | Magic Remote mode changes |

## Events Consumed

None (foundational module)

## Test Specification

### Unit Tests Required:

```typescript
describe('NavigationManager', () => {
  describe('screen navigation', () => {
    it('should push to stack on goTo', () => {
      nav.goTo('settings');
      expect(nav.getCurrentScreen()).toBe('settings');
      expect(nav.getState().screenStack).toContain('home');
    });
    
    it('should pop stack on goBack', () => {
      nav.goTo('settings');
      nav.goBack();
      expect(nav.getCurrentScreen()).toBe('home');
    });
    
    it('should not push on replaceScreen', () => {
      const stackLengthBefore = nav.getState().screenStack.length;
      nav.replaceScreen('settings');
      expect(nav.getState().screenStack.length).toBe(stackLengthBefore);
    });
    
    it('should return false on goBack at root', () => {
      expect(nav.goBack()).toBe(false);
    });
  });
  
  describe('focus management', () => {
    it('should set focus on registered element', () => {
      nav.registerFocusable({ id: 'btn1', element: mockElement, neighbors: {} });
      nav.setFocus('btn1');
      expect(nav.getFocusedElement()?.id).toBe('btn1');
    });
    
    it('should not set focus on unregistered element', () => {
      nav.setFocus('unknown');
      expect(nav.getFocusedElement()).toBeNull();
    });
    
    it('should move focus using neighbors', () => {
      nav.registerFocusable({ id: 'btn1', element: m1, neighbors: { right: 'btn2' } });
      nav.registerFocusable({ id: 'btn2', element: m2, neighbors: { left: 'btn1' } });
      nav.setFocus('btn1');
      expect(nav.moveFocus('right')).toBe(true);
      expect(nav.getFocusedElement()?.id).toBe('btn2');
    });
    
    it('should call onFocus/onBlur callbacks', () => {
      const onFocus = jest.fn();
      const onBlur = jest.fn();
      nav.registerFocusable({ id: 'btn1', element: m1, onFocus, onBlur, neighbors: {} });
      nav.setFocus('btn1');
      expect(onFocus).toHaveBeenCalled();
      nav.setFocus('btn2');
      expect(onBlur).toHaveBeenCalled();
    });
  });
  
  describe('key handling', () => {
    it('should emit keyPress event for mapped keys', () => {
      const handler = jest.fn();
      nav.on('keyPress', handler);
      dispatchKeyEvent(13); // OK button
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ button: 'ok' }));
    });
    
    it('should detect long press after threshold', async () => {
      dispatchKeyDown(13);
      await wait(600);
      const event = waitForEvent('keyPress');
      expect(event.isLongPress).toBe(true);
    });
    
    it('should block input when blockInput called', () => {
      const handler = jest.fn();
      nav.on('keyPress', handler);
      nav.blockInput();
      dispatchKeyEvent(13);
      expect(handler).not.toHaveBeenCalled();
    });
  });
  
  describe('modal handling', () => {
    it('should trap focus within modal', () => {
      nav.openModal('confirm');
      // Focus should not escape modal
    });
    
    it('should restore focus when modal closes', () => {
      nav.setFocus('btn1');
      nav.openModal('confirm');
      nav.closeModal();
      expect(nav.getFocusedElement()?.id).toBe('btn1');
    });
    
    it('should close modal on Back button', () => {
      nav.openModal('confirm');
      dispatchKeyEvent(461); // Back
      expect(nav.isModalOpen()).toBe(false);
    });
  });
  
  describe('focus memory', () => {
    it('should restore focus when returning to screen', () => {
      nav.registerFocusable({ id: 'btn5', element: m1, neighbors: {} });
      nav.setFocus('btn5');
      nav.goTo('settings');
      nav.goBack();
      expect(nav.getFocusedElement()?.id).toBe('btn5');
    });
  });
});
```

## File Structure

```
src/modules/navigation/
├── index.ts              # Public exports
├── NavigationManager.ts  # Main class
├── FocusManager.ts       # Focus tracking and spatial nav
├── RemoteHandler.ts      # Key event handling
├── interfaces.ts         # INavigationManager, IFocusManager
├── types.ts              # RemoteButton, Screen, KeyEvent, etc.
├── constants.ts          # Key maps, thresholds
└── __tests__/
    ├── NavigationManager.test.ts
    ├── FocusManager.test.ts
    └── RemoteHandler.test.ts
```

## Implementation Checklist

- [ ] Create file structure
- [ ] Implement RemoteHandler with key mapping
- [ ] Implement long-press detection
- [ ] Implement FocusManager with registration
- [ ] Implement spatial navigation algorithm
- [ ] Implement screen stack management
- [ ] Implement focus memory per screen
- [ ] Implement modal focus trapping
- [ ] Implement input blocking
- [ ] Write unit tests for navigation
- [ ] Write unit tests for focus management
- [ ] Add JSDoc comments to all public methods
- [ ] Verify against acceptance criteria

## Acceptance Criteria

This module is COMPLETE when:
1. [ ] All remote buttons are correctly mapped
2. [ ] Long-press detection works at 500ms threshold
3. [ ] Focus moves correctly with D-pad
4. [ ] Screen history works with goTo/goBack
5. [ ] Focus is restored on screen return
6. [ ] Modals trap focus correctly
7. [ ] Input blocking prevents all navigation
8. [ ] All unit tests pass
9. [ ] No TypeScript compilation errors
