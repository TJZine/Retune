import { PlaybackOptionsCoordinator } from '../PlaybackOptionsCoordinator';
import type { IVideoPlayer } from '../../../player';
import type { PlaybackOptionsViewModel } from '../types';
import type { ScheduledProgram } from '../../../scheduler/scheduler';
import type { SubtitleTrack, AudioTrack } from '../../../player/types';
import { RETUNE_STORAGE_KEYS } from '../../../../config/storageKeys';

const makeProgram = (ratingKey = 'item-1'): ScheduledProgram =>
    ({
        item: {
            ratingKey,
            title: 'Test Item',
            durationMs: 60000,
            type: 'movie',
        } as ScheduledProgram['item'],
        elapsedMs: 0,
        scheduledStartTime: 0,
        scheduledEndTime: 0,
        remainingMs: 0,
        scheduleIndex: 0,
    } as ScheduledProgram);

const makeTextTrack = (overrides: Partial<SubtitleTrack> = {}): SubtitleTrack =>
    ({
        id: 'sub-1',
        label: 'English (SRT)',
        languageCode: 'en',
        language: 'English',
        codec: 'srt',
        format: 'srt',
        forced: false,
        default: false,
        isTextCandidate: true,
        fetchableViaKey: true,
        ...overrides,
    } as SubtitleTrack);

const makeBurnInTrack = (overrides: Partial<SubtitleTrack> = {}): SubtitleTrack =>
    ({
        id: 'burn-1',
        label: 'English (PGS)',
        languageCode: 'en',
        language: 'English',
        codec: 'pgs',
        format: 'pgs',
        forced: false,
        default: false,
        isTextCandidate: false,
        fetchableViaKey: false,
        ...overrides,
    } as SubtitleTrack);

const createPlayer = (subtitles: SubtitleTrack[], audio: AudioTrack[] = []): IVideoPlayer =>
    ({
        getAvailableSubtitles: () => subtitles,
        getAvailableAudio: () => audio,
        getState: () => ({ activeSubtitleId: null, activeAudioId: null } as ReturnType<IVideoPlayer['getState']>),
        setSubtitleTrack: jest.fn().mockResolvedValue(undefined),
        setAudioTrack: jest.fn().mockResolvedValue(undefined),
    } as unknown as IVideoPlayer);

const getViewModel = (coordinator: PlaybackOptionsCoordinator): PlaybackOptionsViewModel => {
    coordinator.prepareModal();
    return (coordinator as unknown as { pendingViewModel: PlaybackOptionsViewModel | null }).pendingViewModel!;
};

const createLocalStorageMock = (): Storage => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string): string | null => (
            Object.prototype.hasOwnProperty.call(store, key) ? (store[key] ?? null) : null
        ),
        setItem: (key: string, value: string): void => {
            store[key] = String(value);
        },
        removeItem: (key: string): void => {
            delete store[key];
        },
        clear: (): void => {
            store = {};
        },
        key: (index: number): string | null => Object.keys(store)[index] ?? null,
        get length(): number {
            return Object.keys(store).length;
        },
    } as Storage;
};

