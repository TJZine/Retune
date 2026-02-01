/**
 * @fileoverview Player OSD coordinator (state + view model).
 * @module modules/ui/player-osd/PlayerOsdCoordinator
 */

import type { INavigationManager } from '../../navigation';
import type { IVideoPlayer } from '../../player';
import type { PlaybackState, PlayerStatus, TimeRange } from '../../player/types';
import type { ChannelConfig } from '../../scheduler/channel-manager';
import type { ScheduledProgram } from '../../scheduler/scheduler';
import type { IPlayerOsdOverlay } from './interfaces';
import type { PlayerOsdReason, PlayerOsdViewModel } from './types';
import type { PlaybackOptionsSectionId } from '../playback-options/types';
import { buildPlaybackSummary, type PlaybackInfoSnapshotLike } from '../../../utils/playbackSummary';
import { formatAudioLabel } from '../../../utils/formatAudioLabel';
import { getChannelNameForDisplay } from '../channelDisplay';

const RECENT_USER_ACTION_MS = 2000;
const OSD_THROTTLE_MS = 250;
const PLAYER_OSD_ACTION_IDS = {
    subtitles: 'player-osd-action-subtitles',
    audio: 'player-osd-action-audio',
} as const;

const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
});

export interface PlayerOsdCoordinatorDeps {
    getOverlay: () => IPlayerOsdOverlay | null;
    getCurrentProgram: () => ScheduledProgram | null;
    getNextProgram: () => ScheduledProgram | null;
    getCurrentChannel: () => ChannelConfig | null;
    getVideoPlayer: () => IVideoPlayer | null;
    getAutoHideMs: () => number;
    getNavigation: () => INavigationManager | null;
    playbackOptionsModalId: string;
    preparePlaybackOptionsModal: (
        preferredSection: PlaybackOptionsSectionId
    ) => { focusableIds: string[]; preferredFocusId: string | null };
    getPlaybackInfoSnapshot: () => PlaybackInfoSnapshotLike | null;
}

export class PlayerOsdCoordinator {
    private _autoHideTimer: number | null = null;
    private _lastUserActionAt = 0;
    private _lastReason: PlayerOsdReason = 'status';
    private _lastState: PlaybackState | null = null;
    private _lastTimeUpdate: { currentTimeMs: number; durationMs: number } | null = null;
    private _bufferedRanges: TimeRange[] = [];
    private _actionsRegistered = false;
    private _throttledRenderTimer: number | null = null;
    private _lastThrottledRenderAt = 0;

    constructor(private readonly deps: PlayerOsdCoordinatorDeps) {}

    poke(reason: PlayerOsdReason): void {
        this._lastUserActionAt = Date.now();
        this._lastReason = reason;
        this._clearThrottledRenderTimer();
        this._renderAndShow(reason);

        const status = this._getPlaybackStatus();
        if (status === 'playing') {
            this._scheduleAutoHide();
        }
    }

    toggle(): void {
        const overlay = this.deps.getOverlay();
        if (!overlay) return;

        if (overlay.isVisible()) {
            this.hide();
            return;
        }

        this._lastUserActionAt = Date.now();
        this._lastReason = 'status';
        this._renderAndShow(this._lastReason);

        const status = this._getPlaybackStatus();
        if (status === 'playing') {
            this._scheduleAutoHide();
        }
    }

    hide(): void {
        this._clearAutoHideTimer();
        this._clearThrottledRenderTimer();
        this._unregisterActions();
        this.deps.getOverlay()?.hide();
    }

    onPlayerStateChange(state: PlaybackState): void {
        this._lastState = state;
        this._lastTimeUpdate = {
            currentTimeMs: state.currentTimeMs,
            durationMs: state.durationMs,
        };

        switch (state.status) {
            case 'paused':
                this._lastReason = 'pause';
                this._clearAutoHideTimer();
                this._renderAndShow(this._lastReason);
                return;
            case 'seeking':
                this._lastReason = 'seek';
                this._clearAutoHideTimer();
                this._renderAndShow(this._lastReason);
                return;
            case 'playing':
                if (this._isRecentUserAction()) {
                    this._renderAndShow(this._lastReason);
                    this._scheduleAutoHide();
                }
                return;
            case 'loading':
            case 'buffering':
            case 'idle':
            case 'error':
            case 'ended':
            default:
                this.hide();
                return;
        }
    }

