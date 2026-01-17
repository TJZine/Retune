/**
 * @fileoverview Settings screen component.
 * @module modules/ui/settings/SettingsScreen
 * @version 1.0.0
 */

import type { INavigationManager, FocusableElement } from '../../navigation';
import { createSettingsToggle } from './SettingsToggle';
import { createSettingsSelect } from './SettingsSelect';
import { SETTINGS_STORAGE_KEYS, DEFAULT_SETTINGS } from './constants';
import type { SettingsSectionConfig, SettingsItemConfig, SettingsSelectConfig } from './types';
import { NOW_PLAYING_INFO_AUTO_HIDE_OPTIONS, NOW_PLAYING_INFO_DEFAULTS } from '../now-playing-info';
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
    private _selectElements: Map<string, ReturnType<typeof createSettingsSelect>> = new Map();
    private _focusableOrder: string[] = [];
    private _toggleMetadata: Map<
        string,
        { storageKey: string; defaultValue: boolean; onRefresh?: (value: boolean) => void }
    > = new Map();
    private _selectMetadata: Map<
        string,
        { storageKey: string; defaultValue: number; onRefresh?: (value: number) => void }
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
        this._focusableOrder = [];

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
        const nowPlayingAutoHide = this._loadClampedNowPlayingAutoHide();

        return [
            {
                title: 'Audio',
                items: [
                    {
                        id: 'settings-dts-passthrough',
                        label: 'DTS Passthrough',
                        description: 'Enable if you have an eARC receiver',
                        value: this._loadBoolSetting(SETTINGS_STORAGE_KEYS.DTS_PASSTHROUGH, DEFAULT_SETTINGS.audio.dtsPassthrough),
                        onChange: (value: boolean) =>
                            this._saveBoolSetting(SETTINGS_STORAGE_KEYS.DTS_PASSTHROUGH, value),
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
                        onChange: (value: boolean): void => {
                            this._saveBoolSetting(SETTINGS_STORAGE_KEYS.SCANLINE_EFFECT, value);
                            this._applyScanlineEffect(value);
                        },
                    },
                    {
                        id: 'settings-now-playing-timeout',
                        label: 'Now Playing Auto-Hide',
                        description: 'Info overlay hide delay',
                        value: nowPlayingAutoHide,
                        options: NOW_PLAYING_INFO_AUTO_HIDE_OPTIONS.map((value) => ({
                            label: `${Math.round(value / 1000)}s`,
                            value,
                        })),
                        onChange: (value: number): void => {
                            this._saveNumberSetting(SETTINGS_STORAGE_KEYS.NOW_PLAYING_INFO_AUTO_HIDE_MS, value);
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
                        onChange: (value: boolean) =>
                            this._saveBoolSetting(SETTINGS_STORAGE_KEYS.DEBUG_LOGGING, value),
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
            const element = this._createItem(item);
            items.appendChild(element);
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

        const focusableIds = [...this._focusableOrder];
        this._focusableIds = focusableIds;

        for (let i = 0; i < focusableIds.length; i++) {
            const id = focusableIds[i];
            if (!id) continue;

            const element = this._getFocusableElement(id);
            if (!element) continue;

            const upId = i > 0 ? focusableIds[i - 1] : undefined;
            const downId = i < focusableIds.length - 1 ? focusableIds[i + 1] : undefined;

            const neighbors: FocusableElement['neighbors'] = {};
            if (upId) neighbors.up = upId;
            if (downId) neighbors.down = downId;

            const focusable: FocusableElement = {
                id,
                element,
                neighbors,
                onSelect: () => element.click(),
            };
            nav.registerFocusable(focusable);
        }

        // Set initial focus to first toggle
        const firstId = focusableIds[0];
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

    private _loadNumberSetting(key: string, defaultValue: number): number {
        const raw = safeLocalStorageGet(key);
        if (raw === null) return defaultValue;
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : defaultValue;
    }

    /**
     * Save a boolean setting to localStorage.
     */
    private _saveBoolSetting(key: string, value: boolean): void {
        safeLocalStorageSet(key, value ? '1' : '0');
    }

    private _saveNumberSetting(key: string, value: number): void {
        safeLocalStorageSet(key, String(value));
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
        for (const [id, meta] of this._selectMetadata.entries()) {
            const select = this._selectElements.get(id);
            if (!select) continue;
            const value = id === 'settings-now-playing-timeout'
                ? this._loadClampedNowPlayingAutoHide()
                : this._loadNumberSetting(meta.storageKey, meta.defaultValue);
            select.update(value);
            meta.onRefresh?.(value);
        }
    }

    private _loadClampedNowPlayingAutoHide(): number {
        const rawValue = this._loadNumberSetting(
            SETTINGS_STORAGE_KEYS.NOW_PLAYING_INFO_AUTO_HIDE_MS,
            DEFAULT_SETTINGS.display.nowPlayingInfoAutoHideMs
        );
        if (NOW_PLAYING_INFO_AUTO_HIDE_OPTIONS.includes(rawValue as (typeof NOW_PLAYING_INFO_AUTO_HIDE_OPTIONS)[number])) {
            return rawValue;
        }
        const fallback = NOW_PLAYING_INFO_DEFAULTS.autoHideMs;
        this._saveNumberSetting(SETTINGS_STORAGE_KEYS.NOW_PLAYING_INFO_AUTO_HIDE_MS, fallback);
        return fallback;
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

    private _inferSelectMetadata(
        id: string
    ): { storageKey: string; defaultValue: number; onRefresh?: (value: number) => void } | null {
        switch (id) {
            case 'settings-now-playing-timeout':
                return {
                    storageKey: SETTINGS_STORAGE_KEYS.NOW_PLAYING_INFO_AUTO_HIDE_MS,
                    defaultValue: DEFAULT_SETTINGS.display.nowPlayingInfoAutoHideMs,
                };
            default:
                return null;
        }
    }

    private _createItem(item: SettingsItemConfig): HTMLElement {
        if (isSelectItem(item)) {
            const select = createSettingsSelect(item);
            this._selectElements.set(item.id, select);
            const meta = this._inferSelectMetadata(item.id);
            if (meta) {
                this._selectMetadata.set(item.id, meta);
            }
            this._focusableOrder.push(item.id);
            return select.element;
        }

        const toggle = createSettingsToggle(item);
        this._toggleElements.set(item.id, toggle);
        const meta = this._inferToggleMetadata(item.id);
        if (meta) {
            this._toggleMetadata.set(item.id, meta);
        }
        this._focusableOrder.push(item.id);
        return toggle.element;
    }

    private _getFocusableElement(id: string): HTMLButtonElement | null {
        const toggle = this._toggleElements.get(id);
        if (toggle) return toggle.element;
        const select = this._selectElements.get(id);
        if (select) return select.element;
        return null;
    }

    /**
     * Destroy the component.
     */
    public destroy(): void {
        this._unregisterFocusables();
        this._toggleElements.clear();
        this._selectElements.clear();
        this._toggleMetadata.clear();
        this._selectMetadata.clear();
        this._focusableOrder = [];
        this._container.innerHTML = '';
    }
}

function isSelectItem(item: SettingsItemConfig): item is SettingsSelectConfig {
    return 'options' in item;
}
