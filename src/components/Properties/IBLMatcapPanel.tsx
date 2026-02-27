import { ArrowDownTrayIcon, SparklesIcon } from "@heroicons/react/24/solid";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { toast } from "sonner";
import {
  camerasAtom,
  envMapTextureAtom,
  iblRotationAtom,
  lightsAtom,
  sceneHistoryAtom,
  sceneRendererAtom,
} from "../../store";
import {
  ExportResolution,
  exportEnvMapHDR,
  exportSettingsJSON,
  getUniqueBasename,
} from "../../utils/exportEnvMap";
import convertCubemapToEquirectangular from "../HDRIPreview/convertCubemapToEquirectangular";

const PREVIEW_SIZE = 256;
const EQUIRECT_WIDTH = 512;
const EQUIRECT_HEIGHT = 256;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function drawHemisphereFromEquirect(
  pixels: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  canvas: HTMLCanvasElement
) {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const image = context.createImageData(PREVIEW_SIZE, PREVIEW_SIZE);
  const target = image.data;
  const radius = PREVIEW_SIZE * 0.47;
  const cx = PREVIEW_SIZE * 0.5;
  const cy = PREVIEW_SIZE * 0.5;
  const invTwoPi = 1 / (Math.PI * 2);
  const invPi = 1 / Math.PI;

  for (let y = 0; y < PREVIEW_SIZE; y++) {
    for (let x = 0; x < PREVIEW_SIZE; x++) {
      const nx = (x + 0.5 - cx) / radius;
      const ny = (y + 0.5 - cy) / radius;
      const r2 = nx * nx + ny * ny;
      const ti = (y * PREVIEW_SIZE + x) * 4;

      if (r2 > 1) {
        target[ti] = 4;
        target[ti + 1] = 7;
        target[ti + 2] = 10;
        target[ti + 3] = 255;
        continue;
      }

      // Front-facing hemisphere normal (z >= 0), y-up.
      const nz = Math.sqrt(1 - r2);
      const normalX = nx;
      const normalY = -ny;
      const normalZ = nz;

      // Reflect view vector (camera at +Z looking toward origin).
      const rx = 2 * normalZ * normalX;
      const ry = 2 * normalZ * normalY;
      const rz = -1 + 2 * normalZ * normalZ;

      const longitude = Math.atan2(-rx, -rz);
      const latitude = Math.acos(clamp(ry, -1, 1));
      const u = ((longitude + Math.PI * 0.5) * invTwoPi + 1) % 1;
      const v = clamp(latitude * invPi, 0, 1);

      const sx = Math.floor(u * (sourceWidth - 1));
      const sy = Math.floor(v * (sourceHeight - 1));
      const si = (sy * sourceWidth + sx) * 4;

      target[ti] = pixels[si];
      target[ti + 1] = pixels[si + 1];
      target[ti + 2] = pixels[si + 2];
      target[ti + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
}

function sampleEquirectPixels(
  texture: THREE.CubeTexture,
  renderer: THREE.WebGLRenderer
) {
  const target = convertCubemapToEquirectangular(
    texture,
    renderer,
    EQUIRECT_WIDTH,
    EQUIRECT_HEIGHT
  );
  const pixels = new Uint8Array(EQUIRECT_WIDTH * EQUIRECT_HEIGHT * 4);
  renderer.readRenderTargetPixels(
    target,
    0,
    0,
    EQUIRECT_WIDTH,
    EQUIRECT_HEIGHT,
    pixels
  );
  target.dispose();
  return pixels;
}

export function IBLMatcapPanel() {
  const texture = useAtomValue(envMapTextureAtom);
  const renderer = useAtomValue(sceneRendererAtom);
  const lights = useAtomValue(lightsAtom);
  const cameras = useAtomValue(camerasAtom);
  const historyIndex = useAtomValue(sceneHistoryAtom).index;
  const [iblRotation, setIblRotation] = useAtom(iblRotationAtom);
  const [resolution, setResolution] = useState<ExportResolution>("2k");
  const [isRendering, setIsRendering] = useState(false);
  const [isSavingHDR, setIsSavingHDR] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const rotationDeg = useMemo(
    () => Math.round(THREE.MathUtils.radToDeg(iblRotation)),
    [iblRotation]
  );

  const canRender = !!texture && !!renderer && !isRendering;
  const canSaveHDR = !!texture && !!renderer && !isSavingHDR;

  const redrawPreview = useCallback(async () => {
    if (!texture || !renderer || !previewCanvasRef.current) {
      return false;
    }

    try {
      const pixels = sampleEquirectPixels(texture, renderer);
      drawHemisphereFromEquirect(
        pixels,
        EQUIRECT_WIDTH,
        EQUIRECT_HEIGHT,
        previewCanvasRef.current
      );
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }, [texture, renderer]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await redrawPreview();
      if (!ok && !cancelled && texture && renderer) {
        toast.error("Failed to update IBL matcap preview.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [redrawPreview, iblRotation, historyIndex, texture, renderer]);

  async function handleRenderPreview() {
    if (!previewCanvasRef.current) {
      toast.error("Preview canvas is not ready yet.");
      return;
    }

    try {
      setIsRendering(true);
      const updated = await redrawPreview();
      if (!updated) {
        toast.error("Environment map is not ready yet.");
        return;
      }
      const blob = await new Promise<Blob>((resolve, reject) => {
        previewCanvasRef.current?.toBlob((imageBlob) => {
          if (imageBlob) {
            resolve(imageBlob);
          } else {
            reject(new Error("Failed to encode preview PNG."));
          }
        }, "image/png");
      });
      downloadBlob(blob, `${getUniqueBasename("matcap")}.png`);
      toast.success("Saved matcap preview PNG.");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save matcap preview.");
    } finally {
      setIsRendering(false);
    }
  }

  function handleSaveHDR() {
    if (!texture || !renderer) {
      toast.error("Environment map is not ready yet.");
      return;
    }

    try {
      setIsSavingHDR(true);
      const basename = getUniqueBasename("envmap");
      exportEnvMapHDR({
        texture,
        renderer,
        resolution,
        filename: `${basename}.hdr`,
      });
      exportSettingsJSON({ version: 1, lights, cameras, iblRotation }, basename);
      toast.success(`Saved HDR + settings (${resolution})`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to export HDR.");
    } finally {
      setIsSavingHDR(false);
    }
  }

  return (
    <div className="w-[250px] rounded-md bg-black/30 ring-1 ring-white/15 p-2 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] tracking-widest uppercase text-white/80">
          IBL Matcap
        </h3>
        <span className="text-[10px] text-white/50">{rotationDeg} deg</span>
      </div>

      <div className="w-full aspect-square rounded bg-black/60 overflow-hidden ring-1 ring-white/10">
        <canvas
          ref={previewCanvasRef}
          width={PREVIEW_SIZE}
          height={PREVIEW_SIZE}
          className="w-full h-full block"
        />
      </div>

      <div>
        <label className="block text-[10px] tracking-wider uppercase text-white/60 mb-1">
          IBL Yaw
        </label>
        <input
          className="w-full h-1.5 accent-blue-500"
          type="range"
          min={-180}
          max={180}
          step={1}
          value={rotationDeg}
          onChange={(event) =>
            setIblRotation(THREE.MathUtils.degToRad(Number(event.target.value)))
          }
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          className="flex-1 flex items-center justify-center text-[11px] px-2 py-1.5 tracking-wide uppercase font-semibold bg-white/10 hover:bg-white/20 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleRenderPreview}
          disabled={!canRender}
        >
          <SparklesIcon className="w-3.5 h-3.5 mr-1.5" />
          Render
        </button>

        <button
          className="flex-1 flex items-center justify-center text-[11px] px-2 py-1.5 tracking-wide uppercase font-semibold bg-white/10 hover:bg-white/20 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleSaveHDR}
          disabled={!canSaveHDR}
        >
          <ArrowDownTrayIcon className="w-3.5 h-3.5 mr-1.5" />
          Save HDR
        </button>
      </div>

      <select
        className="w-full h-7 rounded-md bg-neutral-900 ring-1 ring-white/20 px-2 text-[10px] uppercase tracking-wide"
        value={resolution}
        onChange={(event) =>
          setResolution(event.target.value as ExportResolution)
        }
        disabled={isSavingHDR}
      >
        <option value="1k">HDR 1k</option>
        <option value="2k">HDR 2k</option>
        <option value="4k">HDR 4k</option>
      </select>
    </div>
  );
}
