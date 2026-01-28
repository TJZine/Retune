/**
 * @fileoverview Media formatting helpers.
 * @module utils/mediaFormat
 */

export function formatAudioCodec(codec?: string): string | null {
    if (!codec) return null;
    const normalized = codec.trim().toLowerCase();
    switch (normalized) {
        case 'truehd':
            return 'TRUEHD';
        case 'eac3':
            return 'DD+';
        case 'ac3':
            return 'DD';
        case 'dca':
        case 'dts':
            return 'DTS';
        case 'dts-hd':
        case 'dtshd':
            return 'DTS-HD';
        default:
            return normalized.toUpperCase();
    }
}
