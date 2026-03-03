import * as THREE from "three";
import { withBasePath } from "./withBasePath";

type UnknownRecord = Record<string, unknown>;

type BaseLightData = {
  id: string;
  name: string;
  shape: "rect" | "circle" | "ring";
  intensity: number;
  opacity: number;
  additive: boolean;
  scale: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  latlon: { x: number; y: number };
  target: { x: number; y: number; z: number };
  visible: boolean;
  animate: boolean;
  animationSpeed?: number;
  animationRotationIntensity?: number;
  animationFloatIntensity?: number;
  animationFloatingRange?: [number, number];
};

export type TextureLightData = BaseLightData & {
  type: "texture";
  color: string;
  map: string;
};

export type ProceduralScrimLightData = BaseLightData & {
  type: "procedural_scrim";
  color: string;
  lightPosition: { x: number; y: number };
  lightDistance: number;
};

export type ProceduralUmbrellaLightData = BaseLightData & {
  type: "procedural_umbrella";
  color: string;
  lightSides: number;
};

export type SkyGradientLightData = BaseLightData & {
  type: "sky_gradient";
  color: string;
  color2: string;
};

export type SceneLight =
  | TextureLightData
  | ProceduralScrimLightData
  | ProceduralUmbrellaLightData
  | SkyGradientLightData;

export type SceneCamera = {
  id: string;
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
};

export type SceneSnapshot = {
  version: 2;
  lights: SceneLight[];
  cameras: SceneCamera[];
  activeCameraId: string;
  iblRotation: number;
};

export type ProjectSettingsSnapshot = SceneSnapshot & {
  imageBasename?: string;
};

const DEFAULT_TEXTURE_MAP = withBasePath("textures/softbox-octagon.exr");

const DEFAULT_LIGHT: Omit<ProceduralScrimLightData, "id" | "name"> = {
  type: "procedural_scrim",
  shape: "rect",
  color: "#ffffff",
  latlon: { x: 0, y: 0 },
  intensity: 1,
  rotation: 0,
  scale: 2,
  scaleX: 1,
  scaleY: 1,
  target: { x: 0, y: 0, z: 0 },
  visible: true,
  opacity: 1,
  additive: false,
  animate: false,
  lightDistance: 0.3,
  lightPosition: { x: 0, y: 0 },
};

