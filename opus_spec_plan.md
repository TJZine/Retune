# ROLE & OBJECTIVE

You are a Senior Software Architect specializing in creating implementation specifications optimized for AI coding agents. Your task is to transform a detailed architectural plan into a structured, machine-parseable specification pack that enables autonomous AI agents to implement each module independently with minimal ambiguity.

# INPUT CONTEXT

I will provide you with a detailed architectural plan for a webOS application called [Retune] that creates virtual TV channels from Plex media libraries. The plan contains:
- Module overviews and responsibilities
- TypeScript type definitions
- Interface contracts
- State machines
- UI specifications
- Platform constraints

# OUTPUT REQUIREMENTS

Generate a complete **Implementation Spec Pack** consisting of the following artifacts:

---

## ARTIFACT 1: Module Dependency Graph (JSON)

Create a machine-readable dependency graph showing:
- All modules and their IDs
- Dependencies between modules (which modules must exist before others)
- Shared types/interfaces between modules
- Implementation priority order

```json
{
  "modules": [
    {
      "id": "module-id",
      "name": "Human Readable Name",
      "path": "src/modules/path",
      "dependsOn": ["other-module-id"],
      "provides": ["InterfaceName", "TypeName"],
      "consumes": ["ExternalInterface"],
      "priority": 1,
      "estimatedComplexity": "low|medium|high",
      "parallelizable": true
    }
  ],
  "implementationPhases": [
    {
      "phase": 1,
      "name": "Core Infrastructure",
      "modules": ["module-id-1", "module-id-2"],
      "milestone": "Description of what's working after this phase"
    }
  ]
}
```

---

## ARTIFACT 2: Shared Types Package (TypeScript)

Create a single `types.ts` file containing ALL shared types, interfaces, and enums used across modules. This becomes the "contract" that all modules implement against.

Requirements:
- Group types by domain (Plex, Channel, Schedule, UI, etc.)
- Include JSDoc comments explaining each type's purpose
- Mark optional vs required fields explicitly
- Include validation constraints as comments
- No implementation code, only type definitions

```typescript
// Example structure:
/**
 * @module SharedTypes
 * @description Central type definitions for [APP_NAME]
 * @version 1.0.0
 */

// ============================================
// DOMAIN: Plex Integration
// ============================================

/** Represents an authenticated Plex user session */
export interface PlexAuthToken {
  /** The OAuth token for API requests */
  token: string;
  /** Plex user ID */
  userId: string;
  // ... etc
}
```

---

## ARTIFACT 3: Module Implementation Specs (One per module)

For EACH module, create a detailed implementation spec in the following format:

```markdown
# Module: [MODULE_NAME]

## Metadata
- **ID**: `module-id`
- **Path**: `src/modules/[path]/`
- **Primary File**: `[ModuleName].ts`
- **Test File**: `[ModuleName].test.ts`
- **Dependencies**: [list of module IDs]
- **Complexity**: low | medium | high
- **Estimated LoC**: [number]

## Purpose
[2-3 sentences describing what this module does and why it exists]

## Public Interface

```typescript
// The exact interface this module MUST export
export interface I[ModuleName] {
  methodName(param: ParamType): ReturnType;
}
```

## Required Exports

```typescript
// List every export this module must provide
export { ModuleClass } from './ModuleClass';
export { helperFunction } from './helpers';
export type { PublicType } from './types';
```

## Implementation Requirements

### MUST Implement:
1. [Specific requirement with acceptance criteria]
2. [Another requirement]

### MUST NOT:
1. [Anti-pattern to avoid]
2. [Another thing not to do]

### State Management:
- Internal state shape: `{ ... }`
- State persistence: localStorage | memory | none
- State initialization: [describe]

### Error Handling:
- Expected errors: [list with error codes]
- Recovery strategies: [describe]
- Error propagation: throw | return Result<T> | emit event

## Method Specifications

### `methodName(param: ParamType): ReturnType`

**Purpose**: [What this method does]

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| param | ParamType | Yes | Description |

**Returns**: `ReturnType` - Description of return value

**Throws**: 
- `ErrorType` when [condition]

**Side Effects**:
- [List any side effects]

**Implementation Notes**:
```typescript
// Pseudocode or algorithm description
1. Validate input
2. Do thing
3. Return result
```

**Example Usage**:
```typescript
const result = module.methodName({ foo: 'bar' });
```

## Internal Architecture

### Private Methods:
- `_helperMethod()`: [purpose]

### Class Diagram:
```
┌─────────────────────┐
│   ModuleClass       │
├─────────────────────┤
│ - privateState      │
│ - config            │
├─────────────────────┤
│ + publicMethod()    │
│ - privateHelper()   │
└─────────────────────┘
```

## Events Emitted

| Event Name | Payload Type | When Emitted |
|------------|--------------|--------------|
| `eventName` | `PayloadType` | Description |

## Events Consumed

| Event Name | Source Module | Handler Behavior |
|------------|---------------|------------------|
| `eventName` | `source-module` | What to do |

## Test Specification

### Unit Tests Required:

```typescript
describe('[ModuleName]', () => {
  describe('methodName', () => {
    it('should [expected behavior] when [condition]', () => {
      // Test implementation hint
    });
    
    it('should throw [ErrorType] when [invalid condition]', () => {
      // Test implementation hint
    });
  });
});
```

### Integration Tests Required:
- Test with [other module]: [scenario]

### Mock Requirements:
When testing this module, mock:
- `IDependency` with: `{ method: jest.fn() }`

## File Structure

```
src/modules/[module-name]/
├── index.ts              # Public exports
├── [ModuleName].ts       # Main class implementation
├── types.ts              # Module-specific types (if any)
├── helpers.ts            # Pure helper functions
├── constants.ts          # Module constants
└── __tests__/
    ├── [ModuleName].test.ts
    └── helpers.test.ts
