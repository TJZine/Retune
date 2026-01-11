/**
 * @fileoverview Minimal server selection screen for Plex discovery.
 * @module modules/ui/server-select/ServerSelectScreen
 * @version 1.0.0
 */

import { AppOrchestrator } from '../../../Orchestrator';
import type { PlexServer } from '../../plex/discovery/types';
import { PlexApiError } from '../../plex/auth';
import type { FocusableElement } from '../../navigation';


export class ServerSelectScreen {
    private _container: HTMLElement;
    private _orchestrator: AppOrchestrator;
    private _statusEl: HTMLElement;
    private _detailEl: HTMLElement;
    private _errorEl: HTMLElement;
    private _listEl: HTMLElement;
    private _refreshButton: HTMLButtonElement;
    private _setupButton: HTMLButtonElement;
    private _clearButton: HTMLButtonElement;
    private _isLoading: boolean = false;

    constructor(container: HTMLElement, orchestrator: AppOrchestrator) {
        this._container = container;
        this._orchestrator = orchestrator;
        this._container.classList.add('screen');
        this._container.style.position = 'absolute';
        this._container.style.inset = '0';
        this._container.style.display = 'none';
        this._container.style.alignItems = 'center';
        this._container.style.justifyContent = 'center';

        const panel = document.createElement('div');
        panel.className = 'screen-panel';

        const title = document.createElement('h1');
        title.className = 'screen-title';
        title.textContent = 'Select Plex Server';
        panel.appendChild(title);

        const subtitle = document.createElement('p');
        subtitle.className = 'screen-subtitle';
        subtitle.textContent = 'Choose a server to continue startup.';
        panel.appendChild(subtitle);

        const status = document.createElement('div');
        status.className = 'screen-status';
        status.textContent = 'Ready to discover servers.';
        panel.appendChild(status);
        this._statusEl = status;

        const detail = document.createElement('div');
        detail.className = 'screen-detail';
        detail.textContent = '';
        panel.appendChild(detail);
        this._detailEl = detail;

        const error = document.createElement('div');
        error.className = 'screen-error';
        error.textContent = '';
        panel.appendChild(error);
        this._errorEl = error;

        const buttonRow = document.createElement('div');
        buttonRow.className = 'button-row';

        const refreshButton = document.createElement('button');
        refreshButton.id = 'btn-server-refresh';
        refreshButton.className = 'screen-button';
        refreshButton.textContent = 'Refresh';
        refreshButton.addEventListener('click', () => {
            this.refresh().catch(console.error);
        });
        buttonRow.appendChild(refreshButton);
        this._refreshButton = refreshButton;

        const setupButton = document.createElement('button');
        setupButton.id = 'btn-server-setup';
        setupButton.className = 'screen-button secondary';
        setupButton.textContent = 'Re-run Setup';
        setupButton.addEventListener('click', () => {
            this._clearError();
            this._orchestrator.requestChannelSetupRerun();
        });
        buttonRow.appendChild(setupButton);
        this._setupButton = setupButton;

        const clearButton = document.createElement('button');
        clearButton.id = 'btn-server-forget';
        clearButton.className = 'screen-button secondary';
        clearButton.textContent = 'Forget Selection';
        clearButton.addEventListener('click', () => {
            this._handleClearSelection();
        });
        buttonRow.appendChild(clearButton);
        this._clearButton = clearButton;


        panel.appendChild(buttonRow);

        const list = document.createElement('div');
        list.className = 'server-list';
        panel.appendChild(list);
        this._listEl = list;

        this._container.appendChild(panel);
    }

    show(): void {
        this._container.style.display = 'flex';
        this._container.classList.add('visible');
        this._clearError();
        this._setStatus('', '');
        this._registerFocusables();
        this.refresh().catch(console.error);
    }

    hide(): void {
        this._unregisterFocusables();
        this._container.style.display = 'none';
        this._container.classList.remove('visible');
    }


