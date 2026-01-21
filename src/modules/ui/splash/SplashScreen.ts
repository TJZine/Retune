/**
 * @fileoverview Splash screen shown during startup.
 * @module modules/ui/splash/SplashScreen
 * @version 2.0.0
 */

import './styles.css';

export class SplashScreen {
    private _container: HTMLElement;
    private _statusElement: HTMLElement | null = null;

    constructor(container: HTMLElement) {
        this._container = container;
        this._buildUI();
    }

    private _buildUI(): void {
        this._container.className = 'splash-screen screen';
        this._container.innerHTML = '';

        const crtContainer = document.createElement('div');
        crtContainer.className = 'splash-crt-container';

        const content = document.createElement('div');
        content.className = 'splash-content';

        const title = document.createElement('h1');
        title.className = 'splash-title screen-title';
        title.textContent = 'RETUNE';

        const subtitle = document.createElement('p');
        subtitle.className = 'splash-subtitle screen-subtitle';
        subtitle.textContent = 'Warming up Plex, loading channels...';

        const status = document.createElement('div');
        status.className = 'splash-status screen-status';
        status.textContent = 'Starting up…';
        this._statusElement = status;

        content.appendChild(title);
        content.appendChild(subtitle);
        content.appendChild(status);
        crtContainer.appendChild(content);
        this._container.appendChild(crtContainer);
    }

    public updateStatus(text: string): void {
        if (this._statusElement) {
            this._statusElement.textContent = text;
        }
    }

    public show(): void {
        this._container.style.display = 'none';
        void this._container.offsetHeight;
        this._container.style.display = '';
        this._container.classList.add('visible');
    }

    public hide(): void {
        this._container.classList.remove('visible');
    }
}
