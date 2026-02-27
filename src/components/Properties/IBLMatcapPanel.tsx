import { ArrowDownTrayIcon } from "@heroicons/react/24/solid";
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
  exportRGBFloatHDR,
  exportSettingsJSON,
  getResolutionSize,
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
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
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
  const target = buildMatcapUint8RGBAFromEquirect(
    pixels,
    sourceWidth,
    sourceHeight,
    PREVIEW_SIZE
  );
  context.putImageData(new ImageData(target, PREVIEW_SIZE, PREVIEW_SIZE), 0, 0);
}

function buildMatcapUint8RGBAFromEquirect(
  pixels: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  outputSize: number
) {
  const target = new Uint8ClampedArray(outputSize * outputSize * 4);
  const radius = (outputSize - 1) * 0.5;
  const cx = outputSize * 0.5;
  const cy = outputSize * 0.5;
  const invTwoPi = 1 / (Math.PI * 2);
  const invPi = 1 / Math.PI;
  const maxY = sourceHeight - 1;

  function sampleBilinear(u: number, v: number): [number, number, number] {
    const x = u * sourceWidth;
    const y = v * maxY;
    const x0 = Math.floor(x) % sourceWidth;
    const y0 = Math.floor(y);
    const x1 = (x0 + 1) % sourceWidth;
    const y1 = Math.min(y0 + 1, maxY);
    const tx = x - Math.floor(x);
    const ty = y - y0;

    const i00 = (y0 * sourceWidth + x0) * 4;
    const i10 = (y0 * sourceWidth + x1) * 4;
    const i01 = (y1 * sourceWidth + x0) * 4;
    const i11 = (y1 * sourceWidth + x1) * 4;

    const r0 = pixels[i00] * (1 - tx) + pixels[i10] * tx;
    const g0 = pixels[i00 + 1] * (1 - tx) + pixels[i10 + 1] * tx;
    const b0 = pixels[i00 + 2] * (1 - tx) + pixels[i10 + 2] * tx;

    const r1 = pixels[i01] * (1 - tx) + pixels[i11] * tx;
    const g1 = pixels[i01 + 1] * (1 - tx) + pixels[i11 + 1] * tx;
    const b1 = pixels[i01 + 2] * (1 - tx) + pixels[i11 + 2] * tx;

    return [
      Math.round(r0 * (1 - ty) + r1 * ty),
      Math.round(g0 * (1 - ty) + g1 * ty),
      Math.round(b0 * (1 - ty) + b1 * ty),
    ];
  }

  for (let y = 0; y < outputSize; y++) {
    for (let x = 0; x < outputSize; x++) {
      const nx = (x + 0.5 - cx) / radius;
      const ny = (y + 0.5 - cy) / radius;
      const r2 = nx * nx + ny * ny;
      const ti = (y * outputSize + x) * 4;

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
      // Hemisphere projection: sample by normal direction, not mirror reflection.
      const longitude = Math.atan2(-normalX, -normalZ);
      const latitude = Math.acos(clamp(normalY, -1, 1));
      const u = ((longitude + Math.PI * 0.5) * invTwoPi + 1) % 1;
      const v = clamp(latitude * invPi, 0, 1);
      const [r, g, b] = sampleBilinear(u, v);
      target[ti] = r;
      target[ti + 1] = g;
      target[ti + 2] = b;
      target[ti + 3] = 255;
    }
  }

  return target;
}

function sampleEquirectPixels(
  texture: THREE.CubeTexture,
  renderer: THREE.WebGLRenderer,
  width: number = EQUIRECT_WIDTH,
  height: number = EQUIRECT_HEIGHT
) {
  const target = convertCubemapToEquirectangular(texture, renderer, width, height);
  const pixels = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  target.dispose();
  return pixels;
}

