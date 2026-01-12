/**
 * @fileoverview Channel setup wizard screen.
 * @module modules/ui/channel-setup/ChannelSetupScreen
 * @version 1.0.0
 */

import { AppOrchestrator, type ChannelSetupConfig } from '../../../Orchestrator';
import { PLEX_DISCOVERY_CONSTANTS } from '../../plex/discovery/constants';
import type { PlexLibraryType } from '../../plex/library';
import type { FocusableElement } from '../../navigation';
import { safeLocalStorageGet } from '../../../utils/storage';

interface SetupStrategyState {
    collections: boolean;
    libraryFallback: boolean;
    playlists: boolean;
    genres: boolean;
    directors: boolean;
}

type SetupStep = 1 | 2 | 3;

export class ChannelSetupScreen {
    private _container: HTMLElement;
    private _orchestrator: AppOrchestrator;
    private _stepEl: HTMLElement;
    private _statusEl: HTMLElement;
    private _detailEl: HTMLElement;
    private _errorEl: HTMLElement;
    private _contentEl: HTMLElement;

    private _libraries: PlexLibraryType[] = [];
    private _selectedLibraryIds: Set<string> = new Set();
    private _strategies: SetupStrategyState = {
        collections: true,
        libraryFallback: true,
        playlists: false,
        genres: false,
        directors: false,
    };
    private _step: SetupStep = 1;
    private _focusableIds: string[] = [];
    private _isLoading: boolean = false;
    private _isBuilding: boolean = false;
    private _buildSummary: { created: number; skipped: number } | null = null;

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
        panel.className = 'screen-panel setup-panel';
        const title = document.createElement('h1');
        title.className = 'screen-title';
        title.textContent = 'Channel Setup';
        panel.appendChild(title);

        const subtitle = document.createElement('p');
        subtitle.className = 'screen-subtitle';
        subtitle.textContent = 'Build a clean, remote-first channel lineup for this server.';
        panel.appendChild(subtitle);

        const stepEl = document.createElement('div');
        stepEl.className = 'setup-step';
        panel.appendChild(stepEl);
        this._stepEl = stepEl;

        const status = document.createElement('div');
        status.className = 'screen-status';
        panel.appendChild(status);
        this._statusEl = status;

        const detail = document.createElement('div');
        detail.className = 'screen-detail';
        panel.appendChild(detail);
        this._detailEl = detail;

        const error = document.createElement('div');
        error.className = 'screen-error';
        panel.appendChild(error);
        this._errorEl = error;

        const content = document.createElement('div');
        content.className = 'setup-body';
        panel.appendChild(content);
        this._contentEl = content;

