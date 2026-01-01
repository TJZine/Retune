/**
 * @module AppConfig
 * @description Central configuration and constants for Retune application
 * @version 1.0.0
 */

// ============================================
// APPLICATION METADATA
// ============================================

export const APP_META = {
  NAME: 'Retune',
  VERSION: '1.0.0',
  DESCRIPTION: 'Virtual TV Channels from Plex',
  VENDOR: 'Retune',
  APP_ID: 'com.retune.plexchannels',
} as const;

// ============================================
// PLEX API CONFIGURATION
// ============================================

export const PLEX_CONFIG = {
  /** Base URL for plex.tv services */
  PLEX_TV_BASE_URL: 'https://plex.tv/api/v2',
  
  /** PIN endpoint for OAuth */
  PIN_ENDPOINT: '/pins',
  
  /** User profile endpoint */
  USER_ENDPOINT: '/user',
  
  /** Resources (servers) endpoint */
  RESOURCES_ENDPOINT: '/resources',
  
  /** Poll interval for PIN claiming (ms) */
  PIN_POLL_INTERVAL_MS: 1000,
  
  /** PIN expiration timeout (ms) - 5 minutes */
  PIN_TIMEOUT_MS: 300_000,
  
  /** API rate limit (requests per minute) */
  RATE_LIMIT_RPM: 100,
  
  /** Default request timeout (ms) */
  REQUEST_TIMEOUT_MS: 10_000,
  
  /** Connection test timeout (ms) */
  CONNECTION_TEST_TIMEOUT_MS: 5_000,
  
  /** Default Plex headers */
  DEFAULT_HEADERS: {
    'Accept': 'application/json',
    'X-Plex-Product': APP_META.NAME,
    'X-Plex-Version': APP_META.VERSION,
    'X-Plex-Platform': 'webOS',
    'X-Plex-Device': 'LG Smart TV',
  },
} as const;

// ============================================
// VIDEO PLAYER CONFIGURATION
// ============================================

export const PLAYER_CONFIG = {
  /** Default volume (0.0 - 1.0) */
  DEFAULT_VOLUME: 0.8,
  
  /** Target buffer ahead (ms) */
  BUFFER_AHEAD_MS: 30_000,
  
  /** Default seek increment (seconds) */
  SEEK_INCREMENT_SEC: 10,
  
  /** Auto-hide controls after (ms) */
  HIDE_CONTROLS_AFTER_MS: 5_000,
  
  /** Retry attempts on recoverable error */
  RETRY_ATTEMPTS: 3,
  
  /** Delay between retries (ms) */
  RETRY_DELAY_MS: 2_000,
  
  /** Retry backoff multiplier */
  RETRY_BACKOFF_MULTIPLIER: 2,
  
  /** Keep-alive interval (ms) - prevents webOS suspension */
  KEEP_ALIVE_INTERVAL_MS: 30_000,
  
  /** Time update event throttle (ms) */
  TIME_UPDATE_THROTTLE_MS: 250,
} as const;

// ============================================
// SCHEDULER CONFIGURATION
// ============================================

export const SCHEDULER_CONFIG = {
  /** Sync timer interval (ms) */
  SYNC_INTERVAL_MS: 1_000,
  
  /** Schedule stale threshold (ms) - 30 minutes */
  STALE_THRESHOLD_MS: 30 * 60 * 1_000,
  
  /** Maximum items per channel */
  MAX_CHANNEL_ITEMS: 10_000,
  
  /** Maximum schedule lookahead (hours) */
  SCHEDULE_LOOKAHEAD_HOURS: 24,
  
  /** Clock drift tolerance before resync (ms) */
  CLOCK_DRIFT_TOLERANCE_MS: 5_000,
} as const;

// ============================================
// CHANNEL CONFIGURATION
// ============================================

