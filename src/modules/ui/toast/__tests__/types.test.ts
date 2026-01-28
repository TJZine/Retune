/**
 * @jest-environment jsdom
 */

import { normalizeToastInput } from '../types';

describe('toast types', () => {
    it('defaults string input to info', () => {
        expect(normalizeToastInput('Hello')).toEqual({ message: 'Hello', type: 'info' });
    });

    it('defaults payload type to info', () => {
        expect(normalizeToastInput({ message: 'Hello' })).toEqual({ message: 'Hello', type: 'info' });
    });

    it('preserves payload type', () => {
        expect(normalizeToastInput({ message: 'Oops', type: 'warning' })).toEqual({ message: 'Oops', type: 'warning' });
    });
});

