import type { INavigationManager, KeyEvent } from './interfaces';
import type { IEPGComponent } from '../ui/epg';
import type { IVideoPlayer } from '../player';
import type { IPlexAuth } from '../plex/auth';
import { NOW_PLAYING_INFO_MODAL_ID } from '../ui/now-playing-info';

export interface NavigationCoordinatorDeps {
    getNavigation: () => INavigationManager | null;
    getEpg: () => IEPGComponent | null;
    getVideoPlayer: () => IVideoPlayer | null;
    getPlexAuth: () => IPlexAuth | null;

    isNowPlayingModalOpen: () => boolean;
    toggleNowPlayingInfoOverlay: () => void;
    showNowPlayingInfoOverlay: () => void;
    hideNowPlayingInfoOverlay: () => void;
    playbackOptionsModalId: string;
    preparePlaybackOptionsModal: () => { focusableIds: string[]; preferredFocusId: string | null };
    showPlaybackOptionsModal: () => void;
    hidePlaybackOptionsModal: () => void;

    setLastChannelChangeSourceRemote: () => void;
    setLastChannelChangeSourceNumber: () => void;

    switchToNextChannel: () => void;
    switchToPreviousChannel: () => void;
    switchToChannelByNumber: (n: number) => Promise<void>;

    toggleEpg: () => void;
    shouldRunChannelSetup: () => boolean;
}

export class NavigationCoordinator {
    constructor(private readonly deps: NavigationCoordinatorDeps) { }

    wireNavigationEvents(): Array<() => void> {
        const navigation = this.deps.getNavigation();
        if (!navigation) return [];

        const unsubs: Array<() => void> = [];

        const keyHandler = (event: KeyEvent): void => {
            this._handleKeyPress(event);
        };
        navigation.on('keyPress', keyHandler);
        unsubs.push(() => {
            this.deps.getNavigation()?.off('keyPress', keyHandler);
        });

        const channelNumberHandler = (payload: { channelNumber: number }): void => {
            if (!Number.isFinite(payload.channelNumber)) {
                return;
            }
            this.deps.setLastChannelChangeSourceNumber();
            this.deps.switchToChannelByNumber(payload.channelNumber).catch(console.error);
        };
        navigation.on('channelNumberEntered', channelNumberHandler);
        unsubs.push(() => {
            this.deps.getNavigation()?.off('channelNumberEntered', channelNumberHandler);
        });

        const guideHandler = (): void => {
            // EPG is an overlay, not a navigation screen; toggle based on EPG visibility.
            this.deps.toggleEpg();
        };
        navigation.on('guide', guideHandler);
        unsubs.push(() => {
            this.deps.getNavigation()?.off('guide', guideHandler);
        });

        const settingsHandler = (): void => {
            const currentScreen = this.deps.getNavigation()?.getCurrentScreen();
            if (currentScreen === 'player' || currentScreen === 'guide') {
                this.deps.getNavigation()?.goTo('settings');
            }
        };
        navigation.on('settings', settingsHandler);
        unsubs.push(() => {
            this.deps.getNavigation()?.off('settings', settingsHandler);
        });

        const screenHandler = (payload: { from: string; to: string }): void => {
            this._handleScreenChange(payload.from, payload.to);
        };
        navigation.on('screenChange', screenHandler);
        unsubs.push(() => {
            this.deps.getNavigation()?.off('screenChange', screenHandler);
        });

        const modalOpenHandler = (payload: { modalId: string }): void => {
            if (payload.modalId === NOW_PLAYING_INFO_MODAL_ID) {
                this.deps.showNowPlayingInfoOverlay();
            }
            if (payload.modalId === this.deps.playbackOptionsModalId) {
                this.deps.showPlaybackOptionsModal();
            }
        };
        const modalCloseHandler = (payload: { modalId: string }): void => {
            if (payload.modalId === NOW_PLAYING_INFO_MODAL_ID) {
                this.deps.hideNowPlayingInfoOverlay();
            }
            if (payload.modalId === this.deps.playbackOptionsModalId) {
                this.deps.hidePlaybackOptionsModal();
            }
        };
        navigation.on('modalOpen', modalOpenHandler);
        navigation.on('modalClose', modalCloseHandler);
        unsubs.push(() => {
            this.deps.getNavigation()?.off('modalOpen', modalOpenHandler);
            this.deps.getNavigation()?.off('modalClose', modalCloseHandler);
        });

        return unsubs;
    }

