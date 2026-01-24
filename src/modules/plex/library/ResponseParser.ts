/**
 * @fileoverview Response parsing utilities for Plex API responses.
 * @module modules/plex/library/ResponseParser
 * @version 1.0.0
 */

import type {
    PlexLibrary,
    PlexLibraryType,
    PlexMediaItem,
    PlexMediaType,
    PlexMediaFile,
    PlexMediaPart,
    PlexStream,
    PlexSeason,
    PlexCollection,
    PlexPlaylist,
    PlexTagDirectoryItem,
} from './types';

import type {
    RawLibrarySection,
    RawMediaItem,
    RawMediaFile,
    RawMediaPart,
    RawStream,
    RawSeason,
    RawCollection,
    RawPlaylist,
    RawDirectoryTag,
} from './types';

// ============================================
// Library Parsing
// ============================================

/**
 * Parse library sections from Plex API response.
 * @param directories - Raw directory entries from Plex API
 * @returns Parsed library array
 */
export function parseLibrarySections(directories: RawLibrarySection[]): PlexLibrary[] {
    return (directories || []).map(parseLibrarySection);
}

/**
 * Parse a single library section.
 * @param data - Raw library section from Plex API
 * @returns Parsed library
 */
export function parseLibrarySection(data: RawLibrarySection): PlexLibrary {
    return {
        id: data.key,
        uuid: data.uuid,
        title: data.title,
        type: mapLibraryType(data.type),
        agent: data.agent,
        scanner: data.scanner,
        contentCount: 0, // Will be populated when fetching items
        lastScannedAt: data.scannedAt ? new Date(data.scannedAt * 1000) : new Date(0),
        art: data.art ?? null,
        thumb: data.thumb ?? null,
    };
}

/**
 * Map Plex library type string to typed enum.
 * @param type - Raw type string from Plex API
 * @returns Mapped library type
 */
export function mapLibraryType(type: string): PlexLibraryType {
    switch (type) {
        case 'movie':
            return 'movie';
        case 'show':
            return 'show';
        case 'artist':
            return 'artist';
        case 'photo':
            return 'photo';
        default:
            console.warn(`[ResponseParser] Unknown library type: ${type}, defaulting to 'movie'`);
            return 'movie';
    }
}

// ============================================
// Media Item Parsing
// ============================================

/**
 * Parse media items from Plex API response.
 * @param metadata - Raw metadata entries from Plex API
 * @returns Parsed media item array
 */
export function parseMediaItems(metadata: RawMediaItem[]): PlexMediaItem[] {
    return (metadata || []).map(parseMediaItem);
}

/**
 * Parse a single media item.
 * @param data - Raw media item from Plex API
 * @returns Parsed media item
 */
export function parseMediaItem(data: RawMediaItem): PlexMediaItem {
    const item: PlexMediaItem = {
        ratingKey: data.ratingKey,
        key: data.key,
        type: mapMediaType(data.type),
        title: data.title,
        sortTitle: data.titleSort ?? data.title,
        summary: data.summary ?? '',
        year: data.year ?? 0,
        durationMs: data.duration ?? 0,
        addedAt: data.addedAt ? new Date(data.addedAt * 1000) : new Date(0),
        updatedAt: data.updatedAt ? new Date(data.updatedAt * 1000) : new Date(0),
        thumb: data.thumb ?? null,
        art: data.art ?? null,
        viewOffset: data.viewOffset ?? 0,
        viewCount: data.viewCount ?? 0,
        media: (data.Media || []).map(parseMediaFile),
    };

    // Optional properties - only include if present
    if (data.originalTitle !== undefined) item.originalTitle = data.originalTitle;
    if (data.banner !== undefined) item.banner = data.banner ?? null;
    if (data.rating !== undefined) item.rating = data.rating;
    if (data.audienceRating !== undefined) item.audienceRating = data.audienceRating;
    if (data.contentRating !== undefined) item.contentRating = data.contentRating;
    if (data.Genre && data.Genre.length > 0) {
        const genres = data.Genre.map((tag) => tag.tag).filter((tag): tag is string => !!tag);
        if (genres.length > 0) item.genres = genres;
    }
    if (data.Director && data.Director.length > 0) {
        const directors = data.Director.map((tag) => tag.tag).filter((tag): tag is string => !!tag);
        if (directors.length > 0) item.directors = directors;
    }
    if (data.grandparentTitle !== undefined) item.grandparentTitle = data.grandparentTitle;
    if (data.parentTitle !== undefined) item.parentTitle = data.parentTitle;
    if (data.grandparentRatingKey !== undefined) item.grandparentRatingKey = data.grandparentRatingKey;
    if (data.parentRatingKey !== undefined) item.parentRatingKey = data.parentRatingKey;
    if (data.parentIndex !== undefined) item.seasonNumber = data.parentIndex;
    if (data.index !== undefined) item.episodeNumber = data.index;
    if (data.lastViewedAt !== undefined) item.lastViewedAt = new Date(data.lastViewedAt * 1000);

    return item;
}

