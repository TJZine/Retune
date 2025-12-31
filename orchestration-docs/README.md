# Orchestration Documents Directory

This directory contains session-specific orchestration documents created by the Planning Agent for the Coding Agent.

## Naming Convention

```
session-[module-id]-[attempt].md
```

Examples:

- `session-event-emitter-1.md` - First attempt at event-emitter
- `session-plex-auth-2.md` - Second attempt (retry) at plex-auth

## Purpose

Orchestration documents bridge the Planning Agent → Coding Agent handoff by:

1. **Referencing** the SSOT (implementation prompts) without copying
2. **Adding** session-specific context (dependencies, attempt number)
3. **Providing** failure recovery instructions

## Template

See `prompts/templates/orchestration-document.md` for the template.

## Lifecycle

1. Planning Agent creates document before passing to Coding Agent
2. Coding Agent references document during implementation
3. Document is retained for debugging/audit
