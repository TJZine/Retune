/**
 * @module ErrorMessages
 * @description Unified error message catalog for consistent user-facing error strings
 * @version 1.0.2
 * 
 * USAGE:
 * import { ERROR_MESSAGES, getErrorMessage } from './error-messages';
 * 
 * // Direct access
 * const msg = ERROR_MESSAGES.AUTH.EXPIRED;
 * 
 * // With AppErrorCode
 * const msg = getErrorMessage(AppErrorCode.AUTH_EXPIRED);
 */

import { AppErrorCode } from '../artifact-2-shared-types';

// ============================================
// USER-FACING ERROR MESSAGES
// ============================================

export const ERROR_MESSAGES = {
  // Authentication Errors
  AUTH: {
    REQUIRED: 'Please sign in to your Plex account to continue.',
    EXPIRED: 'Your session has expired. Please sign in again.',
    INVALID: 'Unable to verify your Plex account. Please try signing in again.',
    FAILED: 'Sign in failed. Please check your internet connection and try again.',
    PIN_EXPIRED: 'The PIN code has expired. Please request a new one.',
    PIN_TIMEOUT: 'PIN entry timed out. Please try again.',
  },

  // Network Errors
  NETWORK: {
    TIMEOUT: 'The request timed out. Please check your internet connection.',
    OFFLINE: 'No internet connection. Please check your network settings.',
    UNAVAILABLE: 'Network is unavailable. Please check your connection.',
    SERVER_UNREACHABLE: 'Unable to reach the Plex server. Please try again later.',
    SERVER_SSL_ERROR: 'Secure connection failed. Check your server settings.',
    MIXED_CONTENT: 'Secure connection required. Some local servers may not be accessible.',
    RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
    SERVER_ERROR: 'The server returned an error. Please try again.',
    SERVER_UNAUTHORIZED: 'You are not authorized to access this server. Please sign in again.',
    RESOURCE_NOT_FOUND: 'Requested resource was not found.',
    EMPTY_RESPONSE: 'The server returned an empty response. Please try again.',
    PARSE_ERROR: 'Unable to process the server response. Please try again.',
  },

  // Playback Errors
  PLAYBACK: {
    DECODE_ERROR: 'Unable to play this video. The format may not be supported.',
    FORMAT_UNSUPPORTED: 'This video format is not supported on your TV.',
    DRM_ERROR: 'This content is protected and cannot be played.',
    SOURCE_NOT_FOUND: 'Video not found. It may have been removed from the library.',
    STREAM_START_FAILED: 'Unable to start playback. Trying next available option...',
    BUFFER_STALLED: 'Buffering... Please wait or check your connection.',
    CODEC_UNSUPPORTED: 'This video codec is not supported on your TV.',
    TRACK_NOT_FOUND: 'Requested audio/subtitle track is not available.',
    TRACK_SWITCH_FAILED: 'Unable to switch tracks. Continuing playback.',
    TRACK_SWITCH_TIMEOUT: 'Track switch timed out. Continuing playback.',
    RENDER_ERROR: 'Playback render error occurred. Please try again.',
  },

  // Scheduler Errors
  SCHEDULER: {
    EMPTY_CHANNEL: 'This channel has no content. Please add content to the channel.',
    INVALID_TIME: 'Unable to calculate the schedule. Please try again.',
    NO_CHANNELS: 'No channels configured. Create a channel to get started.',
  },

  // Storage Errors
  STORAGE: {
    QUOTA_EXCEEDED: 'Storage is full. Please delete some channels to continue.',
    CORRUPTED: 'Settings are corrupted. Resetting to defaults...',
    SAVE_FAILED: 'Unable to save settings. Please try again.',
  },

  // UI Errors
  UI: {
    RENDER_ERROR: 'Display error occurred. Please restart the app.',
    NAVIGATION_BLOCKED: 'Navigation is not available right now.',
    NAV_BOUNDARY: 'Cannot move focus further in that direction.',
    SCROLL_TIMEOUT: 'Scrolling took too long. Resetting position.',
    POOL_EXHAUSTED: 'UI resources are temporarily unavailable. Please try again.',
  },

  // Generic
  GENERIC: {
    UNKNOWN: 'An unexpected error occurred. Please try again.',
    RETRY: 'Something went wrong. Retrying...',
    CONTACT_SUPPORT: 'If this problem persists, please restart the app.',
  },

  // System / Lifecycle
  SYSTEM: {
    INITIALIZATION_FAILED: 'Unable to start the app. Please restart and try again.',
    PLEX_UNREACHABLE: 'Unable to reach your Plex server. Check your network or change servers.',
    DATA_CORRUPTION: 'App data appears corrupted. Resetting may be required.',
    PLAYBACK_FAILED: 'Playback failed. Trying the next program...',
    OUT_OF_MEMORY: 'The app is low on memory. Closing overlays and reducing cache usage...',
    MODULE_INIT_FAILED: 'A component failed to start. Retrying...',
    MODULE_CRASH: 'A component encountered an error. Restarting...',
    UNRECOVERABLE: 'The app encountered a critical error and must restart.',
  },

  // Content Errors
  CONTENT: {
    UNAVAILABLE: 'This content is no longer available. It may have been removed from the library.',
    LIBRARY_UNAVAILABLE: 'This library is no longer available. Please reconfigure your channel.',
    TRANSCODE_FAILED: 'Unable to convert this video. Skipping to next...',
    CHANNEL_NOT_FOUND: 'Channel not found.',
    EMPTY_CHANNEL: 'This channel has no content to play.',
    ITEM_NOT_FOUND: 'Requested item was not found.',
  },

  // Additional Auth (kept for grouping)
  ADDITIONAL: {
    AUTH_RATE_LIMITED: 'Too many sign-in attempts. Please wait a moment.',
  },
} as const;

