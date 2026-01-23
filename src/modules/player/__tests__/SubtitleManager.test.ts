/**
 * @fileoverview Unit tests for SubtitleManager.
 * @module modules/player/__tests__/SubtitleManager.test
 * @jest-environment jsdom
 */

import { SubtitleManager } from '../SubtitleManager';
import type { SubtitleTrack } from '../types';

// ============================================
// Test Helpers
// ============================================

function createMockVideoElement(): HTMLVideoElement {
    const video = document.createElement('video');

    // Create a minimal mock for textTracks
    const mockTextTracks = {
        length: 0,
        getTrackById: jest.fn().mockReturnValue(null),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        onchange: null,
        onaddtrack: null,
        onremovetrack: null,
        item: jest.fn().mockReturnValue(null),
    };

    Object.defineProperty(video, 'textTracks', {
        get: (): TextTrackList => mockTextTracks as unknown as TextTrackList,
        configurable: true,
    });

    return video;
}

function createMockSubtitleTrack(
    overrides: Partial<SubtitleTrack> = {}
): SubtitleTrack {
    return {
        id: 'sub-1',
        label: 'English (SRT)',
        languageCode: 'en',
        language: 'English',
        codec: 'srt',
        format: 'srt',
        key: '/library/streams/1',
        default: false,
        forced: false,
        isTextCandidate: true,
        fetchableViaKey: true,
        ...overrides,
    };
}

// ============================================
// SubtitleManager Tests
// ============================================

