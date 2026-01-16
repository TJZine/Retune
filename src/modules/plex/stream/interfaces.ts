/**
 * @fileoverview Plex Stream Resolver interfaces.
 * Defines the public interface for stream resolution and session management.
 * @module modules/plex/stream/interfaces
 * @version 1.0.0
 */

import type {
    PlexStreamErrorCode,
    PlexMediaItem,
    StreamRequest,
    StreamDecision,
    HlsOptions,
} from './types';

// ============================================
// Error Types
// ============================================

/**
 * Stream resolver error structure.
 * Uses PlexStreamErrorCode for stream resolver errors.
 */
export interface StreamResolverError {
    /** Error code from stream resolver taxonomy */
    code: PlexStreamErrorCode;
    /** Human-readable error message */
    message: string;
    /** Whether recovery might succeed */
    recoverable: boolean;
    /** Milliseconds to wait before retry (if retryable) */
    retryAfterMs?: number;
}

// ============================================
// Event Types
// ============================================

/**
 * Payload for sessionStart event.
 */
export interface SessionStartPayload {
    sessionId: string;
    itemKey: string;
}

/**
 * Payload for sessionEnd event.
 */
export interface SessionEndPayload {
    sessionId: string;
    itemKey: string;
    positionMs: number;
}

/**
 * Payload for progressTimeout event.
 */
export interface ProgressTimeoutPayload {
    sessionId: string;
    itemKey: string;
}

/**
 * Event map for PlexStreamResolver events.
 */
export interface StreamResolverEventMap {
    sessionStart: SessionStartPayload;
    sessionEnd: SessionEndPayload;
    error: StreamResolverError;
    /** Emitted when progress reporting exceeds timeout budget (diagnostic) */
    progressTimeout: ProgressTimeoutPayload;
    /** Index signature for EventEmitter compatibility */
    [key: string]: SessionStartPayload | SessionEndPayload | StreamResolverError | ProgressTimeoutPayload;
}

// ============================================
// Configuration
// ============================================

/**
 * Configuration for PlexStreamResolver.
 */
export interface PlexStreamResolverConfig {
    /** Function to get auth headers for Plex API requests */
    getAuthHeaders: () => Record<string, string>;
    /** Function to get current server URI */
    getServerUri: () => string | null;
    /**
     * Optional: Function to get the currently selected server connection metadata.
     * Used to classify transcode requests as LAN vs WAN when possible.
     */
    getSelectedConnection?: () => { uri: string; local: boolean; relay: boolean } | null;
    /** Function to get an HTTPS connection (for mixed content fallback) */
    getHttpsConnection: () => { uri: string } | null;
    /** Function to get a relay connection (for mixed content fallback) */
    getRelayConnection: () => { uri: string } | null;
    /** Function to get a media item by ratingKey */
    getItem: (ratingKey: string) => Promise<PlexMediaItem | null>;
    /** Client identifier for session tracking */
    clientIdentifier: string;
}

// ============================================
// Main Interface
// ============================================

/**
 * Plex Stream Resolver Interface.
 * Resolves playback URLs and manages playback sessions.
 */
export interface IPlexStreamResolver {
    // ========================================
    // Stream Resolution
    // ========================================

    /**
     * Resolve the best stream URL for a media item.
     * Determines direct play vs transcoding based on codec compatibility.
     * @param request - Stream request parameters
     * @returns Promise resolving to stream decision
     * @throws StreamResolverError on failure
     */
    resolveStream(request: StreamRequest): Promise<StreamDecision>;

    // ========================================
    // Session Management
    // ========================================

    /**
     * Start a new playback session.
     * @param itemKey - ratingKey of the media item
     * @returns Promise resolving to session ID
     */
    startSession(itemKey: string): Promise<string>;

    /**
     * Report playback progress to Plex server.
     * Updates "Continue Watching" feature.
     * @param sessionId - Session identifier
     * @param itemKey - ratingKey of the media item
     * @param positionMs - Current playback position in milliseconds
     * @param state - Playback state
     */
    updateProgress(
        sessionId: string,
        itemKey: string,
        positionMs: number,
        state: 'playing' | 'paused' | 'stopped'
    ): Promise<void>;

    /**
     * End a playback session.
     * Reports final position and stops any active transcode.
     * @param sessionId - Session identifier
     * @param itemKey - ratingKey of the media item
     */
    endSession(sessionId: string, itemKey: string): Promise<void>;

    // ========================================
    // Direct Play Check
    // ========================================

    /**
     * Check if a media item can be played directly without transcoding.
     * @param item - Media item to check
     * @returns true if direct play is supported
     */
    canDirectPlay(item: PlexMediaItem): boolean;

    // ========================================
    // Transcode Options
    // ========================================

    /**
     * Generate an HLS transcode URL for a media item.
     * @param itemKey - ratingKey of the media item
     * @param options - HLS transcoding options (required per SSOT)
     * @returns Full transcode URL
     */
    getTranscodeUrl(itemKey: string, options: HlsOptions): string;

    /**
     * Fetch Plex's "universal transcode decision" response for a session.
     * This is a best-effort diagnostic helper to show whether PMS is copying
     * video (Direct Stream) vs transcoding video/audio.
     */
    fetchUniversalTranscodeDecision(
        itemKey: string,
        options: { sessionId: string; maxBitrate?: number; audioStreamId?: string }
    ): Promise<NonNullable<StreamDecision['serverDecision']>>;

    // ========================================
    // Events
    // ========================================

    /**
     * Register handler for resolver events.
     * @param event - Event name
     * @param handler - Handler function
     */
    on<K extends keyof StreamResolverEventMap>(
        event: K,
        handler: (payload: StreamResolverEventMap[K]) => void
    ): void;
}
