# Retune - Development Workflow & Testing Guide

> [!TIP]
> This document contains everything you need to develop, test, and debug the Retune webOS application across all environments.

---

## Table of Contents

1. [Prerequisites & Setup](#prerequisites--setup)
2. [Development Workflow Overview](#development-workflow-overview)
3. [Phase 1: Browser Development](#phase-1-browser-development)
4. [Phase 2: webOS Emulator Testing](#phase-2-webos-emulator-testing)
5. [Phase 3: Physical TV Testing](#phase-3-physical-tv-testing)
6. [Debugging Techniques](#debugging-techniques)
7. [Build & Package](#build--package)
8. [Common Issues & Troubleshooting](#common-issues--troubleshooting)
9. [Performance Testing](#performance-testing)
10. [Quick Reference Commands](#quick-reference-commands)

---

## Prerequisites & Setup

### Required Software

| Software | Purpose | Download |
| ---------- | --------- | ---------- |
| Node.js 18+ | JavaScript runtime | <https://nodejs.org> |
| webOS TV SDK | Emulator, CLI tools | <https://webostv.developer.lge.com/develop/tools/sdk-introduction> |
| VirtualBox 6.x | Runs webOS emulator | <https://www.virtualbox.org> |
| VS Code | Code editor | <https://code.visualstudio.com> |

### Minimum Supported Platform

- **Minimum Supported**: webOS 6.0 (2021+ LG B1/C1)
- **Browser Engine**: Chromium 87
- **Language Target**: ES2018 (avoid ES2020-only syntax like `?.` and `??`)

### webOS TV SDK Installation

1. **Download the SDK** from LG Developer Portal
2. **Install VirtualBox** first (required for emulator)
3. **Run the SDK installer** - select all components:
   - CLI Tools (ares-*)
   - Emulator
   - Resource Monitor
4. **Verify installation**:

   ```bash
   ares --version
   # Should output: Version X.X.X
   ```

### Project Setup

```bash
# Clone/navigate to project
cd /path/to/Retune

# Install dependencies
npm install

# Verify TypeScript compiles
npm run build

# Start development server
npm run dev
```

---

## Development Workflow Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RECOMMENDED WORKFLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│   │   BROWSER    │ ──▶ │   EMULATOR   │ ──▶ │  PHYSICAL TV │                │
│   │  Development │     │   Validation │     │    Release   │                │
│   └──────────────┘     └──────────────┘     └──────────────┘                │
│         │                    │                    │                          │
│   • Hot reload         • D-pad nav          • Real remote                   │
│   • 90% of work        • Video playback     • Actual perf                   │
│   • Fastest iteration  • webOS APIs         • Final sign-off                │
│                                                                              │
│   TIME SPENT: 80%           15%                  5%                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Browser Development

This is where you'll spend **most of your time**. Fast hot-reload, full DevTools access.

### Starting the Dev Server

```bash
npm run dev
```

Opens at: `http://localhost:5173`

### Keyboard Controls (Simulating Remote)

| Keyboard Key | Remote Equivalent |
| ------------ | ----------------- |
| Arrow Keys | D-pad (Up/Down/Left/Right) |
| Enter | OK button |
| Backspace | Back button |
| G | Guide button (open EPG) |
| I | Info button |
| Space | Play/Pause |
| Escape | Back button (alternative) |

### Browser DevTools Tips

**Console Filtering:**

```javascript
// Add these to filter logs by module
console.log('[PlexAuth]', message);
console.log('[Scheduler]', message);
console.log('[Player]', message);
```

**Network Tab:**

- Filter by `plex.tv` to see auth calls
- Filter by your server IP to see media calls
- Check for CORS errors (see troubleshooting)

**Performance Tab:**

- Record while navigating EPG
- Check for long tasks (>50ms)
- Monitor memory usage

### Mock webOS APIs

Since webOS APIs don't exist in the browser, add mocks:

```typescript
// src/utils/webos-mock.ts
if (typeof window !== 'undefined' && !window.webOS) {
  window.webOS = {
    platformBack: () => {
      console.log('[Mock] platformBack called');
      // Simulate back navigation
    },
    deviceInfo: (callback) => {
      callback({
        modelName: 'MOCK_TV',
        version: '6.0.0',
        sdkVersion: '6.0.0'
      });
    },
    keyboard: {
      isShowing: () => false
    }
  };
}
```

### What to Test in Browser

| Feature | Browser Testing | Notes |
| ------- | ----------------- | ----- |
| UI Layout | ✅ Full | Use Chrome device toolbar for 1920x1080 |
| Navigation focus | ✅ Full | Arrow keys work |
| Plex API calls | ✅ Full | May need CORS proxy for some endpoints |
| Video playback | ⚠️ Partial | Browser-only dev may use HLS.js; production webOS build MUST use native HLS (see `spec-pack/decisions/0002-no-hls-js.md`) |
| App lifecycle | ❌ Mock only | Need emulator for real testing |
| Remote key codes | ⚠️ Mapped | Keyboard mapped to remote buttons |

### CORS Issues in Browser

If you get CORS errors when calling Plex:

**Option 1: Browser Extension**
Install "CORS Unblock" or similar extension (dev only!)

#### Option 2: Proxy in Vite Config

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/plex': {
        target: 'https://plex.tv',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/plex/, '')
      }
    }
  }
});
```

---

## Phase 2: webOS Emulator Testing

The emulator runs the **actual webOS environment** in a VM.

### Starting the Emulator

**GUI Method:**

1. Open webOS TV Emulator from Start Menu
2. Select webOS version (minimum 6.0; use latest available for validation)
3. Wait for boot (~30-60 seconds)

**CLI Method:**

```bash
# List available emulators
ares-emulator --list

# Start specific version
ares-emulator --open webos6
```

### Deploying to Emulator

```bash
# 1. Build for production
npm run build

# 2. Package as IPK
ares-package dist/

# 3. Install to emulator
ares-install --device emulator com.retune.app_1.0.0_all.ipk

# 4. Launch app
ares-launch --device emulator com.retune.app
```

### Debugging on Emulator

```bash
# Open Chrome DevTools connected to emulator
ares-inspect --device emulator --app com.retune.app --open
```

This opens a Chrome window with DevTools - you get:

- Console logs
- Network requests
- DOM inspection
- Performance profiler

### Emulator Key Mapping

The emulator shows an on-screen remote. You can also use keyboard:

| Key | Remote Button |
| --- | ------------- |
| Enter | OK |
| Backspace | Back |
| Arrow keys | D-pad |
| F1-F4 | Color buttons (Red/Green/Yellow/Blue) |

### What to Test in Emulator

| Feature | Why Test Here |
| ------- | ------------- |
| D-pad navigation | Real webOS focus system |
| Video playback | Native HLS support (no HLS.js) |
| App background/resume | Visibility API works |
| Memory limits | Emulator has similar constraints |
| Keep-alive | Test suspension prevention |

### Emulator Troubleshooting

**Emulator won't start:**

```text
Error: VT-x is not available
```

→ Enable virtualization in BIOS (Intel VT-x or AMD-V)

**Emulator is very slow:**
→ Allocate more RAM in VirtualBox settings (recommend 4GB)
→ Enable 3D acceleration in VM settings

**App won't install:**

```text
Error: FAILED_IPKG_INSTALL
```

→ Check package name in `appinfo.json`
→ Ensure no duplicate installation: `ares-install --device emulator --remove com.retune.app`

**Black screen after launch:**
→ Check console for JavaScript errors: `ares-inspect --device emulator --app com.retune.app`

---

## Phase 3: Physical TV Testing

Final testing on actual hardware.

### Enable Developer Mode on TV

1. **Install Developer Mode App**
   - On TV: LG Content Store → Search "Developer Mode"
   - Install and open the app

2. **Create LG Developer Account** (if needed)
   - <https://webostv.developer.lge.com>

3. **Enable Developer Mode**
   - Open Developer Mode app on TV
   - Log in with LG account
   - Toggle "Dev Mode Status" ON
   - Note the passphrase shown

4. **Register TV in SDK**

   ```bash
   # Add your TV
   ares-setup-device
   
   # Follow prompts:
   # - Name: my-tv
   # - IP: [your TV's IP address]
   # - Port: 9922
   # - SSH Key: Use default
   ```

5. **Test Connection**

   ```bash
   ares-device-info --device my-tv
   ```

### Deploying to Physical TV

```bash
# Package and install
npm run build
ares-package dist/
ares-install --device my-tv com.retune.app_1.0.0_all.ipk
ares-launch --device my-tv com.retune.app
```

### Remote Debugging on TV

```bash
ares-inspect --device my-tv --app com.retune.app --open
```

This works the same as emulator debugging - Chrome DevTools connected to the TV!

### Physical TV Troubleshooting

**Can't connect to TV:**

```text
Error: Connection refused
```

→ Ensure TV and PC are on same network
→ Check TV's IP address: Settings → Network → Wi-Fi Connection → Advanced
→ Restart Developer Mode app on TV
→ Try pinging the TV: `ping [TV_IP]`

**Developer Mode expires:**
Dev mode only lasts 50 hours. Re-enable in Developer Mode app.

**App crashes on TV but works in emulator:**
→ Check for memory issues (TV has stricter limits)
→ Reduce image sizes
→ Check for webOS version differences

---

## Debugging Techniques

### Console Logging Strategy

```typescript
// Create a logger utility
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const CURRENT_LEVEL = LOG_LEVELS.DEBUG; // Change for production

function log(level: number, module: string, message: string, data?: any) {
  if (level >= CURRENT_LEVEL) {
    const prefix = `[${new Date().toISOString()}][${module}]`;
    if (data) {
      console.log(prefix, message, data);
    } else {
      console.log(prefix, message);
    }
  }
}

// Usage
log(LOG_LEVELS.INFO, 'PlexAuth', 'Token validated successfully');
log(LOG_LEVELS.ERROR, 'Player', 'Playback failed', error);
```

### State Inspection

Add a debug overlay (enable with secret key combo):

```typescript
// Ctrl+Shift+D to toggle debug overlay
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'D') {
    toggleDebugOverlay();
  }
});

function toggleDebugOverlay() {
  const overlay = document.getElementById('debug-overlay');
  if (overlay) {
    overlay.style.display = overlay.style.display === 'none' ? 'block' : 'none';
  }
}
```

### Network Request Logging

```typescript
// Intercept fetch to log all requests
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const [url, options] = args;
  const method = options && (options as RequestInit).method ? (options as RequestInit).method : 'GET';
  console.log('[Network]', method, url);
  
  try {
    const response = await originalFetch(...args);
    console.log('[Network]', response.status, url);
    return response;
  } catch (error) {
    console.error('[Network] FAILED', url, error);
    throw error;
  }
};
```

---

## Build & Package

### Development Build

```bash
npm run dev
# Hot reload at localhost:5173
```

### Production Build

```bash
npm run build
# Outputs to dist/
```

### Package for webOS

```bash
# Creates .ipk file
ares-package dist/

