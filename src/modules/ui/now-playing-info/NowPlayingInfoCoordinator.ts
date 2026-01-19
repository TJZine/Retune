import type { INavigationManager } from '../../navigation';
import type { IChannelScheduler, ScheduledProgram } from '../../scheduler/scheduler';
import type { IChannelManager, ChannelConfig } from '../../scheduler/channel-manager';
import type { IPlexLibrary, PlexMediaItem } from '../../plex/library';
import type { INowPlayingInfoOverlay, NowPlayingInfoViewModel } from './index';
import type { NowPlayingInfoConfig } from './types';
import { NOW_PLAYING_INFO_AUTO_HIDE_OPTIONS, NOW_PLAYING_INFO_DEFAULTS } from './constants';
import { safeLocalStorageGet } from '../../../utils/storage';
import { RETUNE_STORAGE_KEYS } from '../../../config/storageKeys';

export interface NowPlayingInfoCoordinatorDeps {
    nowPlayingModalId: string;

    getNavigation: () => INavigationManager | null;
    getScheduler: () => IChannelScheduler | null;
    getChannelManager: () => IChannelManager | null;
    getPlexLibrary: () => IPlexLibrary | null;
    getNowPlayingInfo: () => INowPlayingInfoOverlay | null;
    getNowPlayingInfoConfig: () => NowPlayingInfoConfig | null;

    // Orchestrator-owned security helper
    buildPlexResourceUrl: (pathOrUrl: string) => string | null;

    // Debug integration (must be optional and no-op safe)
    buildDebugText: () => string | null;
    maybeFetchStreamDecisionForDebugHud: () => Promise<void>;

    // Auto-hide selection logic
    getAutoHideMs: () => number;

    // Current program fallback (Orchestrator-owned snapshot)
    getCurrentProgramForPlayback: () => ScheduledProgram | null;
}

export class NowPlayingInfoCoordinator {
    private nowPlayingInfoFetchToken = 0;
    private nowPlayingInfoLiveUpdateTimer: ReturnType<typeof setInterval> | null = null;
    private nowPlayingInfoDetails: PlexMediaItem | null = null;
    private nowPlayingInfoDetailsRatingKey: string | null = null;

    constructor(private readonly deps: NowPlayingInfoCoordinatorDeps) {}

    handleModalOpen(modalId: string): void {
        if (modalId !== this.deps.nowPlayingModalId) {
            return;
        }
        const overlay = this.deps.getNowPlayingInfo();
        const channelManager = this.deps.getChannelManager();
        if (!overlay || !channelManager) {
            return;
        }
        const program = ((): ScheduledProgram | null => {
            try {
                const scheduler = this.deps.getScheduler();
                if (scheduler) {
                    return scheduler.getCurrentProgram();
                }
            } catch (error) {
                console.warn(
                    '[NowPlayingInfoCoordinator] Scheduler unavailable, using fallback:',
                    error
                );
                // Fallback to last-known snapshot if scheduler is unavailable.
            }
            return this.deps.getCurrentProgramForPlayback();
        })();
        if (!program) {
            this.deps.getNavigation()?.closeModal(this.deps.nowPlayingModalId);
            return;
        }
        const channel = channelManager.getCurrentChannel();
        const viewModel = this.buildNowPlayingInfoViewModel(program, channel, null);
        overlay.setAutoHideMs(this.deps.getAutoHideMs());
        overlay.show(viewModel);
        this.startLiveUpdates();
        void this.fetchNowPlayingInfoDetails(program, channel);
        void this.deps.maybeFetchStreamDecisionForDebugHud();
    }

    handleModalClose(modalId: string): void {
        if (modalId !== this.deps.nowPlayingModalId) {
            return;
        }
        this.stopLiveUpdates();
        this.deps.getNowPlayingInfo()?.hide();
    }

    onProgramStart(program: ScheduledProgram): void {
        this.clearNowPlayingInfoDetails();
        const overlay = this.deps.getNowPlayingInfo();
        const navigation = this.deps.getNavigation();
        if (!overlay || !navigation?.isModalOpen(this.deps.nowPlayingModalId)) {
            return;
        }
        const channel = this.deps.getChannelManager()?.getCurrentChannel() ?? null;
        const viewModel = this.buildNowPlayingInfoViewModel(program, channel, null);
        overlay.setAutoHideMs(this.deps.getAutoHideMs());
        overlay.update(viewModel);
        void this.fetchNowPlayingInfoDetails(program, channel);
    }

