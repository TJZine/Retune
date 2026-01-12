/**
 * @fileoverview Application entry point.
 * @module index
 * @version 1.0.0
 */

import { App } from './App';
import './modules/ui/epg/styles.css';
import './styles/shell.css';

// ============================================
// Global Error Handling
// ============================================

/**
 * Handle uncaught errors.
 */
function handleGlobalError(event: ErrorEvent): void {
    console.error('Uncaught error:', event.error || event.message);
    event.preventDefault();
}

/**
 * Handle unhandled promise rejections.
 */
function handleUnhandledRejection(event: PromiseRejectionEvent): void {
    console.error('Unhandled promise rejection:', event.reason);
    event.preventDefault();
}

// Register global error handlers
window.addEventListener('error', handleGlobalError);
window.addEventListener('unhandledrejection', handleUnhandledRejection);

// ============================================
// Application Bootstrap
// ============================================

let app: App | null = null;

function setBootBanner(text: string, type: 'info' | 'ok' | 'error' = 'info'): void {
    const el = document.getElementById('retune-boot-banner');
    if (!el) return;
    el.textContent = text;
    if (type === 'ok') {
        el.style.background = 'rgba(0, 120, 0, 0.8)';
    } else if (type === 'error') {
        el.style.background = 'rgba(160, 0, 0, 0.85)';
    } else {
        el.style.background = 'rgba(0, 0, 0, 0.8)';
    }
}

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
    setBootBanner('Retune: starting…', 'info');

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
                status: describeElement(document.getElementById('app-status')),
                videoContainer: describeElement(document.getElementById('video-container')),
                video: describeElement(document.querySelector('video')),
                epgContainer: describeElement(document.getElementById('epg-container')),
                bootBanner: describeElement(document.getElementById('retune-boot-banner')),
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
        setBootBanner('Retune: started', 'ok');
        console.warn('[Retune] Started successfully');
    } catch (error) {
        console.error('Failed to start Retune:', error);
        setBootBanner('Retune: startup failed (see console)', 'error');
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
