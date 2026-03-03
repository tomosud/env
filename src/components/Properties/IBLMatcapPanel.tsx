import { ArrowDownTrayIcon } from "@heroicons/react/24/solid";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { toast } from "sonner";
import {
  currentSceneSnapshotAtom,
  envMapTextureAtom,
  imageBasenameAtom,
  iblRotationAtom,
  projectDirectoryHandleAtom,
  sceneHistoryAtom,
  sceneRendererAtom,
} from "../../store";
import {
  ExportResolution,
  createRGBFloatEXRBlob,
  createRGBFloatHDRBlob,
  exportRGBFloatEXR,
  exportRGBFloatHDR,
  exportSettingsJSON,
  getResolutionSize,
  sanitizeBasename,
} from "../../utils/exportEnvMap";
import { createProjectSettingsSnapshot } from "../../utils/sceneSnapshot";
import {
  verifyDirectoryPermission,
  writeFilesToDirectory,
} from "../../utils/fileSystemAccess";
import {
  buildMatcapFloatRGBFromEquirect,
  buildMatcapUint8RGBAFromEquirect,
  DEFAULT_EQUIRECT_HEIGHT,
  DEFAULT_EQUIRECT_WIDTH,
  sampleEquirectPixels,
  sampleEquirectPixelsFloat,
} from "../../utils/matcap";

const PREVIEW_SIZE = 256;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
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

