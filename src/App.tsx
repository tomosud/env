import { Toaster } from "sonner";
import { AppContent } from "./components/AppContent";
import { AppLayout } from "./components/AppLayout";
import { AppToolbar } from "./components/AppToolbar";
import { CommandPalette } from "./components/CommandPalette";
import { useUrlStateSync } from "./hooks/useUrlStateSync";

export default function App() {
  useUrlStateSync();

  return (
    <>
      <Toaster theme="dark" richColors position="bottom-center" />
      <CommandPalette />
      <AppLayout>
        <AppToolbar />
        <AppContent />
      </AppLayout>
    </>
  );
}