# Output: com.retune.app_1.0.0_all.ipk
```

### Package with Debug Info

```bash
# For debugging, don't minify
npm run build -- --minify false
ares-package dist/
```

---

## Common Issues & Troubleshooting

### Build Errors

| Error | Cause | Solution |
| ------- | ------- | ---------- |
| `Cannot find module 'X'` | Missing dependency | `npm install` |
| `TypeScript errors` | Type mismatch | Fix type errors before build |
| `Out of memory` | Large build | Increase Node memory: `NODE_OPTIONS=--max-old-space-size=4096 npm run build` |

### Runtime Errors

| Error | Cause | Solution |
| ------- | ------- | ---------- |
| `Uncaught TypeError` | Null reference | Add null checks, use optional chaining |
| `CORS error` | Browser security | Use proxy or test in emulator |
| `Video won't play` | Codec issue | Check if format is HLS (m3u8) |
| `Black screen` | JS error on init | Check console for errors |

### webOS-Specific Issues

| Issue | Cause | Solution |
| ------- | ------- | ---------- |
| App suspended after 15min | webOS power saving | Implement keep-alive (see video-player.md) |
| Focus lost | Focus ring bug | Use explicit focus management |
| Slow scrolling | Too many DOM elements | Implement virtualization |
| Out of memory | Memory leak or large assets | Profile memory, reduce image sizes |

