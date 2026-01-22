/**
 * @fileoverview Subtitle text conversion utilities.
 * @module modules/player/subtitleConversion
 * @version 1.0.0
 */

export type SubtitleInputFormat = 'webvtt' | 'srt' | 'unknown';

export function stripBom(text: string): string {
    return text.replace(/^\uFEFF/, '');
}

export function normalizeLineEndings(text: string): string {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function detectSubtitleFormat(text: string): SubtitleInputFormat {
    const trimmed = stripBom(text).trimStart();
    if (trimmed.startsWith('WEBVTT')) return 'webvtt';
    if (trimmed.includes('-->')) return 'srt';
    return 'unknown';
}

export function convertSrtToVtt(text: string): string {
    const noBom = stripBom(text);
    const normalized = normalizeLineEndings(noBom);
    const timecodeFixed = normalized.replace(
        /(\d{2}:\d{2}:\d{2}),(\d{3})/g,
        '$1.$2'
    );
    const trimmed = timecodeFixed.trimStart();
    if (trimmed.startsWith('WEBVTT')) {
        return trimmed;
    }
    return `WEBVTT\n\n${trimmed}`;
}

export function normalizeSubtitleToVtt(text: string): { vtt: string; format: SubtitleInputFormat } {
    const format = detectSubtitleFormat(text);
    if (format === 'webvtt') {
        const normalized = normalizeLineEndings(stripBom(text));
        return { vtt: normalized.trimStart(), format };
    }
    if (format === 'srt') {
        return { vtt: convertSrtToVtt(text), format };
    }
    return { vtt: convertSrtToVtt(text), format: 'unknown' };
}

export function looksLikeHtml(text: string): boolean {
    const trimmed = stripBom(text).trimStart().toLowerCase();
    if (!trimmed) return false;
    return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.includes('<html');
}
