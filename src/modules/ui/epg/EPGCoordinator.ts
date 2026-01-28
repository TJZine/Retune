import { ShuffleGenerator, ScheduleCalculator } from '../../scheduler/scheduler';
import { appendEpgDebugLog } from './utils';
import type { IEPGComponent } from './interfaces';
import type { EPGConfig } from './types';
import type { IChannelManager, ChannelConfig, ResolvedChannelContent } from '../../scheduler/channel-manager';
import type { IChannelScheduler, ScheduledProgram, ScheduleConfig } from '../../scheduler/scheduler';

export type EpgUiStatus = 'pending' | 'initializing' | 'ready' | 'error' | 'disabled' | undefined;

export interface EPGCoordinatorDeps {
    getEpg: () => IEPGComponent | null;
    getChannelManager: () => IChannelManager | null;
    getScheduler: () => IChannelScheduler | null;

    getEpgUiStatus: () => EpgUiStatus;
    ensureEpgInitialized: () => Promise<void>;

    getEpgConfig: () => EPGConfig | null;
    getLocalMidnightMs: (timeMs: number) => number;

    buildDailyScheduleConfig: (
        channel: ChannelConfig,
        items: ResolvedChannelContent['items'],
        referenceTimeMs: number
    ) => ScheduleConfig;

    getPreserveFocusOnOpen: () => boolean;

    setLastChannelChangeSourceToGuide: () => void;
    switchToChannel: (channelId: string) => Promise<void>;
}

export class EPGCoordinator {
    private _epgScheduleLoadToken = 0;
    private _visibleRangeTimer: ReturnType<typeof setTimeout> | null = null;
    private _pendingVisibleRange: {
        channelStart: number;
        channelEnd: number;
        timeStartMs: number;
        timeEndMs: number;
    } | null = null;
    private _pendingVisibleRangeReason: string | null = null;
    private _pendingVisibleRangePromise: Promise<void> | null = null;
    private _pendingVisibleRangeResolve: (() => void) | null = null;
    private _pendingVisibleRangeReject: ((error: unknown) => void) | null = null;

    constructor(private readonly deps: EPGCoordinatorDeps) {}

    openEPG(): void {
        const epg = this.deps.getEpg();
        if (!epg) return;

        const show = (): void => {
            const preserveFocus = this.deps.getPreserveFocusOnOpen();
            epg.show({ preserveFocus });
            if (!preserveFocus) {
                this._focusEpgOnCurrentChannel();
                epg.focusNow();
            }
        };

        const status = this.deps.getEpgUiStatus();
        if (status === 'ready') {
            this.primeEpgChannels();
            void this.refreshEpgSchedules();
            show();
            return;
        }

        show();
        void this.deps.ensureEpgInitialized()
            .then(() => {
                this.primeEpgChannels();
                void this.refreshEpgSchedules();
                show();
            })
            .catch((error: unknown) => console.error('[Orchestrator] Failed to init EPG:', error));
    }

    closeEPG(): void {
        this.deps.getEpg()?.hide();
    }

    toggleEPG(): void {
        const epg = this.deps.getEpg();
        if (!epg) return;
        if (epg.isVisible()) {
            this.closeEPG();
        } else {
            this.openEPG();
        }
    }

    primeEpgChannels(): void {
        const epg = this.deps.getEpg();
        const channelManager = this.deps.getChannelManager();
        if (!epg || !channelManager) return;
        if (this.deps.getEpgUiStatus() !== 'ready') return;
        epg.loadChannels(channelManager.getAllChannels());
    }

    async refreshEpgSchedules(options?: { reason?: string }): Promise<void> {
        const epg = this.deps.getEpg();
        if (!epg) return;
        const epgState = epg.getState();
        const range = {
            channelStart: epgState.viewWindow.startChannelIndex,
            channelEnd: epgState.viewWindow.endChannelIndex,
            timeStartMs: epgState.viewWindow.startTime,
            timeEndMs: epgState.viewWindow.endTime,
        };
        await this._refreshEpgSchedulesForRange(range, options?.reason ?? 'manual');
    }

