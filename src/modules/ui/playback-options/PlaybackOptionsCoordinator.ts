/**
 * @fileoverview Playback Options modal coordinator.
 * @module modules/ui/playback-options/PlaybackOptionsCoordinator
 */

import type { INavigationManager, FocusableElement } from '../../navigation';
import type { IPlaybackOptionsModal } from './interfaces';
import type { PlaybackOptionsViewModel, PlaybackOptionsItem } from './types';
import type { IVideoPlayer } from '../../player';
import type { IChannelManager } from '../../scheduler/channel-manager';
import type { AudioTrack, SubtitleTrack } from '../../player/types';
import { RETUNE_STORAGE_KEYS } from '../../../config/storageKeys';
import { isStoredTrue, safeLocalStorageGet, safeLocalStorageRemove, safeLocalStorageSet } from '../../../utils/storage';

export interface PlaybackOptionsCoordinatorDeps {
    playbackOptionsModalId: string;
    getNavigation: () => INavigationManager | null;
    getPlaybackOptionsModal: () => IPlaybackOptionsModal | null;
    getVideoPlayer: () => IVideoPlayer | null;
    getChannelManager: () => IChannelManager | null;
}

export class PlaybackOptionsCoordinator {
    private pendingViewModel: PlaybackOptionsViewModel | null = null;
    private pendingFocusableIds: string[] = [];
    private pendingPreferredFocusId: string | null = null;
    private registeredFocusableIds: string[] = [];

    constructor(private readonly deps: PlaybackOptionsCoordinatorDeps) {}

    prepareModal(): { focusableIds: string[]; preferredFocusId: string | null } {
        const viewModel = this.buildViewModel();
        this.pendingViewModel = viewModel;
        this.pendingFocusableIds = this.collectFocusableIds(viewModel);
        this.pendingPreferredFocusId = this.resolvePreferredFocusId(viewModel);
        return {
            focusableIds: [...this.pendingFocusableIds],
            preferredFocusId: this.pendingPreferredFocusId,
        };
    }

    handleModalOpen(modalId: string): void {
        if (modalId !== this.deps.playbackOptionsModalId) return;
        const modal = this.deps.getPlaybackOptionsModal();
        const navigation = this.deps.getNavigation();
        if (!modal || !navigation) return;

        const viewModel = this.pendingViewModel ?? this.buildViewModel();
        modal.show(viewModel);
        this.registerFocusables(viewModel, this.pendingPreferredFocusId);

        this.pendingViewModel = null;
        this.pendingFocusableIds = [];
        this.pendingPreferredFocusId = null;
    }

    handleModalClose(modalId: string): void {
        if (modalId !== this.deps.playbackOptionsModalId) return;
        const modal = this.deps.getPlaybackOptionsModal();
        modal?.hide();
        this.unregisterFocusables();
    }

    refreshIfOpen(): void {
        const modal = this.deps.getPlaybackOptionsModal();
        const navigation = this.deps.getNavigation();
        if (!modal || !navigation?.isModalOpen(this.deps.playbackOptionsModalId)) {
            return;
        }
        const viewModel = this.buildViewModel();
        modal.update(viewModel);
        this.unregisterFocusables();
        this.registerFocusables(viewModel, this.resolvePreferredFocusId(viewModel));
    }

    private buildViewModel(): PlaybackOptionsViewModel {
        const player = this.deps.getVideoPlayer();
        const subtitlesEnabled = this.isSubtitlesEnabled();
        const subtitleTracks = subtitlesEnabled ? player?.getAvailableSubtitles() ?? [] : [];
        const audioTracks = player?.getAvailableAudio() ?? [];
        const state = player?.getState();
        const activeSubtitleId = state?.activeSubtitleId ?? null;
        const activeAudioId = state?.activeAudioId ?? null;

        const subtitleOptions: PlaybackOptionsItem[] = [
            {
                id: 'playback-subtitle-off',
                label: 'Off',
                selected: activeSubtitleId === null,
                onSelect: (): void => {
                    this.handleSubtitleSelect(null);
                },
            },
        ];

        const eligibleSubtitles = subtitleTracks.filter(
            (track) => track.isTextCandidate && track.fetchableViaKey
        );

        for (const track of eligibleSubtitles) {
            subtitleOptions.push({
                id: `playback-subtitle-${track.id}`,
                label: track.label,
                selected: activeSubtitleId === track.id,
                onSelect: (): void => {
                    this.handleSubtitleSelect(track.id);
                },
            });
        }

        const subtitleEmptyMessage =
            eligibleSubtitles.length === 0 ? 'No compatible subtitles available' : undefined;

        const audioOptions = audioTracks.map((track) => ({
            id: `playback-audio-${track.id}`,
            label: this.formatAudioLabel(track),
            selected: activeAudioId === track.id,
            onSelect: (): void => {
                this.handleAudioSelect(track.id);
            },
        }));

        return {
            title: 'Playback Options',
            subtitles: {
                title: 'Subtitles',
                options: subtitleOptions,
                ...(subtitleEmptyMessage ? { emptyMessage: subtitleEmptyMessage } : {}),
            },
            audio: {
                title: 'Audio',
                options: audioOptions,
            },
        };
    }

