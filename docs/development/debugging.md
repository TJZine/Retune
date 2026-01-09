# Debugging Guide

## Browser Debugging

Standard Chrome DevTools work for browser development (`npm run dev`).

- **Redux/State**: Log state changes to console.
- **Network**: Inspect Plex API calls in the Network tab.

## webOS Remote Debugging

When running on the Emulator or a physical TV, you can use the `ares-inspect` tool to open a Chrome DevTools window connected to the app.

```bash
# For Emulator
ares-inspect --device emulator --app com.retune.app --open

# For Physical TV (device name 'my-tv')
ares-inspect --device my-tv --app com.retune.app --open
```

### Tips for Remote Debugging

- **Console Logs**: `console.log` output appears in the inspector window.
- **DOM Inspection**: You can modify CSS in real-time.
- **Debugger**: The `debugger;` statement works if DevTools is open.

## Common Issues

### CORS Errors

Plex servers may reject requests from localhost. Recommended solutions:

1. **Local Proxy** (Recommended): Configure your dev server to proxy Plex requests:

   ```javascript
   // vite.config.js example
   server: {
     proxy: { '/plex': { target: 'https://your-plex-server:32400', changeOrigin: true } }
   }
   ```

2. **Reverse Proxy**: Use nginx or Caddy locally to forward `/api` to your Plex server.

3. **Browser Extension** (Last Resort):
   > [!CAUTION]
   > CORS-disabling extensions create security risks. Only use in an isolated browser profile dedicated to development. Never on your primary browser.

### Memory Leaks

Use the **Memory** tab in DevTools to take heap snapshots before and after repeated actions (e.g. channel surfing).
