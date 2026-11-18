// The only bridge between the editor page and the Mac: file pickers, real paths for files
// dragged in from Finder (browsers hide these), and menu commands.
import { contextBridge, ipcRenderer, webUtils } from "electron";

contextBridge.exposeInMainWorld("blkedit", {
  pickMedia: (): Promise<string[]> => ipcRenderer.invoke("pick-media"),
  pickFolder: (): Promise<string[]> => ipcRenderer.invoke("pick-folder"),
  pathsForFiles: (files: File[]): string[] => files.map((f) => webUtils.getPathForFile(f)).filter(Boolean),
  reveal: (p: string) => ipcRenderer.invoke("reveal", p),
  onMenu: (cb: (action: string) => void) => {
    const h = (_e: unknown, action: string) => cb(action);
    ipcRenderer.on("menu", h);
    return () => ipcRenderer.removeListener("menu", h);
  },
});
