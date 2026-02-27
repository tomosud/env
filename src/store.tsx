import * as THREE from "three";
import { atom } from "jotai";
import { splitAtom, atomWithStorage } from "jotai/utils";
import { withBasePath } from "./utils/withBasePath";

type SetStateAction<T> = T | ((prev: T) => T);

export type Camera = {
  id: string;
  name: string;
  selected: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
};

type BaseLight = {
  id: string;
  ts: number;
  name: string;

  shape: "rect" | "circle" | "ring";
  intensity: number;
  opacity: number;

  scale: number;
  scaleX: number;
  scaleY: number;
  rotation: number;

  latlon: { x: number; y: number };
  target: { x: number; y: number; z: number };

  selected: boolean;
  visible: boolean;
  solo: boolean;

  animate: boolean;
  animationSpeed?: number;
  animationRotationIntensity?: number;
  animationFloatIntensity?: number;
  animationFloatingRange?: [number, number];
};

export type TextureLight = BaseLight & {
  type: "texture";
  color: string;
  map: string;
};

export type ProceduralScrimLight = BaseLight & {
  type: "procedural_scrim";
  color: string;
  lightPosition: { x: number; y: number };
  lightDistance: number;
};

export type ProceduralUmbrellaLight = BaseLight & {
  type: "procedural_umbrella";
  color: string;
  lightSides: number;
};

export type SkyGradientLight = BaseLight & {
  type: "sky_gradient";
  color: string;
  color2: string;
};

export type Light =
  | TextureLight
  | ProceduralScrimLight
  | ProceduralUmbrellaLight
  | SkyGradientLight;

export const debugAtom = atom(false);

export const modeAtom = atomWithStorage("mode", {
  scene: true,
  hdri: true,
  code: false,
});

export const activeModesAtom = atom((get) => {
  const mode = get(modeAtom);
  return Object.keys(mode).filter((key) => mode[key as keyof typeof mode]);
});

export const isLightPaintingAtom = atom(false);

export const modelUrlAtom = atom(withBasePath("911-transformed.glb"));

export const envMapTextureAtom = atom<THREE.CubeTexture | null>(null);
export const sceneRendererAtom = atom<THREE.WebGLRenderer | null>(null);

export const isCommandPaletteOpenAtom = atom(false);

export const pointerAtom = atom({
  point: new THREE.Vector3(),
  normal: new THREE.Vector3(),
});

const defaultLights: Light[] = [
  {
    name: `Light A`,
    id: THREE.MathUtils.generateUUID(),
    ts: Date.now(),
    shape: "rect",
    type: "procedural_scrim",
    color: "#fff",
    latlon: { x: 0, y: 0 },
    intensity: 1,
    rotation: 0,
    scale: 2,
    scaleX: 1,
    scaleY: 1,
    target: { x: 0, y: 0, z: 0 },
    selected: false,
    visible: true,
    solo: false,
    opacity: 1,
    animate: false,
    lightDistance: 0.3,
    lightPosition: { x: 0, y: 0 },
  },
];

const defaultCameras: Camera[] = [
  {
    id: "default",
    name: "Default",
    selected: true,
    position: [0, 0, 5],
    rotation: [0, 0, 0],
  },
];

export type SceneSnapshot = {
  version: 1;
  lights: Light[];
  cameras: Camera[];
  iblRotation: number;
};

type SceneHistoryState = {
  entries: SceneSnapshot[];
  index: number;
  hydrated: boolean;
};

const SCENE_HISTORY_LIMIT = 100;

function cloneSnapshot<T>(value: T): T {
  return structuredClone(value);
}

function createSceneSnapshot(
  lights: Light[],
  cameras: Camera[],
  iblRotation: number
): SceneSnapshot {
  return {
    version: 1,
    lights: cloneSnapshot(lights),
    cameras: cloneSnapshot(cameras),
    iblRotation,
  };
}

