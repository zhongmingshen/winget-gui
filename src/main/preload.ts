import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  listPackages: () => ipcRenderer.invoke("winget:list"),
  upgradePackage: (id: string, token?: string) =>
    ipcRenderer.invoke("winget:upgrade", id, token),
  upgradeAll: () => ipcRenderer.invoke("winget:upgradeAll"),
  uninstallPackage: (id: string) => ipcRenderer.invoke("winget:uninstall", id),
  getInstallPath: (id: string, name?: string) =>
    ipcRenderer.invoke("system:getInstallPath", id, name),
  openPath: (folderPath: string) =>
    ipcRenderer.invoke("system:openPath", folderPath),
  cancelOperation: (trackId: string) =>
    ipcRenderer.invoke("winget:cancel", trackId),
  // subscribe to streaming output from main
  onWingetStream: (cb: (data: any) => void) => {
    const listener = (_: any, data: any) => cb(data);
    ipcRenderer.on("winget:stream", listener);
    return () => ipcRenderer.removeListener("winget:stream", listener);
  },
});
