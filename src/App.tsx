import { useCallback, useState } from "react";
import { Toaster, toast } from "sonner";
import { useSetAtom } from "jotai";
import { AppContent } from "./components/AppContent";
import { AppLayout } from "./components/AppLayout";
import { AppToolbar } from "./components/AppToolbar";
import { CommandPalette } from "./components/CommandPalette";
import { lightsAtom, camerasAtom } from "./store";
import type { SettingsSnapshot } from "./utils/exportEnvMap";

function SettingsDropZone({ children }: { children: React.ReactNode }) {
  const setLights = useSetAtom(lightsAtom);
  const setCameras = useSetAtom(camerasAtom);
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
            setLights(data.lights);
            setCameras(data.cameras);
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
    [setLights, setCameras]
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
