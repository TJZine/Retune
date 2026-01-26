/**
 * @fileoverview Channel transition overlay types.
 * @module modules/ui/channel-transition/types
 */

export interface ChannelTransitionConfig {
    containerId: string;
}

export interface ChannelTransitionViewModel {
    title: string;
    subtitle: string | null;
    showSpinner: boolean;
}
