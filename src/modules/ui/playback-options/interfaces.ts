/**
 * @fileoverview Interface definitions for Playback Options modal.
 * @module modules/ui/playback-options/interfaces
 */

import type { PlaybackOptionsConfig, PlaybackOptionsViewModel } from './types';

export interface IPlaybackOptionsModal {
    initialize(config: PlaybackOptionsConfig): void;
    show(viewModel: PlaybackOptionsViewModel): void;
    update(viewModel: PlaybackOptionsViewModel): void;
    hide(): void;
    destroy(): void;
    isVisible(): boolean;
    getFocusableIds(): string[];
}
