/**
 * @fileoverview Audio setup wizard screen - onboarding step.
 * @module modules/ui/audio-setup/AudioSetupScreen
 * @version 1.0.0
 */

import type { INavigationManager, FocusableElement } from '../../navigation';
import { SETTINGS_STORAGE_KEYS } from '../settings/constants';
import { safeLocalStorageGet, safeLocalStorageSet } from '../../../utils/storage';

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

    constructor(
        container: HTMLElement,
        getNavigation: () => INavigationManager | null,
        onComplete: () => void
    ) {
        this._container = container;
        this._getNavigation = getNavigation;
        this._onComplete = onComplete;
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
        choicesList.className = 'setup-list';

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
        continueBtn.disabled = true;
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

        const nav = this._getNavigation();
        const focusedId = nav?.getFocusedElement()?.id ?? null;
        const desiredFocusId = focusedId ?? `audio-choice-${choiceId}`;

        // Re-register focusables to update continue button state
        this._unregisterFocusables();
        this._registerFocusables(desiredFocusId);
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

        this._onComplete();
    }

    /**
     * Check if audio setup is already complete.
     */
    public static isSetupComplete(): boolean {
        return safeLocalStorageGet(SETTINGS_STORAGE_KEYS.AUDIO_SETUP_COMPLETE) === '1';
    }

    /**
     * Show the screen and register focusables.
     */
    public show(): void {
        this._container.classList.add('visible');
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

        const buttons: HTMLButtonElement[] = [];
        for (const choice of AUDIO_CHOICES) {
            const btn = this._container.querySelector(`#audio-choice-${choice.id}`) as HTMLButtonElement | null;
            if (btn) buttons.push(btn);
        }
        const continueBtn = this._container.querySelector('#audio-setup-continue') as HTMLButtonElement | null;
        if (continueBtn && !continueBtn.disabled) {
            buttons.push(continueBtn);
        }

        this._focusableIds = buttons.map(b => b.id);

        for (let i = 0; i < buttons.length; i++) {
            const btn = buttons[i];
            if (!btn) continue;

            const neighbors: FocusableElement['neighbors'] = {};
            if (i > 0) {
                const prevBtn = buttons[i - 1];
                if (prevBtn) neighbors.up = prevBtn.id;
            }
            if (i < buttons.length - 1) {
                const nextBtn = buttons[i + 1];
                if (nextBtn) neighbors.down = nextBtn.id;
            }

            const focusable: FocusableElement = {
                id: btn.id,
                element: btn,
                neighbors,
                onSelect: () => btn.click(),
            };
            nav.registerFocusable(focusable);
        }

        const focusId = preferredFocusId && this._focusableIds.includes(preferredFocusId)
            ? preferredFocusId
            : (buttons[0]?.id ?? null);
        if (focusId) {
            nav.setFocus(focusId);
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
    }

    /**
     * Destroy the component.
     */
    public destroy(): void {
        this._unregisterFocusables();
        this._container.innerHTML = '';
    }
}