describe('SubtitleManager', () => {
    let manager: SubtitleManager;
    let videoElement: HTMLVideoElement;

    beforeEach(() => {
        manager = new SubtitleManager();
        videoElement = createMockVideoElement();
        manager.initialize(videoElement);
    });

    afterEach(() => {
        manager.destroy();
    });

    // ========================================
    // loadTracks
    // ========================================

    describe('loadTracks', () => {
        it('should create track elements for text-based formats', () => {
            const tracks: SubtitleTrack[] = [
                createMockSubtitleTrack({ id: 'en', format: 'srt' }),
                createMockSubtitleTrack({ id: 'es', format: 'vtt', languageCode: 'es' }),
            ];

            const burnInRequired = manager.loadTracks(tracks, {
                serverUri: 'http://example.com',
                authHeaders: { 'X-Plex-Token': 'token' },
            });

            // Should not require burn-in for SRT/VTT
            expect(burnInRequired).toHaveLength(0);

            // Should have loaded tracks
            expect(manager.getTracks()).toHaveLength(2);
        });

        it('should return burn-in required for PGS format', () => {
            const tracks: SubtitleTrack[] = [
                createMockSubtitleTrack({ id: 'pgs-en', format: 'pgs' }),
            ];

            const burnInRequired = manager.loadTracks(tracks, {
                serverUri: 'http://example.com',
                authHeaders: { 'X-Plex-Token': 'token' },
            });

            expect(burnInRequired).toContain('pgs-en');
        });

        it('should return burn-in required for ASS format', () => {
            const tracks: SubtitleTrack[] = [
                createMockSubtitleTrack({ id: 'ass-en', format: 'ass' }),
            ];

            const burnInRequired = manager.loadTracks(tracks, {
                serverUri: 'http://example.com',
                authHeaders: { 'X-Plex-Token': 'token' },
            });

            expect(burnInRequired).toContain('ass-en');
        });

        it('should unload existing tracks before loading new ones', () => {
            const tracks1: SubtitleTrack[] = [
                createMockSubtitleTrack({ id: 'en-1' }),
            ];
            const tracks2: SubtitleTrack[] = [
                createMockSubtitleTrack({ id: 'en-2' }),
            ];

            manager.loadTracks(tracks1, {
                serverUri: 'http://example.com',
                authHeaders: { 'X-Plex-Token': 'token' },
            });
            expect(manager.getTracks()).toHaveLength(1);
            expect(manager.getTracks()[0]?.id).toBe('en-1');

            manager.loadTracks(tracks2, {
                serverUri: 'http://example.com',
                authHeaders: { 'X-Plex-Token': 'token' },
            });
            expect(manager.getTracks()).toHaveLength(1);
            expect(manager.getTracks()[0]?.id).toBe('en-2');
        });
    });

    // ========================================
    // setActiveTrack
    // ========================================

    describe('setActiveTrack', () => {
        it('should update active track ID', () => {
            const tracks: SubtitleTrack[] = [
                createMockSubtitleTrack({ id: 'en' }),
            ];
            manager.loadTracks(tracks, {
                serverUri: 'http://example.com',
                authHeaders: { 'X-Plex-Token': 'token' },
            });

            manager.setActiveTrack('en');
            expect(manager.getActiveTrackId()).toBe('en');

            manager.setActiveTrack(null);
            expect(manager.getActiveTrackId()).toBeNull();
        });
    });

    // ========================================
    // unloadTracks
    // ========================================

    describe('unloadTracks', () => {
        it('should clear all tracks', () => {
            const tracks: SubtitleTrack[] = [
                createMockSubtitleTrack({ id: 'en' }),
                createMockSubtitleTrack({ id: 'es' }),
            ];
            manager.loadTracks(tracks, {
                serverUri: 'http://example.com',
                authHeaders: { 'X-Plex-Token': 'token' },
            });

            expect(manager.getTracks()).toHaveLength(2);

            manager.unloadTracks();

            expect(manager.getTracks()).toHaveLength(0);
            expect(manager.getActiveTrackId()).toBeNull();
        });
    });

    // ========================================
    // requiresBurnIn
    // ========================================

    describe('requiresBurnIn', () => {
        it('should return true for PGS', () => {
            expect(manager.requiresBurnIn('pgs')).toBe(true);
            expect(manager.requiresBurnIn('PGS')).toBe(true);
        });

        it('should return true for ASS', () => {
            expect(manager.requiresBurnIn('ass')).toBe(true);
            expect(manager.requiresBurnIn('ASS')).toBe(true);
        });

        it('should return true for SSA', () => {
            expect(manager.requiresBurnIn('ssa')).toBe(true);
        });

        it('should return true for VOBSUB', () => {
            expect(manager.requiresBurnIn('vobsub')).toBe(true);
        });

        it('should return false for SRT', () => {
            expect(manager.requiresBurnIn('srt')).toBe(false);
        });

        it('should return false for VTT', () => {
            expect(manager.requiresBurnIn('vtt')).toBe(false);
        });
    });

    // ========================================
    // destroy
    // ========================================

    describe('destroy', () => {
        it('should cleanup on destroy', () => {
            const tracks: SubtitleTrack[] = [
                createMockSubtitleTrack({ id: 'en' }),
            ];
            manager.loadTracks(tracks, {
                serverUri: 'http://example.com',
                authHeaders: { 'X-Plex-Token': 'token' },
            });
            manager.setActiveTrack('en');

            manager.destroy();

            expect(manager.getTracks()).toHaveLength(0);
            expect(manager.getActiveTrackId()).toBeNull();
        });
    });

    // ========================================
    // fallback + logging
    // ========================================

    describe('fallback behavior', () => {
        let originalFetch: typeof fetch | undefined;
        let originalCreateObjectUrl: typeof URL.createObjectURL | undefined;
        let originalRevokeObjectUrl: typeof URL.revokeObjectURL | undefined;

        beforeEach(() => {
            jest.useFakeTimers();
            originalFetch = global.fetch;
            originalCreateObjectUrl = global.URL.createObjectURL;
            originalRevokeObjectUrl = global.URL.revokeObjectURL;
            (global as { fetch?: unknown }).fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                text: async () => '1\n00:00:01,000 --> 00:00:02,000\nHello\n',
            });
            global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock');
            global.URL.revokeObjectURL = jest.fn();
        });

        afterEach(() => {
            jest.useRealTimers();
            jest.restoreAllMocks();
            localStorage.removeItem('retune_subtitle_debug_logging');
            if (originalFetch) {
                global.fetch = originalFetch;
            } else {
                delete (global as { fetch?: unknown }).fetch;
            }
            if (originalCreateObjectUrl) {
                global.URL.createObjectURL = originalCreateObjectUrl;
            } else {
                delete (global.URL as { createObjectURL?: unknown }).createObjectURL;
            }
            if (originalRevokeObjectUrl) {
                global.URL.revokeObjectURL = originalRevokeObjectUrl;
            } else {
                delete (global.URL as { revokeObjectURL?: unknown }).revokeObjectURL;
            }
        });

        it('triggers fallback when textTracks length is unchanged', async () => {
            const tracks: SubtitleTrack[] = [
                createMockSubtitleTrack({ id: 'en' }),
            ];

            manager.loadTracks(tracks, {
                serverUri: 'http://example.com',
                authHeaders: { 'X-Plex-Token': 'token' },
            });

            jest.advanceTimersByTime(2000);
            await Promise.resolve();

            expect(global.fetch).toHaveBeenCalled();
        });

        it('marks track ready when cues appear after timeout', () => {
            const tracks: SubtitleTrack[] = [
                createMockSubtitleTrack({ id: 'en', fetchableViaKey: false }),
            ];

            manager.loadTracks(tracks, {
                serverUri: 'http://example.com',
                authHeaders: { 'X-Plex-Token': 'token' },
            });

            const trackElement = (manager as unknown as { _trackElements: Map<string, HTMLTrackElement> })
                ._trackElements.get('en');
            expect(trackElement).toBeTruthy();
            if (!trackElement) {
                throw new Error('Expected track element to exist');
            }

            Object.defineProperty(trackElement, 'track', {
                value: { cues: [{}], mode: 'hidden' },
                configurable: true,
            });

            jest.advanceTimersByTime(3000);

            const readyTracks = (manager as unknown as { _readyTracks: Set<string> })._readyTracks;
            expect(readyTracks.has('en')).toBe(true);
        });

        it('redacts tokenized URLs in debug logs', () => {
            localStorage.setItem('retune_subtitle_debug_logging', '1');
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

            const tracks: SubtitleTrack[] = [
                createMockSubtitleTrack({ id: 'en' }),
            ];

            manager.loadTracks(tracks, {
                serverUri: 'http://example.com',
                authHeaders: { 'X-Plex-Token': 'secret-token' },
            });

            const logs = warnSpy.mock.calls.map((call) => String(call[0]));
            expect(logs.join(' ')).not.toContain('secret-token');
        });
    });
});
