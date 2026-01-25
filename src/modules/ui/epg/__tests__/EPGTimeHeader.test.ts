/**
 * @jest-environment jsdom
 */
/**
 * @fileoverview EPG Time Header unit tests
 * @module modules/ui/epg/__tests__/EPGTimeHeader.test
 */

import { EPGTimeHeader } from '../EPGTimeHeader';
import { EPG_CLASSES } from '../constants';
import type { EPGConfig } from '../types';

describe('EPGTimeHeader', () => {
    let container: HTMLElement;
    let timeHeader: EPGTimeHeader;
    let config: EPGConfig;
    const gridAnchorTime = new Date('2026-01-07T00:00:00').getTime();

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        config = {
            containerId: 'test-container',
            visibleChannels: 5,
            timeSlotMinutes: 30,
            visibleHours: 3,
            totalHours: 24,
            pixelsPerMinute: 4,
            autoFitPixelsPerMinute: false,
            rowHeight: 80,
            showCurrentTimeIndicator: true,
            autoScrollToNow: false,
        };
        timeHeader = new EPGTimeHeader();
        timeHeader.initialize(container, config, gridAnchorTime);
    });

    afterEach(() => {
        timeHeader.destroy();
        container.remove();
    });

    it('keeps container stationary and updates sticky label on scroll', () => {
        timeHeader.updateScrollPosition(60);

        const header = container.querySelector(`.${EPG_CLASSES.TIME_HEADER}`) as HTMLElement;
        const slots = container.querySelector(`.${EPG_CLASSES.TIME_HEADER_SLOTS}`) as HTMLElement;
        const sticky = container.querySelector(`.${EPG_CLASSES.TIME_HEADER_STICKY}`) as HTMLElement;

        expect(header).not.toBeNull();
        expect(slots).not.toBeNull();
        expect(sticky).not.toBeNull();
        expect(slots.style.transform).toContain('translateX(');
        expect(header.style.transform).toBe('');
        expect(sticky.textContent).toBe('1:00 AM');
    });
});
