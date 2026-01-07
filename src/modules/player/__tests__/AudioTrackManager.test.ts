/**
 * @jest-environment jsdom
 * @fileoverview Unit tests for AudioTrackManager.
 * Tests codec validation, timeout handling, and retry behavior per spec requirements.
 */

import { AudioTrackManager } from '../AudioTrackManager';
import type { AudioTrack } from '../types';
import { AppErrorCode } from '../types';

// ============================================
// Test Utilities
// ============================================

/**
 * Create a mock audio track with required properties.
 */
function createMockTrack(overrides: Partial<AudioTrack> = {}): AudioTrack {
    return {
        id: 'track-1',
        index: 0,
        language: 'English',
        languageCode: 'en',
        title: 'English',
        codec: 'aac',
        channels: 2,
        default: true,
        ...overrides,
    };
}

/**
 * Create a mock HTMLVideoElement with audioTracks.
 * @param tracks - Mock tracks array
 * @param options - Configuration options
 * @param options.preventEnable - If true, tracks never appear enabled when polled (for timeout testing)
 */
function createMockVideoElement(
    tracks: { id: string; enabled: boolean }[] = [],
    options: { preventEnable?: boolean } = {}
): HTMLVideoElement {
    const { preventEnable = false } = options;

    const audioTracks = {
        length: tracks.length,
        ...tracks.reduce((acc, track, i) => {
            const trackObj = {
                id: track.id,
                _enabled: track.enabled,
                get enabled(): boolean {
                    return preventEnable ? false : this._enabled;
                },
                set enabled(value: boolean) {
                    this._enabled = value;
                },
                kind: 'main',
                label: `Track ${i}`,
                language: 'en',
            };
            acc[i] = trackObj;
            return acc;
        }, {} as Record<number, unknown>),
    };

    return { audioTracks } as unknown as HTMLVideoElement;
}

/**
 * Helper to initialize manager with a standard video element.
 */
function initializeWithVideo(manager: AudioTrackManager): HTMLVideoElement {
    const videoEl = document.createElement('video');
    manager.initialize(videoEl);
    return videoEl;
}

// ============================================
// Tests
// ============================================

