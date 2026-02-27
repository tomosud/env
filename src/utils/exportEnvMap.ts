import * as THREE from "three";
import convertCubemapToEquirectangular from "../components/HDRIPreview/convertCubemapToEquirectangular";
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

export function getResolutionSize(resolution: ExportResolution): [number, number] {
  return resolutionMap[resolution];
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
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

function clampByte(value: number) {
  return Math.min(255, Math.max(0, value | 0));
}

function floatRgbToRgbe(
  r: number,
  g: number,
  b: number
): [number, number, number, number] {
  const maxComponent = Math.max(r, g, b);
  if (!Number.isFinite(maxComponent) || maxComponent <= 1e-32) {
    return [0, 0, 0, 0];
  }

  const exponent = Math.ceil(Math.log2(maxComponent));
  const scale = 256 / Math.pow(2, exponent);

  return [
    clampByte(Math.round(r * scale)),
    clampByte(Math.round(g * scale)),
    clampByte(Math.round(b * scale)),
    clampByte(exponent + 128),
  ];
}

function encodeRleChannel(scanline: Uint8Array, out: number[]) {
  const width = scanline.length;
  let cursor = 0;

  while (cursor < width) {
    let runLength = 1;
    while (
      cursor + runLength < width &&
      runLength < 127 &&
      scanline[cursor] === scanline[cursor + runLength]
    ) {
      runLength++;
    }

    if (runLength >= 4) {
      out.push(128 + runLength, scanline[cursor]);
      cursor += runLength;
      continue;
    }

    const literalStart = cursor;
    let literalCount = 0;
    while (literalStart + literalCount < width && literalCount < 128) {
      const probe = literalStart + literalCount;
      let probeRunLength = 1;
      while (
        probe + probeRunLength < width &&
        probeRunLength < 127 &&
        scanline[probe] === scanline[probe + probeRunLength]
      ) {
        probeRunLength++;
      }
      if (probeRunLength >= 4) {
        break;
      }
      literalCount++;
    }

    if (literalCount === 0) {
      out.push(1, scanline[cursor]);
      cursor++;
      continue;
    }

    out.push(literalCount);
    for (let i = 0; i < literalCount; i++) {
      out.push(scanline[literalStart + i]);
    }
    cursor += literalCount;
  }
}

function encodeRadianceHDR(rgb: Float32Array, width: number, height: number): Uint8Array {
  const header =
    `#?RADIANCE\n` +
    `FORMAT=32-bit_rle_rgbe\n\n` +
    `-Y ${height} +X ${width}\n`;
  const encoded: number[] = [];

  for (let i = 0; i < header.length; i++) {
    encoded.push(header.charCodeAt(i));
  }

  const r = new Uint8Array(width);
  const g = new Uint8Array(width);
  const b = new Uint8Array(width);
  const e = new Uint8Array(width);

  for (let y = 0; y < height; y++) {
    encoded.push(2, 2, (width >> 8) & 0xff, width & 0xff);

    for (let x = 0; x < width; x++) {
      const rgbIndex = (y * width + x) * 3;
      const [rr, gg, bb, ee] = floatRgbToRgbe(
        rgb[rgbIndex],
        rgb[rgbIndex + 1],
        rgb[rgbIndex + 2]
      );
      r[x] = rr;
      g[x] = gg;
      b[x] = bb;
      e[x] = ee;
    }

    encodeRleChannel(r, encoded);
    encodeRleChannel(g, encoded);
    encodeRleChannel(b, encoded);
    encodeRleChannel(e, encoded);
  }

  return new Uint8Array(encoded);
}

export function exportRGBFloatHDR({
  rgb,
  width,
  height,
  filename = "matcap.hdr",
}: {
  rgb: Float32Array;
  width: number;
  height: number;
  filename?: string;
}) {
  const rgbeBytes = encodeRadianceHDR(rgb, width, height);
  downloadBlob(
    new Blob([rgbeBytes], {
      type: "image/vnd.radiance",
    }),
    filename
  );
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
  const [width, height] = getResolutionSize(resolution);
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
  exportRGBFloatHDR({ rgb, width, height, filename });
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
  const [width, height] = getResolutionSize(resolution);
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
