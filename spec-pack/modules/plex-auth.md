# Module: Plex Authentication

## Metadata

- **ID**: `plex-auth`
- **Path**: `src/modules/plex/auth/`
- **Primary File**: `PlexAuth.ts`
- **Test File**: `PlexAuth.test.ts`
- **Dependencies**: None (foundational module)
- **Complexity**: medium
- **Estimated LoC**: 350

## API Reference

> [!TIP]
> **Official Documentation**: Use Context7 with `/websites/developer_plex_tv_pms` for latest API specs.  
> **Local Examples**: See `spec-pack/artifact-9-plex-api-examples.md` for JSON response samples.

| Endpoint | Purpose |
|----------|---------|
| `POST https://plex.tv/api/v2/pins` | Create PIN for OAuth flow |
| `GET https://plex.tv/api/v2/pins/{id}` | Check if PIN claimed (poll for authToken) |
| `GET https://plex.tv/api/v2/user` | Validate token and get user profile |

> [!IMPORTANT]
> **JWT Authentication (Sept 2025)**: Plex has implemented JWT tokens with 7-day expiry. While the PIN flow remains the same, the returned `authToken` may now be a short-lived JWT. Check official docs if token validation fails unexpectedly—may need to implement token refresh logic.

## Purpose

Handles Plex OAuth authentication using the PIN-based flow optimized for TV interfaces. Manages token storage, validation, and credential lifecycle. This is the foundational module that all Plex API calls depend on for authentication headers.

## Public Interface

```typescript
/**
 * Plex Authentication Interface
 * Handles OAuth flow and token management
 */
export interface IPlexAuth {
  // PIN-based OAuth flow
  requestPin(): Promise<PlexPinRequest>;
  checkPinStatus(pinId: number): Promise<PlexPinRequest>;
  cancelPin(pinId: number): Promise<void>;
  
  // Token management
  validateToken(token: string): Promise<boolean>;
  getStoredCredentials(): Promise<PlexAuthData | null>;
  storeCredentials(auth: PlexAuthData): Promise<void>;
  clearCredentials(): Promise<void>;
  
  // Convenience methods
  isAuthenticated(): boolean;
  getCurrentUser(): PlexAuthToken | null;
  getAuthHeaders(): Record<string, string>;
}
```

## Required Exports

```typescript
// src/modules/plex/auth/index.ts
export { PlexAuth } from './PlexAuth';
export type { IPlexAuth } from './interfaces';
export type {
  PlexAuthConfig,
  PlexPinRequest,
  PlexAuthToken,
  PlexAuthData
} from './types';
```

## Implementation Requirements

### MUST Implement:

1. **PIN Request Flow**
   - Call `https://plex.tv/api/v2/pins` to create a new PIN
   - Return PIN code for user to enter at `plex.tv/link`
   - PIN expires after 5 minutes
   - Accept: `PlexAuthConfig` for client identification headers

2. **PIN Polling**
   - Poll `https://plex.tv/api/v2/pins/{id}` every 1 second
   - Check for `authToken` field population
   - Timeout after 5 minutes if not claimed
   - Handle network errors gracefully during polling

3. **Token Validation**
   - Validate token by calling `https://plex.tv/api/v2/user` endpoint
   - Extract and return user profile information
   - Return `false` for expired/invalid tokens

4. **Credential Storage**
   - Persist `PlexAuthData` to `localStorage`
   - Key: `retune_plex_auth`
   - Include version number for future migrations

5. **Auth Headers Generation**
   - Generate standard Plex headers for all API requests:
     - `X-Plex-Token`
     - `X-Plex-Client-Identifier`
     - `X-Plex-Product`
     - `X-Plex-Version`
     - `X-Plex-Platform`
     - `X-Plex-Device`
     - `Accept: application/json`

### MUST NOT:

1. Store tokens in memory only (must persist)
2. Make requests without proper headers
3. Block UI during network operations (use async/await)
4. Expose token in logs or error messages

### State Management:

```typescript
interface PlexAuthState {
  config: PlexAuthConfig;
  currentToken: PlexAuthToken | null;
  isValidated: boolean;
  pendingPin: PlexPinRequest | null;
}
```

- **Persistence**: `localStorage` with key `retune_plex_auth`
- **Initialization**: Load from storage on instantiation