    onTimeUpdate(payload: { currentTimeMs: number; durationMs: number }): void {
        this._lastTimeUpdate = payload;
        this._requestThrottledRender();
    }

    onBufferUpdate(payload: { bufferedRanges: TimeRange[] }): void {
        this._bufferedRanges = Array.isArray(payload.bufferedRanges)
            ? payload.bufferedRanges.slice()
            : [];
        this._requestThrottledRender();
    }

    private _renderAndShow(reason: PlayerOsdReason): void {
        const overlay = this.deps.getOverlay();
        if (!overlay) return;
        this._clearThrottledRenderTimer();
        overlay.setViewModel(this._buildViewModel(reason));
        this._lastThrottledRenderAt = Date.now();
        overlay.show();
        this._registerActions();
    }

    private _clearThrottledRenderTimer(): void {
        if (this._throttledRenderTimer !== null) {
            globalThis.clearTimeout(this._throttledRenderTimer);
            this._throttledRenderTimer = null;
        }
    }

    private _requestThrottledRender(): void {
        const overlay = this.deps.getOverlay();
        if (!overlay || !overlay.isVisible()) {
            return;
        }
        if (this._throttledRenderTimer !== null) {
            return;
        }
        const now = Date.now();
        const elapsed = now - this._lastThrottledRenderAt;
        if (elapsed >= OSD_THROTTLE_MS) {
            overlay.setViewModel(this._buildViewModel(this._lastReason));
            this._lastThrottledRenderAt = now;
            return;
        }

        this._throttledRenderTimer = globalThis.setTimeout(() => {
            this._throttledRenderTimer = null;
            const nextNow = Date.now();
            overlay.setViewModel(this._buildViewModel(this._lastReason));
            this._lastThrottledRenderAt = nextNow;
        }, OSD_THROTTLE_MS - elapsed) as unknown as number;
    }

    private _buildViewModel(reason: PlayerOsdReason): PlayerOsdViewModel {
        const channel = this.deps.getCurrentChannel();
        const program = this.deps.getCurrentProgram();
        const player = this.deps.getVideoPlayer();
        const status = this._getPlaybackStatus();
        const lastUpdate = this._lastTimeUpdate;

        const currentTimeMs = Math.max(0, lastUpdate?.currentTimeMs ?? this._lastState?.currentTimeMs ?? 0);
        const durationMs = Math.max(0, lastUpdate?.durationMs ?? this._lastState?.durationMs ?? 0);
        const clampedTimeMs = durationMs > 0 ? Math.min(currentTimeMs, durationMs) : currentTimeMs;
        const playedRatio = durationMs > 0 ? clamp01(clampedTimeMs / durationMs) : 0;
        const bufferedRatio = this._computeBufferedRatio(clampedTimeMs, durationMs, playedRatio);
        const isLive = durationMs <= 0;

        const channelPrefix = formatChannelPrefix(channel);
        const title = program?.item.title ?? '';
        const subtitle = program?.item.fullTitle && program.item.fullTitle !== program.item.title
            ? program.item.fullTitle
            : null;

        const timecode = isLive
            ? 'Live'
            : `${formatTimecode(clampedTimeMs)} / ${formatTimecode(durationMs)}`;

        const nowMs = Date.now();
        const remainingMs = program
            ? Math.max(0, program.scheduledEndTime - nowMs)
            : Math.max(0, durationMs - clampedTimeMs);

        const remainingLabel = formatRemainingLabel(remainingMs);
        const endsAtLabel = formatEndsAt(nowMs, remainingMs);
        const endsAtText = isLive
            ? null
            : remainingLabel && endsAtLabel
                ? `${remainingLabel} • ${endsAtLabel}`
                : endsAtLabel;

        const bufferAheadMs = durationMs > 0
            ? Math.max(0, bufferedRatio * durationMs - clampedTimeMs)
            : 0;

        const bufferText = formatBufferText(bufferAheadMs);
        const upNextText = this._buildUpNextText(isLive, nowMs);
        const playbackSnapshot = this.deps.getPlaybackInfoSnapshot();
        const directPlayResolution = playbackSnapshot?.stream?.isDirectPlay
            ? program?.item.mediaInfo?.resolution ?? null
            : null;
        const playback = buildPlaybackSummary(playbackSnapshot, {
            resolutionOverride: directPlayResolution,
        });

        const state = this._lastState ?? player?.getState();
        const audioLabel = this._buildAudioLabel(player, state?.activeAudioId ?? null);
        const subtitleLabel = this._buildSubtitleLabel(player, state?.activeSubtitleId ?? null);
        const controlHint = 'D-pad Navigate | OK Select | Back Close';

        return {
            reason,
            statusLabel: mapStatusLabel(status),
            channelPrefix,
            title,
            subtitle,
            isLive,
            currentTimeMs: clampedTimeMs,
            durationMs,
            playedRatio,
            bufferedRatio,
            timecode,
            endsAtText,
            bufferText,
            ...(upNextText ? { upNextText } : {}),
            actionIds: { ...PLAYER_OSD_ACTION_IDS },
            playbackText: playback.tag,
            audioLabel,
            subtitleLabel,
            controlHint,
        };
    }