export const CHANNEL_CONFIG = {
  /** Maximum number of channels */
  MAX_CHANNELS: 50,
  
  /** Minimum channel number */
  MIN_CHANNEL_NUMBER: 1,
  
  /** Maximum channel number */
  MAX_CHANNEL_NUMBER: 999,
  
  /** Maximum channel name length */
  MAX_NAME_LENGTH: 50,
  
  /** Content refresh interval (ms) - 1 hour */
  CONTENT_REFRESH_INTERVAL_MS: 60 * 60 * 1_000,
  
  /** Default shuffle seed if not specified */
  DEFAULT_SHUFFLE_SEED: 42,
} as const;

// ============================================
// EPG CONFIGURATION
// ============================================

export const EPG_CONFIG = {
  /** Visible channel rows at once */
  VISIBLE_CHANNELS: 5,
  
  /** Grid time slot granularity (minutes) */
  TIME_SLOT_MINUTES: 30,
  
  /** Visible hours at once */
  VISIBLE_HOURS: 3,
  
  /** Total hours in schedule */
  TOTAL_HOURS: 24,
  
  /** Pixels per minute (width scaling) */
  PIXELS_PER_MINUTE: 4,
  
  /** Pixels per channel row */
  ROW_HEIGHT: 80,
  
  /** Virtualization row buffer */
  ROW_BUFFER: 2,
  
  /** Virtualization time buffer (minutes) */
  TIME_BUFFER_MINUTES: 60,
  
  /** Current time indicator update interval (ms) */
  TIME_INDICATOR_UPDATE_MS: 60_000,
  
  /** Maximum DOM elements for grid cells */
  MAX_DOM_ELEMENTS: 200,
} as const;

// ============================================
// NAVIGATION CONFIGURATION
// ============================================

export const NAVIGATION_CONFIG = {
  /** Key repeat initial delay (ms) */
  KEY_REPEAT_DELAY_MS: 500,
  
  /** Key repeat interval (ms) */
  KEY_REPEAT_INTERVAL_MS: 100,
  
  /** Long press threshold (ms) */
  LONG_PRESS_THRESHOLD_MS: 500,
  
  /** Channel number input timeout (ms) - wait for additional digits */
  CHANNEL_INPUT_TIMEOUT_MS: 2_000,
  
  /** Maximum channel number digits */
  CHANNEL_MAX_DIGITS: 3,
  
  /** Screen transition duration (ms) */
  SCREEN_TRANSITION_MS: 200,
  
  /** Focus transition duration (ms) */
  FOCUS_TRANSITION_MS: 150,
  
  /** Input block duration after transition (ms) */
  INPUT_BLOCK_DURATION_MS: 200,
} as const;

// ============================================
// UI CONFIGURATION
// ============================================

export const UI_CONFIG = {
  /** Safe zone margin (percentage) */
  SAFE_ZONE_PERCENT: 5,
  
  /** Minimum text size for titles (px) */
  MIN_TITLE_SIZE_PX: 24,
  
  /** Minimum text size for body (px) */
  MIN_BODY_SIZE_PX: 18,
  
  /** Minimum focus target size (px) */
  MIN_FOCUS_TARGET_PX: 48,
  
  /** Focus ring width (px) */
  FOCUS_RING_WIDTH_PX: 4,
  
  /** Focus scale factor */
  FOCUS_SCALE: 1.05,
  
  /** Animation duration (ms) */
  ANIMATION_DURATION_MS: 150,
  
  /** Toast notification duration (ms) */
  TOAST_DURATION_MS: 3_000,
  
  /** Info overlay auto-hide (ms) */
  INFO_OVERLAY_HIDE_MS: 5_000,
} as const;

// ============================================
// STORAGE CONFIGURATION
// ============================================

