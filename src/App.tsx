import { useCallback, useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { AppContent } from "./components/AppContent";
import { AppLayout } from "./components/AppLayout";
import { AppToolbar } from "./components/AppToolbar";
import { CommandPalette } from "./components/CommandPalette";
import {
  applySceneSnapshotAtom,
  camerasAtom,
  commitSceneHistoryAtom,
  hydrateSceneHistoryAtom,
  iblRotationAtom,
  isSceneDirtyAtom,
  lightsAtom,
  projectDirectoryHandleAtom,
  sceneHistoryAtom,
  type SceneSnapshot,
} from "./store";
import type { SettingsSnapshot } from "./utils/exportEnvMap";
import { idbGet, idbSet } from "./utils/indexedDb";

const SCENE_HISTORY_KEY = "scene-history-v1";
const PROJECT_DIRECTORY_HANDLE_KEY = "project-directory-handle-v1";

function SceneHistoryPersistence() {
  const hydrateSceneHistory = useSetAtom(hydrateSceneHistoryAtom);
  const commitSceneHistory = useSetAtom(commitSceneHistoryAtom);
  const history = useAtomValue(sceneHistoryAtom);
  const lights = useAtomValue(lightsAtom);
  const cameras = useAtomValue(camerasAtom);
  const iblRotation = useAtomValue(iblRotationAtom);
  const isSceneDirty = useAtomValue(isSceneDirtyAtom);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const saved = await idbGet<{ entries: SceneSnapshot[]; index: number }>(
          SCENE_HISTORY_KEY
        );
        if (!cancelled) {
          hydrateSceneHistory(saved ?? null);
        }
      } catch (error) {
        console.warn("Failed to load scene history from IndexedDB.", error);
        if (!cancelled) {
          hydrateSceneHistory(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrateSceneHistory]);

  useEffect(() => {
    if (!history.hydrated) {
      return;
    }

    void idbSet(SCENE_HISTORY_KEY, {
      entries: history.entries,
      index: history.index,
    }).catch((error) => {
      console.warn("Failed to save scene history to IndexedDB.", error);
    });
  }, [history.entries, history.index, history.hydrated]);

  useEffect(() => {
    if (!history.hydrated || !isSceneDirty) {
      return;
    }

    const timer = setTimeout(() => {
      commitSceneHistory();
    }, 350);

    return () => {
      clearTimeout(timer);
    };
  }, [history.hydrated, isSceneDirty, lights, cameras, iblRotation, commitSceneHistory]);

  useEffect(() => {
    if (!history.hydrated) {
      return;
    }

    const flushCommit = () => {
      commitSceneHistory();
    };

    window.addEventListener("pointerup", flushCommit);
    window.addEventListener("beforeunload", flushCommit);

    return () => {
      window.removeEventListener("pointerup", flushCommit);
      window.removeEventListener("beforeunload", flushCommit);
    };
  }, [history.hydrated, commitSceneHistory]);

  return null;
}

function ProjectDirectoryPersistence() {
  const [directoryHandle, setDirectoryHandle] = useAtom(projectDirectoryHandleAtom);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const saved = await idbGet<FileSystemDirectoryHandle | null>(
          PROJECT_DIRECTORY_HANDLE_KEY
        );
        if (!cancelled) {
          setDirectoryHandle((current) => current ?? saved ?? null);
        }
      } catch (error) {
        console.warn("Failed to load project directory handle.", error);
        if (!cancelled) {
          setDirectoryHandle((current) => current);
        }
      } finally {
        if (!cancelled) {
          setHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setDirectoryHandle]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    void idbSet(PROJECT_DIRECTORY_HANDLE_KEY, directoryHandle ?? null).catch(
      (error) => {
        console.warn("Failed to save project directory handle.", error);
      }
    );
  }, [directoryHandle, hydrated]);

  return null;
}

function SettingsDropZone({ children }: { children: React.ReactNode }) {
  const applySceneSnapshot = useSetAtom(applySceneSnapshotAtom);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = Array.from(e.dataTransfer.files).find((f) =>
        f.name.endsWith(".json")
      );
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string) as SettingsSnapshot;
          if (
            data.version === 1 &&
            Array.isArray(data.lights) &&
            Array.isArray(data.cameras)
          ) {
            applySceneSnapshot({
              version: 1,
              lights: data.lights,
              cameras: data.cameras,
              iblRotation:
                typeof data.iblRotation === "number" ? data.iblRotation : 0,
            });
            toast.success("Settings restored.");
          } else {
            toast.error("Invalid settings file.");
          }
        } catch {
          toast.error("Failed to parse settings file.");
        }
      };
      reader.readAsText(file);
    },
    [applySceneSnapshot]
  );

  return (
    <div
      className="h-full w-full flex flex-col"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
      <p className="pointer-events-none fixed bottom-3 left-1/2 -translate-x-1/2 z-10 text-[11px] text-white/20 tracking-wide select-none">
        json drop → シーンをオープン
      </p>

      {isDragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center border-2 border-dashed border-blue-400 bg-blue-500/10">
          <p className="text-blue-300 text-lg font-semibold tracking-wide">
            json drop → シーンをオープン
          </p>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <>
      <Toaster theme="dark" richColors position="bottom-center" />
      <SceneHistoryPersistence />
      <ProjectDirectoryPersistence />
      <CommandPalette />
      <SettingsDropZone>
        <AppLayout>
          <AppToolbar />
          <AppContent />
        </AppLayout>
      </SettingsDropZone>
    </>
  );
}
