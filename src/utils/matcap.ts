import * as THREE from "three";
import convertCubemapToEquirectangular from "../components/HDRIPreview/convertCubemapToEquirectangular";

export const DEFAULT_EQUIRECT_WIDTH = 512;
export const DEFAULT_EQUIRECT_HEIGHT = 256;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function toWrapped01(value: number) {
  return ((value % 1) + 1) % 1;
}

function longitudeToScreenU(longitude: number, invTwoPi: number) {
  return toWrapped01(1 - (longitude + Math.PI * 0.5) * invTwoPi);
}

function directionToEquirectUV(
  x: number,
  y: number,
  z: number,
  invTwoPi: number,
  invPi: number
) {
  const longitude = Math.atan2(-x, -z);
  const latitude = Math.acos(clamp(y, -1, 1));
  return {
    u: longitudeToScreenU(longitude, invTwoPi),
    v: clamp(latitude * invPi, 0, 1),
  };
}

export function sampleEquirectPixels(
  texture: THREE.CubeTexture,
  renderer: THREE.WebGLRenderer,
  width: number = DEFAULT_EQUIRECT_WIDTH,
  height: number = DEFAULT_EQUIRECT_HEIGHT
) {
  const target = convertCubemapToEquirectangular(texture, renderer, width, height);
  const pixels = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  target.dispose();
  return pixels;
}

export function sampleEquirectPixelsFloat(
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

export function buildMatcapUint8RGBAFromEquirect(
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

      const nz = Math.sqrt(1 - r2);
      const normalX = nx;
      const normalY = -ny;
      const normalZ = nz;
      const rx = 2 * normalZ * normalX;
      const ry = 2 * normalZ * normalY;
      const rz = -1 + 2 * normalZ * normalZ;
      const { u, v } = directionToEquirectUV(rx, ry, rz, invTwoPi, invPi);
      const [r, g, b] = sampleBilinear(u, v);
      target[ti] = r;
      target[ti + 1] = g;
      target[ti + 2] = b;
      target[ti + 3] = 255;
    }
  }

  return target;
}

export function buildMatcapFloatRGBFromEquirect(
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
      const rx = 2 * normalZ * normalX;
      const ry = 2 * normalZ * normalY;
      const rz = -1 + 2 * normalZ * normalZ;
      const { u, v } = directionToEquirectUV(rx, ry, rz, invTwoPi, invPi);
      const [r, g, b] = sampleBilinear(u, v);
      output[oi] = r;
      output[oi + 1] = g;
      output[oi + 2] = b;
    }
  }

  return output;
}