    refreshEpgScheduleForLiveChannel(): void {
        const epg = this.deps.getEpg();
        const channelManager = this.deps.getChannelManager();
        const scheduler = this.deps.getScheduler();
        if (!epg || !channelManager || !scheduler) return;
        if (this.deps.getEpgUiStatus() !== 'ready') return;
        if (!epg.isVisible()) return;

        const range = this._getEpgScheduleRangeMs();
        if (!range) return;

        const current = channelManager.getCurrentChannel();
        if (!current) return;

        const state = scheduler.getState();
        if (!state.isActive || state.channelId !== current.id) {
            return;
        }

        try {
            const window = scheduler.getScheduleWindow(range.startTime, range.endTime);
            epg.loadScheduleForChannel(current.id, {
                ...window,
                programs: [...window.programs],
            });
        } catch (error) {
            console.warn('[Orchestrator] Failed to refresh live EPG schedule:', error);
        }
    }

    async refreshEpgSchedulesForRange(range: {
        channelStart: number;
        channelEnd: number;
        timeStartMs: number;
        timeEndMs: number;
    }, options?: { reason?: string; debounceMs?: number }): Promise<void> {
        const debounceMs = Math.max(0, options?.debounceMs ?? 120);
        const reason = options?.reason ?? 'visible-range';
        if (debounceMs === 0) {
            await this._refreshEpgSchedulesForRange(range, reason);
            return;
        }
        this._pendingVisibleRange = range;
        this._pendingVisibleRangeReason = reason;
        if (this._visibleRangeTimer) {
            return this._pendingVisibleRangePromise ?? Promise.resolve();
        }
        if (!this._pendingVisibleRangePromise) {
            this._pendingVisibleRangePromise = new Promise<void>((resolve, reject) => {
                this._pendingVisibleRangeResolve = resolve;
                this._pendingVisibleRangeReject = reject;
            });
        }
        this._visibleRangeTimer = setTimeout(() => {
            this._visibleRangeTimer = null;
            const pending = this._pendingVisibleRange;
            const pendingReason = this._pendingVisibleRangeReason;
            this._pendingVisibleRange = null;
            this._pendingVisibleRangeReason = null;
            const resolvePending = this._pendingVisibleRangeResolve;
            const rejectPending = this._pendingVisibleRangeReject;
            this._pendingVisibleRangeResolve = null;
            this._pendingVisibleRangeReject = null;
            if (!pending) {
                resolvePending?.();
                this._pendingVisibleRangePromise = null;
                return;
            }
            this._refreshEpgSchedulesForRange(pending, pendingReason ?? 'visible-range')
                .then(() => resolvePending?.())
                .catch((error: unknown) => rejectPending?.(error))
                .finally(() => {
                    this._pendingVisibleRangePromise = null;
                });
        }, debounceMs);
        return this._pendingVisibleRangePromise ?? Promise.resolve();
    }

    wireEpgEvents(): Array<() => void> {
        const epg = this.deps.getEpg();
        if (!epg) return [];

        const handler = (payload: { channel: ChannelConfig; program: ScheduledProgram }): void => {
            this.deps.setLastChannelChangeSourceToGuide();
            const now = Date.now();
            if (
                payload.program.scheduleIndex === -1 ||
                payload.program.item.ratingKey.includes('-placeholder-')
            ) {
                return;
            }
            if (now < payload.program.scheduledStartTime) {
                return;
            }
            this.closeEPG();
            this.deps.switchToChannel(payload.channel.id).catch(console.error);
        };
        epg.on('channelSelected', handler);

        return [
            (): void => {
                const epgInstance = this.deps.getEpg();
                if (epgInstance) {
                    epgInstance.off('channelSelected', handler);
                }
            },
        ];
    }

    focusEpgOnCurrentChannel(): void {
        this._focusEpgOnCurrentChannel();
    }

    private _getEpgScheduleRangeMs(): { startTime: number; endTime: number } | null {
        const config = this.deps.getEpgConfig();
        if (!config) return null;
        const totalHours = config.totalHours;
        const slotMinutes = config.timeSlotMinutes;
        const slotMs = slotMinutes * 60_000;
        const PAST_WINDOW_MINUTES = 30;
        const now = Date.now();
        const dayStart = this.deps.getLocalMidnightMs(now);
        const startTime = Math.max(
            Math.floor((now - PAST_WINDOW_MINUTES * 60_000) / slotMs) * slotMs,
            dayStart
        );
        const endTime = startTime + totalHours * 60 * 60 * 1000;
        return { startTime, endTime };
    }

