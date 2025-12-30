# Module: Plex Server Discovery

## Metadata
- **ID**: `plex-server-discovery`
- **Path**: `src/modules/plex/discovery/`
- **Primary File**: `PlexServerDiscovery.ts`
- **Test File**: `PlexServerDiscovery.test.ts`
- **Dependencies**: `plex-auth`
- **Complexity**: medium
- **Estimated LoC**: 280

## Purpose

Discovers and manages Plex Media Servers accessible to the authenticated user. Tests available connections (LAN, WAN, relay) to find the fastest route, handles server selection, and persists the chosen server for future sessions.

## Public Interface

```typescript
/**
 * Plex Server Discovery Interface
 */
export interface IPlexServerDiscovery {
  // Discovery
  discoverServers(): Promise<PlexServer[]>;
  refreshServers(): Promise<PlexServer[]>;
  
  // Connection Testing
  testConnection(server: PlexServer, connection: PlexConnection): Promise<number | null>;
  findFastestConnection(server: PlexServer): Promise<PlexConnection | null>;
  
  // Server Selection
  selectServer(serverId: string): Promise<boolean>;
  getSelectedServer(): PlexServer | null;
  getSelectedConnection(): PlexConnection | null;
  getServerUri(): string | null;
  
  // State
  getServers(): PlexServer[];
  isConnected(): boolean;
  
  // Events
  on(event: 'serverChange', handler: (server: PlexServer | null) => void): void;
  on(event: 'connectionChange', handler: (uri: string | null) => void): void;
}
```

## Required Exports

```typescript
// src/modules/plex/discovery/index.ts
export { PlexServerDiscovery } from './PlexServerDiscovery';
export type { IPlexServerDiscovery } from './interfaces';
export type {
  PlexServer,
  PlexConnection
} from './types';
```

## Implementation Requirements

### MUST Implement:

1. **Server Discovery via plex.tv**
   ```
   GET https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1
   Headers: X-Plex-Token, Accept: application/json
   ```

2. **Connection Testing**
   - Test each connection with timeout (5s)
   - Measure latency
   - Prefer local connections
   - Fall back to relay if nothing else works

3. **Server Selection Persistence**
   - Save selected server ID to localStorage
   - Restore on app restart
   - Re-test connection on restore

4. **Connection Priority**
   - Local (LAN) connections first
   - Remote (WAN) connections second  
   - Relay connections last (bandwidth limited)

### MUST NOT:

1. Select relay connection if direct connection available
2. Cache server list indefinitely (can change)
3. Block UI during connection testing

### State Management:

```typescript
interface DiscoveryState {
  servers: PlexServer[];
  selectedServerId: string | null;
  selectedConnection: PlexConnection | null;
  lastDiscoveryTime: number;
}
```

## Method Specifications

### `discoverServers(): Promise<PlexServer[]>`

**Purpose**: Fetch all servers accessible to the authenticated user.

**Returns**: Array of `PlexServer` with available connections

**Implementation Notes**:
```typescript
async discoverServers(): Promise<PlexServer[]> {
  const url = 'https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1';
  const headers = this.auth.getAuthHeaders();
  
  const response = await fetch(url, { headers });
  const data = await response.json();
  
  const servers = data
    .filter((r: any) => r.provides.includes('server'))
    .map((r: any) => this.parseServer(r));
  
  this.state.servers = servers;
  this.state.lastDiscoveryTime = Date.now();
  
  return servers;
}

private parseServer(data: any): PlexServer {
  return {
    id: data.clientIdentifier,
    name: data.name,
    sourceTitle: data.sourceTitle,
    ownerId: data.ownerId,
    owned: data.owned,
    capabilities: data.provides.split(','),
    connections: (data.connections || []).map(this.parseConnection),
    preferredConnection: null
  };
}
```

---

### `testConnection(server, connection): Promise<number | null>`

**Purpose**: Test a single connection and measure latency.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| server | PlexServer | Yes | Server to test |
| connection | PlexConnection | Yes | Connection to test |

**Returns**: Latency in ms, or `null` if unreachable

**Implementation Notes**:
```typescript
async testConnection(
  server: PlexServer, 
  connection: PlexConnection
): Promise<number | null> {
  const url = `${connection.uri}/identity`;
  const startTime = performance.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(url, {
      headers: this.auth.getAuthHeaders(),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) return null;
    
    const latency = performance.now() - startTime;
    connection.latencyMs = latency;
    return latency;
    
  } catch (e) {
    return null;
  }
}
```

---

### `findFastestConnection(server): Promise<PlexConnection | null>`

**Purpose**: Test all connections and return the fastest working one.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| server | PlexServer | Yes | Server to test connections for |

**Returns**: Best connection, or `null` if all fail

