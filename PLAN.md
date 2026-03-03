# Refactoring Plan

## Goals

- Eliminate state/UI desynchronization around light editing, JSON restore, undo/redo, and matcap preview/export.
- Separate persistent scene data from transient UI state so restore and history are predictable.
- Reduce duplicated render/export paths and make visual output consistent across scene preview, HDRI preview, and matcap export.
- Establish safer state normalization and validation so malformed or legacy JSON cannot silently corrupt runtime behavior.

## Principles

- Change architecture before polishing behavior.
- Isolate data model changes from UI rewrites so regressions are easier to detect.
- Keep each phase shippable with focused verification.
- Add tests or reproducible checks before broad cleanup where behavior is currently ambiguous.

## Current Status

- Completed:
  - Phase 1: persistent scene data and transient UI state were split in the store.
  - Phase 2: snapshot parse/normalize/restore now goes through a shared codec.
  - Phase 3: `LightProperties` no longer relies on stale long-lived object bindings.
  - Phase 4: light coordinate normalization and transform math were centralized.
  - Phase 6: undo/redo and JSON restore now operate on normalized scene snapshots.
  - Phase 7: solo visibility, camera selection edge cases, stale key handlers, and duplicate-light instability were addressed.
  - Export/save flow deduplication between `AppToolbar` and `IBLMatcapPanel`.
- Partially completed:
  - Phase 5: env capture settings, matcap sampling, and coordinate conversion were unified, but scene preview and export still run in separate WebGL contexts.
- Remaining high-value work:
  - Phase 8 manual regression verification across save/load/export/undo flows.
  - Focused tests for snapshot normalization, restore invariants, and transform helpers.
  - Optional follow-up cleanup for bundle size and any remaining direct atom array writes.

## Phase 0: Baseline and Repro Harness

### Scope

- Document concrete repro cases for:
  - light parameter edits unexpectedly moving light position
  - matcap appearance changing after JSON restore
  - solo/visibility state corruption
  - camera selection edge cases
- Define expected behavior for scene data, UI state, undo/redo, and JSON restore.

### Tasks

- Create a short manual test checklist covering light edit, drag, paint, save/load, undo/redo, and export flows.
- Identify a small set of representative JSON fixtures:
  - current valid snapshot
  - snapshot with missing optional fields
  - legacy/incomplete snapshot
- Add lightweight state-level tests where practical for normalization and restore behavior.

### Exit Criteria

- There is a stable checklist to run after each phase.
- Known broken behaviors are reproducible on demand.

## Phase 1: Separate Scene State From UI State

### Scope

- Redesign the store so serialized scene data is distinct from transient editor state.

### Tasks

- Split current `Light` concerns into:
  - persistent light data
  - transient light editor state such as `selected`, possibly `solo`, and internal timestamps
- Decide whether `visible` is persistent scene data or editor-only state, then make that explicit.
- Remove `ts` from persisted scene snapshots and use explicit revision/versioning for UI refresh instead.
- Do the same review for cameras:
  - persistent camera transforms/name
  - transient selection state
- Introduce derived selectors for selection, solo mode, and active camera instead of storing mixed concerns in one object shape.

### Exit Criteria

- JSON payload contains only intentional persistent scene data.
- Undo/redo snapshots no longer carry incidental UI-only fields.

## Phase 2: Normalize and Validate Snapshot I/O

### Scope

- Centralize import/export rules for scene snapshots.

### Tasks

- Create a dedicated snapshot codec module for:
  - parse
  - validate
  - normalize
  - serialize
- Define defaults per light type and apply them during restore.
- Validate discriminated unions by `type` instead of only checking array presence.
- Clamp and sanitize numeric ranges where runtime assumes bounds:
  - `latlon`
  - `opacity`
  - `scale`
  - `lightDistance`
  - `iblRotation`
- Make JSON restore use the same normalization path everywhere:
  - toolbar open
  - drag-and-drop restore
  - IndexedDB history hydration

### Exit Criteria

- Every scene restore path goes through one normalization layer.
- Invalid or partial JSON produces either safe defaults or a clear error.

## Phase 3: Rewrite Editing Flow To Avoid Stale References

### Scope

- Remove direct object binding patterns that depend on long-lived mutable references.

