/**
 * @fileoverview Manages mini-guide overlay state, row building, and channel switching.
 * @module modules/ui/mini-guide/MiniGuideCoordinator
 * @version 1.0.0
 */

import type { IChannelManager, ChannelConfig, ResolvedChannelContent } from '../../scheduler/channel-manager';
import type { IChannelScheduler, ScheduledProgram, ScheduleConfig } from '../../scheduler/scheduler';
import { ScheduleCalculator, ShuffleGenerator } from '../../scheduler/scheduler';
import type { IMiniGuideOverlay } from './interfaces';
import type { MiniGuideChannelViewModel, MiniGuideViewModel } from './types';
import { getChannelNameForDisplay } from '../channelDisplay';

const ROW_COUNT = 5;
const CENTER_INDEX = 2;
const PAGE_JUMP = 5;

export interface MiniGuideCoordinatorDeps {
    getOverlay: () => IMiniGuideOverlay | null;
    getChannelManager: () => IChannelManager | null;
    getScheduler: () => IChannelScheduler | null;

    buildDailyScheduleConfig: (
        channel: ChannelConfig,
        items: ResolvedChannelContent['items'],
        referenceTimeMs: number
    ) => ScheduleConfig;

    switchToChannel: (channelId: string) => Promise<void>;
    getAutoHideMs: () => number;
}

export class MiniGuideCoordinator {
    private _autoHideTimer: number | null = null;
    private _abortController: AbortController | null = null;
    private _focusedIndex = CENTER_INDEX;
    private _allChannels: ChannelConfig[] = [];
    private _windowStartIndex = 0;
    private _channels: ChannelConfig[] = [];
    private _viewModel: MiniGuideViewModel | null = null;
    private _showToken = 0;
    private _playingChannelId: string | null = null;
    private readonly _shuffler = new ShuffleGenerator();

    constructor(private readonly deps: MiniGuideCoordinatorDeps) { }

    show(): void {
        const overlay = this.deps.getOverlay();
        const channelManager = this.deps.getChannelManager();
        if (!overlay || !channelManager) {
            return;
        }
        const allChannels = channelManager.getAllChannels();
        if (allChannels.length === 0) {
            return;
        }

        const current = channelManager.getCurrentChannel() ?? allChannels[0]!;
        const currentIndex = Math.max(0, allChannels.findIndex((channel) => channel.id === current.id));
        this._allChannels = allChannels;
        this._playingChannelId = current?.id ?? null;
        this._windowStartIndex = wrapIndex(currentIndex - CENTER_INDEX, allChannels.length);
        this._channels = this._buildWindowChannels(this._windowStartIndex);
        this._focusedIndex = CENTER_INDEX;

        this._abortInFlight();
        const token = this._showToken;
        const fastViewModel = this._buildFastViewModel(current);
        this._viewModel = fastViewModel;

        overlay.setViewModel(fastViewModel);
        overlay.setFocusedIndex(this._focusedIndex);
        overlay.show();
        this._scheduleAutoHide();

        const abortController = new AbortController();
        this._abortController = abortController;

        this._startResolveForWindow(current, abortController, token);
    }

    hide(): void {
        this._abortInFlight();
        this._clearAutoHideTimer();
        this._viewModel = null;
        this.deps.getOverlay()?.hide();
    }

    handleNavigation(direction: 'up' | 'down'): boolean {
        const overlay = this.deps.getOverlay();
        if (!overlay || !overlay.isVisible()) {
            return false;
        }
        if (direction === 'up') {
            if (this._focusedIndex > 0) {
                this._focusedIndex -= 1;
                overlay.setFocusedIndex(this._focusedIndex);
            } else {
                this._windowStartIndex = wrapIndex(this._windowStartIndex - 1, this._allChannels.length);
                this._refreshWindow();
            }
        } else {
            if (this._focusedIndex < ROW_COUNT - 1) {
                this._focusedIndex += 1;
                overlay.setFocusedIndex(this._focusedIndex);
            } else {
                this._windowStartIndex = wrapIndex(this._windowStartIndex + 1, this._allChannels.length);
                this._refreshWindow();
            }
        }
        this._scheduleAutoHide();
        return true;
    }

