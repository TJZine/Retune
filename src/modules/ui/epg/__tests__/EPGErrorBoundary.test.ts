/**
 * @jest-environment jsdom
 */

import { EPGErrorBoundary } from '../EPGErrorBoundary';

describe('EPGErrorBoundary', () => {
    let errorBoundary: EPGErrorBoundary;

    beforeEach(() => {
        errorBoundary = new EPGErrorBoundary();
        jest.spyOn(console, 'warn').mockImplementation(() => { });
        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        errorBoundary.destroy();
        jest.restoreAllMocks();
    });

    describe('handleError', () => {
        it('should log errors with context', () => {
            errorBoundary.handleError('RENDER_ERROR', 'testContext');

            expect(console.warn).toHaveBeenCalledWith(
                '[EPG] RENDER_ERROR in testContext:',
                undefined
            );
        });

        it('should log error message when provided', () => {
            const error = new Error('Test error');
            errorBoundary.handleError('RENDER_ERROR', 'testContext', error);

            expect(console.warn).toHaveBeenCalledWith(
                '[EPG] RENDER_ERROR in testContext:',
                'Test error'
            );
        });

        it('should increment error count per type', () => {
            errorBoundary.handleError('RENDER_ERROR', 'ctx1');
            errorBoundary.handleError('RENDER_ERROR', 'ctx2');

            expect(errorBoundary.getErrorCount('RENDER_ERROR')).toBe(2);
            expect(errorBoundary.getErrorCount('POOL_EXHAUSTED')).toBe(0);
        });

        it('should call showFallbackRow for RENDER_ERROR', () => {
            const showFallbackRow = jest.fn();
            errorBoundary.setCallbacks({ showFallbackRow });

            errorBoundary.handleError('RENDER_ERROR', 'grid-row-5');

            expect(showFallbackRow).toHaveBeenCalledWith('grid-row-5');
        });

        it('should call resetScrollPosition for SCROLL_TIMEOUT', () => {
            const resetScrollPosition = jest.fn();
            errorBoundary.setCallbacks({ resetScrollPosition });

            errorBoundary.handleError('SCROLL_TIMEOUT', 'scrollHandler');

            expect(resetScrollPosition).toHaveBeenCalled();
        });

        it('should call forceRecycleAll for POOL_EXHAUSTED', () => {
            const forceRecycleAll = jest.fn();
            errorBoundary.setCallbacks({ forceRecycleAll });

            errorBoundary.handleError('POOL_EXHAUSTED', 'virtualizer');

            expect(forceRecycleAll).toHaveBeenCalled();
        });

        it('should emit degradedMode after MAX_ERRORS_PER_TYPE', () => {
            const degradedHandler = jest.fn();
            errorBoundary.on('degradedMode', degradedHandler);

            // Trigger 3 errors (MAX_ERRORS_PER_TYPE = 3)
            errorBoundary.handleError('RENDER_ERROR', 'ctx1');
            errorBoundary.handleError('RENDER_ERROR', 'ctx2');
            expect(degradedHandler).not.toHaveBeenCalled();

            errorBoundary.handleError('RENDER_ERROR', 'ctx3');
            expect(degradedHandler).toHaveBeenCalledWith({
                type: 'RENDER_ERROR',
                count: 3,
            });
        });
    });

    describe('wrap', () => {
        it('should execute operation and return result', () => {
            const result = errorBoundary.wrap('RENDER_ERROR', 'test', () => 42);
            expect(result).toBe(42);
        });

        it('should catch errors and return undefined', () => {
            const result = errorBoundary.wrap('RENDER_ERROR', 'test', () => {
                throw new Error('Test failure');
            });

            expect(result).toBeUndefined();
            expect(console.warn).toHaveBeenCalled();
        });

        it('should trigger recovery callback on error', () => {
            const showFallbackRow = jest.fn();
            errorBoundary.setCallbacks({ showFallbackRow });

            errorBoundary.wrap('RENDER_ERROR', 'renderRow', () => {
                throw new Error('Render failed');
            });

            expect(showFallbackRow).toHaveBeenCalledWith('renderRow');
        });

        it('should increment error count on failure', () => {
            errorBoundary.wrap('PARSE_ERROR', 'parser', () => {
                throw new Error('Parse failed');
            });

            expect(errorBoundary.getErrorCount('PARSE_ERROR')).toBe(1);
        });
    });

    describe('resetCounts', () => {
        it('should clear all error counts', () => {
            errorBoundary.handleError('RENDER_ERROR', 'ctx1');
            errorBoundary.handleError('POOL_EXHAUSTED', 'ctx2');

            errorBoundary.resetCounts();

            expect(errorBoundary.getErrorCount('RENDER_ERROR')).toBe(0);
            expect(errorBoundary.getErrorCount('POOL_EXHAUSTED')).toBe(0);
        });
    });

    describe('isDegraded', () => {
        it('should return false when under threshold', () => {
            errorBoundary.handleError('RENDER_ERROR', 'ctx1');
            errorBoundary.handleError('RENDER_ERROR', 'ctx2');

            expect(errorBoundary.isDegraded('RENDER_ERROR')).toBe(false);
        });

        it('should return true at threshold', () => {
            errorBoundary.handleError('RENDER_ERROR', 'ctx1');
            errorBoundary.handleError('RENDER_ERROR', 'ctx2');
            errorBoundary.handleError('RENDER_ERROR', 'ctx3');

            expect(errorBoundary.isDegraded('RENDER_ERROR')).toBe(true);
        });
    });

    describe('destroy', () => {
        it('should clear all state', () => {
            const callback = jest.fn();
            errorBoundary.setCallbacks({ showFallbackRow: callback });
            errorBoundary.handleError('RENDER_ERROR', 'ctx1');

            errorBoundary.destroy();

            expect(errorBoundary.getErrorCount('RENDER_ERROR')).toBe(0);
            // After destroy, callbacks should not be called
            errorBoundary.handleError('RENDER_ERROR', 'ctx2');
            expect(callback).toHaveBeenCalledTimes(1); // Only the first call
        });
    });
});