export const STORAGE_CONFIG = {
  /** LocalStorage key prefix */
  KEY_PREFIX: 'retune_',
  
  /** Auth data storage key */
  AUTH_KEY: 'retune_plex_auth',
  
  /** Client identifier storage key */
  CLIENT_ID_KEY: 'retune_client_id',
  
  /** Channel config storage key */
  CHANNELS_KEY: 'retune_channels',
  
  /** User preferences storage key */
  PREFERENCES_KEY: 'retune_preferences',
  
  /** App state storage key */
  STATE_KEY: 'retune_app_state',
  
  /** Maximum storage size (bytes) - 5MB */
  MAX_STORAGE_BYTES: 5 * 1024 * 1024,
  
  /** State schema version */
  STATE_VERSION: 1,
} as const;

// ============================================
// LIFECYCLE CONFIGURATION
// ============================================

export const LIFECYCLE_CONFIG = {
  /** Network check interval (ms) */
  NETWORK_CHECK_INTERVAL_MS: 60_000,
  
  /** Memory monitor interval (ms) */
  MEMORY_CHECK_INTERVAL_MS: 30_000,
  
  /** Memory warning threshold (percentage) */
  MEMORY_WARNING_THRESHOLD: 0.8,
  
  /** Stale data threshold after resume (ms) - 30 min */
  STALE_RESUME_THRESHOLD_MS: 30 * 60 * 1_000,
  
  /** Maximum terminate callback time (ms) */
  TERMINATE_TIMEOUT_MS: 3_000,
} as const;

// ============================================
// PERFORMANCE CONFIGURATION
// ============================================

export const PERFORMANCE_CONFIG = {
  /** Target frame rate */
  TARGET_FPS: 60,
  
  /** Maximum frame time (ms) */
  MAX_FRAME_TIME_MS: 16.67,
  
  /** Maximum memory usage (MB) */
  MAX_MEMORY_MB: 300,
  
  /** Target channel switch time (ms) */
  TARGET_CHANNEL_SWITCH_MS: 3_000,
  
  /** Maximum schedule calculation time (ms) */
  MAX_SCHEDULE_CALC_MS: 50,
} as const;

// ============================================
// FEATURE FLAGS
// ============================================

export const FEATURE_FLAGS = {
  /** Enable debug logging */
  DEBUG_MODE: process.env.NODE_ENV !== 'production',
  
  /** Enable performance monitoring */
  PERF_MONITORING: process.env.NODE_ENV !== 'production',
  
  /** Enable experimental features */
  EXPERIMENTAL: false,
  
  /** Enable analytics (if added) */
  ANALYTICS: false,
  
  /** Enable skip intro feature */
  SKIP_INTRO: true,
  
  /** Enable skip credits feature */
  SKIP_CREDITS: true,
  
  /** Enable pointer mode for Magic Remote */
  POINTER_MODE: true,
  
  /** Enable focus memory per screen */
  FOCUS_MEMORY: true,
} as const;

// ============================================
// ERROR MESSAGES
// ============================================

export const ERROR_MESSAGES: Record<string, string> = {
  // Auth errors
  AUTH_REQUIRED: 'Please sign in to your Plex account.',
  AUTH_INVALID: 'Your Plex session has expired. Please sign in again.',
  AUTH_FAILED: 'Failed to authenticate with Plex. Please try again.',
  
  // Network errors
  NETWORK_UNAVAILABLE: 'Network connection lost. Please check your internet.',
  SERVER_UNREACHABLE: 'Cannot connect to your Plex server.',
  REQUEST_TIMEOUT: 'Request timed out. Please try again.',
  
  // Playback errors
  PLAYBACK_FAILED: 'Unable to play this content.',
  FORMAT_UNSUPPORTED: 'This media format is not supported on your TV.',
  STREAM_ERROR: 'Error loading video stream.',
  
  // Channel errors
  CHANNEL_EMPTY: 'This channel has no content to play.',
  CONTENT_UNAVAILABLE: 'Some content is no longer available.',
  
  // Generic
  UNKNOWN_ERROR: 'An unexpected error occurred.',
} as const;

// ============================================
// WEBOS KEY CODES
// ============================================

