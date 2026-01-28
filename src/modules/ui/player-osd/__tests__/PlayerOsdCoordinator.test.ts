import { PlayerOsdCoordinator } from '../PlayerOsdCoordinator';
import type { IPlayerOsdOverlay } from '../interfaces';
import type { IVideoPlayer } from '../../../player';
import type { PlaybackState } from '../../../player/types';
import type { ChannelConfig } from '../../../scheduler/channel-manager';
import type { ScheduledProgram } from '../../../scheduler/scheduler';

const AUTO_HIDE_MS = 3000;

const makeState = (status: PlaybackState['status']): PlaybackState => ({
    status,
    currentTimeMs: 0,
    durationMs: 100_000,
    bufferPercent: 0,
    volume: 1,
    isMuted: false,
    playbackRate: 1,
    activeSubtitleId: null,
    activeAudioId: null,
    errorInfo: null,
});

const makeOverlay = (): IPlayerOsdOverlay & { _visible: boolean } => {
    const overlay = {
        _visible: false,
        initialize: jest.fn(),
        destroy: jest.fn(),
        show: jest.fn(() => {
            overlay._visible = true;
        }),
        hide: jest.fn(() => {
            overlay._visible = false;
        }),
        isVisible: jest.fn(() => overlay._visible),
        setViewModel: jest.fn(),
    } as unknown as IPlayerOsdOverlay & { _visible: boolean };
    return overlay;
};

const makeProgram = (): ScheduledProgram => ({
    item: {
        ratingKey: 'rk1',
        title: 'Program Title',
        fullTitle: 'Program Title',
        type: 'movie',
        durationMs: 100_000,
        thumb: null,
        year: 2024,
        scheduledIndex: 0,
    } as ScheduledProgram['item'],
    scheduledStartTime: Date.now() - 10_000,
    scheduledEndTime: Date.now() + 90_000,
    elapsedMs: 10_000,
    remainingMs: 90_000,
    scheduleIndex: 0,
    loopNumber: 0,
    streamDescriptor: null,
    isCurrent: true,
});

const makeChannel = (): ChannelConfig => ({
    id: 'ch1',
    name: 'Channel 1',
    number: 1,
} as ChannelConfig);

const setup = (): {
    coordinator: PlayerOsdCoordinator;
    overlay: IPlayerOsdOverlay & { _visible: boolean };
    videoPlayer: IVideoPlayer;
} => {
    const overlay = makeOverlay();
    const videoPlayer = {
        getState: jest.fn(() => makeState('playing')),
    } as unknown as IVideoPlayer;

    const coordinator = new PlayerOsdCoordinator({
        getOverlay: (): IPlayerOsdOverlay => overlay,
        getCurrentProgram: (): ScheduledProgram => makeProgram(),
        getNextProgram: (): ScheduledProgram | null => null,
        getCurrentChannel: (): ChannelConfig => makeChannel(),
        getVideoPlayer: (): IVideoPlayer => videoPlayer,
        getAutoHideMs: (): number => AUTO_HIDE_MS,
    });

    return { coordinator, overlay, videoPlayer };
};

describe('PlayerOsdCoordinator', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(0);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('pause shows and stays visible', () => {
        const { coordinator, overlay } = setup();

        coordinator.onPlayerStateChange(makeState('paused'));

        expect(overlay.show).toHaveBeenCalled();
        jest.advanceTimersByTime(AUTO_HIDE_MS * 2);
        expect(overlay.hide).not.toHaveBeenCalled();
    });

    it('play after poke auto-hides', () => {
        const { coordinator, overlay } = setup();

        coordinator.poke('play');
        coordinator.onPlayerStateChange(makeState('playing'));

        jest.advanceTimersByTime(AUTO_HIDE_MS - 1);
        expect(overlay.hide).not.toHaveBeenCalled();

        jest.advanceTimersByTime(1);
        expect(overlay.hide).toHaveBeenCalled();
    });

    it('timeUpdate ignored when hidden', () => {
        const { coordinator, overlay } = setup();
        overlay._visible = false;

        coordinator.onTimeUpdate({ currentTimeMs: 1000, durationMs: 10_000 });

        expect(overlay.setViewModel).not.toHaveBeenCalled();
    });

    it('includes up next when available and not live', () => {
        const overlay = makeOverlay();
        const nextProgram = {
            ...makeProgram(),
            scheduledStartTime: 60_000,
            item: { ...makeProgram().item, title: 'Next Program' },
        } as ScheduledProgram;
        const videoPlayer = {
            getState: jest.fn(() => makeState('playing')),
        } as unknown as IVideoPlayer;
        const coordinator = new PlayerOsdCoordinator({
            getOverlay: (): IPlayerOsdOverlay => overlay,
            getCurrentProgram: (): ScheduledProgram => makeProgram(),
            getNextProgram: (): ScheduledProgram | null => nextProgram,
            getCurrentChannel: (): ChannelConfig => makeChannel(),
            getVideoPlayer: (): IVideoPlayer => videoPlayer,
            getAutoHideMs: (): number => AUTO_HIDE_MS,
        });

        coordinator.onPlayerStateChange(makeState('playing'));

        const viewModel = (overlay.setViewModel as jest.Mock).mock.calls[0]?.[0] as {
            upNextText?: string;
        };
        const expectedTime = new Intl.DateTimeFormat(undefined, {
            hour: 'numeric',
            minute: '2-digit',
        }).format(new Date(60_000));
        expect(viewModel.upNextText).toBe(`Up next • ${expectedTime} — Next Program`);
    });

    it('omits up next when playback is live', () => {
        const overlay = makeOverlay();
        const nextProgram = {
            ...makeProgram(),
            scheduledStartTime: 60_000,
            item: { ...makeProgram().item, title: 'Next Program' },
        } as ScheduledProgram;
        const videoPlayer = {
            getState: jest.fn(() => ({ ...makeState('playing'), durationMs: 0 })),
        } as unknown as IVideoPlayer;
        const coordinator = new PlayerOsdCoordinator({
            getOverlay: (): IPlayerOsdOverlay => overlay,
            getCurrentProgram: (): ScheduledProgram => makeProgram(),
            getNextProgram: (): ScheduledProgram | null => nextProgram,
            getCurrentChannel: (): ChannelConfig => makeChannel(),
            getVideoPlayer: (): IVideoPlayer => videoPlayer,
            getAutoHideMs: (): number => AUTO_HIDE_MS,
        });

        coordinator.poke('play');

        const viewModel = (overlay.setViewModel as jest.Mock).mock.calls[0]?.[0] as {
            upNextText?: string;
        };
        expect(viewModel.upNextText).toBeUndefined();
    });
});
