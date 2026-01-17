/**
 * @fileoverview Interface for Now Playing Info overlay.
 * @module modules/ui/now-playing-info/interfaces
 */

import type { NowPlayingInfoConfig, NowPlayingInfoViewModel } from './types';

export interface INowPlayingInfoOverlay {
    initialize(config: NowPlayingInfoConfig): void;
    show(viewModel: NowPlayingInfoViewModel): void;
    update(viewModel: NowPlayingInfoViewModel): void;
    hide(): void;
    isVisible(): boolean;
    destroy(): void;
    setAutoHideMs(autoHideMs: number): void;
    resetAutoHideTimer(): void;
    setOnAutoHide(handler: (() => void) | null): void;
}
