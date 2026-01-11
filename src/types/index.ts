/**
 * @fileoverview Shared application types and constants.
 */

export type AppMode = 'real' | 'demo';

export const STORAGE_KEYS = {
    MODE: 'retune_mode',
    CHANNELS_REAL: 'retune_channels_v4',
    CHANNELS_DEMO: 'retune_channels_demo_v1',
    CLIENT_ID: 'retune_client_id',
    CURRENT_CHANNEL: 'retune_current_channel_v4',
} as const;
