/**
 * @fileoverview Settings screen component.
 * @module modules/ui/settings/SettingsScreen
 * @version 1.0.0
 */

import type { INavigationManager, FocusableElement } from '../../navigation';
import { createSettingsToggle } from './SettingsToggle';
import { SETTINGS_STORAGE_KEYS, DEFAULT_SETTINGS } from './constants';
import type { SettingsSectionConfig } from './types';
import { parseStoredBoolean, safeLocalStorageGet, safeLocalStorageSet } from '../../../utils/storage';

/**
 * Settings screen component.
 * Manages settings display, focus navigation, and persistence.
 */
export class SettingsScreen {
    private _container: HTMLElement;
    private _getNavigation: () => INavigationManager | null;
    private _focusableIds: string[] = [];
    private _toggleElements: Map<string, ReturnType<typeof createSettingsToggle>> = new Map();
    private _toggleMetadata: Map<
        string,
        { storageKey: string; defaultValue: boolean; onRefresh?: (value: boolean) => void }
    > = new Map();

    constructor(
        container: HTMLElement,
        getNavigation: () => INavigationManager | null
    ) {
        this._container = container;
        this._getNavigation = getNavigation;
        this._buildUI();
    }

    /**
     * Build the settings UI.
     */
    private _buildUI(): void {
        this._container.className = 'settings-screen screen';
        this._container.id = 'settings-screen';

        const panel = document.createElement('div');
        panel.className = 'settings-panel';

        // Header
        const header = document.createElement('div');
        header.className = 'settings-header';

        const title = document.createElement('h1');
        title.className = 'settings-title';
        title.textContent = '⚙ Settings';

        const hint = document.createElement('span');
        hint.className = 'settings-hint';
        hint.textContent = 'Press BACK to return';

        header.appendChild(title);
        header.appendChild(hint);
        panel.appendChild(header);

        // Build sections
        const sections = this._buildSections();
        for (const section of sections) {
            panel.appendChild(this._createSection(section));
        }

        this._container.appendChild(panel);
    }

    /**
     * Build section configurations from current settings.
     */
    private _buildSections(): SettingsSectionConfig[] {
        const scanlineEnabled = this._loadBoolSetting(
            SETTINGS_STORAGE_KEYS.SCANLINE_EFFECT,
            DEFAULT_SETTINGS.display.scanlineEffect
        );
        this._applyScanlineEffect(scanlineEnabled);

        return [
            {
                title: 'Audio',
                items: [
                    {
                        id: 'settings-dts-passthrough',
                        label: 'DTS Passthrough',
                        description: 'Enable if you have an eARC receiver',
                        value: this._loadBoolSetting(SETTINGS_STORAGE_KEYS.DTS_PASSTHROUGH, DEFAULT_SETTINGS.audio.dtsPassthrough),
                        onChange: (value) => this._saveBoolSetting(SETTINGS_STORAGE_KEYS.DTS_PASSTHROUGH, value),
                    },
                ],
            },
            {
                title: 'Display',
                items: [
                    {
                        id: 'settings-scanline-effect',
                        label: 'Scanline Effect',
                        description: 'Subtle CRT-style scanline overlay',
                        value: scanlineEnabled,
                        onChange: (value): void => {
                            this._saveBoolSetting(SETTINGS_STORAGE_KEYS.SCANLINE_EFFECT, value);
                            this._applyScanlineEffect(value);
                        },
                    },
                ],
            },
            {
                title: 'Developer',
                items: [
                    {
                        id: 'settings-debug-logging',
                        label: 'Debug Logging',
                        description: 'Enable verbose console output',
                        value: this._loadBoolSetting(SETTINGS_STORAGE_KEYS.DEBUG_LOGGING, DEFAULT_SETTINGS.developer.debugLogging),
                        onChange: (value) => this._saveBoolSetting(SETTINGS_STORAGE_KEYS.DEBUG_LOGGING, value),
                    },
                ],
            },
        ];
    }

