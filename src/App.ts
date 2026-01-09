/**
 * @fileoverview Application Shell - Creates root containers and initializes orchestrator.
 * @module App
 * @version 1.0.0
 */

import {
    AppOrchestrator,
    type OrchestratorConfig,
    type ErrorRecoveryAction,
    AppErrorCode,
} from './Orchestrator';
import type { LifecycleAppError, AppPhase } from './modules/lifecycle/types';
import type { NavigationConfig } from './modules/navigation';
import type { VideoPlayerConfig } from './modules/player';
import type { EPGConfig } from './modules/ui/epg';
import type { PlexAuthConfig } from './modules/plex/auth';

// ============================================
// Configuration Defaults
// ============================================

const DEFAULT_PLEX_CONFIG: PlexAuthConfig = {
    clientIdentifier: '',
    product: 'Retune',
    version: '1.0.0',
    platform: 'webOS',
    platformVersion: '6.0',
    device: 'lgtv',
    deviceName: 'Living Room TV',
};

const DEFAULT_NAV_CONFIG: NavigationConfig = {
    enablePointerMode: false,
    keyRepeatDelayMs: 500,
    keyRepeatIntervalMs: 100,
    focusMemoryEnabled: true,
    debugMode: false,
};

const DEFAULT_PLAYER_CONFIG: VideoPlayerConfig = {
    containerId: 'video-container',
    defaultVolume: 1.0,
    bufferAheadMs: 30000,
    seekIncrementSec: 10,
    hideControlsAfterMs: 3000,
    retryAttempts: 3,
    retryDelayMs: 1000,
};

const DEFAULT_EPG_CONFIG: EPGConfig = {
    containerId: 'epg-container',
    visibleChannels: 5,
    timeSlotMinutes: 30,
    visibleHours: 3,
    totalHours: 24,
    pixelsPerMinute: 4,
    rowHeight: 80,
    showCurrentTimeIndicator: true,
    autoScrollToNow: true,
};

// ============================================
// App Class
// ============================================

/**
 * Application shell that creates containers and manages orchestrator.
 */
export class App {
    private _orchestrator: AppOrchestrator | null = null;
    private _errorOverlay: HTMLElement | null = null;
    private _toastContainer: HTMLElement | null = null;
    private _toastHideTimer: number | null = null;
    private _lastToastAt: number = 0;

    /**
     * Initialize and start the application.
     */
    async start(): Promise<void> {
        try {
            // Create root containers
            this._createContainers();

            // Build configuration
            const config = this._buildConfig();

            // Create and initialize orchestrator
            this._orchestrator = new AppOrchestrator();
            await this._orchestrator.initialize(config);

            // Wire up lifecycle error events before starting
            this._subscribeToLifecycleErrors();
            this._subscribeToLifecycleWarnings();

            // Start the orchestrator
            await this._orchestrator.start();
        } catch (error) {
            console.error('App startup failed:', error);
            this._showFatalError(error);
        }
    }

    /**
     * Subscribe to lifecycle error events to display overlay.
     */
    private _subscribeToLifecycleErrors(): void {
        if (!this._orchestrator) return;

        // Access lifecycle through orchestrator's module system
        // Register an error handler that displays the overlay
        this._orchestrator.registerErrorHandler('app-shell', (error): boolean => {
            const lifecycleError = this._orchestrator
                ? this._orchestrator.toLifecycleAppError(error)
                : {
                      code: error.code,
                      message: error.message,
                      recoverable: error.recoverable,
                  phase: 'error' as AppPhase,
                      timestamp: Date.now(),
                      userMessage: error.message,
                      actions: [],
                  };
            // Show the error overlay for all errors
            this.showErrorOverlay(lifecycleError);
            // Return false to allow other handlers to also process
            return false;
        });
    }

    /**
     * Subscribe to lifecycle warning events to display non-blocking toasts.
     */
    private _subscribeToLifecycleWarnings(): void {
        if (!this._orchestrator) return;

        this._orchestrator.onLifecycleEvent('persistenceWarning', () => {
            this._showToast('Some settings could not be saved.');
        });

        this._orchestrator.onLifecycleEvent('networkWarning', () => {
            this._showToast('Network connection looks unstable.');
        });
    }

    /**
     * Shutdown the application.
     */
    async shutdown(): Promise<void> {
        if (this._orchestrator) {
            await this._orchestrator.shutdown();
        }
    }

    /**
     * Get the orchestrator instance.
     */
    getOrchestrator(): AppOrchestrator | null {
        return this._orchestrator;
    }

    // ============================================
    // Private Methods
    // ============================================

    /**
     * Create DOM containers for modules that need them.
     */
    private _createContainers(): void {
        const root = document.getElementById('app');
        if (!root) {
            throw new Error('Root element #app not found');
        }

        // Video container
        const videoContainer = document.createElement('div');
        videoContainer.id = 'video-container';
        videoContainer.className = 'video-container';
        root.appendChild(videoContainer);

        // EPG container
        const epgContainer = document.createElement('div');
        epgContainer.id = 'epg-container';
        epgContainer.className = 'epg-container';
        root.appendChild(epgContainer);

        // Error overlay container
        const errorOverlay = document.createElement('div');
        errorOverlay.id = 'error-overlay';
        errorOverlay.className = 'error-overlay hidden';
        root.appendChild(errorOverlay);
        this._errorOverlay = errorOverlay;

        // Toast container (non-blocking warnings)
        const toastContainer = document.createElement('div');
        toastContainer.id = 'app-toast';
        toastContainer.style.position = 'fixed';
        toastContainer.style.left = '50%';
        toastContainer.style.bottom = '64px';
        toastContainer.style.transform = 'translateX(-50%)';
        toastContainer.style.maxWidth = '70%';
        toastContainer.style.background = 'rgba(0, 0, 0, 0.8)';
        toastContainer.style.color = '#fff';
        toastContainer.style.padding = '12px 20px';
        toastContainer.style.borderRadius = '8px';
        toastContainer.style.fontSize = '20px';
        toastContainer.style.lineHeight = '1.2';
        toastContainer.style.textAlign = 'center';
        toastContainer.style.opacity = '0';
        toastContainer.style.transition = 'opacity 200ms ease';
        toastContainer.style.pointerEvents = 'none';
        toastContainer.style.zIndex = '9999';
        toastContainer.style.display = 'none';
        root.appendChild(toastContainer);
        this._toastContainer = toastContainer;
    }

