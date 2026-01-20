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
 * Display settings configuration.
 */
export interface DisplaySettings {
    /** Color theme */
    theme: 'dark' | 'retro-green' | 'retro-amber';
    /** Enable subtle CRT scanline overlay effect */
    scanlineEffect: boolean;
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
 * Complete settings configuration.
 */
export interface SettingsConfig {
    audio: AudioSettings;
    display: DisplaySettings;
    developer: DeveloperSettings;
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
