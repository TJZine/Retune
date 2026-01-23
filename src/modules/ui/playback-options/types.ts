/**
 * @fileoverview Types for Playback Options modal.
 * @module modules/ui/playback-options/types
 */

export interface PlaybackOptionsConfig {
    containerId: string;
}

export interface PlaybackOptionsItem {
    id: string;
    label: string;
    meta?: string;
    state?: string;
    selected?: boolean;
    disabled?: boolean;
    onSelect: () => void;
}

export interface PlaybackOptionsSection {
    title: string;
    options: PlaybackOptionsItem[];
    emptyMessage?: string;
}

export interface PlaybackOptionsViewModel {
    title: string;
    subtitles: PlaybackOptionsSection;
    audio: PlaybackOptionsSection;
}
