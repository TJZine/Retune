# Plex Integration API

> [!CAUTION]
> Never log or expose Plex tokens or URLs containing `X-Plex-Token`. See [Security Logging Rules](../SECURITY_LOGGING_RULES.md).

## Interface Contract

```typescript
interface IPlexAPI extends 
  IPlexAuth, 
  IPlexServerDiscovery, 
  IPlexLibrary, 
  IPlexStreamResolver {
  
  // Initialization
  initialize(config: PlexAuthConfig): Promise<void>;
  
  // Health check
  healthCheck(): Promise<{ 
    authenticated: boolean; 
    serverReachable: boolean; 
    latencyMs: number;
  }>;
  
  // Events
  on(event: 'authChange', handler: (isAuthenticated: boolean) => void): void;
  on(event: 'serverChange', handler: (server: PlexServer | null) => void): void;
  on(event: 'connectionChange', handler: (uri: string | null) => void): void;
  on(event: 'error', handler: (error: PlexApiError) => void): void;
}
```

## Authentication (`IPlexAuth`)

Pin-based OAuth flow for TV devices.

```typescript
interface IPlexAuth {
  requestPin(): Promise<PlexPinRequest>;
  checkPinStatus(pinId: number): Promise<PlexPinRequest>;
  validateToken(token: string): Promise<boolean>;
}
```

## Library Access (`IPlexLibrary`)

Retrieving content metadata.

```typescript
interface IPlexLibrary {
  getLibraries(): Promise<PlexLibrary[]>;
  getLibraryItems(libraryId: string, options?: LibraryQueryOptions): Promise<PlexMediaItem[]>;
  getItem(ratingKey: string): Promise<PlexMediaItem>;
  getImageUrl(imagePath: string, width?: number, height?: number): string;
}
```

## Server Discovery (`IPlexServerDiscovery`)

Manages server discovery, connection testing, and selection.

### Discovery Methods

```typescript
interface IPlexServerDiscovery {
  // Discover available Plex servers for the authenticated user
  discoverServers(): Promise<PlexServer[]>;
  
  // Refresh the server list from plex.tv
  refreshServers(): Promise<PlexServer[]>;
  
  // Get all cached servers
  getServers(): PlexServer[];
}
```

### Connection Testing

```typescript
interface IPlexServerDiscovery {
  // Test a specific connection endpoint
  // Returns latency in ms, or null if failed
  testConnection(server: PlexServer, connection: PlexConnection): Promise<number | null>;
  
  // Find the fastest working connection (priority: local > remote > relay)
  findFastestConnection(server: PlexServer): Promise<PlexConnection | null>;
}
```

### Server Selection

```typescript
interface IPlexServerDiscovery {
  // Select a server and find its best connection (persists to localStorage)
  selectServer(serverId: string): Promise<boolean>;
  
  // Get the currently selected server
  getSelectedServer(): PlexServer | null;
  
  // Get the connection for the selected server
  getSelectedConnection(): PlexConnection | null;
  
  // Get the URI for the selected server connection
  getServerUri(): string | null;
}
```

### Connection Fallbacks

Used for mixed-content scenarios (HTTPS page loading HTTP resources).

```typescript
interface IPlexServerDiscovery {
  // Get an HTTPS connection for the selected server, if available
  getHttpsConnection(): PlexConnection | null;
  
  // Get a relay connection for the selected server, if available
  getRelayConnection(): PlexConnection | null;
  
  // Alias for getServerUri()
  getActiveConnectionUri(): string | null;
}
```

### State & Events

```typescript
interface IPlexServerDiscovery {
  // Check if connected to a server
  isConnected(): boolean;
  
  // Event handlers
  on(event: 'serverChange', handler: (server: PlexServer | null) => void): IDisposable;
  on(event: 'connectionChange', handler: (uri: string | null) => void): IDisposable;
}
```

## Stream Resolution (`IPlexStreamResolver`)

Converting metadata into a playable URL.

```typescript
interface IPlexStreamResolver {
  resolveStream(request: StreamRequest): Promise<StreamDecision>;
}

interface StreamDecision {
  playbackUrl: string;
  isDirectPlay: boolean;
  isTranscoding: boolean;
}
```