export const WEBOS_KEY_CODES = {
  // Navigation
  OK: 13,
  BACK: 461,
  UP: 38,
  DOWN: 40,
  LEFT: 37,
  RIGHT: 39,
  
  // Playback
  PLAY: 415,
  PAUSE: 19,
  STOP: 413,
  REWIND: 412,
  FAST_FORWARD: 417,
  
  // Channel
  CHANNEL_UP: 33,
  CHANNEL_DOWN: 34,
  
  // Color buttons
  RED: 403,
  GREEN: 404,
  BLUE: 405,
  YELLOW: 406,
  
  // Numbers
  NUM_0: 48,
  NUM_1: 49,
  NUM_2: 50,
  NUM_3: 51,
  NUM_4: 52,
  NUM_5: 53,
  NUM_6: 54,
  NUM_7: 55,
  NUM_8: 56,
  NUM_9: 57,
  
  // Special
  INFO: 457,
  GUIDE: 458,
} as const;

// ============================================
// CSS CUSTOM PROPERTIES
// ============================================

export const CSS_VARIABLES = {
  // Colors
  '--primary-color': '#1a1a2e',
  '--secondary-color': '#16213e',
  '--accent-color': '#00a8e1',
  '--focus-color': '#00a8e1',
  '--focus-glow-color': 'rgba(0, 168, 225, 0.5)',
  '--error-color': '#ff4444',
  '--success-color': '#44bb44',
  '--text-primary': '#ffffff',
  '--text-secondary': 'rgba(255, 255, 255, 0.7)',
  
  // Spacing
  '--safe-zone': '5%',
  '--grid-gap': '8px',
  '--card-padding': '16px',
  
  // Sizing
  '--focus-ring-width': '4px',
  '--focus-scale': '1.05',
  '--row-height': '80px',
  
  // Timing
  '--transition-fast': '150ms',
  '--transition-normal': '250ms',
  '--transition-slow': '400ms',
} as const;

// ============================================
// CSS ANIMATION EASINGS (MINOR-005)
// ============================================

