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
import { readStoredBoolean, safeLocalStorageGet, safeLocalStorageRemove, safeLocalStorageSet } from '../../../utils/storage';
import { ThemeManager } from '../theme';

const SUBTITLE_LANGUAGE_OPTIONS: Array<{ label: string; code: string | null }> = [
    { label: 'Auto (Plex)', code: null },
    { label: 'English', code: 'en' },
    { label: 'Spanish', code: 'es' },
    { label: 'French', code: 'fr' },
    { label: 'German', code: 'de' },
    { label: 'Italian', code: 'it' },
    { label: 'Portuguese', code: 'pt' },
    { label: 'Russian', code: 'ru' },
    { label: 'Japanese', code: 'ja' },
    { label: 'Korean', code: 'ko' },
    { label: 'Chinese', code: 'zh' },
];

type ToggleMetadata = {
    storageKey: string;
    defaultValue: boolean;
    onRefresh?: (value: boolean) => void;
};

type SelectMetadata = {
    storageKey: string;
    defaultValue: number;
    onRefresh?: (value: number) => void;
};

const TOGGLE_METADATA: Record<string, ToggleMetadata> = {
    'settings-dts-passthrough': {
        storageKey: SETTINGS_STORAGE_KEYS.DTS_PASSTHROUGH,
        defaultValue: DEFAULT_SETTINGS.audio.dtsPassthrough,
    },
    'settings-direct-play-audio-fallback': {
        storageKey: SETTINGS_STORAGE_KEYS.DIRECT_PLAY_AUDIO_FALLBACK,
        defaultValue: DEFAULT_SETTINGS.audio.directPlayAudioFallback,
    },
    'settings-debug-logging': {
        storageKey: SETTINGS_STORAGE_KEYS.DEBUG_LOGGING,
        defaultValue: DEFAULT_SETTINGS.developer.debugLogging,
    },
    'settings-subtitle-debug-logging': {
        storageKey: SETTINGS_STORAGE_KEYS.SUBTITLE_DEBUG_LOGGING,
        defaultValue: DEFAULT_SETTINGS.developer.subtitleDebugLogging,
    },
    'settings-subtitles-enabled': {
        storageKey: SETTINGS_STORAGE_KEYS.SUBTITLES_ENABLED,
        defaultValue: DEFAULT_SETTINGS.subtitles.enabled,
    },
    'settings-subtitles-global': {
        storageKey: SETTINGS_STORAGE_KEYS.SUBTITLE_PREFERENCE_GLOBAL_OVERRIDE,
        defaultValue: DEFAULT_SETTINGS.subtitles.useGlobalPreference,
    },
    'settings-subtitles-prefer-forced': {
        storageKey: SETTINGS_STORAGE_KEYS.SUBTITLE_PREFER_FORCED,
        defaultValue: DEFAULT_SETTINGS.subtitles.preferForced,
    },
};

const SELECT_METADATA: Record<string, SelectMetadata> = {
    'settings-now-playing-timeout': {
        storageKey: SETTINGS_STORAGE_KEYS.NOW_PLAYING_INFO_AUTO_HIDE_MS,
        defaultValue: DEFAULT_SETTINGS.display.nowPlayingInfoAutoHideMs,
    },
    'settings-subtitle-language': {
        storageKey: SETTINGS_STORAGE_KEYS.SUBTITLE_LANGUAGE,
        defaultValue: 0,
    },
};

/**
 * Settings screen component.
 * Manages settings display, focus navigation, and persistence.
 */
export class SettingsScreen {
    private _container: HTMLElement;
    private _getNavigation: () => INavigationManager | null;
    private _onSubtitlesEnabledChange: ((enabled: boolean) => void) | null = null;
    private _focusableIds: string[] = [];
    private _toggleElements: Map<string, ReturnType<typeof createSettingsToggle>> = new Map();
    private _selectElements: Map<string, ReturnType<typeof createSettingsSelect>> = new Map();
    private _focusableOrder: string[] = [];
    private _toggleMetadata: Map<string, ToggleMetadata> = new Map();
    private _selectMetadata: Map<string, SelectMetadata> = new Map();

