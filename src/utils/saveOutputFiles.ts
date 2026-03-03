import { toast } from "sonner";
import {
  downloadBlob,
  exportSettingsJSON,
  type SettingsSnapshot,
} from "./exportEnvMap";
import {
  getWritableDirectoryHandle,
  writeFilesToDirectory,
} from "./fileSystemAccess";

type OutputFileInput = {
  filename: string;
  blob: Blob | Promise<Blob>;
};

type SettingsCompanion = {
  snapshot: SettingsSnapshot;
  basename: string;
};

export type SaveOutputFilesResult =
  | {
      mode: "directory";
      directoryName: string;
      savedSettingsJSON: false;
    }
  | {
      mode: "download";
      savedSettingsJSON: boolean;
    };

async function resolveOutputFile(file: OutputFileInput) {
  return {
    filename: file.filename,
    blob: await file.blob,
  };
}

export async function saveOutputFiles({
  projectDirectoryHandle,
  files,
  settingsCompanion,
}: {
  projectDirectoryHandle: FileSystemDirectoryHandle | null;
  files: OutputFileInput[];
  settingsCompanion?: SettingsCompanion;
}): Promise<SaveOutputFilesResult | null> {
  const resolvedFiles = await Promise.all(files.map(resolveOutputFile));

  if (projectDirectoryHandle) {
    const directoryHandle = await getWritableDirectoryHandle(
      projectDirectoryHandle
    );
    if (!directoryHandle) {
      toast.error("Folder permission is required to save files.");
      return null;
    }

    await writeFilesToDirectory(directoryHandle, resolvedFiles);
    return {
      mode: "directory",
      directoryName: directoryHandle.name,
      savedSettingsJSON: false,
    };
  }

  for (const file of resolvedFiles) {
    downloadBlob(file.blob, file.filename);
  }

  if (settingsCompanion) {
    exportSettingsJSON(
      settingsCompanion.snapshot,
      settingsCompanion.basename
    );
  }

  return {
    mode: "download",
    savedSettingsJSON: !!settingsCompanion,
  };
}
