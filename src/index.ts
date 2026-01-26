/**
 * @fileoverview Application entry point.
 * @module index
 * @version 1.0.0
 */

import { App } from './App';
import './styles/tokens.css';
import './styles/themes.css';
import './modules/ui/epg/styles.css';
import './modules/ui/now-playing-info/styles.css';
import './modules/ui/player-osd/styles.css';
import './modules/ui/channel-transition/styles.css';
import './modules/ui/playback-options/styles.css';
import './modules/ui/settings/styles.css';
import './modules/ui/server-select/styles.css';
import './modules/ui/channel-setup/styles.css';
import './styles/shell.css';

// ============================================
// Global Error Handling
// ============================================

/**
 * Handle uncaught errors.
 */
function handleGlobalError(event: ErrorEvent): void {
    console.error('Uncaught error:', event.error || event.message);
    showGlobalErrorOverlay(event.error instanceof Error ? event.error.message : String(event.message));
    event.preventDefault();
}

/**
 * Handle unhandled promise rejections.
 */
function handleUnhandledRejection(event: PromiseRejectionEvent): void {
    console.error('Unhandled promise rejection:', event.reason);
    const message =
        event.reason instanceof Error
            ? event.reason.message
            : typeof event.reason === 'string'
                ? event.reason
                : 'An unexpected error occurred.';
    showGlobalErrorOverlay(message);
    event.preventDefault();
}

function showGlobalErrorOverlay(message: string): void {
    if (typeof document === 'undefined') return;
    const existing = document.getElementById('global-error-overlay');
    if (existing) return;

    const overlay = document.createElement('div');
    overlay.id = 'global-error-overlay';
    overlay.setAttribute('role', 'alert');
    overlay.setAttribute('aria-live', 'assertive');
    overlay.style.position = 'fixed';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.background = 'rgba(0, 0, 0, 0.85)';
    overlay.style.color = '#fff';
    overlay.style.zIndex = '99999';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.fontFamily = 'sans-serif';
    overlay.style.padding = '24px';
    overlay.style.textAlign = 'center';

    const title = document.createElement('div');
    title.textContent = 'Something went wrong';
    title.style.fontSize = '28px';
    title.style.marginBottom = '12px';
    title.style.fontWeight = '600';

    const detail = document.createElement('div');
    detail.textContent = message || 'An unexpected error occurred.';
    detail.style.fontSize = '18px';
    detail.style.opacity = '0.9';
    detail.style.maxWidth = '80%';

    const hint = document.createElement('div');
    hint.textContent = 'Please restart the app or try again.';
    hint.style.fontSize = '16px';
    hint.style.marginTop = '16px';
    hint.style.opacity = '0.75';

    overlay.append(title, detail, hint);
    const host = document.body ?? document.documentElement;
    if (!host) return;
    host.appendChild(overlay);
}

// Register global error handlers
window.addEventListener('error', handleGlobalError);
window.addEventListener('unhandledrejection', handleUnhandledRejection);

// ============================================
// Application Bootstrap
// ============================================

let app: App | null = null;

function describeElement(el: Element | null): unknown {
    if (!el) return null;
    const element = el as HTMLElement;
    const style = (globalThis as unknown as { getComputedStyle?: (el: Element) => CSSStyleDeclaration })
        .getComputedStyle?.(element);
    return {
        tag: element.tagName,
        id: element.id || null,
        className: element.className || null,
        children: element.childElementCount,
        rect: element.getBoundingClientRect
            ? ((): { x: number; y: number; w: number; h: number } => {
                const r = element.getBoundingClientRect();
                return { x: r.x, y: r.y, w: r.width, h: r.height };
            })()
            : null,
        computed: style
            ? {
                display: style.display,
                visibility: style.visibility,
                opacity: style.opacity,
                zIndex: style.zIndex,
                position: style.position,
            }
            : null,
    };
}

/**
 * Initialize the application when DOM is ready.
 */
async function bootstrap(): Promise<void> {
    console.warn('[Retune] Starting...');

    try {
        app = new App();
        const debugApi = {
            app,
            openEPG: (): void => {
                app?.getOrchestrator()?.openEPG();
            },
            closeEPG: (): void => {
                app?.getOrchestrator()?.closeEPG();
            },
            toggleEPG: (): void => {
                app?.getOrchestrator()?.toggleEPG();
            },
            domSnapshot: (): unknown => ({
                app: describeElement(document.getElementById('app')),
                videoContainer: describeElement(document.getElementById('video-container')),
                video: describeElement(document.querySelector('video')),
                epgContainer: describeElement(document.getElementById('epg-container')),
            }),
            hideVideo: (): void => {
                const video = document.querySelector('video') as HTMLElement | null;
                if (video) video.style.display = 'none';
            },
            showVideo: (): void => {
                const video = document.querySelector('video') as HTMLElement | null;
                if (video) video.style.display = 'block';
            },
            orchestratorStatus: (): unknown => {
                const orchestrator = app?.getOrchestrator();
                if (!orchestrator) return null;
                const status = Array.from(orchestrator.getModuleStatus().values()).map((s) => ({
                    id: s.id,
                    status: s.status,
                    loadTimeMs: s.loadTimeMs ?? null,
                    errorCode: s.error?.code ?? null,
                }));
                return {
                    isReady: orchestrator.isReady(),
                    status,
                };
            },
        };
        (window as Window & { __RETUNE__?: typeof debugApi }).__RETUNE__ = debugApi;
        await app.start();
        console.warn('[Retune] Started successfully');
    } catch (error) {
        console.error('Failed to start Retune:', error);
    }
}

/**
 * Cleanup when page unloads.
 */
async function cleanup(): Promise<void> {
    if (app) {
        console.warn('[Retune] Shutting down...');
        await app.shutdown();
        console.warn('[Retune] Shut down complete');
    }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        bootstrap().catch(console.error);
    });
} else {
    bootstrap().catch(console.error);
}

// Cleanup on page hide (more reliable for async work than beforeunload)
window.addEventListener('pagehide', () => {
    cleanup().catch(console.error);
});

// Export for testing
export { app, bootstrap, cleanup };
