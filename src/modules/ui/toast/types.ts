/**
 * @fileoverview Toast notification types and input normalization.
 * @module modules/ui/toast/types
 * @version 1.0.0
 */

export const TOAST_TYPES = ['info', 'success', 'warning', 'error'] as const;

export type ToastType = typeof TOAST_TYPES[number];

export type ToastPayload = {
    message: string;
    type?: ToastType;
};

/**
 * Back-compat: callers may still pass a plain string.
 */
export type ToastInput = string | ToastPayload;

export function normalizeToastInput(input: ToastInput): { message: string; type: ToastType } {
    if (typeof input === 'string') {
        return { message: input, type: 'info' };
    }
    const message = input.message;
    const rawType = input.type;
    const type = rawType && TOAST_TYPES.includes(rawType) ? rawType : 'info';
    return { message, type };
}
