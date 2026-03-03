import * as THREE from "three";
import { atom } from "jotai";
import { atomWithStorage, splitAtom } from "jotai/utils";
import type {
  SceneCamera,
  SceneLight,
  SceneSnapshot,
} from "./utils/sceneSnapshot";
import { normalizeLatLon } from "./utils/coordinates";
import { createSceneSnapshot, parseSceneSnapshot } from "./utils/sceneSnapshot";
import { withBasePath } from "./utils/withBasePath";

type SetStateAction<T> = T | ((prev: T) => T);

type LightUiState = {
  selected: boolean;
  solo: boolean;
};

type CameraUiState = {
  selected: boolean;
};

export type Camera = SceneCamera & CameraUiState;
export type Light = SceneLight & LightUiState;

export type TextureLight = Extract<Light, { type: "texture" }>;
export type ProceduralScrimLight = Extract<Light, { type: "procedural_scrim" }>;
export type ProceduralUmbrellaLight = Extract<
  Light,
  { type: "procedural_umbrella" }
>;
export type SkyGradientLight = Extract<Light, { type: "sky_gradient" }>;

type SceneHistoryState = {
  entries: SceneSnapshot[];
  index: number;
  hydrated: boolean;
};

const SCENE_HISTORY_LIMIT = 100;

const defaultLightsData: SceneLight[] = [
  {
    name: "Light A",
    id: THREE.MathUtils.generateUUID(),
    shape: "rect",
    type: "procedural_scrim",
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
  },
];

const defaultCamerasData: SceneCamera[] = [
  {
    id: "default",
    name: "Default",
    position: [0, 0, 5],
    rotation: [0, 0, 0],
  },
];

function cloneSnapshot<T>(value: T): T {
  return structuredClone(value);
}

function stripLightUiState(light: Light): SceneLight {
  const { selected: _selected, solo: _solo, ...sceneLight } = light;
  return sceneLight;
}

function stripCameraUiState(camera: Camera): SceneCamera {
  const { selected: _selected, ...sceneCamera } = camera;
  return sceneCamera;
}

function combineLights(
  lights: SceneLight[],
  selectedLightId: string | null,
  soloLightId: string | null
): Light[] {
  return lights.map((light) => ({
    ...light,
    selected: light.id === selectedLightId,
    solo: light.id === soloLightId,
  }));
}

function combineCameras(
  cameras: SceneCamera[],
  selectedCameraId: string
): Camera[] {
  const fallbackId = cameras[0]?.id ?? "default";
  const activeCameraId = cameras.some((camera) => camera.id === selectedCameraId)
    ? selectedCameraId
    : fallbackId;

  return cameras.map((camera) => ({
    ...camera,
    selected: camera.id === activeCameraId,
  }));
}

function splitLights(lights: Light[]) {
  return {
    lightsData: lights.map(stripLightUiState),
    selectedLightId: lights.find((light) => light.selected)?.id ?? null,
    soloLightId: lights.find((light) => light.solo)?.id ?? null,
  };
}

function splitCameras(cameras: Camera[]) {
  return {
    camerasData: cameras.map(stripCameraUiState),
    selectedCameraId: cameras.find((camera) => camera.selected)?.id ?? null,
  };
}

