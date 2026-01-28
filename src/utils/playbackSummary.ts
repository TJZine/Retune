import { formatAudioCodec } from './mediaFormat';

export type PlaybackInfoSnapshotLike = {
    stream: {
        isDirectPlay: boolean;
        isTranscoding: boolean;
        container?: string;
        videoCodec?: string;
        audioCodec?: string;
        width?: number;
        height?: number;
    } | null;
};

export type PlaybackSummary = {
    summary: string | null;
    tag: string | null;
    details: string[];
};

export function buildPlaybackSummary(
    snapshot: PlaybackInfoSnapshotLike | null | undefined
): PlaybackSummary {
    const stream = snapshot?.stream;
    if (!stream) {
        return { summary: null, tag: null, details: [] };
    }

    const mode = stream.isDirectPlay
        ? 'Direct Play'
        : (stream.isTranscoding ? 'Transcode' : 'Stream');
    const video = formatVideoCodec(stream.videoCodec);
    const audio = formatAudioCodec(stream.audioCodec);
    const resolution = formatResolution(stream.width, stream.height);
    const codecLine = video && audio ? `${video}/${audio}` : (video || audio || '');

    const parts = [mode];
    if (codecLine) parts.push(codecLine);
    if (resolution) parts.push(resolution);

    const details: string[] = [];
    if (video || resolution) {
        details.push(`Video: ${[video, resolution].filter(Boolean).join(' • ')}`);
    }
    if (audio) {
        details.push(`Audio: ${audio}`);
    }
    if (stream.container) {
        details.push(`Container: ${stream.container.toUpperCase()}`);
    }

    return {
        summary: parts.length > 0 ? `Playback: ${parts.join(' • ')}` : null,
        tag: parts.length > 0 ? parts.join(' • ') : null,
        details,
    };
}

function formatVideoCodec(codec?: string): string | null {
    if (!codec) return null;
    const normalized = codec.trim().toLowerCase();
    switch (normalized) {
        case 'h264':
            return 'H.264';
        case 'h265':
        case 'hevc':
            return 'HEVC';
        case 'av1':
            return 'AV1';
        case 'mpeg2video':
            return 'MPEG-2';
        default:
            return normalized.toUpperCase();
    }
}

function formatResolution(_width?: number, height?: number): string | null {
    const resolvedHeight = Number.isFinite(height) ? Math.max(0, height ?? 0) : 0;
    if (!resolvedHeight) return null;
    const target = resolvedHeight;
    if (target >= 2160) return '4K';
    if (target >= 1440) return '1440p';
    if (target >= 1080) return '1080p';
    if (target >= 720) return '720p';
    if (target >= 480) return '480p';
    return `${Math.round(target)}p`;
}