        this._container.appendChild(panel);
    }

    show(): void {
        this._container.style.display = 'flex';
        this._container.classList.add('visible');
        this._resetState();
        this._loadLibraries().catch(console.error);
    }

    hide(): void {
        this._unregisterFocusables();
        this._container.style.display = 'none';
        this._container.classList.remove('visible');
    }

    private _resetState(): void {
        this._step = 1;
        this._isLoading = false;
        this._isBuilding = false;
        this._buildSummary = null;
        this._errorEl.textContent = '';
    }

    private async _loadLibraries(): Promise<void> {
        if (this._isLoading) {
            return;
        }
        this._isLoading = true;
        this._statusEl.textContent = 'Loading libraries...';
        this._detailEl.textContent = '';
        this._errorEl.textContent = '';

        try {
            this._libraries = await this._orchestrator.getLibrariesForSetup();
            this._selectedLibraryIds = new Set(this._libraries.map((lib) => lib.id));
            this._renderStep();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to load libraries.';
            this._errorEl.textContent = message;
            this._statusEl.textContent = 'Library load failed.';
        } finally {
            this._isLoading = false;
        }
    }

    private _renderStep(): void {
        this._unregisterFocusables();
        this._contentEl.innerHTML = '';
        this._buildSummary = null;

        if (this._step === 1) {
            this._renderLibraryStep();
        } else if (this._step === 2) {
            this._renderStrategyStep();
        } else {
            this._renderBuildStep();
        }
    }

    private _renderLibraryStep(): void {
        this._stepEl.textContent = 'Step 1 of 3';
        this._statusEl.textContent = 'Select the libraries to include.';
        this._detailEl.textContent = '';

        const list = document.createElement('div');
        list.className = 'setup-list';

        if (this._libraries.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'setup-empty';
            empty.textContent = 'No movie or show libraries found.';
            list.appendChild(empty);
        }

        for (const library of this._libraries) {
            const isSelected = this._selectedLibraryIds.has(library.id);

            const button = document.createElement('button');
            button.id = `setup-lib-${library.id}`;
            button.className = `setup-toggle${isSelected ? ' selected' : ''}`;

            const label = document.createElement('span');
            label.className = 'setup-toggle-label';
            label.textContent = library.title;

            const meta = document.createElement('span');
            meta.className = 'setup-toggle-meta';
            meta.textContent = library.type === 'movie' ? 'Movies' : 'Shows';

            const state = document.createElement('span');
            state.className = 'setup-toggle-state';
            state.textContent = isSelected ? 'Selected' : 'Off';

            button.appendChild(label);
            button.appendChild(meta);
            button.appendChild(state);

            button.addEventListener('click', () => {
                if (this._selectedLibraryIds.has(library.id)) {
                    this._selectedLibraryIds.delete(library.id);
                } else {
                    this._selectedLibraryIds.add(library.id);
                }
                this._renderStep();
            });

            list.appendChild(button);
        }

        this._contentEl.appendChild(list);

        const actions = document.createElement('div');
        actions.className = 'button-row';

        const backButton = document.createElement('button');
        backButton.id = 'setup-back';
        backButton.className = 'screen-button secondary';
        backButton.textContent = 'Back';
        backButton.addEventListener('click', () => {
            this._orchestrator.openServerSelect();
        });
        actions.appendChild(backButton);

        const nextButton = document.createElement('button');
        nextButton.id = 'setup-next';
        nextButton.className = 'screen-button';
        nextButton.textContent = 'Next';
        nextButton.disabled = this._selectedLibraryIds.size === 0;
        nextButton.addEventListener('click', () => {
            if (this._selectedLibraryIds.size === 0) {
                return;
            }
            this._step = 2;
            this._renderStep();
        });
        actions.appendChild(nextButton);

        this._contentEl.appendChild(actions);

        const listButtons = Array.from(list.querySelectorAll<HTMLButtonElement>('button'));
        this._registerFocusables([...listButtons, backButton, nextButton]);

        this._detailEl.textContent = `Selected ${this._selectedLibraryIds.size} of ${this._libraries.length}.`;
    }

    private _renderStrategyStep(): void {
        this._stepEl.textContent = 'Step 2 of 3';
        this._statusEl.textContent = 'Choose channel types to build.';

        const list = document.createElement('div');
        list.className = 'setup-list';

        const strategyLabels: Array<{ key: keyof SetupStrategyState; label: string; detail: string }> = [
            { key: 'collections', label: 'Collections', detail: 'One channel per collection.' },
            { key: 'libraryFallback', label: 'Library fallback', detail: 'One channel per library if no collections.' },
            { key: 'playlists', label: 'Playlists', detail: 'Channels from Plex playlists.' },
            { key: 'genres', label: 'Genres', detail: 'Filter channels by genre.' },
            { key: 'directors', label: 'Directors', detail: 'Filter channels by director.' },
        ];

        for (const strategy of strategyLabels) {
            const isEnabled = this._strategies[strategy.key];
            const button = document.createElement('button');
            button.id = `setup-strategy-${strategy.key}`;
            button.className = `setup-toggle${isEnabled ? ' selected' : ''}`;

            const label = document.createElement('span');
            label.className = 'setup-toggle-label';
            label.textContent = strategy.label;

            const meta = document.createElement('span');
            meta.className = 'setup-toggle-meta';
            meta.textContent = strategy.detail;

            const state = document.createElement('span');
            state.className = 'setup-toggle-state';
            state.textContent = isEnabled ? 'On' : 'Off';

            button.appendChild(label);
            button.appendChild(meta);
            button.appendChild(state);

            button.addEventListener('click', () => {
                this._strategies[strategy.key] = !this._strategies[strategy.key];
                this._renderStep();
            });

            list.appendChild(button);
        }

        this._contentEl.appendChild(list);

        const actions = document.createElement('div');
        actions.className = 'button-row';

        const backButton = document.createElement('button');
        backButton.id = 'setup-back';
        backButton.className = 'screen-button secondary';
        backButton.textContent = 'Back';
        backButton.addEventListener('click', () => {
            this._step = 1;
            this._renderStep();
        });
        actions.appendChild(backButton);

        const nextButton = document.createElement('button');
        nextButton.id = 'setup-next';
        nextButton.className = 'screen-button';
        nextButton.textContent = 'Build';
        nextButton.addEventListener('click', () => {
            this._step = 3;
            this._renderStep();
        });
        actions.appendChild(nextButton);

        this._contentEl.appendChild(actions);

        const listButtons = Array.from(list.querySelectorAll<HTMLButtonElement>('button'));
        this._registerFocusables([...listButtons, backButton, nextButton]);

        if (this._strategies.genres || this._strategies.directors) {
            this._detailEl.textContent = 'Performance warning: may be slow on large libraries.';
        } else {
            this._detailEl.textContent = '';
        }
    }

    private _renderBuildStep(): void {
        this._stepEl.textContent = 'Step 3 of 3';
        this._statusEl.textContent = 'Building channels...';
        this._detailEl.textContent = '';
        this._errorEl.textContent = '';

        const summary = document.createElement('div');
        summary.className = 'setup-summary';
        summary.textContent = 'Preparing channel lineup.';
        this._contentEl.appendChild(summary);

        const actions = document.createElement('div');
        actions.className = 'button-row';

        const backButton = document.createElement('button');
        backButton.id = 'setup-back';
        backButton.className = 'screen-button secondary';
        backButton.textContent = 'Back';
        backButton.addEventListener('click', () => {
            if (this._isBuilding) {
                return;
            }
            this._step = 2;
            this._renderStep();
        });
        actions.appendChild(backButton);

        const doneButton = document.createElement('button');
        doneButton.id = 'setup-done';
        doneButton.className = 'screen-button';
        doneButton.textContent = 'Done';
        doneButton.disabled = true;
        doneButton.addEventListener('click', () => {
            if (this._isBuilding || !this._buildSummary || this._buildSummary.created === 0) {
                return;
            }
            const nav = this._orchestrator.getNavigation();
            if (nav) {
                nav.goTo('player');
            }
            this._orchestrator.switchToChannelByNumber(1).catch(console.error);
        });
        actions.appendChild(doneButton);

        this._contentEl.appendChild(actions);

        this._registerFocusables([backButton, doneButton]);

        this._startBuild(summary, doneButton).catch(console.error);
    }

    private async _startBuild(summaryEl: HTMLElement, doneButton: HTMLButtonElement): Promise<void> {
        if (this._isBuilding) {
            return;
        }
        this._isBuilding = true;
        this._statusEl.textContent = 'Building channels...';
        summaryEl.textContent = 'Scanning libraries and building channels.';

        const serverId = this._getSelectedServerId();
        if (!serverId) {
            this._errorEl.textContent = 'No server selected.';
            this._statusEl.textContent = 'Setup unavailable.';
            this._isBuilding = false;
            return;
        }

        const config: ChannelSetupConfig = {
            serverId,
            selectedLibraryIds: Array.from(this._selectedLibraryIds),
            enabledStrategies: { ...this._strategies },
        };

        try {
            const result = await this._orchestrator.createChannelsFromSetup(config);
            this._orchestrator.markSetupComplete(serverId, config);
            this._buildSummary = result;
            summaryEl.textContent = `Created ${result.created} channels. Skipped ${result.skipped} libraries.`;
            this._statusEl.textContent = 'Channels ready.';
            doneButton.disabled = result.created === 0;
            if (result.created === 0) {
                this._detailEl.textContent = 'No channels were created. Adjust your selections.';
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to build channels.';
            this._errorEl.textContent = message;
            this._statusEl.textContent = 'Channel build failed.';
            summaryEl.textContent = 'Unable to create channels.';
        } finally {
            this._isBuilding = false;
            const nav = this._orchestrator.getNavigation();
            if (nav && !doneButton.disabled) {
                nav.setFocus(doneButton.id);
            }
        }
    }

    private _getSelectedServerId(): string | null {
        const stored = safeLocalStorageGet(PLEX_DISCOVERY_CONSTANTS.SELECTED_SERVER_KEY);
        if (stored) {
            return stored;
        }
        return this._orchestrator.getSelectedServerId();
    }

    private _registerFocusables(buttons: HTMLElement[]): void {
        const nav = this._orchestrator.getNavigation();
        if (!nav) {
            return;
        }

        const focusableButtons = buttons.filter(
            (button): button is HTMLButtonElement =>
                button instanceof HTMLButtonElement && !button.disabled
        );

        this._focusableIds = focusableButtons.map((button) => button.id);

        for (const [index, button] of focusableButtons.entries()) {
            const focusable: FocusableElement = {
                id: button.id,
                element: button,
                neighbors: {},
            };
            const up = index > 0 ? focusableButtons[index - 1] : undefined;
            if (up) {
                focusable.neighbors.up = up.id;
            }
            const down = index < focusableButtons.length - 1 ? focusableButtons[index + 1] : undefined;
            if (down) {
                focusable.neighbors.down = down.id;
            }
            nav.registerFocusable(focusable);
        }

        const first = focusableButtons[0];
        if (first) {
            nav.setFocus(first.id);
        }
    }

    private _unregisterFocusables(): void {
        const nav = this._orchestrator.getNavigation();
        if (!nav) {
            return;
        }
        for (const id of this._focusableIds) {
            nav.unregisterFocusable(id);
        }
        this._focusableIds = [];
    }
}
