import { NavigationCoordinator, type NavigationCoordinatorDeps } from '../NavigationCoordinator';
import type { INavigationManager, KeyEvent, NavigationEventMap, Screen } from '../interfaces';
import type { IEPGComponent } from '../../ui/epg';
import type { IVideoPlayer } from '../../player';
import type { IPlexAuth } from '../../plex/auth';
import { NOW_PLAYING_INFO_MODAL_ID } from '../../ui/now-playing-info';

type HandlerMap = Partial<{
    [K in keyof NavigationEventMap]: (payload: NavigationEventMap[K]) => void;
}>;

const makeNavigation = (): {
    navigation: INavigationManager;
    handlers: HandlerMap;
} => {
    const handlers: HandlerMap = {};
    const navigation: INavigationManager = {
        getCurrentScreen: jest.fn().mockReturnValue('player'),
        isModalOpen: jest.fn().mockReturnValue(false),
        openModal: jest.fn(),
        closeModal: jest.fn(),
        goTo: jest.fn(),
        replaceScreen: jest.fn(),
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

const makeKeyEvent = (button: KeyEvent['button']): KeyEvent => ({
    button,
    isRepeat: false,
    isLongPress: false,
    timestamp: Date.now(),
    originalEvent: { preventDefault: jest.fn() } as unknown as KeyboardEvent,
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
        hide: jest.fn(),
    } as unknown as IEPGComponent;
    const videoPlayer: IVideoPlayer = {
        play: jest.fn().mockResolvedValue(undefined),
        pause: jest.fn(),
        stop: jest.fn(),
    } as unknown as IVideoPlayer;
    const plexAuth: IPlexAuth = {
        isAuthenticated: jest.fn().mockReturnValue(true),
    } as unknown as IPlexAuth;

    const deps: NavigationCoordinatorDeps = {
        getNavigation: () => navigation,
        getEpg: () => epg,
        getVideoPlayer: () => videoPlayer,
        getPlexAuth: () => plexAuth,
        isNowPlayingModalOpen: () => false,
        toggleNowPlayingInfoOverlay: jest.fn(),
        showNowPlayingInfoOverlay: jest.fn(),
        hideNowPlayingInfoOverlay: jest.fn(),
        setLastChannelChangeSourceRemote: jest.fn(),
        setLastChannelChangeSourceNumber: jest.fn(),
        switchToNextChannel: jest.fn(),
        switchToPreviousChannel: jest.fn(),
        switchToChannelByNumber: jest.fn().mockResolvedValue(undefined),
        toggleEpg: jest.fn(),
        shouldRunChannelSetup: jest.fn().mockReturnValue(false),
        ...overrides,
    };

    const coordinator = new NavigationCoordinator(deps);
    coordinator.wireNavigationEvents();

    return { coordinator, deps, handlers, navigation, epg, videoPlayer, plexAuth };
};

describe('NavigationCoordinator', () => {
    it('swallows back when now playing modal open', () => {
        const { handlers, epg } = setup({
            isNowPlayingModalOpen: jest.fn().mockReturnValue(true),
        });
        const event = makeKeyEvent('back');

        handlers.keyPress?.(event);

        expect(epg.handleBack).not.toHaveBeenCalled();
        expect(event.originalEvent.preventDefault).not.toHaveBeenCalled();
    });

    it('routes EPG key handling and marks handled', () => {
        const { handlers, epg, navigation } = setup();
        (epg.isVisible as jest.Mock).mockReturnValue(true);
        (epg.handleNavigation as jest.Mock).mockReturnValue(true);
        (navigation.getCurrentScreen as jest.Mock).mockReturnValue('guide' as Screen);
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

    it('does not route to EPG when current screen is settings', () => {
        const { handlers, epg, navigation } = setup();
        (epg.isVisible as jest.Mock).mockReturnValue(true);
        (navigation.getCurrentScreen as jest.Mock).mockReturnValue('settings' as Screen);

        const event = makeKeyEvent('left');
        handlers.keyPress?.(event);

        expect(epg.handleNavigation).not.toHaveBeenCalled();
        expect(event.handled).toBeUndefined();
    });

    it('does not route to EPG when a modal is open', () => {
        const { handlers, epg, navigation } = setup();
        (epg.isVisible as jest.Mock).mockReturnValue(true);
        (navigation.getCurrentScreen as jest.Mock).mockReturnValue('guide' as Screen);
        (navigation.isModalOpen as jest.Mock).mockReturnValue(true);

        const event = makeKeyEvent('down');
        handlers.keyPress?.(event);

        expect(epg.handleNavigation).not.toHaveBeenCalled();
    });

    it('routes to EPG when on guide screen and no modal open', () => {
        const { handlers, epg, navigation } = setup();
        (epg.isVisible as jest.Mock).mockReturnValue(true);
        (navigation.getCurrentScreen as jest.Mock).mockReturnValue('guide' as Screen);
        (navigation.isModalOpen as jest.Mock).mockReturnValue(false);
        (epg.handleNavigation as jest.Mock).mockReturnValue(true);

        const event = makeKeyEvent('right');
        handlers.keyPress?.(event);

        expect(epg.handleNavigation).toHaveBeenCalledWith('right');
        expect(event.handled).toBe(true);
    });

    it('hides EPG when entering settings screen', () => {
        const { handlers, epg } = setup();

        handlers.screenChange?.({ from: 'player', to: 'settings' });

        expect(epg.hide).toHaveBeenCalled();
    });
});
