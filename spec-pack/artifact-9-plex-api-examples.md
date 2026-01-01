# Plex API Response Examples

> **Reference**: [Plex Media Server API Documentation](https://developer.plex.tv/pms)  
> **Base URL**: `http://{server-ip}:32400`  
> **Required Headers**: `Accept: application/json`, `X-Plex-Token: {token}`

This document provides JSON response examples for Plex API endpoints used by Retune.

---

## 1. Authentication

### 1.1 PIN Request (OAuth Flow)

**Endpoint**: `POST https://plex.tv/api/v2/pins`

**Request Headers**:

```http
X-Plex-Client-Identifier: retune-unique-client-id
X-Plex-Product: Retune
X-Plex-Version: 1.0.0
X-Plex-Platform: webOS
Accept: application/json
```

**Response**:

```json
{
  "id": 1234567890,
  "code": "ABCD",
  "product": "Retune",
  "trusted": false,
  "qr": "https://plex.tv/api/v2/pins/link?code=ABCD",
  "clientIdentifier": "retune-unique-client-id",
  "location": { "code": "US", "country": "United States" },
  "expiresIn": 900,
  "createdAt": "2024-01-15T12:00:00Z",
  "expiresAt": "2024-01-15T12:15:00Z",
  "authToken": null,
  "newRegistration": null
}
```

> **Note**: User visits `plex.tv/link` and enters the `code`. Poll `GET /pins/{id}` until `authToken` is populated.

### 1.2 PIN Status Check

**Endpoint**: `GET https://plex.tv/api/v2/pins/{id}`

**Response (Claimed)**:

```json
{
  "id": 1234567890,
  "code": "ABCD",
  "authToken": "xYzAbCdEfG123456",
  "expiresAt": "2024-01-15T12:15:00Z"
}
```

---

## 2. Server Discovery

### 2.1 Get Available Resources (Servers)

**Endpoint**: `GET https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1`

**Response**:

```json
[
  {
    "name": "Home Server",
    "product": "Plex Media Server",
    "productVersion": "1.32.5.7349",
    "platform": "Linux",
    "platformVersion": "22.04",
    "device": "PC",
    "clientIdentifier": "abc123def456ghi789",
    "createdAt": "2023-06-15T10:30:00Z",
    "lastSeenAt": "2024-01-15T14:00:00Z",
    "provides": "server",
    "ownerId": 12345678,
    "sourceTitle": "myplexuser",
    "publicAddress": "203.0.113.42",
    "accessToken": "serverSpecificToken123",
    "owned": true,
    "home": false,
    "synced": false,
    "relay": false,
    "presence": true,
    "httpsRequired": false,
    "publicAddressMatches": true,
    "dnsRebindingProtection": false,
    "connections": [
      {
        "protocol": "http",
        "address": "192.168.1.100",
        "port": 32400,
        "uri": "http://192.168.1.100:32400",
        "local": true,
        "relay": false,
        "IPv6": false
      },
      {
        "protocol": "https",
        "address": "abc123def456.plex.direct",
        "port": 32400,
        "uri": "https://abc123def456.plex.direct:32400",
        "local": false,
        "relay": false,
        "IPv6": false
      },
      {
        "protocol": "https",
        "address": "relay.plex.tv",
        "port": 443,
        "uri": "https://relay.plex.tv:443",
        "local": false,
        "relay": true,
        "IPv6": false
      }
    ]
  }
]
```

### 2.2 Server Identity Check

**Endpoint**: `GET /identity`

**Response**:

```json
{
  "MediaContainer": {
    "size": 0,
    "machineIdentifier": "abc123def456ghi789",
    "version": "1.32.5.7349"
  }
}
```

---

## 3. Library Access

### 3.1 List All Library Sections

**Endpoint**: `GET /library/sections`

**Response**:

```json
{
  "MediaContainer": {
    "size": 3,
    "allowSync": true,
    "Directory": [
      {
        "key": "1",
        "type": "movie",
        "title": "Movies",
        "agent": "tv.plex.agents.movie",
        "scanner": "Plex Movie",
        "language": "en-US",
        "uuid": "abc123-def456-ghi789",
        "updatedAt": 1705320000,
        "createdAt": 1672531200,
        "scannedAt": 1705320000,
        "art": "/:/resources/movie-fanart.jpg",
        "thumb": "/:/resources/movie.png",
        "Location": [
          { "id": 1, "path": "/media/movies" }
        ]
      },
      {
        "key": "2",
        "type": "show",
        "title": "TV Shows",
        "agent": "tv.plex.agents.series",
        "scanner": "Plex TV Series",
        "language": "en-US",
        "uuid": "jkl012-mno345-pqr678",
        "updatedAt": 1705320000,
        "createdAt": 1672531200
      },
      {
        "key": "3",
        "type": "artist",
        "title": "Music",
        "agent": "tv.plex.agents.music",
        "scanner": "Plex Music",
        "language": "en-US",
        "uuid": "stu901-vwx234-yza567"
      }
    ]
  }
}
```

### 3.2 Get Library Contents (Movies)

**Endpoint**: `GET /library/sections/{sectionId}/all`

**Response** (paginated - first 100 items):

```json
{
  "MediaContainer": {
    "size": 100,
    "totalSize": 523,
    "offset": 0,
    "allowSync": true,
    "art": "/:/resources/movie-fanart.jpg",
    "librarySectionID": 1,
    "librarySectionTitle": "Movies",
    "librarySectionUUID": "abc123-def456-ghi789",
    "Metadata": [
      {
        "ratingKey": "12345",
        "key": "/library/metadata/12345",
        "guid": "plex://movie/5d776828880197001ec9038f",
        "studio": "Warner Bros.",
        "type": "movie",
        "title": "The Matrix",
        "originalTitle": "The Matrix",
        "contentRating": "R",
        "summary": "A computer hacker learns about the true nature of reality...",
        "rating": 8.7,
        "audienceRating": 9.0,
        "year": 1999,
        "tagline": "Free your mind",
        "thumb": "/library/metadata/12345/thumb/1705320000",
        "art": "/library/metadata/12345/art/1705320000",
        "duration": 8160000,
        "originallyAvailableAt": "1999-03-31",
        "addedAt": 1705200000,
        "updatedAt": 1705320000,
        "Media": [
          {
            "id": 67890,
            "duration": 8160000,
            "bitrate": 10500,
            "width": 1920,
            "height": 800,
            "aspectRatio": 2.35,
            "audioChannels": 6,
            "audioCodec": "dts",
            "videoCodec": "h264",
            "videoResolution": "1080",
            "container": "mkv",
            "videoFrameRate": "24p",
            "videoProfile": "high",
            "Part": [
              {
                "id": 11111,
                "key": "/library/parts/11111/file.mkv",
                "duration": 8160000,
                "file": "/media/movies/The Matrix (1999)/The.Matrix.1999.1080p.BluRay.mkv",
                "size": 10737418240,
                "container": "mkv",
                "Stream": [
                  {
                    "id": 22222,
                    "streamType": 1,
                    "codec": "h264",
                    "index": 0,
                    "bitrate": 9500,
                    "height": 800,
                    "width": 1920,
                    "displayTitle": "1080p (H.264)"
                  },
                  {
                    "id": 33333,
                    "streamType": 2,
                    "selected": true,
                    "codec": "dts",
                    "index": 1,
                    "channels": 6,
                    "bitrate": 1500,
                    "language": "English",
                    "languageCode": "eng",
                    "displayTitle": "English (DTS 5.1)"
                  },
                  {
                    "id": 44444,
                    "streamType": 3,
                    "codec": "srt",
                    "index": 2,
                    "language": "English",
                    "languageCode": "eng",
                    "displayTitle": "English (SRT)"
                  }
                ]
              }
            ]
          }
        ],
        "Genre": [
          { "tag": "Action" },
          { "tag": "Science Fiction" }
        ],
        "Director": [
          { "tag": "Lana Wachowski" },
          { "tag": "Lilly Wachowski" }
        ],
        "Role": [
          { "tag": "Keanu Reeves", "role": "Neo" },
          { "tag": "Laurence Fishburne", "role": "Morpheus" }
        ]
      }
    ]
  }
}
```

### 3.3 Get TV Show Seasons

**Endpoint**: `GET /library/metadata/{showRatingKey}/children`

**Response**:

```json
{
  "MediaContainer": {
    "size": 5,
    "parentTitle": "Breaking Bad",
    "parentYear": 2008,
    "Metadata": [
      {
        "ratingKey": "54321",
        "key": "/library/metadata/54321/children",
        "parentRatingKey": "50000",
        "type": "season",
        "title": "Season 1",
        "parentTitle": "Breaking Bad",
        "index": 1,
        "thumb": "/library/metadata/54321/thumb/1705320000",
        "leafCount": 7,
        "viewedLeafCount": 7
      },
      {
        "ratingKey": "54322",
        "key": "/library/metadata/54322/children",
        "parentRatingKey": "50000",
        "type": "season",
        "title": "Season 2",
        "parentTitle": "Breaking Bad",
        "index": 2,
        "leafCount": 13,
        "viewedLeafCount": 5
      }
    ]
  }
}
```

### 3.4 Get Season Episodes

**Endpoint**: `GET /library/metadata/{seasonRatingKey}/children`

**Response**:

```json
{
  "MediaContainer": {
    "size": 7,
    "grandparentTitle": "Breaking Bad",
    "parentTitle": "Season 1",
    "parentIndex": 1,
    "Metadata": [
      {
        "ratingKey": "60001",
        "key": "/library/metadata/60001",
        "parentRatingKey": "54321",
        "grandparentRatingKey": "50000",
        "type": "episode",
        "title": "Pilot",
        "grandparentTitle": "Breaking Bad",
        "parentTitle": "Season 1",
        "index": 1,
        "parentIndex": 1,
        "summary": "A high school chemistry teacher learns he has terminal lung cancer...",
        "thumb": "/library/metadata/60001/thumb/1705320000",
        "duration": 3480000,
        "originallyAvailableAt": "2008-01-20",
        "addedAt": 1705200000,
        "viewOffset": 1200000,
        "Media": [
          {
            "duration": 3480000,
            "bitrate": 8500,
            "width": 1920,
            "height": 1080,
            "videoCodec": "h264",
            "audioCodec": "aac",
            "container": "mp4",
            "Part": [
              {
                "key": "/library/parts/70001/file.mp4",
                "duration": 3480000,
                "file": "/media/tv/Breaking Bad/Season 01/s01e01.mp4"
              }
            ]
          }
        ]
      }
    ]
  }
}
```

---

## 4. Collections & Playlists

### 4.1 Get Library Collections

**Endpoint**: `GET /library/sections/{sectionId}/collections`

**Response**:

```json
{
  "MediaContainer": {
    "size": 5,
    "Metadata": [
      {
        "ratingKey": "80001",
        "key": "/library/collections/80001/children",
        "type": "collection",
        "title": "Marvel Cinematic Universe",
        "subtype": "movie",
        "summary": "All MCU films in chronological order",
        "thumb": "/library/collections/80001/thumb/1705320000",
        "childCount": 32,
        "addedAt": 1705200000,
        "updatedAt": 1705320000
      }
    ]
  }
}
```

### 4.2 Get Playlists

**Endpoint**: `GET /playlists`

**Response**:

```json
{
  "MediaContainer": {
    "size": 2,
    "Metadata": [
      {
        "ratingKey": "90001",
        "key": "/playlists/90001/items",
        "type": "playlist",
        "title": "Weekend Marathon",
        "playlistType": "video",
        "summary": "Movies to binge",
        "smart": false,
        "leafCount": 8,
        "duration": 43200000,
        "addedAt": 1705200000,
        "updatedAt": 1705320000
      }
    ]
  }
}
```

---

## 5. Search

### 5.1 Global Search

**Endpoint**: `GET /hubs/search?query={term}`

**Response**:

```json
{
  "MediaContainer": {
    "size": 3,
    "Hub": [
      {
        "type": "movie",
        "hubIdentifier": "movie",
        "title": "Movies",
        "size": 2,
        "Metadata": [
          {
            "ratingKey": "12345",
            "type": "movie",
            "title": "The Matrix",
            "year": 1999,
            "thumb": "/library/metadata/12345/thumb/1705320000"
          }
        ]
      },
      {
        "type": "show",
        "hubIdentifier": "show",
        "title": "TV Shows",
        "size": 1,
        "Metadata": [
          {
            "ratingKey": "50000",
            "type": "show",
            "title": "Breaking Bad",
            "year": 2008
          }
        ]
      }
    ]
  }
}
```

---

## 6. Stream Resolution & Playback

### 6.1 Get Item Details (for direct play check)

**Endpoint**: `GET /library/metadata/{ratingKey}`

**Response** (includes Media/Part/Stream details):

```json
{
  "MediaContainer": {
    "size": 1,
    "Metadata": [
      {
        "ratingKey": "12345",
        "title": "The Matrix",
        "type": "movie",
        "duration": 8160000,
        "Media": [
          {
            "id": 67890,
            "container": "mp4",
            "videoCodec": "h264",
            "audioCodec": "aac",
            "videoResolution": "1080",
            "width": 1920,
            "height": 800,
            "bitrate": 8000,
            "Part": [
              {
                "id": 11111,
                "key": "/library/parts/11111/file.mp4",
                "duration": 8160000,
                "size": 8589934592,
                "Stream": []
              }
            ]
          }
        ]
      }
    ]
  }
}
```

### 6.2 Transcode URL Format

**Direct Play**: `{serverUri}/library/parts/{partId}/file.{ext}?X-Plex-Token={token}`

**HLS Transcode**:

```url
{serverUri}/video/:/transcode/universal/start.m3u8
  ?path=/library/metadata/{ratingKey}
  &mediaIndex=0
  &partIndex=0
  &protocol=hls
  &fastSeek=1
  &directPlay=0
  &directStream=1
  &subtitleSize=100
  &audioBoost=100
  &maxVideoBitrate=8000
  &X-Plex-Token={token}
  &X-Plex-Client-Identifier={clientId}
  &X-Plex-Platform=webOS
```

### 6.3 Timeline Update (Progress Reporting)

**Endpoint**: `POST /:/timeline?{params}`

**Query Parameters**:

| Parameter | Value |
|-----------|-------|
| `ratingKey` | `12345` |
| `key` | `/library/metadata/12345` |
| `state` | `playing` / `paused` / `stopped` |
| `time` | `3600000` (ms) |
| `duration` | `8160000` (ms) |
| `X-Plex-Token` | `{token}` |

---

## Response Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created (PIN request) |
| 400 | Bad request |
| 401 | Unauthorized (invalid/missing token) |
| 404 | Resource not found |
| 429 | Rate limited |
| 500 | Server error |

## Pagination

Large responses include pagination metadata:

```json
{
  "MediaContainer": {
    "size": 100,
    "totalSize": 523,
    "offset": 0,
    ...
  }
}
```

Use query parameters to paginate:

- `X-Plex-Container-Start`: Starting offset (0-indexed)
- `X-Plex-Container-Size`: Number of items per page (default: 100)

---

## Parsing Utilities (SUGGEST-002)

> **Common Pitfalls**: Plex API responses have inconsistent field presence. Use these helpers.

### Safe Field Access

```typescript
/**
 * Safely extract media items from response, handling empty/missing arrays.
 */
function extractMetadata(response: PlexResponse): PlexMetadataItem[] {
  const container = response.MediaContainer;
  if (!container) return [];
  
  // Metadata can be undefined, null, or missing entirely
  const metadata = container.Metadata;
  if (!metadata) return [];
  if (!Array.isArray(metadata)) return [metadata]; // Single item case
  
  return metadata;
}

/**
 * Parse duration - Plex returns ms, but sometimes seconds.
 */
function parseDuration(value: number | undefined, assumeMs: boolean = true): number {
  if (value === undefined || value === null) return 0;
  // Heuristic: if value > 1000000000, assume it's ms already
  // If value < 100000, likely seconds
  if (!assumeMs && value < 100000) {
    return value * 1000;
  }
  return value;
}

/**
 * Build image URL with token injection.
 */
function buildImageUrl(
  serverUri: string,
  imagePath: string | null | undefined,
  token: string,
  width?: number,
  height?: number
): string | null {
  if (!imagePath) return null;
  
  const params = new URLSearchParams({
    'X-Plex-Token': token,
  });
  if (width) params.append('width', width.toString());
  if (height) params.append('height', height.toString());
  
  // Handle absolute vs relative paths
  const path = imagePath.startsWith('/') ? imagePath : '/' + imagePath;
  return `${serverUri}${path}?${params}`;
}
```

### Type Guards

```typescript
function isMovieItem(item: PlexMetadataItem): item is PlexMovieItem {
  return item.type === 'movie';
}

function isEpisodeItem(item: PlexMetadataItem): item is PlexEpisodeItem {
  return item.type === 'episode';
}

function hasMedia(item: PlexMetadataItem): boolean {
  return Array.isArray(item.Media) && item.Media.length > 0;
}
```

### Error Response Detection

```typescript
interface PlexErrorResponse {
  MediaContainer?: {
    identifier?: string;
  };
  errors?: Array<{ code: number; message: string }>;
}

function isErrorResponse(response: unknown): response is PlexErrorResponse {
  if (typeof response !== 'object' || response === null) return false;
  return 'errors' in response || 
    (response as PlexErrorResponse).MediaContainer?.identifier === 'com.plexapp.system';
}
```