```

## Implementation Checklist

- [ ] Create file structure
- [ ] Implement interface methods
- [ ] Add error handling
- [ ] Write unit tests
- [ ] Add JSDoc comments
- [ ] Verify against acceptance criteria

## Acceptance Criteria

This module is COMPLETE when:
1. [ ] All interface methods are implemented
2. [ ] All unit tests pass
3. [ ] No TypeScript errors
4. [ ] Integrates with [dependent modules] without errors
5. [ ] [Specific behavioral criteria]


---

## ARTIFACT 4: Integration Contract Specs

Define how modules communicate with each other:


# Integration Contract: [Module A] ↔ [Module B]

## Contract ID: `integration-a-b`

## Direction: A → B (A calls B)

## Interaction Pattern: 
- [ ] Direct method call
- [ ] Event-based
- [ ] Callback registration

## Contract Definition:

### A expects B to:
```typescript
interface ExpectedFromB {
  methodX(input: TypeA): Promise<TypeB>;
}
```

### B guarantees:
- Response time: < 100ms
- Idempotent: yes/no
- Thread-safe: yes/no

## Error Contract:
- If B fails, A should: [behavior]
- Retry policy: [describe]

## Sequence Diagram:
```
A                    B
│                    │
│──── methodX() ────>│
│                    │
│<─── result ────────│
│                    │
```


---

## ARTIFACT 5: Configuration & Constants Spec

```typescript
// src/config/index.ts

export const APP_CONFIG = {
  // All magic numbers and configurable values
  // with explanatory comments
} as const;