    constructor(
        container: HTMLElement,
        getNavigation: () => INavigationManager | null,
        onSubtitlesEnabledChange?: (enabled: boolean) => void
    ) {
        this._container = container;
        this._getNavigation = getNavigation;
        this._onSubtitlesEnabledChange = onSubtitlesEnabledChange ?? null;
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
        const nowPlayingAutoHide = this._loadClampedNowPlayingAutoHide();
        const themeValue = ThemeManager.getInstance().getTheme() === 'retro' ? 1 : 0;
        const subtitlesEnabled = this._loadBoolSetting(
            SETTINGS_STORAGE_KEYS.SUBTITLES_ENABLED,
            DEFAULT_SETTINGS.subtitles.enabled
        );
        const useGlobalSubtitlePreference = this._loadBoolSetting(
            SETTINGS_STORAGE_KEYS.SUBTITLE_PREFERENCE_GLOBAL_OVERRIDE,
            DEFAULT_SETTINGS.subtitles.useGlobalPreference
        );
        const preferForcedSubtitles = this._loadBoolSetting(
            SETTINGS_STORAGE_KEYS.SUBTITLE_PREFER_FORCED,
            DEFAULT_SETTINGS.subtitles.preferForced
        );
        const subtitleLanguageValue = this._loadSubtitleLanguageValue();

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
                    {
                        id: 'settings-direct-play-audio-fallback',
                        label: 'Direct Play Audio Fallback',
                        description: 'Allow Direct Play using a compatible fallback audio track',
                        value: this._loadBoolSetting(
                            SETTINGS_STORAGE_KEYS.DIRECT_PLAY_AUDIO_FALLBACK,
                            DEFAULT_SETTINGS.audio.directPlayAudioFallback
                        ),
                        onChange: (value: boolean) =>
                            this._saveBoolSetting(SETTINGS_STORAGE_KEYS.DIRECT_PLAY_AUDIO_FALLBACK, value),
                    },
                ],
            },
            {
                title: 'Subtitles',
                items: [
                    {
                        id: 'settings-subtitles-enabled',
                        label: 'Subtitles (beta)',
                        description: 'Enable text-based subtitle tracks',
                        value: subtitlesEnabled,
                        onChange: (value: boolean): void => {
                            this._saveBoolSetting(SETTINGS_STORAGE_KEYS.SUBTITLES_ENABLED, value);
                            this._updateSubtitleDependentControls(value);
                            this._onSubtitlesEnabledChange?.(value);
                        },
                    },
                    {
                        id: 'settings-subtitle-language',
                        label: 'Preferred Subtitle Language',
                        description: 'Override Plex user preference (Auto uses Plex)',
                        value: subtitleLanguageValue,
                        options: SUBTITLE_LANGUAGE_OPTIONS.map((option, index) => ({
                            label: option.label,
                            value: index,
                        })),
                        disabled: !subtitlesEnabled,
                        disabledReason: 'Enable Subtitles (beta) first',
                        onChange: (value: number): void => {
                            this._saveSubtitleLanguageValue(value);
                        },
                    },
                    {
                        id: 'settings-subtitles-global',
                        label: 'Use Global Subtitle Preference',
                        description: 'Apply a single subtitle choice to all channels',
                        value: useGlobalSubtitlePreference,
                        disabled: !subtitlesEnabled,
                        disabledReason: 'Enable Subtitles (beta) first',
                        onChange: (value: boolean): void => {
                            this._saveBoolSetting(
                                SETTINGS_STORAGE_KEYS.SUBTITLE_PREFERENCE_GLOBAL_OVERRIDE,
                                value
                            );
                        },
                    },
                    {
                        id: 'settings-subtitles-prefer-forced',
                        label: 'Prefer Forced Subtitles',
                        description: 'Auto-select forced (partial) subtitles over full subtitles',
                        value: preferForcedSubtitles,
                        disabled: !subtitlesEnabled,
                        disabledReason: 'Enable Subtitles (beta) first',
                        onChange: (value: boolean): void => {
                            this._saveBoolSetting(
                                SETTINGS_STORAGE_KEYS.SUBTITLE_PREFER_FORCED,
                                value
                            );
                        },
                    },
                ],
            },
            {
                title: 'Display',
                items: [
                    {
                        id: 'settings-theme',
                        label: 'Theme',
                        description: 'Visual style of the application',
                        value: themeValue,
                        options: [
                            { label: 'Default', value: 0 },
                            { label: 'Retro', value: 1 },
                        ],
                        onChange: (value: number): void => {
                            const theme = value === 1 ? 'retro' : 'default';
                            ThemeManager.getInstance().setTheme(theme);
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
                    {
                        id: 'settings-subtitle-debug-logging',
                        label: 'Subtitle Debug Logging',
                        description: 'Log subtitle tracks and native textTracks state (tokens redacted)',
                        value: this._loadBoolSetting(
                            SETTINGS_STORAGE_KEYS.SUBTITLE_DEBUG_LOGGING,
                            DEFAULT_SETTINGS.developer.subtitleDebugLogging
                        ),
                        onChange: (value: boolean) =>
                            this._saveBoolSetting(SETTINGS_STORAGE_KEYS.SUBTITLE_DEBUG_LOGGING, value),
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

        const focusableIds = this._focusableOrder.filter((id) => this._isFocusableEnabled(id));
        this._focusableIds = focusableIds;

        const currentFocusId = nav.getFocusedElement()?.id ?? null;
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

        // Preserve current focus if still enabled, otherwise focus the first available
        const preferredId = currentFocusId && focusableIds.includes(currentFocusId)
            ? currentFocusId
            : focusableIds[0];
        if (preferredId) {
            nav.setFocus(preferredId);
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
        return readStoredBoolean(key, defaultValue);
    }

    private _loadNumberSetting(key: string, defaultValue: number): number {
        const raw = safeLocalStorageGet(key);
        if (raw === null) return defaultValue;
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : defaultValue;
    }

    private _loadSubtitleLanguageValue(): number {
        const raw = safeLocalStorageGet(SETTINGS_STORAGE_KEYS.SUBTITLE_LANGUAGE);
        if (raw === null) return 0;
        const normalized = raw.trim().toLowerCase();
        if (!normalized) {
            safeLocalStorageRemove(SETTINGS_STORAGE_KEYS.SUBTITLE_LANGUAGE);
            return 0;
        }
        const index = SUBTITLE_LANGUAGE_OPTIONS.findIndex((option) => {
            if (!option.code) return false;
            return option.code.toLowerCase() === normalized;
        });
        if (index >= 0) return index;
        safeLocalStorageRemove(SETTINGS_STORAGE_KEYS.SUBTITLE_LANGUAGE);
        return 0;
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

    private _saveSubtitleLanguageValue(value: number): void {
        const option = SUBTITLE_LANGUAGE_OPTIONS[value];
        if (!option || !option.code) {
            safeLocalStorageRemove(SETTINGS_STORAGE_KEYS.SUBTITLE_LANGUAGE);
            return;
        }
        safeLocalStorageSet(SETTINGS_STORAGE_KEYS.SUBTITLE_LANGUAGE, option.code);
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
                : id === 'settings-subtitle-language'
                    ? this._loadSubtitleLanguageValue()
                    : this._loadNumberSetting(meta.storageKey, meta.defaultValue);
            select.update(value);
            meta.onRefresh?.(value);
        }
        const themeSelect = this._selectElements.get('settings-theme');
        if (themeSelect) {
            const themeValue = ThemeManager.getInstance().getTheme() === 'retro' ? 1 : 0;
            themeSelect.update(themeValue);
        }
        const subtitlesEnabled = this._loadBoolSetting(
            SETTINGS_STORAGE_KEYS.SUBTITLES_ENABLED,
            DEFAULT_SETTINGS.subtitles.enabled
        );
        this._updateSubtitleDependentControls(subtitlesEnabled);
    }

    private _updateSubtitleDependentControls(subtitlesEnabled: boolean): void {
        const subtitleLanguage = this._selectElements.get('settings-subtitle-language');
        subtitleLanguage?.setDisabled(!subtitlesEnabled);
        const subtitleGlobal = this._toggleElements.get('settings-subtitles-global');
        subtitleGlobal?.setDisabled(!subtitlesEnabled);
        const subtitlePreferForced = this._toggleElements.get('settings-subtitles-prefer-forced');
        subtitlePreferForced?.setDisabled(!subtitlesEnabled);
        if (this._container.classList.contains('visible') && this._focusableIds.length > 0) {
            this._unregisterFocusables();
            this._registerFocusables();
        }
    }

    private _isFocusableEnabled(id: string): boolean {
        const toggle = this._toggleElements.get(id);
        if (toggle) {
            return !toggle.isDisabled();
        }
        const select = this._selectElements.get(id);
        if (select) {
            return !select.isDisabled();
        }
        return false;
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
    ): ToggleMetadata | null {
        return TOGGLE_METADATA[id] ?? null;
    }

    private _inferSelectMetadata(
        id: string
    ): SelectMetadata | null {
        return SELECT_METADATA[id] ?? null;
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
