/**
 * @fileoverview Minimal Plex auth screen for PIN flow in simulator.
 * @module modules/ui/auth/AuthScreen
 * @version 1.0.0
 */

import { AppOrchestrator } from '../../../Orchestrator';
import { PlexApiError, type PlexPinRequest } from '../../plex/auth';



export class AuthScreen {
    private _container: HTMLElement;
    private _orchestrator: AppOrchestrator;
    private _pinEl: HTMLElement;
    private _statusEl: HTMLElement;
    private _detailEl: HTMLElement;
    private _errorEl: HTMLElement;
    private _requestButton: HTMLButtonElement;
    private _cancelButton: HTMLButtonElement;
    private _retryButton: HTMLButtonElement;
    private _pollToken: number = 0;
    private _elapsedTimer: number | null = null;
    private _pollStartedAt: number | null = null;
    private _activePinId: number | null = null;
    private _activeCode: string | null = null;

    constructor(container: HTMLElement, orchestrator: AppOrchestrator) {
        this._container = container;
        this._orchestrator = orchestrator;
        this._container.classList.add('screen');
        this._container.style.position = 'absolute';
        this._container.style.inset = '0';
        this._container.style.display = 'none';
        this._container.style.alignItems = 'center';
        this._container.style.justifyContent = 'center';

        const panel = document.createElement('div');
        panel.className = 'screen-panel';

        const title = document.createElement('h1');
        title.className = 'screen-title';
        title.textContent = 'Sign in to Plex';
        panel.appendChild(title);

        const subtitle = document.createElement('p');
        subtitle.className = 'screen-subtitle';
        subtitle.textContent = 'Go to https://plex.tv/link and enter the code below.';
        panel.appendChild(subtitle);

        const pin = document.createElement('div');
        pin.className = 'pin-code';
        pin.textContent = '----';
        panel.appendChild(pin);
        this._pinEl = pin;

        const status = document.createElement('div');
        status.className = 'screen-status';
        status.textContent = 'Ready to request a PIN.';
        panel.appendChild(status);
        this._statusEl = status;

        const detail = document.createElement('div');
        detail.className = 'screen-detail';
        detail.textContent = '';
        panel.appendChild(detail);
        this._detailEl = detail;

        const error = document.createElement('div');
        error.className = 'screen-error';
        error.textContent = '';
        panel.appendChild(error);
        this._errorEl = error;

        const buttonRow = document.createElement('div');
        buttonRow.className = 'button-row';

        const requestButton = document.createElement('button');
        requestButton.id = 'btn-auth-request';
        requestButton.className = 'screen-button';
        requestButton.textContent = 'Request PIN';
        requestButton.addEventListener('click', () => {
            this._handleRequestPin().catch(console.error);
        });
        buttonRow.appendChild(requestButton);
        this._requestButton = requestButton;


        const cancelButton = document.createElement('button');
        cancelButton.id = 'btn-auth-cancel';
        cancelButton.className = 'screen-button secondary';
        cancelButton.textContent = 'Cancel';
        cancelButton.disabled = true;
        cancelButton.addEventListener('click', () => {
            this._handleCancel().catch(console.error);
        });
        buttonRow.appendChild(cancelButton);
        this._cancelButton = cancelButton;


        const retryButton = document.createElement('button');
        retryButton.id = 'btn-auth-retry';
        retryButton.className = 'screen-button secondary';
        retryButton.textContent = 'Retry';
        retryButton.style.display = 'none';
        retryButton.addEventListener('click', () => {
            this._handleRequestPin().catch(console.error);
        });
        buttonRow.appendChild(retryButton);
        this._retryButton = retryButton;


        panel.appendChild(buttonRow);
        this._container.appendChild(panel);
    }

    show(): void {
        this._container.style.display = 'flex';
        this._container.classList.add('visible');
        this._registerFocusables();
    }

    hide(): void {
        this._unregisterFocusables();
        this._container.style.display = 'none';
        this._container.classList.remove('visible');
    }


    private async _handleRequestPin(): Promise<void> {
        this._clearError();
        this._setButtons({ request: false, cancel: true, retry: false });
        this._setStatus('Requesting PIN…', '');
        this._renderPin('----');

        if (this._activePinId !== null) {
            await this._orchestrator.cancelPin(this._activePinId);
        }

        try {
            const pin = await this._orchestrator.requestAuthPin();
            this._activePinId = pin.id;
            this._activeCode = pin.code;
            this._renderPin(pin.code);
            this._startPolling(pin);
        } catch (error) {
            this._handleError(error, 'Failed to request PIN.');
            this._setButtons({ request: true, cancel: false, retry: true });
        }
    }