function normalizeSceneHistory(
  entries: unknown[] | undefined,
  index: number | undefined,
  fallback: SceneSnapshot
): Pick<SceneHistoryState, "entries" | "index"> {
  const normalizedEntries = (entries ?? [])
    .map((entry) => parseSceneSnapshot(entry))
    .filter((entry): entry is SceneSnapshot => entry !== null)
    .slice(-SCENE_HISTORY_LIMIT);

  if (normalizedEntries.length === 0) {
    return { entries: [fallback], index: 0 };
  }

  const rawIndex =
    typeof index === "number" && Number.isFinite(index)
      ? Math.trunc(index)
      : normalizedEntries.length - 1;
  const clampedIndex = Math.min(
    Math.max(rawIndex, 0),
    normalizedEntries.length - 1
  );

  return {
    entries: normalizedEntries,
    index: clampedIndex,
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

function lightExists(lights: SceneLight[], lightId: string | null) {
  return !!lightId && lights.some((light) => light.id === lightId);
}

function cameraExists(cameras: SceneCamera[], cameraId: string | null) {
  return !!cameraId && cameras.some((camera) => camera.id === cameraId);
}

function updateLightList(
  lights: SceneLight[],
  lightId: string,
  updater: (light: SceneLight) => SceneLight
) {
  let changed = false;
  const nextLights = lights.map((light) => {
    if (light.id !== lightId) {
      return light;
    }
    changed = true;
    return updater(light);
  });

  return changed ? nextLights : null;
}

const defaultSceneSnapshot = createSceneSnapshot(
  defaultLightsData,
  defaultCamerasData,
  defaultCamerasData[0].id,
  0
);

const lightsDataStateAtom = atom<SceneLight[]>(
  cloneSnapshot(defaultSceneSnapshot.lights)
);
const selectedLightIdStateAtom = atom<string | null>(null);
const soloLightIdStateAtom = atom<string | null>(null);
const camerasDataStateAtom = atom<SceneCamera[]>(
  cloneSnapshot(defaultSceneSnapshot.cameras)
);
const selectedCameraIdStateAtom = atom<string>(defaultSceneSnapshot.activeCameraId);
const iblRotationStateAtom = atom<number>(0);
const isApplyingSceneSnapshotAtom = atom(false);
const sceneDirtyAtom = atom(false);

export { createSceneSnapshot, type SceneSnapshot };

export const debugAtom = atom(false);

export const modeAtom = atomWithStorage("mode", {
  scene: true,
  hdri: true,
  code: false,
});

export const imageBasenameAtom = atomWithStorage("image-basename", "envmap");
export const jsonSaveFilenameAtom = atomWithStorage("json-save-filename", "");
export const projectDirectoryHandleAtom = atom<FileSystemDirectoryHandle | null>(
  null
);

export const activeModesAtom = atom((get) => {
  const mode = get(modeAtom);
  return Object.keys(mode).filter((key) => mode[key as keyof typeof mode]);
});

export const projectDirectoryNameAtom = atom(
  (get) => get(projectDirectoryHandleAtom)?.name ?? null
);

export const isLightPaintingAtom = atom(false);

export const modelUrlAtom = atom(withBasePath("911-transformed.glb"));

export const envMapTextureAtom = atom<THREE.CubeTexture | null>(null);
export const sceneRendererAtom = atom<THREE.WebGLRenderer | null>(null);

export const isCommandPaletteOpenAtom = atom(false);

export const pointerAtom = atom({
  point: new THREE.Vector3(),
  normal: new THREE.Vector3(),
});

export const sceneHistoryAtom = atom<SceneHistoryState>({
  entries: [defaultSceneSnapshot],
  index: 0,
  hydrated: false,
});

export const currentSceneSnapshotAtom = atom((get) =>
  createSceneSnapshot(
    get(lightsDataStateAtom),
    get(camerasDataStateAtom),
    get(selectedCameraIdStateAtom),
    get(iblRotationStateAtom)
  )
);

const pushSceneHistoryAtom = atom(null, (get, set, snapshot?: SceneSnapshot) => {
  if (get(isApplyingSceneSnapshotAtom)) {
    return;
  }

  const history = get(sceneHistoryAtom);
  const nextSnapshot = snapshot ?? get(currentSceneSnapshotAtom);
  const next = appendSceneHistory(history, nextSnapshot);

  set(sceneHistoryAtom, {
    ...history,
    ...next,
  });
});

export const lightsAtom = atom(
  (get) =>
    combineLights(
      get(lightsDataStateAtom),
      get(selectedLightIdStateAtom),
      get(soloLightIdStateAtom)
    ),
  (get, set, update: SetStateAction<Light[]>) => {
    const previous = get(lightsAtom);
    const next =
      typeof update === "function"
        ? (update as (prev: Light[]) => Light[])(previous)
        : update;
    const nextState = splitLights(next);
    const normalizedSnapshot = createSceneSnapshot(
      nextState.lightsData,
      get(camerasDataStateAtom),
      get(selectedCameraIdStateAtom),
      get(iblRotationStateAtom)
    );

    set(lightsDataStateAtom, normalizedSnapshot.lights);
    set(
      selectedLightIdStateAtom,
      lightExists(normalizedSnapshot.lights, nextState.selectedLightId)
        ? nextState.selectedLightId
        : null
    );
    set(
      soloLightIdStateAtom,
      lightExists(normalizedSnapshot.lights, nextState.soloLightId)
        ? nextState.soloLightId
        : null
    );
    set(sceneDirtyAtom, true);
  }
);

export const lightIdsAtom = atom((get) => get(lightsAtom).map((light) => light.id));

export const lightAtomsAtom = splitAtom(lightsAtom, (light) => light.id);

export const isSoloAtom = atom((get) => get(soloLightIdStateAtom) !== null);

export const isLightSelectedAtom = atom(
  (get) => get(selectedLightIdStateAtom) !== null
);

export const selectLightAtom = atom(null, (get, set, lightId: Light["id"]) => {
  if (!lightExists(get(lightsDataStateAtom), lightId)) {
    return;
  }
  set(selectedLightIdStateAtom, lightId);
});

export const deselectLightsAtom = atom(null, (_get, set) => {
  set(selectedLightIdStateAtom, null);
});

export const toggleSoloAtom = atom(null, (get, set, lightId: Light["id"]) => {
  if (!lightExists(get(lightsDataStateAtom), lightId)) {
    return;
  }

  const currentSolo = get(soloLightIdStateAtom);
  set(soloLightIdStateAtom, currentSolo === lightId ? null : lightId);
  set(selectedLightIdStateAtom, lightId);
});

export const toggleLightSelectionAtom = atom(
  null,
  (get, set, lightId: Light["id"]) => {
    if (!lightExists(get(lightsDataStateAtom), lightId)) {
      return;
    }

    set(
      selectedLightIdStateAtom,
      get(selectedLightIdStateAtom) === lightId ? null : lightId
    );
  }
);

export const duplicateLightAtom = atom(
  null,
  (get, set, lightId: Light["id"]) => {
    const lights = get(lightsDataStateAtom);
    const light = lights.find((entry) => entry.id === lightId);
    if (!light) {
      return;
    }

    const newLight: SceneLight = {
      ...structuredClone(light),
      id: THREE.MathUtils.generateUUID(),
      name: `${light.name} (copy)`,
      latlon: normalizeLatLon({
        x: light.latlon.x + 0.05,
        y: light.latlon.y - 0.03,
      }),
    };

    set(lightsDataStateAtom, [...lights, newLight]);
    set(selectedLightIdStateAtom, newLight.id);
    set(soloLightIdStateAtom, null);
    set(sceneDirtyAtom, true);
  }
);

export const addLightAtom = atom(null, (_get, set, light: SceneLight) => {
  set(lightsDataStateAtom, (lights) => [...lights, structuredClone(light)]);
  set(sceneDirtyAtom, true);
});

export const updateLightByIdAtom = atom(
  null,
  (
    get,
    set,
    payload: {
      lightId: Light["id"];
      updater: (light: Light) => Light;
    }
  ) => {
    const currentLights = get(lightsAtom);
    const nextLights = currentLights.map((light) =>
      light.id === payload.lightId ? payload.updater(light) : light
    );
    set(lightsAtom, nextLights);
  }
);

export const toggleLightVisibilityAtom = atom(
  null,
  (get, set, lightId: Light["id"]) => {
    const nextLights = updateLightList(get(lightsDataStateAtom), lightId, (light) => ({
      ...light,
      visible: !light.visible,
    }));
    if (!nextLights) {
      return;
    }
    set(lightsDataStateAtom, nextLights);
    set(sceneDirtyAtom, true);
  }
);

export const reorderLightsAtom = atom(
  null,
  (
    get,
    set,
    payload: {
      activeId: Light["id"];
      overId: Light["id"];
    }
  ) => {
    const lights = get(lightsDataStateAtom);
    const oldIndex = lights.findIndex((light) => light.id === payload.activeId);
    const newIndex = lights.findIndex((light) => light.id === payload.overId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
      return;
    }

    const nextLights = [...lights];
    const [moved] = nextLights.splice(oldIndex, 1);
    nextLights.splice(newIndex, 0, moved);
    set(lightsDataStateAtom, nextLights);
    set(sceneDirtyAtom, true);
  }
);

export const deleteLightAtom = atom(null, (get, set, lightId: Light["id"]) => {
  const lights = get(lightsDataStateAtom);
  if (!lights.some((light) => light.id === lightId)) {
    return;
  }

  const nextLights = lights.filter((light) => light.id !== lightId);
  set(lightsDataStateAtom, nextLights);

  if (get(selectedLightIdStateAtom) === lightId) {
    set(selectedLightIdStateAtom, null);
  }
  if (get(soloLightIdStateAtom) === lightId) {
    set(soloLightIdStateAtom, null);
  }

  set(sceneDirtyAtom, true);
});

export const camerasAtom = atom(
  (get) => combineCameras(get(camerasDataStateAtom), get(selectedCameraIdStateAtom)),
  (get, set, update: SetStateAction<Camera[]>) => {
    const previous = get(camerasAtom);
    const next =
      typeof update === "function"
        ? (update as (prev: Camera[]) => Camera[])(previous)
        : update;
    const nextState = splitCameras(next);
    const normalizedSnapshot = createSceneSnapshot(
      get(lightsDataStateAtom),
      nextState.camerasData,
      cameraExists(nextState.camerasData, nextState.selectedCameraId)
        ? nextState.selectedCameraId!
        : get(selectedCameraIdStateAtom),
      get(iblRotationStateAtom)
    );

    set(camerasDataStateAtom, normalizedSnapshot.cameras);
    set(selectedCameraIdStateAtom, normalizedSnapshot.activeCameraId);
    set(sceneDirtyAtom, true);
  }
);

export const addCameraAtom = atom(null, (_get, set, camera: SceneCamera) => {
  set(camerasDataStateAtom, (cameras) => [...cameras, structuredClone(camera)]);
  set(sceneDirtyAtom, true);
});

export const iblRotationAtom = atom(
  (get) => get(iblRotationStateAtom),
  (_get, set, value: number) => {
    set(iblRotationStateAtom, value);
    set(sceneDirtyAtom, true);
  }
);

export const cameraAtomsAtom = splitAtom(camerasAtom, (camera) => camera.id);

export const selectedCameraAtom = atom(
  (get) => {
    const cameras = get(camerasAtom);
    return cameras.find((camera) => camera.selected) ?? cameras[0];
  },
  (get, set, value: Partial<Camera>) => {
    const selectedCameraId = get(selectedCameraIdStateAtom);
    set(
      camerasAtom,
      get(camerasAtom).map((camera) =>
        camera.id === selectedCameraId ? { ...camera, ...value } : camera
      )
    );
  }
);

export const isCameraSelectedAtom = atom(
  (get) => get(camerasAtom).length > 0
);

export const toggleCameraSelectionAtom = atom(
  null,
  (get, set, cameraId: Camera["id"]) => {
    if (!cameraExists(get(camerasDataStateAtom), cameraId)) {
      return;
    }
    if (get(selectedCameraIdStateAtom) === cameraId) {
      return;
    }
    set(selectedCameraIdStateAtom, cameraId);
    set(sceneDirtyAtom, true);
  }
);

export const selectCameraAtom = atom(
  null,
  (get, set, cameraId: Camera["id"]) => {
    if (!cameraExists(get(camerasDataStateAtom), cameraId)) {
      return;
    }
    if (get(selectedCameraIdStateAtom) === cameraId) {
      return;
    }
    set(selectedCameraIdStateAtom, cameraId);
    set(sceneDirtyAtom, true);
  }
);

export const updateSelectedCameraTransformAtom = atom(
  null,
  (
    get,
    set,
    value: Pick<SceneCamera, "position" | "rotation">
  ) => {
    const selectedCameraId = get(selectedCameraIdStateAtom);
    set(
      camerasAtom,
      get(camerasAtom).map((camera) =>
        camera.id === selectedCameraId ? { ...camera, ...value } : camera
      )
    );
  }
);

export const updateSelectedLightsPlacementAtom = atom(
  null,
  (
    get,
    set,
    value: {
      target: SceneLight["target"];
      latlon: SceneLight["latlon"];
    }
  ) => {
    set(
      lightsAtom,
      get(lightsAtom).map((light) =>
        light.selected
          ? {
              ...light,
              target: value.target,
              latlon: value.latlon,
            }
          : light
      )
    );
  }
);

export const canUndoSceneAtom = atom((get) => get(sceneHistoryAtom).index > 0);
export const canRedoSceneAtom = atom((get) => {
  const history = get(sceneHistoryAtom);
  return history.index < history.entries.length - 1;
});

function applySnapshotState(set: any, snapshot: SceneSnapshot) {
  set(lightsDataStateAtom, cloneSnapshot(snapshot.lights));
  set(camerasDataStateAtom, cloneSnapshot(snapshot.cameras));
  set(selectedCameraIdStateAtom, snapshot.activeCameraId);
  set(selectedLightIdStateAtom, null);
  set(soloLightIdStateAtom, null);
  set(iblRotationStateAtom, snapshot.iblRotation);
}

export const applySceneSnapshotAtom = atom(
  null,
  (_get, set, snapshot: SceneSnapshot) => {
    const nextSnapshot = createSceneSnapshot(
      snapshot.lights,
      snapshot.cameras,
      snapshot.activeCameraId,
      snapshot.iblRotation
    );
    set(isApplyingSceneSnapshotAtom, true);
    applySnapshotState(set, nextSnapshot);
    set(isApplyingSceneSnapshotAtom, false);
    set(sceneDirtyAtom, false);
    set(sceneHistoryAtom, {
      entries: [nextSnapshot],
      index: 0,
      hydrated: true,
    });
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
  applySnapshotState(set, snapshot);
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
  applySnapshotState(set, snapshot);
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
    payload: { entries: unknown[]; index: number } | null | undefined
  ) => {
    if (get(sceneHistoryAtom).hydrated) {
      return;
    }

    const fallback = get(currentSceneSnapshotAtom);
    const normalized = normalizeSceneHistory(
      payload?.entries,
      payload?.index,
      fallback
    );
    const current = normalized.entries[normalized.index];

    set(isApplyingSceneSnapshotAtom, true);
    applySnapshotState(set, current);
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
  if (!get(sceneDirtyAtom)) {
    return;
  }

  set(sceneDirtyAtom, false);
  set(pushSceneHistoryAtom, get(currentSceneSnapshotAtom));
});
