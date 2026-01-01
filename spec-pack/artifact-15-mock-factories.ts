/**
 * Mock Factory Patterns for Retune Test Suite
 * 
 * This module provides centralized mock factories for consistent test data
 * across all module unit tests. Use these factories instead of creating
 * ad-hoc mock objects to ensure consistent behavior.
 * 
 * @module test/mocks
 */

// ============================================
// DATA FACTORIES
// ============================================

/**
 * Creates a mock PlexAuthData object
 */
export function createMockAuthData(
    overrides: Partial<PlexAuthData> = {}
): PlexAuthData {
    return {
        token: 'mock-plex-token-abc123',
        userId: 'user-123',
        username: 'TestUser',
        email: 'test@example.com',
        thumb: 'https://plex.tv/users/abc/avatar',
        authToken: 'mock-auth-token',
        clientIdentifier: 'retune-mock-client',
        ...overrides
    };
}

/**
 * Creates a mock PlexServer object
 */
export function createMockServer(
    overrides: Partial<PlexServer> = {}
): PlexServer {
    return {
        id: 'server-123',
        name: 'Mock Plex Server',
        sourceTitle: 'TestUser',
        ownerId: 12345,
        owned: true,
        capabilities: ['server', 'video', 'audio'],
        connections: [createMockConnection()],
        preferredConnection: null,
        ...overrides
    };
}

/**
 * Creates a mock PlexConnection object
 */
export function createMockConnection(
    overrides: Partial<PlexConnection> = {}
): PlexConnection {
    return {
        uri: 'https://192.168.1.100:32400',
        protocol: 'https',
        address: '192.168.1.100',
        port: 32400,
        local: true,
        relay: false,
        latencyMs: 25,
        ...overrides
    };
}

/**
 * Creates a mock PlexLibrary object
 */
export function createMockLibrary(
    overrides: Partial<PlexLibrary> = {}
): PlexLibrary {
    return {
        key: 'library-1',
        title: 'Movies',
        type: 'movie',
        scanner: 'Plex Movie Scanner',
        agent: 'tv.plex.agents.movie',
        itemCount: 150,
        uuid: 'lib-uuid-123',
        ...overrides
    };
}

/**
 * Creates a mock PlexMediaItem object
 */
export function createMockMediaItem(
    overrides: Partial<PlexMediaItem> = {}
): PlexMediaItem {
    return {
        ratingKey: 'item-12345',
        key: '/library/metadata/12345',
        type: 'movie',
        title: 'Test Movie',
        originalTitle: 'Test Movie',
        sortTitle: 'Test Movie',
        summary: 'A mock movie for testing purposes.',
        year: 2023,
        durationMs: 7200000, // 2 hours
        addedAt: new Date('2023-01-15'),
        updatedAt: new Date('2023-06-20'),
        thumb: '/library/metadata/12345/thumb',
        art: '/library/metadata/12345/art',
        rating: 7.5,
        audienceRating: 8.0,
        contentRating: 'PG-13',
        grandparentTitle: undefined,
        parentTitle: undefined,
        seasonNumber: undefined,
        episodeNumber: undefined,
        viewOffset: 0,
        viewCount: 0,
        lastViewedAt: undefined,
        media: [createMockMediaFile()],
        ...overrides
    };
}

/**
 * Creates a mock episode item
 */
export function createMockEpisode(
    overrides: Partial<PlexMediaItem> = {}
): PlexMediaItem {
    return createMockMediaItem({
        type: 'episode',
        title: 'Test Episode',
        grandparentTitle: 'Test Show',
        parentTitle: 'Season 1',
        seasonNumber: 1,
        episodeNumber: 1,
        durationMs: 2700000, // 45 minutes
        ...overrides
    });
}

/**
 * Creates a mock PlexMediaFile object
 */
export function createMockMediaFile(
    overrides: Partial<PlexMediaFile> = {}
): PlexMediaFile {
    return {
        id: 'media-1',
        container: 'mp4',
        videoCodec: 'h264',
        audioCodec: 'aac',
        videoResolution: '1080',
        width: 1920,
        height: 1080,
        bitrate: 8000,
        aspectRatio: 1.78,
        videoFrameRate: '24p',
        audioChannels: 2,
        parts: [createMockMediaPart()],
        ...overrides
    };
}

/**
 * Creates a mock PlexMediaPart object
 */
