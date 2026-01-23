/**
 * @fileoverview Unit tests for subtitle conversion helpers.
 * @module modules/player/__tests__/subtitleConversion.test
 */

import {
    convertSrtToVtt,
    detectSubtitleFormat,
    normalizeSubtitleToVtt,
    looksLikeHtml,
} from '../subtitleConversion';

describe('subtitleConversion', () => {
    it('converts SRT to VTT with WEBVTT header and dot timecodes', () => {
        const srt = `1\n00:00:01,000 --> 00:00:02,500\nHello\n`;
        const vtt = convertSrtToVtt(srt);
        expect(vtt.startsWith('WEBVTT')).toBe(true);
        expect(vtt).toContain('00:00:01.000 --> 00:00:02.500');
    });

    it('detects WEBVTT format', () => {
        const vtt = `WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHi`;
        expect(detectSubtitleFormat(vtt)).toBe('webvtt');
    });

    it('normalizes BOM and line endings', () => {
        const srt = `\uFEFF1\r\n00:00:01,000 --> 00:00:02,000\r\nHello`;
        const normalized = normalizeSubtitleToVtt(srt);
        expect(normalized.vtt.startsWith('WEBVTT')).toBe(true);
        expect(normalized.vtt).toContain('00:00:01.000 --> 00:00:02.000');
    });

    it('detects HTML responses', () => {
        expect(looksLikeHtml('<!DOCTYPE html><html><body>nope</body></html>')).toBe(true);
        expect(looksLikeHtml('WEBVTT\n\n00:00:00.000 --> 00:00:01.000')).toBe(false);
    });
});
