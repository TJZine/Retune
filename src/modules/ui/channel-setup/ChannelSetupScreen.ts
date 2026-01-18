/**
 * @fileoverview Channel setup wizard screen.
 * @module modules/ui/channel-setup/ChannelSetupScreen
 * @version 1.0.0
 */

import { AppOrchestrator, type ChannelSetupConfig, type ChannelBuildProgress } from '../../../Orchestrator';
import { PLEX_DISCOVERY_CONSTANTS } from '../../plex/discovery/constants';
import type { PlexLibraryType } from '../../plex/library';
import type { FocusableElement } from '../../navigation';
import { safeLocalStorageGet } from '../../../utils/storage';
import { DEFAULT_CHANNEL_SETUP_MAX, MAX_CHANNELS } from '../../scheduler/channel-manager/constants';

const CHANNEL_LIMIT_PRESETS = [50, 100, 150, 200, 300, 400, 500];

interface SetupStrategyState {
    collections: boolean;
    libraryFallback: boolean;
    playlists: boolean;
    genres: boolean;
    directors: boolean;
    decades: boolean;
    runtimeRanges: boolean;
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
        decades: false,
        runtimeRanges: false,
    };
    private _maxChannels: number = DEFAULT_CHANNEL_SETUP_MAX;
    private _minItems: number = 10;
    private _channelLimitOptions: number[] = CHANNEL_LIMIT_PRESETS.filter((value) => value <= MAX_CHANNELS);
    private _minItemsOptions: number[] = [1, 5, 10, 20, 50];
    private _buildAbortController: AbortController | null = null;
    private _step: SetupStep = 1;
    private _focusableIds: string[] = [];
    private _preferredFocusId: string | null = null;
    private _isLoading: boolean = false;
    private _isBuilding: boolean = false;
    private _visibilityToken = 0;

    private _toDomId(raw: string): string {
        return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    constructor(container: HTMLElement, orchestrator: AppOrchestrator) {
        this._container = container;
        this._orchestrator = orchestrator;

        if (!this._channelLimitOptions.includes(DEFAULT_CHANNEL_SETUP_MAX)) {
            this._channelLimitOptions.push(DEFAULT_CHANNEL_SETUP_MAX);
            this._channelLimitOptions.sort((a, b) => a - b);
        }

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
        this._visibilityToken += 1;
        this._container.style.display = 'flex';
        this._container.classList.add('visible');
        this._resetState();
        this._loadLibraries().catch(console.error);
    }

    hide(): void {
        this._visibilityToken += 1;
        this._unregisterFocusables();
        this._container.style.display = 'none';
        this._container.classList.remove('visible');
    }

    private _resetState(): void {
        this._step = 1;
        this._isLoading = false;
        this._isBuilding = false;
        this._maxChannels = DEFAULT_CHANNEL_SETUP_MAX;
        this._errorEl.textContent = '';
    }

    private async _loadLibraries(): Promise<void> {
        const token = this._visibilityToken;
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
            if (token !== this._visibilityToken) {
                return;
            }
            this._renderStep();
        } catch (error) {
            if (token !== this._visibilityToken) {
                return;
            }
            const message = error instanceof Error ? error.message : 'Unable to load libraries.';
            this._errorEl.textContent = message;
            this._statusEl.textContent = 'Library load failed.';
        } finally {
            this._isLoading = false;
        }
    }

    private _renderStep(): void {
        const token = this._visibilityToken;
        const nav = this._orchestrator.getNavigation();
        const focusedId = nav?.getFocusedElement()?.id ?? null;
        if (focusedId && this._preferredFocusId === null) {
            this._preferredFocusId = focusedId;
        }
        this._unregisterFocusables();
        if (token !== this._visibilityToken) {
            return;
        }
        this._contentEl.innerHTML = '';
        this._contentEl.innerHTML = '';

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
            button.id = `setup-lib-${this._toDomId(library.id)}`;
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
                this._preferredFocusId = button.id;
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
            { key: 'decades', label: 'Decades', detail: 'Channels by decade (1980s, 1990s...).' },
            { key: 'runtimeRanges', label: 'Runtime', detail: 'Channels by duration (<30m, 30-60m...).' },
            { key: 'genres', label: 'Genres', detail: 'Filter channels by genre.' },
            { key: 'directors', label: 'Directors', detail: 'Filter channels by director.' },
        ];

        for (const strategy of strategyLabels) {
            const isEnabled = this._strategies[strategy.key];
            const button = document.createElement('button');
            button.id = `setup-strategy-${this._toDomId(String(strategy.key))}`;
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
                this._preferredFocusId = button.id;
                this._strategies[strategy.key] = !this._strategies[strategy.key];
                this._renderStep();
            });

            list.appendChild(button);
        }

        const maxButton = document.createElement('button');
        maxButton.id = 'setup-max-channels';
        maxButton.className = 'setup-toggle';

        const maxLabel = document.createElement('span');
        maxLabel.className = 'setup-toggle-label';
        maxLabel.textContent = 'Max channels';

        const maxMeta = document.createElement('span');
        maxMeta.className = 'setup-toggle-meta';
        maxMeta.textContent = `Default ${DEFAULT_CHANNEL_SETUP_MAX}. Limit up to ${MAX_CHANNELS}.`;

        const maxState = document.createElement('span');
        maxState.className = 'setup-toggle-state';
        maxState.textContent = String(this._maxChannels);

        maxButton.appendChild(maxLabel);
        maxButton.appendChild(maxMeta);
        maxButton.appendChild(maxState);

        maxButton.addEventListener('click', () => {
            this._preferredFocusId = maxButton.id;
            const currentIndex = this._channelLimitOptions.indexOf(this._maxChannels);
            const nextIndex = currentIndex >= 0
                ? (currentIndex + 1) % this._channelLimitOptions.length
                : 0;
            this._maxChannels = this._channelLimitOptions[nextIndex] ?? DEFAULT_CHANNEL_SETUP_MAX;
            this._renderStep();
        });

        list.appendChild(maxButton);

        const minItemsButton = document.createElement('button');
        minItemsButton.id = 'setup-min-items';
        minItemsButton.className = 'setup-toggle';

        const minItemsLabel = document.createElement('span');
        minItemsLabel.className = 'setup-toggle-label';
        minItemsLabel.textContent = 'Min items';

        const minItemsMeta = document.createElement('span');
        minItemsMeta.className = 'setup-toggle-meta';
        minItemsMeta.textContent = 'Minimum content items per channel.';

        const minItemsState = document.createElement('span');
        minItemsState.className = 'setup-toggle-state';
        minItemsState.textContent = String(this._minItems);

        minItemsButton.appendChild(minItemsLabel);
        minItemsButton.appendChild(minItemsMeta);
        minItemsButton.appendChild(minItemsState);

        minItemsButton.addEventListener('click', () => {
            this._preferredFocusId = minItemsButton.id;
            const currentIndex = this._minItemsOptions.indexOf(this._minItems);
            const nextIndex = currentIndex >= 0
                ? (currentIndex + 1) % this._minItemsOptions.length
                : 2; // Default to 10 if not found
            this._minItems = this._minItemsOptions[nextIndex] ?? 10;
            this._renderStep();
        });

        list.appendChild(minItemsButton);

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

        const progressContainer = document.createElement('div');
        progressContainer.className = 'setup-progress-container';

        // Progress Bar
        const barContainer = document.createElement('div');
        barContainer.className = 'setup-progress-bar-bg';
        const barFill = document.createElement('div');
        barFill.className = 'setup-progress-bar-fill';
        barContainer.appendChild(barFill);
        progressContainer.appendChild(barContainer);

        // Task Name
        const taskLabel = document.createElement('div');
        taskLabel.className = 'setup-progress-task';
        taskLabel.textContent = 'Initializing...';
        progressContainer.appendChild(taskLabel);

        // Detail
        const detailLabel = document.createElement('div');
        detailLabel.className = 'setup-progress-detail';
        detailLabel.textContent = 'Please wait';
        progressContainer.appendChild(detailLabel);

        this._contentEl.appendChild(progressContainer);

        const actions = document.createElement('div');
        actions.className = 'button-row';

        const backButton = document.createElement('button');
        backButton.id = 'setup-back';
        backButton.className = 'screen-button secondary';
        backButton.textContent = 'Cancel'; // Becomes Cancel during build
        backButton.addEventListener('click', () => {
            if (this._isBuilding) {
                // Cancel Build
                this._buildAbortController?.abort();
                backButton.disabled = true;
                backButton.textContent = 'Canceling...';
                return;
            }
            // If done or error, it acts as Back/Reset
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
            const nav = this._orchestrator.getNavigation();
            if (nav) {
                nav.goTo('player');
            }
            this._orchestrator.switchToChannelByNumber(1)
                .then(() => this._orchestrator.openEPG())
                .catch(console.error);
        });
        actions.appendChild(doneButton);

        this._contentEl.appendChild(actions);

        this._registerFocusables([backButton, doneButton]);

        // Start build
        this._startBuild(backButton, doneButton, barFill, taskLabel, detailLabel).catch(console.error);
    }

    private async _startBuild(
        cancelButton: HTMLButtonElement,
        doneButton: HTMLButtonElement,
        barFill: HTMLElement,
        taskLabel: HTMLElement,
        detailLabel: HTMLElement
    ): Promise<void> {
        const token = this._visibilityToken;
        if (this._isBuilding) return;

        this._isBuilding = true;
        this._buildAbortController = new AbortController();

        const serverId = this._getSelectedServerId();
        if (!serverId) {
            this._errorEl.textContent = 'No server selected.';
            this._isBuilding = false;
            return;
        }

        const config: ChannelSetupConfig = {
            serverId,
            selectedLibraryIds: Array.from(this._selectedLibraryIds),
            maxChannels: this._maxChannels,
            enabledStrategies: { ...this._strategies },
            minItemsPerChannel: this._minItems,
        };

        const updateUI = (p: ChannelBuildProgress): void => {
            if (token !== this._visibilityToken) return;
            taskLabel.textContent = p.label;
            detailLabel.textContent = p.detail;

            if (p.total !== null && p.total > 0) {
                const percent = Math.min(100, (p.current / p.total) * 100);
                barFill.style.width = `${percent}%`;
                barFill.classList.remove('indeterminate');
            } else {
                // Indeterminate
                barFill.style.width = '100%';
                barFill.classList.add('indeterminate');
            }
        };

        try {
            const result = await this._orchestrator.createChannelsFromSetup(config, {
                signal: this._buildAbortController.signal,
                onProgress: updateUI
            });

            if (token !== this._visibilityToken) return;

            if (token !== this._visibilityToken) return;

            if (result.canceled) {
                this._statusEl.textContent = 'Canceled.';
                this._detailEl.textContent = 'No changes were applied.';
                taskLabel.textContent = 'Canceled';
                detailLabel.textContent = '';
                barFill.style.width = '0%';

                cancelButton.disabled = false;
                cancelButton.textContent = 'Back';
                cancelButton.focus();
            } else {
                this._orchestrator.markSetupComplete(serverId, config);
                this._statusEl.textContent = 'Channels ready.';
                taskLabel.textContent = 'Complete';
                detailLabel.textContent = `Created ${result.created} channels. Skipped ${result.skipped}.`;
                barFill.style.width = '100%';
                barFill.classList.remove('indeterminate');

                doneButton.disabled = result.created === 0;
                cancelButton.textContent = 'Back'; // Allow going back to modify?
                // Usually Done is the way forward.

                if (result.created === 0) {
                    this._detailEl.textContent = 'No channels created.';
                }
                this._unregisterFocusables();
                this._registerFocusables([doneButton, cancelButton]); // Done is primary

                const nav = this._orchestrator.getNavigation();
                if (nav && !doneButton.disabled) {
                    nav.setFocus(doneButton.id);
                } else {
                    nav?.setFocus(cancelButton.id);
                }
            }

        } catch (error) {
            if (token !== this._visibilityToken) return;
            const message = error instanceof Error ? error.message : 'Build failed.';
            this._errorEl.textContent = message;
            this._statusEl.textContent = 'Error';
            cancelButton.disabled = false;
            cancelButton.textContent = 'Back';
        } finally {
            this._isBuilding = false;
            this._buildAbortController = null;
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

        const preferred = this._preferredFocusId;
        if (preferred && focusableButtons.some((button) => button.id === preferred)) {
            nav.setFocus(preferred);
            this._preferredFocusId = null;
            return;
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
