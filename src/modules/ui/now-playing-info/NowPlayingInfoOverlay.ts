/**
 * @fileoverview Now Playing Info overlay UI.
 * @module modules/ui/now-playing-info/NowPlayingInfoOverlay
 */

import { NOW_PLAYING_INFO_CLASSES, NOW_PLAYING_INFO_DEFAULTS } from './constants';
import type { INowPlayingInfoOverlay } from './interfaces';
import type { NowPlayingInfoConfig, NowPlayingInfoViewModel } from './types';

export class NowPlayingInfoOverlay implements INowPlayingInfoOverlay {
    private containerElement: HTMLElement | null = null;
    private isVisibleFlag = false;
    private autoHideTimer: number | null = null;
    private autoHideMs: number = NOW_PLAYING_INFO_DEFAULTS.autoHideMs;
    private onAutoHide: (() => void) | null = null;
    private actorResizeObserver: ResizeObserver | null = null;
    private lastActorState: {
        headshots: Array<{ name: string; url: string | null }>;
        totalCount: number;
    } | null = null;

    initialize(config: NowPlayingInfoConfig): void {
        const container = document.getElementById(config.containerId);
        if (!container) {
            throw new Error(`Now Playing Info container #${config.containerId} not found`);
        }
        this.containerElement = container;
        this.containerElement.classList.add(NOW_PLAYING_INFO_CLASSES.CONTAINER);
        this.containerElement.innerHTML = this.createTemplate();
        this.containerElement.classList.remove('visible');
        this.isVisibleFlag = false;

        if (typeof config.autoHideMs === 'number') {
            this.setAutoHideMs(config.autoHideMs);
        }
        if (config.onAutoHide) {
            this.setOnAutoHide(config.onAutoHide);
        }

        this.setupActorResizeObserver();
    }

    private createTemplate(): string {
        return `
      <div class="${NOW_PLAYING_INFO_CLASSES.PANEL}">
        <img class="${NOW_PLAYING_INFO_CLASSES.POSTER}" src="" alt="" />
        <div class="${NOW_PLAYING_INFO_CLASSES.CONTENT}">
          <div class="${NOW_PLAYING_INFO_CLASSES.TITLE}"></div>
          <div class="${NOW_PLAYING_INFO_CLASSES.SUBTITLE}"></div>
          <div class="${NOW_PLAYING_INFO_CLASSES.BADGES}"></div>
          <div class="${NOW_PLAYING_INFO_CLASSES.META}"></div>
          <div class="${NOW_PLAYING_INFO_CLASSES.ACTORS}"></div>
          <div class="${NOW_PLAYING_INFO_CLASSES.DESCRIPTION}"></div>
          <div class="${NOW_PLAYING_INFO_CLASSES.CONTEXT}"></div>
          <pre class="${NOW_PLAYING_INFO_CLASSES.DEBUG}"></pre>
          <div class="${NOW_PLAYING_INFO_CLASSES.PROGRESS}">
            <div class="${NOW_PLAYING_INFO_CLASSES.PROGRESS_BAR}">
              <div class="${NOW_PLAYING_INFO_CLASSES.PROGRESS_FILL}"></div>
            </div>
            <div class="${NOW_PLAYING_INFO_CLASSES.PROGRESS_META}"></div>
          </div>
          <div class="${NOW_PLAYING_INFO_CLASSES.UP_NEXT}"></div>
        </div>
      </div>
    `;
    }

    destroy(): void {
        this.clearAutoHideTimer();
        this.actorResizeObserver?.disconnect();
        this.actorResizeObserver = null;
        this.lastActorState = null;
        if (this.containerElement) {
            this.containerElement.innerHTML = '';
            this.containerElement.classList.remove('visible');
        }
        this.containerElement = null;
        this.isVisibleFlag = false;
    }

    show(viewModel: NowPlayingInfoViewModel): void {
        if (!this.containerElement) return;
        this.containerElement.classList.add('visible');
        this.isVisibleFlag = true;
        this.updateContent(viewModel);
        if (typeof ResizeObserver === 'undefined') {
            this.scheduleActorReflow();
        }
        this.resetAutoHideTimer();
    }

