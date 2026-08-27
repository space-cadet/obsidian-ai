# T46 Architecture Review Findings

**Date**: 2026-08-27
**Branch**: `feat/t46-architecture-decomposition`
**Reviewer**: Cloudy

## Summary

All 359 tests pass. The refactoring is architecturally sound and ready to merge. The extraction into handler classes is clean, pagination is consistent, and `ChatTurnCoordinator` is properly isolated.

## Issues Flagged

### 1. ToolExecutor Constructor Verbosity (Cosmetic)
~100 lines of inline arrow functions mapping tool names to handler methods. Consider a declarative map for readability.

**Location**: `src/agent/ToolExecutor.ts` lines ~85-185

### 2. `__ambiguous` Property Mutation (Code Smell)
```typescript
(resolved as any).__ambiguous = ambiguous;
```
Mutates `TFile` objects with custom properties. Better to return a wrapper object or compute ambiguity at call site.

**Location**: `src/agent/tools/ToolResolver.ts`

### 3. Signal Check Order (Micro-optimization)
Abort signal is checked after registry lookup. Move signal check to top of `execute()`.

**Location**: `src/agent/ToolExecutor.ts` `execute()` method

### 4. Pagination State is Per-Message (Design Note)
New `ToolExecutor` = new `ContinuationStore` per message. Pagination works within a turn but resets on new messages. This is likely intentional but should be documented.

### 5. Type Safety Gaps
- `any` casts for `__ambiguous` property
- `any` casts for PDF settings access
- Could be tightened with proper types

## Recommendations

1. **Merge the branch** — none of these issues are blockers
2. **Address signal check order** in a follow-up (1-line change)
3. **Refactor `__ambiguous`** when touching `ToolResolver` next
4. **Document pagination behavior** in handler docs

## Readiness for Memory Architecture Work

The extraction sets up the codebase well:
- `MemoryHandlers` is already isolated and paginated
- `ToolHandlerContext` provides clean dependency injection
- `ChatTurnCoordinator` can be extended with memory context loading

The hot/cold memory + TF-IDF work can layer cleanly on top of this foundation.
