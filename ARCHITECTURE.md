# 诗云架构

本文描述当前代码的真实结构（M1 结束时的状态），并标注哪些部分是为后续里程碑预留的接口。凡标注「计划」的，代码里还没有实现。

## 1. 总体形态

诗云是一个 Electron 桌面应用，渲染进程是一个 React 19 + Three.js（React Three Fiber）的单页应用。同一个渲染进程里共存两个空间：

```text
┌────────────────────────────── Electron 主进程 ──────────────────────────────┐
│ BrowserWindow(1440×900, minWidth 1080)                                      │
│  ├─ 安全策略：contextIsolation / sandbox / 无 Node 集成 / 拦截导航与弹窗      │
│  ├─ IPC：app:get-runtime-info、shell:open-external（仅 http/https）          │
│  └─ 计划 M2：shiyun:db:* 书库 IPC（better-sqlite3，主进程唯一数据库持有者）   │
└──────────────────────────────────┬─────────────────────────────────────────┘
                       preload（contextBridge，最小白名单）
                                   │  window.shiyunDesktop
┌──────────────────────────────────▼─────────────────────────────────────────┐
│ 渲染进程（React）                                                            │
│  App.tsx  ── activeSpace: 'galaxy' | 'workspace'                            │
│    ├─ 银河大厅  <main class="app-shell galaxy-space">                        │
│    │    GalaxyScene（装饰层） + KnowledgeLayer（知识层） + ui/*（顶栏、搜索、信息卡）│
│    └─ 学习书房  <section class="workspace-space">                            │
│         WorkspaceHeader / FileSidebar / ReadingDesk / ResearchSidebar        │
└─────────────────────────────────────────────────────────────────────────────┘
```

两个空间**同时挂载**，用 `opacity + transform + visibility` 过渡。这样切换是瞬时且无重载的；代价是银河的 WebGL 上下文常驻，因此切到书房时显式传 `paused` 给 `GalaxyScene`，停止动画循环。

## 2. 三层数据与渲染边界

| 层 | 目录 | 是否知识对象 | 数据来源 |
| --- | --- | --- | --- |
| 银河装饰层 | `src/components/galaxy/` | 否。粒子、星核、星场、暗尘带只表达氛围 | `GalaxyConfig`（视觉参数）+ 确定性随机数 |
| 知识层 | `src/components/knowledge/` | 是。书籍 / 划线 / 笔记 / 主题与关系 | `KnowledgeGraphData` |
| 界面层 | `src/components/ui/`、`src/components/workspace/` | 消费知识层，不产生视觉粒子 | 同上 |

硬约束：**粒子不是知识对象**。任何"点击一颗星打开一本书"的能力都必须来自知识层的节点，而不是从粒子坐标反查。M5 的 `GraphDataAdapter` 只负责"把知识库投影为星图坐标与可见节点"，不负责创造身份。

## 3. 状态归属

当前（M1）状态全部在渲染进程：

| 状态 | 位置 | 持久化 |
| --- | --- | --- |
| 知识图谱 `KnowledgeGraphData` | `App.tsx` → `useState` | `localStorage: shiyun-prototype-knowledge-v1`（`src/data/knowledgeRepository.ts`） |
| 银河视觉参数 `GalaxyConfig` | `App.tsx` | `localStorage: shiyun-view-config` |
| 视图模式 / 选中 / 相机聚焦 | `App.tsx`（瞬时） | 不持久化 |
| 书房 UI（栏宽、标签、展开目录、笔记草稿） | `KnowledgeWorkspace.tsx` | `localStorage: shiyun-workspace-ui-v1` |

M2 起改为：知识图谱与书库状态由主进程 SQLite 持有，渲染进程通过 IPC 读写；`localStorage` 只保留纯 UI 偏好（栏宽、标签顺序等），并在首次启动时做一次性迁移。

`App.tsx` 是"唯一数据源"的位置：书房通过 props 拿到 `graph`，通过 `onOpenNode(id)` 请求银河聚焦同一节点。这是验收项「银河节点跳回原文」的反向路径，正向路径（书房 → 银河）已通。

## 4. 书房结构