    private _computeBufferedRatio(
        currentTimeMs: number,
        durationMs: number,
        playedRatio: number
    ): number {
        if (durationMs <= 0) {
            return playedRatio;
        }

        let bufferedEndMs = currentTimeMs;
        let matchedEndMs = -1;
        for (const range of this._bufferedRanges) {
            if (!range) continue;
            const startMs = range.startMs ?? 0;
            const endMs = range.endMs ?? 0;
            if (startMs <= currentTimeMs && endMs >= currentTimeMs) {
                if (endMs > matchedEndMs) {
                    matchedEndMs = endMs;
                }
            }
        }

        if (matchedEndMs >= 0) {
            bufferedEndMs = matchedEndMs;
        }

        const clampedEndMs = Math.max(currentTimeMs, Math.min(bufferedEndMs, durationMs));
        const ratio = clamp01(clampedEndMs / durationMs);
        return Math.max(playedRatio, ratio);
    }

    private _isRecentUserAction(): boolean {
        return Date.now() - this._lastUserActionAt <= RECENT_USER_ACTION_MS;
    }

    private _getPlaybackStatus(): PlayerStatus {
        if (this._lastState) return this._lastState.status;
        const state = this.deps.getVideoPlayer()?.getState();
        return state?.status ?? 'idle';
    }

    private _scheduleAutoHide(): void {
        this._clearAutoHideTimer();
        const autoHideMs = sanitizeAutoHideMs(this.deps.getAutoHideMs());
        this._autoHideTimer = globalThis.setTimeout(() => {
            this._autoHideTimer = null;
            this.hide();
        }, autoHideMs) as unknown as number;
    }

    private _clearAutoHideTimer(): void {
        if (this._autoHideTimer !== null) {
            globalThis.clearTimeout(this._autoHideTimer);
            this._autoHideTimer = null;
        }
    }

    private _buildUpNextText(isLive: boolean, nowMs: number): string | null {
        if (isLive) {
            return null;
        }
        const next = this.deps.getNextProgram();
        if (!next) {
            return null;
        }
        const startsAtMs = next.scheduledStartTime;
        if (!Number.isFinite(startsAtMs) || startsAtMs <= nowMs) {
            return null;
        }
        const title = next.item?.title?.trim();
        if (!title) {
            return null;
        }
        const formatted = TIME_FORMATTER.format(new Date(startsAtMs));
        return `Up next • ${formatted} — ${title}`;
    }

    private _registerActions(): void {
        if (this._actionsRegistered) return;
        const navigation = this.deps.getNavigation();
        if (!navigation) return;
        if (typeof document === 'undefined') return;

        const subtitlesEl = document.getElementById(PLAYER_OSD_ACTION_IDS.subtitles) as HTMLElement | null;
        const audioEl = document.getElementById(PLAYER_OSD_ACTION_IDS.audio) as HTMLElement | null;
        if (!subtitlesEl || !audioEl) return;

        navigation.registerFocusable({
            id: PLAYER_OSD_ACTION_IDS.subtitles,
            element: subtitlesEl,
            neighbors: { right: PLAYER_OSD_ACTION_IDS.audio },
            onSelect: () => this._openPlaybackOptions('subtitles'),
        });
        navigation.registerFocusable({
            id: PLAYER_OSD_ACTION_IDS.audio,
            element: audioEl,
            neighbors: { left: PLAYER_OSD_ACTION_IDS.subtitles },
            onSelect: () => this._openPlaybackOptions('audio'),
        });

        if (!navigation.isModalOpen()) {
            navigation.setFocus(PLAYER_OSD_ACTION_IDS.subtitles);
        }
        this._actionsRegistered = true;
    }