    /**
     * Build orchestrator configuration.
     */
    private _buildConfig(): OrchestratorConfig {
        return {
            plexConfig: this._getPlexConfig(),
            navConfig: DEFAULT_NAV_CONFIG,
            playerConfig: DEFAULT_PLAYER_CONFIG,
            epgConfig: DEFAULT_EPG_CONFIG,
        };
    }

    /**
     * Get Plex configuration with client identifier.
     */
    private _getPlexConfig(): PlexAuthConfig {
        const config = { ...DEFAULT_PLEX_CONFIG };

        // Get or generate client identifier
        let clientId = localStorage.getItem('retune_client_id');
        if (!clientId) {
            clientId = this._generateClientId();
            localStorage.setItem('retune_client_id', clientId);
        }
        config.clientIdentifier = clientId;

        return config;
    }

    /**
     * Generate a unique client identifier.
     * Uses crypto.randomUUID if available, falls back to Math.random.
     */
    private _generateClientId(): string {
        // Prefer crypto.randomUUID() if available (Chromium 92+)
        // Note: Some webOS versions may not support this despite Chromium version
        if (
            typeof crypto !== 'undefined' &&
            typeof crypto.randomUUID === 'function'
        ) {
            try {
                return `retune-${crypto.randomUUID()}`;
            } catch {
                // Fall through to Math.random fallback
            }
        }

        // Fallback to Math.random (adequate for non-security-sensitive client ID)
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = 'retune-';
        for (let i = 0; i < 16; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }


    /**
     * Show error overlay with recovery actions.
     */
    showErrorOverlay(error: LifecycleAppError): void {
        if (!this._errorOverlay || !this._orchestrator) {
            return;
        }

        const actions =
            error.actions.length > 0
                ? error.actions
                : this._orchestrator.getRecoveryActions(error.code as AppErrorCode);
        this._renderErrorOverlay(error, actions);
        this._errorOverlay.classList.remove('hidden');
    }

    /**
     * Hide error overlay.
     */
    hideErrorOverlay(): void {
        if (this._errorOverlay) {
            this._errorOverlay.classList.add('hidden');
        }
    }

    /**
     * Render error overlay content.
     */
    private _renderErrorOverlay(
        error: LifecycleAppError,
        actions: ErrorRecoveryAction[]
    ): void {
        if (!this._errorOverlay) return;

        // Clear existing content
        this._errorOverlay.innerHTML = '';

        // Error container
        const container = document.createElement('div');
        container.className = 'error-content';

        // Title
        const title = document.createElement('h2');
        title.className = 'error-title';
        title.textContent = 'Something went wrong';
        container.appendChild(title);

        // Message
        const message = document.createElement('p');
        message.className = 'error-message';
        message.textContent = error.userMessage || error.message;
        container.appendChild(message);

        // Actions
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'error-actions';

        for (const action of actions) {
            const button = document.createElement('button');
            button.className = action.isPrimary
                ? 'error-button primary'
                : 'error-button secondary';
            button.textContent = action.label;
            button.addEventListener('click', () => {
                this.hideErrorOverlay();
                action.action();
            });
            actionsContainer.appendChild(button);
        }

        container.appendChild(actionsContainer);
        this._errorOverlay.appendChild(container);
    }

    /**
     * Show fatal error when app cannot start.
     */
    private _showFatalError(error: unknown): void {
        const message = error instanceof Error ? error.message : String(error);
        const root = document.getElementById('app');
        if (root) {
            // Clear existing content
            root.innerHTML = '';

            // Create container
            const container = document.createElement('div');
            container.className = 'fatal-error';

            // Title
            const title = document.createElement('h1');
            title.textContent = 'Application Error';
            container.appendChild(title);

            // Error message (safe - uses textContent, not innerHTML)
            const errorPara = document.createElement('p');
            errorPara.textContent = message;
            container.appendChild(errorPara);

            // Instructions
            const instructPara = document.createElement('p');
            instructPara.textContent = 'Please refresh the page or restart the application.';
            container.appendChild(instructPara);

            root.appendChild(container);
        }
    }

    /**
     * Show a non-blocking toast message.
     */
    private _showToast(message: string): void {
        if (!this._toastContainer) {
            return;
        }

        const now = Date.now();
        if (now - this._lastToastAt < 1500) {
            return;
        }
        this._lastToastAt = now;

        this._toastContainer.textContent = message;
        this._toastContainer.style.display = 'block';
        this._toastContainer.style.opacity = '1';

        if (this._toastHideTimer !== null) {
            clearTimeout(this._toastHideTimer);
        }
        this._toastHideTimer = window.setTimeout(() => {
            if (!this._toastContainer) return;
            this._toastContainer.style.opacity = '0';
            const container = this._toastContainer;
            window.setTimeout(() => {
                if (container) {
                    container.style.display = 'none';
                }
            }, 200) as unknown as number;
        }, 5000) as unknown as number;
    }

}
