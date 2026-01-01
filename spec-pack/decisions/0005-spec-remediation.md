# ADR 0005: Spec Pack Remediation Decisions

## Date

2026-01-01

## Status

Accepted

## Context

The spec pack was reviewed for 100% AI-implementation readiness per `opus_spec_plan.md`. Several gaps were identified in `SPEC_PACK_READINESS_REVIEW.md`:

1. Artifact numbering collision (artifact-11-error-messages.ts vs Agent Memory Template)
2. Types-only violation in shared-types.ts
3. Dual error taxonomy (AppErrorCode vs AppErrorType)
4. Missing module interfaces in shared types
5. Missing event-emitter module spec
6. Monolithic context handoff document

## Decisions

### Decision 1: Error Model Canonicalization

**Chosen**: `AppErrorCode` as the single canonical error taxonomy.

**Rationale**:

- `AppErrorCode` is an enum with clear, categorical error codes
- Already used in error-messages.ts for user-facing strings
- Easier to switch/match on enum values
- Has comprehensive coverage of all error domains

**Alternatives considered**:

- `AppErrorType` — older, less comprehensive type alias
- Merge both — would create redundancy and confusion

**Migration**: `AppErrorType` is marked `@deprecated` with guidance to use `AppErrorCode`.

---

### Decision 2: Types-Only Compliance Approach

**Chosen**: Remove implementations from shared-types.ts, preserve as examples in module specs.

**Rationale**:

- `opus_spec_plan.md` requires "no implementation code, only type definitions"
- Reference implementations are valuable for coding agents
- Module specs are the right place for implementation examples

**Actions taken**:

- `TypedEventEmitter` class → removed, preserved in `modules/event-emitter.md`
- `AppError` class → converted to interface
- `getMimeType()` function → removed, documented as reference implementation note

---

### Decision 3: Artifact Numbering Resolution

**Chosen**: Create `supplements/` directory for non-required artifacts.

**Rationale**:

- `opus_spec_plan.md` defines Artifact 11 as "Agent Memory Template"
- `artifact-11-error-messages.ts` is valuable but supplemental
- Clear separation prevents confusion

**Actions taken**:

- Created `spec-pack/artifact-11-agent-memory-template.md`
- Moved `artifact-11-error-messages.ts` → `supplements/error-messages.ts`
- Created `INDEX.md` mapping all artifacts

---

### Decision 4: Context Handoff Format

**Chosen**: Per-module handoff files in `context-handoff/` directory.

**Rationale**:

- `opus_spec_plan.md` specifies "For EACH module, create a context handoff document"
- Per-module files are easier to maintain and reference
- Avoids monolithic document that's hard to navigate

**Actions taken**:

- Created `spec-pack/context-handoff/` directory
- Created 12 per-module handoff files
- Each file includes SSOT references with section anchors

---

### Decision 5: Lifecycle Error Type

**Chosen**: Create `LifecycleAppError` interface for lifecycle-specific errors (still using `AppErrorCode`).

**Rationale**:

- The lifecycle module needs additional fields (`userMessage`, `actions`, `timestamp`)
- These are UI-specific concerns not needed in the base `AppError` interface
- Prevents polluting the simple error interface used by other modules

**Result**: Two error interfaces coexist, but both use the same canonical taxonomy:

- `AppError` — simple structure for most modules (`code`, `message`, `recoverable`, `context`)
- `LifecycleAppError` — extended structure for lifecycle/UI (`code`, `message`, `recoverable`, `userMessage`, `actions`, etc.)

## Consequences

### Positive

- Clear, single error taxonomy for new code
- Types-only compliance enables better tooling/analysis
- Per-module handoffs improve agent autonomy
- INDEX.md provides clear artifact map

### Negative

- Minor complexity with two error interfaces (AppError vs LifecycleAppError)
- Deprecation of AppErrorType may require updates in future module specs

### Risks

- None identified — all changes are backwards compatible within spec pack

---

### Decision 6: Tooling Story Alignment

**Chosen**: Vite for development, esbuild for production builds.

**Rationale**:

- `dev-workflow.md` documents Vite dev server (port 5173, HMR)
- Spec pack file manifest references esbuild build script
- Both approaches are complementary, not conflicting

**Canonical configuration**:

- **Development**: `npm run dev` → Vite dev server
- **Production**: `npm run build` → esbuild bundler (see `artifact-6-file-manifest.json`)
- **Package**: `ares-package dist/` → webOS IPK

**Verification commands**:

```bash
# Development
npm run dev           # Vite HMR at localhost:5173

# Production
npm run build         # esbuild bundle to dist/

# Type check
npx tsc --noEmit

# Lint
npm run lint
```

This tooling split provides:

- Fast iteration during development (Vite's native ESM + HMR)
- Minimal bundle size for production (esbuild's aggressive tree-shaking)
- Consistent with webOS SDK packaging workflow
