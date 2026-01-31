/**
 * @fileoverview Dolby Vision profile parsing and HDR10 fallback decision logic.
 * @module modules/plex/stream/dvHdr10Fallback
 * @version 1.0.0
 */

export type DvProfileInfo = {
    raw: string | null;
    profileId: number | null;
    levelId: number | null;
    // True only when we can confidently assert an HDR10 base layer exists.
    hasHdr10BaseLayer: boolean;
};

const LETTERBOX_ASPECT_RATIOS: Array<{ name: string; min: number; max: number }> = [
    { name: '2.39:1 (Scope)', min: 2.35, max: 2.45 },
    { name: '2.76:1 (Ultra Panavision)', min: 2.70, max: 2.80 },
    { name: '2.20:1 (70mm)', min: 2.15, max: 2.25 },
    { name: '1.85:1 (Flat)', min: 1.82, max: 1.88 },
];

export function isLetterboxAspectRatio(aspectRatio: number | null | undefined): boolean {
    if (typeof aspectRatio !== 'number') return false;
    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return false;
    return LETTERBOX_ASPECT_RATIOS.some((r) => aspectRatio >= r.min && aspectRatio <= r.max);
}

export function parseDolbyVisionProfileString(
    doviProfile: string | null | undefined,
    codecProfileString?: string | null | undefined
): DvProfileInfo {
    const raw = (doviProfile ?? '').trim();
    const profileFromCodec = (codecProfileString ?? '').trim();

    // Prefer deterministic Dolby codec strings (dvhe.<profile>.<level> or dvh1.<profile>.<level>).
    const codecMatch = profileFromCodec.match(/dv(?:he|h1)\.(\d+)\.(\d+)/i);
    if (codecMatch) {
        const profileId = Number.parseInt(codecMatch[1]!, 10);
        const levelId = Number.parseInt(codecMatch[2]!, 10);
        return {
            raw: profileFromCodec,
            profileId: Number.isFinite(profileId) ? profileId : null,
            levelId: Number.isFinite(levelId) ? levelId : null,
            hasHdr10BaseLayer: hasHdr10BaseLayer(profileId, raw),
        };
    }

    // Plex sometimes exposes strings like "8.1" or a misparsed "7.6" (profile 7, level 6).
    if (raw.length > 0) {
        const m = raw.match(/^(\d+)(?:\.(\d+))?$/);
        if (m) {
            const profileId = Number.parseInt(m[1]!, 10);
            const levelId = m[2] ? Number.parseInt(m[2], 10) : null;
            const normalizedRaw = raw;
            return {
                raw: normalizedRaw,
                profileId: Number.isFinite(profileId) ? profileId : null,
                levelId: levelId !== null && Number.isFinite(levelId) ? levelId : null,
                hasHdr10BaseLayer: hasHdr10BaseLayer(profileId, normalizedRaw),
            };
        }
    }

    return { raw: raw.length > 0 ? raw : null, profileId: null, levelId: null, hasHdr10BaseLayer: false };
}

export function hasHdr10BaseLayer(profileId: number | null, rawProfile: string | null): boolean {
    if (profileId === null) return false;

    // Profile 7 always has HDR10 base layer.
    if (profileId === 7) return true;

    // Profile 5 has no HDR10 base layer.
    if (profileId === 5) return false;

    // Profile 8 varies: only 8.1 is HDR10-compatible.
    if (profileId === 8) {
        const raw = (rawProfile ?? '').trim();
        return raw.startsWith('8.1');
    }

    return false;
}

export type Hdr10FallbackMode = 'off' | 'smart' | 'force';

export function computeHdr10FallbackMode(settings: {
    smartHdr10Fallback: boolean;
    forceHdr10Fallback: boolean;
}): Hdr10FallbackMode {
    if (settings.forceHdr10Fallback) return 'force';
    if (settings.smartHdr10Fallback) return 'smart';
    return 'off';
}

export function shouldApplyHdr10Fallback(args: {
    mode: Hdr10FallbackMode;
    container: string | null | undefined;
    isDolbyVision: boolean;
    doviProfile?: string | null;
    codecProfileString?: string | null;
    aspectRatio?: number | null;
    width?: number | null;
    height?: number | null;
}): { apply: boolean; reason: 'force' | 'smart' | 'none'; debugWhy: string } {
    const mode = args.mode;
    if (mode === 'off') return { apply: false, reason: 'none', debugWhy: 'mode_off' };

    const container = (args.container ?? '').toLowerCase();
    if (container !== 'mkv') return { apply: false, reason: 'none', debugWhy: 'container_not_mkv' };

    if (!args.isDolbyVision) return { apply: false, reason: 'none', debugWhy: 'not_dolby_vision' };

    const dv = parseDolbyVisionProfileString(args.doviProfile ?? null, args.codecProfileString ?? null);

    // Never apply to known non-HDR10 base-layer profiles (e.g., 5, 8.2, 8.4).
    if (!dv.hasHdr10BaseLayer) {
        return { apply: false, reason: 'none', debugWhy: 'no_hdr10_base_layer' };
    }

    const computedAspect =
        typeof args.aspectRatio === 'number' && args.aspectRatio > 0
            ? args.aspectRatio
            : typeof args.width === 'number' && typeof args.height === 'number' && args.height > 0
                ? args.width / args.height
                : null;

    if (mode === 'force') {
        return { apply: true, reason: 'force', debugWhy: 'force_enabled' };
    }

    // mode === 'smart'
    if (isLetterboxAspectRatio(computedAspect)) {
        return { apply: true, reason: 'smart', debugWhy: 'letterbox_detected' };
    }

    return { apply: false, reason: 'none', debugWhy: 'smart_not_letterbox' };
}
