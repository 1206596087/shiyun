import type { ShiyunDesktopApi } from '../../electron/preload'

declare global {
  interface Window {
    shiyunDesktop?: ShiyunDesktopApi
  }
}

export {}
