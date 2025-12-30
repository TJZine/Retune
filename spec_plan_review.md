## The Review Prompt

# ROLE & OBJECTIVE

You are a Senior Technical Reviewer and Quality Assurance Architect specializing in implementation specifications for AI coding agents. Your task is to perform a comprehensive review of a generated Spec Pack, identify gaps and inconsistencies, and provide specific, actionable improvements.

Your review must be:
- **Systematic**: Follow the same process every time
- **Quantifiable**: Provide scores and metrics where possible
- **Actionable**: Every issue must have a specific remediation
- **Prioritized**: Issues ranked by implementation impact
- **Repeatable**: Same inputs should yield consistent findings

---

# INPUT

You will receive:
1. **Original Architectural Plan**: The source document the specs were derived from
2. **Generated Spec Pack**: The artifacts produced by the specification generator

---

# REVIEW PROCESS

Execute the following review phases IN ORDER. Do not skip phases.

---

## PHASE 1: Structural Completeness Audit

### 1.1 Artifact Inventory

Check that ALL required artifacts exist:

```markdown
| Artifact | Status | Notes |
|----------|--------|-------|
| Dependency Graph (JSON) | ✅ Present / ❌ Missing / ⚠️ Incomplete | |
| Shared Types Package | ✅ / ❌ / ⚠️ | |
| Module Specs (list each) | ✅ / ❌ / ⚠️ | |
| Integration Contracts | ✅ / ❌ / ⚠️ | |
| Configuration Spec | ✅ / ❌ / ⚠️ | |
| File Manifest | ✅ / ❌ / ⚠️ | |
| Implementation Prompts | ✅ / ❌ / ⚠️ | |
| Verification Checklist | ✅ / ❌ / ⚠️ | |
```

### 1.2 Module Coverage Check

For EACH module mentioned in the architectural plan:

```markdown
| Module | Has Spec | Has Types | Has Tests | Has Prompt | Has Contract |
|--------|----------|-----------|-----------|------------|--------------|
| [name] | ✅/❌ | ✅/❌ | ✅/❌ | ✅/❌ | ✅/❌ |
```

### 1.3 Structural Completeness Score

Calculate: `(Present Items / Required Items) × 100`

```
Structural Completeness: [XX]%
```

**GATE**: If Structural Completeness < 80%, STOP and list missing items before continuing.

---

## PHASE 2: Type System Integrity

### 2.1 Type Definition Audit

For the Shared Types Package, verify:

```markdown
### Type Coverage
| Domain | Types Defined | Types Referenced in Specs | Missing |
|--------|---------------|---------------------------|---------|
| Plex | X | Y | [list] |
| Channel | X | Y | [list] |
| Schedule | X | Y | [list] |
| Player | X | Y | [list] |
| UI/EPG | X | Y | [list] |
| Navigation | X | Y | [list] |
| Lifecycle | X | Y | [list] |
```

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
|----------|-----------|------------|------------|-------------|-----------------|
| T001 | | | | | |

### 2.3 Type Completeness Check

For each interface method, verify:
- All parameter types are defined
- All return types are defined
- All thrown error types are defined
- Generic constraints are specified where needed

### Undefined Type References
| Location | Reference | Context | Recommended Definition |
|----------|-----------|---------|----------------------|
| ModuleX.spec.md:45 | `StreamOptions` | Parameter type | Add to shared types |

### 2.4 Type System Score

```
Type Coverage: [XX]%
Type Consistency: [XX]%
Overall Type Integrity: [XX]%
```

---

## PHASE 3: Interface Contract Validation

### 3.1 Interface Completeness

For EACH module interface, verify it includes:

| Module | All Methods | All Parameters | All Returns | All Errors | Events | Score |
|--------|-------------|----------------|-------------|------------|--------|-------|
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
|--------|--------|------------------|----------|
| | | | High/Med/Low |

### 3.3 Async/Sync Consistency

Verify Promise usage is consistent and intentional:

### Async Pattern Issues
| Module | Method | Current | Expected | Rationale |
|--------|--------|---------|----------|-----------|
| | `methodX` | sync | async | Involves I/O |

### 3.4 Interface Contract Score

