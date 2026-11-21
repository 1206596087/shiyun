import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: { input: resolve(__dirname, 'electron/main/index.ts') },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: resolve(__dirname, 'electron/preload/index.ts'),
        // 沙箱化的 preload 只能是 CommonJS：ESM preload 需要 sandbox: false。
        // 宁可保留 sandbox，也不要为了 ESM 打开沙箱。
        output: { format: 'cjs', entryFileNames: '[name].js' },
      },
    },
  },
  renderer: {
    root: '.',
    plugins: [react()],
    server: {
      // 构建产物就在项目根下的 out/，不忽略的话每次 npm run build 都会触发整页刷新。
      watch: { ignored: ['**/out/**', '**/.git/**'] },
    },
    build: {
      outDir: 'out/renderer',
      rollupOptions: { input: resolve(__dirname, 'index.html') },
    },
  },
})
