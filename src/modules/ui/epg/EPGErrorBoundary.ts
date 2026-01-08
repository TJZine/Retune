/**
 * @fileoverview EPG Error Boundary - Centralized error handling for EPG component
 * @module modules/ui/epg/EPGErrorBoundary
 * @version 1.0.0
 */

import { EventEmitter } from '../../../utils/EventEmitter';
import type { EPGErrorType } from './types';

/**
 * Events emitted by EPGErrorBoundary.
 */
interface EPGErrorBoundaryEvents {
    /** Fired when too many errors of same type occur */
    degradedMode: { type: EPGErrorType; count: number };
    [key: string]: unknown;
}

/**
 * Centralized error handling for EPG component.
 * Prevents cascading failures and enables graceful degradation.
 */
export class EPGErrorBoundary extends EventEmitter<EPGErrorBoundaryEvents> {
    private errorCounts: Map<EPGErrorType, number> = new Map();
    private readonly MAX_ERRORS_PER_TYPE = 3;

    /** Callback to show fallback row in grid */
    private showFallbackRowFn: ((context: string) => void) | null = null;
    /** Callback to reset scroll position */
    private resetScrollPositionFn: (() => void) | null = null;
    /** Callback to force recycle all elements */
    private forceRecycleAllFn: (() => void) | null = null;

    /**
     * Set callbacks for error recovery actions.
     */
    setCallbacks(callbacks: {
        showFallbackRow?: (context: string) => void;
        resetScrollPosition?: () => void;
        forceRecycleAll?: () => void;
    }): void {
        if (callbacks.showFallbackRow) {
            this.showFallbackRowFn = callbacks.showFallbackRow;
        }
        if (callbacks.resetScrollPosition) {
            this.resetScrollPositionFn = callbacks.resetScrollPosition;
        }
        if (callbacks.forceRecycleAll) {
            this.forceRecycleAllFn = callbacks.forceRecycleAll;
        }
    }

    /**
     * Handle an error with appropriate recovery strategy.
     *
     * @param type - Error type for categorization
     * @param context - Where the error occurred (for logging)
     * @param error - Optional original error
     */
    handleError(type: EPGErrorType, context: string, error?: Error): void {
        const existing = this.errorCounts.get(type);
        const count = (existing !== undefined ? existing : 0) + 1;
        this.errorCounts.set(type, count);

        console.warn(
            `[EPG] ${type} in ${context}:`,
            error ? error.message : undefined
        );

        switch (type) {
            case 'RENDER_ERROR':
                // Show fallback row, don't crash entire grid
                if (this.showFallbackRowFn) {
                    this.showFallbackRowFn(context);
                }
                break;
            case 'SCROLL_TIMEOUT':
                // Reset to known good state
                if (this.resetScrollPositionFn) {
                    this.resetScrollPositionFn();
                }
                break;
            case 'POOL_EXHAUSTED':
                // Aggressive cleanup
                if (this.forceRecycleAllFn) {
                    this.forceRecycleAllFn();
                }
                break;
            case 'EMPTY_CHANNEL':
            case 'NAV_BOUNDARY':
            case 'PARSE_ERROR':
                // These are handled silently, just logged
                break;
        }

        // If too many errors, emit degraded mode event
        if (count >= this.MAX_ERRORS_PER_TYPE) {
            this.emit('degradedMode', { type, count });
        }
    }

    /**
     * Wrap an operation with error handling.
     *
     * @param type - Error type if operation fails
     * @param context - Context for logging
     * @param operation - Function to execute
     * @returns Result of operation, or undefined on error
     */
    wrap<T>(
        type: EPGErrorType,
        context: string,
        operation: () => T
    ): T | undefined {
        try {
            return operation();
        } catch (error) {
            this.handleError(
                type,
                context,
                error instanceof Error ? error : new Error(String(error))
            );
            return undefined;
        }
    }

    /**
     * Reset error counts (e.g., on successful recovery).
     */
    resetCounts(): void {
        this.errorCounts.clear();
    }

    /**
     * Get current error count for a type.
     */
    getErrorCount(type: EPGErrorType): number {
        return this.errorCounts.get(type) || 0;
    }

    /**
     * Check if in degraded mode for a type.
     */
    isDegraded(type: EPGErrorType): boolean {
        return this.getErrorCount(type) >= this.MAX_ERRORS_PER_TYPE;
    }

    /**
     * Destroy and cleanup.
     */
    destroy(): void {
        this.errorCounts.clear();
        this.showFallbackRowFn = null;
        this.resetScrollPositionFn = null;
        this.forceRecycleAllFn = null;
        this.removeAllListeners();
    }
}
