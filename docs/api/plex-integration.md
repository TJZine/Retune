# Plex Integration API

## Interface Contract

The `IPlexAPI` interface is the main entry point for interacting with Plex.

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
