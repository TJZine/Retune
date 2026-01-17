/**
 * @fileoverview Types for Now Playing Info overlay.
 * @module modules/ui/now-playing-info/types
 */

export interface NowPlayingInfoConfig {
    containerId: string;
    autoHideMs?: number;
    posterWidth?: number;
    posterHeight?: number;
    onAutoHide?: () => void;
}

export interface NowPlayingInfoViewModel {
    title: string;
    subtitle?: string;
    description?: string;
    channelName?: string;
    channelNumber?: number;
    elapsedMs?: number;
    durationMs?: number;
    posterUrl?: string | null;
}
