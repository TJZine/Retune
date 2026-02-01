/**
 * @fileoverview Tab bar component for filtering EPG by library.
 * @module modules/ui/epg/EPGLibraryTabs
 * @version 1.0.0
 */

export interface EPGLibraryTabsConfig {
    onSelect: (libraryId: string | null) => void;
}

type LibraryOption = { id: string; name: string };

type PickerNodes = {
    overlay: HTMLElement;
    panel: HTMLElement;
    items: HTMLButtonElement[];
};

export class EPGLibraryTabs {
    private static _idCounter = 0;
    private _el: HTMLElement | null = null;
    private _gridElement: HTMLElement | null = null;
    private _pill: HTMLButtonElement | null = null;
    private _picker: PickerNodes | null = null;
    private _libraries: LibraryOption[] = [];
    private _selectedId: string | null = null;
    private _focusedIndex = 0;
    private _isPillFocused = false;
    private readonly _panelId: string;

    constructor(private readonly _config: EPGLibraryTabsConfig) {
        this._panelId = `epg-library-picker-panel-${EPGLibraryTabs._idCounter++}`;
    }

    initialize(gridElement: HTMLElement): void {
        if (this._el) return;
        const el = document.createElement('div');
        el.className = 'epg-library-tabs';
        gridElement.appendChild(el);
        this._el = el;
        this._gridElement = gridElement;
    }

    isVisible(): boolean {
        return Boolean(this._el && this._el.style.display !== 'none');
    }

    update(libraries: LibraryOption[], selectedId: string | null): void {
        this._libraries = libraries;
        this._selectedId = selectedId;

        if (!this._el) return;

        if (libraries.length <= 1) {
            this._el.style.display = 'none';
            this._el.replaceChildren();
            this._pill = null;
            this._focusedIndex = 0;
            this._isPillFocused = false;
            this.closePicker();
            return;
        }

        this._el.style.display = '';
        this._renderPill();
        if (this.isPickerOpen()) {
            this._renderPicker();
        }
        this._applyPillClasses();
    }

    setFocusedToSelected(): void {
        const allTabs = this._getOptionIds();
        const index = allTabs.findIndex((id) => id === this._selectedId);
        this._focusedIndex = index >= 0 ? index : 0; // 0 is "All"
        this._isPillFocused = true;
        this._applyPillClasses();
        this._applyPickerClasses();
    }

    setPillFocused(focused: boolean): void {
        this._isPillFocused = focused;
        this._applyPillClasses();
    }

    moveFocus(delta: -1 | 1): void {
        if (!this.isPickerOpen()) return;
        const count = this._getOptionIds().length;
        if (count <= 0) return;
        const next = Math.max(0, Math.min(this._focusedIndex + delta, count - 1));
        this._focusedIndex = next;
        this._applyPickerClasses();
        const focusedItem = this._picker?.items[this._focusedIndex] ?? null;
        if (focusedItem && typeof focusedItem.scrollIntoView === 'function') {
            focusedItem.scrollIntoView({ block: 'nearest' });
        }
    }

    getFocusedLibraryId(): string | null {
        const ids = this._getOptionIds();
        return ids[this._focusedIndex] ?? null;
    }

    selectFocused(): void {
        if (!this.isPickerOpen()) {
            this._openPicker();
            return;
        }
        this._config.onSelect(this.getFocusedLibraryId());
        this.closePicker();
    }

    closePicker(): void {
        this._picker?.overlay.remove();
        this._picker = null;
        this._applyPillClasses();
    }

    isPickerOpen(): boolean {
        return Boolean(this._picker);
    }

    destroy(): void {
        this.closePicker();
        this._el?.remove();
        this._el = null;
        this._gridElement = null;
        this._pill = null;
        this._libraries = [];
    }

    private _getOptionIds(): Array<string | null> {
        return [null, ...this._libraries.map((l) => l.id)];
    }

    private _getOptionLabels(): string[] {
        return ['All', ...this._libraries.map((l) => l.name)];
    }

    private _renderPill(): void {
        if (!this._el) return;
        if (!this._pill) {
            const b = document.createElement('button');
            b.className = 'epg-library-pill';
            b.type = 'button';
            b.setAttribute('aria-label', 'Library filter');
            b.setAttribute('aria-haspopup', 'listbox');
            b.setAttribute('aria-controls', this._panelId);
            b.addEventListener('click', () => this.selectFocused());
            this._pill = b;
            this._el.replaceChildren(b);
        }

        const labels = this._getOptionLabels();
        const ids = this._getOptionIds();
        const selectedIndex = ids.findIndex((id) => id === this._selectedId);
        const label = labels[selectedIndex >= 0 ? selectedIndex : 0] ?? 'All';
        this._pill.textContent = `Library: ${label}`;
    }

    private _openPicker(): void {
        this._focusedIndex = this._getFocusedIndexForOpen();
        this._renderPicker();
        this._applyPickerClasses();
        this._applyPillClasses();
    }

    private _getFocusedIndexForOpen(): number {
        const ids = this._getOptionIds();
        const index = ids.findIndex((id) => id === this._selectedId);
        return index >= 0 ? index : 0;
    }

    private _renderPicker(): void {
        if (!this._gridElement) return;

        if (!this._picker) {
            const overlay = document.createElement('div');
            overlay.className = 'epg-library-picker-overlay';

            const scrim = document.createElement('div');
            scrim.className = 'epg-library-picker-scrim';

            const panel = document.createElement('div');
            panel.className = 'epg-library-picker-panel';
            panel.id = this._panelId;
            panel.setAttribute('aria-label', 'Library filter options');

            overlay.appendChild(scrim);
            overlay.appendChild(panel);
            this._gridElement.appendChild(overlay);

            this._picker = { overlay, panel, items: [] };
        }

        const labels = this._getOptionLabels();
        const ids = this._getOptionIds();
        const buttons = ids.map((id, i) => {
            const b = document.createElement('button');
            b.className = 'epg-library-picker-item';
            b.type = 'button';
            b.textContent = labels[i] ?? '';
            b.dataset.libraryId = id ?? '';
            b.addEventListener('click', () => {
                this._focusedIndex = i;
                this._applyPickerClasses();
                this.selectFocused();
            });
            return b;
        });

        this._picker.items = buttons;
        this._picker.panel.replaceChildren(...buttons);
        this._applyPickerClasses();
    }

    private _applyPillClasses(): void {
        if (!this._pill) return;
        this._pill.classList.toggle('focused', this._isPillFocused);
        this._pill.setAttribute('aria-expanded', this.isPickerOpen() ? 'true' : 'false');
    }

    private _applyPickerClasses(): void {
        if (!this._picker) return;
        const ids = this._getOptionIds();
        for (let i = 0; i < this._picker.items.length; i++) {
            const b = this._picker.items[i]!;
            const id = ids[i] ?? null;
            const selected = id === this._selectedId;
            const focused = i === this._focusedIndex;

            b.classList.toggle('selected', selected);
            b.classList.toggle('focused', focused);
        }
    }
}
