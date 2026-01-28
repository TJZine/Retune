import { NavigationCoordinator, type NavigationCoordinatorDeps } from '../NavigationCoordinator';
import type { INavigationManager, KeyEvent, NavigationEventMap, Screen } from '../interfaces';
import type { IEPGComponent } from '../../ui/epg';
import type { IVideoPlayer } from '../../player';
import type { IPlexAuth } from '../../plex/auth';
import { NOW_PLAYING_INFO_MODAL_ID } from '../../ui/now-playing-info';
import { PLAYBACK_OPTIONS_MODAL_ID } from '../../ui/playback-options/constants';
import { RETUNE_STORAGE_KEYS } from '../../../config/storageKeys';

type HandlerMap = Partial<{
    [K in keyof NavigationEventMap]: (payload: NavigationEventMap[K]) => void;
}>;

const makeNavigation = (): {
    navigation: INavigationManager;
    handlers: HandlerMap;
} => {
    const handlers: HandlerMap = {};
    const state = {
        currentScreen: 'player' as Screen,
        screenStack: [] as Screen[],
        focusedElementId: null,
        modalStack: [],
        isPointerActive: false,
    };
    const navigation: INavigationManager = {
        getCurrentScreen: jest.fn().mockReturnValue('player'),
        getState: jest.fn().mockReturnValue(state),
        isModalOpen: jest.fn().mockReturnValue(false),
        isInputBlocked: jest.fn().mockReturnValue(false),
        openModal: jest.fn(),
        closeModal: jest.fn(),
        goTo: jest.fn(),
        replaceScreen: jest.fn(),
        setFocus: jest.fn(),
        handleLongPress: jest.fn(),
        on: jest.fn(<K extends keyof NavigationEventMap>(
            event: K,
            handler: (payload: NavigationEventMap[K]) => void
        ) => {
            handlers[event] = handler;
        }),
        off: jest.fn(),
    } as unknown as INavigationManager;
    return { navigation, handlers };
};

const makeKeyEvent = (
    button: KeyEvent['button'],
    overrides: Partial<KeyEvent> = {}
): KeyEvent => ({
    button,
    isRepeat: false,
    isLongPress: false,
    timestamp: Date.now(),
    originalEvent: { preventDefault: jest.fn() } as unknown as KeyboardEvent,
    ...overrides,
});

const setup = (overrides: Partial<NavigationCoordinatorDeps> = {}): {
    coordinator: NavigationCoordinator;
    deps: NavigationCoordinatorDeps;
    handlers: HandlerMap;
    navigation: INavigationManager;
    epg: IEPGComponent;
    videoPlayer: IVideoPlayer;
    plexAuth: IPlexAuth;
} => {
    const { navigation, handlers } = makeNavigation();
    const epg: IEPGComponent = {
        isVisible: jest.fn().mockReturnValue(false),
        handleNavigation: jest.fn().mockReturnValue(false),
        handleSelect: jest.fn().mockReturnValue(false),
        handleBack: jest.fn().mockReturnValue(false),
        focusNow: jest.fn(),
        hide: jest.fn(),
    } as unknown as IEPGComponent;
    const videoPlayer: IVideoPlayer = {
        play: jest.fn().mockResolvedValue(undefined),
        pause: jest.fn(),
        stop: jest.fn(),
        seekRelative: jest.fn().mockResolvedValue(undefined),
    } as unknown as IVideoPlayer;
    const plexAuth: IPlexAuth = {
        isAuthenticated: jest.fn().mockReturnValue(true),
    } as unknown as IPlexAuth;

    const deps: NavigationCoordinatorDeps = {
        getNavigation: () => navigation,
        getEpg: () => epg,
        getVideoPlayer: () => videoPlayer,
        getPlexAuth: () => plexAuth,
        stopPlayback: jest.fn(),
        pokePlayerOsd: jest.fn(),
        togglePlayerOsd: jest.fn(),
        getSeekIncrementMs: jest.fn().mockReturnValue(10_000),
        isNowPlayingModalOpen: () => false,
        toggleNowPlayingInfoOverlay: jest.fn(),
        showNowPlayingInfoOverlay: jest.fn(),
        hideNowPlayingInfoOverlay: jest.fn(),
        playbackOptionsModalId: PLAYBACK_OPTIONS_MODAL_ID,
        preparePlaybackOptionsModal: jest.fn().mockReturnValue({ focusableIds: ['playback-subtitle-off'], preferredFocusId: 'playback-subtitle-off' }),
        showPlaybackOptionsModal: jest.fn(),
        hidePlaybackOptionsModal: jest.fn(),
        setLastChannelChangeSourceRemote: jest.fn(),
        setLastChannelChangeSourceNumber: jest.fn(),
        switchToNextChannel: jest.fn(),
        switchToPreviousChannel: jest.fn(),
        switchToChannelByNumber: jest.fn().mockResolvedValue(undefined),
        toggleEpg: jest.fn(),
        shouldRunChannelSetup: jest.fn().mockReturnValue(false),
        hidePlayerOsd: jest.fn(),
        hideChannelTransition: jest.fn(),
        ...overrides,
    };

    const coordinator = new NavigationCoordinator(deps);
    coordinator.wireNavigationEvents();

    return { coordinator, deps, handlers, navigation, epg, videoPlayer, plexAuth };
};

