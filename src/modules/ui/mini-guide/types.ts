/**
 * @fileoverview Types for Mini Guide overlay.
 * @module modules/ui/mini-guide/types
 */

export interface MiniGuideConfig {
    containerId: string;
}

export interface MiniGuideChannelViewModel {
    channelId: string;
    channelNumber: number;
    channelName: string;
    /**
     * Uses 'Loading...' while resolving; 'Unavailable' on error.
     */
    nowTitle: string;
    /**
     * Null when unknown.
     */
    nextTitle: string | null;
    /**
     * Clamped to [0, 1]; defaults to 0.
     */
    nowProgress: number;
}

export interface MiniGuideViewModel {
    channels: MiniGuideChannelViewModel[];
}