    private async _startPolling(pin: PlexPinRequest): Promise<void> {
        this._pollToken += 1;
        const token = this._pollToken;
        this._pollStartedAt = Date.now();
        this._startElapsedTimer();
        this._setStatus('Waiting for sign-in…', 'Polling in progress.');

        try {
            const result = await this._orchestrator.pollForPin(pin.id);
            if (token !== this._pollToken) {
                return;
            }
            this._stopElapsedTimer();
            this._setStatus('Signed in.', 'Continuing startup…');
            if (result.authToken) {
                this._renderPin(this._activeCode || pin.code);
            }
            this._setButtons({ request: false, cancel: false, retry: false });
        } catch (error) {
            if (token !== this._pollToken) {
                return;
            }
            this._stopElapsedTimer();
            this._handleError(error, 'PIN polling failed.');
            this._setButtons({ request: true, cancel: false, retry: true });
        }
    }

    private async _handleCancel(): Promise<void> {
        this._pollToken += 1;
        this._stopElapsedTimer();
        if (this._activePinId !== null) {
            await this._orchestrator.cancelPin(this._activePinId);
        }
        this._activePinId = null;
        this._activeCode = null;
        this._renderPin('----');
        this._setStatus('Cancelled.', 'Request a new PIN to continue.');
        this._setButtons({ request: true, cancel: false, retry: false });
    }

    private _setStatus(status: string, detail: string): void {
        this._statusEl.textContent = status;
        this._detailEl.textContent = detail;
    }

    private _setButtons(state: { request: boolean; cancel: boolean; retry: boolean }): void {
        this._requestButton.disabled = !state.request;
        this._cancelButton.disabled = !state.cancel;
        this._retryButton.style.display = state.retry ? 'inline-flex' : 'none';
    }

    private _renderPin(code: string): void {
        this._pinEl.textContent = code;
    }

    private _clearError(): void {
        this._errorEl.textContent = '';
    }

    private _handleError(error: unknown, fallback: string): void {
        if (error instanceof PlexApiError) {
            this._errorEl.textContent = `${error.code}: ${error.message}`;
            return;
        }
        const message = error instanceof Error ? error.message : fallback;
        this._errorEl.textContent = message;
    }

    private _startElapsedTimer(): void {
        this._stopElapsedTimer();
        this._elapsedTimer = window.setInterval(() => {
            if (this._pollStartedAt === null) {
                return;
            }
            const elapsed = Date.now() - this._pollStartedAt;
            const seconds = Math.floor(elapsed / 1000);
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            const formatted = `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
            this._detailEl.textContent = `Polling… ${formatted} elapsed.`;
        }, 1000);
    }

    private _stopElapsedTimer(): void {
        if (this._elapsedTimer !== null) {
            clearInterval(this._elapsedTimer);
            this._elapsedTimer = null;
        }
    }

    private _registerFocusables(): void {
        const nav = this._orchestrator.getNavigation();
        if (!nav) return;

        nav.registerFocusable({
            id: 'btn-auth-request',
            element: this._requestButton,
            neighbors: {
                right: 'btn-auth-cancel',
            },
        });

        nav.registerFocusable({
            id: 'btn-auth-cancel',
            element: this._cancelButton,
            neighbors: {
                left: 'btn-auth-request',
                right: 'btn-auth-retry',
            },
        });

        nav.registerFocusable({
            id: 'btn-auth-retry',
            element: this._retryButton,
            neighbors: {
                left: 'btn-auth-cancel',
            },
        });

        // Set initial focus
        if (!this._requestButton.disabled) {
            nav.setFocus('btn-auth-request');
        } else if (!this._cancelButton.disabled) {
            nav.setFocus('btn-auth-cancel');
        }
    }

    private _unregisterFocusables(): void {
        const nav = this._orchestrator.getNavigation();
        if (!nav) return;

        nav.unregisterFocusable('btn-auth-request');
        nav.unregisterFocusable('btn-auth-cancel');
        nav.unregisterFocusable('btn-auth-retry');
    }
}

