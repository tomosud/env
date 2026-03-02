declare global {
  interface FilePickerAcceptType {
    description?: string;
    accept: Record<string, string | string[]>;
  }

  interface FileSystemHandlePermissionDescriptor {
    mode?: "read" | "readwrite";
  }

  interface DirectoryPickerOptions {
    id?: string;
    mode?: "read" | "readwrite";
    startIn?: FileSystemHandle;
  }

  interface OpenFilePickerOptions {
    id?: string;
    multiple?: boolean;
    excludeAcceptAllOption?: boolean;
    startIn?: FileSystemHandle;
    types?: FilePickerAcceptType[];
  }

  interface SaveFilePickerOptions {
    id?: string;
    excludeAcceptAllOption?: boolean;
    startIn?: FileSystemHandle;
    suggestedName?: string;
    types?: FilePickerAcceptType[];
  }

  interface FileSystemHandle {
    queryPermission(
      descriptor?: FileSystemHandlePermissionDescriptor
    ): Promise<PermissionState>;
    requestPermission(
      descriptor?: FileSystemHandlePermissionDescriptor
    ): Promise<PermissionState>;
  }

  interface Window {
    showDirectoryPicker(
      options?: DirectoryPickerOptions
    ): Promise<FileSystemDirectoryHandle>;
    showOpenFilePicker(
      options?: OpenFilePickerOptions
    ): Promise<FileSystemFileHandle[]>;
    showSaveFilePicker(
      options?: SaveFilePickerOptions
    ): Promise<FileSystemFileHandle>;
  }
}

export {};