const DEFAULT_CAMERA: SceneCamera = {
  id: "default",
  name: "Default",
  position: [0, 0, 5],
  rotation: [0, 0, 0],
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function asFiniteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function wrapSignedUnit(value: number) {
  const wrapped = ((((value + 1) % 2) + 2) % 2) - 1;
  return wrapped === 1 ? -1 : wrapped;
}

function normalizeLatLon(value: unknown) {
  const raw = isRecord(value) ? value : {};
  return {
    x: wrapSignedUnit(asFiniteNumber(raw.x, DEFAULT_LIGHT.latlon.x)),
    y: clamp(asFiniteNumber(raw.y, DEFAULT_LIGHT.latlon.y), -1, 1),
  };
}

function normalizeTarget(value: unknown) {
  const raw = isRecord(value) ? value : {};
  return {
    x: asFiniteNumber(raw.x, DEFAULT_LIGHT.target.x),
    y: asFiniteNumber(raw.y, DEFAULT_LIGHT.target.y),
    z: asFiniteNumber(raw.z, DEFAULT_LIGHT.target.z),
  };
}

function normalizePoint2(value: unknown, fallback: { x: number; y: number }) {
  const raw = isRecord(value) ? value : {};
  return {
    x: asFiniteNumber(raw.x, fallback.x),
    y: asFiniteNumber(raw.y, fallback.y),
  };
}

function normalizeRange2(
  value: unknown,
  fallback: [number, number]
): [number, number] {
  if (!Array.isArray(value) || value.length < 2) {
    return fallback;
  }
  return [
    asFiniteNumber(value[0], fallback[0]),
    asFiniteNumber(value[1], fallback[1]),
  ];
}

function normalizeShape(value: unknown): SceneLight["shape"] {
  return value === "circle" || value === "ring" ? value : "rect";
}

function normalizeBaseLight(
  raw: UnknownRecord,
  index: number
): Omit<BaseLightData, never> {
  const id = asString(raw.id, THREE.MathUtils.generateUUID());

  return {
    id,
    name: asString(raw.name, `Light ${String.fromCharCode(index + 65)}`),
    shape: normalizeShape(raw.shape),
    intensity: Math.max(0, asFiniteNumber(raw.intensity, DEFAULT_LIGHT.intensity)),
    opacity: clamp(asFiniteNumber(raw.opacity, DEFAULT_LIGHT.opacity), 0, 1),
    additive: asBoolean(raw.additive, DEFAULT_LIGHT.additive),
    scale: Math.max(0, asFiniteNumber(raw.scale, DEFAULT_LIGHT.scale)),
    scaleX: Math.max(0, asFiniteNumber(raw.scaleX, DEFAULT_LIGHT.scaleX)),
    scaleY: Math.max(0, asFiniteNumber(raw.scaleY, DEFAULT_LIGHT.scaleY)),
    rotation: asFiniteNumber(raw.rotation, DEFAULT_LIGHT.rotation),
    latlon: normalizeLatLon(raw.latlon),
    target: normalizeTarget(raw.target),
    visible: asBoolean(raw.visible, DEFAULT_LIGHT.visible),
    animate: asBoolean(raw.animate, DEFAULT_LIGHT.animate),
    animationSpeed:
      raw.animationSpeed === undefined
        ? undefined
        : asFiniteNumber(raw.animationSpeed, 1),
    animationRotationIntensity:
      raw.animationRotationIntensity === undefined
        ? undefined
        : asFiniteNumber(raw.animationRotationIntensity, 0),
    animationFloatIntensity:
      raw.animationFloatIntensity === undefined
        ? undefined
        : asFiniteNumber(raw.animationFloatIntensity, 0),
    animationFloatingRange:
      raw.animationFloatingRange === undefined
        ? undefined
        : normalizeRange2(raw.animationFloatingRange, [0, 0]),
  };
}

function normalizeLight(raw: unknown, index: number): SceneLight | null {
  if (!isRecord(raw)) {
    return null;
  }

  const base = normalizeBaseLight(raw, index);

  switch (raw.type) {
    case "texture":
      return {
        ...base,
        type: "texture",
        color: asString(raw.color, "#ffffff"),
        map: asString(raw.map, DEFAULT_TEXTURE_MAP),
      };
    case "procedural_scrim":
      return {
        ...base,
        type: "procedural_scrim",
        color: asString(raw.color, DEFAULT_LIGHT.color),
        lightDistance: clamp(
          asFiniteNumber(raw.lightDistance, DEFAULT_LIGHT.lightDistance),
          0.01,
          1
        ),
        lightPosition: normalizePoint2(
          raw.lightPosition,
          DEFAULT_LIGHT.lightPosition
        ),
      };
    case "procedural_umbrella":
      return {
        ...base,
        type: "procedural_umbrella",
        color: asString(raw.color, "#ffffff"),
        lightSides: Math.max(3, Math.round(asFiniteNumber(raw.lightSides, 3))),
      };
    case "sky_gradient":
      return {
        ...base,
        type: "sky_gradient",
        color: asString(raw.color, "#ffffff"),
        color2: asString(raw.color2, "#000000"),
      };
    default:
      return null;
  }
}

function normalizeVector3Tuple(
  value: unknown,
  fallback: [number, number, number]
): [number, number, number] {
  if (!Array.isArray(value) || value.length < 3) {
    return fallback;
  }
  return [
    asFiniteNumber(value[0], fallback[0]),
    asFiniteNumber(value[1], fallback[1]),
    asFiniteNumber(value[2], fallback[2]),
  ];
}

function normalizeCamera(raw: unknown, index: number): SceneCamera | null {
  if (!isRecord(raw)) {
    return null;
  }

  return {
    id: asString(raw.id, THREE.MathUtils.generateUUID()),
    name: asString(raw.name, `Camera ${String.fromCharCode(index + 65)}`),
    position: normalizeVector3Tuple(raw.position, DEFAULT_CAMERA.position),
    rotation: normalizeVector3Tuple(raw.rotation, DEFAULT_CAMERA.rotation),
  };
}

function normalizeLights(value: unknown, allowEmpty = false): SceneLight[] {
  if (!Array.isArray(value)) {
    return allowEmpty
      ? []
      : [{ ...DEFAULT_LIGHT, id: THREE.MathUtils.generateUUID(), name: "Light A" }];
  }

  const lights = value
    .map((entry, index) => normalizeLight(entry, index))
    .filter((entry): entry is SceneLight => entry !== null);

  if (lights.length > 0 || allowEmpty) {
    return lights;
  }

  return [{ ...DEFAULT_LIGHT, id: THREE.MathUtils.generateUUID(), name: "Light A" }];
}

function normalizeCameras(value: unknown): SceneCamera[] {
  if (!Array.isArray(value)) {
    return [structuredClone(DEFAULT_CAMERA)];
  }

  const cameras = value
    .map((entry, index) => normalizeCamera(entry, index))
    .filter((entry): entry is SceneCamera => entry !== null);

  return cameras.length > 0 ? cameras : [structuredClone(DEFAULT_CAMERA)];
}

function normalizeLegacyActiveCameraId(
  input: UnknownRecord,
  cameras: SceneCamera[]
) {
  const legacyCameras = Array.isArray(input.cameras) ? input.cameras : [];
  const selectedLegacyCamera = legacyCameras.find(
    (entry): entry is UnknownRecord => isRecord(entry) && entry.selected === true
  );

  if (selectedLegacyCamera && typeof selectedLegacyCamera.id === "string") {
    const match = cameras.find((camera) => camera.id === selectedLegacyCamera.id);
    if (match) {
      return match.id;
    }
  }

  return cameras[0].id;
}

export function createSceneSnapshot(
  lights: SceneLight[],
  cameras: SceneCamera[],
  activeCameraId: string,
  iblRotation: number
): SceneSnapshot {
  const normalizedLights = normalizeLights(lights);
  const normalizedCameras = normalizeCameras(cameras);
  const selectedCameraId = normalizedCameras.some(
    (camera) => camera.id === activeCameraId
  )
    ? activeCameraId
    : normalizedCameras[0].id;

  return {
    version: 2,
    lights: structuredClone(normalizeLights(normalizedLights, true)),
    cameras: structuredClone(normalizedCameras),
    activeCameraId: selectedCameraId,
    iblRotation: asFiniteNumber(iblRotation, 0),
  };
}

export function parseSceneSnapshot(input: unknown): SceneSnapshot | null {
  if (!isRecord(input)) {
    return null;
  }

  const lights = normalizeLights(input.lights, true);
  const cameras = normalizeCameras(input.cameras);
  const iblRotation = asFiniteNumber(input.iblRotation, 0);

  if (input.version === 2) {
    return createSceneSnapshot(
      lights,
      cameras,
      asString(input.activeCameraId, cameras[0].id),
      iblRotation
    );
  }

  if (input.version === 1) {
    return createSceneSnapshot(
      lights,
      cameras,
      normalizeLegacyActiveCameraId(input, cameras),
      iblRotation
    );
  }

  return null;
}

export function parseProjectSettingsSnapshot(input: unknown): {
  snapshot: SceneSnapshot;
  imageBasename?: string;
} | null {
  const snapshot = parseSceneSnapshot(input);
  if (!snapshot || !isRecord(input)) {
    return null;
  }

  return {
    snapshot,
    imageBasename:
      typeof input.imageBasename === "string" ? input.imageBasename : undefined,
  };
}

export function createProjectSettingsSnapshot(
  snapshot: SceneSnapshot,
  imageBasename?: string
): ProjectSettingsSnapshot {
  return {
    ...structuredClone(snapshot),
    imageBasename,
  };
}
