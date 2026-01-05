/**
 * @jest-environment jsdom
 */

/**
 * @fileoverview Unit tests for RemoteHandler.
 * @module modules/navigation/__tests__/RemoteHandler.test
 */

import { RemoteHandler } from '../RemoteHandler';
import { LONG_PRESS_THRESHOLD_MS } from '../constants';

// Helper to dispatch key events
function dispatchKeyEvent(keyCode: number, type: 'keydown' | 'keyup' = 'keydown'): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = new KeyboardEvent(type, { keyCode } as any);
    document.dispatchEvent(event);
}

// Helper to wait for a specific duration
function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('RemoteHandler', () => {
    let remoteHandler: RemoteHandler;

    beforeEach(() => {
        remoteHandler = new RemoteHandler();
        remoteHandler.initialize(false);
    });

    afterEach(() => {
        remoteHandler.destroy();
    });

    describe('key mapping', () => {
        it('should map webOS key codes correctly', () => {
            expect(remoteHandler.mapKeyCode(13)).toBe('ok');
            expect(remoteHandler.mapKeyCode(461)).toBe('back');
            expect(remoteHandler.mapKeyCode(38)).toBe('up');
            expect(remoteHandler.mapKeyCode(40)).toBe('down');
            expect(remoteHandler.mapKeyCode(37)).toBe('left');
            expect(remoteHandler.mapKeyCode(39)).toBe('right');
            expect(remoteHandler.mapKeyCode(403)).toBe('red');
            expect(remoteHandler.mapKeyCode(404)).toBe('green');
            expect(remoteHandler.mapKeyCode(405)).toBe('blue');
            expect(remoteHandler.mapKeyCode(406)).toBe('yellow');
        });

        it('should map number keys correctly', () => {
            expect(remoteHandler.mapKeyCode(48)).toBe('num0');
            expect(remoteHandler.mapKeyCode(49)).toBe('num1');
            expect(remoteHandler.mapKeyCode(50)).toBe('num2');
            expect(remoteHandler.mapKeyCode(51)).toBe('num3');
            expect(remoteHandler.mapKeyCode(52)).toBe('num4');
            expect(remoteHandler.mapKeyCode(53)).toBe('num5');
            expect(remoteHandler.mapKeyCode(54)).toBe('num6');
            expect(remoteHandler.mapKeyCode(55)).toBe('num7');
            expect(remoteHandler.mapKeyCode(56)).toBe('num8');
            expect(remoteHandler.mapKeyCode(57)).toBe('num9');
        });

        it('should map playback keys correctly', () => {
            expect(remoteHandler.mapKeyCode(415)).toBe('play');
            expect(remoteHandler.mapKeyCode(19)).toBe('pause');
            expect(remoteHandler.mapKeyCode(413)).toBe('stop');
            expect(remoteHandler.mapKeyCode(412)).toBe('rewind');
            expect(remoteHandler.mapKeyCode(417)).toBe('fastforward');
        });

        it('should map channel keys correctly', () => {
            expect(remoteHandler.mapKeyCode(33)).toBe('channelUp');
            expect(remoteHandler.mapKeyCode(34)).toBe('channelDown');
        });

        it('should map info and guide keys correctly', () => {
            expect(remoteHandler.mapKeyCode(457)).toBe('info');
            expect(remoteHandler.mapKeyCode(458)).toBe('guide');
        });

        it('should return null for unmapped keys', () => {
            expect(remoteHandler.mapKeyCode(999)).toBeNull();
            expect(remoteHandler.mapKeyCode(0)).toBeNull();
        });
    });

    describe('keyDown events', () => {
        it('should emit keyDown event on mapped key', () => {
            const handler = jest.fn();
            remoteHandler.on('keyDown', handler);

            dispatchKeyEvent(13, 'keydown');

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({ button: 'ok', isRepeat: false })
            );
        });

        it('should not emit for unmapped keys', () => {
            const handler = jest.fn();
            remoteHandler.on('keyDown', handler);

            dispatchKeyEvent(999, 'keydown');

            expect(handler).not.toHaveBeenCalled();
        });

        it('should detect key repeat', () => {
            const handler = jest.fn();
            remoteHandler.on('keyDown', handler);

            // First press
            dispatchKeyEvent(13, 'keydown');
            // Repeat press (without keyup)
            dispatchKeyEvent(13, 'keydown');

            expect(handler).toHaveBeenNthCalledWith(
                1,
                expect.objectContaining({ isRepeat: false })
            );
            expect(handler).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({ isRepeat: true })
            );

            // Clean up
            dispatchKeyEvent(13, 'keyup');
        });
    });

    describe('keyUp events', () => {
        it('should emit keyUp event', () => {
            const handler = jest.fn();
            remoteHandler.on('keyUp', handler);

            dispatchKeyEvent(13, 'keydown');
            dispatchKeyEvent(13, 'keyup');

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({ button: 'ok', wasLongPress: false })
            );
        });
    });

    describe('long press detection', () => {
        it('should detect long press after threshold', async () => {
            const handler = jest.fn();
            remoteHandler.registerLongPress('ok', handler);

            dispatchKeyEvent(13, 'keydown');

            // Wait for long press threshold
            await wait(LONG_PRESS_THRESHOLD_MS + 100);

            expect(handler).toHaveBeenCalled();

            // Clean up
            dispatchKeyEvent(13, 'keyup');
        });

        it('should not trigger long press on quick tap', async () => {
            const handler = jest.fn();
            remoteHandler.registerLongPress('ok', handler);

            dispatchKeyEvent(13, 'keydown');
            await wait(100); // Less than threshold
            dispatchKeyEvent(13, 'keyup');

            await wait(LONG_PRESS_THRESHOLD_MS);

            expect(handler).not.toHaveBeenCalled();
        });

        it('should cancel long press', async () => {
            const handler = jest.fn();
            remoteHandler.registerLongPress('ok', handler);

            dispatchKeyEvent(13, 'keydown');
            await wait(100);
            remoteHandler.cancelLongPress();

            await wait(LONG_PRESS_THRESHOLD_MS);

            expect(handler).not.toHaveBeenCalled();

            dispatchKeyEvent(13, 'keyup');
        });

        it('should emit longPress event', async () => {
            const handler = jest.fn();
            remoteHandler.on('longPress', handler);
            remoteHandler.registerLongPress('ok', () => { });

            dispatchKeyEvent(13, 'keydown');
            await wait(LONG_PRESS_THRESHOLD_MS + 100);

            expect(handler).toHaveBeenCalledWith({ button: 'ok' });

            dispatchKeyEvent(13, 'keyup');
        });

        it('should report wasLongPress=true in keyUp after long press', async () => {
            const keyUpHandler = jest.fn();
            remoteHandler.on('keyUp', keyUpHandler);
            remoteHandler.registerLongPress('ok', () => { });

            dispatchKeyEvent(13, 'keydown');
            await wait(LONG_PRESS_THRESHOLD_MS + 100);
            dispatchKeyEvent(13, 'keyup');

            expect(keyUpHandler).toHaveBeenCalledWith(
                expect.objectContaining({ wasLongPress: true })
            );
        });
    });

    describe('initialization and cleanup', () => {
        it('should not emit events after destroy', () => {
            const handler = jest.fn();
            remoteHandler.on('keyDown', handler);

            remoteHandler.destroy();
            dispatchKeyEvent(13, 'keydown');

            expect(handler).not.toHaveBeenCalled();
        });

        it('should not double-initialize', () => {
            // First init already done in beforeEach
            remoteHandler.initialize(false); // Should be no-op

            const handler = jest.fn();
            remoteHandler.on('keyDown', handler);

            dispatchKeyEvent(13, 'keydown');

            // Should only be called once
            expect(handler).toHaveBeenCalledTimes(1);
        });
    });
});
