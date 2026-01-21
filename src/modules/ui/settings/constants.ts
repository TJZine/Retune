/**
 * @fileoverview Settings module constants - storage keys and defaults.
 * @module modules/ui/settings/constants
 * @version 1.0.0
 */

import type { SettingsConfig } from './types';
import { RETUNE_STORAGE_KEYS } from '../../../config/storageKeys';

/**
 * localStorage keys for persisting settings.
 */
export const SETTINGS_STORAGE_KEYS = {
    /** DTS passthrough enabled */
    DTS_PASSTHROUGH: RETUNE_STORAGE_KEYS.DTS_PASSTHROUGH,
    /** Direct play audio fallback enabled */
    DIRECT_PLAY_AUDIO_FALLBACK: RETUNE_STORAGE_KEYS.DIRECT_PLAY_AUDIO_FALLBACK,
    /** Color theme */
    THEME: RETUNE_STORAGE_KEYS.THEME,
    /** Scanline effect enabled */
    SCANLINE_EFFECT: RETUNE_STORAGE_KEYS.SCANLINE_EFFECT,
    /** Debug logging enabled */
    DEBUG_LOGGING: RETUNE_STORAGE_KEYS.DEBUG_LOGGING,
    /** Subtitle debug logging enabled */
    SUBTITLE_DEBUG_LOGGING: RETUNE_STORAGE_KEYS.SUBTITLE_DEBUG_LOGGING,
    /** FPS counter enabled */
    SHOW_FPS: RETUNE_STORAGE_KEYS.SHOW_FPS,
    /** Now Playing Info overlay auto-hide timeout (ms) */
    NOW_PLAYING_INFO_AUTO_HIDE_MS: RETUNE_STORAGE_KEYS.NOW_PLAYING_INFO_AUTO_HIDE_MS,
    /** Audio setup completed flag */
    AUDIO_SETUP_COMPLETE: RETUNE_STORAGE_KEYS.AUDIO_SETUP_COMPLETE,
} as const;

/**
 * Default settings values.
 */
export const DEFAULT_SETTINGS: SettingsConfig = {
    audio: {
        dtsPassthrough: false,
        directPlayAudioFallback: false,
    },
    display: {
        theme: 'default',
        scanlineEffect: false,
        nowPlayingInfoAutoHideMs: 10_000,
    },
    developer: {
        debugLogging: false,
        subtitleDebugLogging: false,
        showFps: false,
    },
};

/**
 * Theme CSS class mappings.
 */
export const THEME_CLASSES = {
    default: '',
    retro: 'theme-retro',
} as const;
