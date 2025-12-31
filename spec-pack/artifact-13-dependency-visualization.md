# Module Dependency Graph

Visual representation of module dependencies in the Retune application.

## Implementation Order Diagram

```mermaid
flowchart TB
    subgraph Phase1["Phase 1: Core Infrastructure"]
        EE["event-emitter<br/>Priority: 1"]
        PA["plex-auth<br/>Priority: 1"]
        AL["app-lifecycle<br/>Priority: 1"]
        NAV["navigation<br/>Priority: 2"]
    end

    subgraph Phase2["Phase 2: Plex Integration"]
        PSD["plex-server-discovery<br/>Priority: 2"]
        PL["plex-library<br/>Priority: 3"]
        PSR["plex-stream-resolver<br/>Priority: 3"]
    end

    subgraph Phase3["Phase 3: Core Playback"]
        CM["channel-manager<br/>Priority: 4"]
        VP["video-player<br/>Priority: 4"]
        CS["channel-scheduler<br/>Priority: 5"]
    end

    subgraph Phase4["Phase 4: Full EPG"]
        EPG["epg-ui<br/>Priority: 6"]
    end

    subgraph Phase5["Phase 5: Integration"]
        ORCH["app-orchestrator<br/>Priority: 7"]
    end

    %% Dependencies
    EE --> PA
    EE --> AL
    EE --> NAV
    
    PA --> PSD
    PSD --> PL
    PSD --> PSR
    
    PL --> CM
    PSR --> VP
    
    CM --> CS
    
    NAV --> EPG
    CS --> EPG
    CM --> EPG
    
    AL --> ORCH
    NAV --> ORCH
    PA --> ORCH
    PL --> ORCH
    CM --> ORCH
    CS --> ORCH
    VP --> ORCH
    EPG --> ORCH

    classDef phase1 fill:#e8f5e9,stroke:#2e7d32
    classDef phase2 fill:#e3f2fd,stroke:#1565c0
    classDef phase3 fill:#fff3e0,stroke:#ef6c00
    classDef phase4 fill:#fce4ec,stroke:#c2185b
    classDef phase5 fill:#f3e5f5,stroke:#7b1fa2

    class EE,PA,AL,NAV phase1
    class PSD,PL,PSR phase2
    class CM,VP,CS phase3
    class EPG phase4
    class ORCH phase5
```

## Critical Path

```mermaid
flowchart LR
    A["event-emitter"] --> B["plex-auth"] --> C["plex-server-discovery"]
    C --> D["plex-library"] --> E["channel-manager"] --> F["channel-scheduler"]
    C --> G["plex-stream-resolver"] --> H["video-player"]
    F & H --> I["app-orchestrator"]

    style A fill:#ffcdd2
    style B fill:#ffcdd2
    style C fill:#ffcdd2
    style D fill:#ffcdd2
    style E fill:#ffcdd2
    style F fill:#ffcdd2
    style G fill:#ffcdd2
    style H fill:#ffcdd2
    style I fill:#ffcdd2
```

## Module Matrix

| Module | Depends On | Provides | Consumes |
| :--- | :--- | :--- | :--- |
| event-emitter | - | TypedEventEmitter | - |
| plex-auth | event-emitter | IPlexAuth, PlexAuthToken | - |
| app-lifecycle | event-emitter | IAppLifecycle | - |
| navigation | event-emitter | INavigationManager | keyPress events |
| plex-server-discovery | plex-auth | IPlexServerDiscovery | authChange |
| plex-library | plex-auth, discovery | IPlexLibrary | authChange |
| plex-stream-resolver | plex-auth, discovery | IPlexStreamResolver | authChange |
| channel-manager | plex-library | IChannelManager | - |
| channel-scheduler | channel-manager | IChannelScheduler | contentResolved |
| video-player | plex-stream-resolver | IVideoPlayer | - |
| epg-ui | navigation, scheduler, manager | IEPGComponent | scheduleSync, channelUpdated |
| app-orchestrator | ALL | IOrchestrator | ALL events |

## Startup Initialization Sequence

```mermaid
sequenceDiagram
    participant App
    participant Orchestrator
    participant Auth as PlexAuth
    participant Discovery as ServerDiscovery
    participant Library as PlexLibrary
    participant Manager as ChannelManager
    participant Scheduler as ChannelScheduler
    participant Player as VideoPlayer
    participant Nav as Navigation

    App->>Orchestrator: initialize()
    Orchestrator->>Nav: initialize()
    Orchestrator->>Auth: loadStoredCredentials()
    
    alt Not Authenticated
        Auth-->>Orchestrator: null
        Orchestrator->>Nav: goTo('auth')
    else Authenticated
        Auth-->>Orchestrator: credentials
        Orchestrator->>Discovery: discoverServers()
        
        alt No Server Selected
            Discovery-->>Orchestrator: servers[]
            Orchestrator->>Nav: goTo('serverSelect')
        else Server Selected
            Discovery-->>Orchestrator: selectedServer
            Orchestrator->>Library: initialize()
            Orchestrator->>Manager: loadChannels()
            Orchestrator->>Scheduler: loadChannel()
            Orchestrator->>Player: initialize()
            Scheduler-->>Orchestrator: programStart
            Orchestrator->>Player: loadStream()
            Orchestrator->>Nav: goTo('player')
        end
    end
```

## Event Flow

```mermaid
flowchart LR
    subgraph Events
        A1["authChange"]
        A2["serverChange"]
        A3["contentResolved"]
        A4["programStart"]
        A5["programEnd"]
        A6["keyPress"]
        A7["screenChange"]
    end

    subgraph Producers
        P1["PlexAuth"] --> A1
        P2["ServerDiscovery"] --> A2
        P3["ChannelManager"] --> A3
        P4["ChannelScheduler"] --> A4
        P5["ChannelScheduler"] --> A5
        P6["Navigation"] --> A6
        P7["Navigation"] --> A7
    end

    subgraph Consumers
        A1 --> C1["Orchestrator"]
        A2 --> C2["Orchestrator"]
        A3 --> C3["ChannelScheduler"]
        A4 --> C4["Orchestrator, VideoPlayer"]
        A5 --> C5["Orchestrator"]
        A6 --> C6["All UI Components"]
        A7 --> C7["All UI Components"]
    end
```
