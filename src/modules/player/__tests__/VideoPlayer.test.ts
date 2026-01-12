/**
 * @fileoverview Unit tests for VideoPlayer.
 * @module modules/player/__tests__/VideoPlayer.test
 * @jest-environment jsdom
 */

import { VideoPlayer, mapMediaErrorCodeToPlaybackError } from '../VideoPlayer';
import { PlayerErrorCode } from '../types';
import type { VideoPlayerConfig, StreamDescriptor } from '../types';

// ============================================
// Test Helpers
// ============================================

function createMockConfig(overrides: Partial<VideoPlayerConfig> = {}): VideoPlayerConfig {
    return {
        containerId: 'video-container',
        defaultVolume: 1.0,
        bufferAheadMs: 30000,
        seekIncrementSec: 10,
        hideControlsAfterMs: 5000,
        retryAttempts: 3,
        retryDelayMs: 1000,
        ...overrides,
    };
}

function createMockDescriptor(
    overrides: Partial<StreamDescriptor> = {}
): StreamDescriptor {
    return {
        url: 'http://example.com/stream.m3u8',
        protocol: 'hls',
        mimeType: 'application/x-mpegURL',
        startPositionMs: 0,
        mediaMetadata: {
            title: 'Test Video',
            durationMs: 7200000,
        },
        subtitleTracks: [],
        audioTracks: [],
        durationMs: 7200000,
        isLive: false,
        ...overrides,
    };
}

// ============================================
// mapMediaErrorCodeToPlaybackError Tests
// ============================================

describe('mapMediaErrorCodeToPlaybackError', () => {
    it('maps MEDIA_ERR_NETWORK (2) to NETWORK_TIMEOUT and is recoverable until retries exhausted', () => {
        const e0 = mapMediaErrorCodeToPlaybackError(2, 0, 3);
        const e2 = mapMediaErrorCodeToPlaybackError(2, 2, 3);
        const e3 = mapMediaErrorCodeToPlaybackError(2, 3, 3);

        expect(e0.code).toBe(PlayerErrorCode.NETWORK_TIMEOUT);
        expect(e0.recoverable).toBe(true);
        expect(e0.retryAfterMs).toBe(1000); // 1s base delay

        expect(e2.code).toBe(PlayerErrorCode.NETWORK_TIMEOUT);
        expect(e2.recoverable).toBe(true);
        expect(e2.retryAfterMs).toBe(4000); // 1s * 2^2 = 4s

        expect(e3.code).toBe(PlayerErrorCode.NETWORK_TIMEOUT);
        expect(e3.recoverable).toBe(false);
        expect(e3.retryCount).toBe(3);
    });

    it('maps MEDIA_ERR_DECODE (3) to PLAYBACK_DECODE_ERROR and recoverable=false', () => {
        const e = mapMediaErrorCodeToPlaybackError(3, 0, 3);
        expect(e.code).toBe(PlayerErrorCode.PLAYBACK_DECODE_ERROR);
        expect(e.recoverable).toBe(false);
    });

    it('maps MEDIA_ERR_SRC_NOT_SUPPORTED (4) to PLAYBACK_FORMAT_UNSUPPORTED', () => {
        const e = mapMediaErrorCodeToPlaybackError(4, 0, 3);
        expect(e.code).toBe(PlayerErrorCode.PLAYBACK_FORMAT_UNSUPPORTED);
        expect(e.recoverable).toBe(false);
    });

    it('maps unknown codes to UNKNOWN', () => {
        const e = mapMediaErrorCodeToPlaybackError(999, 0, 3);
        expect(e.code).toBe(PlayerErrorCode.UNKNOWN);
        expect(e.recoverable).toBe(false);
    });
});

// ============================================
// VideoPlayer Tests
// ============================================

