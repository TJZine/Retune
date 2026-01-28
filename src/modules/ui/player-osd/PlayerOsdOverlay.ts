/**
 * @fileoverview Player OSD overlay UI.
 * @module modules/ui/player-osd/PlayerOsdOverlay
 */

import { PLAYER_OSD_CLASSES } from './constants';
import type { IPlayerOsdOverlay } from './interfaces';
import type { PlayerOsdConfig, PlayerOsdViewModel } from './types';

type PlayerOsdElements = {
    status: HTMLElement | null;
    channel: HTMLElement | null;
    title: HTMLElement | null;
    subtitle: HTMLElement | null;
    upNext: HTMLElement | null;
    playbackTag: HTMLElement | null;
    actionSubtitles: HTMLElement | null;
    actionAudio: HTMLElement | null;
    barBuffer: HTMLElement | null;
    barPlayed: HTMLElement | null;
    timecode: HTMLElement | null;
    ends: HTMLElement | null;
    bufferText: HTMLElement | null;
};

export class PlayerOsdOverlay implements IPlayerOsdOverlay {
    private containerElement: HTMLElement | null = null;
    private isVisibleFlag = false;
    private elements: PlayerOsdElements = {
        status: null,
        channel: null,
        title: null,
        subtitle: null,
        upNext: null,
        playbackTag: null,
        actionSubtitles: null,
        actionAudio: null,
        barBuffer: null,
        barPlayed: null,
        timecode: null,
        ends: null,
        bufferText: null,
    };

    initialize(config: PlayerOsdConfig): void {
        const container = document.getElementById(config.containerId);
        if (!container) {
            throw new Error(`Player OSD container #${config.containerId} not found`);
        }
        this.containerElement = container;
        this.containerElement.classList.add(PLAYER_OSD_CLASSES.CONTAINER);
        this.containerElement.innerHTML = this.createTemplate();
        this.containerElement.classList.remove(PLAYER_OSD_CLASSES.VISIBLE);
        this.isVisibleFlag = false;
        this.cacheElements();
    }

    destroy(): void {
        if (this.containerElement) {
            this.containerElement.innerHTML = '';
            this.containerElement.classList.remove(PLAYER_OSD_CLASSES.VISIBLE);
        }
        this.containerElement = null;
        this.isVisibleFlag = false;
        this.elements = {
            status: null,
            channel: null,
            title: null,
            subtitle: null,
            upNext: null,
            playbackTag: null,
            actionSubtitles: null,
            actionAudio: null,
            barBuffer: null,
            barPlayed: null,
            timecode: null,
            ends: null,
            bufferText: null,
        };
    }

    show(): void {
        if (!this.containerElement) return;
        this.containerElement.classList.add(PLAYER_OSD_CLASSES.VISIBLE);
        this.isVisibleFlag = true;
    }

    hide(): void {
        if (!this.containerElement) return;
        this.containerElement.classList.remove(PLAYER_OSD_CLASSES.VISIBLE);
        this.isVisibleFlag = false;
    }

    isVisible(): boolean {
        return this.isVisibleFlag;
    }

    setViewModel(vm: PlayerOsdViewModel): void {
        if (!this.containerElement) return;

        if (this.elements.status) {
            this.elements.status.textContent = vm.statusLabel;
        }
        if (this.elements.channel) {
            this.elements.channel.textContent = vm.channelPrefix;
            this.elements.channel.style.display = vm.channelPrefix ? 'block' : 'none';
        }
        if (this.elements.title) {
            this.elements.title.textContent = vm.title;
        }
        if (this.elements.subtitle) {
            this.elements.subtitle.textContent = vm.subtitle ?? '';
            this.elements.subtitle.style.display = vm.subtitle ? 'block' : 'none';
        }
        if (this.elements.upNext) {
            this.elements.upNext.textContent = vm.upNextText ?? '';
            this.elements.upNext.style.display = vm.upNextText ? 'block' : 'none';
        }
        if (this.elements.playbackTag) {
            const playbackText = vm.playbackText ?? '';
            this.elements.playbackTag.textContent = playbackText;
            this.elements.playbackTag.style.display = playbackText ? 'inline-flex' : 'none';
        }
        if (this.elements.actionSubtitles && vm.actionIds?.subtitles) {
            this.elements.actionSubtitles.id = vm.actionIds.subtitles;
        }
        if (this.elements.actionAudio && vm.actionIds?.audio) {
            this.elements.actionAudio.id = vm.actionIds.audio;
        }
        if (this.elements.barPlayed) {
            const playedPercent = Math.max(0, Math.min(1, vm.playedRatio)) * 100;
            this.elements.barPlayed.style.width = `${playedPercent.toFixed(2)}%`;
        }
        if (this.elements.barBuffer) {
            const bufferPercent = Math.max(0, Math.min(1, vm.bufferedRatio)) * 100;
            this.elements.barBuffer.style.width = `${bufferPercent.toFixed(2)}%`;
        }
        if (this.elements.timecode) {
            this.elements.timecode.textContent = vm.timecode;
        }
        if (this.elements.ends) {
            this.elements.ends.textContent = vm.endsAtText ?? '';
            this.elements.ends.style.display = vm.endsAtText ? 'block' : 'none';
        }
        if (this.elements.bufferText) {
            this.elements.bufferText.textContent = vm.bufferText ?? '';
            this.elements.bufferText.style.display = vm.bufferText ? 'block' : 'none';
        }
    }