export const FEATURE_FLAGS = {
  // Feature toggles for development
} as const;
```

---

## ARTIFACT 6: File Manifest

Complete list of every file to be created:

```json
{
  "files": [
    {
      "path": "src/modules/plex/PlexAuth.ts",
      "module": "plex-auth",
      "type": "implementation",
      "description": "Plex OAuth authentication handler"
    }
  ],
  "directories": [
    {
      "path": "src/modules/plex",
      "purpose": "Plex API integration module"
    }
  ]
}
```

---

## ARTIFACT 7: Implementation Prompts

For each module, generate a self-contained prompt that an AI agent can use to implement JUST that module:

# Implementation Prompt: [Module Name]

## Context
You are implementing the [ModuleName] module for [APP_NAME], a webOS application.

## Your Task
Implement the following interface in TypeScript:

```typescript
[paste interface here]
```

## Constraints
- Target: webOS 4.0+ (Chromium 68)
- No external dependencies except: [list]
- Must handle: [specific edge cases]

## Types Available
```typescript
[paste relevant shared types]
```

## Implementation Requirements
[paste from module spec]

## Test Cases to Satisfy
```typescript
[paste test specs]
```

## Output Format
Provide complete, production-ready TypeScript code with:
1. Full implementation
2. JSDoc comments
3. Error handling
4. No TODOs or placeholders


---

## ARTIFACT 8: Verification Checklist

A checklist for validating the complete implementation:

# Implementation Verification Checklist

## Phase 1: Core Infrastructure
- [ ] All shared types compile without errors
- [ ] Event system can emit and receive events
- [ ] State persistence works in webOS environment

## Phase 2: [Next Phase]
...

## Integration Verification
- [ ] Module A correctly calls Module B
- [ ] Events flow as specified
- [ ] Error propagation works end-to-end

## Platform Verification
- [ ] Runs on webOS 4.0 emulator
- [ ] Memory usage under 200MB after 1 hour
- [ ] No console errors during normal operation


---

# PROCESSING INSTRUCTIONS

1. **Read the entire architectural plan first** before generating any artifacts
2. **Extract all implicit dependencies** - if Module A uses a type defined for Module B, note this
3. **Resolve ambiguities conservatively** - when the plan is unclear, choose the simpler approach and note the assumption
4. **Ensure interface consistency** - if the plan shows slightly different signatures in different places, reconcile them
5. **Add missing error cases** - the plan may not enumerate all errors; add obvious ones
6. **Generate realistic test cases** - based on the requirements, create meaningful test scenarios
7. **Order modules for implementation** - consider dependencies but also developer experience (start with something that shows visible progress)

# OUTPUT FORMAT

Provide each artifact in a separate clearly-marked section. Use code blocks with appropriate language tags. For JSON, ensure it's valid and parseable.

Begin with ARTIFACT 1 (Dependency Graph) and proceed in order.

---

# SOURCE PLAN

./initial_plan.md


---

# ADDITIONAL REQUIREMENTS

## Code Style
- Use explicit return types on all functions
- Prefer `const` over `let`
- Use early returns for validation
- Maximum function length: 50 lines
- Maximum file length: 300 lines

## Naming Conventions
- Interfaces: `I` prefix (e.g., `IPlexAuth`)
- Types: PascalCase, no prefix
- Private methods: `_` prefix
- Constants: SCREAMING_SNAKE_CASE
- Files: kebab-case for directories, PascalCase for classes

## Documentation
- Every public method needs JSDoc with @param, @returns, @throws
- Every file needs a header comment explaining its purpose
- Complex algorithms need inline comments

## Error Handling Pattern
Use Result type pattern:
```typescript
type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };
```

---

## How to Use This Prompt

### Step 1: Prepare Your Input
Copy the entire architectural plan (sections 1-2.8 plus any additional content) into the `[PASTE THE COMPLETE ARCHITECTURAL PLAN HERE]` section.

### Step 2: Customize the Prompt
- Replace `[APP_NAME]` with your chosen name (e.g., "PlexFlow", "ChannelDrift")
- Adjust any specific requirements for your environment

### Step 3: Run in IDE
In Cursor, Windsurf, or similar AI-enabled IDE:
1. Create a new file called `GENERATE_SPECS.md`
2. Paste the full prompt with your architectural plan
3. Send to Claude Opus 4.5 with high token limit (this will generate a lot of output)
4. Expect ~15,000-25,000 tokens of output

### Step 4: Organize Output
The AI will generate all artifacts. Save each to appropriate locations:
```
specs/
├── dependency-graph.json
├── shared-types.ts
├── modules/
│   ├── plex-auth.spec.md
│   ├── plex-library.spec.md
│   ├── channel-manager.spec.md
│   ├── channel-scheduler.spec.md
│   ├── video-player.spec.md
│   ├── epg-ui.spec.md
│   ├── navigation.spec.md
│   └── app-lifecycle.spec.md
├── integrations/
│   ├── scheduler-player.contract.md
│   └── ... 
├── implementation-prompts/
│   ├── plex-auth.prompt.md
│   └── ...
├── config.ts
├── file-manifest.json
└── verification-checklist.md
```

### Step 5: Implement Module-by-Module
For each module implementation:
1. Open the module's `.spec.md` file
2. Open the corresponding `.prompt.md` file  
3. Give the prompt to your AI agent
4. Review and integrate the output
5. Run tests specified in the spec
6. Check off the verification items

---