### Error Handling:

| Error | Code | Recovery |
|-------|------|----------|
| Network failure during PIN request | `NETWORK_ERROR` | Retry with backoff |
| PIN expired | `AUTH_REQUIRED` | Request new PIN |
| Token invalid | `AUTH_INVALID` | Clear and re-authenticate |
| Rate limited | `RATE_LIMITED` | Wait and retry |

## Method Specifications

### `requestPin(): Promise<PlexPinRequest>`

**Purpose**: Initiate Plex OAuth flow by requesting a PIN code.

**Parameters**: None

**Returns**: `PlexPinRequest` containing the 4-character code for user display

**Throws**:

- `PlexApiError` with code `NETWORK_ERROR` on connection failure
- `PlexApiError` with code `RATE_LIMITED` if too many requests

**Side Effects**:

- Stores pending PIN in internal state
- No persistence until PIN is claimed

**Implementation Notes**:

```typescript
// Algorithm:
1. Build request headers from PlexAuthConfig
2. POST to https://plex.tv/api/v2/pins
   - Body: { strong: true, 'X-Plex-Product': ... }
3. Parse response into PlexPinRequest
4. Store in pendingPin state
5. Return to caller for display
```

**Example Usage**:

```typescript
const auth = new PlexAuth(config);
const pin = await auth.requestPin();
console.log(`Go to plex.tv/link and enter: ${pin.code}`);
```

---

### `checkPinStatus(pinId: number): Promise<PlexPinRequest>`

**Purpose**: Check if user has claimed the PIN at plex.tv/link.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| pinId | number | Yes | PIN ID from `requestPin()` |

**Returns**: Updated `PlexPinRequest` with `authToken` if claimed

**Throws**:

- `PlexApiError` with code `RESOURCE_NOT_FOUND` if PIN doesn't exist
- `PlexApiError` with code `NETWORK_ERROR` on connection failure

**Side Effects**:

- If token present, stores credentials via `storeCredentials()`

**Implementation Notes**:

```typescript
// Algorithm:
1. GET https://plex.tv/api/v2/pins/{pinId}
2. Check if authToken field is populated
3. If claimed:
   a. Fetch user details with token
   b. Create PlexAuthData
   c. Call storeCredentials()
4. Return updated PlexPinRequest
```

---

### `validateToken(token: string): Promise<boolean>`

**Purpose**: Verify a token is still valid by calling Plex API.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| token | string | Yes | Plex auth token to validate |

**Returns**: `true` if token is valid, `false` otherwise

**Side Effects**: None

**Implementation Notes**:

```typescript
// Algorithm:
1. GET https://plex.tv/api/v2/user with X-Plex-Token
2. If 200 response, return true
3. If 401/403, return false
4. On network error, throw (don't assume invalid)
```

---

### `getAuthHeaders(): Record<string, string>`

**Purpose**: Generate headers required for all Plex API requests.

**Parameters**: None

**Returns**: Object containing all required Plex headers

**Side Effects**: None

**Example Return**:

```typescript
{
  'X-Plex-Token': 'abc123...',
  'X-Plex-Client-Identifier': 'uuid-here',
  'X-Plex-Product': 'Retune',
  'X-Plex-Version': '1.0.0',
  'X-Plex-Platform': 'webOS',
  'X-Plex-Platform-Version': '4.0',
  'X-Plex-Device': 'LG Smart TV',
  'X-Plex-Device-Name': 'Living Room TV',
  'Accept': 'application/json'
}
```

## Internal Architecture

### Private Methods:

- `_fetchWithRetry(url, options, retries)`: HTTP fetch with exponential backoff
- `_parseUserResponse(data)`: Transform Plex user API response to `PlexAuthToken`
- `_generateClientId()`: Create/persist UUID for client identifier

### Class Diagram:

