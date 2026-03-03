import {
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  CodeBracketIcon,
  FolderOpenIcon,
  PaintBrushIcon,
  PhotoIcon,
} from "@heroicons/react/24/solid";
import * as Toolbar from "@radix-ui/react-toolbar";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  activeModesAtom,
  applySceneSnapshotAtom,
  canRedoSceneAtom,
  canUndoSceneAtom,
  camerasAtom,
  envMapTextureAtom,
  imageBasenameAtom,
  iblRotationAtom,
  jsonSaveFilenameAtom,
  lightsAtom,
  modeAtom,
  projectDirectoryHandleAtom,
  redoSceneAtom,
  sceneRendererAtom,
  undoSceneAtom,
} from "../../store";
import {
  ExportResolution,
  type SettingsSnapshot,
  createEnvMapHDRBlob,
  createEnvMapPNGBlob,
  createSettingsJSONBlob,
  exportEnvMapHDR,
  exportEnvMapPNG,
  exportSettingsJSON,
  sanitizeBasename,
} from "../../utils/exportEnvMap";
import {
  backupExistingFileToDirectory,
  isFileSystemAccessSupported,
  pickJSONOpenFile,
  pickJSONSaveFile,
  pickProjectDirectory,
  readTextFromFileHandle,
  verifyDirectoryPermission,
  writeBlobToFileHandle,
  writeFilesToDirectory,
} from "../../utils/fileSystemAccess";
import { Logo } from "./Logo";

function createProjectSnapshotSignature(snapshot: SettingsSnapshot) {
  return JSON.stringify(snapshot);
}

function getModeButtonClass(active: boolean) {
  return [
    "flex items-center text-xs px-3 py-1.5 leading-4 tracking-wide uppercase font-semibold rounded-md",
    active ? "bg-red-600 text-white" : "bg-white/10 text-white/70 hover:bg-white/15",
  ].join(" ");
}

