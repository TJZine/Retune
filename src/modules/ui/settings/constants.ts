/**
 * @fileoverview Settings module constants - storage keys and defaults.
 * @module modules/ui/settings/constants
 * @version 1.0.0
 */

import type { SettingsConfig } from './types';

/**
 * localStorage keys for persisting settings.
 */
export const SETTINGS_STORAGE_KEYS = {
    /** DTS passthrough enabled */
    DTS_PASSTHROUGH: 'retune_enable_dts_passthrough',
    /** Prefer compatible audio codecs */
    PREFER_COMPAT_AUDIO: 'retune_prefer_compatible_audio',
    /** Color theme */
    THEME: 'retune_theme',
    /** Scanline effect enabled */
    SCANLINE_EFFECT: 'retune_scanline_effect',
    /** Debug logging enabled */
    DEBUG_LOGGING: 'retune_debug_transcode',
    /** FPS counter enabled */
    SHOW_FPS: 'retune_show_fps',
    /** Audio setup completed flag */
    AUDIO_SETUP_COMPLETE: 'retune_audio_setup_complete',
} as const;

/**
 * Default settings values.
 */
export const DEFAULT_SETTINGS: SettingsConfig = {
    audio: {
        dtsPassthrough: false,
        preferCompatibleAudio: true,
    },
    display: {
        theme: 'dark',
        scanlineEffect: false,
    },
    developer: {
        debugLogging: false,
        showFps: false,
    },
};

/**
 * Theme CSS class mappings.
 */
export const THEME_CLASSES = {
    dark: 'theme-dark',
    'retro-green': 'theme-retro-green',
    'retro-amber': 'theme-retro-amber',
} as const;
