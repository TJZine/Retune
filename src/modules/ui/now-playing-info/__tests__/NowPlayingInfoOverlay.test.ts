/**
 * @jest-environment jsdom
 */
/**
 * @fileoverview Now Playing Info overlay unit tests
 * @module modules/ui/now-playing-info/__tests__/NowPlayingInfoOverlay.test
 */

import { NowPlayingInfoOverlay } from '../NowPlayingInfoOverlay';
import type { NowPlayingInfoConfig, NowPlayingInfoViewModel } from '../types';

describe('NowPlayingInfoOverlay', () => {
    let overlay: NowPlayingInfoOverlay;
    let container: HTMLElement;

    const baseViewModel: NowPlayingInfoViewModel = {
        title: 'Test Movie',
        subtitle: 'PG-13 • 2h 10m',
        description: 'A test description of the movie.',
        channelNumber: 12,
        channelName: 'Test Channel',
        elapsedMs: 60_000,
        durationMs: 120_000,
        posterUrl: 'https://example.com/poster.jpg',
    };

    beforeEach(() => {
        container = document.createElement('div');
        container.id = 'now-playing-info-container';
        document.body.appendChild(container);
        overlay = new NowPlayingInfoOverlay();
        const config: NowPlayingInfoConfig = { containerId: 'now-playing-info-container', autoHideMs: 5000 };
        overlay.initialize(config);
    });

    afterEach(() => {
        overlay.destroy();
        container.remove();
    });

    it('should initialize hidden', () => {
        expect(overlay.isVisible()).toBe(false);
        expect(container.classList.contains('visible')).toBe(false);
    });

    it('should show and hide correctly', () => {
        overlay.show(baseViewModel);
        expect(overlay.isVisible()).toBe(true);
        expect(container.classList.contains('visible')).toBe(true);

        overlay.hide();
        expect(overlay.isVisible()).toBe(false);
        expect(container.classList.contains('visible')).toBe(false);
    });

    it('should populate text fields', () => {
        overlay.show(baseViewModel);
        expect(container.querySelector('.now-playing-info-title')?.textContent).toBe('Test Movie');
        expect(container.querySelector('.now-playing-info-subtitle')?.textContent).toBe('PG-13 • 2h 10m');
        expect(container.querySelector('.now-playing-info-description')?.textContent).toBe('A test description of the movie.');
        expect(container.querySelector('.now-playing-info-context')?.textContent).toBe('12 Test Channel');
    });

    it('should show up next when provided', () => {
        const viewModel: NowPlayingInfoViewModel = {
            ...baseViewModel,
            upNext: { title: 'Next Thing', startsAtMs: Date.now() + 60_000 },
        };
        overlay.show(viewModel);
        const upNext = container.querySelector('.now-playing-info-up-next') as HTMLElement;
        expect(upNext.style.display).toBe('block');
        expect(upNext.textContent).toContain('Up next');
        expect(upNext.textContent).toContain('Next Thing');
    });

    it('should hide up next when missing', () => {
        overlay.show(baseViewModel);
        const upNext = container.querySelector('.now-playing-info-up-next') as HTMLElement;
        expect(upNext.style.display).toBe('none');
    });

    it('should render quality badges when provided', () => {
        overlay.show({ ...baseViewModel, badges: ['4K', 'HDR', 'DD+'] });
        const badges = Array.from(container.querySelectorAll('.now-playing-info-badge'));
        const texts = badges.map((badge) => badge.textContent);
        expect(texts).toEqual(['4K', 'HDR', 'DD+']);
    });

    it('should render actor headshots when provided', () => {
        overlay.show({
            ...baseViewModel,
            actorHeadshots: [
                { name: 'Actor A', url: 'https://example.com/a.jpg' },
                { name: 'Actor B', url: null },
            ],
            actorMoreCount: 2,
        });
        const actorsRow = container.querySelector('.now-playing-info-actors') as HTMLElement;
        const actorItems = Array.from(
            container.querySelectorAll('.now-playing-info-actor')
        ) as HTMLElement[];
        const images = Array.from(
            container.querySelectorAll('.now-playing-info-actor-image')
        ) as HTMLImageElement[];
        const more = container.querySelector('.now-playing-info-actor-more') as HTMLElement;
        expect(actorsRow.style.display).toBe('flex');
        expect(images[0]?.getAttribute('src')).toBe('https://example.com/a.jpg');
        expect(actorItems[1]?.classList.contains('fallback')).toBe(true);
        expect(actorItems[1]?.textContent).toBe('AB');
        expect(more.textContent).toBe('+2');
    });

    it('should hide actor headshots when missing', () => {
        overlay.show(baseViewModel);
        const actorsRow = container.querySelector('.now-playing-info-actors') as HTMLElement;
        expect(actorsRow.style.display).toBe('none');
    });

    it('should hide poster when no URL is provided', () => {
        overlay.show({ ...baseViewModel, posterUrl: null });
        const poster = container.querySelector('.now-playing-info-poster') as HTMLImageElement;
        expect(poster.style.display).toBe('none');
    });

    it('should hide description when empty', () => {
        overlay.show({ ...baseViewModel, description: '' });
        const description = container.querySelector('.now-playing-info-description') as HTMLElement;
        expect(description.style.display).toBe('none');
    });

    it('should hide progress when duration is missing', () => {
        const viewModel: NowPlayingInfoViewModel = {
            title: baseViewModel.title,
            subtitle: baseViewModel.subtitle ?? 'PG-13 • 2h 10m',
            description: baseViewModel.description ?? 'A test description of the movie.',
            channelNumber: baseViewModel.channelNumber ?? 12,
            channelName: baseViewModel.channelName ?? 'Test Channel',
            elapsedMs: baseViewModel.elapsedMs ?? 60_000,
            posterUrl: baseViewModel.posterUrl ?? null,
        };
        overlay.show(viewModel);
        const progress = container.querySelector('.now-playing-info-progress') as HTMLElement;
        expect(progress.style.display).toBe('flex');
        expect(container.querySelector('.now-playing-info-progress-meta')?.textContent).toBe('Live');
    });

    it('should auto-hide after configured timeout', () => {
        jest.useFakeTimers();
        overlay.show(baseViewModel);
        expect(overlay.isVisible()).toBe(true);
        jest.advanceTimersByTime(5000);
        expect(overlay.isVisible()).toBe(false);
        jest.useRealTimers();
    });

    it('should call onAutoHide handler when set', () => {
        jest.useFakeTimers();
        const onAutoHide = jest.fn();
        overlay.setOnAutoHide(onAutoHide);
        overlay.show(baseViewModel);
        jest.advanceTimersByTime(5000);
        expect(onAutoHide).toHaveBeenCalledTimes(1);
        expect(overlay.isVisible()).toBe(true);
        overlay.hide();
        jest.useRealTimers();
    });
});
