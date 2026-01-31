/**
 * @fileoverview Coordinates Now Playing overlay lifecycle, detail fetching, and live updates.
 * @module modules/ui/now-playing-info/NowPlayingInfoCoordinator
 * @version 1.0.0
 */

import type { INavigationManager } from '../../navigation';
import type { IChannelScheduler, ScheduledProgram } from '../../scheduler/scheduler';
import type { IChannelManager, ChannelConfig } from '../../scheduler/channel-manager';
import type { IPlexLibrary, PlexMediaItem } from '../../plex/library';
import type { INowPlayingInfoOverlay, NowPlayingInfoViewModel } from './index';
import type { NowPlayingInfoConfig } from './types';
import { NOW_PLAYING_INFO_AUTO_HIDE_OPTIONS, NOW_PLAYING_INFO_DEFAULTS } from './constants';
import { safeLocalStorageGet } from '../../../utils/storage';
import { RETUNE_STORAGE_KEYS } from '../../../config/storageKeys';
import { buildPlaybackSummary, type PlaybackInfoSnapshotLike } from '../../../utils/playbackSummary';
import { formatAudioCodec } from '../../../utils/mediaFormat';

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

    // Playback snapshot for mode/details
    getPlaybackInfoSnapshot: () => PlaybackInfoSnapshotLike | null;
    refreshPlaybackInfoSnapshot: () => Promise<PlaybackInfoSnapshotLike>;
}

export class NowPlayingInfoCoordinator {
    private nowPlayingInfoFetchToken = 0;
    private nowPlayingInfoLiveUpdateTimer: ReturnType<typeof setInterval> | null = null;
    private nowPlayingInfoDetails: PlexMediaItem | null = null;
    private nowPlayingInfoDetailsRatingKey: string | null = null;

    constructor(private readonly deps: NowPlayingInfoCoordinatorDeps) { }

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
        void this.refreshPlaybackSummary(program, channel);
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
        void this.refreshPlaybackSummary(program, channel);
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
        const posterPath = item.type === 'episode'
            ? (details?.grandparentThumb ?? item.showThumb ?? item.thumb ?? null)
            : (details?.thumb ?? item.thumb ?? null);
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
        const badges = this.buildQualityBadges(item);
        const metaLines = this.buildMetaLines(item, details);
        const actorHeadshots = this.buildActorHeadshots(details);
        const playback = buildPlaybackSummary(this.deps.getPlaybackInfoSnapshot());

