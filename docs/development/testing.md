# Testing Guide

## Unit Tests

We use **Jest** for unit testing.

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### What to Test

- **Core Logic**: Schedulers, math utilities, Plex data parsing.
- **State Management**: Channel creation, deletion, updates.
- **Orchestration**: ensuring events trigger correct actions.

*Note: UI components are generally tested manually or via integration tests.*

## Manual Verification

### Browser Testing

- **Goal**: Verify UI layout, navigation logic, and API calls.
- **Method**: Use `npm run dev` and Chrome DevTools.
- **Key Check**: Resize window to 1920x1080 to match TV resolution.

### Emulator Testing

- **Goal**: Verify platform integration (LS2 API), native video playback, and remote input.
- **Key Check**: HLS playback—verify smooth startup (<3s), no buffering interruptions, correct resolution rendering.

### Physical Device Testing

- **Goal**: Verify real-world performance (FPS, memory usage).
- **Key Check**: Long-term stability (leave running for >1 hour).