    update(viewModel: NowPlayingInfoViewModel): void {
        if (!this.containerElement) return;
        this.updateContent(viewModel);
    }

    hide(): void {
        if (!this.containerElement) return;
        this.clearAutoHideTimer();
        this.containerElement.classList.remove('visible');
        this.isVisibleFlag = false;
    }

    isVisible(): boolean {
        return this.isVisibleFlag;
    }

    setAutoHideMs(autoHideMs: number): void {
        if (!Number.isFinite(autoHideMs) || autoHideMs <= 0) {
            this.autoHideMs = NOW_PLAYING_INFO_DEFAULTS.autoHideMs;
            return;
        }
        this.autoHideMs = Math.max(1000, Math.floor(autoHideMs));
    }

    resetAutoHideTimer(): void {
        if (!this.isVisibleFlag) return;
        this.clearAutoHideTimer();
        this.autoHideTimer = window.setTimeout(() => {
            if (this.onAutoHide) {
                this.onAutoHide();
            } else {
                this.hide();
            }
        }, this.autoHideMs);
    }

    setOnAutoHide(handler: (() => void) | null): void {
        this.onAutoHide = handler;
    }

    private clearAutoHideTimer(): void {
        if (this.autoHideTimer !== null) {
            window.clearTimeout(this.autoHideTimer);
            this.autoHideTimer = null;
        }
    }

    private setupActorResizeObserver(): void {
        if (typeof ResizeObserver === 'undefined') return;
        if (!this.containerElement) return;

        const actors = this.containerElement.querySelector(
            `.${NOW_PLAYING_INFO_CLASSES.ACTORS}`
        ) as HTMLElement | null;
        if (!actors) return;

        this.actorResizeObserver?.disconnect();
        this.actorResizeObserver = new ResizeObserver(() => {
            if (!this.isVisibleFlag || !this.lastActorState) return;
            this.renderActorRow(actors, this.lastActorState.headshots, this.lastActorState.totalCount);
        });
        this.actorResizeObserver.observe(actors);
    }

