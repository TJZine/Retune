/**
 * @fileoverview Settings module public exports.
 * @module modules/ui/settings
 * @version 1.0.0
 */

export { SettingsScreen } from './SettingsScreen';
export { createSettingsToggle } from './SettingsToggle';
export { SETTINGS_STORAGE_KEYS, DEFAULT_SETTINGS, THEME_CLASSES } from './constants';
export type {
    SettingsConfig,
    AudioSettings,
    DisplaySettings,
    DeveloperSettings,
    SettingsToggleConfig,
    SettingsSectionConfig,
} from './types';