    handlePage(direction: 'up' | 'down'): boolean {
        const overlay = this.deps.getOverlay();
        if (!overlay || !overlay.isVisible()) {
            return false;
        }
        const delta = direction === 'up' ? -PAGE_JUMP : PAGE_JUMP;
        this._windowStartIndex = wrapIndex(this._windowStartIndex + delta, this._allChannels.length);
        this._refreshWindow();
        this._scheduleAutoHide();
        return true;
    }

    handleSelect(): void {
        const selected = this._channels[this._focusedIndex];
        if (!selected) {
            return;
        }
        this.hide();
        this.deps.switchToChannel(selected.id).catch((error) => {
            console.warn('[MiniGuideCoordinator] Failed to switch channel:', error);
        });
    }

    private _refreshWindow(): void {
        if (this._allChannels.length === 0) {
            return;
        }
        const overlay = this.deps.getOverlay();
        if (!overlay || !overlay.isVisible()) {
            return;
        }
        const current = this._allChannels.find((channel) => channel.id === this._playingChannelId) ?? null;
        this._channels = this._buildWindowChannels(this._windowStartIndex);

        this._abortInFlight();
        const token = this._showToken;
        const fastViewModel = this._buildFastViewModel(current);
        this._viewModel = fastViewModel;
        overlay.setViewModel(fastViewModel);
        overlay.setFocusedIndex(this._focusedIndex);

        const abortController = new AbortController();
        this._abortController = abortController;
        this._startResolveForWindow(current, abortController, token);
    }

    private _buildWindowChannels(startIndex: number): ChannelConfig[] {
        const channels: ChannelConfig[] = [];
        const length = this._allChannels.length;
        for (let i = 0; i < ROW_COUNT; i += 1) {
            const index = wrapIndex(startIndex + i, length);
            channels.push(this._allChannels[index]!);
        }
        return channels;
    }

    private _startResolveForWindow(
        current: ChannelConfig | null,
        abortController: AbortController,
        token: number
    ): void {
        const pendingResolves = new Map<string, { channel: ChannelConfig; indices: number[] }>();
        for (let i = 0; i < ROW_COUNT; i += 1) {
            const channel = this._channels[i]!;
            if (current && channel.id === current.id) {
                continue;
            }
            const existing = pendingResolves.get(channel.id);
            if (existing) {
                existing.indices.push(i);
            } else {
                pendingResolves.set(channel.id, { channel, indices: [i] });
            }
        }

        for (const entry of pendingResolves.values()) {
            void this._resolveChannel(entry.channel, entry.indices, abortController, token);
        }
    }

    private _buildFastViewModel(current: ChannelConfig | null): MiniGuideViewModel {
        const rows: MiniGuideChannelViewModel[] = [];
        for (let i = 0; i < ROW_COUNT; i += 1) {
            const channel = this._channels[i]!;
            if (current && channel.id === current.id) {
                rows.push(this._buildCurrentRow(channel, current));
                continue;
            }
            rows.push(this._buildLoadingRow(channel));
        }
        return { channels: rows };
    }

    private _buildCurrentRow(channel: ChannelConfig, current: ChannelConfig): MiniGuideChannelViewModel {
        if (channel.id !== current.id) {
            return this._buildLoadingRow(channel);
        }
        const scheduler = this.deps.getScheduler();
        if (!scheduler) {
            return this._buildUnavailableRow(channel);
        }
        try {
            const state = scheduler.getState();
            if (!state.isActive || state.channelId !== current.id) {
                return this._buildUnavailableRow(channel);
            }
            const now = scheduler.getCurrentProgram();
            const next = scheduler.getNextProgram();
            return this._buildRowFromPrograms(channel, now, next);
        } catch {
            return this._buildUnavailableRow(channel);
        }
    }

    private _buildLoadingRow(channel: ChannelConfig): MiniGuideChannelViewModel {
        const displayName = getChannelNameForDisplay({
            name: channel.name,
            sourceLibraryName: channel.sourceLibraryName ?? null,
        });
        return {
            channelId: channel.id,
            channelNumber: channel.number,
            channelName: displayName,
            nowTitle: 'Loading...',
            nextTitle: null,
            nowProgress: 0,
        };
    }

