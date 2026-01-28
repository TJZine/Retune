import { buildPlaybackSummary } from '../playbackSummary';

describe('buildPlaybackSummary', () => {
    it('omits resolution when height is missing', () => {
        const summary = buildPlaybackSummary({
            stream: {
                isDirectPlay: true,
                isTranscoding: false,
                container: 'mp4',
                videoCodec: 'h264',
                audioCodec: 'aac',
                width: 1920,
            },
        });

        expect(summary.tag).toBe('Direct Play • H.264/AAC');
        expect(summary.details).toContain('Video: H.264');
    });

    it('uses height for resolution labels', () => {
        const summary = buildPlaybackSummary({
            stream: {
                isDirectPlay: true,
                isTranscoding: false,
                container: 'mp4',
                videoCodec: 'h264',
                audioCodec: 'aac',
                width: 1920,
                height: 1080,
            },
        });

        expect(summary.tag).toBe('Direct Play • H.264/AAC • 1080p');
        expect(summary.details).toContain('Video: H.264 • 1080p');
    });

    it('prefers override resolution when provided', () => {
        const summary = buildPlaybackSummary(
            {
                stream: {
                    isDirectPlay: true,
                    isTranscoding: false,
                    container: 'mp4',
                    videoCodec: 'h264',
                    audioCodec: 'aac',
                    width: 1920,
                    height: 1080,
                },
            },
            { resolutionOverride: '4K' }
        );

        expect(summary.tag).toBe('Direct Play • H.264/AAC • 4K');
        expect(summary.details).toContain('Video: H.264 • 4K');
    });
});