### Tasks

- Replace the `tweakpane` binding strategy in `LightProperties` so controls read from current state and write via explicit update actions.
- Ensure undo/redo and JSON restore fully refresh the properties UI without relying on ad hoc timestamps.
- Introduce typed update actions for each editable concern instead of generic object spreading where possible.
- Audit hooks and event handlers for stale closure issues, including keyboard shortcuts and selection handlers.

### Exit Criteria

- Property panel always reflects the latest restored or undone state.
- Editing one property cannot accidentally reapply stale values from a prior object instance.

## Phase 4: Stabilize Transform and Interaction Semantics

### Scope

- Make light transform updates consistent across drag, panel edits, paint mode, and restore.

### Tasks

- Define one canonical transform model for lights:
  - position on env sphere
  - target/orientation
  - shape scale
  - local rotation
- Clamp or wrap `latlon` consistently at the action layer.
- Review whether `lookAt(...); rotateZ(...)` is the intended transform composition for all light types.
- Move transform math into dedicated utility functions so all mutation paths use the same rules.
- Review paint mode semantics and selection semantics to ensure only intended lights are modified.

### Exit Criteria

- Drag, slider edit, paint, restore, and undo produce the same transform interpretation.
- No implicit transform corrections happen inside render-only code.

## Phase 5: Unify Environment Rendering Paths

### Scope

- Reduce divergence between scene preview, HDRI preview, matcap preview, and export.

### Tasks

- Map current render pipelines and identify the authoritative environment source.
- Decide whether scene preview and export should consume:
  - one shared generated env texture
  - or one shared scene graph rendered through one abstraction
- Remove duplicated scene-to-env logic where possible.
- Ensure matcap preview/export samples from the same normalized env result that users are editing.
- Review texture loading and color-space handling for parity across preview and export paths.

### Exit Criteria

- Scene preview and matcap/export no longer drift because of separate stateful render paths.
- Visual comparison between preview and exported output is predictable.

## Phase 6: Simplify History and Restore Mechanics

### Scope

- Make history behavior deterministic after the earlier state split.

### Tasks

- Refactor undo/redo snapshots to store only normalized persistent scene data.
- Ensure JSON restore intentionally resets or preserves editor state according to defined rules.
- Remove implicit dirty-state coupling that depends on broad object replacement.
- Review commit timing for drag operations and batch updates so history entries are meaningful.

### Exit Criteria

- Undo/redo does not resurrect stale UI state.
- JSON restore is authoritative and easy to reason about.

## Phase 7: Fix Secondary Behavioral Issues

### Scope

- Clean up issues that are not core architecture blockers but should be corrected during the refactor.

### Tasks

- Preserve pre-solo visibility state instead of forcing all lights visible on solo exit.
- Enforce exactly one active camera, or explicitly support zero active cameras with matching code paths.
- Fix stale `useKeyPress` behavior.
- Review command-palette defaults and naming logic for consistency with normalized state.
- Remove dead state, dead imports, and accidental duplicated helper functions.

### Exit Criteria

- Secondary editor interactions behave consistently with the new architecture.

## Phase 8: Verification and Cleanup

### Scope

- Lock in behavior and reduce maintenance cost.

### Tasks

- Run the manual checklist from Phase 0 after each major merge.
- Add focused tests for:
  - snapshot normalization
  - solo/visibility behavior
  - restore and undo invariants
  - transform math helpers
- Review bundle impact and identify optional follow-up splitting if needed.
- Update README and developer notes to reflect the new state model and restore behavior.

### Exit Criteria

- Refactored code paths are covered by repeatable checks.
- Architecture and restore rules are documented for future contributors.

## Remaining Execution Order

1. Phase 5 follow-up only if preview/export parity still shows drift in manual checks
2. Phase 8 manual regression checklist
3. Phase 8 focused tests
4. Optional bundle and API cleanup

## Notes

- Do not start by patching isolated symptoms in `LightProperties` or matcap export only. Those fixes are likely to be temporary until state ownership is clarified.
- The highest-risk areas are snapshot normalization, property-panel binding, and duplicated render pipelines.
- If scope needs to be reduced, keep Phases 1 through 4 as the minimum architecture pass before cosmetic cleanup.
