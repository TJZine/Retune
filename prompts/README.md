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

## Related Files

| File | Purpose |
|:-----|:--------|
| `../spec_plan_review.md` | META review prompt for Plan Review Agent |
| `../opus_spec_plan.md` | Spec generation prompt for Spec Gen Agent |

## Execution Model

- **Separate sessions**: Each agent runs in its own context window
- **Sequential within phase**: Agents run one after another
- **Shared state**: `implementation-state.json` coordinates progress
- **Spec is SSOT**: Agents reference but never modify specs

## Pre-Flight Checks

Before starting any agent session, verify:

### For Spec Gen Agent

- [ ] Architectural plan is complete
- [ ] Previous review feedback is available (if re-run)

### For Plan Review Agent

- [ ] All spec pack artifacts exist (1-11)
- [ ] META review prompt loaded

### For Planning Agent

- [ ] Latest review score ≥ 95%
- [ ] Zero BLOCKING issues
- [ ] AI Readiness score ≥ 95%

### For Coding Agent

- [ ] Module dependencies marked `complete`
- [ ] Context handoff exists for target module
- [ ] Shared types compile

### For Code Review Agent

- [ ] Implementation is marked `review` in state
- [ ] All verification commands available
- [ ] Context handoff accessible
