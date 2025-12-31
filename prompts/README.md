# Agent Prompts

This directory contains system prompts for the multi-agent AI development workflow.

## Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PHASE 1: SPEC GENERATION & REVIEW                      │
│                       (Loops until ≥95% on META review)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐                                                         │
│   │   SPEC GEN   │ (initial run only, uses opus_spec_plan.md)              │
│   └──────────────┘                                                         │
│         │                                                                   │
│         ▼                                                                   │
│   ┌──────────────┐          ┌──────────────┐                               │
│   │ PLAN REVIEW  │─────────▶│   SPEC FIX   │◀─────────┐                    │
│   │   AGENT      │          │   AGENT      │          │                    │
│   └──────────────┘          └──────────────┘          │                    │
│         │                         │                   │                    │
│         ▼                         ▼                   │                    │
│   issue-registry.md         (fixes applied)           │                    │
│                                   │                   │                    │
│                                   ▼                   │                    │
│                          ┌──────────────┐             │                    │
│                          │  Score < 95% │─────────────┘                    │
│                          └──────────────┘                                  │
│                                   │                                        │
│                                   ▼ (Score ≥ 95%, no BLOCKING)             │
│                          [PHASE 1 COMPLETE]                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 2: IMPLEMENTATION (per module)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│   Planning Agent ──▶ Coding Agent ──▶ Code Review Agent                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Prompts

### Phase 1: Spec Generation & Review

| File | Agent | Purpose |
|:-----|:------|:--------|
| `../opus_spec_plan.md` | Spec Gen Agent | Initial generation of all 11 artifacts |
| `../spec_plan_review.md` | Plan Review Agent | Reviews specs, outputs issue registry |
| [spec-fix-agent.md](./spec-fix-agent.md) | Spec Fix Agent | Patches issues without regenerating |

### Phase 2: Implementation

| File | Agent | Purpose |
|:-----|:------|:--------|
| [planning-agent.md](./planning-agent.md) | Planning Agent | Generates context handoffs, sequences work |
| [coding-agent.md](./coding-agent.md) | Coding Agent | Implements modules from specs |
| [code-review-agent.md](./code-review-agent.md) | Code Review Agent | Verifies implementations |

## Supporting Documentation

| File | Purpose |
|:-----|:--------|
| [agent-memory-system.md](./agent-memory-system.md) | Session persistence across Coding Agent runs |
| [templates/orchestration-document.md](./templates/orchestration-document.md) | Planning → Coding handoff template |

## Workflow Automation Scripts

| Script | Purpose | Usage |
|:-------|:--------|:------|
| `scripts/gate-check.sh` | Pre-flight validation | `./scripts/gate-check.sh <module-id>` |
| `scripts/escalation-detector.sh` | Classify failures as code bug vs spec gap | `npm test 2>&1 \| ./scripts/escalation-detector.sh -` |
| `scripts/progress-dashboard.sh` | Visualize implementation progress | `./scripts/progress-dashboard.sh` |

## Related Files

| File | Purpose |
|:-----|:--------|
| `../spec_plan_review.md` | META review prompt for Plan Review Agent |
| `../opus_spec_plan.md` | Spec generation prompt for Spec Gen Agent |

## Directory Structure

```text
prompts/
├── README.md                   # This file
├── agent-memory-system.md      # Session persistence format
├── planning-agent.md           # Planning Agent prompt
├── coding-agent.md             # Coding Agent prompt
├── code-review-agent.md        # Code Review Agent prompt
└── templates/
    └── orchestration-document.md  # Handoff template

agent-memory/
├── coding-agent/               # Per-module session logs
├── planning-agent/             # Planning session logs
├── sessions/                   # Machine-readable JSON
└── reviews/                    # Review log records

orchestration-docs/
└── session-[module]-[N].md     # Active orchestration docs

scripts/
├── gate-check.sh               # Pre-flight validation
├── escalation-detector.sh      # Failure classification
└── progress-dashboard.sh       # Progress visualization
```

## Execution Model

- **Separate sessions**: Each agent runs in its own context window
- **Sequential within phase**: Agents run one after another
- **Shared state**: `implementation-state.json` coordinates progress
- **Spec is SSOT**: Agents reference but never modify specs
- **Agent memory**: Session context persists for retries

## Pre-Flight Checks

Before starting any agent session, verify:

### For Spec Gen Agent

- [ ] Architectural plan is complete
- [ ] Previous review feedback is available (if re-run)

### For Plan Review Agent

- [ ] All spec pack artifacts exist (1-14)
- [ ] META review prompt loaded

### For Planning Agent

- [ ] Latest review score ≥ 95%
- [ ] Zero BLOCKING issues
- [ ] AI Readiness score ≥ 95%
- [ ] Orchestration score ≥ 90%

### For Coding Agent

- [ ] Run `./scripts/gate-check.sh <module-id>`
- [ ] Module dependencies marked `complete`
- [ ] Orchestration document exists
- [ ] Context handoff exists for target module
- [ ] Shared types compile
- [ ] Previous session memory reviewed (if retry)

### For Code Review Agent

- [ ] Implementation is marked `review` in state
- [ ] All verification commands available
- [ ] Context handoff accessible
- [ ] Coding Agent session memory accessible