export const CSS_EASINGS = {
  /** Standard easing for most transitions */
  STANDARD: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
  
  /** Accelerate - for elements leaving screen */
  ACCELERATE: 'cubic-bezier(0.4, 0.0, 1, 1)',
  
  /** Decelerate - for elements entering screen */
  DECELERATE: 'cubic-bezier(0.0, 0.0, 0.2, 1)',
  
  /** Sharp - for elements changing state in place */
  SHARP: 'cubic-bezier(0.4, 0.0, 0.6, 1)',
  
  /** Focus ring animation */
  FOCUS: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  
  /** EPG scroll - feels weighty */
  SCROLL: 'cubic-bezier(0.33, 1, 0.68, 1)',
  
  /** Bounce for attention-grabbing animations */
  BOUNCE: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

// ============================================
// FOCUS MANAGEMENT CONFIGURATION
// ============================================

export const FOCUS_CONFIG = {
  /** Default focus group for screens */
  DEFAULT_FOCUS_GROUP: 'main',
  
  /** Focus wrap-around enabled by default */
  WRAP_AROUND_DEFAULT: true,
  
  /** Focus memory enabled per screen */
  FOCUS_MEMORY_ENABLED: true,
  
  /** Spatial navigation distance threshold (px) */
  SPATIAL_DISTANCE_THRESHOLD_PX: 500,
  
  /** Spatial navigation angle tolerance (degrees) */
  SPATIAL_ANGLE_TOLERANCE_DEG: 45,
} as const;

// ============================================
// STORAGE MIGRATION CONFIGURATION
// ============================================

export const STORAGE_MIGRATION_CONFIG = {
  /** Current schema version */
  CURRENT_VERSION: 1,
  
  /** Schema version format */
  VERSION_FORMAT: 'number' as const,
  
  /** Storage schema definition */
  SCHEMA: {
    version: 1,
    channels: 'ChannelConfig[]',
    channelOrder: 'string[]',
    currentChannelId: 'string | null',
    preferences: 'UserPreferences',
    lastUpdated: 'number (Unix timestamp ms)',
  },
  
  /** Validation rules */
  VALIDATION: {
    maxChannels: 100,
    maxNameLength: 50,
    validPlaybackModes: ['sequential', 'shuffle', 'random'] as const,
  },
} as const;

/**
 * Storage Migration Functions
 * Each function migrates from version N to N+1
 * 
 * Example migration from v1 to v2:
 * ```typescript
 * function migrateV1ToV2(data: V1PersistentState): V2PersistentState {
 *   return {
 *     ...data,
 *     version: 2,
 *     // Add new v2 fields with defaults
 *     newField: 'default_value',
 *     // Transform existing fields if needed
 *     channels: data.channels.map(ch => ({
 *       ...ch,
 *       newChannelField: (ch.existingField !== undefined && ch.existingField !== null)
 *         ? ch.existingField
 *         : 'fallback'
 *     }))
 *   };
 * }
 * ```
 */
export const STORAGE_MIGRATIONS: Record<number, (data: unknown) => unknown> = {
  // Add migrations as schema evolves:
  // 2: migrateV1ToV2,
  // 3: migrateV2ToV3,
};

/**
 * Current storage schema version.
 * Increment this when making breaking changes to stored data structures.
 */
export const STORAGE_SCHEMA_VERSION = 1;

/**
 * Run all pending migrations on stored data.
 * Call this when loading data from localStorage.
 * 
 * @example
 * ```typescript
 * const raw = JSON.parse(localStorage.getItem('retune_channels'));
 * const migrated = migrateStoredData<ChannelStorageData>(raw);
 * localStorage.setItem('retune_channels', JSON.stringify(migrated));
 * ```
 */
export function migrateStoredData<T>(
  data: { version?: number } & Record<string, unknown>
): T {
  let current = { ...data };
  const storedVersion = (current.version !== undefined && current.version !== null) ? current.version : 1;
  
  for (let v = storedVersion; v < STORAGE_SCHEMA_VERSION; v++) {
    const migration = STORAGE_MIGRATIONS[v + 1];
    if (migration) {
      console.log(`[Storage] Migrating from v${v} to v${v + 1}`);
      current = migration(current) as typeof current;
    }
  }
  
  current.version = STORAGE_SCHEMA_VERSION;
  return current as T;
}

// ============================================
// TYPESCRIPT CONFIGURATION (MINOR-004)
// ============================================

/**
 * TypeScript Compiler Configuration Requirements
 * 
 * The following tsconfig.json options MUST be enabled:
 * 
 * {
 *   "compilerOptions": {
 *     "strict": true,              // Enable all strict type checking options
 *     "noUnusedLocals": true,      // Report errors on unused locals
 *     "noUnusedParameters": true,  // Report errors on unused parameters
 *     "noImplicitReturns": true,   // Report error when not all code paths return
 *     "noFallthroughCasesInSwitch": true, // Report errors for fallthrough cases
 *     "exactOptionalPropertyTypes": true, // Differentiate undefined vs optional
 *     "noUncheckedIndexedAccess": true,   // Add undefined to index signatures
 *     "forceConsistentCasingInFileNames": true,
 *     "target": "ES2020",          // Chromium 68 supports ES2020
 *     "lib": ["DOM", "ES2020"],
 *     "module": "ESNext",
 *     "moduleResolution": "bundler"
 *   }
 * }
 */
export const TYPESCRIPT_CONFIG_REQUIREMENTS = {
  strict: true,
  noUnusedLocals: true,
  noUnusedParameters: true,
  noImplicitReturns: true,
  noFallthroughCasesInSwitch: true,
  exactOptionalPropertyTypes: true,
  noUncheckedIndexedAccess: true,
  target: 'ES2020',
} as const;
