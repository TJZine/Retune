/**
 * @fileoverview Unit tests for PlexStreamResolver.
 * @module modules/plex/stream/__tests__/PlexStreamResolver.test
 */

import { PlexStreamResolver } from '../PlexStreamResolver';
import { PROGRESS_TIMEOUT_MS } from '../constants';
import type { PlexStreamResolverConfig } from '../interfaces';
import type { PlexMediaItem, PlexMediaFile, PlexStream } from '../types';

// ============================================
// Test Helpers
// ============================================

function createMockConfig(
    overrides: Partial<PlexStreamResolverConfig> = {}
): PlexStreamResolverConfig {
    return {
        getAuthHeaders: () => ({
            'X-Plex-Token': 'mock-token',
            Accept: 'application/json',
        }),
        getServerUri: () => 'http://192.168.1.100:32400',
        getHttpsConnection: () => null,
        getRelayConnection: () => null,
        getItem: jest.fn().mockResolvedValue(null),
        clientIdentifier: 'test-client-id',
        ...overrides,
    };
}

function createMockMediaItem(
    overrides: Partial<{
        container: string;
        videoCodec: string;
        audioCodec: string;
        width: number;
        height: number;
        bitrate: number;
        durationMs: number;
    }> = {}
): PlexMediaItem {
    const defaults = {
        container: 'mp4',
        videoCodec: 'h264',
        audioCodec: 'aac',
        width: 1920,
        height: 1080,
        bitrate: 8000,
        durationMs: 7200000,
    };
    const merged = { ...defaults, ...overrides };

    const videoStream: PlexStream = {
        id: 'video-1',
        streamType: 1,
        codec: merged.videoCodec,
        width: merged.width,
        height: merged.height,
    };

    const audioStream: PlexStream = {
        id: 'audio-1',
        streamType: 2,
        codec: merged.audioCodec,
        language: 'English',
        languageCode: 'en',
        channels: 2,
        default: true,
    };

    const media: PlexMediaFile = {
        id: 'media-1',
        duration: merged.durationMs,
        bitrate: merged.bitrate,
        width: merged.width,
        height: merged.height,
        aspectRatio: 1.78,
        videoCodec: merged.videoCodec,
        audioCodec: merged.audioCodec,
        audioChannels: 2,
        container: merged.container,
        videoResolution: '1080',
        parts: [
            {
                id: 'part-1',
                key: '/library/parts/12345/file.mp4',
                duration: merged.durationMs,
                file: '/path/to/file.mp4',
                size: 1000000000,
                container: merged.container,
                streams: [videoStream, audioStream],
            },
        ],
    };

    return {
        ratingKey: '12345',
        key: '/library/metadata/12345',
        type: 'movie',
        title: 'Test Movie',
        sortTitle: 'Test Movie',
        summary: 'A test movie',
        year: 2024,
        durationMs: merged.durationMs,
        addedAt: new Date(),
        updatedAt: new Date(),
        thumb: '/library/metadata/12345/thumb',
        art: null,
        media: [media],
    };
}

// ============================================
// Tests
// ============================================

