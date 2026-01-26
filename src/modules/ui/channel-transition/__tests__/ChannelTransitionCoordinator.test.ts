import { ChannelTransitionCoordinator } from '../ChannelTransitionCoordinator';
import { CHANNEL_TRANSITION_SHOW_DELAY_MS } from '../constants';
import type { IChannelTransitionOverlay } from '../interfaces';
import type { INavigationManager, Screen } from '../../../navigation';
import type { IVideoPlayer } from '../../../player';
import type { PlaybackState } from '../../../player/types';

const makeState = (status: PlaybackState['status']): PlaybackState => ({
    status,
    currentTimeMs: 0,
    durationMs: 0,
    bufferPercent: 0,
    volume: 1,
    isMuted: false,
    playbackRate: 1,
    activeSubtitleId: null,
    activeAudioId: null,
    errorInfo: null,
});

const makeOverlay = (): IChannelTransitionOverlay & { _visible: boolean } => {
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
    } as unknown as IChannelTransitionOverlay & { _visible: boolean };
    return overlay;
};

const makeNavigation = (overrides: Partial<INavigationManager> = {}): INavigationManager =>
    ({
        getCurrentScreen: jest.fn().mockReturnValue('player' as Screen),
        isModalOpen: jest.fn().mockReturnValue(false),
        ...overrides,
    } as unknown as INavigationManager);

const setup = (state: PlaybackState): {
    coordinator: ChannelTransitionCoordinator;
    overlay: IChannelTransitionOverlay & { _visible: boolean };
    navigation: INavigationManager;
    videoPlayer: IVideoPlayer;
} => {
    const overlay = makeOverlay();
    const navigation = makeNavigation();
    const videoPlayer = {
        getState: jest.fn(() => state),
    } as unknown as IVideoPlayer;

    const coordinator = new ChannelTransitionCoordinator({
        getOverlay: (): IChannelTransitionOverlay => overlay,
        getNavigation: (): INavigationManager => navigation,
        getVideoPlayer: (): IVideoPlayer => videoPlayer,
    });

    return { coordinator, overlay, navigation, videoPlayer };
};

describe('ChannelTransitionCoordinator', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('does not show before delay', () => {
        const { coordinator, overlay } = setup(makeState('loading'));

        coordinator.armForChannelSwitch('12 Comedy');
        jest.advanceTimersByTime(CHANNEL_TRANSITION_SHOW_DELAY_MS - 1);

        expect(overlay.show).not.toHaveBeenCalled();
    });

    it('shows after delay if not ready', () => {
        const { coordinator, overlay } = setup(makeState('loading'));

        coordinator.armForChannelSwitch('12 Comedy');
        jest.advanceTimersByTime(CHANNEL_TRANSITION_SHOW_DELAY_MS);

        expect(overlay.show).toHaveBeenCalled();
        expect(overlay.setViewModel).toHaveBeenCalledWith({
            title: 'Tuning…',
            subtitle: '12 Comedy',
            showSpinner: true,
        });
    });

    it('never shows if ready before delay', () => {
        const { coordinator, overlay } = setup(makeState('loading'));

        coordinator.armForChannelSwitch('12 Comedy');
        coordinator.onPlayerStateChange(makeState('playing'));
        jest.advanceTimersByTime(CHANNEL_TRANSITION_SHOW_DELAY_MS + 10);

        expect(overlay.show).not.toHaveBeenCalled();
    });

    it('hides immediately on ready', () => {
        const { coordinator, overlay } = setup(makeState('loading'));

        coordinator.armForChannelSwitch('12 Comedy');
        jest.advanceTimersByTime(CHANNEL_TRANSITION_SHOW_DELAY_MS);
        expect(overlay.show).toHaveBeenCalled();

        coordinator.onPlayerStateChange(makeState('playing'));

        expect(overlay.hide).toHaveBeenCalled();
    });
});