export function createMockMediaPart(
    overrides: Partial<PlexMediaPart> = {}
): PlexMediaPart {
    return {
        id: 'part-1',
        key: '/library/parts/1/file.mp4',
        duration: 7200000,
        file: '/media/movies/test_movie.mp4',
        size: 4000000000,
        container: 'mp4',
        streams: [],
        ...overrides
    };
}

/**
 * Creates a mock ChannelConfig object
 */
export function createMockChannel(
    overrides: Partial<ChannelConfig> = {}
): ChannelConfig {
    return {
        id: `channel-${Date.now()}`,
        number: 1,
        name: 'Test Channel',
        description: 'A test channel for unit tests',
        icon: undefined,
        contentSource: { type: 'library', libraryKey: 'library-1' },
        playbackMode: 'sequential',
        shuffleSeed: 12345,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        anchorTime: Date.now() - (24 * 60 * 60 * 1000), // Yesterday
        ...overrides
    };
}

/**
 * Creates a mock ScheduledProgram object
 */
export function createMockProgram(
    overrides: Partial<ScheduledProgram> = {}
): ScheduledProgram {
    const now = Date.now();
    return {
        item: createMockMediaItem(),
        scheduledStartTime: now,
        scheduledEndTime: now + 7200000, // 2 hours
        elapsedMs: 0,
        remainingMs: 7200000,
        isCurrent: true,
        loopNumber: 0,
        ...overrides
    };
}

/**
 * Creates a mock StreamDescriptor object
 */
export function createMockStreamDescriptor(
    overrides: Partial<StreamDescriptor> = {}
): StreamDescriptor {
    return {
        url: 'https://192.168.1.100:32400/video/:/transcode/start.m3u8',
        protocol: 'hls',
        mimeType: 'application/x-mpegURL',
        startPositionMs: 0,
        mediaMetadata: {
            title: 'Test Movie',
            artist: undefined,
            album: undefined,
            thumb: '/library/metadata/12345/thumb',
            duration: 7200000
        },
        subtitleTracks: [],
        audioTracks: [createMockAudioTrack()],
        durationMs: 7200000,
        isLive: false,
        ...overrides
    };
}

/**
 * Creates a mock SubtitleTrack object
 */
export function createMockSubtitleTrack(
    overrides: Partial<SubtitleTrack> = {}
): SubtitleTrack {
    return {
        id: 'sub-1',
        streamIndex: 2,
        language: 'English',
        languageCode: 'en',
        title: 'English (SRT)',
        format: 'srt',
        url: '/library/streams/sub-1',
        forced: false,
        default: true,
        ...overrides
    };
}

/**
 * Creates a mock AudioTrack object
 */
export function createMockAudioTrack(
    overrides: Partial<AudioTrack> = {}
): AudioTrack {
    return {
        id: 'audio-1',
        streamIndex: 1,
        language: 'English',
        languageCode: 'en',
        title: 'Stereo',
        codec: 'aac',
        channels: 2,
        default: true,
        ...overrides
    };
}

// ============================================
// API RESPONSE FACTORIES
// ============================================

/**
 * Creates a mock Plex library sections API response
 */
export function createMockLibrarySectionsResponse(
    libraries: PlexLibrary[] = [createMockLibrary()]
): MockApiResponse {
    return {
        MediaContainer: {
            size: libraries.length,
            Directory: libraries.map(lib => ({
                key: lib.key,
                title: lib.title,
                type: lib.type,
                scanner: lib.scanner,
                agent: lib.agent,
                uuid: lib.uuid
            }))
        }
    };
}

/**
 * Creates a mock Plex library items API response
 */
export function createMockLibraryItemsResponse(
    items: PlexMediaItem[] = [createMockMediaItem()]
): MockApiResponse {
    return {
        MediaContainer: {
            size: items.length,
            totalSize: items.length,
            Metadata: items.map(item => ({
                ratingKey: item.ratingKey,
                key: item.key,
                type: item.type,
                title: item.title,
                year: item.year,
                duration: item.durationMs,
                thumb: item.thumb,
                summary: item.summary,
                Media: item.media?.map(m => ({
                    id: m.id,
                    container: m.container,
                    videoCodec: m.videoCodec,
                    audioCodec: m.audioCodec
                }))
            }))
        }
    };
}

/**
 * Creates mock paginated responses
 */
export function createMockPaginatedResponses(
    itemCounts: number[],
    itemFactory: () => PlexMediaItem = createMockMediaItem
): MockApiResponse[] {
    let offset = 0;
    return itemCounts.map(count => {
        const items = Array.from({ length: count }, (_, i) =>
            itemFactory({
                ratingKey: `item-${offset + i}`,
                title: `Item ${offset + i}`
            } as any)
        );
        offset += count;
        return createMockLibraryItemsResponse(items);
    });
}