describe('VideoPlayer', () => {
    let container: HTMLDivElement;
    let originalCreateElement: typeof document.createElement;

    // Create mock video element using the ORIGINAL createElement
    function createMockVideoElement(): HTMLVideoElement {
        const video = originalCreateElement.call(document, 'video') as HTMLVideoElement;

        // Mock methods
        video.play = jest.fn().mockResolvedValue(undefined);
        video.pause = jest.fn();
        video.load = jest.fn();

        // Mock properties
        Object.defineProperty(video, 'readyState', {
            get: (): number => 4, // HAVE_ENOUGH_DATA
            configurable: true,
        });

        Object.defineProperty(video, 'duration', {
            get: (): number => 7200,
            configurable: true,
        });

        Object.defineProperty(video, 'currentTime', {
            get: (): number => 0,
            set: jest.fn(),
            configurable: true,
        });

        Object.defineProperty(video, 'buffered', {
            get: (): TimeRanges =>
                ({
                    length: 1,
                    start: (_index: number): number => 0,
                    end: (_index: number): number => 60,
                }) as TimeRanges,
            configurable: true,
        });

        return video;
    }

    beforeEach(() => {
        // Store original FIRST before any mocking
        originalCreateElement = document.createElement.bind(document);

        // Create container for video using original
        container = originalCreateElement.call(document, 'div') as HTMLDivElement;
        container.id = 'video-container';
        document.body.appendChild(container);

        // Mock document.createElement to return mock video
        jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
            if (tagName === 'video') {
                return createMockVideoElement();
            }
            return originalCreateElement.call(document, tagName);
        });

        // Mock setInterval/clearInterval
        jest.useFakeTimers();
    });

    afterEach(() => {
        // Cleanup
        if (container && container.parentNode) {
            container.remove();
        }
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    // ========================================
    // initialize
    // ========================================

    describe('initialize', () => {
        it('should create video element in container', async () => {
            const player = new VideoPlayer();
            const config = createMockConfig();

            await player.initialize(config);

            const videoElement = container.querySelector('video');
            expect(videoElement).not.toBeNull();
            expect(videoElement?.id).toBe('retune-video-player');

            player.destroy();
        });

        it('should set default volume', async () => {
            const player = new VideoPlayer();
            const config = createMockConfig({ defaultVolume: 0.8 });

            await player.initialize(config);

            const state = player.getState();
            expect(state.volume).toBe(0.8);

            player.destroy();
        });

        it('should throw if container not found', async () => {
            const player = new VideoPlayer();
            const config = createMockConfig({ containerId: 'nonexistent' });

            await expect(player.initialize(config)).rejects.toThrow('Video container not found');
        });
    });

    // ========================================
    // loadStream
    // ========================================

    describe('loadStream', () => {
        let player: VideoPlayer;

        beforeEach(async () => {
            player = new VideoPlayer();
            await player.initialize(createMockConfig());
        });

        afterEach(() => {
            player.destroy();
        });

        it('should set video.src for HLS streams', async () => {
            const descriptor = createMockDescriptor({
                protocol: 'hls',
                url: 'http://test.m3u8',
            });

            // Wait for canplay (mocked to resolve immediately due to readyState)
            await player.loadStream(descriptor);

            const videoElement = container.querySelector('video');
            expect(videoElement?.src).toContain('test.m3u8');
        });

        it('should set video.src for direct play', async () => {
            const descriptor = createMockDescriptor({
                protocol: 'direct',
                mimeType: 'video/mp4',
                url: 'http://test.mp4',
            });

            await player.loadStream(descriptor);

            const videoElement = container.querySelector('video');
            expect(videoElement?.src).toContain('test.mp4');
            expect(container.querySelector('source')).toBeNull();
        });

        it('should update status to loading', async () => {
            const descriptor = createMockDescriptor();
            const stateChangeHandler = jest.fn();

            player.on('stateChange', stateChangeHandler);

            // Start loading
            const loadPromise = player.loadStream(descriptor);

            // Check that loading status was emitted
            expect(stateChangeHandler).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'loading' })
            );

            await loadPromise;
        });

        it('should seek to startPositionMs', async () => {
            const videoElement = container.querySelector('video')!;
            let currentTimeSet = 0;

            Object.defineProperty(videoElement, 'currentTime', {
                get: (): number => currentTimeSet,
                set: (val: number) => {
                    currentTimeSet = val;
                },
                configurable: true,
            });

            const descriptor = createMockDescriptor({ startPositionMs: 60000 });
            await player.loadStream(descriptor);

            // Should have set currentTime to 60 seconds
            expect(currentTimeSet).toBe(60);
        });

        it('should load subtitle tracks', async () => {
            const descriptor = createMockDescriptor({
                subtitleTracks: [
                    {
                        id: 'en',
                        title: 'English',
                        languageCode: 'en',
                        language: 'English',
                        format: 'srt',
                        url: 'http://test.srt',
                    },
                ],
            });

            await player.loadStream(descriptor);

            // Verify subtitle tracks are available
            const subtitles = player.getAvailableSubtitles();
            expect(subtitles).toHaveLength(1);
            expect(subtitles[0]?.id).toBe('en');
        });
    });

    // ========================================
    // playback control
    // ========================================

    describe('playback control', () => {
        let player: VideoPlayer;

        beforeEach(async () => {
            player = new VideoPlayer();
            await player.initialize(createMockConfig());
            await player.loadStream(createMockDescriptor());
        });

        afterEach(() => {
            player.destroy();
        });

        it('should call video.play() on play()', async () => {
            const videoElement = container.querySelector('video');
            await player.play();

            expect(videoElement?.play).toHaveBeenCalled();
        });

        it('should call video.pause() on pause()', () => {
            const videoElement = container.querySelector('video');
            player.pause();

            expect(videoElement?.pause).toHaveBeenCalled();
        });

        it('should stop and unload on stop()', () => {
            player.stop();

            const state = player.getState();
            expect(state.status).toBe('idle');
        });
    });

    // ========================================
    // volume control
    // ========================================

    describe('volume control', () => {
        let player: VideoPlayer;

        beforeEach(async () => {
            player = new VideoPlayer();
            await player.initialize(createMockConfig());
        });

        afterEach(() => {
            player.destroy();
        });

        it('should clamp volume to [0, 1]', () => {
            player.setVolume(1.5);
            expect(player.getVolume()).toBe(1);

            player.setVolume(-0.5);
            expect(player.getVolume()).toBe(0);
        });

        it('should toggle mute state', () => {
            expect(player.getState().isMuted).toBe(false);

            player.toggleMute();
            expect(player.getState().isMuted).toBe(true);

            player.toggleMute();
            expect(player.getState().isMuted).toBe(false);
        });
    });

    // ========================================
    // seeking
    // ========================================

    describe('seeking', () => {
        let player: VideoPlayer;
        let videoElement: HTMLVideoElement;
        let currentTimeValue = 0;

        beforeEach(async () => {
            player = new VideoPlayer();
            await player.initialize(createMockConfig());
            await player.loadStream(createMockDescriptor());

            videoElement = container.querySelector('video')!;

            // Mock currentTime setter to track value
            Object.defineProperty(videoElement, 'currentTime', {
                get: () => currentTimeValue,
                set: (val: number) => {
                    currentTimeValue = val;
                    // Dispatch seeked event
                    setTimeout(() => {
                        videoElement.dispatchEvent(new Event('seeked'));
                    }, 0);
                },
                configurable: true,
            });
        });

        afterEach(() => {
            player.destroy();
            currentTimeValue = 0;
        });

        it('should seek to absolute position', async () => {
            const seekPromise = player.seekTo(120000);

            // Advance timers to trigger seeked event
            jest.advanceTimersByTime(10);
            await seekPromise;

            expect(currentTimeValue).toBe(120);
        });

        it('should clamp seek to valid range', async () => {
            const seekPromise = player.seekTo(-5000);

            jest.advanceTimersByTime(10);
            await seekPromise;

            expect(currentTimeValue).toBe(0);
        });

        it('should seek forward with positive delta', async () => {
            // Set current time to 60s
            currentTimeValue = 60;

            const seekPromise = player.seekRelative(10000);

            jest.advanceTimersByTime(10);
            await seekPromise;

            // 60s + 10s = 70s
            expect(currentTimeValue).toBe(70);
        });

        it('should seek backward with negative delta', async () => {
            // Set current time to 60s
            currentTimeValue = 60;

            const seekPromise = player.seekRelative(-10000);

            jest.advanceTimersByTime(10);
            await seekPromise;

            // 60s - 10s = 50s
            expect(currentTimeValue).toBe(50);
        });
    });

    // ========================================
    // keep-alive
    // ========================================

    describe('keep-alive', () => {
        let player: VideoPlayer;

        beforeEach(async () => {
            player = new VideoPlayer();
            await player.initialize(createMockConfig());
        });

        afterEach(() => {
            player.destroy();
        });

        it('should touch DOM every 30 seconds while playing', async () => {
            const dispatchSpy = jest.spyOn(document, 'dispatchEvent');

            await player.loadStream(createMockDescriptor());
            await player.play();

            // Simulate playing state
            const videoElement = container.querySelector('video');
            videoElement?.dispatchEvent(new Event('playing'));

            // Advance 30 seconds
            jest.advanceTimersByTime(30000);

            expect(dispatchSpy).toHaveBeenCalledWith(expect.any(Event));

            dispatchSpy.mockRestore();
        });

        it('should not touch DOM when paused', () => {
            const dispatchSpy = jest.spyOn(document, 'dispatchEvent');

            // Player is idle/paused
            expect(player.isPlaying()).toBe(false);

            // Advance 30 seconds
            jest.advanceTimersByTime(30000);

            // Should not have dispatched a click (may have other events)
            const clickEvents = dispatchSpy.mock.calls.filter(
                (call) => (call[0] as Event).type === 'click'
            );
            expect(clickEvents.length).toBe(0);

            dispatchSpy.mockRestore();
        });
    });

    // ========================================
    // error handling
    // ========================================

    describe('error handling', () => {
        let player: VideoPlayer;
        let videoElement: HTMLVideoElement;

        beforeEach(async () => {
            player = new VideoPlayer();
            await player.initialize(createMockConfig({ retryAttempts: 3, retryDelayMs: 1000 }));
            await player.loadStream(createMockDescriptor());
            videoElement = container.querySelector('video')!;
        });

        afterEach(() => {
            player.destroy();
        });

        it('should emit error on PLAYBACK_DECODE_ERROR (non-recoverable)', () => {
            const errorHandler = jest.fn();
            player.on('error', errorHandler);

            // Simulate decode error
            Object.defineProperty(videoElement, 'error', {
                get: () => ({ code: 3, message: 'Decode error' }),
                configurable: true,
            });
            videoElement.dispatchEvent(new Event('error'));

            expect(errorHandler).toHaveBeenCalledWith(
                expect.objectContaining({
                    code: PlayerErrorCode.PLAYBACK_DECODE_ERROR,
                    recoverable: false,
                })
            );
        });

        it('should retry on NETWORK_TIMEOUT with exponential backoff', () => {
            // Simulate network error
            Object.defineProperty(videoElement, 'error', {
                get: () => ({ code: 2, message: 'Network error' }),
                configurable: true,
            });

            // First error - should schedule retry
            videoElement.dispatchEvent(new Event('error'));

            // Error handler should NOT have been called yet (recoverable)
            const errorHandler = jest.fn();
            player.on('error', errorHandler);

            // Advance by first retry delay (1000ms)
            jest.advanceTimersByTime(1000);

            // Trigger another error
            videoElement.dispatchEvent(new Event('error'));

            // Advance by second retry delay (2000ms)
            jest.advanceTimersByTime(2000);

            // Trigger another error
            videoElement.dispatchEvent(new Event('error'));

            // Advance by third retry delay (4000ms)
            jest.advanceTimersByTime(4000);

            // Fourth error - should now be unrecoverable
            videoElement.dispatchEvent(new Event('error'));

            expect(errorHandler).toHaveBeenCalledWith(
                expect.objectContaining({
                    code: PlayerErrorCode.NETWORK_TIMEOUT,
                    recoverable: false,
                    retryCount: 3,
                })
            );
        });
    });

    // ========================================
    // events
    // ========================================

    describe('events', () => {
        let player: VideoPlayer;

        beforeEach(async () => {
            player = new VideoPlayer();
            await player.initialize(createMockConfig());
        });

        afterEach(() => {
            player.destroy();
        });

        it('should emit stateChange on status changes', async () => {
            const handler = jest.fn();
            player.on('stateChange', handler);

            await player.loadStream(createMockDescriptor());

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'loading' })
            );
        });

        it('should emit timeUpdate during playback', async () => {
            const handler = jest.fn();
            player.on('timeUpdate', handler);

            await player.loadStream(createMockDescriptor());

            const videoElement = container.querySelector('video')!;
            videoElement.dispatchEvent(new Event('timeupdate'));

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    currentTimeMs: expect.any(Number),
                    durationMs: expect.any(Number),
                })
            );
        });

        it('should emit ended when playback ends', async () => {
            const handler = jest.fn();
            player.on('ended', handler);

            await player.loadStream(createMockDescriptor());

            const videoElement = container.querySelector('video')!;
            videoElement.dispatchEvent(new Event('ended'));

            expect(handler).toHaveBeenCalled();
        });

        it('destroy() should clear simulation timers', () => {
            const playerAny = player as unknown as {
                _simulationTimer: ReturnType<typeof setInterval> | null;
                _statusUpdateInterval: ReturnType<typeof setInterval> | null;
            };
            playerAny._simulationTimer = setInterval(() => undefined, 1000);
            playerAny._statusUpdateInterval = setInterval(() => undefined, 1000);

            player.destroy();

            expect(playerAny._simulationTimer).toBeNull();
            expect(playerAny._statusUpdateInterval).toBeNull();
        });
    });

    // ========================================
    // Media Session
    // ========================================

    describe('Media Session', () => {
        let player: VideoPlayer;
        let originalMediaSession: PropertyDescriptor | undefined;
        let originalMediaMetadata: unknown;

        beforeEach(async () => {
            // Store original navigator.mediaSession descriptor
            originalMediaSession = Object.getOwnPropertyDescriptor(navigator, 'mediaSession');
            // Store original MediaMetadata
            originalMediaMetadata = (globalThis as { MediaMetadata?: unknown }).MediaMetadata;

            player = new VideoPlayer();
            await player.initialize(createMockConfig());
        });

        afterEach(() => {
            player.destroy();

            // Restore navigator.mediaSession
            if (originalMediaSession) {
                Object.defineProperty(navigator, 'mediaSession', originalMediaSession);
            } else {
                // If it didn't exist originally, try to delete it
                try {
                    delete (navigator as { mediaSession?: unknown }).mediaSession;
                } catch {
                    // Some environments don't allow deletion
                }
            }

            // Restore MediaMetadata
            if (originalMediaMetadata !== undefined) {
                Object.defineProperty(globalThis, 'MediaMetadata', {
                    value: originalMediaMetadata,
                    configurable: true,
                    writable: true,
                });
            } else {
                try {
                    delete (globalThis as { MediaMetadata?: unknown }).MediaMetadata;
                } catch {
                    // Ignore
                }
            }
        });

        it('should not throw when Media Session is absent', () => {
            // Ensure mediaSession is absent
            try {
                delete (navigator as { mediaSession?: unknown }).mediaSession;
            } catch {
                // If can't delete, define as undefined
                Object.defineProperty(navigator, 'mediaSession', {
                    value: undefined,
                    configurable: true,
                    writable: true,
                });
            }

            // Should not throw
            expect(() => player.requestMediaSession()).not.toThrow();
            expect(() => player.releaseMediaSession()).not.toThrow();
        });

        describe('when Media Session is present', () => {
            interface MockMediaSession {
                metadata: unknown;
                playbackState: string;
                setActionHandler: jest.Mock;
                setPositionState: jest.Mock;
                handlers: Map<string, ((details: unknown) => void) | null>;
            }

            interface MockMediaMetadataInit {
                title?: string;
                artist?: string;
                album?: string;
                artwork?: Array<{ src: string; sizes: string; type: string }>;
            }

            class MockMediaMetadata {
                public title: string;
                public artist: string;
                public album: string;
                public artwork: Array<{ src: string; sizes: string; type: string }>;

                constructor(init: MockMediaMetadataInit) {
                    this.title = init.title || '';
                    this.artist = init.artist || '';
                    this.album = init.album || '';
                    this.artwork = init.artwork || [];
                }
            }

            let mockMediaSession: MockMediaSession;

            beforeEach(() => {
                // Create mock media session
                mockMediaSession = {
                    metadata: null,
                    playbackState: 'none',
                    handlers: new Map(),
                    setActionHandler: jest.fn((action: string, handler: ((details: unknown) => void) | null) => {
                        mockMediaSession.handlers.set(action, handler);
                    }),
                    setPositionState: jest.fn(),
                };

                // Install mock on navigator
                Object.defineProperty(navigator, 'mediaSession', {
                    value: mockMediaSession,
                    configurable: true,
                    writable: true,
                });

                // Install mock MediaMetadata constructor
                Object.defineProperty(globalThis, 'MediaMetadata', {
                    value: MockMediaMetadata,
                    configurable: true,
                    writable: true,
                });
            });

            it('should install all 6 action handlers and set metadata', async () => {
                const descriptor = createMockDescriptor({
                    mediaMetadata: {
                        title: 'Test Title',
                        subtitle: 'Test Artist',
                        durationMs: 120000,
                        thumb: 'http://example.com/thumb.jpg',
                        year: 2024,
                    },
                });
                await player.loadStream(descriptor);

                player.requestMediaSession();

                // Verify all 6 action handlers were installed
                const expectedActions = ['play', 'pause', 'stop', 'seekto', 'seekbackward', 'seekforward'];
                for (const action of expectedActions) {
                    expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith(action, expect.any(Function));
                    expect(mockMediaSession.handlers.get(action)).not.toBeNull();
                }

                // Verify metadata was set
                expect(mockMediaSession.metadata).not.toBeNull();
                const metadata = mockMediaSession.metadata as MockMediaMetadata;
                expect(metadata.title).toBe('Test Title');
                expect(metadata.artist).toBe('Test Artist');
                expect(metadata.album).toBe('2024');
                expect(metadata.artwork).toHaveLength(1);
                expect(metadata.artwork[0]).toEqual({
                    src: 'http://example.com/thumb.jpg',
                    sizes: '512x512',
                    type: 'image/jpeg',
                });
            });

            it('should invoke player methods when handlers are called', async () => {
                await player.loadStream(createMockDescriptor());
                player.requestMediaSession();

                const videoElement = container.querySelector('video')!;
                let currentTimeValue = 30;

                // Track currentTime changes
                Object.defineProperty(videoElement, 'currentTime', {
                    get: () => currentTimeValue,
                    set: (val: number) => {
                        currentTimeValue = val;
                        // Dispatch seeked event
                        setTimeout(() => {
                            videoElement.dispatchEvent(new Event('seeked'));
                        }, 0);
                    },
                    configurable: true,
                });

                // Test play handler
                const playHandler = mockMediaSession.handlers.get('play');
                if (playHandler) {
                    playHandler({});
                }
                expect(videoElement.play).toHaveBeenCalled();

                // Test pause handler
                const pauseHandler = mockMediaSession.handlers.get('pause');
                if (pauseHandler) {
                    pauseHandler({});
                }
                expect(videoElement.pause).toHaveBeenCalled();

                // Test stop handler
                const stopHandler = mockMediaSession.handlers.get('stop');
                if (stopHandler) {
                    stopHandler({});
                }
                // Stop calls pause internally via unloadStream
                expect(videoElement.pause).toHaveBeenCalled();

                // Test seekto handler
                const seektoHandler = mockMediaSession.handlers.get('seekto');
                if (seektoHandler) {
                    seektoHandler({ seekTime: 12 });
                }
                jest.advanceTimersByTime(10);
                // currentTime should be set (12 seconds = 12000ms / 1000)
                expect(currentTimeValue).toBe(12);

                // Test seekforward handler
                currentTimeValue = 50;
                const seekforwardHandler = mockMediaSession.handlers.get('seekforward');
                if (seekforwardHandler) {
                    seekforwardHandler({ seekOffset: 5 });
                }
                jest.advanceTimersByTime(10);
                expect(currentTimeValue).toBe(55); // 50 + 5

                // Test seekbackward handler
                currentTimeValue = 50;
                const seekbackwardHandler = mockMediaSession.handlers.get('seekbackward');
                if (seekbackwardHandler) {
                    seekbackwardHandler({ seekOffset: 5 });
                }
                jest.advanceTimersByTime(10);
                expect(currentTimeValue).toBe(45); // 50 - 5
            });

            it('should clear handlers and metadata on releaseMediaSession', async () => {
                await player.loadStream(createMockDescriptor({
                    mediaMetadata: { title: 'Test', durationMs: 1000 },
                }));
                player.requestMediaSession();

                // Verify handlers are set
                expect(mockMediaSession.handlers.size).toBeGreaterThan(0);
                expect(mockMediaSession.metadata).not.toBeNull();

                // Clear mock to track release calls specifically
                mockMediaSession.setActionHandler.mockClear();

                player.releaseMediaSession();

                // Verify all handlers were cleared (set to null)
                const expectedActions = ['play', 'pause', 'stop', 'seekto', 'seekbackward', 'seekforward'];
                for (const action of expectedActions) {
                    expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith(action, null);
                }

                // Verify metadata and playback state were cleared
                expect(mockMediaSession.metadata).toBeNull();
                expect(mockMediaSession.playbackState).toBe('none');
            });

            it('should be idempotent - multiple request/release calls are safe', async () => {
                await player.loadStream(createMockDescriptor());

                // Multiple requests should not add duplicate handlers
                player.requestMediaSession();
                const firstCallCount = mockMediaSession.setActionHandler.mock.calls.length;

                player.requestMediaSession();
                expect(mockMediaSession.setActionHandler.mock.calls.length).toBe(firstCallCount);

                // Multiple releases should be safe
                player.releaseMediaSession();
                mockMediaSession.setActionHandler.mockClear();

                player.releaseMediaSession();
                expect(mockMediaSession.setActionHandler).not.toHaveBeenCalled();
            });

            it('should not throw when setActionHandler throws for some actions', async () => {
                // Make setActionHandler throw for 'seekto' action
                mockMediaSession.setActionHandler.mockImplementation((action: string, handler: unknown) => {
                    if (action === 'seekto') {
                        throw new Error('seekto not supported');
                    }
                    mockMediaSession.handlers.set(action, handler as ((details: unknown) => void) | null);
                });

                await player.loadStream(createMockDescriptor());

                // Should not throw
                expect(() => player.requestMediaSession()).not.toThrow();

                // Other handlers should still be installed
                expect(mockMediaSession.handlers.get('play')).not.toBeNull();
                expect(mockMediaSession.handlers.get('pause')).not.toBeNull();
                expect(mockMediaSession.handlers.get('stop')).not.toBeNull();
                expect(mockMediaSession.handlers.get('seekbackward')).not.toBeNull();
                expect(mockMediaSession.handlers.get('seekforward')).not.toBeNull();

                // seekto should NOT be in handlers (since it threw)
                expect(mockMediaSession.handlers.has('seekto')).toBe(false);
            });
        });
    });
});
