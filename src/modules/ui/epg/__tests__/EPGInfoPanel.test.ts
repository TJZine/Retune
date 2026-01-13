/**
 * @jest-environment jsdom
 */
/**
 * @fileoverview EPG Info Panel unit tests
 * @module modules/ui/epg/__tests__/EPGInfoPanel.test
 */

import { EPGInfoPanel } from '../EPGInfoPanel';
import type { ScheduledProgram } from '../types';

describe('EPGInfoPanel', () => {
    let panel: EPGInfoPanel;
    let container: HTMLElement;

    const createMockProgram = (thumbPath: string | null): ScheduledProgram => ({
        item: {
            ratingKey: 'test-1',
            type: 'movie',
            title: 'Test Movie',
            fullTitle: 'Test Movie',
            durationMs: 7200000,
            thumb: thumbPath,
            year: 2024,
            scheduledIndex: 0,
        },
        scheduledStartTime: Date.now(),
        scheduledEndTime: Date.now() + 7200000,
        elapsedMs: 0,
        remainingMs: 7200000,
        scheduleIndex: 0,
        loopNumber: 0,
        streamDescriptor: null,
        isCurrent: true,
    });

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);

        panel = new EPGInfoPanel();
        panel.initialize(container);
    });

    afterEach(() => {
        panel.destroy();
        container.remove();
    });

    describe('thumb resolver', () => {
        it('should call resolver callback for relative Plex paths', () => {
            const resolver = jest.fn().mockReturnValue('https://server/library/thumb?token=xxx');
            panel.setThumbResolver(resolver);

            const program = createMockProgram('/library/metadata/123/thumb');
            panel.show(program);

            expect(resolver).toHaveBeenCalledWith('/library/metadata/123/thumb');
            const poster = container.querySelector('.epg-info-poster') as HTMLImageElement;
            expect(poster.src).toBe('https://server/library/thumb?token=xxx');
            expect(poster.style.display).toBe('block');
        });

        it('should hide poster when resolver returns null', () => {
            const resolver = jest.fn().mockReturnValue(null);
            panel.setThumbResolver(resolver);

            const program = createMockProgram('/library/metadata/123/thumb');
            panel.show(program);

            expect(resolver).toHaveBeenCalled();
            const poster = container.querySelector('.epg-info-poster') as HTMLImageElement;
            expect(poster.style.display).toBe('none');
        });

        it('should hide poster when thumb is null', () => {
            const resolver = jest.fn();
            panel.setThumbResolver(resolver);

            const program = createMockProgram(null);
            panel.show(program);

            expect(resolver).toHaveBeenCalledWith(null);
            const poster = container.querySelector('.epg-info-poster') as HTMLImageElement;
            expect(poster.style.display).toBe('none');
        });

        it('should hide poster when no resolver is set', () => {
            // No resolver set - should hide poster rather than assign raw path
            const program = createMockProgram('/library/metadata/123/thumb');
            panel.show(program);

            const poster = container.querySelector('.epg-info-poster') as HTMLImageElement;
            expect(poster.style.display).toBe('none');
        });

        it('should pass through absolute URLs via resolver', () => {
            const resolver = jest.fn().mockImplementation((url: string | null) => url);
            panel.setThumbResolver(resolver);

            const program = createMockProgram('https://plex.tv/photo/abc123');
            panel.show(program);

            expect(resolver).toHaveBeenCalledWith('https://plex.tv/photo/abc123');
            const poster = container.querySelector('.epg-info-poster') as HTMLImageElement;
            expect(poster.src).toBe('https://plex.tv/photo/abc123');
            expect(poster.style.display).toBe('block');
        });
    });

    describe('lifecycle', () => {
        it('should initialize without errors', () => {
            expect(panel.getIsVisible()).toBe(false);
        });

        it('should show and hide correctly', () => {
            const program = createMockProgram(null);
            panel.show(program);
            expect(panel.getIsVisible()).toBe(true);

            panel.hide();
            expect(panel.getIsVisible()).toBe(false);
        });

        it('should display program title', () => {
            const program = createMockProgram(null);
            panel.show(program);

            const title = container.querySelector('.epg-info-title');
            expect(title?.textContent).toBe('Test Movie');
        });
    });
});