describe('PlexStreamResolver', () => {
    let mockFetch: jest.Mock;

    beforeEach(() => {
        mockFetch = jest.fn().mockResolvedValue({ ok: true });
        global.fetch = mockFetch;
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    // ========================================
    // canDirectPlay
    // ========================================

    describe('canDirectPlay', () => {
        it('should return true for MP4 with H264/AAC', () => {
            const item = createMockMediaItem({
                container: 'mp4',
                videoCodec: 'h264',
                audioCodec: 'aac',
            });
            const config = createMockConfig();
            const resolver = new PlexStreamResolver(config);

            expect(resolver.canDirectPlay(item)).toBe(true);
        });

        it('should return true for MKV with HEVC/AAC', () => {
            const item = createMockMediaItem({
                container: 'mkv',
                videoCodec: 'hevc',
                audioCodec: 'aac',
            });
            const config = createMockConfig();
            const resolver = new PlexStreamResolver(config);

            expect(resolver.canDirectPlay(item)).toBe(true);
        });

        it('should return true for MKV with H264/AC3', () => {
            const item = createMockMediaItem({
                container: 'mkv',
                videoCodec: 'h264',
                audioCodec: 'ac3',
            });
            const config = createMockConfig();
            const resolver = new PlexStreamResolver(config);

            expect(resolver.canDirectPlay(item)).toBe(true);
        });

        it('should return false for unsupported video codec (MPEG2)', () => {
            const item = createMockMediaItem({
                container: 'mp4',
                videoCodec: 'mpeg2',
                audioCodec: 'aac',
            });
            const config = createMockConfig();
            const resolver = new PlexStreamResolver(config);

            expect(resolver.canDirectPlay(item)).toBe(false);
        });

        it('should return false for unsupported container (AVI)', () => {
            const item = createMockMediaItem({
                container: 'avi',
                videoCodec: 'h264',
                audioCodec: 'aac',
            });
            const config = createMockConfig();
            const resolver = new PlexStreamResolver(config);

            expect(resolver.canDirectPlay(item)).toBe(false);
        });

        it('should return false for unsupported audio codec (DTS)', () => {
            const item = createMockMediaItem({
                container: 'mkv',
                videoCodec: 'h264',
                audioCodec: 'dts',
            });
            const config = createMockConfig();
            const resolver = new PlexStreamResolver(config);

            expect(resolver.canDirectPlay(item)).toBe(false);
        });

        it('should return false for resolution above 4K', () => {
            const item = createMockMediaItem({
                container: 'mp4',
                videoCodec: 'h264',
                audioCodec: 'aac',
                width: 5120,
                height: 2880,
            });
            const config = createMockConfig();
            const resolver = new PlexStreamResolver(config);

            expect(resolver.canDirectPlay(item)).toBe(false);
        });

        it('should return false for empty media array', () => {
            const item = createMockMediaItem();
            item.media = [];
            const config = createMockConfig();
            const resolver = new PlexStreamResolver(config);

            expect(resolver.canDirectPlay(item)).toBe(false);
        });
    });

    // ========================================
    // resolveStream
    // ========================================

    describe('resolveStream', () => {
        it('should return direct play URL for compatible content', async () => {
            const mockItem = createMockMediaItem({
                container: 'mp4',
                videoCodec: 'h264',
                audioCodec: 'aac',
            });
            const config = createMockConfig({
                getItem: jest.fn().mockResolvedValue(mockItem),
            });
            const resolver = new PlexStreamResolver(config);

            const decision = await resolver.resolveStream({ itemKey: '12345' });

            expect(decision.isDirectPlay).toBe(true);
            expect(decision.isTranscoding).toBe(false);
            expect(decision.protocol).toBe('http');
            expect(decision.playbackUrl).toContain('/library/parts/');
            expect(decision.playbackUrl).toContain('X-Plex-Token=mock-token');
        });

        it('should return transcode URL for incompatible content', async () => {
            const mockItem = createMockMediaItem({
                container: 'avi',
                videoCodec: 'mpeg4',
                audioCodec: 'mp2',
            });
            const config = createMockConfig({
                getItem: jest.fn().mockResolvedValue(mockItem),
            });
            const resolver = new PlexStreamResolver(config);

            const decision = await resolver.resolveStream({ itemKey: '12345' });

            expect(decision.isDirectPlay).toBe(false);
            expect(decision.isTranscoding).toBe(true);
            expect(decision.protocol).toBe('hls');
            expect(decision.playbackUrl).toContain('/transcode/universal/start.m3u8');
        });

        it('should start a playback session', async () => {
            const mockItem = createMockMediaItem();
            const config = createMockConfig({
                getItem: jest.fn().mockResolvedValue(mockItem),
            });
            const resolver = new PlexStreamResolver(config);

            const decision = await resolver.resolveStream({ itemKey: '12345' });

            expect(decision.sessionId).toBeTruthy();
            expect(decision.sessionId).toMatch(/^[a-f0-9-]{36}$/);
        });

        it('should throw PLAYBACK_SOURCE_NOT_FOUND for missing item', async () => {
            const config = createMockConfig({
                getItem: jest.fn().mockResolvedValue(null),
            });
            const resolver = new PlexStreamResolver(config);

            await expect(resolver.resolveStream({ itemKey: '12345' })).rejects.toMatchObject({
                code: 'PLAYBACK_SOURCE_NOT_FOUND',
            });
        });

        it('should select audio/subtitle tracks when specified', async () => {
            const mockItem = createMockMediaItem();
            // Add subtitle stream
            const subtitleStream: PlexStream = {
                id: 'sub-1',
                streamType: 3,
                codec: 'srt',
                language: 'English',
                languageCode: 'en',
                format: 'srt',
                default: true,
            };
            mockItem.media[0]!.parts[0]!.streams.push(subtitleStream);

            const config = createMockConfig({
                getItem: jest.fn().mockResolvedValue(mockItem),
            });
            const resolver = new PlexStreamResolver(config);

            const decision = await resolver.resolveStream({
                itemKey: '12345',
                audioStreamId: 'audio-1',
                subtitleStreamId: 'sub-1',
            });

            expect(decision.selectedAudioStream).not.toBeNull();
            expect(decision.selectedAudioStream!.id).toBe('audio-1');
            expect(decision.selectedSubtitleStream).not.toBeNull();
            expect(decision.selectedSubtitleStream!.id).toBe('sub-1');
        });
    });

    // ========================================
    // getTranscodeUrl
    // ========================================

    describe('getTranscodeUrl', () => {
        it('should include all required parameters', () => {
            const config = createMockConfig();
            const resolver = new PlexStreamResolver(config);

            const url = resolver.getTranscodeUrl('12345', {});

            expect(url).toContain('protocol=hls');
            expect(url).toContain('offset=0');
            expect(url).toContain('session=');
            expect(url).toContain('X-Plex-Session-Identifier=');
            expect(url).toContain('X-Plex-Token=mock-token');
            expect(url).toContain('X-Plex-Client-Identifier=test-client-id');
            expect(url).toContain('X-Plex-Platform=webOS');
            expect(url).toContain('start.m3u8');
        });

        it('should respect bitrate limits', () => {
            const config = createMockConfig();
            const resolver = new PlexStreamResolver(config);

            const url = resolver.getTranscodeUrl('12345', { maxBitrate: 4000 });

            expect(url).toContain('maxVideoBitrate=4000');
        });

        it('should use default bitrate when not specified', () => {
            const config = createMockConfig();
            const resolver = new PlexStreamResolver(config);

            const url = resolver.getTranscodeUrl('12345', {});

            expect(url).toContain('maxVideoBitrate=20000');
        });

        it('should honor provided sessionId for transcoder binding', () => {
            const config = createMockConfig();
            const resolver = new PlexStreamResolver(config);

            const url = resolver.getTranscodeUrl('12345', { sessionId: 'test-session-id' });

            expect(url).toContain('session=test-session-id');
            expect(url).toContain('X-Plex-Session-Identifier=test-session-id');
        });

        it('should throw when no server URI is available', () => {
            const config = createMockConfig({
                getServerUri: () => null,
            });
            const resolver = new PlexStreamResolver(config);

            expect(() => resolver.getTranscodeUrl('12345', {})).toThrow();
        });
    });

    // ========================================
    // updateProgress
    // ========================================

    describe('updateProgress', () => {
        it('should POST to timeline endpoint with correct params', async () => {
            const config = createMockConfig();
            const resolver = new PlexStreamResolver(config);

            // Start a session first
            await resolver.startSession('12345');

            await resolver.updateProgress('session-1', '12345', 60000, 'playing');

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/:/timeline'),
                expect.objectContaining({
                    method: 'POST',
                })
            );

            const callUrl = mockFetch.mock.calls[0]![0] as string;
            expect(callUrl).toContain('time=60000');
            expect(callUrl).toContain('state=playing');
            expect(callUrl).toContain('ratingKey=12345');
        });

        // ========================================
        // STREAM-002: Progress Timeout Tests
        // ========================================

        it('should emit progressTimeout when request exceeds budget', async () => {
            jest.useFakeTimers();
            const config = createMockConfig();
            const resolver = new PlexStreamResolver(config);

            const timeoutHandler = jest.fn();
            resolver.on('progressTimeout', timeoutHandler);

            mockFetch.mockImplementation((_url: string, options: RequestInit) => {
                return new Promise((_resolve, reject) => {
                    if (options.signal) {
                        options.signal.addEventListener('abort', () => {
                            const abortError = new Error('The operation was aborted');
                            abortError.name = 'AbortError';
                            reject(abortError);
                        });
                    }
                });
            });

            // Start session and call updateProgress
            const sessionId = await resolver.startSession('12345');
            const progressPromise = resolver.updateProgress(sessionId, '12345', 60000, 'playing');
            await jest.advanceTimersByTimeAsync(PROGRESS_TIMEOUT_MS + 1);
            await progressPromise;

            expect(timeoutHandler).toHaveBeenCalledWith({
                sessionId,
                itemKey: '12345',
            });
            jest.useRealTimers();
        });

        it('should not emit progressTimeout when request succeeds within budget', async () => {
            const config = createMockConfig();
            const resolver = new PlexStreamResolver(config);

            // Mock fetch that resolves immediately
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({}),
            });

            const timeoutHandler = jest.fn();
            resolver.on('progressTimeout', timeoutHandler);

            const sessionId = await resolver.startSession('12345');
            await resolver.updateProgress(sessionId, '12345', 60000, 'playing');

            expect(timeoutHandler).not.toHaveBeenCalled();
        });

        it('should not emit progressTimeout on non-abort failures', async () => {
            const config = createMockConfig();
            const resolver = new PlexStreamResolver(config);
            const timeoutHandler = jest.fn();

            resolver.on('progressTimeout', timeoutHandler);
            mockFetch.mockRejectedValue(new Error('Network down'));

            const sessionId = await resolver.startSession('12345');
            await resolver.updateProgress(sessionId, '12345', 60000, 'playing');

            expect(timeoutHandler).not.toHaveBeenCalled();
        });
    });

    // ========================================
    // Session Management
    // ========================================

    describe('session management', () => {
        it('should emit sessionStart event when session starts', async () => {
            const config = createMockConfig();
            const resolver = new PlexStreamResolver(config);
            const handler = jest.fn();

            resolver.on('sessionStart', handler);
            const sessionId = await resolver.startSession('12345');

            expect(handler).toHaveBeenCalledWith({
                sessionId,
                itemKey: '12345',
            });
        });

        it('should emit sessionEnd event when session ends', async () => {
            const config = createMockConfig();
            const resolver = new PlexStreamResolver(config);
            const handler = jest.fn();

            resolver.on('sessionEnd', handler);
            const sessionId = await resolver.startSession('12345');
            await resolver.endSession(sessionId, '12345');

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    sessionId,
                    itemKey: '12345',
                })
            );
        });

        it('should stop transcode on session end', async () => {
            const mockItem = createMockMediaItem({
                container: 'avi', // Force transcoding
                videoCodec: 'mpeg4',
            });
            const config = createMockConfig({
                getItem: jest.fn().mockResolvedValue(mockItem),
            });
            const resolver = new PlexStreamResolver(config);

            const decision = await resolver.resolveStream({ itemKey: '12345' });
            await resolver.endSession(decision.sessionId, '12345');

            // Should have called DELETE /transcode/sessions/{sessionId}
            const stopCall = mockFetch.mock.calls.find((call) =>
                (call[0] as string).includes('transcode/sessions/')
            );
            expect(stopCall).toBeDefined();
            expect(stopCall![1]).toMatchObject({ method: 'DELETE' });
        });
    });

    // ========================================
    // Mixed Content Handling
    // ========================================

    describe('mixed content handling', () => {
        const originalWindow = global.window;

        beforeEach(() => {
            // Mock HTTPS app context
            global.window = {
                location: { protocol: 'https:' },
            } as Window & typeof globalThis;
        });

        afterEach(() => {
            global.window = originalWindow;
        });

        it('should use HTTPS connection when available', async () => {
            const mockItem = createMockMediaItem();
            const config = createMockConfig({
                getItem: jest.fn().mockResolvedValue(mockItem),
                getServerUri: () => 'http://192.168.1.100:32400', // HTTP server
                getHttpsConnection: () => ({ uri: 'https://secure.plex.direct:32400' }),
            });
            const resolver = new PlexStreamResolver(config);

            const decision = await resolver.resolveStream({ itemKey: '12345' });

            expect(decision.playbackUrl).toContain('https://secure.plex.direct');
        });

        it('should use relay connection as fallback', async () => {
            const mockItem = createMockMediaItem();
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
            const config = createMockConfig({
                getItem: jest.fn().mockResolvedValue(mockItem),
                getServerUri: () => 'http://192.168.1.100:32400',
                getHttpsConnection: () => null,
                getRelayConnection: () => ({ uri: 'https://relay.plex.direct:32400' }),
            });
            const resolver = new PlexStreamResolver(config);

            const decision = await resolver.resolveStream({ itemKey: '12345' });

            expect(decision.playbackUrl).toContain('https://relay.plex.direct');
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                'Using Plex relay due to mixed content restrictions'
            );
            consoleWarnSpy.mockRestore();
        });

        it('should throw MIXED_CONTENT_BLOCKED when no fallback available', async () => {
            const mockItem = createMockMediaItem();
            const config = createMockConfig({
                getItem: jest.fn().mockResolvedValue(mockItem),
                getServerUri: () => 'http://192.168.1.100:32400',
                getHttpsConnection: () => null,
                getRelayConnection: () => null,
            });
            const resolver = new PlexStreamResolver(config);

            await expect(resolver.resolveStream({ itemKey: '12345' })).rejects.toMatchObject({
                code: 'MIXED_CONTENT_BLOCKED',
                recoverable: false,
            });
        });
    });
});
