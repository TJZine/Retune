/**
 * @fileoverview Types for Playback Options modal.
 * @module modules/ui/playback-options/types
 */

export interface PlaybackOptionsConfig {
    containerId: string;
}

export type PlaybackOptionsSectionId = 'subtitles' | 'audio';

export interface PlaybackOptionsItem {
    id: string;
    label: string;
    meta?: string;
    state?: string;
    selected?: boolean;
    disabled?: boolean;
    blocked?: boolean;
    onSelect: () => void;
    onBlockedSelect?: () => void;
}

export interface PlaybackOptionsSection {
    title: string;
    options: PlaybackOptionsItem[];
    helperText?: string;
    emptyMessage?: string;
}

export interface PlaybackOptionsViewModel {
    title: string;
    subtitles: PlaybackOptionsSection;
    audio: PlaybackOptionsSection;
}