**Implementation Notes**:
```typescript
async findFastestConnection(server: PlexServer): Promise<PlexConnection | null> {
  // Group by priority
  const local = server.connections.filter(c => c.local && !c.relay);
  const remote = server.connections.filter(c => !c.local && !c.relay);
  const relay = server.connections.filter(c => c.relay);
  
  // Test local first
  for (const conn of local) {
    const latency = await this.testConnection(server, conn);
    if (latency !== null) {
      server.preferredConnection = conn;
      return conn;
    }
  }
  
  // Test remote
  for (const conn of remote) {
    const latency = await this.testConnection(server, conn);
    if (latency !== null) {
      server.preferredConnection = conn;
      return conn;
    }
  }
  
  // Fall back to relay
  for (const conn of relay) {
    const latency = await this.testConnection(server, conn);
    if (latency !== null) {
      server.preferredConnection = conn;
      return conn;
    }
  }
  
  return null;
}
```

---

### `selectServer(serverId): Promise<boolean>`

**Purpose**: Select a server and establish connection.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| serverId | string | Yes | Server machine identifier |

**Returns**: `true` if connection established

**Implementation Notes**:
```typescript
async selectServer(serverId: string): Promise<boolean> {
  const server = this.state.servers.find(s => s.id === serverId);
  if (!server) return false;
  
  const connection = await this.findFastestConnection(server);
  if (!connection) return false;
  
  this.state.selectedServerId = serverId;
  this.state.selectedConnection = connection;
  
  // Persist selection
  localStorage.setItem('retune_selected_server', serverId);
  
  // Emit events
  this.emit('serverChange', server);
  this.emit('connectionChange', connection.uri);
  
  return true;
}
```

## Events Emitted

| Event Name | Payload Type | When Emitted |
|------------|--------------|--------------|
| `serverChange` | `PlexServer \| null` | Server selection changes |
| `connectionChange` | `string \| null` | Active connection URI changes |

## Test Specification

### Unit Tests Required:

```typescript
describe('PlexServerDiscovery', () => {
  describe('discoverServers', () => {
    it('should fetch servers from plex.tv', async () => {
      mockFetch('https://plex.tv/api/v2/resources', mockServerList);
      const servers = await discovery.discoverServers();
      expect(servers.length).toBeGreaterThan(0);
    });
    
    it('should parse connections correctly', async () => {
      const servers = await discovery.discoverServers();
      expect(servers[0].connections).toHaveLength(3); // local, remote, relay
    });
  });
  
  describe('testConnection', () => {
    it('should return latency for working connection', async () => {
      mockFetch('http://192.168.1.5:32400/identity', { ok: true });
      const latency = await discovery.testConnection(server, localConn);
      expect(latency).toBeGreaterThan(0);
    });
    
    it('should return null for failed connection', async () => {
      mockFetch('http://192.168.1.5:32400/identity', { throws: true });
      const latency = await discovery.testConnection(server, localConn);
      expect(latency).toBeNull();
    });
    
    it('should timeout after 5 seconds', async () => {
      // Mock slow response
    });
  });
  
  describe('findFastestConnection', () => {
    it('should prefer local connections', async () => {
      const conn = await discovery.findFastestConnection(serverWithAllTypes);
      expect(conn?.local).toBe(true);
    });
    
    it('should fall back to relay if direct fails', async () => {
      mockLocalFail();
      mockRemoteFail();
      mockRelaySuccess();
      const conn = await discovery.findFastestConnection(server);
      expect(conn?.relay).toBe(true);
    });
  });
  
  describe('selectServer', () => {
    it('should persist selection to localStorage', async () => {
      await discovery.selectServer('abc123');
      expect(localStorage.getItem('retune_selected_server')).toBe('abc123');
    });
    
    it('should emit serverChange event', async () => {
      const handler = jest.fn();
      discovery.on('serverChange', handler);
      await discovery.selectServer('abc123');
      expect(handler).toHaveBeenCalled();
    });
  });
});
```

## File Structure

```
src/modules/plex/discovery/
├── index.ts                    # Public exports
├── PlexServerDiscovery.ts      # Main class
├── interfaces.ts               # IPlexServerDiscovery
├── types.ts                    # PlexServer, PlexConnection
├── constants.ts                # Timeouts, storage keys
└── __tests__/
    └── PlexServerDiscovery.test.ts
```

## Implementation Checklist

- [ ] Create file structure
- [ ] Implement server discovery from plex.tv
- [ ] Implement connection testing with timeout
- [ ] Implement connection prioritization (local > remote > relay)
- [ ] Implement server selection and persistence
- [ ] Write unit tests
- [ ] Add JSDoc comments
- [ ] Verify against acceptance criteria

## Acceptance Criteria

This module is COMPLETE when:
1. [ ] Can fetch server list from plex.tv
2. [ ] Connection testing identifies working connections
3. [ ] Local connections are preferred over remote/relay
4. [ ] Selected server persists across sessions
5. [ ] Events emit on server/connection changes
6. [ ] All unit tests pass
7. [ ] No TypeScript compilation errors
