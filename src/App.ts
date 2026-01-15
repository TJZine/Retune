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
import { AuthScreen } from './modules/ui/auth';
import { ChannelSetupScreen } from './modules/ui/channel-setup';
import { ServerSelectScreen } from './modules/ui/server-select';
import { SplashScreen } from './modules/ui/splash';
import { SettingsScreen } from './modules/ui/settings';
import { AudioSetupScreen } from './modules/ui/audio-setup';
import { STORAGE_KEYS } from './types';
import {
    safeClearRetuneStorage,
    safeLocalStorageGet,
    safeLocalStorageRemove,
    safeLocalStorageSet,
} from './utils/storage';

// ============================================
// Configuration Defaults
// ============================================

const DEFAULT_PLEX_CONFIG: PlexAuthConfig = {
    clientIdentifier: '',
    product: 'Retune',
    version: '1.0.0',
    platform: 'webOS',
    platformVersion: '6.0',
    device: 'LG Smart TV',
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
    rowHeight: 96,
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
    private _authContainer: HTMLElement | null = null;
    private _serverSelectContainer: HTMLElement | null = null;
    private _channelSetupContainer: HTMLElement | null = null;
    private _authScreen: AuthScreen | null = null;
    private _serverSelectScreen: ServerSelectScreen | null = null;
    private _channelSetupScreen: ChannelSetupScreen | null = null;
    private _audioSetupContainer: HTMLElement | null = null;
    private _audioSetupScreen: AudioSetupScreen | null = null;
    private _settingsContainer: HTMLElement | null = null;
    private _settingsScreen: SettingsScreen | null = null;

    private _splashContainer: HTMLElement | null = null;
    private _splashScreen: SplashScreen | null = null;
    private _devMenuContainer: HTMLElement | null = null;
    private _screenUnsubscribe: (() => void) | null = null;
    private _phaseUnsubscribe: (() => void) | null = null;
    private _globalKeydownHandler: ((e: KeyboardEvent) => void) | null = null;

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

            // Initialize minimal auth/server screens before startup
            this._initializeScreens();
            this._wireScreenVisibility();

            // Wire up lifecycle error events before starting
            this._subscribeToLifecycleErrors();
            this._subscribeToLifecycleWarnings();
            this._wireNowPlayingToasts();

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

    private _wireNowPlayingToasts(): void {
        if (!this._orchestrator) return;
        this._orchestrator.setNowPlayingHandler((message) => {
            this._showToast(message);
        });
    }

    /**
     * Shutdown the application.
     */
    async shutdown(): Promise<void> {
        if (this._screenUnsubscribe) {
            this._screenUnsubscribe();
            this._screenUnsubscribe = null;
        }
        if (this._phaseUnsubscribe) {
            this._phaseUnsubscribe();
            this._phaseUnsubscribe = null;
        }
        if (this._globalKeydownHandler) {
            document.removeEventListener('keydown', this._globalKeydownHandler);
            this._globalKeydownHandler = null;
        }
        try {
            delete (window as { retune?: unknown }).retune;
        } catch {
            // ignore
        }
        if (this._orchestrator) {
            this._orchestrator.setNowPlayingHandler(null);
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

        // Splash container (startup screen)
        const splashContainer = document.createElement('div');
        splashContainer.id = 'splash-container';
        splashContainer.className = 'screen';
        root.appendChild(splashContainer);
        this._splashContainer = splashContainer;

        // Auth container (minimal screen)
        const authContainer = document.createElement('div');
        authContainer.id = 'auth-container';
        authContainer.className = 'screen';
        root.appendChild(authContainer);
        this._authContainer = authContainer;

        // Server select container (minimal screen)
        const serverSelectContainer = document.createElement('div');
        serverSelectContainer.id = 'server-select-container';
        serverSelectContainer.className = 'screen';
        root.appendChild(serverSelectContainer);
        this._serverSelectContainer = serverSelectContainer;

        // Channel setup container
        const channelSetupContainer = document.createElement('div');
        channelSetupContainer.id = 'channel-setup-container';
        channelSetupContainer.className = 'screen';
        root.appendChild(channelSetupContainer);
        this._channelSetupContainer = channelSetupContainer;

        // Audio setup container
        const audioSetupContainer = document.createElement('div');
        audioSetupContainer.id = 'audio-setup-container';
        audioSetupContainer.className = 'screen';
        root.appendChild(audioSetupContainer);
        this._audioSetupContainer = audioSetupContainer;

        // Settings container
        const settingsContainer = document.createElement('div');
        settingsContainer.id = 'settings-container';
        settingsContainer.className = 'screen';
        root.appendChild(settingsContainer);
        this._settingsContainer = settingsContainer;

        // Error overlay container
        const errorOverlay = document.createElement('div');
        errorOverlay.id = 'error-overlay';
        errorOverlay.className = 'error-overlay hidden';
        root.appendChild(errorOverlay);
        this._errorOverlay = errorOverlay;

        // Global debug key handlers
        if (this._globalKeydownHandler) {
            document.removeEventListener('keydown', this._globalKeydownHandler);
        }
        this._globalKeydownHandler = (e: KeyboardEvent): void => {
            if (e.code === 'KeyI') {
                this._orchestrator?.toggleServerSelect();
            }
            // Dev Menu: Ctrl+Shift+D
            if (e.code === 'KeyD' && e.ctrlKey && e.shiftKey) {
                this._toggleDevMenu();
            }
        };
        document.addEventListener('keydown', this._globalKeydownHandler);

        // Dev Menu Container
        const devMenu = document.createElement('div');
        devMenu.id = 'dev-menu';
        devMenu.style.position = 'absolute';
        devMenu.style.top = '50%';
        devMenu.style.left = '50%';
        devMenu.style.transform = 'translate(-50%, -50%)';
        devMenu.style.background = '#222';
        devMenu.style.color = '#fff';
        devMenu.style.padding = '20px';
        devMenu.style.borderRadius = '8px';
        devMenu.style.zIndex = '10000';
        devMenu.style.display = 'none';
        devMenu.style.boxShadow = '0 0 20px rgba(0,0,0,0.5)';
        devMenu.style.minWidth = '300px';
        root.appendChild(devMenu);
        this._devMenuContainer = devMenu;

        // Expose global helper
        (window as unknown as { retune: { toggleDevMenu: () => void } }).retune = {
            toggleDevMenu: (): void => this._toggleDevMenu(),
        };

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

    private _initializeScreens(): void {
        if (!this._orchestrator) {
            return;
        }
        if (this._splashContainer) {
            this._splashScreen = new SplashScreen(this._splashContainer);
        }
        if (!this._authContainer || !this._serverSelectContainer || !this._channelSetupContainer) {
            return;
        }
        this._authScreen = new AuthScreen(this._authContainer, this._orchestrator);
        this._serverSelectScreen = new ServerSelectScreen(
            this._serverSelectContainer,
            this._orchestrator
        );
        this._channelSetupScreen = new ChannelSetupScreen(
            this._channelSetupContainer,
            this._orchestrator
        );
        if (this._settingsContainer && this._orchestrator) {
            this._settingsScreen = new SettingsScreen(
                this._settingsContainer,
                () => this._orchestrator?.getNavigation() ?? null
            );
        }
        if (this._audioSetupContainer && this._orchestrator) {
            this._audioSetupScreen = new AudioSetupScreen(
                this._audioSetupContainer,
                () => this._orchestrator?.getNavigation() ?? null,
                () => this._onAudioSetupComplete()
            );
        }
    }

    private _onAudioSetupComplete(): void {
        // Navigate to channel-setup after audio setup
        if (this._orchestrator) {
            this._orchestrator.getNavigation()?.replaceScreen('channel-setup');
        }
    }

    private _wireScreenVisibility(): void {
        if (!this._orchestrator) {
            return;
        }
        const disposable = this._orchestrator.onScreenChange((_from, to) => {
            this._applyScreenVisibility(to);
        });
        this._screenUnsubscribe = (): void => disposable.dispose();

        const phaseDisposable = this._orchestrator.onLifecycleEvent('phaseChange', ({ to }) => {
            if (to === 'ready') {
                const current = this._orchestrator?.getCurrentScreen();
                this._applyScreenVisibility(current ?? 'player');
            }
        });
        this._phaseUnsubscribe = (): void => phaseDisposable.dispose();

        const current = this._orchestrator.getCurrentScreen();
        if (current) {
            this._applyScreenVisibility(current);
        }
    }

    private _applyScreenVisibility(screen: string): void {
        // Guard: If app is ready, hide setup screens unless navigating to them
        // Settings is handled separately below (it's an overlay, not a setup flow)
        if (
            this._orchestrator &&
            this._orchestrator.isReady() &&
            screen !== 'auth' &&
            screen !== 'server-select' &&
            screen !== 'audio-setup' &&
            screen !== 'channel-setup' &&
            screen !== 'settings'
        ) {
            this._splashScreen?.hide();
            this._authScreen?.hide();
            this._serverSelectScreen?.hide();
            this._audioSetupScreen?.hide();
            this._channelSetupScreen?.hide();
            this._settingsScreen?.hide();
            return;
        }
        const showSplash = screen === 'splash';
        const showAuth = screen === 'auth';
        const showServerSelect = screen === 'server-select';
        const showAudioSetup = screen === 'audio-setup';
        const showChannelSetup = screen === 'channel-setup';
        const showSettings = screen === 'settings';

        if (this._splashScreen) {
            if (showSplash) {
                this._splashScreen.show();
            } else {
                this._splashScreen.hide();
            }
        }

        if (this._authScreen) {
            if (showAuth) {
                this._authScreen.show();
            } else {
                this._authScreen.hide();
            }
        }

        if (this._serverSelectScreen) {
            if (showServerSelect) {
                this._serverSelectScreen.show();
            } else {
                this._serverSelectScreen.hide();
            }
        }

        if (this._audioSetupScreen) {
            if (showAudioSetup) {
                this._audioSetupScreen.show();
            } else {
                this._audioSetupScreen.hide();
            }
        }

        if (this._channelSetupScreen) {
            if (showChannelSetup) {
                this._channelSetupScreen.show();
            } else {
                this._channelSetupScreen.hide();
            }
        }

        if (this._settingsScreen) {
            if (showSettings) {
                this._settingsScreen.show();
            } else {
                this._settingsScreen.hide();
            }
        }
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
        let clientId = safeLocalStorageGet(STORAGE_KEYS.CLIENT_ID) ?? '';
        const isSaneClientId = (value: string): boolean =>
            value.length > 0 && value.length <= 128 && /^[a-zA-Z0-9._-]+$/.test(value);
        if (!isSaneClientId(clientId)) {
            clientId = this._generateClientId();
            safeLocalStorageSet(STORAGE_KEYS.CLIENT_ID, clientId);
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

    private _toggleDevMenu(): void {
        if (!this._devMenuContainer) return;

        if (this._devMenuContainer.style.display === 'none') {
            this._renderDevMenu();
            this._devMenuContainer.style.display = 'block';
        } else {
            this._devMenuContainer.style.display = 'none';
        }
    }

    private _renderDevMenu(): void {
        if (!this._devMenuContainer) return;

        const isDemo = safeLocalStorageGet(STORAGE_KEYS.MODE) === 'demo';

        // Dev-only: keep all interpolations here strictly to controlled constants/flags.
        // Do NOT interpolate Plex/user-provided strings into innerHTML to avoid future XSS foot-guns.
        this._devMenuContainer.innerHTML = `
            <h2 style="margin-top:0;border-bottom:1px solid #444;padding-bottom:10px;">Dev Menu</h2>
            <div style="margin-bottom:15px;color:#aaa;">Current Mode: <strong style="color:${isDemo ? '#eebb00' : '#00cc66'}">${isDemo ? 'DEMO' : 'REAL'}</strong></div>
            <div style="margin-bottom:15px;color:#aaa;font-size:13px;">
                Storage keys: <code>${STORAGE_KEYS.MODE}</code>, <code>${STORAGE_KEYS.CHANNELS_REAL}</code>, <code>${STORAGE_KEYS.CHANNELS_DEMO}</code>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">
                <button id="dev-toggle-mode" style="padding:10px;cursor:pointer;">Switch to ${isDemo ? 'REAL' : 'DEMO'} Mode</button>
                ${isDemo
                ? '<button id="dev-seed-channels" style="padding:10px;cursor:pointer;">Re-seed Demo Channels</button>'
                : ''
            }
                ${isDemo
                ? '<button id="dev-clear-demo" style="padding:10px;cursor:pointer;background:#433;color:#fff;border:none;">Clear Demo Channels (Demo Only)</button>'
                : ''
            }
                ${!isDemo
                ? `
                <details style="border:1px solid #333;border-radius:8px;padding:10px;">
                    <summary style="cursor:pointer;color:#ddd;">Transcode Debug Overrides</summary>
                    <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px;">
                        <label style="font-size:13px;color:#aaa;">Preset
                            <select id="dev-transcode-preset" style="margin-left:8px;padding:6px;">
                                <option value="">(none)</option>
                                <option value="webos-lgtv">webos-lgtv</option>
                                <option value="webos-lg">webos-lg</option>
                                <option value="plex-web">plex-web</option>
                                <option value="android">android</option>
                            </select>
                        </label>
                        <label style="font-size:13px;color:#aaa;">
                            <input id="dev-transcode-compat" type="checkbox" /> Compat mode (retune_transcode_compat=1)
                        </label>
                        <label style="font-size:13px;color:#aaa;">Platform <input id="dev-transcode-platform" style="margin-left:8px;padding:6px;width:220px;" /></label>
                        <label style="font-size:13px;color:#aaa;">Platform Version <input id="dev-transcode-platform-version" style="margin-left:8px;padding:6px;width:220px;" /></label>
                        <label style="font-size:13px;color:#aaa;">Device <input id="dev-transcode-device" style="margin-left:8px;padding:6px;width:220px;" /></label>
                        <label style="font-size:13px;color:#aaa;">Device Name <input id="dev-transcode-device-name" style="margin-left:8px;padding:6px;width:220px;" /></label>
                        <label style="font-size:13px;color:#aaa;">Model <input id="dev-transcode-model" style="margin-left:8px;padding:6px;width:220px;" /></label>
                        <label style="font-size:13px;color:#aaa;">Product <input id="dev-transcode-product" style="margin-left:8px;padding:6px;width:220px;" /></label>
                        <label style="font-size:13px;color:#aaa;">Version <input id="dev-transcode-version" style="margin-left:8px;padding:6px;width:220px;" /></label>
                        <label style="font-size:13px;color:#aaa;">Forced Profile Name <input id="dev-transcode-profile-name" style="margin-left:8px;padding:6px;width:220px;" /></label>
                        <label style="font-size:13px;color:#aaa;">Forced Profile Version <input id="dev-transcode-profile-version" style="margin-left:8px;padding:6px;width:220px;" /></label>
                        <div style="display:flex;gap:10px;margin-top:6px;">
                            <button id="dev-transcode-save" style="padding:8px;cursor:pointer;">Save Overrides</button>
                            <button id="dev-transcode-clear" style="padding:8px;cursor:pointer;background:#500;color:#fff;border:none;">Clear Overrides</button>
                        </div>
                        <div style="font-size:12px;color:#888;margin-top:6px;">
                            Overrides apply only to transcode URL generation; tokens are never shown.
                        </div>
                    </div>
                </details>
                `
                : ''
            }
                <button id="dev-reset-app" style="padding:10px;cursor:pointer;background:#500;color:#fff;border:none;">Reset Retune Storage</button>
                <button id="dev-close" style="padding:10px;cursor:pointer;margin-top:10px;">Close</button>
            </div>
        `;

        // Bind events
        this._devMenuContainer.querySelector('#dev-toggle-mode')?.addEventListener('click', () => {
            this._orchestrator?.toggleDemoMode();
        });

        this._devMenuContainer.querySelector('#dev-seed-channels')?.addEventListener('click', async () => {
            safeLocalStorageRemove(STORAGE_KEYS.CHANNELS_DEMO);
            window.location.reload();
        });

        this._devMenuContainer.querySelector('#dev-clear-demo')?.addEventListener('click', () => {
            const ok = window.confirm('Clear Demo channels only? (This does not touch real channels.)');
            if (!ok) return;
            safeLocalStorageRemove(STORAGE_KEYS.CHANNELS_DEMO);
            window.location.reload();
        });

        this._devMenuContainer.querySelector('#dev-reset-app')?.addEventListener('click', () => {
            const ok = window.confirm('Reset Retune storage (mode, channels, overrides)?');
            if (!ok) return;
            safeClearRetuneStorage();
            window.location.reload();
        });

        this._devMenuContainer.querySelector('#dev-close')?.addEventListener('click', () => {
            this._devMenuContainer!.style.display = 'none';
        });

        // Transcode override controls (real mode only)
        const read = (k: string): string => safeLocalStorageGet(k) ?? '';
        const clamp = (v: string): string => v.trim().slice(0, 128);
        const writeOrRemove = (k: string, v: string): void => {
            const value = clamp(v);
            if (value.length === 0) {
                safeLocalStorageRemove(k);
            } else {
                safeLocalStorageSet(k, value);
            }
        };

        const presetSelect = this._devMenuContainer.querySelector('#dev-transcode-preset') as HTMLSelectElement | null;
        if (presetSelect) {
            presetSelect.value = read('retune_transcode_preset');
        }
        const compatEl = this._devMenuContainer.querySelector('#dev-transcode-compat') as HTMLInputElement | null;
        if (compatEl) {
            compatEl.checked = read('retune_transcode_compat') === '1';
        }

        const setInputValue = (id: string, key: string): void => {
            const el = this._devMenuContainer!.querySelector(id) as HTMLInputElement | null;
            if (el) el.value = read(key);
        };
        setInputValue('#dev-transcode-platform', 'retune_transcode_platform');
        setInputValue('#dev-transcode-platform-version', 'retune_transcode_platform_version');
        setInputValue('#dev-transcode-device', 'retune_transcode_device');
        setInputValue('#dev-transcode-device-name', 'retune_transcode_device_name');
        setInputValue('#dev-transcode-model', 'retune_transcode_model');
        setInputValue('#dev-transcode-product', 'retune_transcode_product');
        setInputValue('#dev-transcode-version', 'retune_transcode_version');
        setInputValue('#dev-transcode-profile-name', 'retune_transcode_profile_name');
        setInputValue('#dev-transcode-profile-version', 'retune_transcode_profile_version');

        this._devMenuContainer.querySelector('#dev-transcode-save')?.addEventListener('click', () => {
            if (presetSelect) writeOrRemove('retune_transcode_preset', presetSelect.value);
            if (compatEl) safeLocalStorageSet('retune_transcode_compat', compatEl.checked ? '1' : '0');
            const getInput = (id: string): string => {
                const el = this._devMenuContainer!.querySelector(id) as HTMLInputElement | null;
                return el ? el.value : '';
            };
            writeOrRemove('retune_transcode_platform', getInput('#dev-transcode-platform'));
            writeOrRemove('retune_transcode_platform_version', getInput('#dev-transcode-platform-version'));
            writeOrRemove('retune_transcode_device', getInput('#dev-transcode-device'));
            writeOrRemove('retune_transcode_device_name', getInput('#dev-transcode-device-name'));
            writeOrRemove('retune_transcode_model', getInput('#dev-transcode-model'));
            writeOrRemove('retune_transcode_product', getInput('#dev-transcode-product'));
            writeOrRemove('retune_transcode_version', getInput('#dev-transcode-version'));
            writeOrRemove('retune_transcode_profile_name', getInput('#dev-transcode-profile-name'));
            writeOrRemove('retune_transcode_profile_version', getInput('#dev-transcode-profile-version'));
            this._showToast('Saved transcode overrides');
        });

        this._devMenuContainer.querySelector('#dev-transcode-clear')?.addEventListener('click', () => {
            const ok = window.confirm('Clear transcode overrides?');
            if (!ok) return;
            const keys = [
                'retune_transcode_preset',
                'retune_transcode_compat',
                'retune_transcode_platform',
                'retune_transcode_platform_version',
                'retune_transcode_device',
                'retune_transcode_device_name',
                'retune_transcode_model',
                'retune_transcode_product',
                'retune_transcode_version',
                'retune_transcode_profile_name',
                'retune_transcode_profile_version',
            ];
            for (const k of keys) safeLocalStorageRemove(k);
            this._showToast('Cleared transcode overrides');
            // Re-render to reflect cleared state
            this._renderDevMenu();
        });
    }

}