    private async _refreshEpgSchedulesForRange(
        range: { channelStart: number; channelEnd: number; timeStartMs: number; timeEndMs: number },
        reason: string
    ): Promise<void> {
        const epg = this.deps.getEpg();
        const channelManager = this.deps.getChannelManager();
        const scheduler = this.deps.getScheduler();
        if (!epg || !channelManager) return;
        if (this.deps.getEpgUiStatus() !== 'ready') return;

        const scheduleRange = this._getEpgScheduleRangeMs();
        if (!scheduleRange) return;

        const { startTime, endTime } = scheduleRange;
        epg.setGridAnchorTime(startTime);
        const channels = channelManager.getAllChannels();
        if (channels.length === 0) return;

        const buffer = 4;
        const startIndex = Math.max(0, range.channelStart - buffer);
        const endIndex = Math.min(channels.length, range.channelEnd + buffer);
        const rangeChannels = channels.slice(startIndex, endIndex);

        const loadToken = ++this._epgScheduleLoadToken;
        const shuffler = new ShuffleGenerator();

        const liveChannelId = channelManager.getCurrentChannel()?.id ?? null;
        const epgState = epg.getState();
        const focusedChannelId = epgState.focusedCell
            ? channels[epgState.focusedCell.channelIndex]?.id ?? null
            : null;

        const prioritized: ChannelConfig[] = [];
        const addChannel = (channel: ChannelConfig | null | undefined): void => {
            if (!channel) return;
            if (prioritized.some((existing) => existing.id === channel.id)) return;
            prioritized.push(channel);
        };

        if (liveChannelId) {
            addChannel(channels.find((c) => c.id === liveChannelId));
        }
        if (focusedChannelId) {
            addChannel(channels.find((c) => c.id === focusedChannelId));
        }
        for (const channel of rangeChannels) {
            addChannel(channel);
        }

        if (this._isDebugEnabled()) {
            const payload = {
                reason,
                channelCount: channels.length,
                preloadCount: prioritized.length,
                liveChannelId,
                focusedChannelId,
                visibleRange: {
                    start: range.channelStart,
                    end: range.channelEnd,
                },
                bufferedRange: {
                    start: startIndex,
                    end: endIndex,
                },
            };
            console.warn('[EPGCoordinator] refreshEpgSchedulesForRange', payload);
            appendEpgDebugLog('EPG.refreshEpgSchedulesForRange', payload);
        }

        for (const channel of prioritized) {
            if (loadToken !== this._epgScheduleLoadToken) return;
            try {
                if (liveChannelId && channel.id === liveChannelId && scheduler) {
                    const state = scheduler.getState();
                    if (state.isActive && state.channelId === channel.id) {
                        const window = scheduler.getScheduleWindow(startTime, endTime);
                        epg.loadScheduleForChannel(channel.id, {
                            ...window,
                            programs: [...window.programs],
                        });
                        continue;
                    }
                }

                const resolved = await channelManager.resolveChannelContent(channel.id);
                const scheduleConfig = this.deps.buildDailyScheduleConfig(
                    channel,
                    resolved.items,
                    startTime
                );
                const index = ScheduleCalculator.buildScheduleIndex(scheduleConfig, shuffler);
                const programs = ScheduleCalculator.generateScheduleWindow(
                    startTime,
                    endTime,
                    index,
                    scheduleConfig.anchorTime
                );

                epg.loadScheduleForChannel(channel.id, { startTime, endTime, programs });
            } catch (error) {
                console.warn('[Orchestrator] Failed to build EPG schedule for channel:', channel.id, error);
            }
        }

        if (loadToken === this._epgScheduleLoadToken && epg.isVisible() && !epg.getFocusedProgram()) {
            epg.focusNow();
        }
    }

    private _focusEpgOnCurrentChannel(): void {
        const epg = this.deps.getEpg();
        const channelManager = this.deps.getChannelManager();
        if (!epg || !channelManager) return;
        const current = channelManager.getCurrentChannel();
        if (!current) return;
        const channels = channelManager.getAllChannels();
        const index = channels.findIndex((channel) => channel.id === current.id);
        if (index >= 0) {
            epg.focusChannel(index);
        }
    }

    private _isDebugEnabled(): boolean {
        try {
            return localStorage.getItem('retune_debug_epg') === '1';
        } catch {
            return false;
        }
    }
}
