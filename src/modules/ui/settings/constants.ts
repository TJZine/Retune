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
    /** Keep playback running in settings */
    KEEP_PLAYING_IN_SETTINGS: RETUNE_STORAGE_KEYS.KEEP_PLAYING_IN_SETTINGS,
    /** Prefer HDR10 over Dolby Vision */
    PREFER_HDR10_OVER_DV: RETUNE_STORAGE_KEYS.PREFER_HDR10_OVER_DV,
    /** Color theme */
    THEME: RETUNE_STORAGE_KEYS.THEME,
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
    /** Subtitle feature flag (beta) */
    SUBTITLES_ENABLED: RETUNE_STORAGE_KEYS.SUBTITLES_ENABLED,
    /** Use global subtitle preference override */
    SUBTITLE_PREFERENCE_GLOBAL_OVERRIDE: RETUNE_STORAGE_KEYS.SUBTITLE_PREFERENCE_GLOBAL_OVERRIDE,
    /** Preferred subtitle language (app override) */
    SUBTITLE_LANGUAGE: RETUNE_STORAGE_KEYS.SUBTITLE_LANGUAGE,
    /** Prefer forced subtitles over full subtitles */
    SUBTITLE_PREFER_FORCED: RETUNE_STORAGE_KEYS.SUBTITLE_PREFER_FORCED,
} as const;

/**
 * Default settings values.
 */
export const DEFAULT_SETTINGS: SettingsConfig = {
    audio: {
        dtsPassthrough: false,
        directPlayAudioFallback: false,
    },
    playback: {
        keepPlayingInSettings: false,
        preferHdr10OverDv: false,
    },
    display: {
        theme: 'default',
        nowPlayingInfoAutoHideMs: 10_000,
    },
    developer: {
        debugLogging: false,
        subtitleDebugLogging: false,
        showFps: false,
    },
    subtitles: {
        enabled: false,
        useGlobalPreference: false,
        language: null,
        preferForced: false,
    },
};

/**
 * Theme CSS class mappings.
 */
export const THEME_CLASSES = {
    default: '',
    retro: 'theme-retro',
} as const;
