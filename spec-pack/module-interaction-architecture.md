# Module Interaction Architecture

## Overview

This document visualizes the data flow and communication patterns between Retune modules.

---

## High-Level Module Dependency Graph

```mermaid
graph TB
    subgraph "Infrastructure Layer"
        EE[EventEmitter]
        LC[AppLifecycle]
        NAV[Navigation]
    end
    
    subgraph "Plex Integration Layer"
        PA[PlexAuth]
        PSD[PlexServerDiscovery]
        PL[PlexLibrary]
        PSR[PlexStreamResolver]
    end
    
    subgraph "Core Playback Layer"
        CM[ChannelManager]
        CS[ChannelScheduler]
        VP[VideoPlayer]
    end
    
    subgraph "UI Layer"
        EPG[EPGComponent]
    end
    
    subgraph "Orchestration Layer"
        ORC[Orchestrator]
    end
    
    %% Dependencies
    PA --> EE
    PSD --> PA
    PL --> PSD
    PL --> PA
    PSR --> PA
    CM --> PL
    CS --> CM
    VP --> PSR
    VP --> EE
    EPG --> CS
    EPG --> CM
    EPG --> NAV
    NAV --> EE
    LC --> EE
    
    %% Orchestrator coordinates all
    ORC --> PA
    ORC --> PSD
    ORC --> PL
    ORC --> PSR
    ORC --> CM
    ORC --> CS
    ORC --> VP
    ORC --> EPG
    ORC --> NAV
    ORC --> LC
```

---

## Data Flow: Channel Switch Sequence

```mermaid
sequenceDiagram
    participant User
    participant NAV as Navigation
    participant CM as ChannelManager
    participant ORC as Orchestrator
    participant CS as Scheduler
    participant PSR as StreamResolver
    participant VP as VideoPlayer
    
    User->>NAV: Press Channel Up
    NAV->>NAV: Map keyCode 33 to 'channelUp'
    NAV->>CM: nextChannel()
    CM->>CM: Get next channel from list
    CM-->>ORC: emit 'channelSwitch'
    
    ORC->>CM: resolveChannelContent(channelId)
    CM-->>ORC: ResolvedChannelContent
    
    ORC->>CS: loadChannel(config)
    CS->>CS: Build schedule index
    CS-->>ORC: emit 'programStart'
    
    ORC->>PSR: resolveStream(request)
    PSR-->>ORC: StreamDecision
    
    ORC->>VP: loadStream(descriptor)
    VP->>VP: Set video.src
    
    ORC->>VP: seekTo(elapsedMs)
    ORC->>VP: play()
    
    VP-->>User: Video plays at correct position
```

---

## Data Flow: Authentication

```mermaid
sequenceDiagram
    participant User
    participant UI as AuthScreen
    participant PA as PlexAuth
    participant API as plex.tv
    participant ORC as Orchestrator
    participant PSD as ServerDiscovery
    
    User->>UI: Launch app
    UI->>PA: loadStoredCredentials()
    
    alt No stored token
        PA-->>UI: Not authenticated
        UI->>PA: requestPin()
        PA->>API: POST /api/v2/pins
        API-->>PA: { id, code }
        PA-->>UI: Display PIN code
        
        User->>User: Goes to plex.tv/link
        
        loop Poll every 1s for 5 min
            PA->>API: GET /api/v2/pins/{id}
            alt PIN claimed
                API-->>PA: { authToken }
                PA->>PA: storeCredentials()
                PA-->>ORC: emit 'authChange' (true)
            end
        end
    else Has token
        PA->>PA: validateToken()
        PA->>API: GET /api/v2/user
        alt Token valid
            API-->>PA: 200 OK
            PA-->>ORC: emit 'authChange' (true)
        else Token expired
            API-->>PA: 401
            PA-->>UI: Show auth screen
        end
    end
    
    ORC->>PSD: discoverServers()
    PSD->>API: GET /api/v2/resources
    API-->>PSD: Server list
```

---

## Data Flow: EPG Interaction

