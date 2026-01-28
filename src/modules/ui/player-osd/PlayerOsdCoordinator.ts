/**
 * @fileoverview Player OSD coordinator (state + view model).
 * @module modules/ui/player-osd/PlayerOsdCoordinator
 */

import type { IVideoPlayer } from '../../player';
import type { PlaybackState, PlayerStatus, TimeRange } from '../../player/types';
import type { ChannelConfig } from '../../scheduler/channel-manager';
import type { ScheduledProgram } from '../../scheduler/scheduler';
import type { IPlayerOsdOverlay } from './interfaces';
import type { PlayerOsdReason, PlayerOsdViewModel } from './types';

const RECENT_USER_ACTION_MS = 2000;

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
}

export class PlayerOsdCoordinator {
    private _autoHideTimer: number | null = null;
    private _lastUserActionAt = 0;
    private _lastReason: PlayerOsdReason = 'status';
    private _lastState: PlaybackState | null = null;
    private _lastTimeUpdate: { currentTimeMs: number; durationMs: number } | null = null;
    private _bufferedRanges: TimeRange[] = [];

    constructor(private readonly deps: PlayerOsdCoordinatorDeps) {}

    poke(reason: PlayerOsdReason): void {
        this._lastUserActionAt = Date.now();
        this._lastReason = reason;
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
        this._renderIfVisible();
    }

    onBufferUpdate(payload: { bufferedRanges: TimeRange[] }): void {
        this._bufferedRanges = Array.isArray(payload.bufferedRanges)
            ? payload.bufferedRanges.slice()
            : [];
        this._renderIfVisible();
    }

    private _renderIfVisible(): void {
        const overlay = this.deps.getOverlay();
        if (!overlay || !overlay.isVisible()) {
            return;
        }
        overlay.setViewModel(this._buildViewModel(this._lastReason));
    }

    private _renderAndShow(reason: PlayerOsdReason): void {
        const overlay = this.deps.getOverlay();
        if (!overlay) return;
        overlay.setViewModel(this._buildViewModel(reason));
        overlay.show();
    }

    private _buildViewModel(reason: PlayerOsdReason): PlayerOsdViewModel {
        const channel = this.deps.getCurrentChannel();
        const program = this.deps.getCurrentProgram();
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

        const endsAtText = isLive ? null : formatEndsAt(nowMs, remainingMs);

        const bufferAheadMs = durationMs > 0
            ? Math.max(0, bufferedRatio * durationMs - clampedTimeMs)
            : 0;

        const bufferText = formatBufferText(bufferAheadMs);
        const upNextText = this._buildUpNextText(isLive, nowMs);

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
}

function formatChannelPrefix(channel: ChannelConfig | null): string {
    if (!channel) return '';
    const hasNumber = typeof channel.number === 'number' && Number.isFinite(channel.number);
    const hasName = typeof channel.name === 'string' && channel.name.length > 0;
    if (hasNumber && hasName) {
        return `${channel.number} ${channel.name}`;
    }
    if (hasName) {
        return channel.name;
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
