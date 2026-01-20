export interface ChannelSetupConfig {
    serverId: string;
    selectedLibraryIds: string[];
    maxChannels: number;
    enabledStrategies: {
        collections: boolean;
        libraryFallback: boolean;
        playlists: boolean;
        genres: boolean;
        directors: boolean;
        decades: boolean;
        runtimeRanges: boolean;
    };
    minItemsPerChannel: number;
}

export interface ChannelBuildSummary {
    created: number;
    skipped: number;
    reachedMaxChannels: boolean;
    errorCount: number;
    canceled: boolean;
    lastTask?: string;
}

export interface ChannelBuildProgress {
    task: 'fetch_playlists' | 'fetch_collections' | 'scan_library_items' | 'build_pending' | 'create_channels' | 'apply_channels' | 'refresh_epg' | 'done';
    label: string;              // “Fetching collections…”
    detail: string;             // “Library: Movies” / “Channel 12 of 80”
    current: number;            // units completed in this task
    total: number | null;       // null = indeterminate
}

export interface ChannelSetupRecord extends ChannelSetupConfig {
    createdAt: number;
    updatedAt: number;
}