/**
 * Map Plex media type string to typed enum.
 * @param type - Raw type string from Plex API
 * @returns Mapped media type
 */
export function mapMediaType(type: string): PlexMediaType {
    switch (type) {
        case 'movie':
            return 'movie';
        case 'show':
            return 'show';
        case 'episode':
            return 'episode';
        case 'track':
            return 'track';
        case 'clip':
            return 'clip';
        default:
            console.warn(`[ResponseParser] Unknown media type: ${type}, defaulting to 'movie'`);
            return 'movie';
    }
}

// ============================================
// Directory Tag Parsing
// ============================================

/**
 * Parse tag directory entries (actors/studios) from Plex API response.
 * @param directories - Raw directory entries from Plex API
 * @returns Parsed tag directory array
 */
export function parseDirectoryTags(directories: RawDirectoryTag[]): PlexTagDirectoryItem[] {
    return (directories || []).map((entry) => {
        const parsed: PlexTagDirectoryItem = {
            key: String(entry.key),
            title: entry.title,
            count: typeof entry.count === 'number' && Number.isFinite(entry.count) ? entry.count : 0,
        };
        if (entry.fastKey !== undefined) {
            parsed.fastKey = entry.fastKey;
        }
        if (entry.thumb !== undefined) {
            parsed.thumb = entry.thumb;
        }
        return parsed;
    });
}

// ============================================
// Media File Parsing
// ============================================

/**
 * Parse a media file from Plex API.
 * @param data - Raw media file from Plex API
 * @returns Parsed media file
 */
export function parseMediaFile(data: RawMediaFile): PlexMediaFile {
    // Pre-normalize codec/container strings to lowercase to avoid repeated allocations
    // in hot paths like direct play detection (SUGGESTION-001)
    const videoCodec = data.videoCodec ?? '';
    const audioCodec = data.audioCodec ?? '';
    const container = data.container ?? '';

    return {
        id: String(data.id),
        duration: data.duration ?? 0,
        bitrate: data.bitrate ?? 0,
        width: data.width ?? 0,
        height: data.height ?? 0,
        aspectRatio: data.aspectRatio ?? 0,
        videoCodec: videoCodec.toLowerCase(),
        audioCodec: audioCodec.toLowerCase(),
        audioChannels: data.audioChannels ?? 0,
        container: container.toLowerCase(),
        videoResolution: data.videoResolution ?? '',
        parts: (data.Part || []).map(parseMediaPart),
    };
}

/**
 * Parse a media part from Plex API.
 * @param data - Raw media part from Plex API
 * @returns Parsed media part
 */
export function parseMediaPart(data: RawMediaPart): PlexMediaPart {
    const part: PlexMediaPart = {
        id: String(data.id),
        key: data.key,
        duration: data.duration ?? 0,
        file: data.file ?? '',
        size: data.size ?? 0,
        container: data.container ?? '',
        streams: (data.Stream || []).map(parseStream),
    };

    if (data.videoProfile !== undefined) part.videoProfile = data.videoProfile;
    if (data.audioProfile !== undefined) part.audioProfile = data.audioProfile;

    return part;
}

/**
 * Parse a stream from Plex API.
 * @param data - Raw stream from Plex API
 * @returns Parsed stream
 */
