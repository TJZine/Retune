/**
 * @fileoverview EPG Channel List - Channel column showing channel names
 * @module modules/ui/epg/EPGChannelList
 * @version 1.0.0
 */

import { EPG_CLASSES } from './constants';
import type { EPGConfig, ChannelConfig } from './types';

/**
 * EPG Channel List class.
 * Displays channel names in a column that syncs with grid scrolling.
 */
export class EPGChannelList {
    private containerElement: HTMLElement | null = null;
    private config: EPGConfig | null = null;
    private channels: ChannelConfig[] = [];
    private rowElements: HTMLElement[] = [];
    private focusedChannelIndex: number = -1;

    /**
     * Initialize the channel list.
     *
     * @param parentElement - Parent element to append channel list to
     * @param config - EPG configuration
     */
    initialize(parentElement: HTMLElement, config: EPGConfig): void {
        this.config = config;

        this.containerElement = document.createElement('div');
        this.containerElement.className = EPG_CLASSES.CHANNEL_LIST;
        parentElement.appendChild(this.containerElement);
    }

    /**
     * Destroy the channel list and clean up resources.
     */
    destroy(): void {
        if (this.containerElement) {
            this.containerElement.remove();
            this.containerElement = null;
        }
        this.rowElements = [];
        this.channels = [];
        this.config = null;
    }

    /**
     * Update the channel list.
     *
     * @param channels - Array of channel configurations
     */
    updateChannels(channels: ChannelConfig[]): void {
        this.channels = channels;
        this.renderChannels();
    }

    /**
     * Render channel rows.
     */
    private renderChannels(): void {
        if (!this.containerElement || !this.config) return;

        this.containerElement.innerHTML = '';
        this.rowElements = [];

        for (let i = 0; i < this.channels.length; i++) {
            const channel = this.channels[i];
            if (!channel) continue;
            const row = this.createChannelRow(channel);
            this.containerElement.appendChild(row);
            this.rowElements.push(row);
        }
    }

    /**
     * Create a channel row element.
     *
     * @param channel - Channel configuration
     * @returns The row element
     */
    private createChannelRow(channel: ChannelConfig): HTMLElement {
        const row = document.createElement('div');
        row.className = EPG_CLASSES.CHANNEL_ROW;

        if (this.config) {
            row.style.height = `${this.config.rowHeight}px`;
        }

        // Channel number
        const number = document.createElement('span');
        number.className = 'epg-channel-number';
        number.textContent = channel.number.toString();

        // Channel name
        const name = document.createElement('span');
        name.className = 'epg-channel-name';
        name.textContent = channel.name;

        // Channel icon (if available) - validate URL scheme
        if (channel.icon) {
            // Only allow http:, https:, or safe data:image/* URLs
            const isValidIconUrl = /^https?:\/\//i.test(channel.icon) ||
                /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);/i.test(channel.icon);
            if (isValidIconUrl) {
                const icon = document.createElement('img');
                icon.className = 'epg-channel-icon';
                icon.src = channel.icon;
                icon.alt = channel.name;
                row.appendChild(icon);
            }
        }

        row.appendChild(number);
        row.appendChild(name);

        // Apply color if set - validate to prevent CSS injection
        if (channel.color) {
            // Only allow safe color formats: hex, rgb(), rgba(), or named colors
            const isValidColor = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(channel.color) ||
                /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i.test(channel.color) ||
                /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*[\d.]+\s*\)$/i.test(channel.color) ||
                /^[a-z]+$/i.test(channel.color); // Named colors (no spaces/special chars)
            if (isValidColor) {
                row.style.borderLeftColor = channel.color;
                row.style.borderLeftWidth = '4px';
                row.style.borderLeftStyle = 'solid';
            }
        }

        return row;
    }

    /**
     * Update scroll position to sync with grid.
     *
     * @param channelOffset - First visible channel index
     */
    updateScrollPosition(channelOffset: number): void {
        if (!this.containerElement || !this.config) return;

        const translateY = -(channelOffset * this.config.rowHeight);
        this.containerElement.style.transform = `translateY(${translateY}px)`;
    }

    /**
     * Set the focused channel.
     *
     * @param index - Channel index to focus (-1 to clear)
     */
    setFocusedChannel(index: number): void {
        // Remove focus from previous
        if (this.focusedChannelIndex >= 0 && this.focusedChannelIndex < this.rowElements.length) {
            const prevRow = this.rowElements[this.focusedChannelIndex];
            if (prevRow) {
                prevRow.classList.remove('focused');
            }
        }

        // Add focus to new
        if (index >= 0 && index < this.rowElements.length) {
            const newRow = this.rowElements[index];
            if (newRow) {
                newRow.classList.add('focused');
            }
        }

        this.focusedChannelIndex = index;
    }

    /**
     * Get channel at index.
     *
     * @param index - Channel index
     * @returns Channel config or null
     */
    getChannel(index: number): ChannelConfig | null {
        if (index >= 0 && index < this.channels.length) {
            const channel = this.channels[index];
            return channel !== undefined ? channel : null;
        }
        return null;
    }

    /**
     * Get total channel count.
     *
     * @returns Number of channels
     */
    getChannelCount(): number {
        return this.channels.length;
    }
}
