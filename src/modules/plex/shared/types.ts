/**
 * @fileoverview Shared Plex media type definitions.
 * @module modules/plex/shared/types
 * @version 1.0.0
 */

/**
 * A stream within a media file.
 */
export interface PlexStream {
    id: string;
    streamType: 1 | 2 | 3;
    codec: string;
    language?: string;
    languageCode?: string;
    title?: string;
    selected?: boolean;
    default?: boolean;
    forced?: boolean;
    width?: number;
    height?: number;
    bitrate?: number;
    frameRate?: number;
    channels?: number;
    samplingRate?: number;
    format?: string;
    key?: string;
    profile?: string;
    colorTrc?: string;
    colorSpace?: string;
    colorPrimaries?: string;
    bitDepth?: number;
    hdr?: string;
    dynamicRange?: string;
}

/**
 * A part of a media file.
 */
export interface PlexMediaPart {
    id: string;
    key: string;
    duration: number;
    file: string;
    size: number;
    container: string;
    videoProfile?: string;
    audioProfile?: string;
    streams: PlexStream[];
}

/**
 * A specific media file/version.
 */
export interface PlexMediaFile {
    id: string;
    duration: number;
    bitrate: number;
    width: number;
    height: number;
    aspectRatio: number;
    videoCodec: string;
    audioCodec: string;
    audioChannels: number;
    container: string;
    videoResolution: string;
    parts: PlexMediaPart[];
}