export function parseStream(data: RawStream): PlexStream {
    // Validate streamType (1=video, 2=audio, 3=subtitle)
    const validStreamTypes = [1, 2, 3] as const;
    let streamType: 1 | 2 | 3;
    if (validStreamTypes.includes(data.streamType as 1 | 2 | 3)) {
        streamType = data.streamType as 1 | 2 | 3;
    } else {
        console.warn(`[ResponseParser] Invalid streamType: ${data.streamType}, defaulting to 1 (video)`);
        streamType = 1;
    }

    const stream: PlexStream = {
        id: String(data.id),
        streamType,
        codec: data.codec ?? '',
    };

    if (data.language !== undefined) stream.language = data.language;
    if (data.languageCode !== undefined) stream.languageCode = data.languageCode;
    if (data.title !== undefined) stream.title = data.title;
    if (data.displayTitle !== undefined) stream.displayTitle = data.displayTitle;
    if (data.extendedDisplayTitle !== undefined) stream.extendedDisplayTitle = data.extendedDisplayTitle;
    if (data.selected !== undefined) stream.selected = data.selected;
    if (data.default !== undefined) stream.default = data.default;
    if (data.forced !== undefined) stream.forced = data.forced;
    if (data.width !== undefined) stream.width = data.width;
    if (data.height !== undefined) stream.height = data.height;
    if (data.bitrate !== undefined) stream.bitrate = data.bitrate;
    if (data.frameRate !== undefined) stream.frameRate = data.frameRate;
    if (data.channels !== undefined) stream.channels = data.channels;
    if (data.samplingRate !== undefined) stream.samplingRate = data.samplingRate;
    if (data.format !== undefined) stream.format = data.format;
    if (data.key !== undefined) stream.key = data.key;
    if (data.profile !== undefined) stream.profile = data.profile;
    if (data.colorTrc !== undefined) stream.colorTrc = data.colorTrc;
    if (data.colorSpace !== undefined) stream.colorSpace = data.colorSpace;
    if (data.colorPrimaries !== undefined) stream.colorPrimaries = data.colorPrimaries;
    if (data.bitDepth !== undefined) stream.bitDepth = data.bitDepth;
    if (data.hdr !== undefined) stream.hdr = data.hdr;
    if (data.dynamicRange !== undefined) stream.dynamicRange = data.dynamicRange;
    if (data.DOVIProfile !== undefined) stream.doviProfile = String(data.DOVIProfile);
    if (data.DOVIPresent !== undefined) {
        if (typeof data.DOVIPresent === 'boolean') {
            stream.doviPresent = data.DOVIPresent;
        } else if (typeof data.DOVIPresent === 'number') {
            stream.doviPresent = data.DOVIPresent > 0;
        } else if (typeof data.DOVIPresent === 'string') {
            const normalized = data.DOVIPresent.trim().toLowerCase();
            stream.doviPresent = normalized === '1' || normalized === 'true' || normalized === 'yes';
        }
    }

    return stream;
}

// ============================================
// Season/Collection/Playlist Parsing
// ============================================

/**
 * Parse seasons from Plex API response.
 * @param metadata - Raw metadata entries from Plex API
 * @returns Parsed season array
 */
export function parseSeasons(metadata: RawSeason[]): PlexSeason[] {
    return (metadata || []).map(parseSeason);
}

/**
 * Parse a single season.
 * @param data - Raw season from Plex API
 * @returns Parsed season
 */
export function parseSeason(data: RawSeason): PlexSeason {
    return {
        ratingKey: data.ratingKey,
        key: data.key,
        title: data.title,
        index: data.index ?? 0,
        leafCount: data.leafCount ?? 0,
        viewedLeafCount: data.viewedLeafCount ?? 0,
        thumb: data.thumb ?? null,
    };
}

/**
 * Parse collections from Plex API response.
 * @param metadata - Raw metadata entries from Plex API
 * @returns Parsed collection array
 */
export function parseCollections(metadata: RawCollection[]): PlexCollection[] {
    return (metadata || []).map(parseCollection);
}

/**
 * Parse a single collection.
 * @param data - Raw collection from Plex API
 * @returns Parsed collection
 */
export function parseCollection(data: RawCollection): PlexCollection {
    return {
        ratingKey: data.ratingKey,
        key: data.key,
        title: data.title,
        thumb: data.thumb ?? null,
        childCount: data.childCount ?? 0,
    };
}

/**
 * Parse playlists from Plex API response.
 * @param metadata - Raw metadata entries from Plex API
 * @returns Parsed playlist array
 */
export function parsePlaylists(metadata: RawPlaylist[]): PlexPlaylist[] {
    return (metadata || []).map(parsePlaylist);
}

/**
 * Parse a single playlist.
 * @param data - Raw playlist from Plex API
 * @returns Parsed playlist
 */
export function parsePlaylist(data: RawPlaylist): PlexPlaylist {
    return {
        ratingKey: data.ratingKey,
        key: data.key,
        title: data.title,
        thumb: data.thumb ?? null,
        duration: data.duration ?? 0,
        leafCount: data.leafCount ?? 0,
    };
}
