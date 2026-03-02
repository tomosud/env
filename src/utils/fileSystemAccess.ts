export function isFileSystemAccessSupported() {
  return (
    typeof window !== "undefined" &&
    typeof window.showDirectoryPicker === "function" &&
    typeof window.showOpenFilePicker === "function" &&
    typeof window.showSaveFilePicker === "function"
  );
}

export async function pickProjectDirectory() {
  if (!isFileSystemAccessSupported()) {
    throw new Error("File System Access API is not supported.");
  }

  return window.showDirectoryPicker({
    mode: "readwrite",
  });
}

export async function verifyDirectoryPermission(
  handle: FileSystemDirectoryHandle,
  shouldRequest = false
) {
  const options = { mode: "readwrite" as const };

  if ((await handle.queryPermission(options)) === "granted") {
    return true;
  }

  if (!shouldRequest) {
    return false;
  }

  return (await handle.requestPermission(options)) === "granted";
}

export async function writeBlobToDirectory(
  directoryHandle: FileSystemDirectoryHandle,
  filename: string,
  blob: Blob
) {
  const fileHandle = await directoryHandle.getFileHandle(filename, {
    create: true,
  });
  await writeBlobToFileHandle(fileHandle, blob);
}

export async function writeBlobToFileHandle(
  fileHandle: FileSystemFileHandle,
  blob: Blob
) {
  const writable = await fileHandle.createWritable();

  try {
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    await writable.abort();
    throw error;
  }
}

export async function writeFilesToDirectory(
  directoryHandle: FileSystemDirectoryHandle,
  files: Array<{ filename: string; blob: Blob }>
) {
  for (const file of files) {
    await writeBlobToDirectory(directoryHandle, file.filename, file.blob);
  }
}

export async function fileExistsInDirectory(
  directoryHandle: FileSystemDirectoryHandle,
  filename: string
) {
  try {
    await directoryHandle.getFileHandle(filename);
    return true;
  } catch (error) {
    if ((error as DOMException | undefined)?.name === "NotFoundError") {
      return false;
    }
    throw error;
  }
}

export async function readTextFileFromDirectory(
  directoryHandle: FileSystemDirectoryHandle,
  filename: string
) {
  const fileHandle = await directoryHandle.getFileHandle(filename);
  const file = await fileHandle.getFile();
  return file.text();
}

const jsonPickerTypes: FilePickerAcceptType[] = [
  {
    description: "JSON Files",
    accept: {
      "application/json": [".json"],
    },
  },
];

export async function pickJSONSaveFile(
  startIn: FileSystemDirectoryHandle | null,
  suggestedName: string
) {
  return window.showSaveFilePicker({
    id: "project-json-save",
    startIn: startIn ?? undefined,
    suggestedName,
    excludeAcceptAllOption: true,
    types: jsonPickerTypes,
  });
}

export async function pickJSONOpenFile(
  startIn: FileSystemDirectoryHandle | null
) {
  const [fileHandle] = await window.showOpenFilePicker({
    id: "project-json-open",
    startIn: startIn ?? undefined,
    multiple: false,
    excludeAcceptAllOption: true,
    types: jsonPickerTypes,
  });
  return fileHandle;
}

export async function readTextFromFileHandle(fileHandle: FileSystemFileHandle) {
  const file = await fileHandle.getFile();
  return file.text();
}

function getTimestampSuffix(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

export async function backupExistingFileToDirectory(
  fileHandle: FileSystemFileHandle,
  backupRootDirectory: FileSystemDirectoryHandle
) {
  let file: File;

  try {
    file = await fileHandle.getFile();
  } catch (error) {
    if ((error as DOMException | undefined)?.name === "NotFoundError") {
      return null;
    }
    throw error;
  }

  const backupDirectory = await backupRootDirectory.getDirectoryHandle("backup", {
    create: true,
  });
  const backupName = file.name.replace(
    /\.json$/i,
    `_${getTimestampSuffix()}.json`
  );
  const backupHandle = await backupDirectory.getFileHandle(backupName, {
    create: true,
  });
  await writeBlobToFileHandle(backupHandle, file);
  return backupName;
}