function snapshotsEqual(a: SceneSnapshot, b: SceneSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function appendSceneHistory(
  history: SceneHistoryState,
  snapshot: SceneSnapshot
): Pick<SceneHistoryState, "entries" | "index"> {
  const current = history.entries[history.index];
  if (current && snapshotsEqual(current, snapshot)) {
    return {
      entries: history.entries,
      index: history.index,
    };
  }

  const truncated = history.entries.slice(0, history.index + 1);
  truncated.push(cloneSnapshot(snapshot));

  if (truncated.length > SCENE_HISTORY_LIMIT) {
    const trimmed = truncated.slice(truncated.length - SCENE_HISTORY_LIMIT);
    return {
      entries: trimmed,
      index: trimmed.length - 1,
    };
  }

  return {
    entries: truncated,
    index: truncated.length - 1,
  };
}

function normalizeSceneHistory(
  entries: SceneSnapshot[] | undefined,
  index: number | undefined,
  fallback: SceneSnapshot
): Pick<SceneHistoryState, "entries" | "index"> {
  if (!entries || entries.length === 0) {
    return { entries: [fallback], index: 0 };
  }

  const trimmed = entries
    .filter(
      (entry): entry is SceneSnapshot =>
        entry?.version === 1 &&
        Array.isArray(entry.lights) &&
        Array.isArray(entry.cameras)
    )
    .slice(-SCENE_HISTORY_LIMIT)
    .map((entry) =>
      createSceneSnapshot(
        entry.lights,
        entry.cameras,
        typeof entry.iblRotation === "number" ? entry.iblRotation : 0
      )
    );

  if (trimmed.length === 0) {
    return { entries: [fallback], index: 0 };
  }

  const rawIndex = typeof index === "number" ? index : trimmed.length - 1;
  const maxIndex = trimmed.length - 1;
  const clampedIndex = Math.min(Math.max(rawIndex, 0), maxIndex);

  return {
    entries: trimmed,
    index: clampedIndex,
  };
}

const defaultSceneSnapshot = createSceneSnapshot(defaultLights, defaultCameras, 0);

const lightsStateAtom = atom<Light[]>(cloneSnapshot(defaultLights));
const camerasStateAtom = atom<Camera[]>(cloneSnapshot(defaultCameras));
const iblRotationStateAtom = atom<number>(0);
const isApplyingSceneSnapshotAtom = atom(false);
const sceneDirtyAtom = atom(false);

export const sceneHistoryAtom = atom<SceneHistoryState>({
  entries: [defaultSceneSnapshot],
  index: 0,
  hydrated: false,
});

const pushSceneHistoryAtom = atom(
  null,
  (get, set, snapshot?: SceneSnapshot) => {
    if (get(isApplyingSceneSnapshotAtom)) {
      return;
    }

    const history = get(sceneHistoryAtom);
    const nextSnapshot = snapshot
      ? createSceneSnapshot(
          snapshot.lights,
          snapshot.cameras,
          snapshot.iblRotation
        )
      : createSceneSnapshot(
          get(lightsStateAtom),
          get(camerasStateAtom),
          get(iblRotationStateAtom)
        );
    const next = appendSceneHistory(history, nextSnapshot);

    set(sceneHistoryAtom, {
      ...history,
      ...next,
    });
  }
);

export const lightsAtom = atom(
  (get) => get(lightsStateAtom),
  (get, set, update: SetStateAction<Light[]>) => {
    const previous = get(lightsStateAtom);
    const next =
      typeof update === "function"
        ? (update as (prev: Light[]) => Light[])(previous)
        : update;
    set(lightsStateAtom, next);
    set(sceneDirtyAtom, true);
  }
);

export const lightIdsAtom = atom((get) => get(lightsAtom).map((l) => l.id));

export const lightAtomsAtom = splitAtom(lightsAtom);

export const isSoloAtom = atom((get) => {
  const lights = get(lightsAtom);
  return lights.length > 0 && lights.some((l) => l.solo);
});

export const isLightSelectedAtom = atom((get) => {
  const lights = get(lightsAtom);
  return lights.length > 0 && lights.some((l) => l.selected);
});

export const selectLightAtom = atom(null, (get, set, lightId: Light["id"]) => {
  set(lightsAtom, (lights) =>
    lights.map((l) => ({
      ...l,
      selected: l.id === lightId,
    }))
  );
});

export const deselectLightsAtom = atom(null, (get, set) => {
  set(lightsAtom, (lights) =>
    lights.map((l) => ({
      ...l,
      selected: false,
    }))
  );
});

export const toggleSoloAtom = atom(null, (get, set, lightId: Light["id"]) => {
  const lights = get(lightsAtom);
  const light = lights.find((l) => l.id === lightId)!;
  const isSolo = get(isSoloAtom);

  if (isSolo && light.solo) {
    set(
      lightsAtom,
      lights.map((l) => ({
        ...l,
        solo: false,
        visible: true,
      }))
    );
  } else {
    set(
      lightsAtom,
      lights.map((l) => ({
        ...l,
        solo: l.id === lightId,
        visible: l.id === lightId,
        selected: l.id === lightId,
      }))
    );
  }
});

export const toggleLightSelectionAtom = atom(
  null,
  (get, set, lightId: Light["id"]) => {
    set(lightsAtom, (lights) =>
      lights.map((l) => ({
        ...l,
        selected: l.id === lightId ? !l.selected : false,
      }))
    );
  }
);

export const duplicateLightAtom = atom(
  null,
  (get, set, lightId: Light["id"]) => {
    const lights = get(lightsAtom);
    const light = lights.find((l) => l.id === lightId)!;
    const isSolo = get(isSoloAtom);
    const newLight = {
      ...structuredClone(light),
      visible: isSolo ? false : light.visible,
      solo: false,
      selected: false,
      id: THREE.MathUtils.generateUUID(),
      name: `${light.name} (copy)`,
    };
    set(lightsAtom, [...lights, newLight]);
  }
);

export const deleteLightAtom = atom(null, (get, set, lightId: Light["id"]) => {
  const lights = get(lightsAtom);
  const light = lights.find((l) => l.id === lightId)!;
  const isSolo = get(isSoloAtom);

  const newLights = lights.filter((l) => l.id !== lightId);

  if (isSolo && light.solo) {
    set(
      lightsAtom,
      newLights.map((l) => ({
        ...l,
        solo: false,
        visible: true,
      }))
    );
  } else {
    set(lightsAtom, newLights);
  }
});

export const camerasAtom = atom(
  (get) => get(camerasStateAtom),
  (get, set, update: SetStateAction<Camera[]>) => {
    const previous = get(camerasStateAtom);
    const next =
      typeof update === "function"
        ? (update as (prev: Camera[]) => Camera[])(previous)
        : update;
    set(camerasStateAtom, next);
    set(sceneDirtyAtom, true);
  }
);

export const iblRotationAtom = atom(
  (get) => get(iblRotationStateAtom),
  (get, set, value: number) => {
    set(iblRotationStateAtom, value);
    set(sceneDirtyAtom, true);
  }
);

export const cameraAtomsAtom = splitAtom(camerasAtom);

export const selectedCameraAtom = atom(
  (get) => {
    const cameras = get(camerasAtom);
    return cameras.find((c) => c.selected)!;
  },
  (get, set, value: Partial<Camera>) => {
    const cameras = get(camerasAtom);
    const selectedCamera = cameras.find((c) => c.selected)!;
    set(
      camerasAtom,
      cameras.map((c) => (c.id === selectedCamera.id ? { ...c, ...value } : c))
    );
  }
);

export const isCameraSelectedAtom = atom((get) => {
  const cameras = get(camerasAtom);
  return cameras.length > 0 && cameras.some((c) => c.selected);
});

export const toggleCameraSelectionAtom = atom(
  null,
  (get, set, cameraId: Camera["id"]) => {
    set(camerasAtom, (cameras) =>
      cameras.map((c) => ({
        ...c,
        selected: c.id === cameraId ? !c.selected : false,
      }))
    );
  }
);

export const selectCameraAtom = atom(
  null,
  (get, set, cameraId: Camera["id"]) => {
    set(camerasAtom, (cameras) =>
      cameras.map((c) => ({
        ...c,
        selected: c.id === cameraId,
      }))
    );
  }
);

export const canUndoSceneAtom = atom((get) => get(sceneHistoryAtom).index > 0);
export const canRedoSceneAtom = atom((get) => {
  const history = get(sceneHistoryAtom);
  return history.index < history.entries.length - 1;
});

export const applySceneSnapshotAtom = atom(
  null,
  (get, set, snapshot: SceneSnapshot) => {
    set(isApplyingSceneSnapshotAtom, true);
    set(lightsStateAtom, cloneSnapshot(snapshot.lights));
    set(camerasStateAtom, cloneSnapshot(snapshot.cameras));
    set(iblRotationStateAtom, snapshot.iblRotation);
    set(isApplyingSceneSnapshotAtom, false);
    set(sceneDirtyAtom, false);
    set(pushSceneHistoryAtom, snapshot);
  }
);

export const undoSceneAtom = atom(null, (get, set) => {
  const history = get(sceneHistoryAtom);
  if (history.index <= 0) {
    return;
  }

  const nextIndex = history.index - 1;
  const snapshot = history.entries[nextIndex];

  set(isApplyingSceneSnapshotAtom, true);
  set(lightsStateAtom, cloneSnapshot(snapshot.lights));
  set(camerasStateAtom, cloneSnapshot(snapshot.cameras));
  set(iblRotationStateAtom, snapshot.iblRotation);
  set(isApplyingSceneSnapshotAtom, false);
  set(sceneDirtyAtom, false);
  set(sceneHistoryAtom, {
    ...history,
    index: nextIndex,
  });
});

export const redoSceneAtom = atom(null, (get, set) => {
  const history = get(sceneHistoryAtom);
  if (history.index >= history.entries.length - 1) {
    return;
  }

  const nextIndex = history.index + 1;
  const snapshot = history.entries[nextIndex];

  set(isApplyingSceneSnapshotAtom, true);
  set(lightsStateAtom, cloneSnapshot(snapshot.lights));
  set(camerasStateAtom, cloneSnapshot(snapshot.cameras));
  set(iblRotationStateAtom, snapshot.iblRotation);
  set(isApplyingSceneSnapshotAtom, false);
  set(sceneDirtyAtom, false);
  set(sceneHistoryAtom, {
    ...history,
    index: nextIndex,
  });
});

export const hydrateSceneHistoryAtom = atom(
  null,
  (
    get,
    set,
    payload: { entries: SceneSnapshot[]; index: number } | null | undefined
  ) => {
    const fallback = createSceneSnapshot(
      get(lightsStateAtom),
      get(camerasStateAtom),
      get(iblRotationStateAtom)
    );
    const normalized = normalizeSceneHistory(
      payload?.entries,
      payload?.index,
      fallback
    );
    const current = normalized.entries[normalized.index];

    set(isApplyingSceneSnapshotAtom, true);
    set(lightsStateAtom, cloneSnapshot(current.lights));
    set(camerasStateAtom, cloneSnapshot(current.cameras));
    set(iblRotationStateAtom, current.iblRotation);
    set(isApplyingSceneSnapshotAtom, false);
    set(sceneDirtyAtom, false);
    set(sceneHistoryAtom, {
      entries: normalized.entries,
      index: normalized.index,
      hydrated: true,
    });
  }
);

export const isSceneDirtyAtom = atom((get) => get(sceneDirtyAtom));

export const commitSceneHistoryAtom = atom(null, (get, set) => {
  const isDirty = get(sceneDirtyAtom);
  if (!isDirty) {
    return;
  }

  const snapshot = createSceneSnapshot(
    get(lightsStateAtom),
    get(camerasStateAtom),
    get(iblRotationStateAtom)
  );
  set(sceneDirtyAtom, false);
  set(pushSceneHistoryAtom, snapshot);
});
