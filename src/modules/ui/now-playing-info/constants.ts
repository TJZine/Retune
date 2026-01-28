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
    BADGES: 'now-playing-info-badges',
    BADGE: 'now-playing-info-badge',
    META: 'now-playing-info-meta',
    META_LINE: 'now-playing-info-meta-line',
    ACTORS: 'now-playing-info-actors',
    ACTOR: 'now-playing-info-actor',
    ACTOR_IMAGE: 'now-playing-info-actor-image',
    ACTOR_MORE: 'now-playing-info-actor-more',
    DESCRIPTION: 'now-playing-info-description',
    CONTEXT: 'now-playing-info-context',
    DEBUG: 'now-playing-info-debug',
    PROGRESS: 'now-playing-info-progress',
    PROGRESS_BAR: 'now-playing-info-progress-bar',
    PROGRESS_FILL: 'now-playing-info-progress-fill',
    PROGRESS_META: 'now-playing-info-progress-meta',
    UP_NEXT: 'now-playing-info-up-next',
} as const;

export const NOW_PLAYING_INFO_DEFAULTS = {
    autoHideMs: 10_000,
    posterWidth: 320,
    posterHeight: 480,
    actorThumbSize: 96,
    actorHeadshotCount: 4,
} as const;

export const NOW_PLAYING_INFO_AUTO_HIDE_OPTIONS = [
    5_000,
    10_000,
    15_000,
    30_000,
    60_000,
    120_000,
] as const;
