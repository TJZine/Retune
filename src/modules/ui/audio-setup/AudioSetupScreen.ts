/**
 * @fileoverview Audio setup wizard screen - onboarding step.
 * @module modules/ui/audio-setup/AudioSetupScreen
 * @version 1.0.0
 */

import type { INavigationManager, FocusableElement } from '../../navigation';
import { SETTINGS_STORAGE_KEYS, DEFAULT_SETTINGS } from '../settings/constants';
import { safeLocalStorageSet, readStoredBoolean } from '../../../utils/storage';

/**
 * Audio choice configuration.
 */
interface AudioChoice {
    id: 'external' | 'tv-speakers';
    label: string;
    description: string;
    icon: string;
}

const AUDIO_CHOICES: AudioChoice[] = [
    {
        id: 'external',
        label: 'Yes, I have a soundbar or receiver',
        description: 'Connected via HDMI eARC',
        icon: '🔊',
    },
    {
        id: 'tv-speakers',
        label: 'No, using TV speakers',
        description: '',
        icon: '📺',
    },
];

/**
 * Audio setup screen component.
 * Displayed during onboarding to configure audio preferences.
 */
export class AudioSetupScreen {
    private _container: HTMLElement;
    private _getNavigation: () => INavigationManager | null;
    private _onComplete: () => void;
    private _focusableIds: string[] = [];
    private _selectedChoice: AudioChoice['id'] | null = null;
    private _lastFocusedChoiceId: string = 'audio-choice-tv-speakers';
    private _fallbackFocusable: FocusableElement | null = null;
    private _directPlayFallbackEnabled: boolean;

    constructor(
        container: HTMLElement,
        getNavigation: () => INavigationManager | null,
        onComplete: () => void
    ) {
        this._container = container;
        this._getNavigation = getNavigation;
        this._onComplete = onComplete;
        this._directPlayFallbackEnabled = readStoredBoolean(
            SETTINGS_STORAGE_KEYS.DIRECT_PLAY_AUDIO_FALLBACK,
            DEFAULT_SETTINGS.audio.directPlayAudioFallback
        );
        this._buildUI();
    }

    /**
     * Build the UI.
     */
    private _buildUI(): void {
        this._container.className = 'screen';
        this._container.id = 'audio-setup-screen';

        const panel = document.createElement('div');
        panel.className = 'screen-panel setup-panel';

        // Header
        const title = document.createElement('h1');
        title.className = 'screen-title';
        title.textContent = 'Audio Setup';

        const stepLabel = document.createElement('div');
        stepLabel.className = 'setup-step';
        stepLabel.textContent = 'Step 2 of 3';

        const subtitle = document.createElement('p');
        subtitle.className = 'screen-subtitle';
        subtitle.textContent = 'Do you have an external sound system?';

        panel.appendChild(title);
        panel.appendChild(stepLabel);
        panel.appendChild(subtitle);

        // Choices
        const choicesList = document.createElement('div');
        choicesList.className = 'setup-grid-2col';

        for (const choice of AUDIO_CHOICES) {
            const button = document.createElement('button');
            button.id = `audio-choice-${choice.id}`;
            button.className = 'setup-toggle';
            button.addEventListener('click', () => this._selectChoice(choice.id));

            const icon = document.createElement('span');
            icon.className = 'setup-toggle-label';
            icon.textContent = `${choice.icon} ${choice.label}`;

            const desc = document.createElement('span');
            desc.className = 'setup-toggle-meta';
            desc.textContent = choice.description;

            button.appendChild(icon);
            button.appendChild(desc);
            choicesList.appendChild(button);
        }

        panel.appendChild(choicesList);

        const fallbackButton = document.createElement('button');
        fallbackButton.id = 'audio-direct-play-fallback';
        fallbackButton.className = `setup-toggle${this._directPlayFallbackEnabled ? ' selected' : ''}`;

        const fallbackLabel = document.createElement('span');
        fallbackLabel.className = 'setup-toggle-label';
        fallbackLabel.textContent = 'Direct Play Audio Fallback';

        const fallbackMeta = document.createElement('span');
        fallbackMeta.className = 'setup-toggle-meta';
        fallbackMeta.textContent = 'Allow Direct Play using a compatible fallback audio track';

        const fallbackState = document.createElement('span');
        fallbackState.className = 'setup-toggle-state';
        fallbackState.textContent = this._directPlayFallbackEnabled ? 'On' : 'Off';

        fallbackButton.addEventListener('click', () => {
            this._directPlayFallbackEnabled = !this._directPlayFallbackEnabled;
            fallbackButton.classList.toggle('selected', this._directPlayFallbackEnabled);
            fallbackState.textContent = this._directPlayFallbackEnabled ? 'On' : 'Off';
        });

        fallbackButton.appendChild(fallbackLabel);
        fallbackButton.appendChild(fallbackMeta);
        fallbackButton.appendChild(fallbackState);
        panel.appendChild(fallbackButton);

        // Hint
        const hint = document.createElement('p');
        hint.className = 'screen-detail';
        hint.textContent = 'This helps optimize audio playback. You can change this later in Settings.';
        panel.appendChild(hint);

        // Actions
        const actions = document.createElement('div');
        actions.className = 'button-row';

        const continueBtn = document.createElement('button');
        continueBtn.id = 'audio-setup-continue';
        continueBtn.className = 'screen-button';
        continueBtn.textContent = 'Continue';
        continueBtn.addEventListener('click', () => this._applyAndContinue());
        actions.appendChild(continueBtn);

        panel.appendChild(actions);
        this._container.appendChild(panel);
    }