// ============================================
// ERROR MESSAGE LOOKUP
// ============================================

/**
 * Map AppErrorCode to user-facing message
 */
const ERROR_CODE_MAP: Record<AppErrorCode, string> = {
  [AppErrorCode.AUTH_REQUIRED]: ERROR_MESSAGES.AUTH.REQUIRED,
  [AppErrorCode.AUTH_EXPIRED]: ERROR_MESSAGES.AUTH.EXPIRED,
  [AppErrorCode.AUTH_INVALID]: ERROR_MESSAGES.AUTH.INVALID,
  [AppErrorCode.AUTH_FAILED]: ERROR_MESSAGES.AUTH.FAILED,
  [AppErrorCode.AUTH_RATE_LIMITED]: ERROR_MESSAGES.ADDITIONAL.AUTH_RATE_LIMITED,
  [AppErrorCode.NETWORK_TIMEOUT]: ERROR_MESSAGES.NETWORK.TIMEOUT,
  [AppErrorCode.NETWORK_OFFLINE]: ERROR_MESSAGES.NETWORK.OFFLINE,
  [AppErrorCode.NETWORK_UNAVAILABLE]: ERROR_MESSAGES.NETWORK.UNAVAILABLE,
  [AppErrorCode.SERVER_UNREACHABLE]: ERROR_MESSAGES.NETWORK.SERVER_UNREACHABLE,
  [AppErrorCode.SERVER_SSL_ERROR]: ERROR_MESSAGES.NETWORK.SERVER_SSL_ERROR,
  [AppErrorCode.MIXED_CONTENT_BLOCKED]: ERROR_MESSAGES.NETWORK.MIXED_CONTENT,
  [AppErrorCode.PARSE_ERROR]: ERROR_MESSAGES.NETWORK.PARSE_ERROR,
  [AppErrorCode.SERVER_ERROR]: ERROR_MESSAGES.NETWORK.SERVER_ERROR,
  [AppErrorCode.SERVER_UNAUTHORIZED]: ERROR_MESSAGES.NETWORK.SERVER_UNAUTHORIZED,
  [AppErrorCode.RATE_LIMITED]: ERROR_MESSAGES.NETWORK.RATE_LIMITED,
  [AppErrorCode.RESOURCE_NOT_FOUND]: ERROR_MESSAGES.NETWORK.RESOURCE_NOT_FOUND,
  [AppErrorCode.EMPTY_RESPONSE]: ERROR_MESSAGES.NETWORK.EMPTY_RESPONSE,
  [AppErrorCode.PLAYBACK_DECODE_ERROR]: ERROR_MESSAGES.PLAYBACK.DECODE_ERROR,
  [AppErrorCode.PLAYBACK_FORMAT_UNSUPPORTED]: ERROR_MESSAGES.PLAYBACK.FORMAT_UNSUPPORTED,
  [AppErrorCode.PLAYBACK_DRM_ERROR]: ERROR_MESSAGES.PLAYBACK.DRM_ERROR,
  [AppErrorCode.PLAYBACK_SOURCE_NOT_FOUND]: ERROR_MESSAGES.PLAYBACK.SOURCE_NOT_FOUND,
  [AppErrorCode.TRANSCODE_FAILED]: ERROR_MESSAGES.CONTENT.TRANSCODE_FAILED,
  [AppErrorCode.CODEC_UNSUPPORTED]: ERROR_MESSAGES.PLAYBACK.CODEC_UNSUPPORTED,
  [AppErrorCode.TRACK_NOT_FOUND]: ERROR_MESSAGES.PLAYBACK.TRACK_NOT_FOUND,
  [AppErrorCode.TRACK_SWITCH_FAILED]: ERROR_MESSAGES.PLAYBACK.TRACK_SWITCH_FAILED,
  [AppErrorCode.TRACK_SWITCH_TIMEOUT]: ERROR_MESSAGES.PLAYBACK.TRACK_SWITCH_TIMEOUT,
  [AppErrorCode.RENDER_ERROR]: ERROR_MESSAGES.PLAYBACK.RENDER_ERROR,
  [AppErrorCode.SCHEDULER_EMPTY_CHANNEL]: ERROR_MESSAGES.SCHEDULER.EMPTY_CHANNEL,
  [AppErrorCode.SCHEDULER_INVALID_TIME]: ERROR_MESSAGES.SCHEDULER.INVALID_TIME,
  [AppErrorCode.CONTENT_UNAVAILABLE]: ERROR_MESSAGES.CONTENT.UNAVAILABLE,
  [AppErrorCode.LIBRARY_UNAVAILABLE]: ERROR_MESSAGES.CONTENT.LIBRARY_UNAVAILABLE,
  [AppErrorCode.CHANNEL_NOT_FOUND]: ERROR_MESSAGES.CONTENT.CHANNEL_NOT_FOUND,
  [AppErrorCode.EMPTY_CHANNEL]: ERROR_MESSAGES.CONTENT.EMPTY_CHANNEL,
  [AppErrorCode.ITEM_NOT_FOUND]: ERROR_MESSAGES.CONTENT.ITEM_NOT_FOUND,
  [AppErrorCode.STORAGE_QUOTA_EXCEEDED]: ERROR_MESSAGES.STORAGE.QUOTA_EXCEEDED,
  [AppErrorCode.STORAGE_CORRUPTED]: ERROR_MESSAGES.STORAGE.CORRUPTED,
  [AppErrorCode.UI_RENDER_ERROR]: ERROR_MESSAGES.UI.RENDER_ERROR,
  [AppErrorCode.UI_NAVIGATION_BLOCKED]: ERROR_MESSAGES.UI.NAVIGATION_BLOCKED,
  [AppErrorCode.NAV_BOUNDARY]: ERROR_MESSAGES.UI.NAV_BOUNDARY,
  [AppErrorCode.SCROLL_TIMEOUT]: ERROR_MESSAGES.UI.SCROLL_TIMEOUT,
  [AppErrorCode.POOL_EXHAUSTED]: ERROR_MESSAGES.UI.POOL_EXHAUSTED,
  [AppErrorCode.INITIALIZATION_FAILED]: ERROR_MESSAGES.SYSTEM.INITIALIZATION_FAILED,
  [AppErrorCode.PLEX_UNREACHABLE]: ERROR_MESSAGES.SYSTEM.PLEX_UNREACHABLE,
  [AppErrorCode.DATA_CORRUPTION]: ERROR_MESSAGES.SYSTEM.DATA_CORRUPTION,
  [AppErrorCode.PLAYBACK_FAILED]: ERROR_MESSAGES.SYSTEM.PLAYBACK_FAILED,
  [AppErrorCode.OUT_OF_MEMORY]: ERROR_MESSAGES.SYSTEM.OUT_OF_MEMORY,
  [AppErrorCode.MODULE_INIT_FAILED]: ERROR_MESSAGES.SYSTEM.MODULE_INIT_FAILED,
  [AppErrorCode.MODULE_CRASH]: ERROR_MESSAGES.SYSTEM.MODULE_CRASH,
  [AppErrorCode.UNRECOVERABLE]: ERROR_MESSAGES.SYSTEM.UNRECOVERABLE,
  [AppErrorCode.UNKNOWN]: ERROR_MESSAGES.GENERIC.UNKNOWN,
};