export function AppToolbar() {
  const setMode = useSetAtom(modeAtom);
  const activeModes = useAtomValue(activeModesAtom);
  const texture = useAtomValue(envMapTextureAtom);
  const renderer = useAtomValue(sceneRendererAtom);
  const lights = useAtomValue(lightsAtom);
  const cameras = useAtomValue(camerasAtom);
  const iblRotation = useAtomValue(iblRotationAtom);
  const canUndo = useAtomValue(canUndoSceneAtom);
  const canRedo = useAtomValue(canRedoSceneAtom);
  const undoScene = useSetAtom(undoSceneAtom);
  const redoScene = useSetAtom(redoSceneAtom);
  const applySceneSnapshot = useSetAtom(applySceneSnapshotAtom);
  const [imageBasename, setImageBasename] = useAtom(imageBasenameAtom);
  const [jsonSaveFilename, setJsonSaveFilename] = useAtom(jsonSaveFilenameAtom);
  const projectDirectoryHandle = useAtomValue(projectDirectoryHandleAtom);
  const setProjectDirectoryHandle = useSetAtom(projectDirectoryHandleAtom);
  const [resolution, setResolution] = useState<ExportResolution>("2k");
  const [isExporting, setIsExporting] = useState(false);
  const [isConnectingFolder, setIsConnectingFolder] = useState(false);
  const [isSavingJSON, setIsSavingJSON] = useState(false);
  const [isOpeningJSON, setIsOpeningJSON] = useState(false);
  const [lastSavedJSONSignature, setLastSavedJSONSignature] = useState<
    string | null
  >(null);
  const [showHint, setShowHint] = useState(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const folderSaveSupported = isFileSystemAccessSupported();
  const normalizedImageBasename = sanitizeBasename(imageBasename, "envmap");
  const suggestedJSONFilename =
    jsonSaveFilename || `${normalizedImageBasename}.json`;
  const isFolderMode = !!projectDirectoryHandle;
  const currentProjectSnapshot = useMemo<SettingsSnapshot>(
    () => ({
      version: 1,
      lights,
      cameras,
      iblRotation,
      imageBasename,
    }),
    [lights, cameras, iblRotation, imageBasename]
  );
  const currentProjectSignature = useMemo(
    () => createProjectSnapshotSignature(currentProjectSnapshot),
    [currentProjectSnapshot]
  );
  const needsJSONSave =
    isFolderMode &&
    (lastSavedJSONSignature === null ||
      lastSavedJSONSignature !== currentProjectSignature);

  function triggerHint() {
    setShowHint(true);
    if (hintTimerRef.current) {
      clearTimeout(hintTimerRef.current);
    }
    hintTimerRef.current = setTimeout(() => setShowHint(false), 4000);
  }

  useEffect(() => {
    return () => {
      if (hintTimerRef.current) {
        clearTimeout(hintTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isFolderMode) {
      setLastSavedJSONSignature(null);
    }
  }, [projectDirectoryHandle]);

  const isBusy =
    isExporting || isConnectingFolder || isSavingJSON || isOpeningJSON;
  const canExport = !!texture && !!renderer && !isBusy;

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

  async function handleConnectFolder() {
    if (!folderSaveSupported) {
      toast.error("File System Access API is not available in this browser.");
      return;
    }

    try {
      setIsConnectingFolder(true);
      const handle = await pickProjectDirectory();
      const granted = await verifyDirectoryPermission(handle, true);

      if (!granted) {
        toast.error("Folder permission was denied.");
        return;
      }

      setProjectDirectoryHandle(handle);
      toast.success(`Folder mode enabled: ${handle.name}`);
    } catch (error) {
      if ((error as DOMException | undefined)?.name !== "AbortError") {
        console.error(error);
        toast.error("Failed to connect folder.");
      }
    } finally {
      setIsConnectingFolder(false);
    }
  }

  function handleUseDownloads() {
    setProjectDirectoryHandle(null);
    toast.success("Browser downloads mode enabled.");
  }

  async function restoreSceneFromJSON(text: string, label: string) {
    const data = JSON.parse(text) as SettingsSnapshot;

    if (
      data.version === 1 &&
      Array.isArray(data.lights) &&
      Array.isArray(data.cameras)
    ) {
      applySceneSnapshot({
        version: 1,
        lights: data.lights,
        cameras: data.cameras,
        iblRotation: typeof data.iblRotation === "number" ? data.iblRotation : 0,
      });
      if (typeof data.imageBasename === "string") {
        setImageBasename(data.imageBasename);
      }
      setLastSavedJSONSignature(
        createProjectSnapshotSignature({
          version: 1,
          lights: data.lights,
          cameras: data.cameras,
          iblRotation: typeof data.iblRotation === "number" ? data.iblRotation : 0,
          imageBasename:
            typeof data.imageBasename === "string"
              ? data.imageBasename
              : imageBasename,
        })
      );
      toast.success(`Opened ${label}`);
      return;
    }

    toast.error("Invalid settings file.");
  }

  async function handleSaveJSON() {
    if (!isFolderMode || !projectDirectoryHandle) {
      return;
    }

    try {
      setIsSavingJSON(true);
      const directoryHandle = await ensureProjectDirectoryPermission();
      if (!directoryHandle) {
        return;
      }

      const fileHandle = await pickJSONSaveFile(
        directoryHandle,
        suggestedJSONFilename
      );
      const backupName = await backupExistingFileToDirectory(
        fileHandle,
        directoryHandle
      );
      await writeBlobToFileHandle(
        fileHandle,
        createSettingsJSONBlob(currentProjectSnapshot)
      );
      setJsonSaveFilename(fileHandle.name);
      setLastSavedJSONSignature(currentProjectSignature);
      toast.success(
        backupName
          ? `Saved ${fileHandle.name} with backup ${backupName}`
          : `Saved ${fileHandle.name}`
      );
    } catch (error) {
      if ((error as DOMException | undefined)?.name !== "AbortError") {
        console.error(error);
        toast.error("Failed to save JSON.");
      }
    } finally {
      setIsSavingJSON(false);
    }
  }

  async function handleOpenJSON() {
    if (!isFolderMode || !projectDirectoryHandle) {
      return;
    }

    try {
      setIsOpeningJSON(true);
      const directoryHandle = await ensureProjectDirectoryPermission();
      if (!directoryHandle) {
        return;
      }

      const fileHandle = await pickJSONOpenFile(directoryHandle);
      const text = await readTextFromFileHandle(fileHandle);
      setJsonSaveFilename(fileHandle.name);
      await restoreSceneFromJSON(text, fileHandle.name);
    } catch (error) {
      if ((error as DOMException | undefined)?.name !== "AbortError") {
        console.error(error);
        toast.error("Failed to open JSON.");
      }
    } finally {
      setIsOpeningJSON(false);
    }
  }

  async function handleExportHDR() {
    if (!texture || !renderer) {
      toast.error("Environment map is not ready yet.");
      return;
    }

    try {
      setIsExporting(true);
      if (isFolderMode) {
        const directoryHandle = await ensureProjectDirectoryPermission();
        if (!directoryHandle) {
          return;
        }

        await writeFilesToDirectory(directoryHandle, [
          {
            filename: `${normalizedImageBasename}.hdr`,
            blob: createEnvMapHDRBlob({ texture, renderer, resolution }),
          },
        ]);
        toast.success(
          `Saved ${normalizedImageBasename}.hdr to ${directoryHandle.name}`
        );
      } else {
        exportEnvMapHDR({
          texture,
          renderer,
          resolution,
          filename: `${normalizedImageBasename}.hdr`,
        });
        exportSettingsJSON(currentProjectSnapshot, normalizedImageBasename);
        toast.success(`Saved HDR + settings (${resolution})`);
        triggerHint();
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to export HDR.");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleExportPNG() {
    if (!texture || !renderer) {
      toast.error("Environment map is not ready yet.");
      return;
    }

    try {
      setIsExporting(true);
      if (isFolderMode) {
        const directoryHandle = await ensureProjectDirectoryPermission();
        if (!directoryHandle) {
          return;
        }

        await writeFilesToDirectory(directoryHandle, [
          {
            filename: `${normalizedImageBasename}.png`,
            blob: await createEnvMapPNGBlob({ texture, renderer, resolution }),
          },
        ]);
        toast.success(
          `Saved ${normalizedImageBasename}.png to ${directoryHandle.name}`
        );
      } else {
        await exportEnvMapPNG({
          texture,
          renderer,
          resolution,
          filename: `${normalizedImageBasename}.png`,
        });
        exportSettingsJSON(currentProjectSnapshot, normalizedImageBasename);
        toast.success(`Saved PNG + settings (${resolution})`);
        triggerHint();
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to export PNG.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Toolbar.Root
      aria-label="Editing options"
      className="flex items-center justify-between min-w-[max-content] px-4 pt-1 gap-4"
    >
      <span className="p-3 flex items-center gap-4">
        <Logo />
        <h1 className="font-bold tracking-wide text-xl">Env</h1>
      </span>

      <Toolbar.ToggleGroup
        type="multiple"
        aria-label="Tools"
        className="flex divide-x divide-white/10 bg-neutral-900 rounded-md overflow-hidden shadow-inner shadow-white/5 ring-offset-white/10 ring-offset-1 ring-1 ring-black/20"
        value={activeModes}
        onValueChange={(modes) =>
          setMode(
            modes.reduce((acc, mode) => ({ ...acc, [mode]: true }), {
              scene: false,
              code: false,
              hdri: false,
            })
          )
        }
      >
        {[
          {
            value: "scene",
            label: "Scene",
            icon: PaintBrushIcon,
          },
          {
            value: "code",
            label: "Code",
            icon: CodeBracketIcon,
          },
          {
            value: "hdri",
            label: "HDRI",
            icon: PhotoIcon,
          },
        ].map(({ value, label, icon: Icon }) => (
          <Toolbar.ToggleItem
            key={value}
            value={value}
            disabled={value === "scene"}
            className="px-3 py-1.5 leading-4 text-xs tracking-wide uppercase font-semibold bg-white/0 hover:bg-white/10 bg-gradient-to-b data-[state=on]:from-blue-500 data-[state=on]:to-blue-600 data-[state=on]:text-white flex items-center"
          >
            <Icon className="w-4 h-4 mr-2" />
            <span>{label}</span>
          </Toolbar.ToggleItem>
        ))}
      </Toolbar.ToggleGroup>

      <div className="flex items-center gap-2 ml-auto">
        <button
          className="flex items-center text-xs px-3 py-1.5 leading-4 tracking-wide uppercase font-semibold bg-white/10 hover:bg-white/20 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => undoScene()}
          disabled={!canUndo}
        >
          <ArrowUturnLeftIcon className="w-4 h-4 mr-1.5" />
          Undo
        </button>

        <button
          className="flex items-center text-xs px-3 py-1.5 leading-4 tracking-wide uppercase font-semibold bg-white/10 hover:bg-white/20 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => redoScene()}
          disabled={!canRedo}
        >
          <ArrowUturnRightIcon className="w-4 h-4 mr-1.5" />
          Redo
        </button>

        <label className="text-xs text-white/70">Image Name</label>
        <input
          className="h-8 w-28 rounded-md bg-neutral-900 ring-1 ring-white/20 px-2 text-xs"
          value={imageBasename}
          onChange={(event) => setImageBasename(event.target.value)}
          disabled={isBusy}
          placeholder="envmap"
        />

        <label className="text-xs text-white/70">Save Mode</label>
        <button
          className={getModeButtonClass(isFolderMode)}
          onClick={handleConnectFolder}
          disabled={!folderSaveSupported || isBusy}
        >
          <FolderOpenIcon className="w-4 h-4 mr-1.5" />
          Folder Connect Mode
        </button>

        <button
          className={getModeButtonClass(!isFolderMode)}
          onClick={handleUseDownloads}
          disabled={isBusy}
        >
          Browser Downloads Mode
        </button>

        <span className="text-xs text-white/45 max-w-[12rem] truncate">
          {isFolderMode
            ? `Folder: ${projectDirectoryHandle.name}`
            : "Mode: Browser downloads"}
        </span>

        {isFolderMode && (
          <>
            <button
              className={[
                "flex items-center text-xs px-3 py-1.5 leading-4 tracking-wide uppercase font-semibold rounded-md disabled:opacity-50 disabled:cursor-not-allowed",
                needsJSONSave
                  ? "bg-red-600 text-white"
                  : "bg-white/10 hover:bg-white/20 text-white",
              ].join(" ")}
              onClick={handleSaveJSON}
              disabled={isBusy}
            >
              Save JSON
            </button>

            <button
              className="flex items-center text-xs px-3 py-1.5 leading-4 tracking-wide uppercase font-semibold bg-white/10 hover:bg-white/20 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleOpenJSON}
              disabled={isBusy}
            >
              Open JSON
            </button>
          </>
        )}

        <label className="text-xs text-white/70">Export</label>
        <select
          className="h-8 rounded-md bg-neutral-900 ring-1 ring-white/20 px-2 text-xs uppercase tracking-wide"
          value={resolution}
          onChange={(event) =>
            setResolution(event.target.value as ExportResolution)
          }
          disabled={isBusy}
        >
          <option value="1k">1k</option>
          <option value="2k">2k</option>
          <option value="4k">4k</option>
        </select>

        <button
          className="flex items-center text-xs px-3 py-1.5 leading-4 tracking-wide uppercase font-semibold bg-white/10 hover:bg-white/20 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleExportHDR}
          disabled={!canExport}
        >
          <ArrowDownTrayIcon className="w-4 h-4 mr-1.5" />
          HDR
        </button>

        <button
          className="flex items-center text-xs px-3 py-1.5 leading-4 tracking-wide uppercase font-semibold bg-white/10 hover:bg-white/20 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleExportPNG}
          disabled={!canExport}
        >
          <ArrowDownTrayIcon className="w-4 h-4 mr-1.5" />
          PNG
        </button>

        <span
          className="text-xs text-white/40 transition-opacity duration-500 whitespace-nowrap"
          style={{ opacity: showHint && !isFolderMode ? 1 : 0 }}
        >
          JSON saved alongside the export
        </span>
      </div>

      <Toolbar.Link
        href="https://github.com/tomosud/env"
        target="_blank"
        rel="noopener noreferrer"
        className="flex justify-center items-center text-xs px-3 py-1.5 leading-4 tracking-wide uppercase font-semibold bg-white/0 hover:bg-white/100 text-white hover:text-black rounded-md transition-all duration-500 ease-in-out"
      >
        <span>Source Code</span>
        <ArrowTopRightOnSquareIcon className="w-4 h-4 ml-2" />
      </Toolbar.Link>
    </Toolbar.Root>
  );
}
