/**
 * @fileoverview Channel setup wizard screen.
 * @module modules/ui/channel-setup/ChannelSetupScreen
 * @version 1.0.0
 */

import {
    AppOrchestrator,
    type ChannelSetupConfig,
    type ChannelBuildProgress,
    type ChannelSetupPreview,
    type ChannelSetupReview,
    type ChannelSetupRecord,
} from '../../../Orchestrator';
import { PLEX_DISCOVERY_CONSTANTS } from '../../plex/discovery/constants';
import type { PlexLibraryType } from '../../plex/library';
import type { FocusableElement, KeyEvent } from '../../navigation';
import { safeLocalStorageGet } from '../../../utils/storage';
import { DEFAULT_CHANNEL_SETUP_MAX, MAX_CHANNELS } from '../../scheduler/channel-manager/constants';

const CHANNEL_LIMIT_PRESETS = [50, 100, 150, 200, 300, 400, 500];
const DEFAULT_MIN_ITEMS = 10;

interface SetupStrategyState {
    collections: boolean;
    libraryFallback: boolean;
    playlists: boolean;
    genres: boolean;
    directors: boolean;
    decades: boolean;
    recentlyAdded: boolean;
    studios: boolean;
    actors: boolean;
}

type SetupStep = 1 | 2 | 3;
type StrategyAccordionKey = 'contentSources' | 'advancedSources' | 'buildOptions' | 'limits';

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
        recentlyAdded: false,
        studios: false,
        actors: false,
    };
    private _strategyAccordions = ChannelSetupScreen._defaultStrategyAccordions();
    private _buildMode: ChannelSetupConfig['buildMode'] = 'replace';
    private _actorStudioCombineMode: ChannelSetupConfig['actorStudioCombineMode'] = 'separate';
    private _maxChannels: number = DEFAULT_CHANNEL_SETUP_MAX;
    private _minItems: number = DEFAULT_MIN_ITEMS;
    private _channelLimitOptions: number[] = CHANNEL_LIMIT_PRESETS.filter((value) => value <= MAX_CHANNELS);
    private _minItemsOptions: number[] = [1, 5, 10, 20, 50];
    private _buildAbortController: AbortController | null = null;
    private _previewAbortController: AbortController | null = null;
    private _reviewAbortController: AbortController | null = null;
    private _previewTimeoutId: number | null = null;
    private _step: SetupStep = 1;
    private _focusableIds: string[] = [];
    private _preferredFocusId: string | null = null;
    private _isLoading: boolean = false;
    private _isBuilding: boolean = false;
    private _isPreviewLoading: boolean = false;
    private _isReviewLoading: boolean = false;
    private _replaceConfirm: boolean = false;
    private _visibilityToken = 0;
    private _navKeyHandler: ((event: KeyEvent) => void) | null = null;
    private _preview: ChannelSetupPreview | null = null;
    private _previewError: string | null = null;
    private _review: ChannelSetupReview | null = null;
    private _reviewError: string | null = null;
    private _lastPreviewKey: string | null = null;
    private _pendingPreviewKey: string | null = null;
    private _previewPanelHeightPx: number | null = null;
    private _previewPanelId = 'setup-preview-panel';
    private _maxPreviewWarnings = 5;

    private static _defaultStrategyAccordions(): Record<StrategyAccordionKey, boolean> {
        return {
            contentSources: true,
            advancedSources: false,
            buildOptions: true,
            limits: false,
        };
    }

    private _getNearestOptionIndex(options: number[], current: number): number {
        if (options.length === 0) return -1;
        let nearestIndex = 0;
        let smallestDiff = Math.abs(options[0] - current);
        for (let i = 1; i < options.length; i++) {
            const diff = Math.abs(options[i] - current);
            if (diff < smallestDiff) {
                smallestDiff = diff;
                nearestIndex = i;
            }
        }
        return nearestIndex;
    }

    private _stepPreset(
        options: number[],
        current: number,
        dir: 'left' | 'right',
        mode: 'clamp' | 'wrap'
    ): number {
        if (options.length === 0) return current;
        const currentIndex = options.indexOf(current);
        const baseIndex = currentIndex >= 0 ? currentIndex : this._getNearestOptionIndex(options, current);
        const lastIndex = options.length - 1;
        const nextIndex = mode === 'wrap'
            ? dir === 'left'
                ? (baseIndex - 1 + options.length) % options.length
                : (baseIndex + 1) % options.length
            : dir === 'left'
                ? Math.max(0, baseIndex - 1)
                : Math.min(lastIndex, baseIndex + 1);
        return options[nextIndex] ?? current;
    }

    private _toDomId(raw: string): string {
        return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    private _clampPreviewHeight(measuredHeight: number): number {
        const minHeight = 180;
        const viewportHeight = window.innerHeight || 720;
        const maxHeight = Math.max(minHeight, Math.floor(viewportHeight * 0.35));
        const clamped = Math.min(Math.max(measuredHeight, minHeight), maxHeight);
        return clamped;
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
        const nav = this._orchestrator.getNavigation();
        if (nav && !this._navKeyHandler) {
            this._navKeyHandler = (event: KeyEvent): void => {
                if (event.handled || this._step !== 2) return;
                const focusedId = nav.getFocusedElement()?.id;
                if (focusedId !== 'setup-max-channels' && focusedId !== 'setup-min-items') {
                    return;
                }
                const direction = event.button === 'left'
                    ? 'left'
                    : event.button === 'right'
                        ? 'right'
                        : null;
                if (!direction) return;

                if (focusedId === 'setup-max-channels') {
                    this._maxChannels = this._stepPreset(this._channelLimitOptions, this._maxChannels, direction, 'clamp');
                } else {
                    this._minItems = this._stepPreset(this._minItemsOptions, this._minItems, direction, 'clamp');
                }
                event.handled = true;
                this._preferredFocusId = focusedId;
                this._review = null;
                this._reviewError = null;
                this._schedulePreview();
                this._renderStep();
            };
            nav.on('keyPress', this._navKeyHandler);
        }
        this._resetState();
        this._loadLibraries().catch(console.error);
    }

    hide(): void {
        this._visibilityToken += 1;
        this._buildAbortController?.abort();
        this._previewAbortController?.abort();
        this._reviewAbortController?.abort();
        if (this._previewTimeoutId !== null) {
            window.clearTimeout(this._previewTimeoutId);
            this._previewTimeoutId = null;
        }
        if (this._navKeyHandler) {
            const nav = this._orchestrator.getNavigation();
            nav?.off('keyPress', this._navKeyHandler);
            this._navKeyHandler = null;
        }
        this._unregisterFocusables();
        this._container.style.display = 'none';
        this._container.classList.remove('visible');
    }

    private _resetState(): void {
        this._buildAbortController?.abort();
        this._previewAbortController?.abort();
        this._reviewAbortController?.abort();
        if (this._previewTimeoutId !== null) {
            window.clearTimeout(this._previewTimeoutId);
            this._previewTimeoutId = null;
        }
        this._buildAbortController = null;
        this._previewAbortController = null;
        this._reviewAbortController = null;
        this._step = 1;
        this._isLoading = false;
        this._isBuilding = false;
        this._isPreviewLoading = false;
        this._isReviewLoading = false;
        this._replaceConfirm = false;
        this._maxChannels = DEFAULT_CHANNEL_SETUP_MAX;
        this._minItems = DEFAULT_MIN_ITEMS;
        this._buildMode = 'replace';
        this._actorStudioCombineMode = 'separate';
        this._strategyAccordions = ChannelSetupScreen._defaultStrategyAccordions();
        this._preview = null;
        this._previewError = null;
        this._review = null;
        this._reviewError = null;
        this._lastPreviewKey = null;
        this._pendingPreviewKey = null;
        this._previewPanelHeightPx = null;
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
            const serverId = this._getSelectedServerId();
            const record = serverId ? this._orchestrator.getChannelSetupRecord(serverId) : null;
            if (record) {
                this._applySetupRecord(record);
            } else {
                this._selectedLibraryIds = new Set(this._libraries.map((lib) => lib.id));
            }
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

        const scroll = document.createElement('div');
        scroll.className = 'setup-scroll';

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
                this._review = null;
                this._reviewError = null;
                this._replaceConfirm = false;
                this._renderStep();
            });

            list.appendChild(button);
        }

        scroll.appendChild(list);
        this._contentEl.appendChild(scroll);

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

        const scroll = document.createElement('div');
        scroll.className = 'setup-scroll';

        const list = document.createElement('div');
        list.className = 'setup-list';
        list.classList.add('setup-accordion-list');

        const focusableButtons: HTMLButtonElement[] = [];

        const createAccordionSection = (options: {
            key: string;
            stateKey: StrategyAccordionKey;
            title: string;
            countText?: string;
            summaryText?: string;
            buttons: HTMLButtonElement[];
        }): void => {
            const expanded = this._strategyAccordions[options.stateKey];
            const section = document.createElement('div');
            section.className = 'setup-accordion-section';

            const header = document.createElement('button');
            header.id = `setup-accordion-${options.key}`;
            header.className = 'setup-toggle setup-accordion-header';

            const indicator = document.createElement('span');
            indicator.className = 'setup-accordion-indicator';
            indicator.textContent = expanded ? '▼' : '►';

            const title = document.createElement('span');
            title.className = 'setup-accordion-title';
            title.textContent = options.title;

            header.appendChild(indicator);
            header.appendChild(title);

            if (options.countText) {
                const count = document.createElement('span');
                count.className = 'setup-accordion-count';
                count.textContent = options.countText;
                header.appendChild(count);
            } else if (options.summaryText) {
                const summary = document.createElement('span');
                summary.className = 'setup-accordion-summary';
                summary.textContent = options.summaryText;
                header.appendChild(summary);
            }

            header.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            header.setAttribute('aria-controls', `setup-accordion-${options.key}-body`);

            header.addEventListener('click', () => {
                this._preferredFocusId = header.id;
                this._strategyAccordions[options.stateKey] = !expanded;
                this._renderStep();
            });

            section.appendChild(header);

            const body = document.createElement('div');
            body.className = 'setup-accordion-body';
            body.id = `setup-accordion-${options.key}-body`;
            body.hidden = !expanded;
            body.setAttribute('role', 'region');
            body.setAttribute('aria-labelledby', header.id);

            for (const button of options.buttons) {
                body.appendChild(button);
            }

            section.appendChild(body);
            list.appendChild(section);

            focusableButtons.push(header);
            if (expanded) {
                focusableButtons.push(...options.buttons);
            }
        };

        const buildModeButton = document.createElement('button');
        buildModeButton.id = 'setup-build-mode';
        buildModeButton.className = 'setup-toggle';

        const buildModeLabel = document.createElement('span');
        buildModeLabel.className = 'setup-toggle-label';
        buildModeLabel.textContent = 'Build mode';

        const buildModeMeta = document.createElement('span');
        buildModeMeta.className = 'setup-toggle-meta';
        buildModeMeta.textContent = 'Replace, append, or merge with your lineup.';

        const buildModeState = document.createElement('span');
        buildModeState.className = 'setup-toggle-state';
        buildModeState.textContent = this._buildMode.charAt(0).toUpperCase() + this._buildMode.slice(1);

        buildModeButton.appendChild(buildModeLabel);
        buildModeButton.appendChild(buildModeMeta);
        buildModeButton.appendChild(buildModeState);

        buildModeButton.addEventListener('click', () => {
            this._preferredFocusId = buildModeButton.id;
            const modes: ChannelSetupConfig['buildMode'][] = ['replace', 'append', 'merge'];
            const currentIndex = modes.indexOf(this._buildMode);
            const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % modes.length : 0;
            this._buildMode = modes[nextIndex] ?? 'replace';
            this._replaceConfirm = false;
            this._review = null;
            this._reviewError = null;
            this._schedulePreview();
            this._renderStep();
        });

        const combineButton = document.createElement('button');
        combineButton.id = 'setup-combine-mode';
        combineButton.className = 'setup-toggle';

        const combineLabel = document.createElement('span');
        combineLabel.className = 'setup-toggle-label';
        combineLabel.textContent = 'Actor/Studio combine';

        const combineMeta = document.createElement('span');
        combineMeta.className = 'setup-toggle-meta';
        combineMeta.textContent = 'Separate movies + TV or combine together.';

        const combineState = document.createElement('span');
        combineState.className = 'setup-toggle-state';
        combineState.textContent = this._actorStudioCombineMode === 'combined' ? 'Combined' : 'Separate';

        combineButton.appendChild(combineLabel);
        combineButton.appendChild(combineMeta);
        combineButton.appendChild(combineState);

        combineButton.addEventListener('click', () => {
            this._preferredFocusId = combineButton.id;
            this._actorStudioCombineMode = this._actorStudioCombineMode === 'combined' ? 'separate' : 'combined';
            this._review = null;
            this._reviewError = null;
            this._schedulePreview();
            this._renderStep();
        });

        const strategyLabels: Array<{ key: keyof SetupStrategyState; label: string; detail: string }> = [
            { key: 'collections', label: 'Collections', detail: 'One channel per collection.' },
            { key: 'libraryFallback', label: 'Library fallback', detail: 'One channel per library if no collections.' },
            { key: 'playlists', label: 'Playlists', detail: 'Channels from Plex playlists.' },
            { key: 'recentlyAdded', label: 'Recently added', detail: 'Per library, newest first.' },
            { key: 'genres', label: 'Genres', detail: 'Filter channels by genre.' },
            { key: 'directors', label: 'Directors', detail: 'Filter channels by director.' },
            { key: 'decades', label: 'Decades', detail: 'Channels by decade (1980s, 1990s...).' },
            { key: 'studios', label: 'Studios', detail: 'Channels by studio (Movies/TV).' },
            { key: 'actors', label: 'Actors', detail: 'Channels by actor (Movies/TV).' },
        ];

        const createStrategyButton = (strategy: typeof strategyLabels[number]): HTMLButtonElement => {
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
                this._review = null;
                this._reviewError = null;
                this._schedulePreview();
                this._renderStep();
            });

            return button;
        };

        const contentStrategies = ['collections', 'libraryFallback', 'playlists', 'recentlyAdded'] as const;
        const advancedStrategies = ['genres', 'directors', 'decades', 'studios', 'actors'] as const;

        const contentButtons = strategyLabels
            .filter((strategy) => contentStrategies.includes(strategy.key as (typeof contentStrategies)[number]))
            .map(createStrategyButton);
        const advancedButtons = strategyLabels
            .filter((strategy) => advancedStrategies.includes(strategy.key as (typeof advancedStrategies)[number]))
            .map(createStrategyButton);

        const maxButton = document.createElement('button');
        maxButton.id = 'setup-max-channels';
        maxButton.className = 'setup-toggle setup-toggle--adjustable';

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
            this._maxChannels = this._stepPreset(this._channelLimitOptions, this._maxChannels, 'right', 'wrap');
            this._review = null;
            this._reviewError = null;
            this._schedulePreview();
            this._renderStep();
        });

        const minItemsButton = document.createElement('button');
        minItemsButton.id = 'setup-min-items';
        minItemsButton.className = 'setup-toggle setup-toggle--adjustable';

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
            this._minItems = this._stepPreset(this._minItemsOptions, this._minItems, 'right', 'wrap');
            this._review = null;
            this._reviewError = null;
            this._schedulePreview();
            this._renderStep();
        });

        const contentEnabledCount = contentStrategies.filter((key) => this._strategies[key]).length;
        const advancedEnabledCount = advancedStrategies.filter((key) => this._strategies[key]).length;
        const contentTotal = contentStrategies.length;
        const advancedTotal = advancedStrategies.length;
        const buildSummary = `Build mode: ${this._buildMode.charAt(0).toUpperCase()}${this._buildMode.slice(1)} • Combine: ${
            this._actorStudioCombineMode === 'combined' ? 'Combined' : 'Separate'
        }`;
        const limitsSummary = `Max: ${this._maxChannels} • Min: ${this._minItems}`;

        createAccordionSection({
            key: 'content-sources',
            stateKey: 'contentSources',
            title: 'Content Sources',
            countText: `(${contentEnabledCount} of ${contentTotal} enabled)`,
            buttons: contentButtons,
        });

        createAccordionSection({
            key: 'advanced-sources',
            stateKey: 'advancedSources',
            title: 'Advanced Sources',
            countText: `(${advancedEnabledCount} of ${advancedTotal} enabled)`,
            buttons: advancedButtons,
        });

        createAccordionSection({
            key: 'build-options',
            stateKey: 'buildOptions',
            title: 'Build Options',
            summaryText: buildSummary,
            buttons: [buildModeButton, combineButton],
        });

        createAccordionSection({
            key: 'limits',
            stateKey: 'limits',
            title: 'Limits',
            summaryText: limitsSummary,
            buttons: [maxButton, minItemsButton],
        });

        scroll.appendChild(list);

        const previewPanel = document.createElement('div');
        previewPanel.id = this._previewPanelId;
        previewPanel.className = 'setup-preview';
        if (this._previewPanelHeightPx !== null) {
            const height = `${this._previewPanelHeightPx}px`;
            previewPanel.style.minHeight = height;
            previewPanel.style.maxHeight = height;
            previewPanel.style.overflowY = 'auto';
        }

        const previewTitle = document.createElement('div');
        previewTitle.className = 'setup-preview-title';
        previewTitle.textContent = 'Estimate';
        previewPanel.appendChild(previewTitle);

        if (this._previewError) {
            const error = document.createElement('div');
            error.className = 'setup-preview-warning';
            error.textContent = this._previewError;
            previewPanel.appendChild(error);
        } else if (this._preview) {
            // Render existing preview (even while loading new one)
            const { estimates, warnings, reachedMaxChannels } = this._preview;

            const rows = document.createElement('div');
            rows.className = 'setup-preview-rows';
            rows.appendChild(this._buildPreviewRow('Total planned', estimates.total));
            rows.appendChild(this._buildPreviewRow('Collections', estimates.collections));
            rows.appendChild(this._buildPreviewRow('Library fallback', estimates.libraryFallback));
            rows.appendChild(this._buildPreviewRow('Recently added', estimates.recentlyAdded));
            rows.appendChild(this._buildPreviewRow('Playlists', estimates.playlists));
            rows.appendChild(this._buildPreviewRow('Genres', estimates.genres));
            rows.appendChild(this._buildPreviewRow('Directors', estimates.directors));
            rows.appendChild(this._buildPreviewRow('Decades', estimates.decades));
            rows.appendChild(this._buildPreviewRow('Studios', estimates.studios));
            rows.appendChild(this._buildPreviewRow('Actors', estimates.actors));
            previewPanel.appendChild(rows);

            // Show "Updating..." indicator while loading with existing preview
            if (this._isPreviewLoading) {
                const updating = document.createElement('div');
                updating.className = 'setup-preview-updating';
                updating.classList.add('panel-spinner');
                updating.textContent = 'Updating...';
                previewPanel.appendChild(updating);
            }

            if (reachedMaxChannels) {
                const cap = document.createElement('div');
                cap.className = 'setup-preview-warning';
                cap.textContent = 'Reached max channel limit; extra channels will be skipped.';
                previewPanel.appendChild(cap);
            }

            if (warnings.length > 0) {
                const warningList = document.createElement('div');
                warningList.className = 'setup-preview-warnings';
                this._renderCappedWarnings(warnings, warningList);
                previewPanel.appendChild(warningList);
            }
        } else if (this._isPreviewLoading) {
            // First-load case: no previous preview exists
            const loading = document.createElement('div');
            loading.className = 'setup-preview-loading';
            loading.classList.add('panel-spinner');
            loading.textContent = 'Estimating channels...';
            previewPanel.appendChild(loading);
        } else {
            const empty = document.createElement('div');
            empty.className = 'setup-preview-empty';
            empty.textContent = 'Estimates will appear after a short pause.';
            previewPanel.appendChild(empty);
        }

        scroll.appendChild(previewPanel);
        this._contentEl.appendChild(scroll);
        if (this._preview) {
            requestAnimationFrame(() => {
                if (this._step !== 2) return;
                const measuredHeight = previewPanel.getBoundingClientRect().height;
                if (Number.isFinite(measuredHeight)) {
                    this._previewPanelHeightPx = this._clampPreviewHeight(measuredHeight);
                    const height = `${this._previewPanelHeightPx}px`;
                    previewPanel.style.minHeight = height;
                    previewPanel.style.maxHeight = height;
                    previewPanel.style.overflowY = 'auto';
                }
            });
        }

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
        nextButton.textContent = 'Review';
        nextButton.addEventListener('click', () => {
            this._step = 3;
            this._renderStep();
        });
        actions.appendChild(nextButton);

        this._contentEl.appendChild(actions);

        this._registerFocusables([...focusableButtons, backButton, nextButton]);

        if (this._strategies.genres || this._strategies.directors) {
            this._detailEl.textContent = 'Performance warning: may be slow on large libraries.';
        } else {
            this._detailEl.textContent = '';
        }

        this._schedulePreview();
    }

    private _renderBuildStep(): void {
        if (this._isBuilding) {
            this._renderBuildProgress();
        } else {
            this._renderBuildReview();
        }
    }

    private _renderBuildReview(): void {
        this._stepEl.textContent = 'Step 3 of 3';
        this._statusEl.textContent = 'Review changes before building.';
        this._detailEl.textContent = '';
        this._errorEl.textContent = this._reviewError ?? '';

        if (!this._review && !this._isReviewLoading && !this._reviewError) {
            this._loadReview().catch(console.error);
        }

        const scroll = document.createElement('div');
        scroll.className = 'setup-scroll';

        const reviewContainer = document.createElement('div');
        reviewContainer.className = 'setup-review';

        if (this._isReviewLoading) {
            const loading = document.createElement('div');
            loading.className = 'setup-preview-loading';
            loading.classList.add('panel-spinner');
            loading.textContent = 'Preparing your review...';
            reviewContainer.appendChild(loading);
        } else if (this._review) {
            const modeLine = document.createElement('div');
            modeLine.className = 'setup-summary';
            modeLine.textContent = `Build mode: ${this._buildMode.charAt(0).toUpperCase()}${this._buildMode.slice(1)}`;
            reviewContainer.appendChild(modeLine);

            const diffSummary = document.createElement('div');
            diffSummary.className = 'setup-summary';
            diffSummary.textContent = `Create ${this._review.diff.summary.created}, remove ${this._review.diff.summary.removed}, unchanged ${this._review.diff.summary.unchanged}.`;
            reviewContainer.appendChild(diffSummary);

            const sampleList = document.createElement('div');
            sampleList.className = 'setup-preview-rows';
            sampleList.appendChild(this._buildPreviewRow('Sample creates', this._review.diff.samples.created.join(', ') || 'None'));
            sampleList.appendChild(this._buildPreviewRow('Sample removes', this._review.diff.samples.removed.join(', ') || 'None'));
            sampleList.appendChild(this._buildPreviewRow('Sample unchanged', this._review.diff.samples.unchanged.join(', ') || 'None'));
            reviewContainer.appendChild(sampleList);

            if (this._review.preview.warnings.length > 0) {
                const warningList = document.createElement('div');
                warningList.className = 'setup-preview-warnings';
                this._renderCappedWarnings(this._review.preview.warnings, warningList);
                reviewContainer.appendChild(warningList);
            }

            if (this._buildMode === 'replace') {
                const warning = document.createElement('div');
                warning.className = 'setup-preview-warning';
                warning.textContent = 'This will replace your current lineup.';
                reviewContainer.appendChild(warning);

                const confirmButton = document.createElement('button');
                confirmButton.id = 'setup-replace-confirm';
                confirmButton.className = `setup-toggle${this._replaceConfirm ? ' selected' : ''}`;
                confirmButton.addEventListener('click', () => {
                    this._preferredFocusId = confirmButton.id;
                    this._replaceConfirm = !this._replaceConfirm;
                    this._renderStep();
                });

                const confirmLabel = document.createElement('span');
                confirmLabel.className = 'setup-toggle-label';
                confirmLabel.textContent = 'Confirm replace';
                const confirmMeta = document.createElement('span');
                confirmMeta.className = 'setup-toggle-meta';
                confirmMeta.textContent = 'Required before replacing channels.';
                const confirmState = document.createElement('span');
                confirmState.className = 'setup-toggle-state';
                confirmState.textContent = this._replaceConfirm ? 'Confirmed' : 'Required';

                confirmButton.appendChild(confirmLabel);
                confirmButton.appendChild(confirmMeta);
                confirmButton.appendChild(confirmState);

                reviewContainer.appendChild(confirmButton);
            }
        }

        scroll.appendChild(reviewContainer);
        this._contentEl.appendChild(scroll);

        const actions = document.createElement('div');
        actions.className = 'button-row';

        const backButton = document.createElement('button');
        backButton.id = 'setup-back';
        backButton.className = 'screen-button secondary';
        backButton.textContent = 'Back';
        backButton.addEventListener('click', () => {
            this._reviewAbortController?.abort();
            this._review = null;
            this._reviewError = null;
            this._replaceConfirm = false;
            this._step = 2;
            this._renderStep();
        });
        actions.appendChild(backButton);

        const confirmButton = document.createElement('button');
        confirmButton.id = 'setup-confirm';
        confirmButton.className = 'screen-button';
        confirmButton.textContent = this._buildMode === 'replace' ? 'Confirm & Replace' : 'Confirm & Build';
        confirmButton.disabled = this._isReviewLoading || !this._review || (this._buildMode === 'replace' && !this._replaceConfirm);
        confirmButton.addEventListener('click', () => {
            if (confirmButton.disabled) {
                return;
            }
            this._isBuilding = true;
            this._renderStep();
        });
        actions.appendChild(confirmButton);

        this._contentEl.appendChild(actions);

        const listButtons = Array.from(reviewContainer.querySelectorAll<HTMLButtonElement>('button'));
        this._registerFocusables([...listButtons, backButton, confirmButton]);
    }

    private _renderBuildProgress(): void {
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
                nav.replaceScreen('player');
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
        if (this._buildAbortController) return;

        const serverId = this._getSelectedServerId();
        if (!serverId) {
            this._errorEl.textContent = 'No server selected.';
            this._statusEl.textContent = 'Error';
            taskLabel.textContent = 'Select a server';
            detailLabel.textContent = '';
            barFill.style.width = '0%';
            barFill.classList.remove('indeterminate');
            cancelButton.disabled = false;
            cancelButton.textContent = 'Back';
            doneButton.disabled = true;
            return;
        }

        this._isBuilding = true;
        this._buildAbortController = new AbortController();

        const config = this._buildConfig(serverId);

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
                barFill.style.width = '';
                barFill.classList.add('indeterminate');
            }
        };

        try {
            const result = await this._orchestrator.createChannelsFromSetup(config, {
                signal: this._buildAbortController.signal,
                onProgress: updateUI
            });

            if (token !== this._visibilityToken) return;

            if (result.canceled) {
                this._statusEl.textContent = 'Canceled.';
                this._detailEl.textContent = 'No changes were applied.';
                taskLabel.textContent = 'Canceled';
                detailLabel.textContent = '';
                barFill.style.width = '0%';
                barFill.classList.remove('indeterminate');

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

                cancelButton.disabled = false;
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
            taskLabel.textContent = 'Error';
            detailLabel.textContent = '';
            barFill.style.width = '0%';
            barFill.classList.remove('indeterminate');
            cancelButton.disabled = false;
            cancelButton.textContent = 'Back';
        } finally {
            this._isBuilding = false;
            this._buildAbortController = null;
        }
    }

    private _buildConfig(serverId: string): ChannelSetupConfig {
        return {
            serverId,
            selectedLibraryIds: Array.from(this._selectedLibraryIds),
            maxChannels: this._maxChannels,
            buildMode: this._buildMode,
            enabledStrategies: { ...this._strategies },
            actorStudioCombineMode: this._actorStudioCombineMode,
            minItemsPerChannel: this._minItems,
        };
    }

    private _buildPreviewKey(config: ChannelSetupConfig): string {
        const previewConfig = { ...config, buildMode: undefined };
        return JSON.stringify(previewConfig);
    }

    private _schedulePreview(): void {
        if (this._step !== 2) {
            return;
        }
        const serverId = this._getSelectedServerId();
        if (!serverId) {
            this._previewError = 'No server selected.';
            return;
        }
        const key = this._buildPreviewKey(this._buildConfig(serverId));
        if (key === this._lastPreviewKey && this._preview && !this._isPreviewLoading) {
            return;
        }
        if (this._isPreviewLoading && key === this._pendingPreviewKey) {
            return;
        }
        this._pendingPreviewKey = key;
        if (this._previewTimeoutId !== null) {
            window.clearTimeout(this._previewTimeoutId);
        }
        this._previewTimeoutId = window.setTimeout(() => {
            this._refreshPreview().catch(console.error);
        }, 400);
    }

    private async _refreshPreview(): Promise<void> {
        if (this._step !== 2) return;
        const token = this._visibilityToken;
        const panel = this._contentEl.querySelector<HTMLElement>(`#${this._previewPanelId}`);
        if (panel) {
            const measuredHeight = panel.getBoundingClientRect().height;
            if (Number.isFinite(measuredHeight)) {
                this._previewPanelHeightPx = this._clampPreviewHeight(measuredHeight);
                const height = `${this._previewPanelHeightPx}px`;
                panel.style.minHeight = height;
                panel.style.maxHeight = height;
                panel.style.overflowY = 'auto';
            }
        }
        const serverId = this._getSelectedServerId();
        if (!serverId) {
            this._previewError = 'No server selected.';
            this._preview = null;
            this._isPreviewLoading = false;
            this._pendingPreviewKey = null;
            this._renderStep();
            return;
        }

        const config = this._buildConfig(serverId);
        const key = this._buildPreviewKey(config);
        if (key === this._lastPreviewKey && this._preview && !this._isPreviewLoading) {
            return;
        }
        if (this._pendingPreviewKey === key) {
            this._pendingPreviewKey = null;
        }

        this._previewAbortController?.abort();
        this._previewAbortController = new AbortController();
        this._isPreviewLoading = true;
        this._previewError = null;
        this._renderStep();

        try {
            const preview = await this._orchestrator.getSetupPreview(config, {
                signal: this._previewAbortController.signal,
            });
            if (token !== this._visibilityToken) return;
            this._preview = preview;
            this._lastPreviewKey = key;
        } catch (error) {
            if (token !== this._visibilityToken) return;
            if (error && typeof error === 'object' && 'name' in error && (error as { name?: unknown }).name === 'AbortError') {
                return;
            }
            this._previewError = error instanceof Error ? error.message : 'Unable to estimate channels.';
            this._preview = null;
        } finally {
            if (token === this._visibilityToken) {
                this._isPreviewLoading = false;
                this._renderStep();
            }
        }
    }

    private async _loadReview(): Promise<void> {
        const token = this._visibilityToken;
        const serverId = this._getSelectedServerId();
        if (!serverId) {
            this._reviewError = 'No server selected.';
            this._renderStep();
            return;
        }
        if (this._isReviewLoading) return;

        this._reviewAbortController?.abort();
        this._reviewAbortController = new AbortController();
        this._isReviewLoading = true;
        this._reviewError = null;
        this._renderStep();

        try {
            const review = await this._orchestrator.getSetupReview(this._buildConfig(serverId), {
                signal: this._reviewAbortController.signal,
            });
            if (token !== this._visibilityToken) return;
            this._review = review;
        } catch (error) {
            if (token !== this._visibilityToken) return;
            if (error && typeof error === 'object' && 'name' in error && (error as { name?: unknown }).name === 'AbortError') {
                return;
            }
            this._reviewError = error instanceof Error ? error.message : 'Unable to load review.';
            this._review = null;
        } finally {
            this._isReviewLoading = false;
            if (token === this._visibilityToken) {
                this._renderStep();
            }
        }
    }

    private _buildPreviewRow(label: string, value: number | string): HTMLElement {
        const row = document.createElement('div');
        row.className = 'setup-preview-row';
        const labelEl = document.createElement('span');
        labelEl.className = 'setup-preview-label';
        labelEl.textContent = label;
        const valueEl = document.createElement('span');
        valueEl.className = 'setup-preview-value';
        valueEl.textContent = String(value);
        row.appendChild(labelEl);
        row.appendChild(valueEl);
        return row;
    }

    private _renderCappedWarnings(warnings: string[], container: HTMLElement): void {
        const cappedWarnings = warnings.slice(0, this._maxPreviewWarnings);
        for (const warning of cappedWarnings) {
            const item = document.createElement('div');
            item.className = 'setup-preview-warning';
            item.textContent = warning;
            container.appendChild(item);
        }
        const remaining = warnings.length - cappedWarnings.length;
        if (remaining > 0) {
            const item = document.createElement('div');
            item.className = 'setup-preview-warning';
            item.textContent = `And ${remaining} more warning${remaining === 1 ? '' : 's'}…`;
            container.appendChild(item);
        }
    }

    private _applySetupRecord(record: ChannelSetupRecord): void {
        const availableIds = new Set(this._libraries.map((lib) => lib.id));
        const selected = record.selectedLibraryIds.filter((id) => availableIds.has(id));
        this._selectedLibraryIds = new Set(selected.length > 0 ? selected : this._libraries.map((lib) => lib.id));

        this._strategies = {
            collections: record.enabledStrategies.collections,
            libraryFallback: record.enabledStrategies.libraryFallback,
            playlists: record.enabledStrategies.playlists,
            genres: record.enabledStrategies.genres,
            directors: record.enabledStrategies.directors,
            decades: record.enabledStrategies.decades,
            recentlyAdded: record.enabledStrategies.recentlyAdded,
            studios: record.enabledStrategies.studios,
            actors: record.enabledStrategies.actors,
        };
        this._maxChannels = Math.min(record.maxChannels, MAX_CHANNELS);
        this._minItems = Math.max(1, Math.floor(record.minItemsPerChannel || DEFAULT_MIN_ITEMS));
        this._buildMode = record.buildMode ?? 'replace';
        this._actorStudioCombineMode = record.actorStudioCombineMode ?? 'separate';
        this._preview = null;
        this._previewError = null;
        this._lastPreviewKey = null;
        this._pendingPreviewKey = null;
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
