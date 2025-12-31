/**
 * @module ErrorMessages
 * @description Unified error message catalog for consistent user-facing error strings
 * @version 1.0.0
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

import { AppErrorCode } from './shared-types';

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
    SERVER_UNREACHABLE: 'Unable to reach the Plex server. Please try again later.',
    MIXED_CONTENT: 'Secure connection required. Some local servers may not be accessible.',
    RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  },

  // Playback Errors
  PLAYBACK: {
    DECODE_ERROR: 'Unable to play this video. The format may not be supported.',
    FORMAT_UNSUPPORTED: 'This video format is not supported on your TV.',
    DRM_ERROR: 'This content is protected and cannot be played.',
    SOURCE_NOT_FOUND: 'Video not found. It may have been removed from the library.',
    STREAM_START_FAILED: 'Unable to start playback. Trying next available option...',
    BUFFER_STALLED: 'Buffering... Please wait or check your connection.',
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
  },

  // Generic
  GENERIC: {
    UNKNOWN: 'An unexpected error occurred. Please try again.',
    RETRY: 'Something went wrong. Retrying...',
    CONTACT_SUPPORT: 'If this problem persists, please restart the app.',
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
  [AppErrorCode.NETWORK_TIMEOUT]: ERROR_MESSAGES.NETWORK.TIMEOUT,
  [AppErrorCode.NETWORK_OFFLINE]: ERROR_MESSAGES.NETWORK.OFFLINE,
  [AppErrorCode.SERVER_UNREACHABLE]: ERROR_MESSAGES.NETWORK.SERVER_UNREACHABLE,
  [AppErrorCode.MIXED_CONTENT_BLOCKED]: ERROR_MESSAGES.NETWORK.MIXED_CONTENT,
  [AppErrorCode.PLAYBACK_DECODE_ERROR]: ERROR_MESSAGES.PLAYBACK.DECODE_ERROR,
  [AppErrorCode.PLAYBACK_FORMAT_UNSUPPORTED]: ERROR_MESSAGES.PLAYBACK.FORMAT_UNSUPPORTED,
  [AppErrorCode.PLAYBACK_DRM_ERROR]: ERROR_MESSAGES.PLAYBACK.DRM_ERROR,
  [AppErrorCode.PLAYBACK_SOURCE_NOT_FOUND]: ERROR_MESSAGES.PLAYBACK.SOURCE_NOT_FOUND,
  [AppErrorCode.SCHEDULER_EMPTY_CHANNEL]: ERROR_MESSAGES.SCHEDULER.EMPTY_CHANNEL,
  [AppErrorCode.SCHEDULER_INVALID_TIME]: ERROR_MESSAGES.SCHEDULER.INVALID_TIME,
  [AppErrorCode.STORAGE_QUOTA_EXCEEDED]: ERROR_MESSAGES.STORAGE.QUOTA_EXCEEDED,
  [AppErrorCode.STORAGE_CORRUPTED]: ERROR_MESSAGES.STORAGE.CORRUPTED,
  [AppErrorCode.UI_RENDER_ERROR]: ERROR_MESSAGES.UI.RENDER_ERROR,
  [AppErrorCode.UI_NAVIGATION_BLOCKED]: ERROR_MESSAGES.UI.NAVIGATION_BLOCKED,
  [AppErrorCode.UNKNOWN]: ERROR_MESSAGES.GENERIC.UNKNOWN,
};

/**
 * Get user-facing error message for an error code
 * @param code - AppErrorCode enum value
 * @returns User-facing error message string
 */
export function getErrorMessage(code: AppErrorCode): string {
  return ERROR_CODE_MAP[code] ?? ERROR_MESSAGES.GENERIC.UNKNOWN;
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
export function getErrorActions(code: AppErrorCode): Array<typeof ERROR_ACTIONS[keyof typeof ERROR_ACTIONS]> {
  switch (code) {
    case AppErrorCode.AUTH_REQUIRED:
    case AppErrorCode.AUTH_EXPIRED:
    case AppErrorCode.AUTH_INVALID:
      return [ERROR_ACTIONS.SIGN_IN];
    
    case AppErrorCode.NETWORK_TIMEOUT:
    case AppErrorCode.SERVER_UNREACHABLE:
      return [ERROR_ACTIONS.RETRY, ERROR_ACTIONS.SETTINGS];
    
    case AppErrorCode.NETWORK_OFFLINE:
      return [ERROR_ACTIONS.RETRY];
    
    case AppErrorCode.PLAYBACK_DECODE_ERROR:
    case AppErrorCode.PLAYBACK_FORMAT_UNSUPPORTED:
    case AppErrorCode.PLAYBACK_SOURCE_NOT_FOUND:
      return [ERROR_ACTIONS.SKIP, ERROR_ACTIONS.GO_HOME];
    
    case AppErrorCode.SCHEDULER_EMPTY_CHANNEL:
      return [ERROR_ACTIONS.SETTINGS, ERROR_ACTIONS.GO_HOME];
    
    case AppErrorCode.STORAGE_QUOTA_EXCEEDED:
      return [ERROR_ACTIONS.SETTINGS];
    
    case AppErrorCode.STORAGE_CORRUPTED:
      return [ERROR_ACTIONS.RESTART];
    
    default:
      return [ERROR_ACTIONS.RETRY, ERROR_ACTIONS.DISMISS];
  }
}
