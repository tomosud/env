![Screenshot of env.pmnd.rs](https://user-images.githubusercontent.com/8302959/190043093-b3800a4b-2547-489b-9411-f694b0ab1f89.png)

[https://tomosud.github.io/env/](https://tomosud.github.io/env/)

<h1 align="center">Environment Map Light Editor</h1>
<p align="center">
  Create, edit, and preview HDR environment maps in the browser. Preview your models in realtime and export lightmaps to use in your React Three Fiber projects or in 3D applications like Blender, Cinema 4D, etc.
</p>

## Features

- Position and style your lights to fit the model
- Click on a point on your 3D model to position lights so that they illuminate the surface
- Export environment maps as `.png` or `.hdr` with scene settings `.json`
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
- Exporting images also writes a scene `.json`
- Drag-and-drop `.json` restore for scene recovery

## Demo

https://user-images.githubusercontent.com/8302959/190044237-7f99cea2-723b-4d7e-b816-7942927abf2f.mp4

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

## GitHub Pages

This repo includes `.github/workflows/deploy-pages.yml`.

1. Push to `main`.
2. In GitHub, enable Pages with source `GitHub Actions`.
3. The workflow builds with `VITE_BASE_PATH=/<repo-name>/` and deploys `dist/`.