    /**
     * Select an audio choice.
     */
    private _selectChoice(choiceId: AudioChoice['id']): void {
        this._selectedChoice = choiceId;
        this._setLastFocusedChoiceId(`audio-choice-${choiceId}`);

        // Update button states
        for (const choice of AUDIO_CHOICES) {
            const btn = this._container.querySelector(`#audio-choice-${choice.id}`) as HTMLButtonElement | null;
            if (btn) {
                if (choice.id === choiceId) {
                    btn.classList.add('selected');
                } else {
                    btn.classList.remove('selected');
                }
            }
        }

        // Enable continue button
        const continueBtn = this._container.querySelector('#audio-setup-continue') as HTMLButtonElement | null;
        if (continueBtn) {
            continueBtn.disabled = false;
        }
    }

    /**
     * Apply settings and continue.
     */
    private _applyAndContinue(): void {
        if (!this._selectedChoice) return;

        // Apply settings based on choice
        if (this._selectedChoice === 'external') {
            // External receiver: enable DTS passthrough
            safeLocalStorageSet(SETTINGS_STORAGE_KEYS.DTS_PASSTHROUGH, '1');
        } else {
            // TV speakers: disable DTS passthrough
            safeLocalStorageSet(SETTINGS_STORAGE_KEYS.DTS_PASSTHROUGH, '0');
        }

        // Mark audio setup as complete
        // Store as '1'
        safeLocalStorageSet(SETTINGS_STORAGE_KEYS.AUDIO_SETUP_COMPLETE, '1');
        safeLocalStorageSet(
            SETTINGS_STORAGE_KEYS.DIRECT_PLAY_AUDIO_FALLBACK,
            this._directPlayFallbackEnabled ? '1' : '0'
        );

        this._onComplete();
    }

    /**
     * Check if audio setup is already complete.
     */
    public static isSetupComplete(): boolean {
        return readStoredBoolean(SETTINGS_STORAGE_KEYS.AUDIO_SETUP_COMPLETE, false);
    }

    /**
     * Show the screen and register focusables.
     */
    public show(): void {
        this._container.classList.add('visible');
        this._ensureInitialSelectionAndState();
        this._registerFocusables();
    }

    /**
     * Hide the screen and unregister focusables.
     */
    public hide(): void {
        this._container.classList.remove('visible');
        this._unregisterFocusables();
    }

