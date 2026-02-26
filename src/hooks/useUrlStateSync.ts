import { useAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { Camera, Light, camerasAtom, lightsAtom, modeAtom } from "../store";
import { withBasePath } from "../utils/withBasePath";

type ModeState = {
  scene: boolean;
  hdri: boolean;
  code: boolean;
};

const URL_KEYS = {
  mode: "m",
  lights: "l",
  cameras: "c",
} as const;

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function toStringValue(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function encodeParam(value: unknown) {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeParam(raw: string) {
  try {
    const padded = raw + "=".repeat((4 - (raw.length % 4)) % 4);
    const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function parseParam<T>(params: URLSearchParams, key: string): T | undefined {
  const raw = params.get(key);

  if (!raw) {
    return undefined;
  }

  const decoded = decodeParam(raw);
  if (decoded !== null) {
    return decoded as T;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function normalizeMode(value: unknown): Partial<ModeState> {
  if (!isObject(value)) {
    return {};
  }

  const result: Partial<ModeState> = {};

  if ("scene" in value && typeof value.scene === "boolean") {
    result.scene = value.scene;
  }
  if ("hdri" in value && typeof value.hdri === "boolean") {
    result.hdri = value.hdri;
  }
  if ("code" in value && typeof value.code === "boolean") {
    result.code = value.code;
  }

  return result;
}

function normalizeVec2(value: unknown, fallback: { x: number; y: number }) {
  if (!isObject(value)) {
    return fallback;
  }
  return {
    x: toNumber(value.x, fallback.x),
    y: toNumber(value.y, fallback.y),
  };
}

function normalizeVec3(
  value: unknown,
  fallback: { x: number; y: number; z: number }
) {
  if (!isObject(value)) {
    return fallback;
  }
  return {
    x: toNumber(value.x, fallback.x),
    y: toNumber(value.y, fallback.y),
    z: toNumber(value.z, fallback.z),
  };
}

function normalizeLight(value: unknown, index: number): Light | null {
  if (!isObject(value)) {
    return null;
  }

  const type = toStringValue(value.type, "texture");
  const shape = toStringValue(value.shape, "rect");
  const normalizedShape: Light["shape"] =
    shape === "rect" || shape === "circle" || shape === "ring"
      ? shape
      : "rect";

  const common = {
    id: toStringValue(value.id, createId()),
    ts: Date.now() + index,
    name: toStringValue(value.name, `Light ${String.fromCharCode(65 + index)}`),
    shape: normalizedShape,
    intensity: toNumber(value.intensity, 1),
    opacity: toNumber(value.opacity, 1),
    scale: toNumber(value.scale, 1),
    scaleX: toNumber(value.scaleX, 1),
    scaleY: toNumber(value.scaleY, 1),
    rotation: toNumber(value.rotation, 0),
    latlon: normalizeVec2(value.latlon, { x: 0, y: 0 }),
    target: normalizeVec3(value.target, { x: 0, y: 0, z: 0 }),
    selected: toBoolean(value.selected, false),
    visible: toBoolean(value.visible, true),
    solo: toBoolean(value.solo, false),
    animate: toBoolean(value.animate, false),
    animationSpeed: toNumber(value.animationSpeed, 0),
    animationRotationIntensity: toNumber(value.animationRotationIntensity, 0),
    animationFloatIntensity: toNumber(value.animationFloatIntensity, 0),
    animationFloatingRange: Array.isArray(value.animationFloatingRange)
      ? [
          toNumber(value.animationFloatingRange[0], 0),
          toNumber(value.animationFloatingRange[1], 1),
        ] as [number, number]
      : undefined,
  };

  if (type === "procedural_scrim") {
    return {
      ...common,
      type,
      color: toStringValue(value.color, "#ffffff"),
      lightPosition: normalizeVec2(value.lightPosition, { x: 0, y: 0 }),
      lightDistance: toNumber(value.lightDistance, 0.3),
    };
  }

  if (type === "procedural_umbrella") {
    return {
      ...common,
      type,
      color: toStringValue(value.color, "#ffffff"),
      lightSides: toNumber(value.lightSides, 3),
    };
  }

  if (type === "sky_gradient") {
    return {
      ...common,
      type,
      color: toStringValue(value.color, "#ff0000"),
      color2: toStringValue(value.color2, "#0000ff"),
    };
  }

  return {
    ...common,
    type: "texture",
    color: toStringValue(value.color, "#ffffff"),
    map: toStringValue(value.map, withBasePath("textures/softbox-octagon.exr")),
  };
}

function normalizeLights(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  return value
    .map((light, index) => normalizeLight(light, index))
    .filter((light): light is Light => light !== null);
}

function normalizeCamera(value: unknown, index: number): Camera | null {
  if (!isObject(value)) {
    return null;
  }

  const rawPosition = Array.isArray(value.position) ? value.position : [0, 0, 5];
  const rawRotation = Array.isArray(value.rotation) ? value.rotation : [0, 0, 0];

  return {
    id: toStringValue(value.id, createId()),
    name: toStringValue(value.name, `Camera ${String.fromCharCode(65 + index)}`),
    selected: toBoolean(value.selected, index === 0),
    position: [
      toNumber(rawPosition[0], 0),
      toNumber(rawPosition[1], 0),
      toNumber(rawPosition[2], 5),
    ],
    rotation: [
      toNumber(rawRotation[0], 0),
      toNumber(rawRotation[1], 0),
      toNumber(rawRotation[2], 0),
    ],
  };
}

function normalizeCameras(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const cameras = value
    .map((camera, index) => normalizeCamera(camera, index))
    .filter((camera): camera is Camera => camera !== null);

  if (cameras.length === 0) {
    return null;
  }

  const selectedIndex = cameras.findIndex((camera) => camera.selected);
  const finalSelectedIndex = selectedIndex >= 0 ? selectedIndex : 0;

  return cameras.map((camera, index) => ({
    ...camera,
    selected: index === finalSelectedIndex,
  }));
}

function stripLightForUrl(light: Light) {
  const { ts, ...rest } = light;
  return rest;
}

export function useUrlStateSync() {
  const [mode, setMode] = useAtom(modeAtom);
  const [lights, setLights] = useAtom(lightsAtom);
  const [cameras, setCameras] = useAtom(camerasAtom);
  const [isHydrated, setIsHydrated] = useState(false);
  const lastSnapshotRef = useRef("");
  const hydratedRef = useRef(false);
  const modeRef = useRef(mode);
  const lightsRef = useRef(lights);
  const camerasRef = useRef(cameras);
  const dirtyRef = useRef(false);
  const interactingRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const FLUSH_DELAY_MS = 1200;

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function writeUrlIfNeeded() {
    if (!hydratedRef.current || !dirtyRef.current) {
      return;
    }

    if (interactingRef.current) {
      return;
    }

    const payload = {
      mode: modeRef.current,
      lights: lightsRef.current.map((light) => stripLightForUrl(light)),
      cameras: camerasRef.current,
    };
    const nextSnapshot = JSON.stringify(payload);

    if (nextSnapshot === lastSnapshotRef.current) {
      dirtyRef.current = false;
      return;
    }

    const params = new URLSearchParams(window.location.search);
    params.set(URL_KEYS.mode, encodeParam(payload.mode));
    params.set(URL_KEYS.lights, encodeParam(payload.lights));
    params.set(URL_KEYS.cameras, encodeParam(payload.cameras));

    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${
      nextSearch ? `?${nextSearch}` : ""
    }${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (nextUrl !== currentUrl) {
      window.history.replaceState(null, "", nextUrl);
    }

    lastSnapshotRef.current = nextSnapshot;
    dirtyRef.current = false;
  }

  function scheduleFlush(delay = FLUSH_DELAY_MS) {
    if (timerRef.current !== null) {
      return;
    }

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      writeUrlIfNeeded();

      if (dirtyRef.current) {
        scheduleFlush(FLUSH_DELAY_MS);
      }
    }, delay);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const modeFromUrl = parseParam<unknown>(params, URL_KEYS.mode);
    const lightsFromUrl = parseParam<unknown>(params, URL_KEYS.lights);
    const camerasFromUrl = parseParam<unknown>(params, URL_KEYS.cameras);

    if (modeFromUrl !== undefined) {
      setMode((old) => ({
        ...old,
        ...normalizeMode(modeFromUrl),
      }));
    }

    const normalizedLights = normalizeLights(lightsFromUrl);
    if (normalizedLights !== null) {
      setLights(normalizedLights);
    }

    const normalizedCameras = normalizeCameras(camerasFromUrl);
    if (normalizedCameras !== null) {
      setCameras(normalizedCameras);
    }

    setIsHydrated(true);
  }, [setCameras, setLights, setMode]);

  useEffect(() => {
    hydratedRef.current = isHydrated;
    if (isHydrated) {
      dirtyRef.current = true;
      scheduleFlush();
    }
  }, [isHydrated]);

  useEffect(() => {
    modeRef.current = mode;
    if (!hydratedRef.current) {
      return;
    }
    dirtyRef.current = true;
    scheduleFlush();
  }, [mode]);

  useEffect(() => {
    lightsRef.current = lights;
    if (!hydratedRef.current) {
      return;
    }
    dirtyRef.current = true;
    scheduleFlush();
  }, [lights]);

  useEffect(() => {
    camerasRef.current = cameras;
    if (!hydratedRef.current) {
      return;
    }
    dirtyRef.current = true;
    scheduleFlush();
  }, [cameras]);

  useEffect(() => {
    const handlePointerDown = () => {
      interactingRef.current = true;
    };

    const handlePointerUp = () => {
      interactingRef.current = false;
      if (dirtyRef.current) {
        clearTimer();
        scheduleFlush(60);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("pointerup", handlePointerUp, true);
    window.addEventListener("pointercancel", handlePointerUp, true);

    return () => {
      clearTimer();
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointerup", handlePointerUp, true);
      window.removeEventListener("pointercancel", handlePointerUp, true);
    };
  }, []);
}