// ============================================
// MODULE MOCK FACTORIES
// ============================================

/**
 * Creates a mock IPlexAuth implementation
 */
export function createMockPlexAuth(
    overrides: Partial<IPlexAuth> = {}
): jest.Mocked<IPlexAuth> {
    return {
        initiatePlexAuth: jest.fn().mockResolvedValue({
            pinId: 'pin-123',
            clientIdentifier: 'client-123',
            url: 'https://plex.tv/link?code=ABC123'
        }),
        claimPin: jest.fn().mockResolvedValue(createMockAuthData()),
        validateToken: jest.fn().mockResolvedValue(true),
        storeCredentials: jest.fn().mockResolvedValue(undefined),
        getAuthHeaders: jest.fn().mockReturnValue({
            'X-Plex-Token': 'mock-token',
            'X-Plex-Client-Identifier': 'retune'
        }),
        getCurrentUser: jest.fn().mockReturnValue(createMockAuthData()),
        logout: jest.fn().mockResolvedValue(undefined),
        isAuthenticated: jest.fn().mockReturnValue(true),
        on: jest.fn(),
        off: jest.fn(),
        ...overrides
    } as jest.Mocked<IPlexAuth>;
}

/**
 * Creates a mock IPlexServerDiscovery implementation
 */
export function createMockServerDiscovery(
    overrides: Partial<IPlexServerDiscovery> = {}
): jest.Mocked<IPlexServerDiscovery> {
    const mockServer = createMockServer();
    return {
        discoverServers: jest.fn().mockResolvedValue([mockServer]),
        refreshServers: jest.fn().mockResolvedValue([mockServer]),
        testConnection: jest.fn().mockResolvedValue(25),
        findFastestConnection: jest.fn().mockResolvedValue(createMockConnection()),
        selectServer: jest.fn().mockResolvedValue(true),
        getSelectedServer: jest.fn().mockReturnValue(mockServer),
        getSelectedConnection: jest.fn().mockReturnValue(createMockConnection()),
        getServerUri: jest.fn().mockReturnValue('https://192.168.1.100:32400'),
        getServers: jest.fn().mockReturnValue([mockServer]),
        isConnected: jest.fn().mockReturnValue(true),
        on: jest.fn(),
        off: jest.fn(),
        ...overrides
    } as jest.Mocked<IPlexServerDiscovery>;
}

/**
 * Creates a mock IPlexLibrary implementation
 */
export function createMockPlexLibrary(
    overrides: Partial<IPlexLibrary> = {}
): jest.Mocked<IPlexLibrary> {
    return {
        getLibraries: jest.fn().mockResolvedValue([createMockLibrary()]),
        getLibrary: jest.fn().mockResolvedValue(createMockLibrary()),
        getLibraryItems: jest.fn().mockResolvedValue([createMockMediaItem()]),
        getItem: jest.fn().mockResolvedValue(createMockMediaItem()),
        getShows: jest.fn().mockResolvedValue([]),
        getShowSeasons: jest.fn().mockResolvedValue([]),
        getSeasonEpisodes: jest.fn().mockResolvedValue([]),
        getShowEpisodes: jest.fn().mockResolvedValue([createMockEpisode()]),
        getCollections: jest.fn().mockResolvedValue([]),
        getCollectionItems: jest.fn().mockResolvedValue([]),
        getPlaylists: jest.fn().mockResolvedValue([]),
        getPlaylistItems: jest.fn().mockResolvedValue([]),
        search: jest.fn().mockResolvedValue([]),
        getImageUrl: jest.fn().mockImplementation((path) =>
            `https://192.168.1.100:32400${path}?X-Plex-Token=mock-token`
        ),
        refreshLibrary: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        off: jest.fn(),
        ...overrides
    } as jest.Mocked<IPlexLibrary>;
}

/**
 * Creates a mock IChannelScheduler implementation
 */