    private formatAudioLabel(track: AudioTrack): string {
        const language = track.language || track.title || 'Unknown';
        const codec = track.codec ? track.codec.toUpperCase() : 'Unknown';
        const channels = track.channels > 0 ? ` ${track.channels}ch` : '';
        return `${language} (${codec}${channels})`;
    }

    private collectFocusableIds(viewModel: PlaybackOptionsViewModel): string[] {
        return [
            ...viewModel.subtitles.options.map((option) => option.id),
            ...viewModel.audio.options.map((option) => option.id),
        ];
    }

    private resolvePreferredFocusId(viewModel: PlaybackOptionsViewModel): string | null {
        const selectedSubtitle = viewModel.subtitles.options.find((option) => option.selected);
        if (selectedSubtitle) return selectedSubtitle.id;
        const selectedAudio = viewModel.audio.options.find((option) => option.selected);
        if (selectedAudio) return selectedAudio.id;
        const first = viewModel.subtitles.options[0] ?? viewModel.audio.options[0];
        return first?.id ?? null;
    }

    private registerFocusables(
        viewModel: PlaybackOptionsViewModel,
        preferredFocusId: string | null
    ): void {
        const navigation = this.deps.getNavigation();
        if (!navigation) return;

        const focusableIds = this.collectFocusableIds(viewModel);
        this.registeredFocusableIds = focusableIds;

        for (let i = 0; i < focusableIds.length; i++) {
            const id = focusableIds[i];
            if (!id) continue;
            const element = document.getElementById(id) as HTMLElement | null;
            if (!element) continue;
            const neighbors: FocusableElement['neighbors'] = {};
            const upId = i > 0 ? focusableIds[i - 1] : undefined;
            const downId = i < focusableIds.length - 1 ? focusableIds[i + 1] : undefined;
            if (upId) neighbors.up = upId;
            if (downId) neighbors.down = downId;

            navigation.registerFocusable({
                id,
                element,
                neighbors,
                onSelect: () => element.click(),
            });
        }

        const initialFocus = preferredFocusId && focusableIds.includes(preferredFocusId)
            ? preferredFocusId
            : focusableIds[0] ?? null;
        if (initialFocus) {
            navigation.setFocus(initialFocus);
        }
    }

    private unregisterFocusables(): void {
        const navigation = this.deps.getNavigation();
        if (!navigation) return;
        for (const id of this.registeredFocusableIds) {
            navigation.unregisterFocusable(id);
        }
        this.registeredFocusableIds = [];
    }

    private handleSubtitleSelect(trackId: string | null): void {
        const player = this.deps.getVideoPlayer();
        if (!player) return;
        const track = trackId
            ? player.getAvailableSubtitles().find((t) => t.id === trackId) ?? null
            : null;
        player.setSubtitleTrack(trackId).catch(() => {
            // Subtitle selection errors are handled by SubtitleManager fallback/Toast.
        });
        this.persistSubtitlePreference(track);
        this.refreshIfOpen();
    }

    private handleAudioSelect(trackId: string): void {
        const player = this.deps.getVideoPlayer();
        if (!player) return;
        player.setAudioTrack(trackId).catch((error) => {
            console.error('[PlaybackOptions] Audio track switch failed:', error);
        }).finally(() => {
            this.refreshIfOpen();
        });
    }

    private isSubtitlesEnabled(): boolean {
        try {
            return isStoredTrue(safeLocalStorageGet(RETUNE_STORAGE_KEYS.SUBTITLES_ENABLED));
        } catch {
            return false;
        }
    }

    private useGlobalSubtitlePreference(): boolean {
        try {
            return isStoredTrue(
                safeLocalStorageGet(RETUNE_STORAGE_KEYS.SUBTITLE_PREFERENCE_GLOBAL_OVERRIDE)
            );
        } catch {
            return false;
        }
    }

    private getChannelPreferenceKey(channelId: string): string {
        return `${RETUNE_STORAGE_KEYS.SUBTITLE_PREFERENCE_BY_CHANNEL_PREFIX}${channelId}`;
    }

    private persistSubtitlePreference(track: SubtitleTrack | null): void {
        const channelId = this.deps.getChannelManager()?.getCurrentChannel()?.id ?? null;
        const useGlobal = this.useGlobalSubtitlePreference() || !channelId;
        const storageKey = useGlobal
            ? RETUNE_STORAGE_KEYS.SUBTITLE_PREFERENCE_GLOBAL
            : this.getChannelPreferenceKey(channelId);

        if (!track) {
            safeLocalStorageRemove(storageKey);
            return;
        }

        const payload = {
            trackId: track.id,
            language: track.languageCode || track.language,
            codec: track.codec,
            lastUpdated: Date.now(),
        };
        safeLocalStorageSet(storageKey, JSON.stringify(payload));
    }
}
