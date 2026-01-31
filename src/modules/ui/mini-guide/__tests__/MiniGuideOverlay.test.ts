/**
 * @jest-environment jsdom
 */
/**
 * @fileoverview Mini Guide overlay unit tests.
 * @module modules/ui/mini-guide/__tests__/MiniGuideOverlay.test
 */

import { MiniGuideOverlay } from '../MiniGuideOverlay';
import { MINI_GUIDE_CLASSES } from '../constants';
import type { MiniGuideConfig, MiniGuideViewModel } from '../types';

const makeViewModel = (): MiniGuideViewModel => ({
    channels: [
        {
            channelId: 'ch1',
            channelNumber: 1,
            channelName: 'Channel One',
            nowTitle: 'Now One',
            nextTitle: 'Next One',
            nowProgress: 0.25,
        },
        {
            channelId: 'ch2',
            channelNumber: 2,
            channelName: 'Channel Two',
            nowTitle: 'Now Two',
            nextTitle: null,
            nowProgress: 0.5,
        },
        {
            channelId: 'ch3',
            channelNumber: 3,
            channelName: 'Channel Three',
            nowTitle: 'Now Three',
            nextTitle: 'Next Three',
            nowProgress: 1,
        },
    ],
});

describe('MiniGuideOverlay', () => {
    let overlay: MiniGuideOverlay;
    let container: HTMLElement;

    beforeEach(() => {
        container = document.createElement('div');
        container.id = 'mini-guide-container';
        document.body.appendChild(container);
        overlay = new MiniGuideOverlay();
        const config: MiniGuideConfig = { containerId: 'mini-guide-container' };
        overlay.initialize(config);
    });

    afterEach(() => {
        overlay.destroy();
        container.remove();
    });

    it('initializes hidden', () => {
        expect(overlay.isVisible()).toBe(false);
        expect(container.classList.contains(MINI_GUIDE_CLASSES.VISIBLE)).toBe(false);
    });

    it('shows and hides', () => {
        overlay.setViewModel(makeViewModel());
        overlay.show();
        expect(overlay.isVisible()).toBe(true);
        expect(container.classList.contains(MINI_GUIDE_CLASSES.VISIBLE)).toBe(true);

        overlay.hide();
        expect(overlay.isVisible()).toBe(false);
        expect(container.classList.contains(MINI_GUIDE_CLASSES.VISIBLE)).toBe(false);
    });

    it('renders text and progress values', () => {
        const vm = makeViewModel();
        overlay.setViewModel(vm);
        overlay.show();

        expect(document.getElementById('mini-guide-num-0')?.textContent).toBe('1');
        expect(document.getElementById('mini-guide-name-0')?.textContent).toBe('Channel One');
        expect(document.getElementById('mini-guide-now-0')?.textContent).toBe('Now One');
        expect(document.getElementById('mini-guide-next-0')?.textContent).toBe('Next One');

        const progress0 = document.getElementById('mini-guide-progress-0') as HTMLElement;
        const progress1 = document.getElementById('mini-guide-progress-1') as HTMLElement;
        const progress2 = document.getElementById('mini-guide-progress-2') as HTMLElement;
        expect(parseFloat(progress0.style.width)).toBeCloseTo(25, 1);
        expect(parseFloat(progress1.style.width)).toBeCloseTo(50, 1);
        expect(parseFloat(progress2.style.width)).toBeCloseTo(100, 1);

        const next1 = document.getElementById('mini-guide-next-1') as HTMLElement;
        expect(next1.style.display).toBe('none');
    });

    it('toggles focused row class', () => {
        overlay.setViewModel(makeViewModel());
        overlay.show();

        overlay.setFocusedIndex(1);
        expect(document.getElementById('mini-guide-row-1')?.classList.contains('focused')).toBe(true);
        expect(document.getElementById('mini-guide-row-0')?.classList.contains('focused')).toBe(false);

        overlay.setFocusedIndex(2);
        expect(document.getElementById('mini-guide-row-2')?.classList.contains('focused')).toBe(true);
        expect(document.getElementById('mini-guide-row-1')?.classList.contains('focused')).toBe(false);
    });

    it('destroy clears DOM and visibility', () => {
        overlay.setViewModel(makeViewModel());
        overlay.show();
        overlay.setFocusedIndex(1);

        overlay.destroy();

        expect(container.innerHTML).toBe('');
        expect(container.classList.contains(MINI_GUIDE_CLASSES.VISIBLE)).toBe(false);
        expect(document.querySelectorAll('.mini-guide-row.focused').length).toBe(0);
    });
});