    private _unregisterActions(): void {
        if (!this._actionsRegistered) return;
        const navigation = this.deps.getNavigation();
        if (!navigation) return;
        navigation.unregisterFocusable(PLAYER_OSD_ACTION_IDS.subtitles);
        navigation.unregisterFocusable(PLAYER_OSD_ACTION_IDS.audio);
        this._actionsRegistered = false;
    }

    private _openPlaybackOptions(section: PlaybackOptionsSectionId): void {
        const navigation = this.deps.getNavigation();
        if (!navigation) return;
        if (navigation.isModalOpen()) return;

        const prep = this.deps.preparePlaybackOptionsModal(section);
        this.hide();
        navigation.openModal(this.deps.playbackOptionsModalId, prep.focusableIds);
        if (prep.preferredFocusId) {
            navigation.setFocus(prep.preferredFocusId);
        }
    }

    private _buildAudioLabel(player: IVideoPlayer | null, activeAudioId: string | null): string | null {
        const tracks = player?.getAvailableAudio() ?? [];
        if (!activeAudioId) {
            return tracks.length > 0 ? 'Unknown' : null;
        }
        const active = tracks.find((track) => track.id === activeAudioId) ?? null;
        if (!active) {
            return tracks.length > 0 ? 'Unknown' : null;
        }
        return formatAudioLabel(active);
    }

    private _buildSubtitleLabel(player: IVideoPlayer | null, activeSubtitleId: string | null): string | null {
        const tracks = player?.getAvailableSubtitles() ?? [];
        if (!activeSubtitleId) {
            return 'Off';
        }
        const active = tracks.find((track) => track.id === activeSubtitleId) ?? null;
        if (!active) {
            return tracks.length > 0 ? 'On' : 'Off';
        }
        return active.label || 'On';
    }
}

function formatChannelPrefix(channel: ChannelConfig | null): string {
    if (!channel) return '';
    const displayName = getChannelNameForDisplay({
        name: channel.name,
        sourceLibraryName: channel.sourceLibraryName ?? null,
    });
    const hasNumber = typeof channel.number === 'number' && Number.isFinite(channel.number);
    const hasName = typeof displayName === 'string' && displayName.length > 0;
    if (hasNumber && hasName) {
        return `${channel.number} ${displayName}`;
    }
    if (hasName) {
        return displayName;
    }
    if (hasNumber) {
        return `${channel.number}`;
    }
    return '';
}

function mapStatusLabel(status: PlayerStatus): PlayerOsdViewModel['statusLabel'] {
    switch (status) {
        case 'playing':
            return 'PLAYING';
        case 'paused':
            return 'PAUSED';
        case 'seeking':
            return 'SEEKING';
        case 'buffering':
            return 'BUFFERING';
        case 'loading':
            return 'LOADING';
        case 'idle':
        case 'ended':
        case 'error':
        default:
            return 'STOPPED';
    }
}

function formatTimecode(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatEndsAt(nowMs: number, remainingMs: number): string | null {
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
        return null;
    }
    const endsAtMs = nowMs + remainingMs;
    const formatted = TIME_FORMATTER.format(new Date(endsAtMs));
    return `Ends ${formatted}`;
}

function formatRemainingLabel(remainingMs: number): string | null {
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
        return null;
    }
    if (remainingMs < 60_000) {
        return '<1m left';
    }
    const minutes = Math.floor(remainingMs / 60_000);
    return `${minutes}m left`;
}

function formatBufferText(bufferAheadMs: number): string | null {
    if (!Number.isFinite(bufferAheadMs) || bufferAheadMs < 5000) {
        return null;
    }
    const seconds = Math.round(bufferAheadMs / 1000);
    return `Buffer +${seconds}s`;
}

function sanitizeAutoHideMs(value: number): number {
    if (!Number.isFinite(value) || value <= 0) {
        return 3000;
    }
    return Math.floor(value);
}

function clamp01(value: number): number {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}