export function IBLMatcapPanel() {
  const texture = useAtomValue(envMapTextureAtom);
  const renderer = useAtomValue(sceneRendererAtom);
  const sceneSnapshot = useAtomValue(currentSceneSnapshotAtom);
  const imageBasename = useAtomValue(imageBasenameAtom);
  const projectDirectoryHandle = useAtomValue(projectDirectoryHandleAtom);
  const historyIndex = useAtomValue(sceneHistoryAtom).index;
  const [iblRotation, setIblRotation] = useAtom(iblRotationAtom);
  const [resolution, setResolution] = useState<ExportResolution>("2k");
  const [isSavingPNG, setIsSavingPNG] = useState(false);
  const [isSavingHDR, setIsSavingHDR] = useState(false);
  const [isSavingEXR, setIsSavingEXR] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const normalizedImageBasename = sanitizeBasename(imageBasename, "envmap");

  const rotationDeg = useMemo(
    () => Math.round(THREE.MathUtils.radToDeg(iblRotation)),
    [iblRotation]
  );

  const canSavePNG = !!texture && !!renderer && !isSavingPNG;
  const canSaveHDR = !!texture && !!renderer && !isSavingHDR;
  const canSaveEXR = !!texture && !!renderer && !isSavingEXR;

  async function ensureProjectDirectoryPermission() {
    if (!projectDirectoryHandle) {
      return null;
    }

    const granted = await verifyDirectoryPermission(projectDirectoryHandle, true);
    if (!granted) {
      toast.error("Folder permission is required to save files.");
      return null;
    }

    return projectDirectoryHandle;
  }

  const redrawPreview = useCallback(async () => {
    if (!texture || !renderer || !previewCanvasRef.current) {
      return false;
    }

    try {
      const pixels = sampleEquirectPixels(texture, renderer);
      drawHemisphereFromEquirect(
        pixels,
        DEFAULT_EQUIRECT_WIDTH,
        DEFAULT_EQUIRECT_HEIGHT,
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
    sceneSnapshot,
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
      if (projectDirectoryHandle) {
        const directoryHandle = await ensureProjectDirectoryPermission();
        if (!directoryHandle) {
          return;
        }

        await writeFilesToDirectory(directoryHandle, [
          {
            filename: `${normalizedImageBasename}_matcap.png`,
            blob,
          },
        ]);
        toast.success(
          `Saved ${normalizedImageBasename}_matcap.png to ${directoryHandle.name}.`
        );
      } else {
        downloadBlob(blob, `${normalizedImageBasename}_matcap.png`);
        toast.success(`Saved matcap PNG (${outputSize}x${outputSize}).`);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to save matcap preview.");
    } finally {
      setIsSavingPNG(false);
    }
  }

  async function handleSaveHDR() {
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
      const matcapRGB = buildMatcapFloatRGBFromEquirect(
        equirectFloat,
        sampleWidth,
        sampleHeight,
        outputSize
      );
      if (projectDirectoryHandle) {
        const directoryHandle = await ensureProjectDirectoryPermission();
        if (!directoryHandle) {
          return;
        }

        await writeFilesToDirectory(directoryHandle, [
          {
            filename: `${normalizedImageBasename}_matcap.hdr`,
            blob: createRGBFloatHDRBlob({
              rgb: matcapRGB,
              width: outputSize,
              height: outputSize,
            }),
          },
        ]);
        toast.success(
          `Saved ${normalizedImageBasename}_matcap.hdr to ${directoryHandle.name}`
        );
      } else {
        exportRGBFloatHDR({
          rgb: matcapRGB,
          width: outputSize,
          height: outputSize,
          filename: `${normalizedImageBasename}_matcap.hdr`,
        });
        exportSettingsJSON(
          createProjectSettingsSnapshot(sceneSnapshot, imageBasename),
          normalizedImageBasename
        );
        toast.success(`Saved matcap HDR + settings (${outputSize}x${outputSize})`);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to export HDR.");
    } finally {
      setIsSavingHDR(false);
    }
  }

  async function handleSaveEXR() {
    if (!texture || !renderer) {
      toast.error("Environment map is not ready yet.");
      return;
    }

    try {
      setIsSavingEXR(true);
      const { outputSize, sampleWidth, sampleHeight } =
        getMatcapRenderSizes(resolution);
      const equirectFloat = sampleEquirectPixelsFloat(
        texture,
        renderer,
        sampleWidth,
        sampleHeight
      );
      const matcapRGB = buildMatcapFloatRGBFromEquirect(
        equirectFloat,
        sampleWidth,
        sampleHeight,
        outputSize
      );
      if (projectDirectoryHandle) {
        const directoryHandle = await ensureProjectDirectoryPermission();
        if (!directoryHandle) {
          return;
        }

        await writeFilesToDirectory(directoryHandle, [
          {
            filename: `${normalizedImageBasename}_matcap.exr`,
            blob: createRGBFloatEXRBlob({
              rgb: matcapRGB,
              width: outputSize,
              height: outputSize,
            }),
          },
        ]);
        toast.success(
          `Saved ${normalizedImageBasename}_matcap.exr to ${directoryHandle.name}`
        );
      } else {
        exportRGBFloatEXR({
          rgb: matcapRGB,
          width: outputSize,
          height: outputSize,
          filename: `${normalizedImageBasename}_matcap.exr`,
        });
        exportSettingsJSON(
          createProjectSettingsSnapshot(sceneSnapshot, imageBasename),
          normalizedImageBasename
        );
        toast.success(`Saved matcap EXR + settings (${outputSize}x${outputSize})`);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to export EXR.");
    } finally {
      setIsSavingEXR(false);
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

      <div className="grid grid-cols-3 gap-2">
        <button
          className="flex items-center justify-center text-[11px] px-2 py-1.5 tracking-wide uppercase font-semibold bg-white/10 hover:bg-white/20 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleSavePNG}
          disabled={!canSavePNG}
        >
          <ArrowDownTrayIcon className="w-3.5 h-3.5 mr-1.5" />
          PNG
        </button>

        <button
          className="flex items-center justify-center text-[11px] px-2 py-1.5 tracking-wide uppercase font-semibold bg-white/10 hover:bg-white/20 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleSaveHDR}
          disabled={!canSaveHDR}
        >
          <ArrowDownTrayIcon className="w-3.5 h-3.5 mr-1.5" />
          HDR
        </button>

        <button
          className="flex items-center justify-center text-[11px] px-2 py-1.5 tracking-wide uppercase font-semibold bg-white/10 hover:bg-white/20 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleSaveEXR}
          disabled={!canSaveEXR}
        >
          <ArrowDownTrayIcon className="w-3.5 h-3.5 mr-1.5" />
          EXR
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