    private _buildUnavailableRow(channel: ChannelConfig): MiniGuideChannelViewModel {
        const displayName = getChannelNameForDisplay({
            name: channel.name,
            sourceLibraryName: channel.sourceLibraryName ?? null,
        });
        return {
            channelId: channel.id,
            channelNumber: channel.number,
            channelName: displayName,
            nowTitle: 'Unavailable',
            nextTitle: null,
            nowProgress: 0,
        };
    }

    private async _resolveChannel(
        channel: ChannelConfig,
        indices: number[],
        controller: AbortController,
        token: number
    ): Promise<void> {
        const channelManager = this.deps.getChannelManager();
        if (!channelManager) {
            return;
        }
        try {
            const resolved = await channelManager.resolveChannelContent(channel.id, {
                signal: controller.signal,
            });
            if (controller.signal.aborted || token !== this._showToken) {
                return;
            }
            const row = this._buildResolvedRow(channel, resolved, Date.now());
            for (const index of indices) {
                this._updateRow(index, row, token);
            }
        } catch {
            if (controller.signal.aborted || token !== this._showToken) {
                return;
            }
            const row = this._buildUnavailableRow(channel);
            for (const index of indices) {
                this._updateRow(index, row, token);
            }
        }
    }

    private _buildResolvedRow(
        channel: ChannelConfig,
        resolved: ResolvedChannelContent,
        nowMs: number
    ): MiniGuideChannelViewModel {
        try {
            const cfg = this.deps.buildDailyScheduleConfig(channel, resolved.items, nowMs);
            const index = ScheduleCalculator.buildScheduleIndex(cfg, this._shuffler);
            const now = ScheduleCalculator.calculateProgramAtTime(nowMs, index, cfg.anchorTime);
            const next = ScheduleCalculator.calculateNextProgram(now, index, cfg.anchorTime);
            return this._buildRowFromPrograms(channel, now, next);
        } catch {
            return this._buildUnavailableRow(channel);
        }
    }

    private _buildRowFromPrograms(
        channel: ChannelConfig,
        now: ScheduledProgram | null,
        next: ScheduledProgram | null
    ): MiniGuideChannelViewModel {
        const nowTitle = now?.item?.title ?? 'Unavailable';
        const nextTitle = next?.item?.title ?? null;
        const displayName = getChannelNameForDisplay({
            name: channel.name,
            sourceLibraryName: channel.sourceLibraryName ?? null,
        });

        const durationMs = getDurationMs(now);
        const elapsedMs = Math.max(0, Math.min(durationMs, now?.elapsedMs ?? 0));
        const nowProgress = durationMs > 0 ? clamp01(elapsedMs / durationMs) : 0;

        return {
            channelId: channel.id,
            channelNumber: channel.number,
            channelName: displayName,
            nowTitle,
            nextTitle,
            nowProgress,
        };
    }

    private _updateRow(index: number, row: MiniGuideChannelViewModel, token: number): void {
        if (token !== this._showToken || !this._viewModel) {
            return;
        }
        const currentRow = this._viewModel.channels[index];
        if (!currentRow || currentRow.channelId !== row.channelId) {
            return;
        }
        const overlay = this.deps.getOverlay();
        if (!overlay || !overlay.isVisible()) {
            return;
        }
        const channels = this._viewModel.channels.slice();
        channels[index] = row;
        const nextViewModel = { channels };
        this._viewModel = nextViewModel;
        overlay.setViewModel(nextViewModel);
    }

    private _scheduleAutoHide(): void {
        this._clearAutoHideTimer();
        const autoHideMs = this.deps.getAutoHideMs();
        if (!Number.isFinite(autoHideMs) || autoHideMs <= 0) {
            return;
        }
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

    private _abortInFlight(): void {
        if (this._abortController) {
            this._abortController.abort();
        }
        this._abortController = null;
        this._showToken += 1;
    }
}

function wrapIndex(index: number, length: number): number {
    if (length <= 0) return 0;
    return ((index % length) + length) % length;
}

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function getDurationMs(program: ScheduledProgram | null): number {
    if (!program) return 0;
    const itemDuration = program.item?.durationMs ?? 0;
    if (Number.isFinite(itemDuration) && itemDuration > 0) {
        return itemDuration;
    }
    const fallback = program.scheduledEndTime - program.scheduledStartTime;
    if (Number.isFinite(fallback) && fallback > 0) {
        return fallback;
    }
    return 0;
}