export function createMockScheduler(
    overrides: Partial<IChannelScheduler> = {}
): jest.Mocked<IChannelScheduler> {
    return {
        loadChannel: jest.fn(),
        unloadChannel: jest.fn(),
        getProgramAtTime: jest.fn().mockReturnValue(createMockProgram()),
        getCurrentProgram: jest.fn().mockReturnValue(createMockProgram()),
        getNextProgram: jest.fn().mockReturnValue(createMockProgram()),
        getPreviousProgram: jest.fn().mockReturnValue(createMockProgram()),
        getScheduleWindow: jest.fn().mockReturnValue({
            channelId: 'channel-1',
            startTime: Date.now(),
            endTime: Date.now() + 86400000,
            programs: [createMockProgram()]
        }),
        getUpcoming: jest.fn().mockReturnValue([createMockProgram()]),
        syncToCurrentTime: jest.fn(),
        skipToNext: jest.fn(),
        skipToPrevious: jest.fn(),
        getState: jest.fn().mockReturnValue({
            isLoadingComplete: true,
            channelId: 'channel-1',
            currentProgram: createMockProgram()
        }),
        on: jest.fn(),
        off: jest.fn(),
        ...overrides
    } as jest.Mocked<IChannelScheduler>;
}

// ============================================
// BROWSER MOCK FACTORIES
// ============================================

/**
 * Creates a mock HTMLVideoElement
 */
export function createMockVideoElement(): Partial<HTMLVideoElement> {
    let currentTime = 0;
    let duration = 7200;
    let paused = true;
    let volume = 1.0;
    let muted = false;

    return {
        get currentTime() { return currentTime; },
        set currentTime(v: number) { currentTime = v; },
        get duration() { return duration; },
        get paused() { return paused; },
        get volume() { return volume; },
        set volume(v: number) { volume = Math.max(0, Math.min(1, v)); },
        get muted() { return muted; },
        set muted(v: boolean) { muted = v; },

        play: jest.fn().mockImplementation(() => {
            paused = false;
            return Promise.resolve();
        }),
        pause: jest.fn().mockImplementation(() => {
            paused = true;
        }),
        load: jest.fn().mockResolvedValue(undefined),

        // Track management
        textTracks: createMockTextTrackList(),
        audioTracks: createMockAudioTrackList(),

        // Events
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn().mockReturnValue(true),

        // Style
        style: {} as CSSStyleDeclaration,
    };
}

function createMockTextTrackList(): TextTrackList {
    const tracks: TextTrack[] = [];
    return {
        length: 0,
        [Symbol.iterator]: function* () { yield* tracks; },
        getTrackById: (id: string) => tracks.find(t => t.id === id) ?? null,
        item: (index: number) => tracks[index],
        onaddtrack: null,
        onchange: null,
        onremovetrack: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn().mockReturnValue(true),
    } as unknown as TextTrackList;
}

function createMockAudioTrackList(): AudioTrackList {
    return {
        length: 1,
        [0]: { id: 'audio-1', enabled: true, language: 'en' },
        getTrackById: jest.fn().mockReturnValue({ id: 'audio-1', enabled: true }),
        item: jest.fn().mockReturnValue({ id: 'audio-1', enabled: true }),
        onaddtrack: null,
        onchange: null,
        onremovetrack: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn().mockReturnValue(true),
    } as unknown as AudioTrackList;
}

/**
 * Creates a mock localStorage
 */
export function createMockLocalStorage(): Storage {
    const store = new Map<string, string>();

    return {
        get length() { return store.size; },
        clear: () => store.clear(),
        getItem: (key: string) => store.get(key) ?? null,
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        removeItem: (key: string) => store.delete(key),
        setItem: (key: string, value: string) => {
            // Simulate 5MB quota
            const totalSize = Array.from(store.values()).join('').length + value.length;
            if (totalSize > 5 * 1024 * 1024) {
                const error = new Error('QuotaExceededError');
                error.name = 'QuotaExceededError';
                throw error;
            }
            store.set(key, value);
        },
    };
}

/**
 * Creates a mock fetch function
 */
export function createMockFetch(
    responses: Map<string, MockApiResponse | Error> = new Map()
): jest.Mock {
    return jest.fn().mockImplementation(async (url: string) => {
        // Find matching response
        for (const [pattern, response] of responses) {
            if (url.includes(pattern)) {
                if (response instanceof Error) {
                    throw response;
                }
                return {
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve(response),
                    headers: new Headers(),
                };
            }
        }
        // Default 404
        return {
            ok: false,
            status: 404,
            json: () => Promise.resolve({ error: 'Not Found' }),
            headers: new Headers(),
        };
    });
}

// ============================================
// TYPES
// ============================================

interface MockApiResponse {
    MediaContainer?: {
        size?: number;
        totalSize?: number;
        Directory?: any[];
        Metadata?: any[];
        [key: string]: any;
    };
    [key: string]: any;
}
