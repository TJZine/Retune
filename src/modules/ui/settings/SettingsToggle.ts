/**
 * @fileoverview Settings toggle component - focusable toggle button.
 * @module modules/ui/settings/SettingsToggle
 * @version 1.0.0
 */

import type { SettingsToggleConfig } from './types';

/**
 * Creates a settings toggle element.
 * @param config - Toggle configuration
 * @returns Object with element and update method
 */
export function createSettingsToggle(config: SettingsToggleConfig): {
    element: HTMLButtonElement;
    update: (value: boolean) => void;
    setDisabled: (disabled: boolean) => void;
    isDisabled: () => boolean;
    getId: () => string;
} {
    const button = document.createElement('button');
    button.id = config.id;
    button.className = `setup-toggle${config.value ? ' selected' : ''}${config.disabled ? ' disabled' : ''}`;
    button.disabled = config.disabled ?? false;

    const label = document.createElement('span');
    label.className = 'setup-toggle-label';
    label.textContent = config.label;

    const meta = document.createElement('span');
    meta.className = 'setup-toggle-meta';
    meta.textContent = config.disabled && config.disabledReason
        ? config.disabledReason
        : config.description ?? '';

    const state = document.createElement('span');
    state.className = 'setup-toggle-state';
    state.textContent = config.value ? 'On' : 'Off';

    button.appendChild(label);
    button.appendChild(meta);
    button.appendChild(state);

    // Click handler toggles the value
    button.addEventListener('click', () => {
        if (config.disabled) return;
        const newValue = !config.value;
        config.value = newValue;
        update(newValue);
        config.onChange(newValue);
    });

    function update(value: boolean): void {
        config.value = value;
        if (value) {
            button.classList.add('selected');
        } else {
            button.classList.remove('selected');
        }
        state.textContent = value ? 'On' : 'Off';
    }

    function setDisabled(disabled: boolean): void {
        config.disabled = disabled;
        button.disabled = disabled;
        if (disabled) {
            button.classList.add('disabled');
        } else {
            button.classList.remove('disabled');
        }
        meta.textContent = disabled && config.disabledReason
            ? config.disabledReason
            : config.description ?? '';
    }

    return {
        element: button,
        update,
        setDisabled,
        isDisabled: (): boolean => config.disabled ?? false,
        getId: (): string => config.id,
    };
}
