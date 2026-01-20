/**
 * @fileoverview Redaction helpers for safe logging.
 * @module utils/redact
 * @version 1.0.0
 */

/**
 * Redact common sensitive tokens in a string.
 *
 * Intended for logging only. This does not guarantee complete sanitization for all cases.
 */
export function redactSensitiveTokens(value: string): string {
    return value
        .replace(/X-Plex-Token=[^&\s]*/gi, 'X-Plex-Token=REDACTED')
        .replace(/access_token=[^&\s]*/gi, 'access_token=REDACTED')
        .replace(/\btoken=[^&\s]*/gi, 'token=REDACTED');
}