### Video Playback Issues

| Issue | Cause | Solution |
| ------- | ------- | ---------- |
| No audio | Audio track selection | Check audio track index |
| Buffering | Slow network | Check bitrate, consider transcoding |
| Won't start | Wrong URL or auth | Check stream URL has token |
| Subtitles missing | VTT not loaded | Check subtitle track setup |

### Plex API Issues

| Issue | Cause | Solution |
| ------- | ------- | ---------- |
| 401 Unauthorized | Token expired | Re-authenticate |
| 403 Forbidden | Wrong server/permissions | Check server access |
| Empty response | Wrong endpoint | Verify API path |
| Slow responses | Large library | Use pagination |

---

## Performance Testing

### Memory Profiling

In Chrome DevTools:

1. Memory tab → Take heap snapshot
2. Perform actions (switch channels, navigate EPG)
3. Take another snapshot
4. Compare for memory growth

**webOS Memory Limits (Legacy Context + Current Baseline):**

| TV Model | Approximate Limit |
| -------- | ----------------- |
| 2021+ (webOS 6.0+) | ~300MB |
| 2019-2020 (webOS 4.5-5.0) | ~300MB (legacy context) |
| 2017-2018 (webOS 3.5-4.0) | ~200MB (legacy context) |
| Older | ~150MB (legacy context) |