    async refresh(): Promise<void> {
        if (this._isLoading) {
            return;
        }
        this._isLoading = true;
        this._clearError();
        this._setStatus('Discovering servers…', '');
        this._refreshButton.disabled = true;
        this._setupButton.disabled = true;
        this._clearButton.disabled = true;

        try {
            const servers = await this._orchestrator.discoverServers(true);
            this._renderServers(servers);
            if (servers.length === 0) {
                this._setStatus('No servers found.', 'Ensure your Plex server is reachable.');
            } else {
                this._setStatus('Select a server from the list.', '');
            }
        } catch (error) {
            this._handleError(error, 'Failed to discover servers.');
            this._setStatus('Discovery failed.', '');
        } finally {
            this._refreshButton.disabled = false;
            this._setupButton.disabled = false;
            this._clearButton.disabled = false;
            this._isLoading = false;

            // CRITICAL: Restore focus if it was lost due to disabling buttons
            const nav = this._orchestrator.getNavigation();
            if (nav) {
                // Slight delay to ensure browser acknowledges the button is enabled again
                // before attempting to focus it.
                setTimeout(() => {
                    nav.setFocus('btn-server-refresh');
                }, 50);
            }
        }
    }


    private _handleClearSelection(): void {
        this._clearError();
        this._orchestrator.clearSelectedServer();
        this._setStatus('Selection cleared.', 'Pick a server to continue.');
        this._renderServers([]);
    }

    private _renderServers(servers: PlexServer[]): void {
        // Clean up existing focusables to prevent phantom navigation targets
        const nav = this._orchestrator.getNavigation();
        if (nav) {
            const buttons = this._listEl.querySelectorAll('button');
            buttons.forEach(btn => nav.unregisterFocusable(btn.id));
        }

        this._listEl.innerHTML = '';

        if (servers.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'server-meta';
            empty.textContent = 'No servers available.';
            this._listEl.appendChild(empty);
            return;
        }

        for (let i = 0; i < servers.length; i++) {
            const server = servers[i];
            if (!server) continue;

            const row = document.createElement('div');
            row.className = 'server-row';

            const main = document.createElement('div');
            main.className = 'server-main';

            const name = document.createElement('div');
            name.className = 'server-name';
            name.textContent = server.name;
            main.appendChild(name);

            const meta = document.createElement('div');
            meta.className = 'server-meta';
            meta.textContent = this._buildServerMeta(server);
            main.appendChild(meta);

            row.appendChild(main);

            const actions = document.createElement('div');
            actions.className = 'server-actions';

            const selectButton = document.createElement('button');
            selectButton.id = `btn-server-select-${i}`;
            selectButton.className = 'screen-button secondary';
            selectButton.textContent = 'Select';
            selectButton.addEventListener('click', () => {
                this._selectServer(server).catch(console.error);
            });
            actions.appendChild(selectButton);
            row.appendChild(actions);

            this._listEl.appendChild(row);

            // Register dynamic focusable manually since we are already showing
            const nav = this._orchestrator.getNavigation();
            if (nav) {
                const element: FocusableElement = {
                    id: selectButton.id,
                    element: selectButton,
                    neighbors: {
                        up: i === 0 ? 'btn-server-refresh' : `btn-server-select-${i - 1}`,
                    },
                };
                if (i < servers.length - 1) {
                    element.neighbors!.down = `btn-server-select-${i + 1}`;
                }
                nav.registerFocusable(element);
            }
        }

        // Update neighbors for static buttons now that list is populated
        this._updateStaticButtonNeighbors(servers.length > 0);

    }

    private async _selectServer(server: PlexServer): Promise<void> {
        this._clearError();
        this._setStatus(`Connecting to ${server.name}…`, '');
        this._detailEl.textContent = '';

        const success = await this._orchestrator.selectServer(server.id);
        if (success) {
            this._setStatus(`Connected to ${server.name}.`, 'Continuing startup…');
            return;
        }
        this._setStatus('Connection failed.', '');
        this._errorEl.textContent = 'Unable to connect to the selected server.';
    }

