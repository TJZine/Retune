import type { AppError } from '../../modules/lifecycle';
import { AppErrorCode } from '../../modules/lifecycle';

import type { IVideoPlayer } from '../../modules/player';
import type {
    IChannelManager,
    ChannelConfig,
    ResolvedChannelContent,
} from '../../modules/scheduler/channel-manager';
import type {
    IChannelScheduler,
    ScheduledProgram,
    ScheduleConfig,
} from '../../modules/scheduler/scheduler';

export interface ChannelTuningCoordinatorDeps {
    getChannelManager: () => IChannelManager | null;
    getScheduler: () => IChannelScheduler | null;
    getVideoPlayer: () => IVideoPlayer | null;

    buildDailyScheduleConfig: (
        channel: ChannelConfig,
        items: ResolvedChannelContent['items'],
        referenceTimeMs: number
    ) => ScheduleConfig;
    getLocalDayKey: (timeMs: number) => number;
    setActiveScheduleDayKey: (dayKey: number) => void;

    setPendingNowPlayingChannelId: (channelId: string | null) => void;
    getPendingNowPlayingChannelId: () => string | null;

    notifyNowPlaying: (program: ScheduledProgram) => void;

    resetPlaybackGuardsForNewChannel: () => void;
    stopActiveTranscodeSession: () => void;
    armChannelTransitionForSwitch: (channelPrefix: string) => void;

    handleGlobalError: (error: AppError, context: string) => void;
    saveLifecycleState: () => Promise<void>;
}

function summarizeErrorForLog(error: unknown): { name?: string; code?: unknown; message?: string } {
    if (!error || typeof error !== 'object') return {};
    const e = error as { name?: unknown; code?: unknown; message?: unknown };
    return {
        ...(typeof e.name === 'string' ? { name: e.name } : {}),
        ...('code' in e ? { code: e.code } : {}),
        ...(typeof e.message === 'string' ? { message: e.message } : {}),
    };
}

export class ChannelTuningCoordinator {
    private _isChannelSwitching = false;
    private _channelSwitchTimeoutId: number | null = null;

    constructor(private readonly deps: ChannelTuningCoordinatorDeps) {}

    async switchToChannel(channelId: string, options?: { signal?: AbortSignal }): Promise<void> {
        const channelManager = this.deps.getChannelManager();
        const scheduler = this.deps.getScheduler();
        const videoPlayer = this.deps.getVideoPlayer();
        if (!channelManager || !scheduler || !videoPlayer) {
            console.error('Modules not initialized');
            return;
        }

        // Prevent concurrent channel switches from causing state corruption
        if (this._isChannelSwitching) {
            console.warn('Channel switch already in progress, ignoring request');
            return;
        }

        if (options?.signal?.aborted) {
            return;
        }

        // New channel = new playback attempt; unblock any prior fast-fail guard.
        this.deps.resetPlaybackGuardsForNewChannel();

        this._isChannelSwitching = true;

        try {
            const channel = channelManager.getChannel(channelId);
            if (!channel) {
                console.error('Channel not found:', channelId);
                this.deps.handleGlobalError(
                    {
                        code: AppErrorCode.CHANNEL_NOT_FOUND,
                        message: `Channel ${channelId} not found`,
                        recoverable: true,
                    },
                    'switchToChannel'
                );
                return;
            }

            // Resolve channel content BEFORE stopping player
            // This prevents blank screen if resolution fails
            let content: ResolvedChannelContent;
            try {
                content = await channelManager.resolveChannelContent(channelId, {
                    signal: options?.signal ?? null,
                });
            } catch (error: unknown) {
                if (options?.signal?.aborted === true) {
                    return;
                }
                if (
                    ((typeof DOMException !== 'undefined' &&
                        error instanceof DOMException &&
                        error.name === 'AbortError') ||
                        (error &&
                            typeof error === 'object' &&
                            'name' in error &&
                            (error as { name?: unknown }).name === 'AbortError'))
                ) {
                    return;
                }

                console.error('Failed to resolve channel content:', summarizeErrorForLog(error));

                if (
                    error &&
                    typeof error === 'object' &&
                    'code' in error &&
                    typeof (error as { code?: unknown }).code === 'string' &&
                    'message' in error &&
                    typeof (error as { message?: unknown }).message === 'string'
                ) {
                    const errWithCode = error as { code: string; message: string; recoverable?: boolean };
                    this.deps.handleGlobalError(
                        {
                            code: errWithCode.code as AppErrorCode,
                            message: errWithCode.message,
                            recoverable: Boolean(errWithCode.recoverable),
                        },
                        'switchToChannel'
                    );
                } else {
                    this.deps.handleGlobalError(
                        {
                            code: AppErrorCode.CONTENT_UNAVAILABLE,
                            message: `Failed to switch to channel: ${channel.name}`,
                            recoverable: true,
                        },
                        'switchToChannel'
                    );
                }
                return;
            }

            if (options?.signal?.aborted) {
                return;
            }

            // Only stop player after successful content resolution
            this.deps.stopActiveTranscodeSession();
            const channelPrefix = ((): string => {
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
            })();
        try {
            this.deps.armChannelTransitionForSwitch(channelPrefix);
        } catch (error: unknown) {
            console.warn('Failed to arm channel transition:', summarizeErrorForLog(error));
        }
        videoPlayer.stop();
            this._triggerChannelSwitchEffect();

            // Configure scheduler
            const now = Date.now();
            const scheduleConfig = this.deps.buildDailyScheduleConfig(channel, content.items, now);
            this.deps.setPendingNowPlayingChannelId(channelId);
            scheduler.loadChannel(scheduleConfig);
            this.deps.setActiveScheduleDayKey(this.deps.getLocalDayKey(now));

            const currentProgram = scheduler.getCurrentProgram?.();
            if (currentProgram) {
                this.deps.notifyNowPlaying(currentProgram);
            }
            this.deps.setPendingNowPlayingChannelId(null);

            // Sync to current time (this will emit programStart)
            scheduler.syncToCurrentTime();

            // Update current channel
            channelManager.setCurrentChannel(channelId);

            // Save state
            await this.deps.saveLifecycleState();
        } finally {
            this._isChannelSwitching = false;
            if (this.deps.getPendingNowPlayingChannelId() === channelId) {
                this.deps.setPendingNowPlayingChannelId(null);
            }
        }
    }

    private _triggerChannelSwitchEffect(): void {
        if (typeof document === 'undefined') return;
        if (!document.body.classList.contains('theme-retro')) return;

        const playerContainer = document.getElementById('video-container');
        if (!playerContainer) return;

        if (this._channelSwitchTimeoutId !== null) {
            window.clearTimeout(this._channelSwitchTimeoutId);
        }

        playerContainer.classList.add('channel-switching');
        this._channelSwitchTimeoutId = window.setTimeout(() => {
            playerContainer.classList.remove('channel-switching');
            this._channelSwitchTimeoutId = null;
        }, 300);
    }

    async switchToChannelByNumber(number: number): Promise<void> {
        const channelManager = this.deps.getChannelManager();
        if (!channelManager) {
            console.error('Channel manager not initialized');
            return;
        }

        const channel = channelManager.getChannelByNumber(number);
        if (!channel) {
            this.deps.handleGlobalError(
                {
                    code: AppErrorCode.CHANNEL_NOT_FOUND,
                    message: `Channel ${number} not found`,
                    recoverable: true,
                },
                'switchToChannelByNumber'
            );
            return;
        }

        await this.switchToChannel(channel.id);
    }
}
