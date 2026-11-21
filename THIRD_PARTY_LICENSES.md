# 第三方依赖与参考来源

**诗云自身的许可证是 MIT**，全文在仓库根目录的 [LICENSE](./LICENSE)。本文只列随应用分发或用于开发的第三方组件，以及它们各自的许可证与义务——MIT 只约束诗云自己写的代码，不改变任何第三方组件的授权条件。

本文区分“实际安装的依赖”和“只做研究参考的项目”。诗云当前代码为独立 TypeScript 实现，没有复制下列参考仓库的源码、图像或音频资产。

## 运行时依赖（会随应用分发）

| 项目 | 地址 | 用途 | 许可证 | 需要保留的声明 |
| --- | --- | --- | --- | --- |
| Three.js | https://github.com/mrdoob/three.js | WebGL 场景、几何、材质和数学 | MIT | 再分发时保留 MIT 版权与许可文本 |
| React Three Fiber | https://github.com/pmndrs/react-three-fiber | React 的 Three.js 渲染器 | MIT | 再分发时保留 MIT 版权与许可文本 |
| Drei | https://github.com/pmndrs/drei | OrbitControls、Line、Html 等 R3F 辅助组件 | MIT | 再分发时保留 MIT 版权与许可文本 |
| react-postprocessing | https://github.com/pmndrs/react-postprocessing | R3F 后期处理桥接 | MIT | 再分发时保留 MIT 版权与许可文本 |
| postprocessing | https://github.com/pmndrs/postprocessing | 受控 Bloom 管线 | Zlib | 再分发时保留版权声明与许可证 |
| React / React DOM | https://github.com/facebook/react | UI 状态与 DOM 渲染 | MIT | 再分发时保留 MIT 版权与许可文本 |
| pdfjs-dist 5.7.284 | https://github.com/mozilla/pdf.js | PDF 解析、页面渲染、目录 | Apache-2.0 | 保留 `LICENSE`；随包分发 `cmaps/` 与 `standard_fonts/`（由 `scripts/copy-pdfjs-assets.mjs` 复制到 `public/pdfjs/`） |
| epubjs 0.3.93 | https://github.com/futurepress/epub.js | EPUB 解析、CFI 定位、分页渲染 | BSD-2-Clause | 保留版权声明与许可条件 |
| @tiptap/core 3.35.0 | https://github.com/ueberdosis/tiptap | 笔记选区彩色标记扩展 | MIT | 再分发时保留 MIT 版权与许可文本 |
| @tiptap/react 3.35.0 | https://github.com/ueberdosis/tiptap | 笔记富文本编辑器（React 绑定） | MIT | 依赖 `@tiptap/core`、`@tiptap/pm` 等，全部 MIT |
| @tiptap/starter-kit 3.35.0 | https://github.com/ueberdosis/tiptap | 笔记编辑器的基础扩展集（段落、粗斜体、列表、引用、历史） | MIT | 同上 |

## 构建与开发依赖（不随应用代码分发，但会进入开发/构建环境）

| 项目 | 地址 | 用途 | 许可证 |
| --- | --- | --- | --- |
| Electron | https://github.com/electron/electron | 桌面运行时（含 Chromium 与 Node.js，见其 `LICENSES.chromium.html`） | MIT |
| electron-vite | https://github.com/alex8088/electron-vite | 主进程 / preload / 渲染进程三份构建 | MIT |
| Vite | https://github.com/vitejs/vite | 开发服务器与生产构建 | MIT |
| @vitejs/plugin-react | https://github.com/vitejs/vite-plugin-react | React 的 Babel/SWC 转译与 Fast Refresh | MIT |
| @swc/core | https://github.com/swc-project/swc | 快速 TS/JS 转译 | Apache-2.0 |
| TypeScript | https://github.com/microsoft/TypeScript | 类型检查 | Apache-2.0 |
| Vitest | https://github.com/vitest-dev/vitest | 单元测试 | MIT |
| oxlint | https://github.com/oxc-project/oxc | Lint | MIT |
| electron-builder | https://github.com/electron-userland/electron-builder | 生成 Windows NSIS 安装包（M7） | MIT |
| NSIS（由 electron-builder 下载） | https://nsis.sourceforge.io/ | 安装器打包器（构建期工具） | zlib/libpng |
| 7-Zip（`7zip-bin`，仅本地准备缓存时用） | https://www.7-zip.org/ | 解压 electron-builder 的二进制缓存 | LGPL-2.1（含 unRAR 限制） |

完整许可证文本随 npm 包保存在各自的 `node_modules/<package>/LICENSE*` 中；桌面软件打包时应将实际分发依赖的许可证聚合进安装包。Electron 打包（M7）时必须额外附带 `LICENSES.chromium.html`，这是 Chromium 二进制分发的强制性要求。

## 已确定将在后续里程碑引入的依赖（尚未安装）

| 项目 | 里程碑 | 用途 | 许可证 | 备注 |
| --- | --- | --- | --- | --- |
| （暂无） | — | — | — | M4 的 TipTap 已安装并投入使用，见上表 |

> SQLite 驱动最终**没有**引入 `better-sqlite3`：M2 改用 Node/Electron 内置的 `node:sqlite`（随 Electron 的 Node 运行时分发，不受本仓库依赖约束，也无需额外许可证文件）。见 [DECISIONS.md](./DECISIONS.md) ADR-010。

引入时把实际版本号与许可证文本补进本表，并同步更新 [DECISIONS.md](./DECISIONS.md)。

## 研究参考（未复制代码）

| 项目 | 地址 | 参考内容 | 许可证 | 当前项目中的声明义务 |
| --- | --- | --- | --- | --- |
| Galaxy Explorer | https://github.com/zjoooooo/galaxy-explorer | 银河视觉层次、非均匀团簇、暗尘带、中心光晕、背景星场、Bloom 控制 | MIT（仓库说明提到历史 v2.4.0 曾单独使用 PolyForm Noncommercial；当前 main 为 MIT） | 未复制代码或资产，无额外声明；保留本参考记录 |
| Galaxy Generator | https://github.com/NzJulien/galaxy-generator | 分支角、半径相关旋转角、幂次随机扰动、粒子批量渲染 | MIT | 未复制代码，无额外声明；保留本参考记录 |
| WebGPU Galaxy | https://github.com/dgreenheck/webgpu-galaxy | GPU 粒子、亮度层次与 Bloom 参数思路；本项目未采用 WebGPU/TSL | MIT | 未复制代码，无额外声明；保留本参考记录 |
| three-forcegraph | https://github.com/vasturiano/three-forcegraph | 三维节点、边、选择与图交互范式 | MIT | 未安装、未复制代码 |
| r3f-forcegraph | https://github.com/vasturiano/r3f-forcegraph | 在单一 R3F 场景内表达图结构的方式 | MIT | 未安装、未复制代码 |
| react-force-graph | https://github.com/vasturiano/react-force-graph | 搜索、聚焦、邻接高亮和边交互范式 | MIT | 未安装、未复制代码 |

## 本项目实现说明

- 螺旋布局使用常见的参数化公式：`angle = branchAngle + tightness × normalizedRadius × 2π + controlledNoise`。
- 银河、知识节点、关系线、UI 与数据仓储均在本项目中重新实现。
- 用户提供的参考图片只用于确定色彩、空间层次和构图方向，没有作为纹理或运行时资产打包。
