/**
 * @fileoverview Player OSD overlay types.
 * @module modules/ui/player-osd/types
 */

export interface PlayerOsdConfig {
    containerId: string;
}

export type PlayerOsdReason = 'play' | 'pause' | 'seek' | 'status';

export interface PlayerOsdActionIds {
    subtitles: string;
    audio: string;
}

export interface PlayerOsdViewModel {
    reason: PlayerOsdReason;

    statusLabel: 'PLAYING' | 'PAUSED' | 'SEEKING' | 'BUFFERING' | 'LOADING' | 'STOPPED';

    channelPrefix: string;
    title: string;
    subtitle: string | null;

    isLive: boolean;

    currentTimeMs: number;
    durationMs: number;

    playedRatio: number;
    bufferedRatio: number;

    timecode: string;
    endsAtText: string | null;
    bufferText: string | null;
    upNextText?: string | null;
    playbackText?: string | null;
    actionIds?: PlayerOsdActionIds;
    audioLabel?: string | null;
    subtitleLabel?: string | null;
    controlHint?: string | null;
}
