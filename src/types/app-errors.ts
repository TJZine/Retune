/**
 * @fileoverview Canonical application error taxonomy and base error shape.
 * @module types/app-errors
 * @version 1.0.0
 */

/**
 * Unified error codes for consistent error handling across the app.
 * Mirrors spec-pack/artifact-2-shared-types.ts (kept in src for runtime use).
 */
export enum AppErrorCode {
    // Authentication Errors (1xx)
    AUTH_REQUIRED = 'AUTH_REQUIRED',
    AUTH_EXPIRED = 'AUTH_EXPIRED',
    AUTH_INVALID = 'AUTH_INVALID',
    AUTH_FAILED = 'AUTH_FAILED',
    AUTH_RATE_LIMITED = 'AUTH_RATE_LIMITED',

    // Network Errors (2xx)
    NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
    NETWORK_OFFLINE = 'NETWORK_OFFLINE',
    SERVER_UNREACHABLE = 'SERVER_UNREACHABLE',
    SERVER_SSL_ERROR = 'SERVER_SSL_ERROR',
    MIXED_CONTENT_BLOCKED = 'MIXED_CONTENT_BLOCKED',

    // Playback Errors (3xx)
    PLAYBACK_DECODE_ERROR = 'PLAYBACK_DECODE_ERROR',
    PLAYBACK_FORMAT_UNSUPPORTED = 'PLAYBACK_FORMAT_UNSUPPORTED',
    PLAYBACK_DRM_ERROR = 'PLAYBACK_DRM_ERROR',
    PLAYBACK_SOURCE_NOT_FOUND = 'PLAYBACK_SOURCE_NOT_FOUND',
    TRANSCODE_FAILED = 'TRANSCODE_FAILED',

    // Content Errors (4xx)
    SCHEDULER_EMPTY_CHANNEL = 'SCHEDULER_EMPTY_CHANNEL',
    SCHEDULER_INVALID_TIME = 'SCHEDULER_INVALID_TIME',
    CONTENT_UNAVAILABLE = 'CONTENT_UNAVAILABLE',
    LIBRARY_UNAVAILABLE = 'LIBRARY_UNAVAILABLE',

    // Storage Errors (5xx)
    STORAGE_QUOTA_EXCEEDED = 'STORAGE_QUOTA_EXCEEDED',
    STORAGE_CORRUPTED = 'STORAGE_CORRUPTED',

    // UI Errors (6xx)
    UI_RENDER_ERROR = 'UI_RENDER_ERROR',
    UI_NAVIGATION_BLOCKED = 'UI_NAVIGATION_BLOCKED',

    // System / Lifecycle / Module Errors (7xx)
    INITIALIZATION_FAILED = 'INITIALIZATION_FAILED',
    PLEX_UNREACHABLE = 'PLEX_UNREACHABLE',
    DATA_CORRUPTION = 'DATA_CORRUPTION',
    PLAYBACK_FAILED = 'PLAYBACK_FAILED',
    OUT_OF_MEMORY = 'OUT_OF_MEMORY',
    MODULE_INIT_FAILED = 'MODULE_INIT_FAILED',
    MODULE_CRASH = 'MODULE_CRASH',
    UNRECOVERABLE = 'UNRECOVERABLE',

    // Additional Network/API Errors (8xx)
    NETWORK_UNAVAILABLE = 'NETWORK_UNAVAILABLE',
    PARSE_ERROR = 'PARSE_ERROR',
    SERVER_ERROR = 'SERVER_ERROR',
    SERVER_UNAUTHORIZED = 'SERVER_UNAUTHORIZED',
    RATE_LIMITED = 'RATE_LIMITED',
    RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
    EMPTY_RESPONSE = 'EMPTY_RESPONSE',

    // Playback/Stream Errors (9xx)
    CODEC_UNSUPPORTED = 'CODEC_UNSUPPORTED',
    TRACK_NOT_FOUND = 'TRACK_NOT_FOUND',
    TRACK_SWITCH_FAILED = 'TRACK_SWITCH_FAILED',
    TRACK_SWITCH_TIMEOUT = 'TRACK_SWITCH_TIMEOUT',
    RENDER_ERROR = 'RENDER_ERROR',

    // Channel/Content Errors (10xx)
    CHANNEL_NOT_FOUND = 'CHANNEL_NOT_FOUND',
    EMPTY_CHANNEL = 'EMPTY_CHANNEL',
    ITEM_NOT_FOUND = 'ITEM_NOT_FOUND',

    // Navigation/UI Errors (11xx)
    NAV_BOUNDARY = 'NAV_BOUNDARY',
    SCROLL_TIMEOUT = 'SCROLL_TIMEOUT',
    POOL_EXHAUSTED = 'POOL_EXHAUSTED',

    // Generic
    UNKNOWN = 'UNKNOWN',
}

/**
 * Base application error structure.
 */
export interface AppError {
    /** Error code from canonical taxonomy */
    code: AppErrorCode;
    /** Technical error message */
    message: string;
    /** Whether recovery might succeed */
    recoverable: boolean;
    /** Additional context for debugging */
    context?: Record<string, unknown>;
}
