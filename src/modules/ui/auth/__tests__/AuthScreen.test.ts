/**
 * @jest-environment jsdom
 */

import { AuthScreen } from '../AuthScreen';

describe('AuthScreen', () => {
    it('hide() should stop elapsed timer and invalidate polling token', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        const orchestrator = {
            requestAuthPin: jest.fn(),
            pollForPin: jest.fn(),
            cancelPin: jest.fn(),
            getNavigation: jest.fn(() => null),
        } as unknown as { [key: string]: unknown };

        const screen = new AuthScreen(container, orchestrator as unknown as never);

        const screenAny = screen as unknown as { _pollToken: number; _elapsedTimer: number | null };
        screenAny._pollToken = 41;
        screenAny._elapsedTimer = window.setInterval(() => undefined, 1000);

        screen.hide();

        expect(screenAny._elapsedTimer).toBeNull();
        expect(screenAny._pollToken).toBe(42);

        container.remove();
    });
});