    private updateContent(viewModel: NowPlayingInfoViewModel): void {
        if (!this.containerElement) return;

        const poster = this.containerElement.querySelector(
            `.${NOW_PLAYING_INFO_CLASSES.POSTER}`
        ) as HTMLImageElement | null;
        if (poster) {
            const posterUrl = viewModel.posterUrl ?? null;
            if (posterUrl) {
                poster.src = posterUrl;
                poster.alt = viewModel.title;
                poster.style.display = 'block';
            } else {
                poster.src = '';
                poster.style.display = 'none';
            }
        }

        const title = this.containerElement.querySelector(`.${NOW_PLAYING_INFO_CLASSES.TITLE}`);
        if (title) {
            title.textContent = viewModel.title || '';
        }

        const subtitle = this.containerElement.querySelector(`.${NOW_PLAYING_INFO_CLASSES.SUBTITLE}`);
        if (subtitle) {
            subtitle.textContent = viewModel.subtitle || '';
            (subtitle as HTMLElement).style.display = viewModel.subtitle ? 'block' : 'none';
        }

        const badgesContainer = this.containerElement.querySelector(
            `.${NOW_PLAYING_INFO_CLASSES.BADGES}`
        ) as HTMLElement | null;
        if (badgesContainer) {
            const badges = viewModel.badges ?? [];
            badgesContainer.textContent = '';
            if (badges.length > 0) {
                for (const badgeText of badges) {
                    const badge = document.createElement('span');
                    badge.className = NOW_PLAYING_INFO_CLASSES.BADGE;
                    badge.textContent = badgeText;
                    badgesContainer.appendChild(badge);
                }
                badgesContainer.style.display = 'flex';
            } else {
                badgesContainer.style.display = 'none';
            }
        }

        const description = this.containerElement.querySelector(
            `.${NOW_PLAYING_INFO_CLASSES.DESCRIPTION}`
        ) as HTMLElement | null;
        if (description) {
            description.textContent = viewModel.description || '';
            description.style.display = viewModel.description ? 'block' : 'none';
        }

        const actors = this.containerElement.querySelector(
            `.${NOW_PLAYING_INFO_CLASSES.ACTORS}`
        ) as HTMLElement | null;
        if (actors) {
            this.updateActorRow(actors, viewModel);
        }

        const meta = this.containerElement.querySelector(
            `.${NOW_PLAYING_INFO_CLASSES.META}`
        ) as HTMLElement | null;
        if (meta) {
            meta.textContent = '';
            const lines = viewModel.metaLines ?? [];
            if (lines.length > 0) {
                for (const line of lines) {
                    const row = document.createElement('div');
                    row.className = NOW_PLAYING_INFO_CLASSES.META_LINE;
                    row.textContent = line;
                    meta.appendChild(row);
                }
                meta.style.display = 'flex';
            } else {
                meta.style.display = 'none';
            }
        }

        const context = this.containerElement.querySelector(
            `.${NOW_PLAYING_INFO_CLASSES.CONTEXT}`
        ) as HTMLElement | null;
        if (context) {
            const channelPrefix = ((): string => {
                const num = viewModel.channelNumber;
                const name = viewModel.channelName;
                if (typeof num === 'number' && name) return `${num} ${name}`;
                if (typeof num === 'number') return `${num}`;
                if (name) return name;
                return '';
            })();
            context.textContent = channelPrefix;
            context.style.display = channelPrefix ? 'block' : 'none';
        }

        const debugEl = this.containerElement.querySelector(
            `.${NOW_PLAYING_INFO_CLASSES.DEBUG}`
        ) as HTMLPreElement | null;
        if (debugEl) {
            debugEl.textContent = viewModel.debugText || '';
            debugEl.style.display = viewModel.debugText ? 'block' : 'none';
        }

        const progress = this.containerElement.querySelector(
            `.${NOW_PLAYING_INFO_CLASSES.PROGRESS}`
        ) as HTMLElement | null;
        const progressFill = this.containerElement.querySelector(
            `.${NOW_PLAYING_INFO_CLASSES.PROGRESS_FILL}`
        ) as HTMLElement | null;
        const progressMeta = this.containerElement.querySelector(
            `.${NOW_PLAYING_INFO_CLASSES.PROGRESS_META}`
        ) as HTMLElement | null;

        const durationMs = viewModel.durationMs ?? 0;
        const elapsedMs = viewModel.elapsedMs ?? 0;
        if (progress && progressFill && progressMeta && durationMs > 0) {
            const clampedElapsed = Math.max(0, Math.min(elapsedMs, durationMs));
            const percent = Math.max(0, Math.min(100, (clampedElapsed / durationMs) * 100));
            progressFill.style.width = `${percent.toFixed(2)}%`;
            progressMeta.textContent = `${formatTimecode(clampedElapsed)} / ${formatTimecode(durationMs)}`;
            progress.style.display = 'flex';
        } else if (progress && progressFill && progressMeta) {
            progressFill.style.width = '100%';
            progressMeta.textContent = 'Live';
            progress.style.display = 'flex';
        } else if (progress) {
            progress.style.display = 'none';
        }

        const upNext = this.containerElement.querySelector(
            `.${NOW_PLAYING_INFO_CLASSES.UP_NEXT}`
        ) as HTMLElement | null;
        if (upNext) {
            const next = viewModel.upNext;
            if (next) {
                upNext.textContent = `Up next • ${formatLocalTime(next.startsAtMs)} — ${next.title}`;
                upNext.style.display = 'block';
            } else {
                upNext.textContent = '';
                upNext.style.display = 'none';
            }
        }
    }

    private updateActorRow(actors: HTMLElement, viewModel: NowPlayingInfoViewModel): void {
        const headshots = viewModel.actorHeadshots ?? [];
        const totalCount =
            viewModel.actorTotalCount ??
            (headshots.length + (viewModel.actorMoreCount ?? 0));
        if (headshots.length === 0 || totalCount <= 0) {
            this.lastActorState = null;
            actors.textContent = '';
            actors.dataset.signature = '';
            actors.style.display = 'none';
            return;
        }
        this.lastActorState = { headshots, totalCount };
        this.renderActorRow(actors, headshots, totalCount);
    }