    private cacheElements(): void {
        if (!this.containerElement) return;
        this.elements = {
            status: this.containerElement.querySelector(`.${PLAYER_OSD_CLASSES.STATUS}`),
            channel: this.containerElement.querySelector(`.${PLAYER_OSD_CLASSES.CHANNEL}`),
            title: this.containerElement.querySelector(`.${PLAYER_OSD_CLASSES.TITLE}`),
            subtitle: this.containerElement.querySelector(`.${PLAYER_OSD_CLASSES.SUBTITLE}`),
            upNext: this.containerElement.querySelector(`.${PLAYER_OSD_CLASSES.UP_NEXT}`),
            playbackTag: this.containerElement.querySelector(`.${PLAYER_OSD_CLASSES.PLAYBACK_TAG}`),
            actionSubtitles: this.containerElement.querySelector(
                `.${PLAYER_OSD_CLASSES.ACTION}[data-action="subtitles"]`
            ),
            actionAudio: this.containerElement.querySelector(
                `.${PLAYER_OSD_CLASSES.ACTION}[data-action="audio"]`
            ),
            barBuffer: this.containerElement.querySelector(`.${PLAYER_OSD_CLASSES.BAR_BUFFER}`),
            barPlayed: this.containerElement.querySelector(`.${PLAYER_OSD_CLASSES.BAR_PLAYED}`),
            timecode: this.containerElement.querySelector(`.${PLAYER_OSD_CLASSES.TIMECODE}`),
            ends: this.containerElement.querySelector(`.${PLAYER_OSD_CLASSES.ENDS}`),
            bufferText: this.containerElement.querySelector(`.${PLAYER_OSD_CLASSES.BUFFER_TEXT}`),
        };
    }

    private createTemplate(): string {
        return `
      <div class="${PLAYER_OSD_CLASSES.PANEL}">
        <div class="${PLAYER_OSD_CLASSES.TOP}">
          <div class="${PLAYER_OSD_CLASSES.STATUS}"></div>
          <div class="${PLAYER_OSD_CLASSES.CHANNEL}"></div>
        </div>

        <div class="${PLAYER_OSD_CLASSES.TITLE}"></div>
        <div class="${PLAYER_OSD_CLASSES.SUBTITLE}"></div>
        <div class="${PLAYER_OSD_CLASSES.UP_NEXT}"></div>

        <div class="${PLAYER_OSD_CLASSES.ACTIONS}">
          <button type="button" class="${PLAYER_OSD_CLASSES.ACTION}" data-action="subtitles">Subtitles</button>
          <button type="button" class="${PLAYER_OSD_CLASSES.ACTION}" data-action="audio">Audio</button>
          <div class="${PLAYER_OSD_CLASSES.PLAYBACK_TAG}"></div>
        </div>

        <div class="${PLAYER_OSD_CLASSES.BAR}">
          <div class="${PLAYER_OSD_CLASSES.BAR_BUFFER}"></div>
          <div class="${PLAYER_OSD_CLASSES.BAR_PLAYED}"></div>
        </div>

        <div class="${PLAYER_OSD_CLASSES.META}">
          <div class="${PLAYER_OSD_CLASSES.TIMECODE}"></div>
          <div class="${PLAYER_OSD_CLASSES.ENDS}"></div>
          <div class="${PLAYER_OSD_CLASSES.BUFFER_TEXT}"></div>
        </div>
      </div>
    `;
    }
}
