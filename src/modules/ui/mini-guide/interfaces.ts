/**
 * @fileoverview Mini Guide overlay interface.
 * @module modules/ui/mini-guide/interfaces
 */

import type { MiniGuideConfig, MiniGuideViewModel } from './types';

export interface IMiniGuideOverlay {
    initialize(config: MiniGuideConfig): void;
    destroy(): void;

    show(): void;
    hide(): void;
    isVisible(): boolean;

    setViewModel(vm: MiniGuideViewModel): void;
    setFocusedIndex(index: number): void;
}
