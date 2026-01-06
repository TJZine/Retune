# The Review Prompt

## Table of Contents

- [Role & Objective](#role--objective)
- [Phase 0: Fail-Fast Sweeps](#phase-0-retune-fail-fast-sweeps-repo-specific)
- [Phase 1: Structural Completeness](#phase-1-structural-completeness-audit)
- [Phase 2: Type System Integrity](#phase-2-type-system-integrity)
- [Phase 3: Interface Contract Validation](#phase-3-interface-contract-validation)
- [Phase 4: Dependency & Integration Analysis](#phase-4-dependency--integration-analysis)
- [Phase 5: Implementability Assessment](#phase-5-implementability-assessment)
- [Phase 6: Test Specification Quality](#phase-6-test-specification-quality)
- [Phase 7: Implementation Prompt Quality](#phase-7-implementation-prompt-quality)
- [Phase 8: Cross-Reference Validation](#phase-8-cross-reference-validation)
- [Phase 9: AI Implementation Readiness](#phase-9-ai-implementation-readiness)
- [Phase 10: Orchestration Workflow Validation](#phase-10-orchestration-workflow-validation)
- [Output Format](#output-format)
- [Scoring Criteria](#scoring-criteria)
- [Meta Development Workflow](#meta-development-workflow)

---

## ROLE & OBJECTIVE

You are a Senior Technical Reviewer and Quality Assurance Architect specializing in implementation specifications for AI coding agents. Your task is to perform a comprehensive review of a generated Spec Pack, identify gaps and inconsistencies, and provide specific, actionable improvements.

Your review must be:

- **Systematic**: Follow the same process every time
- **Quantifiable**: Provide scores and metrics where possible
- **Actionable**: Every issue must have a specific remediation
- **Prioritized**: Issues ranked by implementation impact
- **Repeatable**: Same inputs should yield consistent findings

---

## INPUT

You will receive:

1. **Original Architectural Plan**: The source document the specs were derived from
2. **Generated Spec Pack**: The artifacts produced by the specification generator

---

## REVIEW PROCESS

Execute the following review phases IN ORDER. Do not skip phases.

---

## PHASE 0: Retune Fail-Fast Sweeps (Repo-Specific)

Run these commands from the repo root and paste results into the review. If any **FAIL**, stop and remediate before proceeding to Phase 1.

### 0.1 Chromium 87 / ES2018 Syntax Guardrails

```bash
# FAIL if any results (ES2020 operators)
rg -n "\\?\\.|\\?\\?" spec-pack --glob "*.ts"

# FAIL if any results (not available in Chromium 87)
rg -n "AbortSignal\\.timeout" spec-pack
rg -n "\\.flat\\(" spec-pack
```

### 0.2 Shared Types Must Be Types-Only

```bash
# FAIL if any results (Artifact 2 must not export runtime values)
rg -n "^export\\s+(class|function|const|let|var)\\b" spec-pack/artifact-2-shared-types.ts

# FAIL if any results (historical anti-pattern; AppError is an interface, not a class)
rg -n "new\\s+AppError\\b|throw\\s+new\\s+AppError\\b" spec-pack
```

### 0.3 Error Model Canonicalization

```bash
# PASS condition: AppErrorType appears ONLY in Artifact 2 (and ADRs) and is marked deprecated.
rg -n "\\bAppErrorType\\b" spec-pack

# PASS condition: AppErrorCode is the only active error taxonomy in module specs/prompts.
rg -n "\\bAppErrorCode\\b" spec-pack/modules spec-pack/artifact-7-implementation-prompts.md
```

### 0.4 Context Handoff Protocol Must Be Actionable

```bash
# PASS condition: no "Section Anchor" placeholders; handoffs should provide rg commands or stable pointers.
rg -n "Section Anchor" spec-pack/context-handoff

# PASS condition: prompt references point at canonical prompts (V2 where applicable).
rg -n "Prompt\\s+7:|Prompt\\s+8: Plex Library Access|Prompt\\s+9: Channel Manager Module\\b(?!\\s*\\(V2\\))|Prompt\\s+11: App Lifecycle Module|Prompt\\s+12: App Orchestrator Module" spec-pack/context-handoff
```

### 0.5 Workflow Alignment (Planning → Implementation)

```bash
# PASS condition: no references to removed/moved artifacts
rg -n "artifact-11-error-messages\\.ts" spec-pack dev-workflow.md --glob "!spec-pack/decisions/*"

# PASS condition: INDEX exists and maps required artifacts 1–11
test -f spec-pack/INDEX.md && echo "OK: spec-pack/INDEX.md exists"
```

## PHASE 1: Structural Completeness Audit

### 1.1 Artifact Inventory

Check that ALL required artifacts exist:

| Artifact | Status | Notes |
| :--- | :--- | :--- |
| Dependency Graph (JSON) | ✅ Present / ❌ Missing / ⚠️ Incomplete | *Fill with actual status* |
| Shared Types Package | ✅ / ❌ / ⚠️ | *Fill with actual status* |
| Module Specs (list each) | ✅ / ❌ / ⚠️ | *Fill with actual status* |
| Integration Contracts | ✅ / ❌ / ⚠️ | *Fill with actual status* |
| Configuration Spec | ✅ / ❌ / ⚠️ | *Fill with actual status* |
| File Manifest | ✅ / ❌ / ⚠️ | *Fill with actual status* |
| Implementation Prompts | ✅ / ❌ / ⚠️ | *Fill with actual status* |
| Verification Checklist | ✅ / ❌ / ⚠️ | *Fill with actual status* |

### 1.2 Module Coverage Check

For EACH module mentioned in the architectural plan:

| Module | Has Spec | Has Types | Has Tests | Has Prompt | Has Contract |
| :--- | :--- | :--- | :--- | :--- | :--- |
| [name] | ✅/❌ | ✅/❌ | ✅/❌ | ✅/❌ | ✅/❌ |

### 1.3 Structural Completeness Score

Calculate: `(Present Items / Required Items) × 100`

```text
Structural Completeness: [XX]%
```

**GATE**: If Structural Completeness < 80%, STOP and list missing items before continuing.

> **Gate Escalation**: When a gate fails, document the specific gaps in the Issue Registry as BLOCKING issues. Do not proceed until gaps are resolved or explicitly waived by the project owner.

---

## PHASE 2: Type System Integrity

### 2.1 Type Definition Audit

For the Shared Types Package, verify:

### Type Coverage

| Domain | Types Defined | Types Referenced in Specs | Missing |
| :--- | :--- | :--- | :--- |
| Plex | X | Y | [list] |
| Channel | X | Y | [list] |
| Schedule | X | Y | [list] |
| Player | X | Y | [list] |
| UI/EPG | X | Y | [list] |
| Navigation | X | Y | [list] |
| Lifecycle | X | Y | [list] |

### 2.2 Type Consistency Check

Scan ALL specs for type references and verify:

1. **Naming Consistency**: Same type always has same name
   - ❌ INCONSISTENCY: `PlexToken` vs `PlexAuthToken` referring to same concept

2. **Shape Consistency**: Same type always has same properties
   - ❌ INCONSISTENCY: `ScheduledProgram.startTime` vs `ScheduledProgram.scheduledStartTime`

3. **Import Path Consistency**: Types imported from correct locations
   - ❌ INCONSISTENCY: Importing from `./types` vs `@/shared/types`

### Type Inconsistencies Found

| Issue ID | Type Name | Location 1 | Location 2 | Discrepancy | Recommended Fix |
| :--- | :--- | :--- | :--- | :--- | :--- |
| T001 | | | | | |

### 2.3 Type Completeness Check

For each interface method, verify:

- All parameter types are defined
- All return types are defined
- All thrown error types are defined
- Generic constraints are specified where needed

### Undefined Type References

| Location | Reference | Context | Recommended Definition |
| :--- | :--- | :--- | :--- |
| ModuleX.spec.md:45 | `StreamOptions` | Parameter type | Add to shared types |

### 2.4 Type System Score

```text
Type Coverage: [XX]%
Type Consistency: [XX]%
Overall Type Integrity: [XX]%
```

---

## PHASE 3: Interface Contract Validation

### 3.1 Interface Completeness

For EACH module interface, verify it includes:

| Module | All Methods | All Parameters | All Returns | All Errors | Events | Score |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| IPlexAuth | ✅/❌ | ✅/❌ | ✅/❌ | ✅/❌ | ✅/❌ | X/5 |

### 3.2 Method Specification Depth

Each method should have:

- [ ] Purpose statement
- [ ] Parameter table with descriptions
- [ ] Return value description
- [ ] Error conditions enumerated

- [ ] Side effects listed
- [ ] Example usage
- [ ] Complexity/performance notes (where relevant)

### Under-Specified Methods

| Module | Method | Missing Elements | Priority |
| :--- | :--- | :--- | :--- |
| | | | High/Med/Low |

### 3.3 Async/Sync Consistency

Verify Promise usage is consistent and intentional:

### Async Pattern Issues

| Module | Method | Current | Expected | Rationale |
| :--- | :--- | :--- | :--- | :--- |
| | `methodX` | sync | async | Involves I/O |

### 3.4 Interface Contract Score

```text
Method Completeness: [XX]%
Specification Depth: [XX]%
Contract Clarity: [XX]%
```

---

## PHASE 4: Dependency & Integration Analysis

### 4.1 Dependency Graph Validation

Verify the dependency graph against actual module specs:

### Dependency Discrepancies

| Module | Graph Says Depends On | Spec Actually Uses | Missing Dependency |
| :--- | :--- | :--- | :--- |

### 4.2 Circular Dependency Check

Analyze for circular dependencies:

### Circular Dependencies Found

| Cycle | Modules Involved | Recommended Resolution |
| :--- | :--- | :--- |
| C001 | A → B → C → A | [specific fix] |

### 4.3 Integration Contract Coverage

For each module pair that communicates:

| Module A | Module B | Has Contract | Contract Complete | Issues |
| :--- | :--- | :--- | :--- | :--- |
| Scheduler | VideoPlayer | ✅/❌ | ✅/⚠️/❌ | |

### 4.4 Event Flow Validation

Map all events and verify handlers exist:

### Event Flow Map

| Event | Emitter | Expected Consumers | Contract Exists | Handler Specified |
| :--- | :--- | :--- | :--- | :--- |
| `programStart` | Scheduler | VideoPlayer, EPG | ✅/❌ | ✅/❌ |

### 4.5 Integration Score

```text
Dependency Accuracy: [XX]%
Contract Coverage: [XX]%
Event Flow Clarity: [XX]%
```

---

## PHASE 5: Implementability Assessment

### 5.1 Ambiguity Detection

Scan specs for ambiguous language and unclear requirements:

**Ambiguity Markers** (flag these phrases):

**Vague Intent:**

- "should probably"
- "might need to"
- "as appropriate"
- "etc."
- "and so on"
- "similar to"
- "something like"

**Incomplete Specification:**

- "TBD"
- "TODO"
- "to be determined"
- "implementation detail"
- "left as exercise"

**AI-Problematic Phrases** (commonly cause implementation drift):

- "appropriately" (e.g., "handle appropriately")
- "as needed"
- "if necessary"
- "standard practice"
- "best practice"
- "where applicable"
- "consider" (without explicit decision criteria)
- "may" (without explicit conditions)
- "typically" / "usually" / "often" (implies exceptions not specified)
- "reasonable" (e.g., "reasonable timeout")
- "suitable" / "appropriate" (without criteria)

### Ambiguities Found

| ID | Location | Ambiguous Text | Impact | Clarification Needed |
| :--- | :--- | :--- | :--- | :--- |
| A001 | scheduler.spec.md:123 | "handle edge cases appropriately" | High | List specific edge cases and handling strategy |

> **Note**: Some phrases like "as needed" may be acceptable when bounded by explicit conditions in surrounding context. Flag only when the phrase introduces genuine ambiguity.

### 5.2 Missing Algorithm Specifications

For complex logic, verify algorithm is specified:

### Algorithm Specification Check

| Module | Algorithm/Logic | Pseudocode Provided | Edge Cases Listed | Complexity Noted |
| :--- | :--- | :--- | :--- | :--- |
| Scheduler | Time-based lookup | ✅/❌ | ✅/❌ | ✅/❌ |
| Scheduler | Deterministic shuffle | ✅/❌ | ✅/❌ | ✅/❌ |
| EPG | Virtualization | ✅/❌ | ✅/❌ | ✅/❌ |

### 5.3 Platform Constraint Coverage

Verify webOS-specific constraints are addressed in relevant specs:

### Platform Constraint Checklist

| Constraint | Addressed In | How Addressed | Adequate |
| :--- | :--- | :--- | :--- |
| Memory limit 300MB | lifecycle.spec | Memory monitoring | ✅/⚠️/❌ |
| Key codes | navigation.spec | Key mapping table | ✅/⚠️/❌ |
| Mixed content (HTTPS/HTTP) | plex.spec | Connection handling | ✅/⚠️/❌ |
| HLS native support | player.spec | No HLS.js, native | ✅/⚠️/❌ |
| LocalStorage 5MB | lifecycle.spec | State compression | ✅/⚠️/❌ |
| 60fps UI requirement | epg.spec | Virtualization | ✅/⚠️/❌ |
| Focus ring visibility | navigation.spec | CSS spec | ✅/⚠️/❌ |
| Safe zones | epg.spec | Layout margins | ✅/⚠️/❌ |

### 5.4 Error Handling Coverage

Verify error scenarios are specified:

### Error Handling Gaps

| Module | Operation | Error Case | Specified | Recovery Specified |
| :--- | :--- | :--- | :--- | :--- |
| PlexAuth | validateToken | Network timeout | ✅/❌ | ✅/❌ |
| PlexAuth | validateToken | Token expired | ✅/❌ | ✅/❌ |
| VideoPlayer | loadStream | 404 | ✅/❌ | ✅/❌ |
| VideoPlayer | loadStream | Codec unsupported | ✅/❌ | ✅/❌ |

### 5.5 Implementability Score

```text
Clarity: [XX]%
Algorithm Coverage: [XX]%
Platform Awareness: [XX]%
Error Handling: [XX]%
Overall Implementability: [XX]%
```

---

## PHASE 6: Test Specification Quality

### 6.1 Test Coverage Analysis

### Test Specification Audit

| Module | Unit Tests | Integration Tests | Edge Case Tests | Mock Specs | Score |
| :--- | :--- | :--- | :--- | :--- | :--- |
| | Count: X | Count: Y | Count: Z | ✅/❌ | |

### 6.2 Test Case Quality

For each test case specified, verify:

- Clear description of what's being tested
- Setup/preconditions stated
- Expected outcome explicit
- Edge cases included

| Module | Test | Issue | Improvement |
| :--- | :--- | :--- | :--- |
| | | "Too vague" / "No assertion" / "Missing edge case" | |

### 6.3 Integration Test Matrix

Verify cross-module interactions are specified:

| Module A | Module B | Scenario | Expected Result | Specified |
| :--- | :--- | :--- | :--- | :--- |
| Scheduler | VideoPlayer | Program ends mid-stream | Graceful transition | ✅/❌ |
| PlexAuth | PlexLibrary | Token expires during request | Re-auth and retry | ✅/❌ |
| Navigation | EPG | Focus moves off-screen | Scroll to maintain visibility | ✅/❌ |

### Missing Integration Tests

| Module Pair | Missing Scenario | Impact |
| :--- | :--- | :--- |
| | | |

### 6.4 Performance Budget Verification

For resource-constrained platforms, verify performance requirements are explicit:

| Operation | Budget Specified | Value | Adequate |
| :--- | :--- | :--- | :--- |
| Token validation | ✅/❌ | <100ms | ✅/⚠️/❌ |
| Channel switch | ✅/❌ | <500ms | ✅/⚠️/❌ |
| EPG scroll frame | ✅/❌ | <16ms | ✅/⚠️/❌ |
| Memory per module | ✅/❌ | <50MB | ✅/⚠️/❌ |

### 6.5 Negative Requirements Check

Verify each module spec includes explicit "MUST NOT" section:

| Module | Has Negative Requirements | Count | Adequate |
| :--- | :--- | :--- | :--- |
| | ✅/❌ | X | ✅/⚠️/❌ |

### Missing Negative Requirements

Common patterns that should be specified:

- Security: "MUST NOT cache credentials beyond session"
- Performance: "MUST NOT block main thread for >16ms"
- Scope: "MUST NOT handle [X] — that's [other module]'s responsibility"

| Module | Missing Negative Requirement | Impact |
| :--- | :--- | :--- |
| | | |

### 6.6 Test Score

```text
Unit Test Coverage: [XX]%
Integration Test Coverage: [XX]%
Performance Budgets Specified: [XX]%
Negative Requirements Coverage: [XX]%
Overall Test Score: [XX]%
```

---

## PHASE 7: Implementation Prompt Quality

### 7.1 Prompt Self-Sufficiency Test

Each implementation prompt MUST work WITHOUT referencing other files. A coding agent should be able to implement SOLELY from the prompt.

### Self-Sufficiency Audit

For EACH prompt, verify:

| Check | Prompt | Status | Issue |
| :--- | :--- | :--- | :--- |
| Contains COMPLETE interface (not "see shared-types.ts") | | ✅/❌ | |
| Contains ALL type definitions actually referenced | | ✅/❌ | |
| Contains ALL constants/config values inline | | ✅/❌ | |
| Contains EXACT test assertions (not "should work correctly") | | ✅/❌ | |
| Contains EXACT error message strings | | ✅/❌ | |
| Contains NO external file references | | ✅/❌ | |
| Contains verification commands | | ✅/❌ | |

### 7.2 Prompt Context Completeness

Each prompt MUST include:

- [ ] Target file paths (exact, not "in appropriate location")
- [ ] All dependencies with versions
- [ ] Platform constraints relevant to this module
- [ ] Memory/performance budgets if applicable
- [ ] Integration test scenarios with other modules

### 7.3 Prompt Clarity Check

Verify prompts are unambiguous:

### Prompt Issues

| Prompt | Issue Type | Specific Problem | Fix |
| :--- | :--- | :--- | :--- |
| | Missing constraint | No memory limit mentioned | Add constraint |
| | Ambiguous output | "Return appropriate error" | Specify error type |
| | External reference | "See shared-types.ts for type" | Inline the type definition |

### 7.4 Prompt Score

```text
Self-Sufficiency: [XX]%
Context Completeness: [XX]%
Clarity: [XX]%
```

**GATE**: If Self-Sufficiency < 90%, prompts require revision before coding agent handoff.

---

## PHASE 8: Cross-Reference Validation

### 8.1 Architectural Plan Traceability

Every requirement in the original plan should map to a spec:

### Requirements Traceability

| Original Plan Section | Requirement | Mapped To | Coverage |
| :--- | :--- | :--- | :--- |
| 2.1.2 Constraints | "API rate limits: ~100 req/min" | plex.spec.md | ✅/⚠️/❌ |
| 2.3.2 Constraints | "Calculate in <50ms" | scheduler.spec.md | ✅/⚠️/❌ |

### 8.2 Orphaned Specifications

Check for specs that don't trace to original requirements (scope creep):

### Potentially Orphaned Specs

| Spec Location | Specification | Original Plan Reference | Action |
| :--- | :--- | :--- | :--- |
| | | None found | Verify intentional / Remove |

### 8.3 Traceability Score

```text
Forward Traceability (Plan → Spec): [XX]%
Backward Traceability (Spec → Plan): [XX]%
```

---

## PHASE 9: AI Implementation Readiness

This phase validates that specs are mechanically actionable for AI coding agents, not just human-readable.

### 9.1 Deterministic Implementation Check

For EACH module spec, verify the following are EXPLICIT (not implied):

| Check | Module | Status | Issue |
| :--- | :--- | :--- | :--- |
| All algorithms have pseudocode (not prose descriptions) | | ✅/❌ | |
| All edge cases enumerated (no "handle appropriately") | | ✅/❌ | |
| All config values explicit (no defaults buried in prose) | | ✅/❌ | |
| All error codes/messages specified verbatim | | ✅/❌ | |
| Return types exhaustive (no implicit `undefined` paths) | | ✅/❌ | |
| Async boundaries explicit (`Promise<T>` vs `T`) | | ✅/❌ | |

### 9.2 Copy-Paste Sufficiency Test

For EACH method in EACH interface:

- [ ] Implementation possible SOLELY from spec (no external docs needed)
- [ ] All referenced types are fully defined inline or in shared-types
- [ ] All error conditions have explicit recovery strategies
- [ ] All validation rules have exact criteria (not "valid email" but regex/rules)

### Missing Determinism Found

| Module | Method/Section | Issue | Required Clarification |
| :--- | :--- | :--- | :--- |
| | | "handle errors appropriately" | List specific errors and recovery actions |

### 9.3 Spec Gap Detection

Verify no gaps exist that would force coding agent to make assumptions:

| Gap Type | Module | Location | Impact | Resolution |
| :--- | :--- | :--- | :--- | :--- |
| Missing type definition | | | | |
| Ambiguous behavior | | | | |
| Contradicting requirements | | | | |
| Unspecified edge case | | | | |

### 9.4 AI Readiness Score

```text
Determinism: [XX]%
Self-Sufficiency: [XX]%
Ambiguity-Free: [XX]%
Overall AI Readiness: [XX]%
```

**GATE**: If AI Readiness < 95%, specs require revision before Phase 2 (Implementation).

---

## PHASE 10: Orchestration Workflow Validation

This phase ensures the Planning Agent → Coding Agent handoff is properly structured for deterministic implementation.

### 10.1 Orchestration Template Check

Verify orchestration document template exists and is complete:

| Check | Status | Notes |
| :--- | :--- | :--- |
| `prompts/templates/orchestration-document.md` exists | ✅/❌ | |
| Template includes session metadata section | ✅/❌ | |
| Template includes dependency check table | ✅/❌ | |
| Template references SSOT (not copies) | ✅/❌ | |
| Template includes failure handling matrix | ✅/❌ | |
| Template includes deliverables checklist | ✅/❌ | |

### 10.2 Planning Agent Integration Check

Verify the Planning Agent prompt is updated to create orchestration documents:

| Check | Status | Notes |
| :--- | :--- | :--- |
| `planning-agent.md` includes orchestration step | ✅/❌ | |
| Step sequence: Context Handoff → Orchestration Doc | ✅/❌ | |
| Orchestration doc references (not copies) prompts | ✅/❌ | |
| Session state tracking specified | ✅/❌ | |

### 10.3 Implementation State Machine Check

Verify `implementation-state.json` (Artifact 10) supports session tracking:

| Check | Status | Notes |
| :--- | :--- | :--- |
| Module status enum includes `pending`, `in-progress`, `review`, `complete`, `blocked` | ✅/❌ | |
| Session ID field supported | ✅/❌ | |
| Attempt counter supported | ✅/❌ | |
| Blocked reason tracking | ✅/❌ | |

### 10.4 Gate Script Check

Verify automated pre-flight gate checking exists:

| Check | Status | Notes |
| :--- | :--- | :--- |
| `scripts/gate-check.sh` exists and is executable | ✅/❌ | |
| Script checks dependency status from implementation-state.json | ✅/❌ | |
| Script verifies shared-types compile | ✅/❌ | |
| Script checks context handoff exists | ✅/❌ | |
| Script checks orchestration document exists | ✅/❌ | |
| Script outputs pass/fail with clear messaging | ✅/❌ | |

### 10.5 Agent Memory System Check

Verify session persistence for cross-session context:

| Check | Status | Notes |
| :--- | :--- | :--- |
| `prompts/agent-memory-system.md` defines memory format | ✅/❌ | |
| `agent-memory/` directory structure specified | ✅/❌ | |
| Session JSON format defined with required fields | ✅/❌ | |
| Session Markdown format defined for human readability | ✅/❌ | |
| `coding-agent.md` references agent memory system | ✅/❌ | |
| Previous attempt context available to retry sessions | ✅/❌ | |
| Memory retention policy defined | ✅/❌ | |

### 10.6 Escalation Detection Check

Verify automatic detection of spec gaps vs code bugs:

| Check | Status | Notes |
| :--- | :--- | :--- |
| `scripts/escalation-detector.sh` exists and is executable | ✅/❌ | |
| Spec gap patterns defined (ambiguity, missing types, contradictions) | ✅/❌ | |
| Code bug patterns defined (compile errors, test failures, runtime) | ✅/❌ | |
| Script outputs clear ESCALATE vs RETRY decision | ✅/❌ | |
| Exit codes documented (0=retry, 1=escalate, 2=unknown) | ✅/❌ | |
| Integration with implementation-state.json documented | ✅/❌ | |

### 10.7 Progress Dashboard Check

Verify implementation progress visualization:

| Check | Status | Notes |
| :--- | :--- | :--- |
| `scripts/progress-dashboard.sh` exists and is executable | ✅/❌ | |
| Displays per-phase breakdown | ✅/❌ | |
| Shows module status with visual indicators | ✅/❌ | |
| Displays blocked reasons when applicable | ✅/❌ | |
| Shows overall progress percentage | ✅/❌ | |
| Shows estimated remaining LoC | ✅/❌ | |

### 10.8 CI/CD Integration Check

Verify continuous integration pipeline exists:

| Check | Status | Notes |
| :--- | :--- | :--- |
| `.github/workflows/ci.yml` exists | ✅/❌ | |
| Pipeline includes lint step | ✅/❌ | |
| Pipeline includes type-check step | ✅/❌ | |
| Pipeline includes test step | ✅/❌ | |
| Pipeline includes build step | ✅/❌ | |
| Pipeline triggers on push/PR to main branches | ✅/❌ | |

### 10.9 Orchestration Workflow Score

```text
Template Completeness: [XX]%
Agent Integration: [XX]%
State Tracking: [XX]%
Gate Automation: [XX]%
Agent Memory: [XX]%
Escalation Detection: [XX]%
Progress Visibility: [XX]%
CI/CD: [XX]%
Overall Orchestration: [XX]%
```

**GATE**: If Orchestration Score < 90%, fix workflow gaps before proceeding to implementation.

---

## OUTPUT FORMAT

## Executive Summary

## Spec Pack Review Summary

## Review Metadata

- **Review Date**: [DATE]
- **Review Version**: [X.Y]
- **Spec Pack Version**: [version being reviewed]
- **Reviewer**: AI Quality Assurance Agent

## Overall Scores

| Phase | Score | Status |
| :--- | :--- | :--- |
| 1. Structural Completeness | XX% | 🟢 Pass / 🟡 Needs Work / 🔴 Fail |
| 2. Type System Integrity | XX% | 🟢 / 🟡 / 🔴 |
| 3. Interface Contracts | XX% | 🟢 / 🟡 / 🔴 |
| 4. Dependencies & Integration | XX% | 🟢 / 🟡 / 🔴 |
| 5. Implementability | XX% | 🟢 / 🟡 / 🔴 |
| 6. Test Specifications | XX% | 🟢 / 🟡 / 🔴 |
| 7. Implementation Prompts | XX% | 🟢 / 🟡 / 🔴 |
| 8. Traceability | XX% | 🟢 / 🟡 / 🔴 |
| 9. AI Readiness | XX% | 🟢 / 🟡 / 🔴 |
| 10. Orchestration Workflow | XX% | 🟢 / 🟡 / 🔴 |
| **OVERALL** | **XX%** | **STATUS** |

## Readiness Assessment

**Ready for Implementation**: ✅ Yes / ⚠️ With Caveats / ❌ No

**Blocking Issues**: [count]
**Major Issues**: [count]  
**Minor Issues**: [count]
**Suggestions**: [count]

## Issue Registry

## Blocking Issues (Must fix before implementation)

### BLOCK-001: [Title]

- **Location**: [file:line or section]
- **Description**: [what's wrong]
- **Impact**: [why it blocks implementation]
- **Remediation**: [specific fix]
- **Effort**: [Low/Medium/High]

## Major Issues (Should fix before implementation)

### MAJOR-001: [Title]

...

## Minor Issues (Fix during implementation)

### MINOR-001: [Title]

...

## Suggestions (Optional improvements)

### SUGGEST-001: [Title]

...

## Improvement Roadmap

## Iteration 1: Critical Fixes

Priority: Blocking issues
Estimated Effort: [X hours]

### Iteration 1 Tasks

1. [ ] Fix BLOCK-001: [brief description]
2. [ ] Fix BLOCK-002: [brief description]

## Iteration 2: Major Improvements

Priority: Major issues
Estimated Effort: [X hours]

### Iteration 2 Tasks

1. [ ] Fix MAJOR-001
2. [ ] Fix MAJOR-002

## Iteration 3: Polish

Priority: Minor issues + suggestions
Estimated Effort: [X hours]

## Specific Improvements EXAMPLE (Detailed)

For each issue, provide the EXACT fix:

## Detailed Fixes

## BLOCK-001: Missing StreamDescriptor Type Definition

### Current State

The `StreamDescriptor` type is referenced in `scheduler.spec.md` line 45 but not defined in `shared-types.ts`.

### Required Fix

Add to `shared-types.ts`:

```typescript
/**
 * Describes a resolved media stream ready for playback
 */
export interface StreamDescriptor {
  /** Playback URL (HLS or direct) */
  url: string;
  /** Stream protocol */
  protocol: 'hls' | 'dash' | 'direct';
  /** MIME type for the player */
  mimeType: string;
  /** Position to start playback (ms) */
  startPositionMs: number;
  /** Associated media metadata */
  mediaMetadata: MediaMetadata;
  /** Available subtitle tracks */
  subtitleTracks: SubtitleTrack[];
  /** Available audio tracks */
  audioTracks: AudioTrack[];
  /** Total duration in milliseconds */
  durationMs: number;
  /** Whether this is a live stream */
  isLive: boolean;
}
```

### Verification

After fix, grep for `StreamDescriptor` - all references should resolve.

---

## SCORING CRITERIA

## Score Thresholds

| Score | Status | Meaning |
| :--- | :--- | :--- |
| 90-100% | 🟢 Pass | Ready for implementation |
| 70-89% | 🟡 Needs Work | Implementable with noted caveats |
| 50-69% | 🟠 Significant Gaps | Needs revision before implementation |
| 0-49% | 🔴 Fail | Major rework required |

## Phase Weights for Overall Score

| Phase | Weight | Rationale |
| :--- | :--- | :--- |
| Structural Completeness | 10% | Foundation must exist |
| Type System Integrity | 16% | Types are contracts |
| Interface Contracts | 15% | Defines module boundaries |
| Dependencies & Integration | 10% | Modules must connect |
| Implementability | 12% | Must be buildable |
| Test Specifications | 5% | Verification coverage |
| Implementation Prompts | 8% | AI agent usability |
| Traceability | 4% | Requirements coverage |
| AI Readiness | 10% | Determinism for coding agents |
| **Orchestration Workflow** | **10%** | **Planning → Coding handoff** |

---

## RE-REVIEW INSTRUCTIONS

When re-running this review after improvements:

1. **Reference Previous Review**: Note which issues were addressed
2. **Verify Fixes**: Confirm each fix resolves the identified issue
3. **Check for Regressions**: Ensure fixes didn't break other parts
4. **Update Scores**: Recalculate all scores
5. **Track Progress**: Show score deltas from previous review

## Re-Review Delta

| Phase | Previous | Current | Delta |
| :--- | :--- | :--- | :--- |
| Type Integrity | 65% | 89% | +24% |
| ... | | | |

## Issues Resolved This Iteration

- ✅ BLOCK-001: Fixed by adding StreamDescriptor type
- ✅ MAJOR-003: Fixed by specifying error codes

## Issues Remaining

- ⏳ MAJOR-002: Still needs attention
- ⏳ MINOR-001: Deferred to next iteration

## New Issues Found

- 🆕 MINOR-015: [Introduced by fix to BLOCK-001]

---

## META DEVELOPMENT WORKFLOW

This review prompt is part of a multi-agent AI development workflow. Understanding the workflow context ensures consistent review practices.

### Two-Phase Workflow

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PHASE 1: SPEC GENERATION & REVIEW                      │
│                       (Loops until ≥95% on this prompt)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐          ┌──────────────┐                               │
│   │   SPEC GEN   │─────────▶│ PLAN REVIEW  │◀─────────┐                    │
│   │   AGENT      │          │   AGENT      │          │                    │
│   └──────────────┘          └──────────────┘          │                    │
│         │                         │                   │                    │
│         ▼                         ▼                   │                    │
│   spec-pack/               review-vN.md               │                    │
│   modules/*.md             issue-registry.md          │                    │
│                                   │                   │                    │
│                                   ▼                   │                    │
│                          ┌──────────────┐             │                    │
│                          │  Score < 95% │─────────────┘                    │
│                          │  or BLOCKING │   (iterate)                      │
│                          └──────────────┘                                  │
│                                   │                                        │
│                                   ▼ (Score ≥ 95%, no BLOCKING)             │
│                          ┌──────────────┐                                  │
│                          │   PHASE 1    │                                  │
│                          │   COMPLETE   │                                  │
│                          └──────────────┘                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 2: IMPLEMENTATION (per module)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐          ┌──────────────┐          ┌──────────────┐     │
│   │   PLANNING   │─────────▶│   CODING     │─────────▶│ CODE REVIEW  │     │
│   │   AGENT      │          │   AGENT      │          │   AGENT      │     │
│   └──────────────┘          └──────────────┘          └──────────────┘     │
│                                                             │              │
│                                                   ┌─────────┴─────────┐    │
│                                                   │ Code bug? → Retry │    │
│                                                   │ Spec gap? → Phase 1│   │
│                                                   └───────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Agent Execution Model

- **Separate sessions**: Each agent runs in its own context window
- **Sequential within phase**: Agents run one after another
- **Phase-based parallelism**: Multiple modules per phase if context allows
- **Spec is SSOT**: Coding Agent never modifies specs

---

## SPEC MUTATION POLICY

When this review finds issues, use the **hybrid approach**:

### Issue Resolution Process

1. **Plan Review Agent** runs this META prompt
2. **On each pass**: Create `issue-registry-vN.md` with ALL issues found
3. **Planning Agent** addresses ALL issues directly (has context from review)
4. **Plan Review Agent** runs again
5. **Repeat until score ≥ 95% AND zero BLOCKING issues**

### EXHAUSTIVE FIX REQUIREMENT (CRITICAL)

> [!CAUTION]
> **The Planning Agent MUST resolve ALL identified issues, not just blocking ones.**

**Philosophy**: The coding/implementation agent should receive specs that are 100% deterministic with zero ambiguity. Every decision should be made during planning, not deferred to implementation.

| Issue Type | Required Action | NOT Acceptable |
| :--- | :--- | :--- |
| BLOCKING | MUST fix before proceeding | ❌ "Escalate to human" |
| MAJOR | MUST fix in the same pass | ❌ "Address during implementation" |
| MINOR | MUST fix in the same pass | ❌ "Optional — can fix later" |
| SUGGESTION | SHOULD implement unless explicitly rejected | ❌ "Nice to have" |

**Rationale**:

- Minor issues left unaddressed become ambiguity for the coding agent
- Suggestions often prevent implementation drift and improve AI determinism
- "Fix later" never happens — technical debt compounds across agents

**Enforcement**:

```text
GATE: Do not proceed to implementation if ANY identified issue remains unresolved.

Exception: Only if user EXPLICITLY approves deferral with documented rationale.
```

> **Deferral Documentation**: When deferring an issue, create a `DEFERRED-001` entry in the Issue Registry with:
>
> - Rationale for deferral
> - Who approved the deferral
> - Planned resolution timeline
> - Impact assessment if not resolved

**Anti-Pattern Detection**:
Flag and reject responses that contain these patterns (and their acceptable alternatives):

| Anti-Pattern | Why It's Bad | Acceptable Alternative |
| :--- | :--- | :--- |
| "Address remaining issues during implementation" | Defers decisions to wrong phase | "All issues resolved in this pass" |
| "The coding agent can decide..." | Creates non-deterministic output | Specify the decision explicitly |
| "Left as implementation detail" | Ambiguity for coding agent | Provide explicit specification |
| "Minor fixes can be done later" | Technical debt compounds | Fix now or document waiver |
| "Suggestions are optional improvements" | Leaves gaps | Implement or explicitly reject with rationale |

### Issue Registry Format

```markdown
# Issue Registry v[N]

## Summary
- Total issues: [count]
- Blocking: [count]
- Major: [count]
- Minor: [count]

## Blocking Issues
### BLOCK-001: [Title]
- **Location**: [file:line]
- **Fix Required**: [specific action]
- **Cascading Impact**: [other affected areas]

## Major Issues
...
```

---

## FAILURE HANDLING POLICY

When Code Review Agent detects failures during Phase 2:

### Two-Tier Escalation

| Failure Type | Example | Action |
| :--- | :--- | :--- |
| **Code bug** | Test fails, type error, runtime crash | Retry Coding Agent with error log |
| **Spec gap** | Assertion impossible, ambiguous spec | Escalate to Phase 1 |

### Spec Gap Indicators

A failure is a **spec gap** (not a code bug) when:

- Test assertion requires behavior not specified in spec
- Multiple valid interpretations lead to different implementations
- Spec references type/constant not defined anywhere
- Spec contradicts itself between sections
- Recovery strategy for error case is not specified

---

## ADDITIONAL ARTIFACT REQUIREMENTS

Beyond Artifacts 1-8, the spec pack MUST include:

### Artifact 9: Context Handoff Protocol

For EACH module, provide explicit handoff documentation:

```markdown
## Module: [MODULE_NAME]

### SSOT References
| Concept | File | Lines |
| :--- | :--- | :--- |
| Interface | shared-types.ts | L45-72 |
| Requirements | module.spec.md | L123-156 |

### Active Assumptions
1. [Decision made during spec/review that coding agent MUST honor]
2. [Another decision with rationale]

### Scope Boundaries
| IN Scope | OUT of Scope |
| :--- | :--- |
| [Feature X] | [Feature Y - handled by Module Z] |

### Verification Commands
\`\`\`bash
npx tsc --noEmit
npm test -- --grep "[ModuleName]"
\`\`\`

### Rollback Procedure
1. `git checkout -- src/modules/[module-name]/`
2. Re-request implementation with updated context
```

### Artifact 10: Implementation State Machine

Track progress across separate agent sessions:

```json
{
  "version": "1.0.0",
  "lastUpdated": "[ISO timestamp]",
  "currentPhase": 2,
  "modules": {
    "plex-auth": {
      "status": "complete",
      "specVersion": "1.0.0",
      "blockedBy": [],
      "implementedBy": "coding-agent",
      "reviewedBy": "review-agent",
      "verificationPassed": true
    },
    "channel-scheduler": {
      "status": "in-progress",
      "specVersion": "1.0.0",
      "blockedBy": ["plex-library"],
      "notes": "Waiting for plex-library types"
    }
  }
}
```

**Update Protocol**:

1. Planning Agent updates status to `pending` with sequencing
2. Coding Agent updates to `in-progress` before starting
3. Coding Agent updates to `review` after implementation
4. Code Review Agent updates to `complete` or `blocked`

---

## PLANNING AGENT ROLE

The Planning Agent **operationalizes** specs — it does NOT rewrite them.

### Planning Agent Responsibilities

| Do | Don't |
| :--- | :--- |
| Create file-level task breakdown from specs | Rewrite interfaces or types |
| Generate Artifact 9 (Context Handoff) per module | Add new requirements |
| Update Artifact 10 (Implementation State) | Interpret ambiguous specs |
| Identify blocked dependencies | Change method signatures |
| **Escalate spec gaps to Phase 1** | Attempt to fix spec gaps |

### Escalation Triggers

Planning Agent MUST STOP and escalate to Phase 1 if it finds:

- Type referenced but not defined
- Behavior described ambiguously
- Contradicting requirements between sections
- Missing error handling specification
- Algorithm described in prose without pseudocode

**Escalation Flow**:

1. Planning Agent detects spec gap
2. Update `implementation-state.json` with `status: "blocked"` and `blockedReason`
3. Create escalation report in `escalations/ESCALATE-NNN.md`
4. Halt current module implementation
5. Trigger Phase 1 re-review for affected spec sections

---

## INPUT MATERIALS

### Original Architectural Plan

FOUND IN: /spec-pack

---

### Generated Spec Pack

> **Instructions**: Paste each artifact below. If an artifact is in a separate file, use the file path instead:
> `See file: spec-pack/artifact-1-dependency-graph.json`

### Artifact 1: Dependency Graph

*Paste JSON or reference file path*

### Artifact 2: Shared Types

*Paste types or reference file path*

### Artifact 3: Module Specs

*Paste each module spec or reference file paths*

### Artifact 4: Integration Contracts

*Paste contracts or reference file path*

### Artifact 5: Configuration

*Paste config or reference file path*

### Artifact 6: File Manifest

*Paste manifest or reference file path*

### Artifact 7: Implementation Prompts

*Paste prompts or reference file path*

### Artifact 8: Verification Checklist

*Paste checklist or reference file path*

---

## BEGIN REVIEW

Execute all phases in order. Be thorough but concise. Prioritize actionability over verbosity.

---

## Usage Instructions

### First Review

1. **Gather Materials**:
   - Original architectural plan
   - All generated spec pack artifacts

2. **Create Review Document**:

   ```text
   reviews/
   ├── review-v1.md          # First review
   ├── review-v2.md          # After fixes
   └── review-final.md       # Final sign-off
   ```

3. **Run the Review**:
   - Paste the prompt with all materials into your AI IDE
   - Save the output as `review-v1.md`

4. **Process Results**:
   - Create issues/tasks for each finding
   - Prioritize based on blocking/major/minor
   - Assign to fix iterations

### Subsequent Reviews

1. **Apply Fixes** to the spec pack based on review findings

2. **Re-run Review** with updated spec pack

3. **Track Progress**:

   ```markdown
   ## Review History
   
   | Version | Date | Overall Score | Blocking | Major | Minor |
   | :--- | :--- | :--- | :--- | :--- | :--- |
   | v1 | 2024-01-15 | 62% | 5 | 12 | 23 |
   | v2 | 2024-01-16 | 78% | 0 | 8 | 19 |
   | v3 | 2024-01-17 | 91% | 0 | 2 | 15 |
   ```

4. **Sign Off** when overall score ≥90% and no blocking issues

---

## Quick Reference: Review Phases

| Phase | Focus | Key Questions |
| :--- | :--- | :--- |
| 1 | Structure | Do all required artifacts exist? |
| 2 | Types | Are types complete and consistent? |
| 3 | Interfaces | Are module APIs fully specified? |
| 4 | Dependencies | Do modules connect correctly? |
| 5 | Implementability | Can an AI actually build this? |
| 6 | Tests | Is verification specified? |
| 7 | Prompts | Are agent prompts self-contained? |
| 8 | Traceability | Does spec match original plan? |

---

## Automation Tips

### Create a Review Script

```bash
#!/bin/bash
# review-spec-pack.sh

REVIEW_NUM=${1:-1}
OUTPUT_DIR="reviews"
TIMESTAMP=$(date +%Y%m%d_%H%M)

mkdir -p $OUTPUT_DIR

# Concatenate all spec files for review
cat specs/dependency-graph.json > /tmp/spec-pack.txt
echo "---" >> /tmp/spec-pack.txt
cat specs/shared-types.ts >> /tmp/spec-pack.txt
echo "---" >> /tmp/spec-pack.txt
cat specs/modules/*.spec.md >> /tmp/spec-pack.txt
# ... etc

echo "Spec pack prepared at /tmp/spec-pack.txt"
echo "Run review and save to: $OUTPUT_DIR/review-v${REVIEW_NUM}-${TIMESTAMP}.md"
```

### Track Issues in Code

```typescript
// In your spec files, mark issues for tracking:

/**
 * @issue MAJOR-002 Error handling not specified
 * @see review-v1.md
 */
interface IPlexAuth {
  // ...
}
```

### Generate Review Summary

```bash
#!/bin/bash
# Extract issue counts from a review Markdown file

REVIEW_FILE="${1:-reviews/review-v1.md}"

echo "=== Review Summary ==="
echo "BLOCKING: $(grep -c '^### BLOCK-' "$REVIEW_FILE" 2>/dev/null || echo 0)"
echo "MAJOR:    $(grep -c '^### MAJOR-' "$REVIEW_FILE" 2>/dev/null || echo 0)"
echo "MINOR:    $(grep -c '^### MINOR-' "$REVIEW_FILE" 2>/dev/null || echo 0)"
echo "SUGGEST:  $(grep -c '^### SUGGEST-' "$REVIEW_FILE" 2>/dev/null || echo 0)"
```
