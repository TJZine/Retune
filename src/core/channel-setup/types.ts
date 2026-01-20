export interface ChannelSetupConfig {
    serverId: string;
    selectedLibraryIds: string[];
    maxChannels: number;
    buildMode: 'replace' | 'append' | 'merge';
    enabledStrategies: {
        collections: boolean;
        libraryFallback: boolean;
        playlists: boolean;
        genres: boolean;
        directors: boolean;
        decades: boolean;
        recentlyAdded: boolean;
        studios: boolean;
        actors: boolean;
    };
    actorStudioCombineMode: 'separate' | 'combined';
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

export interface ChannelSetupEstimates {
    total: number;
    collections: number;
    libraryFallback: number;
    playlists: number;
    genres: number;
    directors: number;
    decades: number;
    recentlyAdded: number;
    studios: number;
    actors: number;
}

export interface ChannelSetupPreview {
    estimates: ChannelSetupEstimates;
    warnings: string[];
    reachedMaxChannels: boolean;
}

export interface ChannelSetupDiffSummary {
    created: number;
    removed: number;
    unchanged: number;
}

export interface ChannelSetupDiffSample {
    created: string[];
    removed: string[];
    unchanged: string[];
}

export interface ChannelSetupDiff {
    summary: ChannelSetupDiffSummary;
    samples: ChannelSetupDiffSample;
}

export interface ChannelSetupReview {
    preview: ChannelSetupPreview;
    diff: ChannelSetupDiff;
}

export interface ChannelSetupRecord extends ChannelSetupConfig {
    createdAt: number;
    updatedAt: number;
}
