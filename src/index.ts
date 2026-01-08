/**
 * @fileoverview Application entry point.
 * @module index
 * @version 1.0.0
 */

import { App } from './App';

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

/**
 * Initialize the application when DOM is ready.
 */
async function bootstrap(): Promise<void> {
    console.warn('[Retune] Starting...');

    try {
        app = new App();
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