    private scheduleActorReflow(): void {
        if (!this.containerElement || !this.lastActorState) return;
        const actors = this.containerElement.querySelector(
            `.${NOW_PLAYING_INFO_CLASSES.ACTORS}`
        ) as HTMLElement | null;
        if (!actors) return;
        if (actors.clientWidth > 0) return;
        requestAnimationFrame(() => {
            if (!this.containerElement || !this.isVisibleFlag || !this.lastActorState) return;
            const actorsEl = this.containerElement.querySelector(
                `.${NOW_PLAYING_INFO_CLASSES.ACTORS}`
            ) as HTMLElement | null;
            if (!actorsEl) return;
            this.renderActorRow(actorsEl, this.lastActorState.headshots, this.lastActorState.totalCount);
        });
    }

    private renderActorRow(
        actors: HTMLElement,
        headshots: Array<{ name: string; url: string | null }>,
        totalCount: number
    ): void {
        const displayCount = computeActorDisplayCount(actors, headshots.length, totalCount);
        const visibleHeadshots = headshots.slice(0, displayCount);
        const moreCount = Math.max(0, totalCount - visibleHeadshots.length);
        const maxSlots = computeActorMaxSlots(actors);
        const canShowMore = moreCount > 0 && maxSlots > displayCount;
        const effectiveMoreCount = canShowMore ? moreCount : 0;
        const signature = `${visibleHeadshots
            .map((entry) => `${entry.name}|${entry.url ?? ''}`)
            .join(';')}|+${effectiveMoreCount}`;
        if (actors.dataset.signature !== signature) {
            actors.textContent = '';
            for (const actor of visibleHeadshots) {
                const row = document.createElement('div');
                row.className = NOW_PLAYING_INFO_CLASSES.ACTOR;
                if (actor.url) {
                    const image = document.createElement('img');
                    image.className = NOW_PLAYING_INFO_CLASSES.ACTOR_IMAGE;
                    image.alt = actor.name;
                    image.title = actor.name;
                    image.loading = 'lazy';
                    image.src = actor.url;
                    row.appendChild(image);
                } else {
                    row.classList.add('fallback');
                    row.textContent = formatInitials(actor.name);
                    row.title = actor.name;
                }
                actors.appendChild(row);
            }
            if (effectiveMoreCount > 0) {
                const more = document.createElement('div');
                more.className = NOW_PLAYING_INFO_CLASSES.ACTOR_MORE;
                more.textContent = `+${effectiveMoreCount}`;
                actors.appendChild(more);
            }
            actors.dataset.signature = signature;
        }
        actors.style.display = visibleHeadshots.length > 0 ? 'flex' : 'none';
    }
}

const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
});

function formatLocalTime(ms: number): string {
    return TIME_FORMATTER.format(new Date(ms));
}

function formatTimecode(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '');
    return initials.join('');
}

function computeActorDisplayCount(
    container: HTMLElement,
    headshotCount: number,
    totalCount: number
): number {
    if (headshotCount <= 0) return 0;
    const metrics = readActorSlotMetrics(container);
    const { available, maxSlots } = metrics;
    if (available <= 0) {
        return headshotCount;
    }
    let visible = Math.min(headshotCount, maxSlots);
    if (totalCount > visible && visible > 1) {
        visible -= 1;
    }
    return Math.max(1, visible);
}

function computeActorMaxSlots(container: HTMLElement): number {
    const { available, maxSlots } = readActorSlotMetrics(container);
    if (available <= 0) return 0;
    return maxSlots;
}

function readActorSlotMetrics(container: HTMLElement): {
    available: number;
    maxSlots: number;
} {
    const styles = getComputedStyle(container);
    const sizePx = readPx(styles.getPropertyValue('--actor-size'), 44);
    const gapPx = readPx(styles.getPropertyValue('--actor-gap'), 8);
    const available = container.clientWidth;
    const slot = sizePx + gapPx;
    const maxSlots = slot > 0 ? Math.max(1, Math.floor((available + gapPx) / slot)) : 1;
    return { available, maxSlots };
}

function readPx(value: string, fallback: number): number {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
