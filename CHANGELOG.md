# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

> [!NOTE]
> This is a pre-release version. Breaking changes may occur before v1.0.0.

### Added

#### Core Modules

- **Plex Integration**
  - OAuth PIN-based authentication flow for TV devices
  - Server discovery with automatic connection testing
  - Library parsing and metadata management
  - Stream resolution with Direct Play prioritization
  - Mixed content configuration (HTTPS preferred, local HTTP fallback)

- **Channel Management**
  - Channel CRUD operations with persistence
  - Content resolution from Plex libraries, collections, and playlists
  - Filtering by genre, year, rating, and custom criteria
  - Sorting options (title, release date, rating)
  - Deterministic shuffle for consistent daily schedules

- **Scheduler**
  - Time-based scheduling with wall-clock alignment
  - Sequential, shuffle, and random playback modes
  - Mid-stream tune-in (join programs already in progress)
  - Manual jump support with anchor persistence

- **Video Player**
  - Modular architecture with separate managers (Audio, Subtitle, Retry, KeepAlive)
  - HLS playback via native webOS media pipeline
  - Audio and subtitle track selection
  - Retry logic with exponential backoff
  - Media Session API integration for system media controls
  - Keep-alive functionality to prevent TV suspension

- **Electronic Program Guide (EPG)**
  - Grid-based channel/time visualization
  - Virtualized rendering for performance
  - Full remote navigation (D-pad, OK, Back)
  - Magic Remote pointer support
  - Program info overlay

- **App Lifecycle**
  - webOS visibility API integration
  - Background/foreground state management
  - Graceful pause/resume of playback

- **Navigation**
  - D-pad navigation with focus management
  - Remote key handling (all standard LG remote buttons)
  - Keyboard shortcuts for browser development

#### Infrastructure

- Event Emitter system for module communication
- Shared type definitions and interfaces
- Comprehensive test coverage with Jest

### Fixed

- EPG focus management and stale content issues
- Player start position assignment timing
- Scheduler jump anchor calculation
- Audio track verification and retry handling
- Truncation warning accuracy in scheduler
- Type safety improvements across modules

### Changed

- Simplified Plex server discovery promise handling and object creation

### Performance

- Skip unnecessary index rebuild in scheduler `jumpToProgram` operation

---

## [1.0.0] - TBD

First stable release. See [Unreleased] section for feature list.

---

[Unreleased]: https://github.com/TJZine/Retune/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/TJZine/Retune/releases/tag/v1.0.0
