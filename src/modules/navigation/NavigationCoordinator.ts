/**
 * @fileoverview Handles key input routing and screen navigation events.
 * @module modules/navigation/NavigationCoordinator
 * @version 1.0.0
 */

import type { INavigationManager, KeyEvent } from './interfaces';
import type { IEPGComponent } from '../ui/epg';
import type { IVideoPlayer } from '../player';
import type { IPlexAuth } from '../plex/auth';
import { NOW_PLAYING_INFO_MODAL_ID } from '../ui/now-playing-info';
import type { PlaybackOptionsSectionId } from '../ui/playback-options/types';
import { RETUNE_STORAGE_KEYS } from '../../config/storageKeys';
import { readStoredBoolean } from '../../utils/storage';

const EPG_REPEAT_INITIAL_DELAY_MS = 250;
const EPG_REPEAT_TIER_1_MS = 800;
const EPG_REPEAT_TIER_2_MS = 1800;
const EPG_REPEAT_INTERVAL_1_MS = 140;
const EPG_REPEAT_INTERVAL_2_MS = 90;
const EPG_REPEAT_INTERVAL_3_MS = 55;
const MINI_GUIDE_REPEAT_INITIAL_DELAY_MS = 250;
const MINI_GUIDE_REPEAT_TIER_1_MS = 800;
const MINI_GUIDE_REPEAT_TIER_2_MS = 1800;
const MINI_GUIDE_REPEAT_INTERVAL_1_MS = 140;
const MINI_GUIDE_REPEAT_INTERVAL_2_MS = 90;
const MINI_GUIDE_REPEAT_INTERVAL_3_MS = 55;

export interface NavigationCoordinatorDeps {
    getNavigation: () => INavigationManager | null;
    getEpg: () => IEPGComponent | null;
    getVideoPlayer: () => IVideoPlayer | null;
    getPlexAuth: () => IPlexAuth | null;
    stopPlayback: () => void;
    pokePlayerOsd: (reason: 'play' | 'pause' | 'seek') => void;
    togglePlayerOsd: () => void;
    getSeekIncrementMs: () => number;
    isPlayerOsdVisible: () => boolean;
    showMiniGuide: () => void;
    hideMiniGuide: () => void;
    isMiniGuideVisible: () => boolean;
    handleMiniGuideNavigation: (direction: 'up' | 'down') => boolean;
    handleMiniGuidePage: (direction: 'up' | 'down') => boolean;
    handleMiniGuideSelect: () => void;

    isNowPlayingModalOpen: () => boolean;
    toggleNowPlayingInfoOverlay: () => void;
    showNowPlayingInfoOverlay: () => void;
    hideNowPlayingInfoOverlay: () => void;
    playbackOptionsModalId: string;
    preparePlaybackOptionsModal: (
        preferredSection?: PlaybackOptionsSectionId
    ) => { focusableIds: string[]; preferredFocusId: string | null };
    showPlaybackOptionsModal: () => void;
    hidePlaybackOptionsModal: () => void;

    setLastChannelChangeSourceRemote: () => void;
    setLastChannelChangeSourceNumber: () => void;

    switchToNextChannel: () => void;
    switchToPreviousChannel: () => void;
    switchToChannelByNumber: (n: number) => Promise<void>;

    toggleEpg: () => void;
    shouldRunChannelSetup: () => boolean;
    hidePlayerOsd: () => void;
    hideChannelTransition: () => void;
}

export class NavigationCoordinator {
    private _epgRepeatTimer: ReturnType<typeof setTimeout> | null = null;
    private _epgRepeatButton: 'up' | 'down' | 'left' | 'right' | null = null;
    private _epgRepeatStartMs = 0;
    private _miniGuideRepeatTimer: ReturnType<typeof setTimeout> | null = null;
    private _miniGuideRepeatButton: 'up' | 'down' | null = null;
    private _miniGuideRepeatStartMs = 0;

    constructor(private readonly deps: NavigationCoordinatorDeps) { }