### Render Performance

In Chrome DevTools:

1. Performance tab → Record
2. Navigate through EPG
3. Stop recording
4. Check for:
   - Long tasks (>50ms blocks)
   - Layout shifts
   - Excessive repaints

**Target Metrics:**

| Metric | Target | Max Allowed |
| ------ | ------ | ----------- |
| Initial load | <2s | 5s |
| Channel switch | <500ms | 1s |
| EPG scroll | 60fps | 30fps |
| Memory growth | 0 | <5MB/hour |

---

## Quick Reference Commands

### Development

```bash
# Start dev server
npm run dev

# Type check
npm run typecheck

# Lint
npm run lint

# Build for production
npm run build
```

### Emulator

```bash
# Start emulator
ares-emulator --open webos6

# Package app
ares-package dist/

# Install to emulator
ares-install --device emulator com.retune.app_1.0.0_all.ipk

# Launch app
ares-launch --device emulator com.retune.app

# Debug app
ares-inspect --device emulator --app com.retune.app --open

# View logs
ares-log --device emulator --app com.retune.app

# Remove app
ares-install --device emulator --remove com.retune.app
```

### Physical TV

```bash
# Setup device (one time)
ares-setup-device

# Check connection
ares-device-info --device my-tv

# Install to TV
ares-install --device my-tv com.retune.app_1.0.0_all.ipk

# Launch on TV
ares-launch --device my-tv com.retune.app

# Debug on TV
ares-inspect --device my-tv --app com.retune.app --open

# Remove from TV
ares-install --device my-tv --remove com.retune.app
```

### Useful Shortcuts

```bash
# One-liner: build, package, install, launch on emulator
npm run build && ares-package dist/ && ares-install --device emulator *.ipk && ares-launch --device emulator com.retune.app

# Watch and rebuild on changes (needs concurrently)
npm run dev & ares-inspect --device emulator --app com.retune.app --open
```

---

## Appendix: appinfo.json Template

```json
{
  "id": "com.retune.app",
  "version": "1.0.0",
  "vendor": "Retune",
  "type": "web",
  "main": "index.html",
  "title": "Retune",
  "icon": "icon.png",
  "largeIcon": "largeIcon.png",
  "bgImage": "bgImage.png",
  "resolution": "1920x1080",
  "disableBackHistoryAPI": true,
  "handlesRelaunch": true
}
```

---

## Appendix: Useful Links

- [webOS TV Developer Portal](https://webostv.developer.lge.com)
- [webOS TV API Reference](https://webostv.developer.lge.com/develop/app-developer-guide/web-app-overview)
- [webOS TV SDK Download](https://webostv.developer.lge.com/develop/tools/sdk-introduction)
- [Plex API Documentation](https://github.com/Arcanemagus/plex-api/wiki)