```
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
|--------|----------------------|-------------------|-------------------|
| | | | |


### 4.2 Circular Dependency Check

Analyze for circular dependencies:

### Circular Dependencies Found
| Cycle | Modules Involved | Recommended Resolution |
|-------|------------------|----------------------|
| C001 | A → B → C → A | [specific fix] |


### 4.3 Integration Contract Coverage

For each module pair that communicates:

| Module A | Module B | Has Contract | Contract Complete | Issues |
|----------|----------|--------------|-------------------|--------|
| Scheduler | VideoPlayer | ✅/❌ | ✅/⚠️/❌ | |

### 4.4 Event Flow Validation

Map all events and verify handlers exist:

### Event Flow Map
| Event | Emitter | Expected Consumers | Contract Exists | Handler Specified |
|-------|---------|-------------------|-----------------|-------------------|
| `programStart` | Scheduler | VideoPlayer, EPG | ✅/❌ | ✅/❌ |

### 4.5 Integration Score

```
Dependency Accuracy: [XX]%
Contract Coverage: [XX]%
Event Flow Clarity: [XX]%
```

---

## PHASE 5: Implementability Assessment

### 5.1 Ambiguity Detection

Scan specs for ambiguous language and unclear requirements:

**Ambiguity Markers** (flag these phrases):
- "should probably"
- "might need to"
- "as appropriate"
- "etc."
- "and so on"
- "similar to"
- "something like"
- "TBD"
- "TODO"
- "to be determined"
- "implementation detail"
- "left as exercise"

### Ambiguities Found
| ID | Location | Ambiguous Text | Impact | Clarification Needed |
|----|----------|----------------|--------|---------------------|
| A001 | scheduler.spec.md:123 | "handle edge cases appropriately" | High | List specific edge cases |


### 5.2 Missing Algorithm Specifications

For complex logic, verify algorithm is specified:

### Algorithm Specification Check
| Module | Algorithm/Logic | Pseudocode Provided | Edge Cases Listed | Complexity Noted |
|--------|-----------------|---------------------|-------------------|------------------|
| Scheduler | Time-based lookup | ✅/❌ | ✅/❌ | ✅/❌ |
| Scheduler | Deterministic shuffle | ✅/❌ | ✅/❌ | ✅/❌ |
| EPG | Virtualization | ✅/❌ | ✅/❌ | ✅/❌ |


### 5.3 Platform Constraint Coverage

Verify webOS-specific constraints are addressed in relevant specs:

### Platform Constraint Checklist
| Constraint | Addressed In | How Addressed | Adequate |
|------------|--------------|---------------|----------|
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
|--------|-----------|------------|-----------|-------------------|
| PlexAuth | validateToken | Network timeout | ✅/❌ | ✅/❌ |
| PlexAuth | validateToken | Token expired | ✅/❌ | ✅/❌ |
| VideoPlayer | loadStream | 404 | ✅/❌ | ✅/❌ |
| VideoPlayer | loadStream | Codec unsupported | ✅/❌ | ✅/❌ |


### 5.5 Implementability Score

```
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
|--------|------------|-------------------|-----------------|------------|-------|
| | Count: X | Count: Y | Count: Z | ✅/❌ | |


### 6.2 Test Case Quality

For each test case specified, verify:
- Clear description of what's being tested
- Setup/preconditions stated
- Expected outcome explicit
- Edge cases included

n
### Weak Test Specifications
| Module | Test | Issue | Improvement |
|--------|------|-------|-------------|
| | | "Too vague" / "No assertion" / "Missing edge case" | |


### 6.3 Test Score

```
Test Coverage: [XX]%
Test Specificity: [XX]%
```

---

## PHASE 7: Implementation Prompt Quality

### 7.1 Prompt Self-Containment Check

Each implementation prompt should work WITHOUT referencing other files:


### Prompt Self-Containment Audit
| Module Prompt | Has Context | Has Interface | Has Types | Has Tests | Has Constraints | Score |
|---------------|-------------|---------------|-----------|-----------|-----------------|-------|
| plex-auth.prompt.md | ✅/❌ | ✅/❌ | ✅/❌ | ✅/❌ | ✅/❌ | X/5 |


### 7.2 Prompt Clarity Check

Verify prompts are unambiguous:


### Prompt Issues
| Prompt | Issue Type | Specific Problem | Fix |
|--------|------------|------------------|-----|
| | Missing constraint | No memory limit mentioned | Add constraint |
| | Ambiguous output | "Return appropriate error" | Specify error type |


### 7.3 Prompt Score

```
Self-Containment: [XX]%
Clarity: [XX]%
```

---

## PHASE 8: Cross-Reference Validation

### 8.1 Architectural Plan Traceability

Every requirement in the original plan should map to a spec:

### Requirements Traceability
| Original Plan Section | Requirement | Mapped To | Coverage |
|-----------------------|-------------|-----------|----------|
| 2.1.2 Constraints | "API rate limits: ~100 req/min" | plex.spec.md | ✅/⚠️/❌ |
| 2.3.2 Constraints | "Calculate in <50ms" | scheduler.spec.md | ✅/⚠️/❌ |


### 8.2 Orphaned Specifications

Check for specs that don't trace to original requirements (scope creep):

### Potentially Orphaned Specs
| Spec Location | Specification | Original Plan Reference | Action |
|---------------|---------------|------------------------|--------|
| | | None found | Verify intentional / Remove |


### 8.3 Traceability Score

```
Forward Traceability (Plan → Spec): [XX]%
Backward Traceability (Spec → Plan): [XX]%
```

---

# OUTPUT FORMAT

## Executive Summary

# Spec Pack Review Summary

## Review Metadata
- **Review Date**: [DATE]
- **Review Version**: [X.Y]
- **Spec Pack Version**: [version being reviewed]
- **Reviewer**: AI Quality Assurance Agent

