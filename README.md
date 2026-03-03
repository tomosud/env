<img width="1522" height="833" alt="image" src="https://github.com/user-attachments/assets/864e92f1-a4cf-4b5a-badf-daad3ce124b0" />


[https://tomosud.github.io/env/](https://tomosud.github.io/env/)

<h1 align="center">Environment Map Light Editor</h1>
<p align="center">
  Create, edit, and preview HDR environment maps in the browser. Preview your models in realtime and export lightmaps to use in your React Three Fiber projects or in 3D applications like Blender, Cinema 4D, etc.
</p>

This repository is a fork of [pmndrs/env](https://github.com/pmndrs/env). Almost all of the original functionality remains intact, with additional export and workflow features layered on top.

## Acknowledgements

Thanks to the [pmndrs/env](https://github.com/pmndrs/env) maintainers and contributors for the original project and foundation this fork builds on.

## Features

- Position and style your lights to fit the model
- Click on a point on your 3D model to position lights so that they illuminate the surface
- Export environment maps as `.png` or `.hdr`
- `IBL Yaw` rotation for the environment (included in undo/redo history)
- Right-side **IBL MATCAP** panel:
  - Live hemisphere preview (auto-updates while editing)
  - Save as `PNG`, `HDR`, or `OpenEXR (.exr)`
  - Resolution selector (`1k`, `2k`, `4k`) for exports

## Fork additions (from upstream)

- HDR / PNG / EXR export
- Matcap viewer and matcap export
- Global light rotation (`IBL Yaw`)
- Scene history persistence with undo/redo (up to 100 steps)
- Folder-based save mode using the File System Access API
- Dedicated `Save JSON` / `Open JSON` workflow in folder mode
- JSON backup creation on overwrite (`backup/*.json`)
- Drag-and-drop `.json` restore for scene recovery
- `Image Name` persistence inside scene JSON

## Run locally (Windows)

```bat
run.bat
```

The script auto-detects `yarn`/`corepack`, installs dependencies when needed, and starts Vite on `http://localhost:5173`.

## Export notes

- Main toolbar `HDR` / `PNG`: exports the full environment map (equirectangular).
- `IBL MATCAP` panel:
  - `PNG` exports the matcap result.
  - `HDR` exports the matcap result as Radiance HDR.
  - `EXR` exports the matcap result as OpenEXR (half-float).
- In `Browser Downloads Mode`, main `HDR` / `PNG` exports also download a scene `.json`.
- In `Folder Connect Mode`, image exports write image files only. Scene JSON is managed separately with `Save JSON`.

## Folder mode

`Folder Connect Mode` uses the browser File System Access API to write directly into a local folder.

### Basic flow

1. Start the app on `http://localhost:5173`.
2. Click `Folder Connect Mode`.
3. Choose a local folder and grant read/write permission.
4. Set `Image Name` in the toolbar.
5. Use `HDR` / `PNG` to overwrite image files in the connected folder.
6. Use `Save JSON` to save scene settings as a `.json` file.
7. Use `Open JSON` to restore scene settings from a `.json` file in the connected folder.

### Naming behavior

- `Image Name` controls the image export filename.
- Main exports become `<Image Name>.hdr` or `<Image Name>.png`.
- Matcap exports become `<Image Name>_matcap.png`, `<Image Name>_matcap.hdr`, and `<Image Name>_matcap.exr`.
- Saved scene JSON also stores `Image Name`, and restoring that JSON restores the toolbar value.
- The JSON filename is independent from `Image Name`.
- Changing the JSON save name does not change the image save name.

### Save JSON behavior

- `Save JSON` opens a save dialog in the connected folder.
- The dialog remembers the last JSON filename you saved or opened.
- If you overwrite an existing JSON file, the previous version is copied into `backup/` with a timestamped name.
- While the current scene differs from the last saved/opened JSON state, `Save JSON` is highlighted in red.

### Notes

- Folder mode requires a browser that supports the File System Access API.
- If folder mode is not available, use `Browser Downloads Mode`.
- Drag-and-drop `.json` restore still works in both modes.

## GitHub Pages

This repo includes `.github/workflows/deploy-pages.yml`.

1. Push to `main`.
2. In GitHub, enable Pages with source `GitHub Actions`.
3. The workflow builds with `VITE_BASE_PATH=/<repo-name>/` and deploys `dist/`.
