/**
 * @fileoverview Settings select component - focusable multi-value button.
 * @module modules/ui/settings/SettingsSelect
 */

import type { SettingsSelectConfig } from './types';

export function createSettingsSelect(config: SettingsSelectConfig): {
    element: HTMLButtonElement;
    update: (value: number) => void;
    getId: () => string;
} {
    const button = document.createElement('button');
    button.id = config.id;
    button.className = `setup-toggle${config.disabled ? ' disabled' : ''}`;
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
    state.textContent = resolveOptionLabel(config.options, config.value);

    button.appendChild(label);
    button.appendChild(meta);
    button.appendChild(state);

    button.addEventListener('click', () => {
        if (config.disabled) return;
        const nextValue = getNextValue(config.options, config.value);
        update(nextValue);
        config.onChange(nextValue);
    });

    function update(value: number): void {
        config.value = value;
        state.textContent = resolveOptionLabel(config.options, value);
    }

    return {
        element: button,
        update,
        getId: (): string => config.id,
    };
}

function resolveOptionLabel(options: SettingsSelectConfig['options'], value: number): string {
    const match = options.find((option) => option.value === value);
    return match ? match.label : String(value);
}

function getNextValue(options: SettingsSelectConfig['options'], value: number): number {
    if (options.length === 0) return value;
    const currentIndex = options.findIndex((option) => option.value === value);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % options.length : 0;
    return options[nextIndex]?.value ?? value;
}
