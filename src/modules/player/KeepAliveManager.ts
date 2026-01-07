/**
 * @fileoverview Keep-alive mechanism for webOS video player.
 * Prevents app suspension during long playback by touching the DOM.
 * @module modules/player/KeepAliveManager
 * @version 1.0.0
 */

import { KEEP_ALIVE_INTERVAL_MS } from './constants';

/**
 * Manages keep-alive interval to prevent webOS app suspension.
 * Touches the DOM every 30 seconds while playing.
 */
export class KeepAliveManager {
    /** Interval ID for keep-alive */
    private _intervalId: ReturnType<typeof setInterval> | null = null;

    /** Function to check if player is active */
    private _isPlayingFn: () => boolean = (): boolean => false;

    /**
     * Set the function to check if player is playing.
     */
    public setIsPlayingCheck(fn: () => boolean): void {
        this._isPlayingFn = fn;
    }

    /**
     * Start keep-alive interval.
     */
    public start(): void {
        this.stop();

        this._intervalId = setInterval(() => {
            if (this._isPlayingFn()) {
                // Touch DOM to prevent webOS suspension
                document.dispatchEvent(new Event('click'));
            }
        }, KEEP_ALIVE_INTERVAL_MS);
    }

    /**
     * Stop keep-alive interval.
     */
    public stop(): void {
        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
    }
}
