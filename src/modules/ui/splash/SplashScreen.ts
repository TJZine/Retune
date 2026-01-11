/**
 * @fileoverview Minimal splash screen shown during startup.
 * @module modules/ui/splash/SplashScreen
 * @version 1.0.0
 */

export class SplashScreen {
    private _container: HTMLElement;

    constructor(container: HTMLElement) {
        this._container = container;
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
        title.textContent = 'Retune';
        panel.appendChild(title);

        const subtitle = document.createElement('p');
        subtitle.className = 'screen-subtitle';
        subtitle.textContent = 'Warming up Plex, loading channels, and getting ready.';
        panel.appendChild(subtitle);

        const status = document.createElement('div');
        status.className = 'screen-status';
        status.textContent = 'Starting up…';
        panel.appendChild(status);

        this._container.appendChild(panel);
    }

    show(): void {
        this._container.style.display = 'flex';
        this._container.classList.add('visible');
    }

    hide(): void {
        this._container.style.display = 'none';
        this._container.classList.remove('visible');
    }
}
