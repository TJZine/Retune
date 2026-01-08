/**
 * @fileoverview EPG UI module utility functions
 * @module modules/ui/epg/utils
 */

/**
 * Format a timestamp as a time string (e.g., "12:30 PM").
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted time string
 */
export function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    return `${displayHours}:${displayMinutes} ${ampm}`;
}

/**
 * Format a time range for display.
 *
 * @param startTime - Start timestamp (Unix ms)
 * @param endTime - End timestamp (Unix ms)
 * @returns Formatted time range string (e.g., "12:00 PM - 2:30 PM")
 */
export function formatTimeRange(startTime: number, endTime: number): string {
    return `${formatTime(startTime)} - ${formatTime(endTime)}`;
}

/**
 * Format duration in human-readable form.
 *
 * @param durationMs - Duration in milliseconds
 * @returns Formatted string (e.g., "2h 15m")
 */
export function formatDuration(durationMs: number): string {
    const totalMinutes = Math.floor(durationMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0) {
        return `${minutes}m`;
    }
    if (minutes === 0) {
        return `${hours}h`;
    }
    return `${hours}h ${minutes}m`;
}

/**
 * Throttle function execution using requestAnimationFrame.
 * Ensures only one execution per animation frame.
 *
 * @param fn - Function to throttle
 * @returns Throttled function
 */
export function rafThrottle<T extends (...args: unknown[]) => void>(
    fn: T
): (...args: Parameters<T>) => void {
    // In test environments (jsdom), RAF may not fire reliably
    // Fall back to synchronous execution
    const isTestEnv = typeof process !== 'undefined' &&
        process.env.NODE_ENV === 'test';

    if (isTestEnv || typeof requestAnimationFrame === 'undefined') {
        return fn;
    }

    let rafId: number | null = null;
    let latestArgs: Parameters<T> | null = null;

    return (...args: Parameters<T>): void => {
        latestArgs = args;

        if (rafId === null) {
            rafId = requestAnimationFrame(() => {
                rafId = null;
                if (latestArgs !== null) {
                    fn(...latestArgs);
                }
            });
        }
    };
}