    /**
     * Create a section DOM element.
     */
    private _createSection(config: SettingsSectionConfig): HTMLElement {
        const section = document.createElement('div');
        section.className = 'settings-section';

        const title = document.createElement('h2');
        title.className = 'settings-section-title';
        title.textContent = config.title;
        section.appendChild(title);

        const items = document.createElement('div');
        items.className = 'settings-section-items';

        for (const item of config.items) {
            const toggle = createSettingsToggle(item);
            this._toggleElements.set(item.id, toggle);
            const meta = this._inferToggleMetadata(item.id);
            if (meta) {
                this._toggleMetadata.set(item.id, meta);
            }
            items.appendChild(toggle.element);
        }

        section.appendChild(items);
        return section;
    }

    /**
     * Show the settings screen and register focusables.
     */
    public show(): void {
        this._container.classList.add('visible');
        this._refreshValues();
        this._registerFocusables();
    }

    /**
     * Hide the settings screen and unregister focusables.
     */
    public hide(): void {
        this._container.classList.remove('visible');
        this._unregisterFocusables();
    }

    /**
     * Register all toggles as focusable elements.
     */
    private _registerFocusables(): void {
        const nav = this._getNavigation();
        if (!nav) return;

        const toggleIds = Array.from(this._toggleElements.keys());
        this._focusableIds = toggleIds;

        for (let i = 0; i < toggleIds.length; i++) {
            const id = toggleIds[i];
            if (!id) continue;

            const toggle = this._toggleElements.get(id);
            if (!toggle) continue;

            const upId = i > 0 ? toggleIds[i - 1] : undefined;
            const downId = i < toggleIds.length - 1 ? toggleIds[i + 1] : undefined;

            const neighbors: FocusableElement['neighbors'] = {};
            if (upId) neighbors.up = upId;
            if (downId) neighbors.down = downId;

            const focusable: FocusableElement = {
                id,
                element: toggle.element,
                neighbors,
                onSelect: () => toggle.element.click(),
            };
            nav.registerFocusable(focusable);
        }

        // Set initial focus to first toggle
        const firstId = toggleIds[0];
        if (firstId) {
            nav.setFocus(firstId);
        }
    }

    /**
     * Unregister all focusables.
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
     * Load a boolean setting from localStorage.
     */
    private _loadBoolSetting(key: string, defaultValue: boolean): boolean {
        const parsed = parseStoredBoolean(safeLocalStorageGet(key));
        return parsed === null ? defaultValue : parsed;
    }

    /**
     * Save a boolean setting to localStorage.
     */
    private _saveBoolSetting(key: string, value: boolean): void {
        safeLocalStorageSet(key, value ? '1' : '0');
    }

    /**
     * Apply or remove scanline effect on body.
     */
    private _applyScanlineEffect(enabled: boolean): void {
        if (enabled) {
            document.body.classList.add('scanline-effect');
        } else {
            document.body.classList.remove('scanline-effect');
        }
    }

    private _refreshValues(): void {
        for (const [id, meta] of this._toggleMetadata.entries()) {
            const toggle = this._toggleElements.get(id);
            if (!toggle) continue;
            const value = this._loadBoolSetting(meta.storageKey, meta.defaultValue);
            toggle.update(value);
            meta.onRefresh?.(value);
        }
    }

    private _inferToggleMetadata(
        id: string
    ): { storageKey: string; defaultValue: boolean; onRefresh?: (value: boolean) => void } | null {
        switch (id) {
            case 'settings-dts-passthrough':
                return {
                    storageKey: SETTINGS_STORAGE_KEYS.DTS_PASSTHROUGH,
                    defaultValue: DEFAULT_SETTINGS.audio.dtsPassthrough,
                };
            case 'settings-scanline-effect':
                return {
                    storageKey: SETTINGS_STORAGE_KEYS.SCANLINE_EFFECT,
                    defaultValue: DEFAULT_SETTINGS.display.scanlineEffect,
                    onRefresh: (value) => this._applyScanlineEffect(value),
                };
            case 'settings-debug-logging':
                return {
                    storageKey: SETTINGS_STORAGE_KEYS.DEBUG_LOGGING,
                    defaultValue: DEFAULT_SETTINGS.developer.debugLogging,
                };
            default:
                // If we can't infer the key, don't attempt refresh.
                return null;
        }
    }

    /**
     * Destroy the component.
     */
    public destroy(): void {
        this._unregisterFocusables();
        this._toggleElements.clear();
        this._toggleMetadata.clear();
        this._container.innerHTML = '';
    }
}
