import { RETUNE_STORAGE_KEYS } from '../../config/storageKeys';
import { isStoredTrue, safeLocalStorageGet } from '../../utils/storage';
import type { INavigationManager } from '../navigation';
import type { IPlexStreamResolver, StreamDecision } from '../plex/stream';
import type { ScheduledProgram } from '../scheduler/scheduler';
import type { INowPlayingInfoOverlay } from '../ui/now-playing-info';

export interface NowPlayingDebugManagerDeps {
    nowPlayingModalId: string;
    getNavigation: () => INavigationManager | null;
    getStreamResolver: () => IPlexStreamResolver | null;
    getNowPlayingInfo: () => INowPlayingInfoOverlay | null;

    getCurrentProgram: () => ScheduledProgram | null;
    getCurrentStreamDecision: () => StreamDecision | null;

    // Called ONLY from debug-gated fetch after serverDecision applied AND modal is open.
    requestNowPlayingOverlayRefresh: () => void;
}

export class NowPlayingDebugManager {
    private _nowPlayingStreamDecisionFetchToken = 0;
    private _nowPlayingStreamDecisionFetchedForSessionId: string | null = null;
    private _nowPlayingStreamDecisionFetchPromise: Promise<StreamDecision['serverDecision']> | null = null;
    private _nowPlayingStreamDecisionFetchSessionId: string | null = null;

    constructor(private readonly deps: NowPlayingDebugManagerDeps) {}

    // Debug-only behaviors (must preserve current gating)
    maybeAutoShowNowPlayingStreamDebugHud(): void {
        const navigation = this.deps.getNavigation();
        if (!navigation) return;
        if (!this.deps.getNowPlayingInfo()) return;
        if (!this._isNowPlayingStreamDebugAutoShowEnabled()) return;

        const currentScreen = navigation.getCurrentScreen();
        if (currentScreen !== 'player') return;

        // Avoid stacking over other modals.
        if (navigation.isModalOpen(this.deps.nowPlayingModalId)) return;
        if (navigation.isModalOpen()) return;

        navigation.openModal(this.deps.nowPlayingModalId);
    }

    buildNowPlayingStreamDebugText(): string | null {
        if (!this._isNowPlayingStreamDebugEnabled()) return null;
        const decision = this.deps.getCurrentStreamDecision();
        if (!decision) return null;
        const program = this.deps.getCurrentProgram();

        const lines: string[] = [];
        lines.push(
            decision.isDirectPlay
                ? 'DIRECT PLAY'
                : 'HLS REQUESTED (Plex decides copy vs transcode)'
        );

        const w = typeof decision.width === 'number' ? decision.width : 0;
        const h = typeof decision.height === 'number' ? decision.height : 0;
        lines.push(
            `Target: ${decision.container} v=${decision.videoCodec} a=${decision.audioCodec} ${w}x${h} ${this._formatKbps(
                decision.bitrate
            )}`
        );

        const mediaInfo = program?.item.mediaInfo;
        const hdrLabel = mediaInfo?.hdr ?? decision.source?.hdr;
        const dvProfile = mediaInfo?.dvProfile ?? decision.source?.doviProfile;
        if (hdrLabel) {
            lines.push(`HDR: ${hdrLabel}${dvProfile ? ` (${dvProfile})` : ''}`);
        }

        if (decision.serverDecision) {
            const sd = decision.serverDecision;
            const parts = [
                sd.videoDecision ? `v=${sd.videoDecision}` : null,
                sd.audioDecision ? `a=${sd.audioDecision}` : null,
                sd.subtitleDecision ? `sub=${sd.subtitleDecision}` : null,
            ].filter(Boolean);
            if (parts.length > 0) lines.push(`PMS: ${parts.join(' ')}`);
            if (sd.decisionCode) lines.push(`PMS code: ${sd.decisionCode}`);
            if (sd.decisionText) lines.push(`PMS: ${sd.decisionText}`);
        } else if (decision.isTranscoding) {
            lines.push('PMS: (decision pending)');
        }

        if (decision.directPlay?.reasons?.length) {
            lines.push(`Blocked: ${decision.directPlay.reasons.join(', ')}`);
        }
        if (decision.audioFallback) {
            lines.push(
                `Fallback: ${decision.audioFallback.fromCodec} -> ${decision.audioFallback.toCodec}`
            );
        }
        if (decision.source) {
            lines.push(
                `Src: ${decision.source.container} v=${decision.source.videoCodec} a=${decision.source.audioCodec}`
            );
        }

        // Keep short for TVs (CSS also clamps, but avoid generating huge strings).
        return lines.slice(0, 6).join('\n');
    }