    refreshIfOpen(): void {
        const overlay = this.deps.getNowPlayingInfo();
        const navigation = this.deps.getNavigation();
        if (!overlay || !navigation?.isModalOpen(this.deps.nowPlayingModalId)) {
            return;
        }
        try {
            const freshProgram =
                this.deps.getScheduler()?.getCurrentProgram() ??
                this.deps.getCurrentProgramForPlayback();
            const channel = this.deps.getChannelManager()?.getCurrentChannel() ?? null;
            if (freshProgram) {
                const viewModel = this.buildNowPlayingInfoViewModel(freshProgram, channel, null);
                overlay.update(viewModel);
            }
        } catch {
            // Silently ignore errors during UI refresh to prevent timer crashes.
        }
    }

    dispose(): void {
        this.stopLiveUpdates();
        this.nowPlayingInfoFetchToken += 1;
        this.clearNowPlayingInfoDetails();
    }

    private startLiveUpdates(): void {
        if (this.nowPlayingInfoLiveUpdateTimer !== null) {
            return;
        }
        // Only update while the modal is open; do not reset auto-hide timer.
        this.nowPlayingInfoLiveUpdateTimer = setInterval(() => {
            const overlay = this.deps.getNowPlayingInfo();
            const navigation = this.deps.getNavigation();
            const scheduler = this.deps.getScheduler();
            if (!overlay || !navigation || !scheduler) {
                return;
            }
            if (!navigation.isModalOpen(this.deps.nowPlayingModalId)) {
                return;
            }
            try {
                const program = scheduler.getCurrentProgram();
                if (!program) return;
                const channel = this.deps.getChannelManager()?.getCurrentChannel() ?? null;
                const details = this.getCachedDetailsForProgram(program);
                const viewModel = this.buildNowPlayingInfoViewModel(program, channel, details);
                overlay.update(viewModel);
            } catch {
                // Best-effort; never throw from a UI refresh timer.
            }
        }, 1000);
    }

    private stopLiveUpdates(): void {
        if (this.nowPlayingInfoLiveUpdateTimer === null) {
            return;
        }
        clearInterval(this.nowPlayingInfoLiveUpdateTimer);
        this.nowPlayingInfoLiveUpdateTimer = null;
    }

    private async fetchNowPlayingInfoDetails(
        program: ScheduledProgram,
        channel: ChannelConfig | null
    ): Promise<void> {
        const plexLibrary = this.deps.getPlexLibrary();
        const overlay = this.deps.getNowPlayingInfo();
        if (!plexLibrary || !overlay) {
            return;
        }
        const fetchToken = ++this.nowPlayingInfoFetchToken;
        try {
            const item = await plexLibrary.getItem(program.item.ratingKey);
            if (fetchToken !== this.nowPlayingInfoFetchToken) {
                return;
            }
            if (!item || !overlay.isVisible()) {
                return;
            }
            this.nowPlayingInfoDetails = item;
            this.nowPlayingInfoDetailsRatingKey = program.item.ratingKey;
            const viewModel = this.buildNowPlayingInfoViewModel(program, channel, item);
            overlay.update(viewModel);
        } catch (error) {
            console.warn(
                '[NowPlayingInfoCoordinator] Failed to load Now Playing details:',
                error
            );
        }
    }

    private buildNowPlayingInfoViewModel(
        program: ScheduledProgram,
        channel: ChannelConfig | null,
        details: PlexMediaItem | null
    ): NowPlayingInfoViewModel {
        const item = program.item;
        const channelName = channel?.name;
        const channelNumber = channel?.number;

        let title = item.title;
        let subtitle = '';

        if (item.type === 'episode') {
            const showTitle =
                details?.grandparentTitle ??
                this.extractShowTitle(item.fullTitle) ??
                item.title;
            title = showTitle || item.title;
            const episodeTitle = details?.title ?? item.title;
            const seasonNum = details?.seasonNumber ?? item.seasonNumber;
            const epNum = details?.episodeNumber ?? item.episodeNumber;
            const episodeCode = this.formatEpisodeCode(seasonNum, epNum);
            subtitle = episodeCode ? `${episodeCode} • ${episodeTitle}` : episodeTitle;
        } else {
            const year = details?.year ?? item.year;
            title = year > 0 ? `${item.title} (${year})` : item.title;
            const contentRating = details?.contentRating ?? item.contentRating ?? '';
            const runtimeMs = details?.durationMs ?? item.durationMs;
            const runtime = runtimeMs > 0 ? this.formatDuration(runtimeMs) : '';
            if (contentRating && runtime) {
                subtitle = `${contentRating} • ${runtime}`;
            } else if (contentRating) {
                subtitle = contentRating;
            } else if (runtime) {
                subtitle = runtime;
            }
        }

        const summary = details?.summary ?? '';
        const posterPath = details?.thumb ?? item.thumb ?? null;
        let posterUrl: string | null = null;
        if (posterPath) {
            const plexLibrary = this.deps.getPlexLibrary();
            if (plexLibrary) {
                const config = this.deps.getNowPlayingInfoConfig();
                const posterWidth = config?.posterWidth ?? NOW_PLAYING_INFO_DEFAULTS.posterWidth;
                const posterHeight = config?.posterHeight ?? NOW_PLAYING_INFO_DEFAULTS.posterHeight;
                const resized = plexLibrary.getImageUrl(posterPath, posterWidth, posterHeight);
                posterUrl = resized || null;
            }
            if (!posterUrl) {
                posterUrl = this.deps.buildPlexResourceUrl(posterPath);
            }
        }

        const debugText = this.deps.buildDebugText() ?? null;

        const baseViewModel: NowPlayingInfoViewModel = {
            title,
            subtitle,
            elapsedMs: program.elapsedMs,
            durationMs: program.item.durationMs,
            posterUrl,
            ...(channelName ? { channelName } : {}),
            ...(typeof channelNumber === 'number' ? { channelNumber } : {}),
            ...(debugText ? { debugText } : {}),
        };

        const upNext = this.buildUpNext();
        const withUpNext = upNext ? { ...baseViewModel, upNext } : baseViewModel;

        if (summary) {
            return {
                ...withUpNext,
                description: summary,
            };
        }

        return withUpNext;
    }

