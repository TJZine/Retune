# Troubleshooting

Common issues and how to fix them.

## Installation Issues

### "Developer Mode" expires

> [!WARNING]
> LG Developer Mode sessions are limited to **50 hours**.

**Issue**: The app stops working after a few days.

**Fix**: Open the **Developer Mode** app on your TV and click **"Extend Session"**. You do not need to reinstall Retune.

### "Connection Refused" when installing

**Issue**: `ares-install` fails with connection error.
**Fix**:

1. Ensure TV and PC are on the same Wi-Fi.
2. Check if the IP address in Developer Mode app has changed.
3. Turn "Key Server" OFF and ON again in Developer Mode app.

## Playback Issues

### Video buffers constantly

> [!TIP]
> 4K content requires high bandwidth. Try wired Ethernet for best results.

- **Network**: Check your Wi-Fi signal strength.
- **Server**: Your Plex server might be struggling to transcode. Retune tries to Direct Play, but sometimes transcoding is unavoidable (e.g., unsupported subtitles).

### "Playback Failed" error

- **File Moved**: Use "Scan Library Files" in Plex to ensure the file still exists.
- **Format**: The specific video codec might not be supported by webOS.

### Audio is out of sync

- Try pausing and resuming playback.
- If persistent, check if "Direct Play" is active in Plex Dashboard. Transcoding sometimes introduces sync issues.

### Dolby Vision MKV shows dark letterbox bars

- Enable **Smart HDR10 Fallback** (Settings → HDR / Dolby Vision) to switch DV MKV to HDR10 for cinematic aspect ratios.
- The setting only affects MKV; MP4/TS Dolby Vision behavior is unchanged.
- If the issue persists, enable **Force HDR10 Fallback** to apply HDR10 whenever the base layer is available.

## EPG & Channel Issues

### Guide data is empty

- Wait a moment; schedule generation happens in the background.
- If persistent, go to specific Channel settings and click **Save** to regenerate the schedule.

### Wrong poster art

- Retune caches images for performance. If you changed art in Plex, it might take a while to update in Retune.

## Still stuck?

> [!NOTE]
> When opening an issue, include your TV model, webOS version, and steps to reproduce.

Please [open an issue](https://github.com/TJZine/Retune/issues) on GitHub.