    wireNavigationEvents(): Array<() => void> {
        const navigation = this.deps.getNavigation();
        if (!navigation) return [];

        const unsubs: Array<() => void> = [];

        navigation.handleLongPress('back', () => this._handleLongPressBack());

        const keyHandler = (event: KeyEvent): void => {
            this._handleKeyPress(event);
        };
        navigation.on('keyPress', keyHandler);
        unsubs.push(() => {
            this.deps.getNavigation()?.off('keyPress', keyHandler);
        });

        const keyUpHandler = (payload: { button: KeyEvent['button'] }): void => {
            if (payload.button === this._epgRepeatButton) {
                this._stopEpgRepeat('keyup');
            }
            if (payload.button === this._miniGuideRepeatButton) {
                this._stopMiniGuideRepeat('keyup');
            }
        };
        navigation.on('keyUp', keyUpHandler);
        unsubs.push(() => {
            this.deps.getNavigation()?.off('keyUp', keyUpHandler);
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
            this._stopEpgRepeat('guide');
            this._stopMiniGuideRepeat('guide');
            this.deps.hideMiniGuide();
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
            this._stopEpgRepeat('modalOpen');
            this._stopMiniGuideRepeat('modalOpen');
            this.deps.hideMiniGuide();
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
        this._stopEpgRepeat('screenChange');
        this._stopMiniGuideRepeat('screenChange');
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
            this.deps.hideMiniGuide();
            this.deps.hidePlayerOsd();
            this.deps.hideChannelTransition();
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
            if (!this._shouldKeepPlayingInSettings()) {
                videoPlayer?.pause();
            }
        }

        // Resume playback when returning to player
        if (to === 'player' && from !== 'player') {
            videoPlayer?.play().catch(console.error);
        }
    }

    private _handleLongPressBack(): void {
        const navigation = this.deps.getNavigation();
        if (!navigation) return;
        if (navigation.isInputBlocked()) return;

        this.deps.getEpg()?.hide();
        while (navigation.isModalOpen()) {
            navigation.closeModal();
        }
        navigation.replaceScreen('player');
    }

    private _handleKeyPress(event: KeyEvent): void {
        const isDirection = (
            event.button === 'up'
            || event.button === 'down'
            || event.button === 'left'
            || event.button === 'right'
        );
        if (this._epgRepeatButton && !isDirection) {
            this._stopEpgRepeat('nonDirectional');
        }
        if (this._miniGuideRepeatButton && !isDirection) {
            this._stopMiniGuideRepeat('nonDirectional');
        }

        const isNowPlayingModalOpen = this.deps.isNowPlayingModalOpen();
        if (isNowPlayingModalOpen && event.button === 'back') {
            return;
        }
        if (isNowPlayingModalOpen && event.button === 'ok') {
            const navigation = this.deps.getNavigation();
            if (navigation && !navigation.isModalOpen(this.deps.playbackOptionsModalId)) {
                const prep = this.deps.preparePlaybackOptionsModal('subtitles');
                navigation.closeModal(NOW_PLAYING_INFO_MODAL_ID);
                navigation.openModal(this.deps.playbackOptionsModalId, prep.focusableIds);
                if (prep.preferredFocusId) {
                    navigation.setFocus(prep.preferredFocusId);
                }
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
                    event.handled = true;
                    event.originalEvent.preventDefault();

                    if (event.isRepeat) {
                        return;
                    }

                    if (this._epgRepeatButton && this._epgRepeatButton !== event.button) {
                        this._stopEpgRepeat('directionChange');
                    }

                    if (epg.handleNavigation(event.button)) {
                        this._startEpgRepeat(event.button);
                    }
                    return;
                case 'play':
                    // When the guide is open, PLAY acts as "Jump to Now" instead of controlling playback.
                    // This mirrors common 10-foot UI conventions and avoids accidental playback toggles.
                    this._stopEpgRepeat('play');
                    epg.focusNow();
                    event.handled = true;
                    event.originalEvent.preventDefault();
                    return;
                case 'ok':
                    this._stopEpgRepeat('ok');
                    epg.handleSelect();
                    event.handled = true;
                    event.originalEvent.preventDefault();
                    return;
                case 'back':
                    this._stopEpgRepeat('back');
                    epg.handleBack();
                    event.handled = true;
                    event.originalEvent.preventDefault();
                    return;
                default:
                    break;
            }
        }

        const currentScreen = navigation?.getCurrentScreen();
        const miniGuideVisible = this.deps.isMiniGuideVisible();
        if (currentScreen === 'player' && miniGuideVisible && !modalOpen && !shouldRouteToEpg) {
            if (navigation?.isInputBlocked()) {
                this._stopMiniGuideRepeat('inputBlocked');
                event.handled = true;
                event.originalEvent.preventDefault();
                return;
            }
            switch (event.button) {
                case 'up':
                case 'down':
                    event.handled = true;
                    event.originalEvent.preventDefault();
                    if (this._miniGuideRepeatButton && this._miniGuideRepeatButton !== event.button) {
                        this._stopMiniGuideRepeat('directionChange');
                    }
                    if (!event.isRepeat || !this._miniGuideRepeatButton) {
                        if (this.deps.handleMiniGuideNavigation(event.button)) {
                            this._startMiniGuideRepeat(event.button);
                        }
                    }
                    return;
                case 'channelUp':
                case 'channelDown':
                    event.handled = true;
                    event.originalEvent.preventDefault();
                    this._stopMiniGuideRepeat('page');
                    this.deps.handleMiniGuidePage(event.button === 'channelUp' ? 'up' : 'down');
                    return;
                case 'right':
                    event.handled = true;
                    event.originalEvent.preventDefault();
                    this._stopMiniGuideRepeat('right');
                    this.deps.hideMiniGuide();
                    this.deps.toggleEpg();
                    return;
                case 'ok':
                    event.handled = true;
                    event.originalEvent.preventDefault();
                    this._stopMiniGuideRepeat('ok');
                    if (!event.isRepeat) {
                        this.deps.handleMiniGuideSelect();
                    }
                    return;
                case 'back':
                    event.handled = true;
                    event.originalEvent.preventDefault();
                    this._stopMiniGuideRepeat('back');
                    this.deps.hideMiniGuide();
                    return;
                default:
                    break;
            }
        }

        if (
            currentScreen === 'player'
            && !miniGuideVisible
            && !modalOpen
            && !shouldRouteToEpg
            && !this.deps.isPlayerOsdVisible()
        ) {
            if (event.button === 'up') {
                event.handled = true;
                event.originalEvent.preventDefault();
                if (!event.isRepeat) {
                    this.deps.showMiniGuide();
                }
                return;
            }
        }

        if (event.button === 'down') {
            if (
                currentScreen === 'player'
                && !modalOpen
                && !shouldRouteToEpg
                && !this.deps.isPlayerOsdVisible()
                && !miniGuideVisible
            ) {
                this.deps.togglePlayerOsd();
                event.handled = true;
                event.originalEvent.preventDefault();
                return;
            }
        }

        if (event.button === 'ok') {
            if (
                currentScreen === 'player'
                && !modalOpen
                && !this.deps.isPlayerOsdVisible()
                && !miniGuideVisible
            ) {
                this.deps.togglePlayerOsd();
                event.handled = true;
                event.originalEvent.preventDefault();
                return;
            }
        }

        if (event.button === 'back') {
            const currentScreen = navigation?.getCurrentScreen();
            if (currentScreen === 'player' && navigation && !navigation.isModalOpen()) {
                if (this.deps.isPlayerOsdVisible()) {
                    this.deps.hidePlayerOsd();
                    event.handled = true;
                    event.originalEvent.preventDefault();
                    return;
                }
                const state = navigation.getState();
                const canGoBack = state.screenStack.length > 0;
                if (!canGoBack) {
                    navigation.openModal('exit-confirm');
                    event.handled = true;
                    event.originalEvent.preventDefault();
                    return;
                }
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
                        navigation.goTo('server-select', { allowAutoConnect: false });
                    }
                }
                break;
            }
            case 'play':
                this.deps.getVideoPlayer()?.play().catch(console.error);
                this.deps.pokePlayerOsd('play');
                break;
            case 'pause':
                this.deps.getVideoPlayer()?.pause();
                this.deps.pokePlayerOsd('pause');
                break;
            case 'rewind': {
                const deltaMs = -this.deps.getSeekIncrementMs();
                this.deps.getVideoPlayer()?.seekRelative(deltaMs).catch(console.error);
                this.deps.pokePlayerOsd('seek');
                break;
            }
            case 'fastforward': {
                const deltaMs = this.deps.getSeekIncrementMs();
                this.deps.getVideoPlayer()?.seekRelative(deltaMs).catch(console.error);
                this.deps.pokePlayerOsd('seek');
                break;
            }
            case 'stop':
                this.deps.stopPlayback();
                break;
            // Other keys handled by active screen
        }
    }

    private _stopEpgRepeat(_reason: string): void {
        if (this._epgRepeatTimer !== null) {
            clearTimeout(this._epgRepeatTimer);
            this._epgRepeatTimer = null;
        }
        this._epgRepeatButton = null;
        this._epgRepeatStartMs = 0;
    }

    private _computeEpgRepeatInterval(heldMs: number): number {
        if (heldMs < EPG_REPEAT_TIER_1_MS) {
            return EPG_REPEAT_INTERVAL_1_MS;
        }
        if (heldMs < EPG_REPEAT_TIER_2_MS) {
            return EPG_REPEAT_INTERVAL_2_MS;
        }
        return EPG_REPEAT_INTERVAL_3_MS;
    }

    private _scheduleNextEpgRepeatTick(): void {
        const epg = this.deps.getEpg();
        const navigation = this.deps.getNavigation();

        if (!epg || !epg.isVisible()) {
            this._stopEpgRepeat('notVisible');
            return;
        }
        if (!navigation) {
            this._stopEpgRepeat('noNavigation');
            return;
        }
        if (navigation.isModalOpen()) {
            this._stopEpgRepeat('modalOpen');
            return;
        }
        if (navigation.isInputBlocked()) {
            this._stopEpgRepeat('inputBlocked');
            return;
        }
        if (!this._epgRepeatButton) {
            this._stopEpgRepeat('noButton');
            return;
        }

        const moved = epg.handleNavigation(this._epgRepeatButton);
        if (!moved) {
            this._stopEpgRepeat('blocked');
            return;
        }

        const heldMs = Date.now() - this._epgRepeatStartMs;
        const interval = this._computeEpgRepeatInterval(heldMs);
        this._epgRepeatTimer = setTimeout(
            () => this._scheduleNextEpgRepeatTick(),
            interval
        );
    }

    private _startEpgRepeat(button: 'up' | 'down' | 'left' | 'right'): void {
        this._stopEpgRepeat('restart');
        this._epgRepeatButton = button;
        this._epgRepeatStartMs = Date.now();
        this._epgRepeatTimer = setTimeout(
            () => this._scheduleNextEpgRepeatTick(),
            EPG_REPEAT_INITIAL_DELAY_MS
        );
    }

    private _stopMiniGuideRepeat(_reason: string): void {
        if (this._miniGuideRepeatTimer !== null) {
            clearTimeout(this._miniGuideRepeatTimer);
            this._miniGuideRepeatTimer = null;
        }
        this._miniGuideRepeatButton = null;
        this._miniGuideRepeatStartMs = 0;
    }

    private _computeMiniGuideRepeatInterval(heldMs: number): number {
        if (heldMs < MINI_GUIDE_REPEAT_TIER_1_MS) {
            return MINI_GUIDE_REPEAT_INTERVAL_1_MS;
        }
        if (heldMs < MINI_GUIDE_REPEAT_TIER_2_MS) {
            return MINI_GUIDE_REPEAT_INTERVAL_2_MS;
        }
        return MINI_GUIDE_REPEAT_INTERVAL_3_MS;
    }

    private _scheduleNextMiniGuideRepeatTick(): void {
        const navigation = this.deps.getNavigation();
        if (!navigation) {
            this._stopMiniGuideRepeat('noNavigation');
            return;
        }
        if (navigation.isModalOpen()) {
            this._stopMiniGuideRepeat('modalOpen');
            return;
        }
        if (navigation.isInputBlocked()) {
            this._stopMiniGuideRepeat('inputBlocked');
            return;
        }
        if (navigation.getCurrentScreen() !== 'player') {
            this._stopMiniGuideRepeat('notPlayer');
            return;
        }
        if (!this.deps.isMiniGuideVisible()) {
            this._stopMiniGuideRepeat('notVisible');
            return;
        }
        if (!this._miniGuideRepeatButton) {
            this._stopMiniGuideRepeat('noButton');
            return;
        }

        const moved = this.deps.handleMiniGuideNavigation(this._miniGuideRepeatButton);
        if (!moved) {
            this._stopMiniGuideRepeat('blocked');
            return;
        }

        const heldMs = Date.now() - this._miniGuideRepeatStartMs;
        const interval = this._computeMiniGuideRepeatInterval(heldMs);
        this._miniGuideRepeatTimer = setTimeout(
            () => this._scheduleNextMiniGuideRepeatTick(),
            interval
        );
    }

    private _startMiniGuideRepeat(button: 'up' | 'down'): void {
        this._stopMiniGuideRepeat('restart');
        this._miniGuideRepeatButton = button;
        this._miniGuideRepeatStartMs = Date.now();
        this._miniGuideRepeatTimer = setTimeout(
            () => this._scheduleNextMiniGuideRepeatTick(),
            MINI_GUIDE_REPEAT_INITIAL_DELAY_MS
        );
    }

    private _shouldKeepPlayingInSettings(): boolean {
        return readStoredBoolean(RETUNE_STORAGE_KEYS.KEEP_PLAYING_IN_SETTINGS, false);
    }
}
