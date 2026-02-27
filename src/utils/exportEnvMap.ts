import * as THREE from "three";
import convertCubemapToEquirectangular from "../components/HDRIPreview/convertCubemapToEquirectangular";
import { encodeRGBE, HDRImageData } from "@derschmale/io-rgbe";
import type { Light, Camera } from "../store";

export type ExportResolution = "1k" | "2k" | "4k";

export type SettingsSnapshot = {
  version: 1;
  lights: Light[];
  cameras: Camera[];
  iblRotation?: number;
};

export function getUniqueBasename(prefix = "envmap"): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${prefix}_${date}_${time}`;
}

export function exportSettingsJSON(snapshot: SettingsSnapshot, basename: string): void {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, `${basename}.json`);
}

const resolutionMap: Record<ExportResolution, [number, number]> = {
  "1k": [1024, 512],
  "2k": [2048, 1024],
  "4k": [4096, 2048],
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

function rgbaToRgb(data: Float32Array) {
  const pixels = data.length / 4;
  const rgb = new Float32Array(pixels * 3);

  for (let i = 0; i < pixels; i++) {
    rgb[i * 3] = data[i * 4];
    rgb[i * 3 + 1] = data[i * 4 + 1];
    rgb[i * 3 + 2] = data[i * 4 + 2];
  }

  return rgb;
}

function getSize(resolution: ExportResolution) {
  return resolutionMap[resolution];
}

export function exportEnvMapHDR({
  texture,
  renderer,
  resolution,
  filename = "envmap.hdr",
}: {
  texture: THREE.CubeTexture;
  renderer: THREE.WebGLRenderer;
  resolution: ExportResolution;
  filename?: string;
}) {
  const [width, height] = getSize(resolution);
  const target = convertCubemapToEquirectangular(
    texture,
    renderer,
    width,
    height,
    THREE.LinearSRGBColorSpace,
    THREE.FloatType
  );

  const rgba = new Float32Array(width * height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, width, height, rgba);
  target.dispose();

  const rgb = rgbaToRgb(rgba);

  const imageData = new HDRImageData();
  imageData.width = width;
  imageData.height = height;
  imageData.exposure = 1;
  imageData.gamma = 1;
  imageData.data = rgb;

  downloadBlob(
    new Blob([encodeRGBE(imageData)], {
      type: "application/octet-stream",
    }),
    filename
  );
}

export async function exportEnvMapPNG({
  texture,
  renderer,
  resolution,
  filename = "envmap.png",
}: {
  texture: THREE.CubeTexture;
  renderer: THREE.WebGLRenderer;
  resolution: ExportResolution;
  filename?: string;
}) {
  const [width, height] = getSize(resolution);
  const target = convertCubemapToEquirectangular(texture, renderer, width, height);
  const rgba = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, width, height, rgba);
  target.dispose();

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Failed to create 2D canvas context.");
  }

  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((imageBlob) => {
      if (imageBlob) {
        resolve(imageBlob);
      } else {
        reject(new Error("Failed to encode PNG."));
      }
    }, "image/png");
  });

  downloadBlob(blob, filename);
}