    async maybeFetchNowPlayingStreamDecisionForDebugHud(): Promise<void> {
        if (!this._isNowPlayingStreamDebugEnabled()) return;
        const program = this.deps.getCurrentProgram();
        const decision = this.deps.getCurrentStreamDecision();
        if (!program || !decision || !decision.isTranscoding || !decision.transcodeRequest) {
            return;
        }
        await this._ensureServerDecision(program, decision, {
            logErrors: false,
            onApplied: (): void => {
                const navigation = this.deps.getNavigation();
                if (navigation?.isModalOpen(this.deps.nowPlayingModalId)) {
                    this.deps.requestNowPlayingOverlayRefresh();
                }
            },
        });
    }

    // Snapshot behavior (must NOT require debug enabled)
    async ensureServerDecisionForPlaybackInfoSnapshot(): Promise<void> {
        const program = this.deps.getCurrentProgram();
        const decision = this.deps.getCurrentStreamDecision();
        if (!program || !decision) {
            return;
        }
        await this._ensureServerDecision(program, decision, { logErrors: true });
    }

    private async _ensureServerDecision(
        program: ScheduledProgram,
        decision: StreamDecision,
        options: { logErrors: boolean; onApplied?: () => void }
    ): Promise<void> {
        const resolver = this.deps.getStreamResolver();
        if (!resolver) return;
        if (!decision.isTranscoding || !decision.transcodeRequest) return;

        const sessionId = decision.transcodeRequest.sessionId;
        if (decision.serverDecision && this._nowPlayingStreamDecisionFetchedForSessionId === sessionId) {
            return;
        }

        if (
            this._nowPlayingStreamDecisionFetchPromise &&
            this._nowPlayingStreamDecisionFetchSessionId === sessionId
        ) {
            try {
                await this._nowPlayingStreamDecisionFetchPromise;
            } catch (error) {
                if (options.logErrors) {
                    console.warn('[Orchestrator] Failed to fetch transcode decision:', error);
                }
                return;
            }
            if (this.deps.getCurrentStreamDecision() !== decision) return;
            if (decision.serverDecision && this._nowPlayingStreamDecisionFetchedForSessionId === sessionId) {
                options.onApplied?.();
            }
            return;
        }

        const token = ++this._nowPlayingStreamDecisionFetchToken;
        this._nowPlayingStreamDecisionFetchSessionId = sessionId;
        const req = decision.transcodeRequest;
        const opts: { sessionId: string; maxBitrate: number; audioStreamId?: string } = {
            sessionId: req.sessionId,
            maxBitrate: req.maxBitrate,
        };
        if (typeof req.audioStreamId === 'string') {
            opts.audioStreamId = req.audioStreamId;
        }

        const fetchPromise = resolver.fetchUniversalTranscodeDecision(
            program.item.ratingKey,
            opts
        );
        this._nowPlayingStreamDecisionFetchPromise = fetchPromise;

        try {
            const serverDecision = await fetchPromise;
            if (token !== this._nowPlayingStreamDecisionFetchToken) return;
            if (this.deps.getCurrentStreamDecision() !== decision) return;

            decision.serverDecision = serverDecision;
            this._nowPlayingStreamDecisionFetchedForSessionId = sessionId;
            options.onApplied?.();
        } catch (error) {
            if (options.logErrors) {
                console.warn('[Orchestrator] Failed to fetch transcode decision:', error);
            }
        } finally {
            if (
                token === this._nowPlayingStreamDecisionFetchToken &&
                this._nowPlayingStreamDecisionFetchPromise === fetchPromise
            ) {
                this._nowPlayingStreamDecisionFetchPromise = null;
                this._nowPlayingStreamDecisionFetchSessionId = null;
            }
        }
    }

    private _isNowPlayingStreamDebugEnabled(): boolean {
        try {
            return isStoredTrue(safeLocalStorageGet(RETUNE_STORAGE_KEYS.NOW_PLAYING_STREAM_DEBUG));
        } catch {
            return false;
        }
    }

    private _isNowPlayingStreamDebugAutoShowEnabled(): boolean {
        try {
            return (
                this._isNowPlayingStreamDebugEnabled() &&
                isStoredTrue(safeLocalStorageGet(RETUNE_STORAGE_KEYS.NOW_PLAYING_STREAM_DEBUG_AUTO_SHOW))
            );
        } catch {
            return false;
        }
    }

    private _formatKbps(kbps: number): string {
        if (!Number.isFinite(kbps)) return 'unknown';
        if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`;
        return `${kbps} kbps`;
    }
}
