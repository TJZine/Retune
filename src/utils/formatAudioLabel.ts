import type { AudioTrack } from '../modules/player/types';

export function formatAudioLabel(track: AudioTrack): string {
    const language = track.language || track.title || 'Unknown';
    const codec = track.codec ? track.codec.toUpperCase() : 'Unknown';
    const channels = track.channels > 0 ? ` ${track.channels}ch` : '';
    return `${language} (${codec}${channels})`;
}
