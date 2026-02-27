import {
  ArrowDownTrayIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  ArrowTopRightOnSquareIcon,
  CodeBracketIcon,
  PaintBrushIcon,
  PhotoIcon,
} from "@heroicons/react/24/solid";
import * as Toolbar from "@radix-ui/react-toolbar";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  activeModesAtom,
  canRedoSceneAtom,
  canUndoSceneAtom,
  camerasAtom,
  envMapTextureAtom,
  iblRotationAtom,
  lightsAtom,
  modeAtom,
  redoSceneAtom,
  sceneRendererAtom,
  undoSceneAtom,
} from "../../store";
import {
  ExportResolution,
  exportEnvMapHDR,
  exportEnvMapPNG,
  exportSettingsJSON,
  getUniqueBasename,
} from "../../utils/exportEnvMap";
import { Logo } from "./Logo";

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
  const [resolution, setResolution] = useState<ExportResolution>("2k");
  const [isExporting, setIsExporting] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function triggerHint() {
    setShowHint(true);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setShowHint(false), 4000);
  }

  useEffect(() => () => { if (hintTimerRef.current) clearTimeout(hintTimerRef.current); }, []);

  const canExport = !!texture && !!renderer && !isExporting;

  async function handleExportHDR() {
    if (!texture || !renderer) {
      toast.error("Environment map is not ready yet.");
      return;
    }

    try {
      setIsExporting(true);
      const basename = getUniqueBasename("envmap");
      exportEnvMapHDR({ texture, renderer, resolution, filename: `${basename}.hdr` });
      exportSettingsJSON({ version: 1, lights, cameras, iblRotation }, basename);
      toast.success(`Saved HDR + settings (${resolution})`);
      triggerHint();
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
      const basename = getUniqueBasename("envmap");
      await exportEnvMapPNG({ texture, renderer, resolution, filename: `${basename}.png` });
      exportSettingsJSON({ version: 1, lights, cameras, iblRotation }, basename);
      toast.success(`Saved PNG + settings (${resolution})`);
      triggerHint();
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

        <label className="text-xs text-white/70">Export</label>
        <select
          className="h-8 rounded-md bg-neutral-900 ring-1 ring-white/20 px-2 text-xs uppercase tracking-wide"
          value={resolution}
          onChange={(event) =>
            setResolution(event.target.value as ExportResolution)
          }
          disabled={isExporting}
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
          style={{ opacity: showHint ? 1 : 0 }}
        >
          .json をドロップして設定を復帰
        </span>
      </div>

      <Toolbar.Link
        href="https://github.com/pmndrs/env"
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