```mermaid
sequenceDiagram
    participant User
    participant NAV as Navigation
    participant EPG as EPGComponent
    participant CS as Scheduler
    participant CM as ChannelManager
    participant ORC as Orchestrator
    
    User->>NAV: Press Guide button
    NAV-->>EPG: emit 'keyPress' { guide }
    EPG->>EPG: show()
    
    EPG->>CM: getChannels()
    CM-->>EPG: ChannelConfig[]
    
    loop For each visible channel
        EPG->>CS: getScheduleWindow(start, end)
        CS-->>EPG: ScheduleWindow
    end
    
    EPG->>EPG: renderVisibleCells()
    
    User->>NAV: D-pad navigation
    NAV-->>EPG: handleNavigation('down')
    EPG->>EPG: focusProgram(newChannel, newProgram)
    EPG-->>EPG: updateInfoPanel()
    
    User->>NAV: Press OK
    NAV-->>EPG: handleSelect()
    EPG-->>ORC: emit 'channelSelected'
    ORC->>CM: switchToChannel(channelId)
    EPG->>EPG: hide()
```

---

## Event Bus Architecture

```mermaid
flowchart LR
    subgraph Events
        A1[authChange]
        A2[serverChange]
        A3[channelSwitch]
        A4[contentResolved]
        A5[programStart]
        A6[programEnd]
        A7[stateChange]
        A8[error]
        A9[keyPress]
        A10[screenChange]
    end
    
    subgraph Emitters
        PA[PlexAuth] --> A1
        PSD[ServerDiscovery] --> A2
        CM[ChannelManager] --> A3
        CM --> A4
        CS[Scheduler] --> A5
        CS --> A6
        VP[VideoPlayer] --> A7
        VP --> A8
        NAV[Navigation] --> A9
        NAV --> A10
    end
    
    subgraph Consumers
        A1 --> ORC[Orchestrator]
        A2 --> ORC
        A3 --> ORC
        A4 --> CS
        A5 --> VP
        A5 --> ORC
        A6 --> ORC
        A7 --> ORC
        A8 --> ORC
        A9 --> EPG[EPG]
        A10 --> LC[Lifecycle]
    end
```

---

## Module State Diagram

```mermaid
stateDiagram-v2
    [*] --> Launching: App starts
    
    Launching --> Authenticating: Load credentials
    Authenticating --> AuthScreen: No token
    Authenticating --> Connecting: Token valid
    
    AuthScreen --> Authenticating: PIN claimed
    
    Connecting --> ServerSelect: No server
    Connecting --> Loading: Server connected
    
    ServerSelect --> Connecting: Server selected
    
    Loading --> Ready: Channels loaded
    Loading --> Error: Load failed
    
    Ready --> Playing: Channel switch
    Playing --> Ready: Stop playback
    Playing --> Background: App backgrounded
    
    Background --> Playing: App resumed
    Background --> [*]: App closed
    
    Error --> AuthScreen: Auth error
    Error --> ServerSelect: Server error
    Error --> [*]: Fatal error
```

---

## Module Interface Summary

| Module | Provides | Consumes | Key Events |
|--------|----------|----------|------------|
| EventEmitter | Event subscription | - | - |
| PlexAuth | Auth headers, token | - | `authChange` |
| ServerDiscovery | Server URI | PlexAuth | `serverChange` |
| PlexLibrary | Media metadata | PlexAuth, Discovery | `libraryRefreshed` |
| StreamResolver | Stream URLs | PlexAuth | - |
| ChannelManager | Channel configs | PlexLibrary | `channelSwitch`, `contentResolved` |
| ChannelScheduler | Program at time | ChannelManager | `programStart`, `programEnd` |
| VideoPlayer | Playback control | StreamResolver | `stateChange`, `error` |
| Navigation | Focus, keys | - | `keyPress`, `screenChange` |
| EPGComponent | Guide UI | Scheduler, Manager, Nav | `channelSelected` |
| AppLifecycle | Lifecycle hooks | - | `stateChange` |
| Orchestrator | Coordination | All above | - |