```text
KnowledgeWorkspace          # 三栏布局 + 拖拽 + 状态持久化（唯一有状态的容器）
├─ WorkspaceHeader          # 品牌、全局搜索（读 graph）、布局设置、返回银河
├─ FileSidebar              # 演示文件夹树、真实计数、入口按钮
├─ ReadingDesk              # 标签栏 + 页面容器（book / note / empty）
│   ├─ BookPage             # 章节、段落、高亮块、工具行、笔记卡（M3 换真实渲染）
│   └─ NotePage             # 标题 + 只读正文（M4 换 TipTap）
└─ ResearchSidebar          # 研究提示卡 + 外部浏览器打开（M6 换 WebContentsView）
```

布局用 CSS 自定义属性驱动：

```css
.workspace-grid {
  display: grid;
  grid-template-columns: var(--ws-left) 7px minmax(0, 1fr) 7px var(--ws-right);
}
.workspace-space.is-research-hidden .workspace-grid {
  grid-template-columns: var(--ws-left) 7px minmax(0, 1fr);
}
```

右栏隐藏时中栏自动占满，这是验收项 E 的实现方式；不需要 JS 计算宽度。

拖拽使用 `pointerdown → window.pointermove → window.pointerup`，拖拽期间给 `<body>` 加 `is-resizing-workspace` 以锁定光标并禁用文本选择。左侧宽度直接取 `clientX`，右侧取 `innerWidth - clientX`。

## 5. 设计系统

书房与银河是两套视觉语言，共用一份字体栈：

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--ws-canvas` | `#fbfaf6` | 暖白画布 |
| `--ws-paper` | `#ffffff` | 卡片 |
| `--ws-line` | `#ece9e1` | 极细边框 |
| `--ws-ink` | `#2b2a26` | 主文字 |
| `--ws-muted` | `#8a877f` | 次要文字 |
| `--ws-gold` | `#c3a05a` | 强调点（标签脏标记、开关指示） |
| `--ws-gold-wash` | `#fbf1dc` | 划线高亮底色 |

图标统一走 `src/components/workspace/icons.tsx` 的自绘 1.5px 描边 SVG，不使用 emoji 或 Unicode 符号，避免不同字体下形状漂移。

## 6. Electron 安全基线

| 项 | 设置 | 原因 |
| --- | --- | --- |
| `contextIsolation` | `true` | 渲染进程拿不到 preload 的作用域 |
| `nodeIntegration` | `false` | 渲染进程无 `require` |
| `sandbox` | `true` | 渲染进程在 OS 级沙箱内 |
| `webSecurity` | `true` | 保留同源策略 |
| `setWindowOpenHandler` | 一律 `deny` + `shell.openExternal` | 外部链接不进应用窗口 |
| `will-navigate` | 非受信地址 `preventDefault` | 防止应用内导航到外站 |
| IPC 来源校验 | `isTrustedSender(frame.url)` | 只接受渲染进程自身（dev server 前缀或 `file://`） |

M6 接入 `WebContentsView` 时需要在主进程创建独立的 webContents，并把它的权限（弹窗、下载、权限请求）逐一收紧，不能用 iframe 代替。

## 7. 计划中的接口（尚未实现）

| 接口 | 里程碑 | 说明 |
| --- | --- | --- |
| `ShiyunRepository`（主进程） | M2 | `folders / books / highlights / notes / links` 的 CRUD，better-sqlite3 + 迁移 |
| `window.shiyunDesktop.library.*` | M2 | 渲染进程的唯一数据入口，禁止直接读文件系统 |
| `PdfSource` / `EpubSource` | M3 | 统一的 `{ pageCount, cfi?, render(page), toc() }` 抽象，供阅读器与划线定位共用 |
| `GraphDataAdapter` | M5 | `KnowledgeGraphData + GraphLayout → 星图投影`，替代当前的确定性簇布局 |
| `ResearchViewHost` | M6 | 主进程管理 `WebContentsView` 的位置、销毁与权限 |

## 8. 测试策略

- 单元测试（Vitest）：仓储序列化与校验、布局数学、纯函数工具。当前 `src/data/knowledgeRepository.test.ts` 覆盖存取与非法数据拒绝。
- 每个里程碑必须保持 `typecheck / lint / test / build` 全绿，并把该里程碑的验收项写进 `DEVELOPMENT_PLAN.md`。
- WebGL 与 Electron 窗口不做自动化截图测试（本机可能没有 GPU / Electron 二进制），以手动验收 + 浏览器截图留档为准。