    /**
     * Register focusable elements.
     */
    private _registerFocusables(preferredFocusId?: string): void {
        const nav = this._getNavigation();
        if (!nav) return;

        const externalBtn = this._container.querySelector('#audio-choice-external') as HTMLButtonElement | null;
        const tvBtn = this._container.querySelector('#audio-choice-tv-speakers') as HTMLButtonElement | null;
        const fallbackBtn = this._container.querySelector('#audio-direct-play-fallback') as HTMLButtonElement | null;
        const continueBtn = this._container.querySelector('#audio-setup-continue') as HTMLButtonElement | null;

        this._fallbackFocusable = null;
        const focusables: FocusableElement[] = [];

        if (externalBtn) {
            const neighbors: FocusableElement['neighbors'] = {};
            if (tvBtn?.id) neighbors.right = tvBtn.id;
            if (fallbackBtn?.id) neighbors.down = fallbackBtn.id;
            focusables.push({
                id: externalBtn.id,
                element: externalBtn,
                neighbors,
                onFocus: () => this._setLastFocusedChoiceId(externalBtn.id),
                onSelect: () => externalBtn.click(),
            });
        }

        if (tvBtn) {
            const neighbors: FocusableElement['neighbors'] = {};
            if (externalBtn?.id) neighbors.left = externalBtn.id;
            if (fallbackBtn?.id) neighbors.down = fallbackBtn.id;
            focusables.push({
                id: tvBtn.id,
                element: tvBtn,
                neighbors,
                onFocus: () => this._setLastFocusedChoiceId(tvBtn.id),
                onSelect: () => tvBtn.click(),
            });
        }

        if (fallbackBtn) {
            const neighbors: FocusableElement['neighbors'] = {};
            if (this._lastFocusedChoiceId) neighbors.up = this._lastFocusedChoiceId;
            if (continueBtn?.id) neighbors.down = continueBtn.id;
            const fallbackFocusable: FocusableElement = {
                id: fallbackBtn.id,
                element: fallbackBtn,
                neighbors,
                onSelect: () => fallbackBtn.click(),
            };
            this._fallbackFocusable = fallbackFocusable;
            focusables.push(fallbackFocusable);
        }

        if (continueBtn) {
            const neighbors: FocusableElement['neighbors'] = {};
            if (fallbackBtn?.id) neighbors.up = fallbackBtn.id;
            focusables.push({
                id: continueBtn.id,
                element: continueBtn,
                neighbors,
                onSelect: () => continueBtn.click(),
            });
        }

        this._focusableIds = focusables.map((focusable) => focusable.id);

        for (const focusable of focusables) {
            nav.registerFocusable(focusable);
        }

        const selectedChoiceId = this._selectedChoice ? `audio-choice-${this._selectedChoice}` : null;
        const fallbackFocusId = externalBtn?.id ?? tvBtn?.id ?? null;
        const focusId = preferredFocusId && this._focusableIds.includes(preferredFocusId)
            ? preferredFocusId
            : (selectedChoiceId && this._focusableIds.includes(selectedChoiceId)
                ? selectedChoiceId
                : (fallbackFocusId && this._focusableIds.includes(fallbackFocusId) ? fallbackFocusId : null));
        if (focusId) {
            nav.setFocus(focusId);
        }
    }

    private _setLastFocusedChoiceId(choiceId: string): void {
        this._lastFocusedChoiceId = choiceId;
        if (this._fallbackFocusable) {
            this._fallbackFocusable.neighbors.up = this._lastFocusedChoiceId;
        }
    }

    private _ensureInitialSelectionAndState(): void {
        if (this._selectedChoice) {
            return;
        }
        const dtsEnabled = readStoredBoolean(
            SETTINGS_STORAGE_KEYS.DTS_PASSTHROUGH,
            DEFAULT_SETTINGS.audio.dtsPassthrough
        );
        this._selectedChoice = dtsEnabled ? 'external' : 'tv-speakers';
        this._lastFocusedChoiceId = `audio-choice-${this._selectedChoice}`;

        for (const choice of AUDIO_CHOICES) {
            const btn = this._container.querySelector(`#audio-choice-${choice.id}`) as HTMLButtonElement | null;
            if (!btn) continue;
            btn.classList.toggle('selected', choice.id === this._selectedChoice);
        }

        const continueBtn = this._container.querySelector('#audio-setup-continue') as HTMLButtonElement | null;
        if (continueBtn) {
            continueBtn.disabled = false;
        }
    }


    /**
     * Unregister focusable elements.
     */
    private _unregisterFocusables(): void {
        const nav = this._getNavigation();
        if (!nav) return;

        for (const id of this._focusableIds) {
            nav.unregisterFocusable(id);
        }
        this._focusableIds = [];
        this._fallbackFocusable = null;
    }

    /**
     * Destroy the component.
     */
    public destroy(): void {
        this._unregisterFocusables();
        this._container.innerHTML = '';
    }
}
