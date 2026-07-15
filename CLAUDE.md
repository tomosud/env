# Environment Map Light Editor Development Rules

Rules for humans and AI assistants working in this repository.

## Responsibilities

- The user handles git commits and pushes. The assistant may change code, add comments, and update documentation, but must not commit unless explicitly instructed.
- Browser-based and visual verification is handled by the user. The assistant should run TypeScript/Vite builds and browser-independent checks where useful. Real WebGL rendering, model interaction, File System Access permission dialogs, and exported-image appearance should be left to the user.
- Use the root `run.bat` script for normal local startup on Windows. The default URL is `http://localhost:5173`.
- Preserve this repository as an in-browser environment-map editor and as a fork of `pmndrs/env`. Do not remove existing fork features unless the user explicitly requests it.

## Technical Requirements

- Keep the existing React, TypeScript, Vite, React Three Fiber, Three.js, and Jotai architecture. Prefer focused changes within the current component, hook, store, and utility structure over introducing a second framework or state system.
- Keep the app deployable as a static GitHub Pages site. Runtime features must not depend on server-side processing.
- Respect Vite's configurable base path. Use the existing base-path utilities or Vite-compatible asset resolution instead of assuming the app is always hosted at `/`.
- Treat normalized persistent scene snapshots separately from transient UI state. JSON restore, drag-and-drop restore, history hydration, undo, and redo must continue to use the shared snapshot normalization path.
- Keep coordinate and transform behavior centralized in the existing utilities. Do not duplicate light-position, environment-rotation, or scene-snapshot logic inside individual UI components.
- Keep preview and export behavior consistent. Changes to environment rendering, color handling, rotations, or sampling must be reviewed across scene preview, HDRI preview/export, and Matcap preview/export.
- Preserve both `Browser Downloads Mode` and `Folder Connect Mode`. Folder mode uses the File System Access API, keeps image naming separate from JSON naming, and creates JSON backups before overwriting existing scene files.
- Preserve the existing export formats and naming behavior unless the user requests a change: environment PNG/HDR and Matcap PNG/HDR/EXR.
- Use only dependencies and assets whose licenses allow commercial use. Before adding a library, model, texture, weight file, or similar external asset, verify its license and document it in `README.md`.

## Workflow

- Develop incrementally and keep changes scoped to the request. Inspect related state, restore, history, preview, and export paths before modifying shared behavior.
- Do not overwrite or revert unrelated working-tree changes. The user owns existing changes unless explicitly stated otherwise.
- Use Yarn as declared by `packageManager` in `package.json`. Do not replace the lockfile or switch package managers without explicit instruction.
- Run `yarn build` after TypeScript or application changes when practical. This is the repository's standard browser-independent verification because it runs TypeScript followed by the Vite production build.
- There is currently no configured automated test or lint script. Do not claim those checks passed unless such tooling has been added and actually run.
- Keep `PLAN.md` focused on the current refactoring status, remaining work, and verification needs. Do not append trial-and-error logs or obsolete implementation history.
- Avoid adding Markdown files at the repository root. Keep durable project information in `README.md`, `PLAN.md`, and `CLAUDE.md` unless the user explicitly asks for another document.
- Update `README.md` when user-facing startup, save/restore, export, hosting, dependency, or licensing behavior changes.
- When behavior depends on WebGL output, browser permissions, downloads, or filesystem access, report exactly what was checked statically and what still needs manual browser verification.

## High-Risk Areas

- Scene snapshot parsing, normalization, serialization, restore, and undo/redo invariants.
- Persistent scene state versus transient selection, solo, camera, and other editor UI state.
- Light coordinate conversions and transform consistency across drag, paint, property editing, restore, and export.
- Preview/export parity across separate WebGL contexts, including texture color space, environment rotation, resolution, and Matcap sampling.
- Folder-mode permissions, overwrite behavior, backup creation, filenames, and browser fallback behavior.

## Encoding

- Read and write source and Markdown files as UTF-8. Do not proceed as if a file was read correctly when Japanese text or comments appear as mojibake.
- If text is corrupted, retry with an explicit UTF-8 reading method before editing. If the content still cannot be read reliably, stop and report the affected file and methods tried instead of guessing.
