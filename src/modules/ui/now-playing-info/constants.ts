/**
 * @fileoverview Now Playing Info overlay constants.
 * @module modules/ui/now-playing-info/constants
 */

export const NOW_PLAYING_INFO_MODAL_ID = 'now-playing-info';

export const NOW_PLAYING_INFO_CLASSES = {
    CONTAINER: 'now-playing-info-container',
    PANEL: 'now-playing-info-panel',
    POSTER: 'now-playing-info-poster',
    CONTENT: 'now-playing-info-content',
    TITLE: 'now-playing-info-title',
    SUBTITLE: 'now-playing-info-subtitle',
    DESCRIPTION: 'now-playing-info-description',
    CONTEXT: 'now-playing-info-context',
    PROGRESS: 'now-playing-info-progress',
    PROGRESS_BAR: 'now-playing-info-progress-bar',
    PROGRESS_FILL: 'now-playing-info-progress-fill',
    PROGRESS_META: 'now-playing-info-progress-meta',
} as const;

export const NOW_PLAYING_INFO_DEFAULTS = {
    autoHideMs: 10_000,
    posterWidth: 320,
    posterHeight: 480,
} as const;

export const NOW_PLAYING_INFO_AUTO_HIDE_OPTIONS = [
    5_000,
    10_000,
    15_000,
    30_000,
    60_000,
    120_000,
] as const;
