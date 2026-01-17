/**
 * @fileoverview Retune localStorage key constants.
 * @module config/storageKeys
 * @version 1.0.0
 */

/**
 * Canonical localStorage keys used across modules.
 *
 * Keep this file free of UI imports so core/player/plex can depend on it safely.
 */
export const RETUNE_STORAGE_KEYS = {
    // Audio / Playback
    DTS_PASSTHROUGH: 'retune_enable_dts_passthrough',

    // Setup / Onboarding
    AUDIO_SETUP_COMPLETE: 'retune_audio_setup_complete',

    // Display
    SCANLINE_EFFECT: 'retune_scanline_effect',
    THEME: 'retune_theme',
    NOW_PLAYING_INFO_AUTO_HIDE_MS: 'retune_now_playing_info_auto_hide_ms',

    // Developer / Debug
    DEBUG_LOGGING: 'retune_debug_transcode',
    SHOW_FPS: 'retune_show_fps',

    // Dev menu overrides (transcode)
    TRANSCODE_COMPAT: 'retune_transcode_compat',
    TRANSCODE_PRESET: 'retune_transcode_preset',
    TRANSCODE_PLATFORM: 'retune_transcode_platform',
    TRANSCODE_PLATFORM_VERSION: 'retune_transcode_platform_version',
    TRANSCODE_DEVICE: 'retune_transcode_device',
    TRANSCODE_DEVICE_NAME: 'retune_transcode_device_name',
    TRANSCODE_MODEL: 'retune_transcode_model',
    TRANSCODE_PRODUCT: 'retune_transcode_product',
    TRANSCODE_VERSION: 'retune_transcode_version',
    TRANSCODE_PROFILE_NAME: 'retune_transcode_profile_name',
    TRANSCODE_PROFILE_VERSION: 'retune_transcode_profile_version',
} as const;
