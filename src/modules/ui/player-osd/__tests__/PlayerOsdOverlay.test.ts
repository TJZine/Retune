/**
 * @jest-environment jsdom
 */
/**
 * @fileoverview Player OSD overlay unit tests.
 * @module modules/ui/player-osd/__tests__/PlayerOsdOverlay.test
 */

import { PlayerOsdOverlay } from '../PlayerOsdOverlay';
import { PLAYER_OSD_CLASSES } from '../constants';
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
        playbackText: 'Direct Play • H.264/AAC • 1080p',
        actionIds: {
            subtitles: 'player-osd-action-subtitles',
            audio: 'player-osd-action-audio',
        },
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
        expect(container.classList.contains(PLAYER_OSD_CLASSES.VISIBLE)).toBe(false);
    });

    it('shows and hides', () => {
        overlay.setViewModel(baseViewModel);
        overlay.show();
        expect(overlay.isVisible()).toBe(true);
        expect(container.classList.contains(PLAYER_OSD_CLASSES.VISIBLE)).toBe(true);

        overlay.hide();
        expect(overlay.isVisible()).toBe(false);
        expect(container.classList.contains(PLAYER_OSD_CLASSES.VISIBLE)).toBe(false);
    });

    it('renders text and progress values', () => {
        overlay.setViewModel({ ...baseViewModel, upNextText: 'Up next • 9:30 PM — Next' });
        overlay.show();

        expect(container.querySelector(`.${PLAYER_OSD_CLASSES.STATUS}`)?.textContent).toBe('PLAYING');
        expect(container.querySelector(`.${PLAYER_OSD_CLASSES.CHANNEL}`)?.textContent).toBe('12 Comedy');
        expect(container.querySelector(`.${PLAYER_OSD_CLASSES.TITLE}`)?.textContent).toBe('Test Title');
        expect(container.querySelector(`.${PLAYER_OSD_CLASSES.SUBTITLE}`)?.textContent).toBe('Test Subtitle');
        expect(container.querySelector(`.${PLAYER_OSD_CLASSES.UP_NEXT}`)?.textContent).toBe(
            'Up next • 9:30 PM — Next'
        );
        expect(container.querySelector(`.${PLAYER_OSD_CLASSES.TIMECODE}`)?.textContent).toBe('0:10 / 1:40');
        expect(container.querySelector(`.${PLAYER_OSD_CLASSES.ENDS}`)?.textContent).toBe('Ends 9:15 PM');
        expect(container.querySelector(`.${PLAYER_OSD_CLASSES.BUFFER_TEXT}`)?.textContent).toBe('Buffer +30s');
        expect(container.querySelector(`.${PLAYER_OSD_CLASSES.PLAYBACK_TAG}`)?.textContent).toBe(
            'Direct Play • H.264/AAC • 1080p'
        );
        expect(
            (container.querySelector(`.${PLAYER_OSD_CLASSES.ACTION}[data-action="subtitles"]`) as HTMLElement).id
        ).toBe('player-osd-action-subtitles');
        expect(
            (container.querySelector(`.${PLAYER_OSD_CLASSES.ACTION}[data-action="audio"]`) as HTMLElement).id
        ).toBe('player-osd-action-audio');

        const played = container.querySelector(`.${PLAYER_OSD_CLASSES.BAR_PLAYED}`) as HTMLElement;
        const buffered = container.querySelector(`.${PLAYER_OSD_CLASSES.BAR_BUFFER}`) as HTMLElement;
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
            upNextText: null,
        });
        overlay.show();

        expect((container.querySelector(`.${PLAYER_OSD_CLASSES.CHANNEL}`) as HTMLElement).style.display).toBe('none');
        expect((container.querySelector(`.${PLAYER_OSD_CLASSES.SUBTITLE}`) as HTMLElement).style.display).toBe('none');
        expect((container.querySelector(`.${PLAYER_OSD_CLASSES.UP_NEXT}`) as HTMLElement).style.display).toBe('none');
        expect((container.querySelector(`.${PLAYER_OSD_CLASSES.ENDS}`) as HTMLElement).style.display).toBe('none');
        expect((container.querySelector(`.${PLAYER_OSD_CLASSES.BUFFER_TEXT}`) as HTMLElement).style.display).toBe(
            'none'
        );
    });

    it('clears action IDs when view model omits them', () => {
        overlay.setViewModel(baseViewModel);
        overlay.show();

        const withoutActionIds = { ...baseViewModel } as PlayerOsdViewModel;
        delete (withoutActionIds as Partial<PlayerOsdViewModel>).actionIds;
        overlay.setViewModel(withoutActionIds);

        expect(
            (container.querySelector(`.${PLAYER_OSD_CLASSES.ACTION}[data-action="subtitles"]`) as HTMLElement).id
        ).toBe('');
        expect(
            (container.querySelector(`.${PLAYER_OSD_CLASSES.ACTION}[data-action="audio"]`) as HTMLElement).id
        ).toBe('');
    });
});