describe('NavigationCoordinator', () => {
    it('registers long-press back handler', () => {
        const { navigation } = setup();

        expect(navigation.handleLongPress).toHaveBeenCalledWith('back', expect.any(Function));
    });

    it('long-press back closes EPG, closes modals, and returns to player', () => {
        const { navigation, epg } = setup();
        const handleLongPress = navigation.handleLongPress as jest.Mock;
        const callback = handleLongPress.mock.calls[0]?.[1] as () => void;

        (navigation.isInputBlocked as jest.Mock).mockReturnValue(false);
        (navigation.isModalOpen as jest.Mock)
            .mockImplementationOnce(() => true)
            .mockImplementationOnce(() => true)
            .mockImplementationOnce(() => false);

        callback();

        expect(epg.hide).toHaveBeenCalledTimes(1);
        expect(navigation.closeModal).toHaveBeenCalledTimes(2);
        expect(navigation.replaceScreen).toHaveBeenCalledWith('player');
    });

    it('long-press back does nothing when input is blocked', () => {
        const { navigation, epg } = setup();
        const handleLongPress = navigation.handleLongPress as jest.Mock;
        const callback = handleLongPress.mock.calls[0]?.[1] as () => void;

        (navigation.isInputBlocked as jest.Mock).mockReturnValue(true);

        callback();

        expect(epg.hide).not.toHaveBeenCalled();
        expect(navigation.closeModal).not.toHaveBeenCalled();
        expect(navigation.replaceScreen).not.toHaveBeenCalled();
    });

    it('toggles player OSD on ok when in player screen', () => {
        const { handlers, deps } = setup();
        const keyPress = handlers.keyPress;
        if (!keyPress) {
            throw new Error('keyPress handler not registered');
        }

        const event = makeKeyEvent('ok');
        keyPress(event);

        expect(deps.togglePlayerOsd).toHaveBeenCalledTimes(1);
        expect(event.handled).toBe(true);
        expect(event.originalEvent.preventDefault).toHaveBeenCalled();
    });

    it('swallows back when now playing modal open', () => {
        const { handlers, epg } = setup({
            isNowPlayingModalOpen: jest.fn().mockReturnValue(true),
        });
        const event = makeKeyEvent('back');

        handlers.keyPress?.(event);

        expect(epg.handleBack).not.toHaveBeenCalled();
        expect(event.originalEvent.preventDefault).not.toHaveBeenCalled();
    });

    it('opens exit-confirm on back from player when no modal is open', () => {
        const { handlers, navigation } = setup();
        const event = makeKeyEvent('back');

        handlers.keyPress?.(event);

        expect(navigation.openModal).toHaveBeenCalledWith('exit-confirm');
        expect(event.handled).toBe(true);
        expect(event.originalEvent.preventDefault).toHaveBeenCalled();
    });

    it('does not open exit-confirm when back stack is available', () => {
        const { handlers, navigation } = setup();
        (navigation.getState as jest.Mock).mockReturnValue({
            currentScreen: 'player',
            screenStack: ['server-select'],
            focusedElementId: null,
            modalStack: [],
            isPointerActive: false,
        });
        const event = makeKeyEvent('back');

        handlers.keyPress?.(event);

        expect(navigation.openModal).not.toHaveBeenCalled();
        expect(event.handled).not.toBe(true);
        expect(event.originalEvent.preventDefault).not.toHaveBeenCalled();
    });

    it('opens playback options when OK pressed in now playing modal', () => {
        const focus = {
            focusableIds: ['playback-subtitle-off'],
            preferredFocusId: 'playback-subtitle-off',
        };
        const { handlers, navigation, deps } = setup({
            isNowPlayingModalOpen: jest.fn().mockReturnValue(true),
            preparePlaybackOptionsModal: jest.fn().mockReturnValue(focus),
        });
        const event = makeKeyEvent('ok');

        handlers.keyPress?.(event);

        expect(deps.preparePlaybackOptionsModal).toHaveBeenCalled();
        expect(navigation.closeModal).toHaveBeenCalledWith(NOW_PLAYING_INFO_MODAL_ID);
        expect(navigation.openModal).toHaveBeenCalledWith(
            PLAYBACK_OPTIONS_MODAL_ID,
            focus.focusableIds
        );
        expect(event.handled).toBe(true);
    });

    it('routes EPG key handling and marks handled', () => {
        const { handlers, epg, navigation } = setup();
        (epg.isVisible as jest.Mock).mockReturnValue(true);
        (epg.handleNavigation as jest.Mock).mockReturnValue(true);
        (navigation.isModalOpen as jest.Mock).mockReturnValue(false);

        const event = makeKeyEvent('up');
        handlers.keyPress?.(event);
        handlers.keyUp?.({ button: 'up' });

        expect(event.handled).toBe(true);
        expect(event.originalEvent.preventDefault).toHaveBeenCalled();
    });

    it('EPG direction keys always consumed', () => {
        const { handlers, epg, navigation } = setup();
        (epg.isVisible as jest.Mock).mockReturnValue(true);
        (epg.handleNavigation as jest.Mock).mockReturnValue(false);
        (navigation.isModalOpen as jest.Mock).mockReturnValue(false);

        const event = makeKeyEvent('up');
        handlers.keyPress?.(event);

        expect(event.handled).toBe(true);
        expect(event.originalEvent.preventDefault).toHaveBeenCalled();
    });

    it('handles channel up/down with remote source', () => {
        const { handlers, deps } = setup();

        handlers.keyPress?.(makeKeyEvent('channelUp'));
        expect(deps.setLastChannelChangeSourceRemote).toHaveBeenCalled();
        expect(deps.switchToPreviousChannel).toHaveBeenCalled();

        handlers.keyPress?.(makeKeyEvent('channelDown'));
        expect(deps.setLastChannelChangeSourceRemote).toHaveBeenCalledTimes(2);
        expect(deps.switchToNextChannel).toHaveBeenCalled();
    });

    it('play triggers pokePlayerOsd', () => {
        const { handlers, deps } = setup();
        handlers.keyPress?.(makeKeyEvent('play'));

        expect(deps.pokePlayerOsd).toHaveBeenCalledWith('play');
    });

    it('play jumps to now when EPG is visible', () => {
        const { handlers, epg, deps, videoPlayer, navigation } = setup();
        (epg.isVisible as jest.Mock).mockReturnValue(true);
        (navigation.isModalOpen as jest.Mock).mockReturnValue(false);

        const event = makeKeyEvent('play');
        handlers.keyPress?.(event);

        expect(epg.focusNow).toHaveBeenCalledTimes(1);
        expect(deps.pokePlayerOsd).not.toHaveBeenCalledWith('play');
        expect(videoPlayer.play).not.toHaveBeenCalled();
        expect(event.handled).toBe(true);
        expect(event.originalEvent.preventDefault).toHaveBeenCalled();
    });

    it('pause triggers pokePlayerOsd', () => {
        const { handlers, deps } = setup();
        handlers.keyPress?.(makeKeyEvent('pause'));

        expect(deps.pokePlayerOsd).toHaveBeenCalledWith('pause');
    });

    it('fastforward seeks forward and pokes OSD', () => {
        const { handlers, deps, videoPlayer } = setup();

        handlers.keyPress?.(makeKeyEvent('fastforward'));

        expect(videoPlayer.seekRelative).toHaveBeenCalledWith(10_000);
        expect(deps.pokePlayerOsd).toHaveBeenCalledWith('seek');
    });

    it('rewind seeks backward and pokes OSD', () => {
        const { handlers, deps, videoPlayer } = setup();

        handlers.keyPress?.(makeKeyEvent('rewind'));

        expect(videoPlayer.seekRelative).toHaveBeenCalledWith(-10_000);
        expect(deps.pokePlayerOsd).toHaveBeenCalledWith('seek');
    });

    it('settings handler only runs from player or guide', () => {
        const { handlers, navigation } = setup();

        (navigation.getCurrentScreen as jest.Mock).mockReturnValue('player' as Screen);
        handlers.settings?.(undefined);
        expect(navigation.goTo).toHaveBeenCalledWith('settings');

        (navigation.getCurrentScreen as jest.Mock).mockReturnValue('auth' as Screen);
        handlers.settings?.(undefined);
        expect(navigation.goTo).toHaveBeenCalledTimes(1);
    });

    it('screen change shows/hides EPG and pauses/resumes player', () => {
        const { handlers, epg, videoPlayer, deps, navigation } = setup();
        (epg.isVisible as jest.Mock).mockReturnValue(false);

        handlers.screenChange?.({ from: 'player', to: 'guide' });
        expect(deps.toggleEpg).toHaveBeenCalled();

        handlers.screenChange?.({ from: 'guide', to: 'player' });
        expect(epg.hide).toHaveBeenCalled();

        handlers.screenChange?.({ from: 'player', to: 'settings' });
        expect(videoPlayer.pause).toHaveBeenCalled();

        handlers.screenChange?.({ from: 'settings', to: 'player' });
        expect(videoPlayer.play).toHaveBeenCalled();

        (navigation.isModalOpen as jest.Mock).mockReturnValue(true);
        handlers.screenChange?.({ from: 'player', to: 'home' });
        expect(navigation.closeModal).toHaveBeenCalledWith(NOW_PLAYING_INFO_MODAL_ID);
    });

    it('does not pause when keep-playing-in-settings is enabled', () => {
        const originalLocalStorage = globalThis.localStorage;
        Object.defineProperty(globalThis, 'localStorage', {
            value: {
                getItem: jest.fn((key: string) =>
                    key === RETUNE_STORAGE_KEYS.KEEP_PLAYING_IN_SETTINGS ? '1' : null
                ),
            },
            configurable: true,
        });

        try {
            const { handlers, videoPlayer } = setup();
            handlers.screenChange?.({ from: 'player', to: 'settings' });
            expect(videoPlayer.pause).not.toHaveBeenCalled();
        } finally {
            Object.defineProperty(globalThis, 'localStorage', {
                value: originalLocalStorage,
                configurable: true,
                writable: true,
            });
        }
    });

    it('channel setup gate replaces player screen', () => {
        const { handlers, deps, navigation } = setup({
            shouldRunChannelSetup: jest.fn().mockReturnValue(true),
        });

        handlers.screenChange?.({ from: 'home', to: 'player' });

        expect(deps.shouldRunChannelSetup).toHaveBeenCalled();
        expect(navigation.replaceScreen).toHaveBeenCalledWith('channel-setup');
    });

    it('modal open/close triggers now playing overlay handlers', () => {
        const { handlers, deps } = setup();

        handlers.modalOpen?.({ modalId: NOW_PLAYING_INFO_MODAL_ID });
        expect(deps.showNowPlayingInfoOverlay).toHaveBeenCalled();

        handlers.modalClose?.({ modalId: NOW_PLAYING_INFO_MODAL_ID });
        expect(deps.hideNowPlayingInfoOverlay).toHaveBeenCalled();
    });

    it('does not route to EPG when overlay is not visible', () => {
        const { handlers, epg } = setup();
        (epg.isVisible as jest.Mock).mockReturnValue(false);

        const event = makeKeyEvent('left');
        handlers.keyPress?.(event);

        expect(epg.handleNavigation).not.toHaveBeenCalled();
        expect(event.handled).toBeUndefined();
    });

    it('does not route to EPG when a modal is open', () => {
        const { handlers, epg, navigation } = setup();
        (epg.isVisible as jest.Mock).mockReturnValue(true);
        (navigation.isModalOpen as jest.Mock).mockReturnValue(true);

        const event = makeKeyEvent('down');
        handlers.keyPress?.(event);

        expect(epg.handleNavigation).not.toHaveBeenCalled();
    });

    it('routes to EPG when overlay is visible and no modal open', () => {
        const { handlers, epg, navigation } = setup();
        (epg.isVisible as jest.Mock).mockReturnValue(true);
        (navigation.isModalOpen as jest.Mock).mockReturnValue(false);
        (epg.handleNavigation as jest.Mock).mockReturnValue(true);

        const event = makeKeyEvent('right');
        handlers.keyPress?.(event);
        handlers.keyUp?.({ button: 'right' });

        expect(epg.handleNavigation).toHaveBeenCalledWith('right');
        expect(event.handled).toBe(true);
    });

    it('routes to EPG when overlay is visible on player screen', () => {
        const { handlers, epg, navigation } = setup();
        (epg.isVisible as jest.Mock).mockReturnValue(true);
        (navigation.getCurrentScreen as jest.Mock).mockReturnValue('player' as Screen);
        (navigation.isModalOpen as jest.Mock).mockReturnValue(false);
        (epg.handleNavigation as jest.Mock).mockReturnValue(true);

        const event = makeKeyEvent('down');
        handlers.keyPress?.(event);
        handlers.keyUp?.({ button: 'down' });

        expect(epg.handleNavigation).toHaveBeenCalledWith('down');
        expect(event.handled).toBe(true);
    });

    it('hides EPG when entering settings screen', () => {
        const { handlers, epg } = setup();

        handlers.screenChange?.({ from: 'player', to: 'settings' });

        expect(epg.hide).toHaveBeenCalled();
    });

    describe('epg repeat', () => {
        beforeEach(() => {
            jest.useFakeTimers();
            jest.setSystemTime(0);
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('accelerated repeat ticks and stops on keyUp', () => {
            const { handlers, epg, navigation } = setup();
            (epg.isVisible as jest.Mock).mockReturnValue(true);
            (navigation.isModalOpen as jest.Mock).mockReturnValue(false);
            (epg.handleNavigation as jest.Mock).mockReturnValue(true);

            const event = makeKeyEvent('down');
            handlers.keyPress?.(event);
            expect(epg.handleNavigation).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(250);
            expect(epg.handleNavigation).toHaveBeenCalledTimes(2);

            jest.advanceTimersByTime(140);
            expect(epg.handleNavigation).toHaveBeenCalledTimes(3);

            jest.advanceTimersByTime(140);
            expect(epg.handleNavigation).toHaveBeenCalledTimes(4);

            jest.advanceTimersByTime(140);
            expect(epg.handleNavigation).toHaveBeenCalledTimes(5);

            jest.advanceTimersByTime(140);
            expect(epg.handleNavigation).toHaveBeenCalledTimes(6);

            jest.advanceTimersByTime(89);
            expect(epg.handleNavigation).toHaveBeenCalledTimes(6);

            jest.advanceTimersByTime(1);
            expect(epg.handleNavigation).toHaveBeenCalledTimes(7);

            handlers.keyUp?.({ button: 'down' });
            jest.advanceTimersByTime(1000);
            expect(epg.handleNavigation).toHaveBeenCalledTimes(7);
        });

        it('repeat stops on modal open', () => {
            const { handlers, epg, navigation } = setup();
            (epg.isVisible as jest.Mock).mockReturnValue(true);
            (navigation.isModalOpen as jest.Mock).mockReturnValue(false);
            (epg.handleNavigation as jest.Mock).mockReturnValue(true);

            const event = makeKeyEvent('right');
            handlers.keyPress?.(event);
            expect(epg.handleNavigation).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(250);
            expect(epg.handleNavigation).toHaveBeenCalledTimes(2);

            handlers.modalOpen?.({ modalId: 'any' });
            jest.advanceTimersByTime(1000);
            expect(epg.handleNavigation).toHaveBeenCalledTimes(2);
        });

        it('repeat stops on screen change away from guide', () => {
            const { handlers, epg, navigation } = setup();
            (epg.isVisible as jest.Mock).mockReturnValue(true);
            (navigation.isModalOpen as jest.Mock).mockReturnValue(false);
            (epg.handleNavigation as jest.Mock).mockReturnValue(true);

            handlers.keyPress?.(makeKeyEvent('left'));
            expect(epg.handleNavigation).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(250);
            expect(epg.handleNavigation).toHaveBeenCalledTimes(2);

            handlers.screenChange?.({ from: 'guide', to: 'player' });
            jest.advanceTimersByTime(1000);
            expect(epg.handleNavigation).toHaveBeenCalledTimes(2);
        });

        it('repeat stops when input is blocked', () => {
            const { handlers, epg, navigation } = setup();
            const isInputBlocked = navigation.isInputBlocked as jest.Mock;
            (epg.isVisible as jest.Mock).mockReturnValue(true);
            (navigation.isModalOpen as jest.Mock).mockReturnValue(false);
            isInputBlocked.mockReturnValue(false);
            (epg.handleNavigation as jest.Mock).mockReturnValue(true);

            handlers.keyPress?.(makeKeyEvent('down'));
            expect(epg.handleNavigation).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(250);
            expect(epg.handleNavigation).toHaveBeenCalledTimes(2);

            isInputBlocked.mockReturnValue(true);
            jest.advanceTimersByTime(1000);
            expect(epg.handleNavigation).toHaveBeenCalledTimes(2);
        });

        it('repeat stops immediately on back', () => {
            const { handlers, epg, navigation } = setup();
            (epg.isVisible as jest.Mock).mockReturnValue(true);
            (navigation.isModalOpen as jest.Mock).mockReturnValue(false);
            (epg.handleNavigation as jest.Mock).mockReturnValue(true);
            (epg.handleBack as jest.Mock).mockReturnValue(true);

            handlers.keyPress?.(makeKeyEvent('right'));
            expect(epg.handleNavigation).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(250);
            expect(epg.handleNavigation).toHaveBeenCalledTimes(2);

            handlers.keyPress?.(makeKeyEvent('back'));
            jest.advanceTimersByTime(1000);
            expect(epg.handleNavigation).toHaveBeenCalledTimes(2);
        });
    });
});
