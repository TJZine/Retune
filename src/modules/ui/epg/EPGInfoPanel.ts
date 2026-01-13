/**
 * @fileoverview EPG Info Panel - Program details overlay
 * @module modules/ui/epg/EPGInfoPanel
 * @version 1.0.0
 */

import { EPG_CLASSES } from './constants';
import { formatTime, formatDuration } from './utils';
import type { IEPGInfoPanel } from './interfaces';
import type { ScheduledProgram } from './types';

/**
 * EPG Info Panel class.
 * Displays program details in an overlay at the bottom of the EPG.
 */
export class EPGInfoPanel implements IEPGInfoPanel {
    private containerElement: HTMLElement | null = null;
    private isVisible: boolean = false;
    private currentProgram: ScheduledProgram | null = null;
    private thumbResolver: ((pathOrUrl: string | null) => string | null) | null = null;

    /**
     * Set the thumb URL resolver callback.
     * Called before assigning poster src to resolve relative Plex paths.
     *
     * @param resolver - Callback that converts paths to full URLs
     */
    setThumbResolver(resolver: ((pathOrUrl: string | null) => string | null) | null): void {
        this.thumbResolver = resolver;
    }

    /**
     * Initialize the info panel.
     *
     * @param parentElement - Parent element to append info panel to
     */
    initialize(parentElement: HTMLElement): void {
        this.containerElement = document.createElement('div');
        this.containerElement.className = EPG_CLASSES.INFO_PANEL;
        this.containerElement.innerHTML = this.createTemplate();
        this.containerElement.style.display = 'none';
        parentElement.appendChild(this.containerElement);
    }

    /**
     * Create the HTML template for the info panel.
     */
    private createTemplate(): string {
        return `
      <img class="${EPG_CLASSES.INFO_POSTER}" src="" alt="" />
      <div class="${EPG_CLASSES.INFO_CONTENT}">
        <div class="${EPG_CLASSES.INFO_TITLE}"></div>
        <div class="${EPG_CLASSES.INFO_META}"></div>
        <div class="${EPG_CLASSES.INFO_DESCRIPTION}"></div>
      </div>
    `;
    }

    /**
     * Destroy the info panel and clean up resources.
     */
    destroy(): void {
        if (this.containerElement) {
            this.containerElement.remove();
            this.containerElement = null;
        }
        this.currentProgram = null;
        this.thumbResolver = null;
        this.isVisible = false;
    }

    /**
     * Show the info panel with program details.
     *
     * @param program - Program to display
     */
    show(program: ScheduledProgram): void {
        if (!this.containerElement) return;

        this.currentProgram = program;
        this.updateContent(program);
        this.containerElement.style.display = 'flex';
        this.isVisible = true;
    }

    /**
     * Hide the info panel.
     */
    hide(): void {
        if (!this.containerElement) return;

        this.containerElement.style.display = 'none';
        this.isVisible = false;
    }

    /**
     * Update the info panel with new program details.
     * Shows the panel if not already visible.
     *
     * @param program - Program to display
     */
    update(program: ScheduledProgram): void {
        // Delegate to show() which handles content update and visibility
        this.show(program);
    }

    /**
     * Update the content of the info panel.
     */
    private updateContent(program: ScheduledProgram): void {
        if (!this.containerElement) return;

        const { item } = program;

        // Update poster: use resolver if available, otherwise validate URL scheme
        const poster = this.containerElement.querySelector(
            `.${EPG_CLASSES.INFO_POSTER}`
        ) as HTMLImageElement;
        if (poster) {
            // Use resolver callback to convert relative Plex paths to absolute URLs
            const resolvedUrl = this.thumbResolver?.(item.thumb) ?? null;
            if (resolvedUrl) {
                poster.src = resolvedUrl;
                poster.alt = item.title;
                poster.style.display = 'block';
            } else {
                // Hide poster when unresolved (prevents file:/// errors on webOS)
                poster.src = '';
                poster.style.display = 'none';
            }
        }

        // Update title
        const title = this.containerElement.querySelector(`.${EPG_CLASSES.INFO_TITLE}`);
        if (title) {
            title.textContent = item.fullTitle || item.title;
        }

        // Update meta info
        const meta = this.containerElement.querySelector(`.${EPG_CLASSES.INFO_META}`);
        if (meta) {
            const startTime = formatTime(program.scheduledStartTime);
            const endTime = formatTime(program.scheduledEndTime);
            const duration = formatDuration(item.durationMs);
            const year = item.year > 0 ? `(${item.year})` : '';

            meta.textContent = `${startTime} - ${endTime} (${duration}) ${year}`;
        }

        // Update description - hide when no extended metadata available
        const description = this.containerElement.querySelector(`.${EPG_CLASSES.INFO_DESCRIPTION}`) as HTMLElement;
        if (description) {
            // Description would come from extended metadata, hide until available
            description.textContent = '';
            description.style.display = 'none';
        }
    }

    /**
     * Get the currently displayed program.
     *
     * @returns Current program or null
     */
    getCurrentProgram(): ScheduledProgram | null {
        return this.currentProgram;
    }

    /**
     * Check if the info panel is currently visible.
     *
     * @returns true if visible
     */
    getIsVisible(): boolean {
        return this.isVisible;
    }
}