    private buildUpNext(): NowPlayingInfoViewModel['upNext'] | undefined {
        const scheduler = this.deps.getScheduler();
        if (!scheduler) {
            return undefined;
        }
        try {
            const next = scheduler.getNextProgram();
            if (!next) {
                return undefined;
            }
            const title = next.item?.title;
            const startsAtMs = next.scheduledStartTime;
            if (typeof title !== 'string' || title.trim().length === 0) {
                return undefined;
            }
            if (!Number.isFinite(startsAtMs)) {
                return undefined;
            }
            if (startsAtMs <= Date.now()) {
                return undefined;
            }
            return { title: title.trim(), startsAtMs };
        } catch {
            return undefined;
        }
    }

    private formatEpisodeCode(seasonNumber?: number, episodeNumber?: number): string {
        const season =
            typeof seasonNumber === 'number' ? `S${String(seasonNumber).padStart(2, '0')}` : '';
        const episode =
            typeof episodeNumber === 'number' ? `E${String(episodeNumber).padStart(2, '0')}` : '';
        return season && episode ? `${season}${episode}` : '';
    }

    private extractShowTitle(fullTitle: string | null | undefined): string | null {
        if (!fullTitle) return null;
        const parts = fullTitle.split(' - ');
        if (parts.length >= 2) {
            const first = parts[0] ?? '';
            return first.trim() || null;
        }
        return null;
    }

    private formatDuration(durationMs: number): string {
        const totalMinutes = Math.floor(durationMs / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        if (hours === 0) {
            return `${minutes}m`;
        }
        if (minutes === 0) {
            return `${hours}h`;
        }
        return `${hours}h ${minutes}m`;
    }

    private clearNowPlayingInfoDetails(): void {
        this.nowPlayingInfoDetails = null;
        this.nowPlayingInfoDetailsRatingKey = null;
    }

    private getCachedDetailsForProgram(program: ScheduledProgram): PlexMediaItem | null {
        if (!this.nowPlayingInfoDetails || !this.nowPlayingInfoDetailsRatingKey) {
            return null;
        }
        if (program.item.ratingKey !== this.nowPlayingInfoDetailsRatingKey) {
            return null;
        }
        return this.nowPlayingInfoDetails;
    }
}

export function getNowPlayingInfoAutoHideMs(
    config: NowPlayingInfoConfig | null | undefined
): number {
    const raw = safeLocalStorageGet(RETUNE_STORAGE_KEYS.NOW_PLAYING_INFO_AUTO_HIDE_MS);
    const parsed = raw ? Number(raw) : NaN;
    const configured = config?.autoHideMs;
    const candidates = [
        ...(Number.isFinite(parsed) ? [parsed] : []),
        ...(typeof configured === 'number' && Number.isFinite(configured) ? [configured] : []),
    ];
    for (const candidate of candidates) {
        if (candidate > 0) {
            const normalized = Math.max(1000, Math.floor(candidate));
            if (
                NOW_PLAYING_INFO_AUTO_HIDE_OPTIONS.includes(
                    normalized as (typeof NOW_PLAYING_INFO_AUTO_HIDE_OPTIONS)[number]
                )
            ) {
                return normalized;
            }
        }
    }
    return NOW_PLAYING_INFO_DEFAULTS.autoHideMs;
}