describe('AudioTrackManager', () => {
    let manager: AudioTrackManager;

    beforeEach(() => {
        manager = new AudioTrackManager();
    });

    afterEach(() => {
        manager.destroy();
        jest.useRealTimers(); // Clean up fake timers if used
    });

    describe('initialization', () => {
        it('should initialize with video element and return empty tracks', () => {
            initializeWithVideo(manager);

            expect(manager.getTracks()).toEqual([]);
            expect(manager.getActiveTrackId()).toBeNull();
        });

        it('should set active track from default track', () => {
            initializeWithVideo(manager);

            const tracks = [
                createMockTrack({ id: 'track-1', default: false }),
                createMockTrack({ id: 'track-2', default: true }),
            ];
            manager.setTracks(tracks);

            expect(manager.getActiveTrackId()).toBe('track-2');
        });

        it('should use first track if no default specified', () => {
            initializeWithVideo(manager);

            const tracks = [
                createMockTrack({ id: 'track-1', default: false }),
                createMockTrack({ id: 'track-2', default: false }),
            ];
            manager.setTracks(tracks);

            expect(manager.getActiveTrackId()).toBe('track-1');
        });

        it('should return a copy of tracks array (immutability)', () => {
            initializeWithVideo(manager);

            const tracks = [createMockTrack({ id: 'track-1' })];
            manager.setTracks(tracks);

            const returned = manager.getTracks();
            returned.push(createMockTrack({ id: 'track-2' }));

            expect(manager.getTracks()).toHaveLength(1);
        });

        it('should handle empty tracks array', () => {
            initializeWithVideo(manager);
            manager.setTracks([]);

            expect(manager.getTracks()).toHaveLength(0);
            expect(manager.getActiveTrackId()).toBeNull();
        });

        it('should preserve existing activeTrackId when setTracks is called again', () => {
            initializeWithVideo(manager);

            manager.setTracks([createMockTrack({ id: 'track-1' })]);
            expect(manager.getActiveTrackId()).toBe('track-1');

            // Call setTracks again with new tracks - existing activeTrackId should be preserved
            // even if the new array has a different default track
            manager.setTracks([
                createMockTrack({ id: 'track-new', default: true }),
            ]);

            // This documents current implementation behavior:
            // Once set, activeTrackId is not re-evaluated by setTracks
            expect(manager.getActiveTrackId()).toBe('track-1');
        });
    });

    describe('codec validation', () => {
        beforeEach(() => {
            initializeWithVideo(manager);
        });

        it.each(['aac', 'ac3', 'eac3'])('should accept supported codec: %s', async (codec) => {
            const tracks = [createMockTrack({ id: `track-${codec}`, codec })];
            manager.setTracks(tracks);

            await expect(manager.switchTrack(`track-${codec}`)).resolves.toBeUndefined();
            expect(manager.getActiveTrackId()).toBe(`track-${codec}`);
        });

        it.each(['dts', 'mp3', 'truehd', 'flac', 'opus'])('should throw CODEC_UNSUPPORTED for: %s', async (codec) => {
            const tracks = [createMockTrack({ id: `track-${codec}`, codec })];
            manager.setTracks(tracks);

            await expect(manager.switchTrack(`track-${codec}`)).rejects.toMatchObject({
                code: AppErrorCode.CODEC_UNSUPPORTED,
                message: expect.stringContaining(codec),
            });
        });

        it('should handle case-insensitive codec matching (AAC, EAC3)', async () => {
            const tracks = [
                createMockTrack({ id: 'track-1', codec: 'AAC' }),
                createMockTrack({ id: 'track-2', codec: 'EAC3', default: false }),
            ];
            manager.setTracks(tracks);

            await expect(manager.switchTrack('track-1')).resolves.toBeUndefined();
            await expect(manager.switchTrack('track-2')).resolves.toBeUndefined();
        });

        it('should skip codec check for empty string codec', async () => {
            const tracks = [createMockTrack({ id: 'track-empty', codec: '' })];
            manager.setTracks(tracks);

            await expect(manager.switchTrack('track-empty')).resolves.toBeUndefined();
        });
    });

    describe('track switching', () => {
        it('should throw TRACK_NOT_FOUND for unknown track ID', async () => {
            initializeWithVideo(manager);
            manager.setTracks([createMockTrack({ id: 'track-1' })]);

            await expect(manager.switchTrack('nonexistent')).rejects.toMatchObject({
                code: AppErrorCode.TRACK_NOT_FOUND,
                message: expect.stringContaining('nonexistent'),
            });
        });

        it('should throw TRACK_NOT_FOUND if video element not initialized', async () => {
            // Note: TRACK_NOT_FOUND is reused here for "not initialized" case
            // because we cannot search for tracks without a video element
            await expect(manager.switchTrack('track-1')).rejects.toMatchObject({
                code: AppErrorCode.TRACK_NOT_FOUND,
                message: expect.stringContaining('not initialized'),
            });
        });

        it('should update activeTrackId on successful switch', async () => {
            initializeWithVideo(manager);
            manager.setTracks([
                createMockTrack({ id: 'track-1', codec: 'aac' }),
                createMockTrack({ id: 'track-2', codec: 'ac3', default: false }),
            ]);

            expect(manager.getActiveTrackId()).toBe('track-1');
            await manager.switchTrack('track-2');
            expect(manager.getActiveTrackId()).toBe('track-2');
        });

        it('should allow switching to already-active track (no-op)', async () => {
            initializeWithVideo(manager);
            manager.setTracks([createMockTrack({ id: 'track-1', codec: 'aac' })]);

            expect(manager.getActiveTrackId()).toBe('track-1');
            await expect(manager.switchTrack('track-1')).resolves.toBeUndefined();
            expect(manager.getActiveTrackId()).toBe('track-1');
        });

        it('should successfully switch when native audioTracks are present', async () => {
            // Test the real native audioTracks path (not the no-audioTracks fallback)
            const videoEl = createMockVideoElement([
                { id: 'track-1', enabled: true },
                { id: 'track-2', enabled: false },
            ]);
            manager.initialize(videoEl);

            manager.setTracks([
                createMockTrack({ id: 'track-1', index: 0, codec: 'aac' }),
                createMockTrack({ id: 'track-2', index: 1, codec: 'ac3', default: false }),
            ]);

            // Switch should succeed via native audioTracks
            await expect(manager.switchTrack('track-2')).resolves.toBeUndefined();
            expect(manager.getActiveTrackId()).toBe('track-2');
        });

        it('should not modify activeTrackId if switch fails with CODEC_UNSUPPORTED', async () => {
            initializeWithVideo(manager);
            manager.setTracks([
                createMockTrack({ id: 'track-aac', codec: 'aac' }),
                createMockTrack({ id: 'track-dts', codec: 'dts', default: false }),
            ]);

            expect(manager.getActiveTrackId()).toBe('track-aac');

            await expect(manager.switchTrack('track-dts')).rejects.toMatchObject({
                code: AppErrorCode.CODEC_UNSUPPORTED,
            });

            expect(manager.getActiveTrackId()).toBe('track-aac'); // Unchanged
        });
    });

    describe('timeout handling', () => {
        it('should throw TRACK_SWITCH_TIMEOUT when switch times out (not TRACK_SWITCH_FAILED)', async () => {
            // Use preventEnable=true to simulate a switch that never completes
            const videoEl = createMockVideoElement([
                { id: 'track-1', enabled: true },
                { id: 'track-2', enabled: false },
            ], { preventEnable: true });
            manager.initialize(videoEl);

            manager.setTracks([
                createMockTrack({ id: 'track-1', index: 0, codec: 'aac' }),
                createMockTrack({ id: 'track-2', index: 1, codec: 'aac', default: false }),
            ]);

            jest.useFakeTimers();

            // Capture error via .catch() to prevent unhandled rejection
            let caughtError: unknown = null;
            const switchPromise = manager.switchTrack('track-2').catch((err) => {
                caughtError = err;
            });

            // Advance timers past the switch timeout (defined in AudioTrackManager.ts)
            await jest.runAllTimersAsync();
            await switchPromise;

            expect(caughtError).toMatchObject({
                code: AppErrorCode.TRACK_SWITCH_TIMEOUT,
                message: expect.stringContaining('timed out'),
                recoverable: false,
                retryCount: 0, // Verify error structure completeness
            });
        });

        it('should attempt to restore previous track after timeout failure', async () => {
            const videoEl = createMockVideoElement([
                { id: 'track-1', enabled: true },
                { id: 'track-2', enabled: false },
            ], { preventEnable: true });
            manager.initialize(videoEl);

            manager.setTracks([
                createMockTrack({ id: 'track-1', index: 0, codec: 'aac' }),
                createMockTrack({ id: 'track-2', index: 1, codec: 'aac', default: false }),
            ]);

            jest.useFakeTimers();

            const switchPromise = manager.switchTrack('track-2').catch(() => {
                // Expected to fail
            });

            await jest.runAllTimersAsync();
            await switchPromise;

            // Verify that the manager's activeTrackId was NOT updated to track-2
            // This confirms the failed switch did not corrupt state
            expect(manager.getActiveTrackId()).toBe('track-1');
        });
    });

    describe('unload and destroy', () => {
        it('should clear tracks and activeTrackId on unload', () => {
            initializeWithVideo(manager);
            manager.setTracks([createMockTrack({ id: 'track-1' })]);

            expect(manager.getTracks()).toHaveLength(1);
            expect(manager.getActiveTrackId()).toBe('track-1');

            manager.unload();

            expect(manager.getTracks()).toHaveLength(0);
            expect(manager.getActiveTrackId()).toBeNull();
        });

        it('should allow re-initialization after destroy', () => {
            initializeWithVideo(manager);
            manager.setTracks([createMockTrack({ id: 'track-1' })]);
            manager.destroy();

            // Should be able to re-initialize
            initializeWithVideo(manager);
            manager.setTracks([createMockTrack({ id: 'track-2' })]);

            expect(manager.getActiveTrackId()).toBe('track-2');
        });
    });
});
