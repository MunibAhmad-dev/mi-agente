# ARCHITECTURAL DEBT — Universal Web Reconstruction Engine

---

## 1. DOUBLE NESTING PATTERN (FIXED)

**Severity**: Critical  
**Component**: Agent Base → Agent perform()  
**Issue**: AgentBase.execute() wraps `perform()` return in `{ success, result, evidence }`. If `perform()` also returns `{ result: {...} }`, you get `{ result: { result: {...} } }`.  
**Fix**: All agents must return flat objects from `perform()`, never wrapping in `{ result: ... }`.  
**Status**: ✅ FIXED in Visual QA Agent

---

## 2. SUPERVISOR NOT IN PIPELINE

**Severity**: High  
**Component**: Engine → Supervisor  
**Issue**: `ReconstructionEngine.runFullPipeline()` hardcodes the execution order instead of delegating to the `SupervisorAgent`. The supervisor has full orchestration logic (task analysis, agent selection, conflict resolution) but is never used.  
**Debt**: Should refactor pipeline to: `supervisor.createPlan() → supervisor.executePlan() → supervisor.reviewResult()`  
**Impact**: No adaptive execution, no conflict resolution, no evidence verification

---

## 3. SKILLS AS METADATA ONLY

**Severity**: High  
**Component**: Skill Registry  
**Issue**: Skills have `capabilities`, `inputs`, `outputs`, `benchmark` metadata, but no `execute` function. The `SkillRegistry` stores skill definitions but agents never call skill functions.  
**Debt**: Skills should have executable `run(input)` methods that agents can invoke. The `SkillAdapter` concept exists in types but is not implemented.  
**Impact**: 25 registered skills are decorative, not functional

---

## 4. TWO PARALLEL DATA PATHS

**Severity**: Medium  
**Component**: Design DNA → Frontend Agent  
**Issue**: `DesignForensicsAgent` produces `design-dna.json` with structured design tokens. `FrontendAgent` also receives raw `domData` and `cssData` from `computeJSON()`. The code generator primarily uses raw data, making Design DNA largely unused.  
**Debt**: Should unify: Design DNA → Code Generation, with DOM/CSS as supplementary data  
**Impact**: Design DNA work is partially wasted

---

## 5. NO ERROR RECOVERY IN PIPELINE

**Severity**: Medium  
**Component**: Engine  
**Issue**: If any phase fails (e.g., browser crashes, Sharp unavailable), the entire pipeline fails with no retry or fallback.  
**Debt**: Need try/catch per phase with fallback strategies (e.g., skip vision if Sharp unavailable, use DOM-only reconstruction)  
**Impact**: Single point of failure kills entire reconstruction

---

## 6. SEQUENTIAL AGENT EXECUTION

**Severity**: Medium  
**Component**: Engine  
**Issue**: All agents run sequentially even when independent (e.g., Vision analysis could run in parallel with DOM extraction).  
**Debt**: Should use `Promise.all()` for independent phases  
**Impact**: 2-3x slower than necessary

---

## 7. MEMORY SYSTEM IS EMPTY

**Severity**: Medium  
**Component**: ProjectMemory  
**Issue**: `ProjectMemory` struct has `lessons`, `decisions`, `errors`, `solutions` arrays. None are ever written to or read from during pipeline execution.  
**Debt**: Should: (1) record failures and solutions during repair, (2) query past solutions before attempting new repairs  
**Impact**: System repeats the same mistakes

---

## 8. CSS SELECTOR CLEANING

**Severity**: Low  
**Component**: Frontend Agent  
**Issue**: `cleanSelector()` doesn't handle element selectors like `HTML.`, `HEAD.`, `BODY.` that result from `element.tagName + '.' + classes`.  
**Debt**: Should filter out non-visual elements and properly format selectors  
**Impact**: Invalid CSS rules in generated output

---

## 9. NO BENCHMARK SUITE

**Severity**: Low  
**Component**: Testing  
**Issue**: No automated tests exist for any agent, skill, or engine component. No regression tests. No visual regression baselines.  
**Debt**: Need: (1) unit tests per agent, (2) integration tests for pipeline, (3) visual regression baselines  
**Impact**: Changes can silently break functionality

---

## 10. HARDCODED CONSTANTS

**Severity**: Low  
**Component**: Various  
**Issue**: Viewport sizes (1440x900), thresholds (80%, 95%), iteration counts (10), and file paths are hardcoded throughout.  
**Debt**: Should centralize in config or use environment variables  
**Impact**: Difficult to tune or deploy in different environments

---

## DEBT PRIORITY MATRIX

| ID | Issue | Impact | Effort | Priority |
|----|-------|--------|--------|----------|
| 1 | Double nesting | Critical bug | Low | ✅ Fixed |
| 2 | Supervisor not in pipeline | High | Medium | P1 |
| 3 | Skills as metadata | High | Medium | P1 |
| 4 | Two data paths | Medium | Low | P2 |
| 5 | No error recovery | Medium | Medium | P2 |
| 6 | Sequential execution | Medium | Low | P2 |
| 7 | Empty memory | Medium | High | P3 |
| 8 | CSS selector cleaning | Low | Low | P3 |
| 9 | No test suite | Low | High | P3 |
| 10 | Hardcoded constants | Low | Low | P4 |