```text
┌─────────────────────────────────┐
│          PlexAuth               │
├─────────────────────────────────┤
│ - config: PlexAuthConfig        │
│ - state: PlexAuthState          │
│ - eventEmitter: EventEmitter    │
├─────────────────────────────────┤
│ + requestPin(): Promise         │
│ + checkPinStatus(): Promise     │
│ + cancelPin(): Promise          │
│ + validateToken(): Promise      │
│ + getStoredCredentials()        │
│ + storeCredentials(): Promise   │
│ + clearCredentials(): Promise   │
│ + isAuthenticated(): boolean    │
│ + getCurrentUser()              │
│ + getAuthHeaders(): Record      │
│ + on(event, handler): void      │
│ - _fetchWithRetry(): Promise    │
│ - _parseUserResponse()          │
│ - _generateClientId(): string   │
└─────────────────────────────────┘
```

## Events Emitted

| Event Name | Payload Type | When Emitted |
|------------|--------------|--------------|
| `authChange` | `boolean` | When auth state changes (logged in/out) |

## Events Consumed

None (foundational module)

## Test Specification

### Unit Tests Required:

```typescript
describe('PlexAuth', () => {
  describe('requestPin', () => {
    it('should return a PlexPinRequest with 4-character code', async () => {
      // Mock fetch to return valid PIN response
      // Verify code is 4 characters alphanumeric
    });
    
    it('should include client identification headers in request', async () => {
      // Verify all X-Plex-* headers are sent
    });
    
    it('should throw NETWORK_ERROR on connection failure', async () => {
      // Mock fetch to reject
      // Expect PlexApiError with code NETWORK_ERROR
    });
  });
  
  describe('checkPinStatus', () => {
    it('should return updated PIN when not yet claimed', async () => {
      // Mock response with null authToken
    });
    
    it('should store credentials when PIN is claimed', async () => {
      // Mock response with authToken
      // Verify storeCredentials was called
    });
  });
  
  describe('validateToken', () => {
    it('should return true for valid token', async () => {
      // Mock 200 response from /user endpoint
    });
    
    it('should return false for expired/invalid token', async () => {
      // Mock 401 response
    });
  });
  
  describe('getAuthHeaders', () => {
    it('should include all required Plex headers', () => {
      // Verify X-Plex-Token, Client-Identifier, Product, etc.
    });
    
    it('should not include token header when not authenticated', () => {
      // Verify X-Plex-Token is absent
    });
  });
  
  describe('persistence', () => {
    it('should restore credentials from localStorage on init', () => {
      // Pre-populate localStorage
      // Verify getCurrentUser returns stored data
    });
    
    it('should clear localStorage on clearCredentials', async () => {
      // Store credentials, then clear
      // Verify localStorage is empty
    });
  });
});
```

### Mock Requirements:

When testing this module, mock:

- `fetch` global function
- `localStorage.getItem`, `localStorage.setItem`, `localStorage.removeItem`

## File Structure

```text
src/modules/plex/auth/
├── index.ts              # Public exports
├── PlexAuth.ts           # Main class implementation
├── interfaces.ts         # IPlexAuth interface
├── types.ts              # Module-specific types (if any)
├── constants.ts          # API endpoints, storage keys
├── helpers.ts            # UUID generation, header building
└── __tests__/
    ├── PlexAuth.test.ts
    └── helpers.test.ts
```

## Constants

```typescript
// constants.ts
export const PLEX_AUTH_CONSTANTS = {
  PLEX_TV_BASE_URL: 'https://plex.tv/api/v2',
  PIN_ENDPOINT: '/pins',
  USER_ENDPOINT: '/user',
  STORAGE_KEY: 'retune_plex_auth',
  CLIENT_ID_KEY: 'retune_client_id',
  PIN_POLL_INTERVAL_MS: 1000,
  PIN_TIMEOUT_MS: 300000, // 5 minutes
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000,
} as const;
```

## Implementation Checklist

- [ ] Create file structure
- [ ] Implement IPlexAuth interface methods
- [ ] Add localStorage persistence
- [ ] Implement retry logic with exponential backoff
- [ ] Add event emission for auth changes
- [ ] Write unit tests with mocked fetch
- [ ] Add JSDoc comments to all public methods
- [ ] Verify against acceptance criteria

## Acceptance Criteria

This module is COMPLETE when:

1. [ ] User can complete PIN-based OAuth flow on TV
2. [ ] Credentials persist across app restarts
3. [ ] Token validation correctly identifies expired tokens
4. [ ] All API requests include proper Plex headers
5. [ ] Auth state changes emit events for other modules to react
6. [ ] All unit tests pass
7. [ ] No TypeScript compilation errors
