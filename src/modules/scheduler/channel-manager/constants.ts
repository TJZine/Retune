/**
 * @fileoverview Constants for Channel Manager module.
 * @module modules/scheduler/channel-manager/constants
 * @version 1.0.0
 */

// ============================================
// Storage Keys
// ============================================

/** localStorage key for channel configurations */
export const STORAGE_KEY = 'retune_channels_v4';

/** Legacy localStorage key for channel configurations (pre-version bump) */
export const LEGACY_STORAGE_KEY = 'retune_channels';

/** localStorage key for current channel ID */
export const CURRENT_CHANNEL_KEY = 'retune_current_channel_v4';

/** Legacy localStorage key for current channel ID (pre-version bump) */
export const LEGACY_CURRENT_CHANNEL_KEY = 'retune_current_channel';

/** Storage schema version for migrations */
export const STORAGE_VERSION = 2;

// ============================================
// Caching
// ============================================

/** Content cache TTL in milliseconds (1 hour per spec) */
export const CACHE_TTL_MS = 60 * 60 * 1000;

// ============================================
// Limits
// ============================================

/** Maximum number of channels allowed */
export const MAX_CHANNELS = 100;

/** Minimum channel number */
export const MIN_CHANNEL_NUMBER = 1;

/** Maximum channel number */
export const MAX_CHANNEL_NUMBER = 999;

// ============================================
// Error Messages
// ============================================

export const CHANNEL_ERROR_MESSAGES = {
    CHANNEL_NOT_FOUND: 'Channel not found',
    CONTENT_SOURCE_REQUIRED: 'Content source is required',
    MAX_CHANNELS_REACHED: 'Maximum number of channels reached',
    INVALID_CHANNEL_NUMBER: 'Channel number must be between 1 and 999',
    DUPLICATE_CHANNEL_NUMBER: 'Channel number already in use',
    INVALID_IMPORT_DATA: 'Import file is invalid',
    EMPTY_CONTENT: 'No playable content found after filtering',
} as const;
