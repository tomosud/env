import * as THREE from "three";
import * as fflate from "three/examples/jsm/libs/fflate.module.js";
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

export function exportRGBFloatEXR({
  rgb,
  width,
  height,
  compression = "zip",
  filename = "matcap.exr",
}: {
  rgb: Float32Array;
  width: number;
  height: number;
  compression?: "none" | "zip";
  filename?: string;
}) {
  const headerBytes: number[] = [];
  const pushU8 = (v: number) => headerBytes.push(v & 0xff);
  const pushU32 = (v: number) => {
    headerBytes.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff);
  };
  const pushF32 = (v: number) => {
    const b = new ArrayBuffer(4);
    const dv = new DataView(b);
    dv.setFloat32(0, v, true);
    headerBytes.push(
      dv.getUint8(0),
      dv.getUint8(1),
      dv.getUint8(2),
      dv.getUint8(3)
    );
  };
  const pushStr = (s: string) => {
    for (let i = 0; i < s.length; i++) pushU8(s.charCodeAt(i));
    pushU8(0);
  };

  const channelNames = ["A", "B", "G", "R"];
  const channelListSize = channelNames.length * 18 + 1;
  const pixelTypeHalf = 1;
  const compressionCode = compression === "zip" ? 3 : 0; // ZIP or NONE
  const blockLines = compressionCode === 3 ? 16 : 1;

  pushU32(20000630); // magic
  pushU32(2); // version

  pushStr("compression");
  pushStr("compression");
  pushU32(1);
  pushU8(compressionCode);

  pushStr("screenWindowCenter");
  pushStr("v2f");
  pushU32(8);
  pushF32(0);
  pushF32(0);

  pushStr("screenWindowWidth");
  pushStr("float");
  pushU32(4);
  pushF32(1);

  pushStr("pixelAspectRatio");
  pushStr("float");
  pushU32(4);
  pushF32(1);

  pushStr("lineOrder");
  pushStr("lineOrder");
  pushU32(1);
  pushU8(0);

  pushStr("dataWindow");
  pushStr("box2i");
  pushU32(16);
  pushU32(0);
  pushU32(0);
  pushU32(width - 1);
  pushU32(height - 1);

  pushStr("displayWindow");
  pushStr("box2i");
  pushU32(16);
  pushU32(0);
  pushU32(0);
  pushU32(width - 1);
  pushU32(height - 1);

  pushStr("channels");
  pushStr("chlist");
  pushU32(channelListSize);

  for (const ch of channelNames) {
    pushStr(ch);
    pushU32(pixelTypeHalf); // half
    pushU32(1); // pLinear + reserved
    pushU32(1); // xSampling
    pushU32(1); // ySampling
  }
  pushU8(0); // end chlist
  pushU8(0); // end header

  const headerLength = headerBytes.length;
  const blockCount = Math.ceil(height / blockLines);
  const offsetTableLength = blockCount * 8;
  const bytesPerScanline = width * channelNames.length * 2; // 4 channels x half

  function zipPreprocess(bytes: Uint8Array) {
    const tmp = new Uint8Array(bytes.length);
    let t1 = 0;
    let t2 = Math.floor((bytes.length + 1) / 2);
    let s = 0;
    while (s < bytes.length) {
      tmp[t1++] = bytes[s++];
      if (s < bytes.length) {
        tmp[t2++] = bytes[s++];
      }
    }

    let p = tmp[0];
    for (let i = 1; i < tmp.length; i++) {
      const d = tmp[i] - p + (128 + 256);
      p = tmp[i];
      tmp[i] = d & 0xff;
    }
    return tmp;
  }

  const blocks: { y: number; payload: Uint8Array }[] = [];
  for (let startY = 0; startY < height; startY += blockLines) {
    const lines = Math.min(blockLines, height - startY);
    const raw = new Uint8Array(bytesPerScanline * lines);
    const rawView = new DataView(raw.buffer);

    for (let line = 0; line < lines; line++) {
      const y = startY + line;
      let pos = line * bytesPerScanline;

      for (let x = 0; x < width; x++) {
        rawView.setUint16(pos, THREE.DataUtils.toHalfFloat(1), true);
        pos += 2;
      }

      for (let c = 2; c >= 0; c--) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 3 + c;
          rawView.setUint16(
            pos,
            THREE.DataUtils.toHalfFloat(Math.max(0, rgb[i])),
            true
          );
          pos += 2;
        }
      }
    }

    const payload =
      compressionCode === 3 ? fflate.zlibSync(zipPreprocess(raw), {}) : raw;
    blocks.push({ y: startY, payload });
  }

  let payloadTotal = 0;
  for (const block of blocks) {
    payloadTotal += 8 + block.payload.length;
  }

  const totalLength = headerLength + offsetTableLength + payloadTotal;
  const out = new Uint8Array(totalLength);
  out.set(headerBytes, 0);
  const dv = new DataView(out.buffer);

  let dataOffset = headerLength + offsetTableLength;
  for (let i = 0; i < blocks.length; i++) {
    dv.setBigUint64(headerLength + i * 8, BigInt(dataOffset), true);
    dataOffset += 8 + blocks[i].payload.length;
  }

  dataOffset = headerLength + offsetTableLength;
  for (const block of blocks) {
    dv.setUint32(dataOffset, block.y, true);
    dv.setUint32(dataOffset + 4, block.payload.length, true);
    out.set(block.payload, dataOffset + 8);
    dataOffset += 8 + block.payload.length;
  }

  downloadBlob(
    new Blob([out], {
      type: "image/x-exr",
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
