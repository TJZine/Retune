/**
 * @fileoverview Shared subtitle format constants.
 * Single source of truth for subtitle format classification.
 * @module shared/subtitle-formats
 * @version 1.0.0
 */

/**
 * Subtitle formats that require burn-in (image-based or styled).
 * These cannot be rendered natively by webOS and require server-side transcoding.
 */
export const BURN_IN_SUBTITLE_FORMATS: readonly string[] = [
    'pgs',
    'vobsub',
    'dvdsub',
    'ass',
    'ssa',
] as const;

/**
 * Subtitle formats that can be rendered as text tracks (sidecar delivery).
 */
export const TEXT_SUBTITLE_FORMATS: readonly string[] = [
    'srt',
    'vtt',
    'webvtt',
    'subrip',
] as const;

/**
 * Subtitle formats that can be delivered as sidecar (alias for TEXT_SUBTITLE_FORMATS).
 * @deprecated Use TEXT_SUBTITLE_FORMATS instead
 */
export const SIDECAR_SUBTITLE_FORMATS = TEXT_SUBTITLE_FORMATS;