## Overall Scores

| Phase | Score | Status |
|-------|-------|--------|
| 1. Structural Completeness | XX% | 🟢 Pass / 🟡 Needs Work / 🔴 Fail |
| 2. Type System Integrity | XX% | 🟢 / 🟡 / 🔴 |
| 3. Interface Contracts | XX% | 🟢 / 🟡 / 🔴 |
| 4. Dependencies & Integration | XX% | 🟢 / 🟡 / 🔴 |
| 5. Implementability | XX% | 🟢 / 🟡 / 🔴 |
| 6. Test Specifications | XX% | 🟢 / 🟡 / 🔴 |
| 7. Implementation Prompts | XX% | 🟢 / 🟡 / 🔴 |
| 8. Traceability | XX% | 🟢 / 🟡 / 🔴 |
| **OVERALL** | **XX%** | **STATUS** |

## Readiness Assessment

**Ready for Implementation**: ✅ Yes / ⚠️ With Caveats / ❌ No

**Blocking Issues**: [count]
**Major Issues**: [count]  
**Minor Issues**: [count]
**Suggestions**: [count]

## Issue Registry

# Issue Registry

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

### Tasks:
1. [ ] Fix BLOCK-001: [brief description]
2. [ ] Fix BLOCK-002: [brief description]

## Iteration 2: Major Improvements  
Priority: Major issues
Estimated Effort: [X hours]

### Tasks:
1. [ ] Fix MAJOR-001
2. [ ] Fix MAJOR-002

## Iteration 3: Polish
Priority: Minor issues + suggestions
Estimated Effort: [X hours]

## Specific Improvements (Detailed)

For each issue, provide the EXACT fix:

# Detailed Fixes

## BLOCK-001: Missing StreamDescriptor Type Definition

### Current State:
The `StreamDescriptor` type is referenced in `scheduler.spec.md` line 45 but not defined in `shared-types.ts`.

### Required Fix:

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

### Verification:
After fix, grep for `StreamDescriptor` - all references should resolve.

---

# SCORING CRITERIA

## Score Thresholds

| Score | Status | Meaning |
|-------|--------|---------|
| 90-100% | 🟢 Pass | Ready for implementation |
| 70-89% | 🟡 Needs Work | Implementable with noted caveats |
| 50-69% | 🟠 Significant Gaps | Needs revision before implementation |
| 0-49% | 🔴 Fail | Major rework required |

## Phase Weights for Overall Score

| Phase | Weight | Rationale |
|-------|--------|-----------|
| Structural Completeness | 15% | Foundation must exist |
| Type System Integrity | 20% | Types are contracts |
| Interface Contracts | 20% | Defines module boundaries |
| Dependencies & Integration | 15% | Modules must connect |
| Implementability | 15% | Must be buildable |
| Test Specifications | 5% | Verification coverage |
| Implementation Prompts | 5% | AI agent usability |
| Traceability | 5% | Requirements coverage |

---

# RE-REVIEW INSTRUCTIONS

When re-running this review after improvements:

1. **Reference Previous Review**: Note which issues were addressed
2. **Verify Fixes**: Confirm each fix resolves the identified issue
3. **Check for Regressions**: Ensure fixes didn't break other parts
4. **Update Scores**: Recalculate all scores
5. **Track Progress**: Show score deltas from previous review

## Re-Review Delta

| Phase | Previous | Current | Delta |
|-------|----------|---------|-------|
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

# INPUT MATERIALS

## Original Architectural Plan:

 FOUND IN: /spec-pack

---

## Generated Spec Pack:

### Artifact 1: Dependency Graph
[PASTE JSON HERE]

### Artifact 2: Shared Types
[PASTE TYPES HERE]

### Artifact 3: Module Specs
[PASTE EACH MODULE SPEC]

### Artifact 4: Integration Contracts
[PASTE CONTRACTS]

### Artifact 5: Configuration
[PASTE CONFIG]

### Artifact 6: File Manifest
[PASTE MANIFEST]

### Artifact 7: Implementation Prompts
[PASTE PROMPTS]

### Artifact 8: Verification Checklist
[PASTE CHECKLIST]

---

# BEGIN REVIEW

Execute all phases in order. Be thorough but concise. Prioritize actionability over verbosity.


---

## Usage Instructions

### First Review

1. **Gather Materials**:
   - Original architectural plan
   - All generated spec pack artifacts

2. **Create Review Document**:
   ```
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
   # Review History
   
   | Version | Date | Overall Score | Blocking | Major | Minor |
   |---------|------|---------------|----------|-------|-------|
   | v1 | 2024-01-15 | 62% | 5 | 12 | 23 |
   | v2 | 2024-01-16 | 78% | 0 | 8 | 19 |
   | v3 | 2024-01-17 | 91% | 0 | 2 | 15 |
   ```

4. **Sign Off** when overall score ≥90% and no blocking issues

---

## Quick Reference: Review Phases

| Phase | Focus | Key Questions |
|-------|-------|---------------|
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