        const baseViewModel: NowPlayingInfoViewModel = {
            title,
            subtitle,
            elapsedMs: program.elapsedMs,
            durationMs: program.item.durationMs,
            posterUrl,
            ...(badges.length > 0 ? { badges } : {}),
            ...(metaLines.length > 0 ? { metaLines } : {}),
            ...(playback.summary ? { playbackSummary: playback.summary } : {}),
            ...(playback.details.length > 0 ? { playbackDetails: playback.details } : {}),
            ...(actorHeadshots.headshots.length > 0 ? { actorHeadshots: actorHeadshots.headshots } : {}),
            ...(actorHeadshots.headshots.length > 0 ? { actorTotalCount: actorHeadshots.totalCount } : {}),
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

    private async refreshPlaybackSummary(
        program: ScheduledProgram,
        channel: ChannelConfig | null
    ): Promise<void> {
        try {
            await this.deps.refreshPlaybackInfoSnapshot();
        } catch {
            return;
        }

        const overlay = this.deps.getNowPlayingInfo();
        const navigation = this.deps.getNavigation();
        if (!overlay || !navigation?.isModalOpen(this.deps.nowPlayingModalId)) {
            return;
        }
        const details = this.getCachedDetailsForProgram(program);
        const viewModel = this.buildNowPlayingInfoViewModel(program, channel, details);
        overlay.update(viewModel);
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

    private buildMetaLines(
        item: ScheduledProgram['item'],
        details: PlexMediaItem | null
    ): string[] {
        const genres = this.pickFirstNonEmpty(details?.genres, item.genres);
        const directors = this.pickFirstNonEmpty(details?.directors, item.directors);
        const actors = this.pickFirstNonEmpty(details?.actors);
        const studios = this.pickFirstNonEmpty(details?.studios);

        const metaLines: string[] = [];
        const maxStudios = actors.length > 0 ? 1 : 2;
        const trimmedGenres = genres.slice(0, 3);
        const trimmedStudios = studios.slice(0, maxStudios);

        if (trimmedGenres.length > 0 || trimmedStudios.length > 0) {
            const lineParts: string[] = [];
            if (trimmedGenres.length > 0) {
                lineParts.push(trimmedGenres.join(' • '));
            }
            if (trimmedStudios.length > 0) {
                if (trimmedGenres.length === 0) {
                    const label = trimmedStudios.length > 1 ? 'Studios' : 'Studio';
                    lineParts.push(`${label}: ${trimmedStudios.join(' • ')}`);
                } else {
                    lineParts.push(trimmedStudios.join(' • '));
                }
            }
            if (lineParts.length > 0) {
                metaLines.push(lineParts.join(' • '));
            }
        }

        if (actors.length > 0) {
            const shown = actors.slice(0, 3);
            let castLine = `Cast: ${shown.join(' • ')}`;
            const remaining = actors.length - shown.length;
            if (remaining > 0) {
                castLine += ` +${remaining}`;
            }
            metaLines.push(castLine);
        } else if (directors.length > 0) {
            const shown = directors.slice(0, 2);
            const label = shown.length > 1 ? 'Directors' : 'Director';
            metaLines.push(`${label}: ${shown.join(' • ')}`);
        }

        return metaLines;
    }

    private buildActorHeadshots(
        details: PlexMediaItem | null
    ): { headshots: Array<{ name: string; url: string | null }>; totalCount: number } {
        if (!details?.actorRoles || details.actorRoles.length === 0) {
            return { headshots: [], totalCount: 0 };
        }
        const roles = this.cleanActorRoles(details.actorRoles);
        if (roles.length === 0) {
            return { headshots: [], totalCount: 0 };
        }

        const config = this.deps.getNowPlayingInfoConfig();
        const thumbSize = config?.actorThumbSize ?? NOW_PLAYING_INFO_DEFAULTS.actorThumbSize;
        const maxCountRaw = config?.actorHeadshotCount ?? NOW_PLAYING_INFO_DEFAULTS.actorHeadshotCount;
        const maxCount = Number.isFinite(maxCountRaw)
            ? Math.max(1, Math.min(6, Math.floor(maxCountRaw)))
            : NOW_PLAYING_INFO_DEFAULTS.actorHeadshotCount;
        const plexLibrary = this.deps.getPlexLibrary();

        const headshots = roles.slice(0, maxCount).map((role) => {
            const thumb = role.thumb ?? null;
            let url: string | null = null;
            if (thumb) {
                if (plexLibrary) {
                    const resized = plexLibrary.getImageUrl(thumb, thumbSize, thumbSize);
                    url = resized || null;
                }
                if (!url) {
                    url = this.deps.buildPlexResourceUrl(thumb);
                }
            }
            return { name: role.name, url };
        });
        return { headshots, totalCount: roles.length };
    }

    private cleanActorRoles(roles: PlexMediaItem['actorRoles']): Array<{ name: string; thumb?: string | null }> {
        if (!roles || roles.length === 0) {
            return [];
        }
        const seen = new Set<string>();
        const cleaned: Array<{ name: string; thumb?: string | null }> = [];
        for (const role of roles) {
            const trimmed = role.name.trim();
            if (!trimmed) continue;
            const key = trimmed.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            cleaned.push({ name: trimmed, thumb: role.thumb ?? null });
        }
        return cleaned;
    }

    private pickFirstNonEmpty(...lists: Array<string[] | null | undefined>): string[] {
        for (const list of lists) {
            const cleaned = this.cleanTagList(list);
            if (cleaned.length > 0) {
                return cleaned;
            }
        }
        return [];
    }

    private cleanTagList(list: string[] | null | undefined): string[] {
        if (!list || list.length === 0) return [];
        const seen = new Set<string>();
        const cleaned: string[] = [];
        for (const entry of list) {
            const trimmed = entry?.trim();
            if (!trimmed || seen.has(trimmed)) continue;
            seen.add(trimmed);
            cleaned.push(trimmed);
        }
        return cleaned;
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

    private buildQualityBadges(item: ScheduledProgram['item']): string[] {
        const mediaInfo = item.mediaInfo;
        if (!mediaInfo) return [];

        const badges: string[] = [];
        if (mediaInfo.resolution) badges.push(mediaInfo.resolution);
        if (mediaInfo.hdr) badges.push(mediaInfo.hdr);
        if (mediaInfo.audioCodec) {
            const audioCodec = formatAudioCodec(mediaInfo.audioCodec);
            if (audioCodec) badges.push(audioCodec);
        }
        const audioDetail = this.formatAudioDetail(mediaInfo);
        if (audioDetail) badges.push(audioDetail);
        return badges;
    }

    private formatAudioDetail(
        mediaInfo: ScheduledProgram['item']['mediaInfo'] | undefined
    ): string | null {
        if (!mediaInfo) return null;

        if (typeof mediaInfo.audioChannels === 'number' && mediaInfo.audioChannels > 0) {
            switch (mediaInfo.audioChannels) {
                case 1:
                    return '1.0';
                case 2:
                    return '2.0';
                case 6:
                    return '5.1';
                case 8:
                    return '7.1';
                default:
                    return `${mediaInfo.audioChannels}ch`;
            }
        }

        if (mediaInfo.audioTrackTitle) {
            const trimmed = mediaInfo.audioTrackTitle.trim();
            return trimmed.length > 0 ? trimmed.slice(0, 24) : null;
        }

        return null;
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
