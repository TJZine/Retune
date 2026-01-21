/**
 * @fileoverview Centralized theme management.
 * @module modules/ui/theme/ThemeManager
 */

import { THEME_CLASSES } from '../settings/constants';
import type { DisplaySettings } from '../settings/types';
import { safeLocalStorageGet, safeLocalStorageSet } from '../../../utils/storage';
import { RETUNE_STORAGE_KEYS } from '../../../config/storageKeys';

type ThemeName = DisplaySettings['theme'];

/**
 * Manages application theming.
 * Applies/removes theme classes on document.body.
 */
export class ThemeManager {
    private static _instance: ThemeManager | null = null;
    private _currentTheme: ThemeName = 'default';

    static getInstance(): ThemeManager {
        if (!ThemeManager._instance) {
            ThemeManager._instance = new ThemeManager();
        }
        return ThemeManager._instance;
    }

    private constructor() {
        this._loadSavedTheme();
    }

    private _loadSavedTheme(): void {
        const saved = safeLocalStorageGet(RETUNE_STORAGE_KEYS.THEME);
        if (saved === 'retro' || saved === 'default') {
            this._currentTheme = saved;
            this._applyTheme(saved);
        } else {
            this._applyTheme(this._currentTheme);
        }
    }

    getTheme(): ThemeName {
        return this._currentTheme;
    }

    setTheme(theme: ThemeName): void {
        if (theme === this._currentTheme) return;
        this._currentTheme = theme;
        safeLocalStorageSet(RETUNE_STORAGE_KEYS.THEME, theme);
        this._applyTheme(theme);
    }

    private _applyTheme(theme: ThemeName): void {
        const classes = Object.values(THEME_CLASSES).filter((value) => value !== '');
        if (classes.length > 0) {
            document.body.classList.remove(...classes);
        }

        const themeClass = THEME_CLASSES[theme];
        if (themeClass) {
            document.body.classList.add(themeClass);
        }
    }
}