    private _buildServerMeta(server: PlexServer): string {
        const ownership = server.owned ? 'Owned' : `Shared by ${server.sourceTitle}`;
        const total = server.connections.length;
        let localCount = 0;
        let relayCount = 0;
        for (const connection of server.connections) {
            if (connection.local) {
                localCount += 1;
            }
            if (connection.relay) {
                relayCount += 1;
            }
        }
        return `${ownership} • Connections: ${total} (local ${localCount}, relay ${relayCount})`;
    }

    private _setStatus(status: string, detail: string): void {
        this._statusEl.textContent = status;
        this._detailEl.textContent = detail;
    }

    private _clearError(): void {
        this._errorEl.textContent = '';
    }

    private _handleError(error: unknown, fallback: string): void {
        if (error instanceof PlexApiError) {
            this._errorEl.textContent = `${error.code}: ${error.message}`;
            return;
        }
        const message = error instanceof Error ? error.message : fallback;
        this._errorEl.textContent = message;
    }

    private _registerFocusables(): void {
        const nav = this._orchestrator.getNavigation();
        if (!nav) return;

        nav.registerFocusable({
            id: 'btn-server-refresh',
            element: this._refreshButton,
            neighbors: {
                right: 'btn-server-setup',
                // down will be linked dynamically when list renders
            },
        });

        nav.registerFocusable({
            id: 'btn-server-setup',
            element: this._setupButton,
            neighbors: {
                left: 'btn-server-refresh',
                right: 'btn-server-forget',
                // down will be linked dynamically when list renders
            },
        });

        nav.registerFocusable({
            id: 'btn-server-forget',
            element: this._clearButton,
            neighbors: {
                left: 'btn-server-setup',
                // down will be linked dynamically when list renders
            },
        });

        // Set initial focus
        nav.setFocus('btn-server-refresh');
    }

    private _unregisterFocusables(): void {
        const nav = this._orchestrator.getNavigation();
        if (!nav) return;

        nav.unregisterFocusable('btn-server-refresh');
        nav.unregisterFocusable('btn-server-setup');
        nav.unregisterFocusable('btn-server-forget');

        // Clear potential list items
        // In a real app we'd track IDs, but here we can just clear known patterns or rely on page tear-down
        // For now, let's just clear the list HTML which removes listeners at DOM level, 
        // but we should technically unregister from nav manager to keep map clean.
        const buttons = this._listEl.querySelectorAll('button');
        buttons.forEach(btn => nav.unregisterFocusable(btn.id));
    }

    private _updateStaticButtonNeighbors(hasListItems: boolean): void {
        const nav = this._orchestrator.getNavigation();
        if (!nav) return;

        // Re-register to update neighbors
        const refreshParams: FocusableElement = {
            id: 'btn-server-refresh',
            element: this._refreshButton,
            neighbors: {
                right: 'btn-server-setup',
            },
        };
        if (hasListItems) {
            refreshParams.neighbors!.down = 'btn-server-select-0';
        }
        nav.registerFocusable(refreshParams);

        const setupParams: FocusableElement = {
            id: 'btn-server-setup',
            element: this._setupButton,
            neighbors: {
                left: 'btn-server-refresh',
                right: 'btn-server-forget',
            },
        };
        if (hasListItems) {
            setupParams.neighbors!.down = 'btn-server-select-0';
        }
        nav.registerFocusable(setupParams);

        const clearParams: FocusableElement = {
            id: 'btn-server-forget',
            element: this._clearButton,
            neighbors: {
                left: 'btn-server-setup',
            },
        };
        if (hasListItems) {
            clearParams.neighbors!.down = 'btn-server-select-0';
        }
        nav.registerFocusable(clearParams);
    }
}