function sampleEquirectPixelsFloat(
  texture: THREE.CubeTexture,
  renderer: THREE.WebGLRenderer,
  width: number,
  height: number
) {
  const target = convertCubemapToEquirectangular(
    texture,
    renderer,
    width,
    height,
    THREE.LinearSRGBColorSpace,
    THREE.FloatType
  );
  const pixels = new Float32Array(width * height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  target.dispose();
  return pixels;
}

function getMatcapRenderSizes(resolution: ExportResolution) {
  const [outputSize] = getResolutionSize(resolution);
  const supersampleScale =
    resolution === "1k" ? 2 : resolution === "2k" ? 1.5 : 1;
  const sampleWidth = Math.max(
    outputSize,
    Math.round((outputSize * supersampleScale) / 2) * 2
  );
  return {
    outputSize,
    sampleWidth,
    sampleHeight: sampleWidth / 2,
  };
}

function buildMatcapFloatRGB(
  equirectRgba: Float32Array,
  sourceWidth: number,
  sourceHeight: number,
  outputSize: number
) {
  const output = new Float32Array(outputSize * outputSize * 3);
  const radius = (outputSize - 1) * 0.5;
  const cx = outputSize * 0.5;
  const cy = outputSize * 0.5;
  const invTwoPi = 1 / (Math.PI * 2);
  const invPi = 1 / Math.PI;
  const maxY = sourceHeight - 1;

  function sampleBilinear(u: number, v: number): [number, number, number] {
    const x = u * sourceWidth;
    const y = v * maxY;
    const x0 = Math.floor(x) % sourceWidth;
    const y0 = Math.floor(y);
    const x1 = (x0 + 1) % sourceWidth;
    const y1 = Math.min(y0 + 1, maxY);
    const tx = x - Math.floor(x);
    const ty = y - y0;

    const i00 = (y0 * sourceWidth + x0) * 4;
    const i10 = (y0 * sourceWidth + x1) * 4;
    const i01 = (y1 * sourceWidth + x0) * 4;
    const i11 = (y1 * sourceWidth + x1) * 4;

    const r0 = equirectRgba[i00] * (1 - tx) + equirectRgba[i10] * tx;
    const g0 = equirectRgba[i00 + 1] * (1 - tx) + equirectRgba[i10 + 1] * tx;
    const b0 = equirectRgba[i00 + 2] * (1 - tx) + equirectRgba[i10 + 2] * tx;

    const r1 = equirectRgba[i01] * (1 - tx) + equirectRgba[i11] * tx;
    const g1 =
      equirectRgba[i01 + 1] * (1 - tx) + equirectRgba[i11 + 1] * tx;
    const b1 =
      equirectRgba[i01 + 2] * (1 - tx) + equirectRgba[i11 + 2] * tx;

    return [
      r0 * (1 - ty) + r1 * ty,
      g0 * (1 - ty) + g1 * ty,
      b0 * (1 - ty) + b1 * ty,
    ];
  }

  for (let y = 0; y < outputSize; y++) {
    for (let x = 0; x < outputSize; x++) {
      const nx = (x + 0.5 - cx) / radius;
      const ny = (y + 0.5 - cy) / radius;
      const r2 = nx * nx + ny * ny;
      const oi = (y * outputSize + x) * 3;

      if (r2 > 1) {
        output[oi] = 0;
        output[oi + 1] = 0;
        output[oi + 2] = 0;
        continue;
      }

      const nz = Math.sqrt(1 - r2);
      const normalX = nx;
      const normalY = -ny;
      const normalZ = nz;
      // Hemisphere projection: sample by normal direction, not mirror reflection.
      const longitude = Math.atan2(-normalX, -normalZ);
      const latitude = Math.acos(clamp(normalY, -1, 1));
      const u = ((longitude + Math.PI * 0.5) * invTwoPi + 1) % 1;
      const v = clamp(latitude * invPi, 0, 1);
      const [r, g, b] = sampleBilinear(u, v);
      output[oi] = r;
      output[oi + 1] = g;
      output[oi + 2] = b;
    }
  }

  return output;
}

export function IBLMatcapPanel() {
  const texture = useAtomValue(envMapTextureAtom);
  const renderer = useAtomValue(sceneRendererAtom);
  const lights = useAtomValue(lightsAtom);
  const cameras = useAtomValue(camerasAtom);
  const historyIndex = useAtomValue(sceneHistoryAtom).index;
  const [iblRotation, setIblRotation] = useAtom(iblRotationAtom);
  const [resolution, setResolution] = useState<ExportResolution>("2k");
  const [isSavingPNG, setIsSavingPNG] = useState(false);
  const [isSavingHDR, setIsSavingHDR] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const rotationDeg = useMemo(
    () => Math.round(THREE.MathUtils.radToDeg(iblRotation)),
    [iblRotation]
  );

  const canSavePNG = !!texture && !!renderer && !isSavingPNG;
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
    let rafId: number | null = null;
    const timeout = window.setTimeout(() => {
      rafId = window.requestAnimationFrame(() => {
        void redrawPreview();
      });
    }, 120);

    return () => {
      window.clearTimeout(timeout);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [
    redrawPreview,
    historyIndex,
    lights,
    cameras,
    iblRotation,
    texture,
    renderer,
  ]);

  async function handleSavePNG() {
    if (!texture || !renderer) {
      toast.error("Environment map is not ready yet.");
      return;
    }

    try {
      setIsSavingPNG(true);
      const { outputSize, sampleWidth, sampleHeight } =
        getMatcapRenderSizes(resolution);
      const equirect = sampleEquirectPixels(
        texture,
        renderer,
        sampleWidth,
        sampleHeight
      );
      const rgba = buildMatcapUint8RGBAFromEquirect(
        equirect,
        sampleWidth,
        sampleHeight,
        outputSize
      );
      const canvas = document.createElement("canvas");
      canvas.width = outputSize;
      canvas.height = outputSize;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Failed to create PNG canvas.");
      }
      context.putImageData(new ImageData(rgba, outputSize, outputSize), 0, 0);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((imageBlob) => {
          if (imageBlob) {
            resolve(imageBlob);
          } else {
            reject(new Error("Failed to encode preview PNG."));
          }
        }, "image/png");
      });
      downloadBlob(blob, `${getUniqueBasename("matcap")}.png`);
      toast.success(`Saved matcap PNG (${outputSize}x${outputSize}).`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save matcap preview.");
    } finally {
      setIsSavingPNG(false);
    }
  }

  function handleSaveHDR() {
    if (!texture || !renderer) {
      toast.error("Environment map is not ready yet.");
      return;
    }

    try {
      setIsSavingHDR(true);
      const { outputSize, sampleWidth, sampleHeight } =
        getMatcapRenderSizes(resolution);
      const equirectFloat = sampleEquirectPixelsFloat(
        texture,
        renderer,
        sampleWidth,
        sampleHeight
      );
      const matcapRGB = buildMatcapFloatRGB(
        equirectFloat,
        sampleWidth,
        sampleHeight,
        outputSize
      );
      const basename = getUniqueBasename("matcap");
      exportRGBFloatHDR({
        rgb: matcapRGB,
        width: outputSize,
        height: outputSize,
        filename: `${basename}.hdr`,
      });
      exportSettingsJSON({ version: 1, lights, cameras, iblRotation }, basename);
      toast.success(`Saved matcap HDR + settings (${outputSize}x${outputSize})`);
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
          onClick={handleSavePNG}
          disabled={!canSavePNG}
        >
          <ArrowDownTrayIcon className="w-3.5 h-3.5 mr-1.5" />
          PNG
        </button>

        <button
          className="flex-1 flex items-center justify-center text-[11px] px-2 py-1.5 tracking-wide uppercase font-semibold bg-white/10 hover:bg-white/20 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleSaveHDR}
          disabled={!canSaveHDR}
        >
          <ArrowDownTrayIcon className="w-3.5 h-3.5 mr-1.5" />
          HDR
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