/**
 * Get user-facing error message for an error code
 * @param code - AppErrorCode enum value
 * @returns User-facing error message string
 */
export function getErrorMessage(code: AppErrorCode): string {
  const message = ERROR_CODE_MAP[code];
  return message ? message : ERROR_MESSAGES.GENERIC.UNKNOWN;
}

// ============================================
// ERROR RECOVERY ACTIONS
// ============================================

export const ERROR_ACTIONS = {
  RETRY: { label: 'Try Again', action: 'retry' },
  SIGN_IN: { label: 'Sign In', action: 'navigate:auth' },
  GO_HOME: { label: 'Go Home', action: 'navigate:home' },
  SETTINGS: { label: 'Settings', action: 'navigate:settings' },
  SKIP: { label: 'Skip', action: 'skip' },
  RESTART: { label: 'Restart App', action: 'restart' },
  DISMISS: { label: 'OK', action: 'dismiss' },
} as const;

/**
 * Get recommended recovery actions for an error code
 */
type ErrorAction = typeof ERROR_ACTIONS[keyof typeof ERROR_ACTIONS];

const ERROR_ACTION_MAP: Record<AppErrorCode, ErrorAction[]> = {
  [AppErrorCode.AUTH_REQUIRED]: [ERROR_ACTIONS.SIGN_IN],
  [AppErrorCode.AUTH_EXPIRED]: [ERROR_ACTIONS.SIGN_IN],
  [AppErrorCode.AUTH_INVALID]: [ERROR_ACTIONS.SIGN_IN],
  [AppErrorCode.AUTH_FAILED]: [ERROR_ACTIONS.RETRY, ERROR_ACTIONS.SETTINGS],
  [AppErrorCode.AUTH_RATE_LIMITED]: [ERROR_ACTIONS.DISMISS],

  [AppErrorCode.NETWORK_TIMEOUT]: [ERROR_ACTIONS.RETRY, ERROR_ACTIONS.SETTINGS],
  [AppErrorCode.NETWORK_OFFLINE]: [ERROR_ACTIONS.RETRY, ERROR_ACTIONS.SETTINGS],
  [AppErrorCode.NETWORK_UNAVAILABLE]: [ERROR_ACTIONS.RETRY, ERROR_ACTIONS.SETTINGS],
  [AppErrorCode.SERVER_UNREACHABLE]: [ERROR_ACTIONS.RETRY, ERROR_ACTIONS.SETTINGS],
  [AppErrorCode.SERVER_SSL_ERROR]: [ERROR_ACTIONS.SETTINGS, ERROR_ACTIONS.DISMISS],
  [AppErrorCode.MIXED_CONTENT_BLOCKED]: [ERROR_ACTIONS.SETTINGS, ERROR_ACTIONS.DISMISS],
  [AppErrorCode.PARSE_ERROR]: [ERROR_ACTIONS.RETRY, ERROR_ACTIONS.DISMISS],
  [AppErrorCode.SERVER_ERROR]: [ERROR_ACTIONS.RETRY, ERROR_ACTIONS.DISMISS],
  [AppErrorCode.SERVER_UNAUTHORIZED]: [ERROR_ACTIONS.SIGN_IN],
  [AppErrorCode.RATE_LIMITED]: [ERROR_ACTIONS.DISMISS],
  [AppErrorCode.RESOURCE_NOT_FOUND]: [ERROR_ACTIONS.DISMISS],
  [AppErrorCode.EMPTY_RESPONSE]: [ERROR_ACTIONS.RETRY, ERROR_ACTIONS.DISMISS],

  [AppErrorCode.PLAYBACK_DECODE_ERROR]: [ERROR_ACTIONS.SKIP, ERROR_ACTIONS.GO_HOME],
  [AppErrorCode.PLAYBACK_FORMAT_UNSUPPORTED]: [ERROR_ACTIONS.SKIP, ERROR_ACTIONS.GO_HOME],
  [AppErrorCode.PLAYBACK_DRM_ERROR]: [ERROR_ACTIONS.GO_HOME],
  [AppErrorCode.PLAYBACK_SOURCE_NOT_FOUND]: [ERROR_ACTIONS.SKIP, ERROR_ACTIONS.GO_HOME],
  [AppErrorCode.TRANSCODE_FAILED]: [ERROR_ACTIONS.SKIP, ERROR_ACTIONS.GO_HOME],
  [AppErrorCode.CODEC_UNSUPPORTED]: [ERROR_ACTIONS.SKIP, ERROR_ACTIONS.GO_HOME],
  [AppErrorCode.TRACK_NOT_FOUND]: [ERROR_ACTIONS.DISMISS],
  [AppErrorCode.TRACK_SWITCH_FAILED]: [ERROR_ACTIONS.DISMISS],
  [AppErrorCode.TRACK_SWITCH_TIMEOUT]: [ERROR_ACTIONS.DISMISS],
  [AppErrorCode.RENDER_ERROR]: [ERROR_ACTIONS.RETRY, ERROR_ACTIONS.GO_HOME],

  [AppErrorCode.SCHEDULER_EMPTY_CHANNEL]: [ERROR_ACTIONS.SETTINGS, ERROR_ACTIONS.GO_HOME],
  [AppErrorCode.SCHEDULER_INVALID_TIME]: [ERROR_ACTIONS.RETRY, ERROR_ACTIONS.DISMISS],

  [AppErrorCode.CONTENT_UNAVAILABLE]: [ERROR_ACTIONS.GO_HOME],
  [AppErrorCode.LIBRARY_UNAVAILABLE]: [ERROR_ACTIONS.SETTINGS, ERROR_ACTIONS.GO_HOME],
  [AppErrorCode.CHANNEL_NOT_FOUND]: [ERROR_ACTIONS.GO_HOME],
  [AppErrorCode.EMPTY_CHANNEL]: [ERROR_ACTIONS.SETTINGS, ERROR_ACTIONS.GO_HOME],
  [AppErrorCode.ITEM_NOT_FOUND]: [ERROR_ACTIONS.DISMISS],

  [AppErrorCode.STORAGE_QUOTA_EXCEEDED]: [ERROR_ACTIONS.SETTINGS],
  [AppErrorCode.STORAGE_CORRUPTED]: [ERROR_ACTIONS.RESTART],

  [AppErrorCode.UI_RENDER_ERROR]: [ERROR_ACTIONS.RESTART],
  [AppErrorCode.UI_NAVIGATION_BLOCKED]: [ERROR_ACTIONS.DISMISS],
  [AppErrorCode.NAV_BOUNDARY]: [ERROR_ACTIONS.DISMISS],
  [AppErrorCode.SCROLL_TIMEOUT]: [ERROR_ACTIONS.DISMISS],
  [AppErrorCode.POOL_EXHAUSTED]: [ERROR_ACTIONS.DISMISS],

  [AppErrorCode.INITIALIZATION_FAILED]: [ERROR_ACTIONS.RESTART],
  [AppErrorCode.PLEX_UNREACHABLE]: [ERROR_ACTIONS.SETTINGS, ERROR_ACTIONS.RETRY],
  [AppErrorCode.DATA_CORRUPTION]: [ERROR_ACTIONS.RESTART],
  [AppErrorCode.PLAYBACK_FAILED]: [ERROR_ACTIONS.SKIP, ERROR_ACTIONS.GO_HOME],
  [AppErrorCode.OUT_OF_MEMORY]: [ERROR_ACTIONS.GO_HOME, ERROR_ACTIONS.DISMISS],
  [AppErrorCode.MODULE_INIT_FAILED]: [ERROR_ACTIONS.RETRY, ERROR_ACTIONS.RESTART],
  [AppErrorCode.MODULE_CRASH]: [ERROR_ACTIONS.RESTART],
  [AppErrorCode.UNRECOVERABLE]: [ERROR_ACTIONS.RESTART],

  [AppErrorCode.UNKNOWN]: [ERROR_ACTIONS.DISMISS],
};

export function getErrorActions(code: AppErrorCode): ErrorAction[] {
  return ERROR_ACTION_MAP[code];
}
