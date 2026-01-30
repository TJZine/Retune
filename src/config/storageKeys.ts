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
    DIRECT_PLAY_AUDIO_FALLBACK: 'retune_direct_play_audio_fallback',
    KEEP_PLAYING_IN_SETTINGS: 'retune_keep_playing_in_settings',
    // Display / HDR / Dolby Vision
    SMART_HDR10_FALLBACK: 'retune_smart_hdr10_fallback',
    FORCE_HDR10_FALLBACK: 'retune_force_hdr10_fallback',

    // Setup / Onboarding
    AUDIO_SETUP_COMPLETE: 'retune_audio_setup_complete',

    // Display
    THEME: 'retune_theme',
    NOW_PLAYING_INFO_AUTO_HIDE_MS: 'retune_now_playing_info_auto_hide_ms',
    NOW_PLAYING_STREAM_DEBUG: 'retune_now_playing_stream_debug',
    NOW_PLAYING_STREAM_DEBUG_AUTO_SHOW: 'retune_now_playing_stream_debug_auto_show',
    SUBTITLES_ENABLED: 'retune_subtitles_enabled',
    SUBTITLE_LANGUAGE: 'retune_subtitle_language',
    SUBTITLE_PREFERENCE_GLOBAL: 'retune_subtitle_pref_global',
    SUBTITLE_PREFERENCE_GLOBAL_OVERRIDE: 'retune_subtitle_pref_global_override',
    SUBTITLE_PREFERENCE_BY_ITEM_PREFIX: 'retune_subtitle_pref_item:',
    SUBTITLE_PREFERENCE_BY_CHANNEL_PREFIX: 'retune_subtitle_pref_channel:',
    SUBTITLE_FILTER_EXTERNAL_ONLY: 'retune_subtitle_filter_external_only',
    SUBTITLE_ALLOW_BURN_IN: 'retune_subtitle_allow_burn_in',
    /** Prefer forced subtitles over full subtitles */
    SUBTITLE_PREFER_FORCED: 'retune_subtitle_prefer_forced',

    // Developer / Debug
    DEBUG_LOGGING: 'retune_debug_transcode',
    SUBTITLE_DEBUG_LOGGING: 'retune_subtitle_debug_logging',
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
