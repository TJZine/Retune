/**
 * @jest-environment jsdom
 */
/**
 * @fileoverview Player OSD overlay unit tests.
 * @module modules/ui/player-osd/__tests__/PlayerOsdOverlay.test
 */

import { PlayerOsdOverlay } from '../PlayerOsdOverlay';
import type { PlayerOsdConfig, PlayerOsdViewModel } from '../types';

describe('PlayerOsdOverlay', () => {
    let overlay: PlayerOsdOverlay;
    let container: HTMLElement;

    const baseViewModel: PlayerOsdViewModel = {
        reason: 'status',
        statusLabel: 'PLAYING',
        channelPrefix: '12 Comedy',
        title: 'Test Title',
        subtitle: 'Test Subtitle',
        isLive: false,
        currentTimeMs: 10_000,
        durationMs: 100_000,
        playedRatio: 0.1,
        bufferedRatio: 0.4,
        timecode: '0:10 / 1:40',
        endsAtText: 'Ends 9:15 PM',
        bufferText: 'Buffer +30s',
    };

    beforeEach(() => {
        container = document.createElement('div');
        container.id = 'player-osd-container';
        document.body.appendChild(container);
        overlay = new PlayerOsdOverlay();
        const config: PlayerOsdConfig = { containerId: 'player-osd-container' };
        overlay.initialize(config);
    });

    afterEach(() => {
        overlay.destroy();
        container.remove();
    });

    it('initializes hidden', () => {
        expect(overlay.isVisible()).toBe(false);
        expect(container.classList.contains('visible')).toBe(false);
    });

    it('shows and hides', () => {
        overlay.setViewModel(baseViewModel);
        overlay.show();
        expect(overlay.isVisible()).toBe(true);
        expect(container.classList.contains('visible')).toBe(true);

        overlay.hide();
        expect(overlay.isVisible()).toBe(false);
        expect(container.classList.contains('visible')).toBe(false);
    });

    it('renders text and progress values', () => {
        overlay.setViewModel(baseViewModel);
        overlay.show();

        expect(container.querySelector('.player-osd-status')?.textContent).toBe('PLAYING');
        expect(container.querySelector('.player-osd-channel')?.textContent).toBe('12 Comedy');
        expect(container.querySelector('.player-osd-title')?.textContent).toBe('Test Title');
        expect(container.querySelector('.player-osd-subtitle')?.textContent).toBe('Test Subtitle');
        expect(container.querySelector('.player-osd-timecode')?.textContent).toBe('0:10 / 1:40');
        expect(container.querySelector('.player-osd-ends')?.textContent).toBe('Ends 9:15 PM');
        expect(container.querySelector('.player-osd-buffertext')?.textContent).toBe('Buffer +30s');

        const played = container.querySelector('.player-osd-bar-played') as HTMLElement;
        const buffered = container.querySelector('.player-osd-bar-buffer') as HTMLElement;
        expect(parseFloat(played.style.width)).toBeCloseTo(10, 2);
        expect(parseFloat(buffered.style.width)).toBeCloseTo(40, 2);
    });

    it('hides optional fields when missing', () => {
        overlay.setViewModel({
            ...baseViewModel,
            channelPrefix: '',
            subtitle: null,
            endsAtText: null,
            bufferText: null,
        });
        overlay.show();

        expect((container.querySelector('.player-osd-channel') as HTMLElement).style.display).toBe('none');
        expect((container.querySelector('.player-osd-subtitle') as HTMLElement).style.display).toBe('none');
        expect((container.querySelector('.player-osd-ends') as HTMLElement).style.display).toBe('none');
        expect((container.querySelector('.player-osd-buffertext') as HTMLElement).style.display).toBe('none');
    });
});