    private _handleScreenChange(from: string, to: string): void {
        if (to === 'player' && this.deps.shouldRunChannelSetup()) {
            this.deps.getNavigation()?.replaceScreen('channel-setup');
            return;
        }

        const epg = this.deps.getEpg();
        const videoPlayer = this.deps.getVideoPlayer();
        const navigation = this.deps.getNavigation();

        // Hide EPG when leaving guide
        if (from === 'guide' && to !== 'guide') {
            epg?.hide();
        }

        // Close Now Playing Info overlay when leaving player
        if (from === 'player' && to !== 'player') {
            if (navigation?.isModalOpen(NOW_PLAYING_INFO_MODAL_ID)) {
                navigation.closeModal(NOW_PLAYING_INFO_MODAL_ID);
            }
        }

        // Show EPG when entering guide
        if (to === 'guide') {
            if (epg && !epg.isVisible()) {
                this.deps.toggleEpg();
            }
        }

        // Hide EPG when entering settings (prevents overlay bleed)
        if (to === 'settings') {
            epg?.hide();
        }

        // Pause playback when leaving player for settings/channel-edit
        if (from === 'player' && (to === 'settings' || to === 'channel-edit')) {
            videoPlayer?.pause();
        }

        // Resume playback when returning to player
        if (to === 'player' && from !== 'player') {
            videoPlayer?.play().catch(console.error);
        }
    }

    private _handleKeyPress(event: KeyEvent): void {
        const isNowPlayingModalOpen = this.deps.isNowPlayingModalOpen();
        if (isNowPlayingModalOpen && event.button === 'back') {
            return;
        }
        if (isNowPlayingModalOpen && event.button === 'ok') {
            const navigation = this.deps.getNavigation();
            if (navigation && !navigation.isModalOpen(this.deps.playbackOptionsModalId)) {
                const prep = this.deps.preparePlaybackOptionsModal();
                navigation.closeModal(NOW_PLAYING_INFO_MODAL_ID);
                navigation.openModal(this.deps.playbackOptionsModalId, prep.focusableIds);
            }
            event.handled = true;
            event.originalEvent.preventDefault();
            return;
        }

        // Compute EPG routing eligibility: only route to EPG when on guide screen with no modal open
        const epg = this.deps.getEpg();
        const navigation = this.deps.getNavigation();
        const modalOpen = navigation?.isModalOpen() ?? false;
        const shouldRouteToEpg = !modalOpen && !!epg?.isVisible();

        if (epg && shouldRouteToEpg) {
            switch (event.button) {
                case 'up':
                case 'down':
                case 'left':
                case 'right':
                    if (epg.handleNavigation(event.button)) {
                        event.handled = true;
                        event.originalEvent.preventDefault();
                        return;
                    }
                    break;
                case 'ok':
                    if (epg.handleSelect()) {
                        event.handled = true;
                        event.originalEvent.preventDefault();
                        return;
                    }
                    break;
                case 'back':
                    if (epg.handleBack()) {
                        event.handled = true;
                        event.originalEvent.preventDefault();
                        return;
                    }
                    break;
                default:
                    break;
            }
        }

        switch (event.button) {
            case 'red':
                if (event.isRepeat) {
                    break;
                }
                this.deps.toggleNowPlayingInfoOverlay();
                break;
            case 'channelUp':
                this.deps.setLastChannelChangeSourceRemote();
                // Treat channel-up as decrement (reverse wrap) to match user expectation.
                this.deps.switchToPreviousChannel();
                break;
            case 'channelDown':
                this.deps.setLastChannelChangeSourceRemote();
                // Treat channel-down as increment (forward wrap) to match user expectation.
                this.deps.switchToNextChannel();
                break;
            case 'info':
            case 'blue': {
                const navigation = this.deps.getNavigation();
                if (navigation) {
                    const plexAuth = this.deps.getPlexAuth();
                    if (plexAuth && !plexAuth.isAuthenticated()) {
                        navigation.goTo('auth');
                    } else {
                        navigation.goTo('server-select');
                    }
                }
                break;
            }
            case 'play':
                this.deps.getVideoPlayer()?.play().catch(console.error);
                break;
            case 'pause':
                this.deps.getVideoPlayer()?.pause();
                break;
            case 'stop':
                this.deps.getVideoPlayer()?.stop();
                break;
            // Other keys handled by active screen
        }
    }
}
