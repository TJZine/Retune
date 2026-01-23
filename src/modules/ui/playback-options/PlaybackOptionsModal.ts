/**
 * @fileoverview Playback Options modal UI.
 * @module modules/ui/playback-options/PlaybackOptionsModal
 */

import { PLAYBACK_OPTIONS_CLASSES } from './constants';
import type { IPlaybackOptionsModal } from './interfaces';
import type { PlaybackOptionsConfig, PlaybackOptionsSection, PlaybackOptionsViewModel, PlaybackOptionsItem } from './types';

export class PlaybackOptionsModal implements IPlaybackOptionsModal {
    private containerElement: HTMLElement | null = null;
    private isVisibleFlag = false;
    private focusableIds: string[] = [];
    private optionElements: Map<string, HTMLButtonElement> = new Map();

    initialize(config: PlaybackOptionsConfig): void {
        if (typeof document === 'undefined') {
            return;
        }
        const container = document.getElementById(config.containerId);
        if (!container) {
            throw new Error(`Playback Options container #${config.containerId} not found`);
        }
        this.containerElement = container;
        this.containerElement.className = PLAYBACK_OPTIONS_CLASSES.CONTAINER;
        this.containerElement.classList.remove('visible');
        this.isVisibleFlag = false;
    }

    show(viewModel: PlaybackOptionsViewModel): void {
        if (!this.containerElement) return;
        this.render(viewModel);
        this.containerElement.classList.add('visible');
        this.isVisibleFlag = true;
    }

    update(viewModel: PlaybackOptionsViewModel): void {
        if (!this.containerElement) return;
        this.render(viewModel);
    }

    hide(): void {
        if (!this.containerElement) return;
        this.containerElement.classList.remove('visible');
        this.isVisibleFlag = false;
    }

    destroy(): void {
        if (this.containerElement) {
            this.containerElement.textContent = '';
            this.containerElement.classList.remove('visible');
        }
        this.containerElement = null;
        this.isVisibleFlag = false;
        this.focusableIds = [];
        this.optionElements.clear();
    }

    isVisible(): boolean {
        return this.isVisibleFlag;
    }

    getFocusableIds(): string[] {
        return [...this.focusableIds];
    }

    private render(viewModel: PlaybackOptionsViewModel): void {
        if (!this.containerElement) return;
        this.containerElement.textContent = '';
        this.focusableIds = [];
        this.optionElements.clear();

        const panel = document.createElement('div');
        panel.className = PLAYBACK_OPTIONS_CLASSES.PANEL;

        const header = document.createElement('div');
        header.className = PLAYBACK_OPTIONS_CLASSES.HEADER;

        const title = document.createElement('h1');
        title.className = PLAYBACK_OPTIONS_CLASSES.TITLE;
        title.textContent = viewModel.title;

        header.appendChild(title);
        panel.appendChild(header);

        panel.appendChild(this.createSection(viewModel.subtitles));
        panel.appendChild(this.createSection(viewModel.audio));

        this.containerElement.appendChild(panel);
    }

    private createSection(section: PlaybackOptionsSection): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.className = PLAYBACK_OPTIONS_CLASSES.SECTION;

        const title = document.createElement('h2');
        title.className = PLAYBACK_OPTIONS_CLASSES.SECTION_TITLE;
        title.textContent = section.title;
        wrapper.appendChild(title);

        const list = document.createElement('div');
        list.className = PLAYBACK_OPTIONS_CLASSES.LIST;

        if (section.options.length === 0 && section.emptyMessage) {
            const empty = document.createElement('div');
            empty.className = PLAYBACK_OPTIONS_CLASSES.EMPTY;
            empty.textContent = section.emptyMessage;
            wrapper.appendChild(empty);
            return wrapper;
        }

        for (const option of section.options) {
            list.appendChild(this.createOption(option));
        }

        wrapper.appendChild(list);
        if (section.emptyMessage) {
            const empty = document.createElement('div');
            empty.className = PLAYBACK_OPTIONS_CLASSES.EMPTY;
            empty.textContent = section.emptyMessage;
            empty.style.display = section.options.length === 0 ? 'block' : 'none';
            wrapper.appendChild(empty);
        }

        return wrapper;
    }

    private createOption(item: PlaybackOptionsItem): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = item.id;
        button.className = `setup-toggle ${PLAYBACK_OPTIONS_CLASSES.ITEM}${item.selected ? ' selected' : ''}`;
        if (item.disabled) {
            button.classList.add('disabled');
            button.disabled = true;
        }

        const label = document.createElement('span');
        label.className = 'setup-toggle-label';
        label.textContent = item.label;
        button.appendChild(label);

        const meta = document.createElement('span');
        meta.className = 'setup-toggle-meta';
        meta.textContent = item.meta ?? '';
        if (!item.meta) {
            meta.style.display = 'none';
        }
        button.appendChild(meta);

        if (item.state) {
            const state = document.createElement('span');
            state.className = 'setup-toggle-state';
            state.textContent = item.state;
            button.appendChild(state);
        }

        button.addEventListener('click', () => {
            if (item.disabled) return;
            item.onSelect();
        });

        if (!item.disabled) {
            this.focusableIds.push(item.id);
        }
        this.optionElements.set(item.id, button);
        return button;
    }
}
