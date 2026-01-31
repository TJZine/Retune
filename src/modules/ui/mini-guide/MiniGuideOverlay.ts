/**
 * @fileoverview Mini Guide overlay UI.
 * @module modules/ui/mini-guide/MiniGuideOverlay
 */

import { MINI_GUIDE_CLASSES } from './constants';
import type { IMiniGuideOverlay } from './interfaces';
import type { MiniGuideConfig, MiniGuideViewModel } from './types';

const ROW_COUNT = 3;

type MiniGuideRowElements = {
    row: HTMLElement | null;
    number: HTMLElement | null;
    name: HTMLElement | null;
    now: HTMLElement | null;
    next: HTMLElement | null;
    progressFill: HTMLElement | null;
};

export class MiniGuideOverlay implements IMiniGuideOverlay {
    private containerElement: HTMLElement | null = null;
    private isVisibleFlag = false;
    private rows: MiniGuideRowElements[] = [];

    initialize(config: MiniGuideConfig): void {
        const container = document.getElementById(config.containerId);
        if (!container) {
            throw new Error(`Mini Guide container #${config.containerId} not found`);
        }
        this.containerElement = container;
        this.containerElement.classList.add(MINI_GUIDE_CLASSES.CONTAINER);
        this.containerElement.innerHTML = this.createTemplate();
        this.containerElement.classList.remove(MINI_GUIDE_CLASSES.VISIBLE);
        this.isVisibleFlag = false;
        this.cacheElements();
    }

    destroy(): void {
        if (this.containerElement) {
            this.containerElement.innerHTML = '';
            this.containerElement.classList.remove(MINI_GUIDE_CLASSES.VISIBLE);
        }
        this.containerElement = null;
        this.isVisibleFlag = false;
        this.rows = [];
    }

    show(): void {
        if (!this.containerElement) return;
        this.containerElement.classList.add(MINI_GUIDE_CLASSES.VISIBLE);
        this.isVisibleFlag = true;
    }

    hide(): void {
        if (!this.containerElement) return;
        this.containerElement.classList.remove(MINI_GUIDE_CLASSES.VISIBLE);
        this.isVisibleFlag = false;
    }

    isVisible(): boolean {
        return this.isVisibleFlag;
    }

    setViewModel(vm: MiniGuideViewModel): void {
        if (!this.containerElement) return;

        for (let i = 0; i < ROW_COUNT; i += 1) {
            const rowVm = vm.channels[i];
            const rowElements = this.rows[i];
            if (!rowVm || !rowElements) {
                continue;
            }
            if (rowElements.number) {
                rowElements.number.textContent = String(rowVm.channelNumber);
            }
            if (rowElements.name) {
                rowElements.name.textContent = rowVm.channelName;
            }
            if (rowElements.now) {
                rowElements.now.textContent = rowVm.nowTitle;
            }
            if (rowElements.next) {
                rowElements.next.textContent = rowVm.nextTitle ?? '';
                rowElements.next.style.display = rowVm.nextTitle ? 'block' : 'none';
            }
            if (rowElements.progressFill) {
                const percent = Math.max(0, Math.min(1, rowVm.nowProgress)) * 100;
                rowElements.progressFill.style.width = `${percent.toFixed(2)}%`;
            }
        }
    }

    setFocusedIndex(index: number): void {
        for (let i = 0; i < this.rows.length; i += 1) {
            const row = this.rows[i]?.row;
            if (!row) continue;
            if (i === index) {
                row.classList.add(MINI_GUIDE_CLASSES.CHANNEL_ROW_FOCUSED);
            } else {
                row.classList.remove(MINI_GUIDE_CLASSES.CHANNEL_ROW_FOCUSED);
            }
        }
    }

    private cacheElements(): void {
        this.rows = [];
        for (let i = 0; i < ROW_COUNT; i += 1) {
            this.rows.push({
                row: document.getElementById(`mini-guide-row-${i}`),
                number: document.getElementById(`mini-guide-num-${i}`),
                name: document.getElementById(`mini-guide-name-${i}`),
                now: document.getElementById(`mini-guide-now-${i}`),
                next: document.getElementById(`mini-guide-next-${i}`),
                progressFill: document.getElementById(`mini-guide-progress-${i}`),
            });
        }
    }

    private createTemplate(): string {
        const rows: string[] = [];
        for (let i = 0; i < ROW_COUNT; i += 1) {
            rows.push(`
        <div id="mini-guide-row-${i}" class="${MINI_GUIDE_CLASSES.CHANNEL_ROW}">
          <div class="${MINI_GUIDE_CLASSES.CHANNEL_NUMBER}" id="mini-guide-num-${i}"></div>
          <div class="${MINI_GUIDE_CLASSES.CHANNEL_NAME}" id="mini-guide-name-${i}"></div>
          <div class="${MINI_GUIDE_CLASSES.PROGRAM_NOW}" id="mini-guide-now-${i}"></div>
          <div class="${MINI_GUIDE_CLASSES.PROGRESS_BAR}">
            <div class="${MINI_GUIDE_CLASSES.PROGRESS_FILL}" id="mini-guide-progress-${i}"></div>
          </div>
          <div class="${MINI_GUIDE_CLASSES.PROGRAM_NEXT}" id="mini-guide-next-${i}"></div>
        </div>
      `);
        }

        return `
      <div class="${MINI_GUIDE_CLASSES.PANEL}">
        ${rows.join('')}
      </div>
    `;
    }
}
