# Frequently Asked Questions

## General

### Is Retune free?

Yes, Retune is open-source and free to use under the MIT License[^1].

### Do I need a Plex Pass?

No! Retune works with free Plex accounts. However, some advanced Plex features (like Hardware Transcoding[^2] on the server side) require Plex Pass, which helps performance.

### Can I watch outside my home network?

Yes, as long as your Plex server is configured for "Remote Access"[^3].

## Content & Channels

### Why can't I fast forward?

Retune simulates linear TV. Just like broadcast television, you can't skip ahead of the "live" broadcast time.

> [!NOTE]
> Pause/resume functionality may be added in future updates.

### The channel says "Off Air". Why?

This means there is no content scheduled for the current time. This happens if:

- You used a schedule with gaps.
- The channel filters resulted in zero matching items.

> [!TIP]
> Edit the channel and click **Save** to regenerate the schedule, which often resolves this issue.

### Can I use my friend's server?

Yes. If their server is shared with your Plex account, it will appear in the server list.

## Technical

### Why is the installation so complicated?

LG requires "Developer Mode" for sideloading apps that aren't on the official LG Content Store. We hope to publish to the store in the future!

> [!IMPORTANT]
> Developer Mode sessions expire after 50 hours. Remember to extend your session in the Developer Mode app before it expires.

### Does it support Dolby Vision?

It depends on your TV model. Retune hands the stream directly to the TV's native player. If the file is direct-playable and the TV supports it, yes.

---

## Still have questions?

- 💬 Ask in [GitHub Discussions](https://github.com/TJZine/Retune/discussions)
- 🐛 Report bugs via [Issue Tracker](https://github.com/TJZine/Retune/issues)

---

[^1]: See [LICENSE](LICENSE) for full terms (Apache License 2.0).
[^2]: Hardware Transcoding uses your server's GPU to convert video formats, reducing CPU load and improving performance.
[^3]: Configure Remote Access in Plex Settings → Remote Access. See [Plex documentation](https://support.plex.tv/articles/200289506-remote-access/) for details.
