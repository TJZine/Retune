/**
 * @fileoverview Types for Now Playing Info overlay.
 * @module modules/ui/now-playing-info/types
 */

export interface NowPlayingInfoConfig {
    containerId: string;
    autoHideMs?: number;
    posterWidth?: number;
    posterHeight?: number;
    actorThumbSize?: number;
    actorHeadshotCount?: number;
    onAutoHide?: () => void;
}

export interface NowPlayingInfoViewModel {
    title: string;
    subtitle?: string;
    metaLines?: string[];
    actorHeadshots?: Array<{ name: string; url: string | null }>;
    actorTotalCount?: number;
    actorMoreCount?: number;
    description?: string;
    channelName?: string;
    channelNumber?: number;
    elapsedMs?: number;
    durationMs?: number;
    posterUrl?: string | null;
    badges?: string[];
    upNext?: {
        title: string;
        startsAtMs: number;
    };
    /**
     * Optional stream/debug information (monospace). Intended for developer use.
     * Keep short; this overlay is designed for quick-glance viewing on TVs.
     */
    debugText?: string;
}
