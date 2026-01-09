# Channel Management

Channels are the core of Retune. Each channel represents a curated stream of content from your Plex library.

## Creating a Channel

1. Navigate to **Settings** -> **Channels**.
2. Select **"New Channel"**.
3. Configure the following options:

### Basic Settings

- **Number**: The channel number (e.g. 101). Must be unique.
- **Name**: Display name in the EPG (e.g. "Action Movies").
- **Icon**: Choose a visual identifier for the channel.

### Content Source

Choose where the channel gets its videos:

| Source Type | Description |
|-------------|-------------|
| **Library** | Uses an entire Plex Library (e.g. "Movies"). You can filter by genre, year, etc. |
| **Collection** | Uses a specific Plex Collection. Great for curated lists like "Marvel Universe". |
| **Show** | Plays a specific TV Show. Great for 24/7 marathon channels (e.g., "The Office"). |
| **Playlist** | Uses a Plex Playlist. |

### Playback Mode

Determines the order of content:

- **Shuffle**: Best for movie channels. Deterministic shuffle means the schedule is consistent for the day.
- **Sequential**: Plays items in order (A-Z for movies, S01E01... for shows). Best for "binge" channels.
- **Random**: True random shuffle. The schedule changes every time you look.

## Editing a Channel

1. Go to **Settings** -> **Channels**.
2. Select the channel you want to modify.
3. Change settings and select **Save**.
4. **Note**: Changing content or playback mode will regenerate the schedule.

## Deleting a Channel

1. Go to **Settings** -> **Channels**.
2. Select the channel.
3. Scroll down and select **Delete Channel**.
4. Confirm the action.

## Channel Ordering

Channels appear in the EPG sorted by **Channel Number**. To reorder them, simply edit their numbers.
