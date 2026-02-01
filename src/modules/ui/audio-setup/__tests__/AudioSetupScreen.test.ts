/**
 * @jest-environment jsdom
 */

import { AudioSetupScreen } from '../AudioSetupScreen';
import { SETTINGS_STORAGE_KEYS } from '../../settings/constants';

type StubFocusable = {
    id: string;
    neighbors: { up?: string; down?: string; left?: string; right?: string };
    onFocus?: () => void;
};

const createNavigationStub = (): {
    focusables: Map<string, StubFocusable>;
    registerFocusable: jest.Mock;
    unregisterFocusable: jest.Mock;
    setFocus: jest.Mock;
    getFocusedElement: jest.Mock;
} => {
    const focusables = new Map<string, StubFocusable>();
    let focusedId: string | null = null;

    return {
        focusables,
        registerFocusable: jest.fn((element: StubFocusable) => {
            focusables.set(element.id, element);
        }),
        unregisterFocusable: jest.fn((id: string) => {
            focusables.delete(id);
        }),
        setFocus: jest.fn((id: string) => {
            focusedId = id;
            const focusable = focusables.get(id);
            focusable?.onFocus?.();
        }),
        getFocusedElement: jest.fn(() => (focusedId ? ({ id: focusedId } as HTMLElement) : null)),
    };
};

describe('AudioSetupScreen', () => {
    beforeEach(() => {
        localStorage.removeItem(SETTINGS_STORAGE_KEYS.DTS_PASSTHROUGH);
        localStorage.removeItem(SETTINGS_STORAGE_KEYS.DIRECT_PLAY_AUDIO_FALLBACK);
        localStorage.removeItem(SETTINGS_STORAGE_KEYS.AUDIO_SETUP_COMPLETE);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('defaults to TV speakers when DTS passthrough not enabled', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        const nav = createNavigationStub();
        const screen = new AudioSetupScreen(container, () => nav as unknown as never, jest.fn());

        screen.show();

        const tvButton = container.querySelector('#audio-choice-tv-speakers');
        const continueBtn = container.querySelector('#audio-setup-continue') as HTMLButtonElement | null;

        expect(tvButton?.classList.contains('selected')).toBe(true);
        expect(continueBtn?.disabled).toBe(false);
    });

    it('defaults to External when DTS passthrough enabled', () => {
        localStorage.setItem(SETTINGS_STORAGE_KEYS.DTS_PASSTHROUGH, '1');

        const container = document.createElement('div');
        document.body.appendChild(container);

        const nav = createNavigationStub();
        const screen = new AudioSetupScreen(container, () => nav as unknown as never, jest.fn());

        screen.show();

        const externalButton = container.querySelector('#audio-choice-external');
        expect(externalButton?.classList.contains('selected')).toBe(true);
    });

    it('registers neighbors with explicit wiring', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        const nav = createNavigationStub();
        const screen = new AudioSetupScreen(container, () => nav as unknown as never, jest.fn());

        screen.show();

        const external = nav.focusables.get('audio-choice-external');
        const tv = nav.focusables.get('audio-choice-tv-speakers');
        const fallback = nav.focusables.get('audio-direct-play-fallback');
        const cont = nav.focusables.get('audio-setup-continue');

        expect(external?.neighbors.right).toBe('audio-choice-tv-speakers');
        expect(external?.neighbors.down).toBe('audio-direct-play-fallback');

        expect(tv?.neighbors.left).toBe('audio-choice-external');
        expect(tv?.neighbors.down).toBe('audio-direct-play-fallback');

        expect(fallback?.neighbors.down).toBe('audio-setup-continue');
        expect(fallback?.neighbors.up).toBe('audio-choice-tv-speakers');

        expect(cont?.neighbors.up).toBe('audio-direct-play-fallback');
    });

    it('updates fallback up neighbor based on last-focused choice', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        const nav = createNavigationStub();
        const screen = new AudioSetupScreen(container, () => nav as unknown as never, jest.fn());

        screen.show();
        nav.setFocus('audio-choice-external');

        const fallback = nav.focusables.get('audio-direct-play-fallback');
        expect(fallback?.neighbors.up).toBe('audio-choice-external');
    });
});
