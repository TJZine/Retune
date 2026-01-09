/**
 * @fileoverview Public exports for Video Player module.
 * @module modules/player
 * @version 1.0.0
 */

export { VideoPlayer, mapMediaErrorCodeToPlaybackError } from './VideoPlayer';
export { SubtitleManager } from './SubtitleManager';

// Interface
export type { IVideoPlayer } from './interfaces';

// Types
export type {
    VideoPlayerConfig,
    StreamDescriptor,
    MediaMetadata,
    SubtitleTrack,
    AudioTrack,
    PlaybackState,
    PlayerStatus,
    PlaybackError,
    TimeRange,
    PlayerEventMap,
} from './types';

// Re-export PlayerErrorCode for convenience
export { PlayerErrorCode } from './types';
export { mapPlayerErrorCodeToAppErrorCode } from './types';
