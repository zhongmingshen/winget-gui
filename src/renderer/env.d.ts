// Global types for renderer

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare global {
  interface WingetStreamEvent {
    data: string;
    stream: "stdout" | "stderr" | string;
    args?: string[];
    action: string | null;
    id: string | null;
    name?: string | null;
    timestamp: number;
    context?: Record<string, unknown>;
    trackId?: string | null;
  }

  interface WindowApi {
    listPackages: () => Promise<any>;
    upgradePackage: (id: string, token?: string) => Promise<string>;
    upgradeAll: () => Promise<string>;
    uninstallPackage: (id: string) => Promise<string>;
    getInstallPath: (id: string, name?: string) => Promise<string | null>;
    openPath: (folderPath: string) => Promise<{ ok: boolean; error?: string }>;
    cancelOperation: (
      trackId: string
    ) => Promise<{ ok: boolean; error?: string; killed?: boolean }>;
    onWingetStream: (cb: (data: WingetStreamEvent) => void) => () => void;
  }

  interface Window {
    api: WindowApi;
  }
}

export {};
