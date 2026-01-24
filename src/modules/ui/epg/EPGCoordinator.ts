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
        const channelManager = this.deps.getChannelManager();
        const scheduler = this.deps.getScheduler();
        if (!epg || !channelManager) return;
        if (this.deps.getEpgUiStatus() !== 'ready') return;

        const range = this._getEpgScheduleRangeMs();
        if (!range) return;

        const { startTime, endTime } = range;
        epg.setGridAnchorTime(startTime);
        const channels = channelManager.getAllChannels();
        if (channels.length === 0) return;

        const loadToken = ++this._epgScheduleLoadToken;
        const shuffler = new ShuffleGenerator();

        const MAX_CHANNELS_TO_PRELOAD = 100;
        const liveChannelId = channelManager.getCurrentChannel()?.id ?? null;
        const epgState = epg.getState();
        const focusedChannelId = epgState.focusedCell
            ? channels[epgState.focusedCell.channelIndex]?.id ?? null
            : null;
        const visibleChannels = channels.slice(
            epgState.viewWindow.startChannelIndex,
            epgState.viewWindow.endChannelIndex
        );

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
        for (const channel of visibleChannels) {
            addChannel(channel);
        }
        for (const channel of channels) {
            addChannel(channel);
        }

        const channelsToLoad = prioritized.slice(0, MAX_CHANNELS_TO_PRELOAD);

        if (this._isDebugEnabled()) {
            const payload = {
                reason: options?.reason ?? 'manual',
                channelCount: channels.length,
                preloadCount: channelsToLoad.length,
                liveChannelId,
                focusedChannelId,
                visibleRange: {
                    start: epgState.viewWindow.startChannelIndex,
                    end: epgState.viewWindow.endChannelIndex,
                },
            };
            console.warn('[EPGCoordinator] refreshEpgSchedules', payload);
            appendEpgDebugLog('EPG.refreshEpgSchedules', payload);
        }

        for (const channel of channelsToLoad) {
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
