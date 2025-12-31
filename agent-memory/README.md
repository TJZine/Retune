# Agent Memory Directory

This directory contains session logs and decision records from AI agent sessions.

## Structure

```
agent-memory/
├── coding-agent/      # Per-module session logs from Coding Agent
│   └── [module-id].md
├── planning-agent/    # Planning session logs
│   └── phase-[N]-planning.md
└── sessions/          # Machine-readable session JSON
    └── session-[uuid].json
```

## Purpose

- **Cross-session context**: Retry sessions can reference previous attempts
- **Institutional knowledge**: Decisions and rationale are preserved
- **Debugging**: Trace issues across session boundaries
- **Learning**: Identify patterns in failures

## Usage

See `prompts/agent-memory-system.md` for complete format specification.
