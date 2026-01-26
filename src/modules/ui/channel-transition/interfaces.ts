/**
 * @fileoverview Channel transition overlay interface.
 * @module modules/ui/channel-transition/interfaces
 */

import type { ChannelTransitionConfig, ChannelTransitionViewModel } from './types';

export interface IChannelTransitionOverlay {
    initialize(config: ChannelTransitionConfig): void;
    destroy(): void;

    show(): void;
    hide(): void;
    isVisible(): boolean;

    setViewModel(vm: ChannelTransitionViewModel): void;
}
