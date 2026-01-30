/**
 * @fileoverview Settings module type definitions.
 * @module modules/ui/settings/types
 * @version 1.0.0
 */

/**
 * Audio settings configuration.
 */
export interface AudioSettings {
    /** Enable DTS passthrough for external receivers (requires webOS 23+) */
    dtsPassthrough: boolean;
    /** Allow Direct Play by selecting a compatible fallback audio track */
    directPlayAudioFallback: boolean;
}

/**
 * Playback settings configuration.
 */
export interface PlaybackSettings {
    /** Keep playback running when opening settings */
    keepPlayingInSettings: boolean;
    /** Forces HDR10 playback for DV MKV only when cinematic aspect ratios are detected */
    smartHdr10Fallback: boolean;
    /** Forces HDR10 playback for all DV MKV (excluding profiles without HDR10 base layer) */
    forceHdr10Fallback: boolean;
}

/**
 * Display settings configuration.
 */
export interface DisplaySettings {
    /** Color theme */
    theme: 'obsidian' | 'broadcast' | 'swiss';
    /** Now Playing Info overlay auto-hide timeout (ms) */
    nowPlayingInfoAutoHideMs: number;
}

/**
 * Developer/debug settings configuration.
 */
export interface DeveloperSettings {
    /** Enable verbose debug logging */
    debugLogging: boolean;
    /** Enable verbose subtitle debug logging */
    subtitleDebugLogging: boolean;
    /** Show FPS counter overlay */
    showFps: boolean;
}

/**
 * Subtitle settings configuration.
 */
export interface SubtitleSettings {
    /** Enable subtitle track support */
    enabled: boolean;
    /** Use global subtitle preference override */
    useGlobalPreference: boolean;
    /** Preferred subtitle language code (app override) */
    language: string | null;
    /** Prefer forced subtitles over full subtitles when auto-selecting */
    preferForced: boolean;
    /** Only show external (direct) subtitle tracks */
    externalOnly: boolean;
    /** Allow burn-in subtitle tracks */
    allowBurnIn: boolean;
}

/**
 * Complete settings configuration.
 */
export interface SettingsConfig {
    audio: AudioSettings;
    playback: PlaybackSettings;
    display: DisplaySettings;
    developer: DeveloperSettings;
    subtitles: SubtitleSettings;
}

/**
 * Settings toggle item configuration.
 */
export interface SettingsToggleConfig {
    /** Unique identifier */
    id: string;
    /** Display label */
    label: string;
    /** Optional description text */
    description?: string;
    /** Current value */
    value: boolean;
    /** Whether the toggle is disabled */
    disabled?: boolean;
    /** Reason for being disabled (shown to user) */
    disabledReason?: string;
    /** Callback when value changes */
    onChange: (value: boolean) => void;
}

/**
 * Settings select option configuration.
 */
export interface SettingsSelectOption {
    label: string;
    value: number;
}

/**
 * Settings select item configuration.
 */
export interface SettingsSelectConfig {
    /** Unique identifier */
    id: string;
    /** Display label */
    label: string;
    /** Optional description text */
    description?: string;
    /** Current value */
    value: number;
    /** Available options */
    options: SettingsSelectOption[];
    /** Whether the select is disabled */
    disabled?: boolean;
    /** Reason for being disabled (shown to user) */
    disabledReason?: string;
    /** Callback when value changes */
    onChange: (value: number) => void;
}

export type SettingsItemConfig = SettingsToggleConfig | SettingsSelectConfig;

/**
 * Settings section configuration.
 */
export interface SettingsSectionConfig {
    /** Section title */
    title: string;
    /** Toggle items in this section */
    items: SettingsItemConfig[];
}