describe('PlaybackOptionsCoordinator', () => {
    beforeEach(() => {
        if (!globalThis.localStorage) {
            (globalThis as { localStorage?: Storage }).localStorage = createLocalStorageMock();
        } else {
            globalThis.localStorage.clear();
        }
    });

    it('filters to external-only subtitles when enabled', () => {
        localStorage.setItem(RETUNE_STORAGE_KEYS.SUBTITLES_ENABLED, '1');
        localStorage.setItem(RETUNE_STORAGE_KEYS.SUBTITLE_FILTER_EXTERNAL_ONLY, '1');

        const player = createPlayer([
            makeTextTrack({ id: 'direct', fetchableViaKey: true, key: '/library/streams/1' }),
            makeTextTrack({ id: 'server', fetchableViaKey: false }),
            makeBurnInTrack({ id: 'burn' }),
        ]);

        const coordinator = new PlaybackOptionsCoordinator({
            playbackOptionsModalId: 'playback-options',
            getNavigation: (): null => null,
            getPlaybackOptionsModal: (): null => null,
            getVideoPlayer: (): IVideoPlayer => player,
            getCurrentProgram: (): ScheduledProgram | null => makeProgram(),
        });

        const viewModel = getViewModel(coordinator);
        const optionIds = viewModel.subtitles.options.map((option) => option.id);

        expect(optionIds).toContain('playback-subtitle-direct');
        expect(optionIds).not.toContain('playback-subtitle-server');
        expect(optionIds).not.toContain('playback-subtitle-burn');
    });

    it('prefers audio section when requested', () => {
        const player = createPlayer(
            [makeTextTrack({ id: 'sub-1' })],
            [{ id: 'audio-1', language: 'en', codec: 'aac', channels: 2 } as AudioTrack]
        );

        const coordinator = new PlaybackOptionsCoordinator({
            playbackOptionsModalId: 'playback-options',
            getNavigation: (): null => null,
            getPlaybackOptionsModal: (): null => null,
            getVideoPlayer: (): IVideoPlayer => player,
            getCurrentProgram: (): ScheduledProgram | null => makeProgram(),
        });

        const prep = coordinator.prepareModal('audio');

        expect(prep.preferredFocusId).toBe('playback-audio-audio-1');
    });

    it('marks burn-in tracks disabled when burn-in is off', () => {
        localStorage.setItem(RETUNE_STORAGE_KEYS.SUBTITLES_ENABLED, '1');
        localStorage.setItem(RETUNE_STORAGE_KEYS.SUBTITLE_ALLOW_BURN_IN, '0');

        const player = createPlayer([makeBurnInTrack({ id: 'burn' })]);
        const notifyToast = jest.fn();

        const coordinator = new PlaybackOptionsCoordinator({
            playbackOptionsModalId: 'playback-options',
            getNavigation: (): null => null,
            getPlaybackOptionsModal: (): null => null,
            getVideoPlayer: (): IVideoPlayer => player,
            getCurrentProgram: (): ScheduledProgram | null => makeProgram(),
            notifyToast,
        });

        const viewModel = getViewModel(coordinator);
        const burnOption = viewModel.subtitles.options.find((option) => option.id === 'playback-subtitle-burn');

        expect(burnOption?.blocked).toBe(true);
        expect(burnOption?.meta).toBe('Burn-in (disabled in settings)');
        burnOption?.onBlockedSelect?.();
        expect(notifyToast).toHaveBeenCalledWith('Burn-in subtitles are disabled in Settings', 'warning');
    });

    it('labels direct vs server-extracted text tracks', () => {
        localStorage.setItem(RETUNE_STORAGE_KEYS.SUBTITLES_ENABLED, '1');

        const player = createPlayer([
            makeTextTrack({ id: 'direct', fetchableViaKey: true, key: '/library/streams/1' }),
            makeTextTrack({ id: 'server', fetchableViaKey: false }),
        ]);

        const coordinator = new PlaybackOptionsCoordinator({
            playbackOptionsModalId: 'playback-options',
            getNavigation: (): null => null,
            getPlaybackOptionsModal: (): null => null,
            getVideoPlayer: (): IVideoPlayer => player,
            getCurrentProgram: (): ScheduledProgram | null => makeProgram(),
        });

        const viewModel = getViewModel(coordinator);
        const direct = viewModel.subtitles.options.find((option) => option.id === 'playback-subtitle-direct');
        const server = viewModel.subtitles.options.find((option) => option.id === 'playback-subtitle-server');

        expect(direct?.meta).toBe('Direct (key-backed)');
        expect(server?.meta).toBe('Server-extracted');
    });

    it('persists subtitle preference per item when global override is off', () => {
        localStorage.setItem(RETUNE_STORAGE_KEYS.SUBTITLES_ENABLED, '1');
        localStorage.setItem(RETUNE_STORAGE_KEYS.SUBTITLE_PREFERENCE_GLOBAL_OVERRIDE, '0');

        const player = createPlayer([
            makeTextTrack({ id: 'sub-99', fetchableViaKey: true, key: '/library/streams/99' }),
        ]);

        const coordinator = new PlaybackOptionsCoordinator({
            playbackOptionsModalId: 'playback-options',
            getNavigation: (): null => null,
            getPlaybackOptionsModal: (): null => null,
            getVideoPlayer: (): IVideoPlayer => player,
            getCurrentProgram: (): ScheduledProgram | null => makeProgram('item-99'),
        });

        const viewModel = getViewModel(coordinator);
        const option = viewModel.subtitles.options.find((o) => o.id === 'playback-subtitle-sub-99');
        option?.onSelect();

        const stored = localStorage.getItem(`${RETUNE_STORAGE_KEYS.SUBTITLE_PREFERENCE_BY_ITEM_PREFIX}item-99`);
        expect(stored).toContain('sub-99');
    });
});
