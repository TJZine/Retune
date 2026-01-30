export interface EPGLibraryTabsConfig {
    onSelect: (libraryId: string | null) => void;
}

export class EPGLibraryTabs {
    private _el: HTMLElement | null = null;
    private _tabs: HTMLButtonElement[] = [];
    private _libraries: Array<{ id: string; name: string }> = [];
    private _selectedId: string | null = null;
    private _focusedIndex = 0;

    constructor(private readonly _config: EPGLibraryTabsConfig) {}

    initialize(gridElement: HTMLElement): void {
        if (this._el) return;
        const el = document.createElement('div');
        el.className = 'epg-library-tabs';
        el.setAttribute('role', 'tablist');
        el.setAttribute('aria-label', 'Library filter');
        gridElement.appendChild(el);
        this._el = el;
    }

    isVisible(): boolean {
        return Boolean(this._el && this._el.style.display !== 'none');
    }

    update(libraries: Array<{ id: string; name: string }>, selectedId: string | null): void {
        this._libraries = libraries;
        this._selectedId = selectedId;

        if (!this._el) return;

        if (libraries.length <= 1) {
            this._el.style.display = 'none';
            this._el.replaceChildren();
            this._tabs = [];
            this._focusedIndex = 0;
            return;
        }

        this._el.style.display = '';
        this._render();
    }

    setFocusedToSelected(): void {
        const allTabs = this._getTabIds();
        const index = allTabs.findIndex((id) => id === this._selectedId);
        this._focusedIndex = index >= 0 ? index : 0; // 0 is "All"
        this._applyTabClasses();
    }

    moveFocus(delta: -1 | 1): void {
        const count = this._tabs.length;
        if (count <= 0) return;
        this._focusedIndex = (this._focusedIndex + delta + count) % count;
        this._applyTabClasses();
    }

    getFocusedLibraryId(): string | null {
        const ids = this._getTabIds();
        return ids[this._focusedIndex] ?? null;
    }

    selectFocused(): void {
        this._config.onSelect(this.getFocusedLibraryId());
    }

    destroy(): void {
        this._el?.remove();
        this._el = null;
        this._tabs = [];
        this._libraries = [];
    }

    private _getTabIds(): Array<string | null> {
        return [null, ...this._libraries.map((l) => l.id)];
    }

    private _render(): void {
        if (!this._el) return;

        const ids = this._getTabIds();
        const labels = ['All', ...this._libraries.map((l) => l.name)];

        const buttons = ids.map((id, i) => {
            const b = document.createElement('button');
            b.className = 'epg-library-tab';
            b.type = 'button';
            b.setAttribute('role', 'tab');
            b.textContent = labels[i] ?? '';
            b.dataset.libraryId = id ?? '';
            b.addEventListener('click', () => this._config.onSelect(id));
            return b;
        });

        this._tabs = buttons;
        this._el.replaceChildren(...buttons);
        this._applyTabClasses();
    }

    private _applyTabClasses(): void {
        const ids = this._getTabIds();
        for (let i = 0; i < this._tabs.length; i++) {
            const b = this._tabs[i]!;
            const id = ids[i] ?? null;
            const selected = id === this._selectedId;
            const focused = i === this._focusedIndex;

            b.classList.toggle('selected', selected);
            b.classList.toggle('focused', focused);
            b.setAttribute('aria-selected', selected ? 'true' : 'false');
        }
    }
}
