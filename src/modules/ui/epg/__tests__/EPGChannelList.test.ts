/**
 * @jest-environment jsdom
 */
/**
 * @fileoverview EPG Channel List unit tests
 * @module modules/ui/epg/__tests__/EPGChannelList.test
 */

import { EPGChannelList } from '../EPGChannelList';
import type { ChannelConfig, EPGConfig } from '../types';

describe('EPGChannelList', () => {
    const createMockChannel = (index: number): ChannelConfig => ({
        id: `ch${index}`,
        number: index + 1,
        name: `Channel ${index + 1}`,
        contentSource: { type: 'manual', items: [] },
        playbackMode: 'sequential',
        filters: [],
        skipIntros: false,
        skipCredits: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastContentRefresh: Date.now(),
        itemCount: 10,
        totalDurationMs: 36000000,
        startTimeAnchor: Date.now(),
    } as ChannelConfig);

    const createConfig = (overrides?: Partial<EPGConfig>): EPGConfig => ({
        containerId: 'epg-container',
        visibleChannels: 4,
        timeSlotMinutes: 30,
        visibleHours: 3,
        totalHours: 24,
        pixelsPerMinute: 4,
        rowHeight: 80,
        showCurrentTimeIndicator: true,
        autoScrollToNow: false,
        ...overrides,
    });

    let parent: HTMLElement;

    beforeEach(() => {
        parent = document.createElement('div');
        document.body.appendChild(parent);
    });

    afterEach(() => {
        parent.remove();
    });

    it('updates the inner wrapper transform without touching the container transform', () => {
        const list = new EPGChannelList();
        const config = createConfig({ rowHeight: 72, visibleChannels: 5 });

        list.initialize(parent, config);
        list.updateChannels(Array.from({ length: 20 }, (_, i) => createMockChannel(i)));
        list.updateScrollPosition(5);

        const container = parent.querySelector('.epg-channel-list') as HTMLElement;
        const content = container.firstElementChild as HTMLElement;

        expect(container.style.transform).toBe('');
        expect(content.style.transform).toBe('translateY(-360px)');
    });

    it('virtualizes rows and maps names for a scrolled offset', () => {
        const list = new EPGChannelList();
        const config = createConfig({ rowHeight: 50, visibleChannels: 4 });

        list.initialize(parent, config);
        list.updateChannels(Array.from({ length: 20 }, (_, i) => createMockChannel(i)));
        list.updateScrollPosition(12);

        const rows = parent.querySelectorAll('.epg-channel-row');
        expect(rows.length).toBeLessThan(20);

        const row = parent.querySelector('[data-channel-index="12"]') as HTMLElement;
        expect(row).not.toBeNull();
        const name = row.querySelector('.epg-channel-name');
        expect(name?.textContent).toBe('Channel 13');
    });
});
