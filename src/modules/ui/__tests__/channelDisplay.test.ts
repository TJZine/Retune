import { getChannelNameForDisplay } from '../channelDisplay';

describe('getChannelNameForDisplay', () => {
    it('strips library prefix when present', () => {
        expect(getChannelNameForDisplay({ name: 'Movies - Action', sourceLibraryName: 'Movies' }))
            .toBe('Action');
    });

    it('leaves exact library name unchanged', () => {
        expect(getChannelNameForDisplay({ name: 'Movies', sourceLibraryName: 'Movies' }))
            .toBe('Movies');
    });

    it('does not strip when prefix does not match', () => {
        expect(getChannelNameForDisplay({ name: 'TV - News', sourceLibraryName: 'Movies' }))
            .toBe('TV - News');
    });

    it('handles null or empty library name', () => {
        expect(getChannelNameForDisplay({ name: 'Movies - Action', sourceLibraryName: null }))
            .toBe('Movies - Action');
        expect(getChannelNameForDisplay({ name: 'Movies - Action', sourceLibraryName: '' }))
            .toBe('Movies - Action');
    });
});
