import { contextBridge, ipcRenderer } from 'electron'

export interface ShiyunDesktopApi {
  getRuntimeInfo: () => Promise<{ platform: string; version: string; electron: string }>
  openExternal: (url: string) => Promise<void>
}

const desktopApi: ShiyunDesktopApi = {
  getRuntimeInfo: () => ipcRenderer.invoke('app:get-runtime-info'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
}

contextBridge.exposeInMainWorld('shiyunDesktop', desktopApi)
