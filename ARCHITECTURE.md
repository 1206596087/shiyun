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

M2 之后，**书库是数据的权威副本**，`localStorage` 只留纯 UI 偏好与旧原型数据：

| 状态 | 位置 | 持久化 |
| --- | --- | --- |
| 书库（文件夹 / 书籍 / 划线 / 笔记 / 关系 / 阅读状态 / 坐标） | 主进程 `libraryService` + `node:sqlite` | `%APPDATA%\shiyun\shiyun.db` |
| 知识图谱投影 `KnowledgeGraphData` | `App.tsx` → `useState`（M5 改为从 SQLite 生成） | 暂时仍是 `localStorage: shiyun-prototype-knowledge-v1`（迁移后该键改名为 `.migrated` 保留） |
| 银河视觉参数 `GalaxyConfig` | `App.tsx` | `localStorage: shiyun-view-config` |
| 视图模式 / 选中 / 相机聚焦 | `App.tsx`（瞬时） | 不持久化 |
| 书房 UI（栏宽、标签、展开目录、笔记草稿） | `KnowledgeWorkspace.tsx` | `localStorage: shiyun-workspace-ui-v1` |

`App.tsx` 仍是"唯一数据源"的位置：书房通过 props 拿到 `graph`，通过 `onOpenNode(id)` 请求银河聚焦同一节点。书库则相反——书房自己通过 `LibraryBridge` 读写主进程，不经过 `App.tsx`，因为书籍树与星图是两种投影，不应该互相倒手。

## 3.1 书库数据流（M2）

```text
渲染进程                      preload（contextBridge）        主进程
FileSidebar / KnowledgeWorkspace  window.shiyunDesktop.library  libraryIpc.ts
        │                                   │                        │ 校验来源与参数
        └── src/data/libraryBridge.ts ──────┴── ipcRenderer.invoke ──┴──> libraryService.ts
                  （无 IPC 时降级为内存演示库）                              │
                                                                    db/library.ts（SQL）
                                                                    db/importBook.ts（文件复制）
                                                                    db/prototypeImport.ts（一次性迁移）
                                                                    db/backup.ts + db/migrate.ts
                                                                            │
                                                                     shiyun.db（WAL）
```

IPC 通道与职责：

| 通道 | 参数 | 返回 |
| --- | --- | --- |
| `library:listTree` | — | `LibraryTree`（文件夹树 + 未分类 + 计数 + 数据目录） |
| `library:createFolder` | `name, parentId` | 新 `LibraryTree` |
| `library:renameNode` | `kind, id, name` | 新 `LibraryTree` |
| `library:moveNode` | `kind, id, targetFolderId` | 新 `LibraryTree` |
| `library:deleteFolder` | `id` | 新 `LibraryTree` |
| `library:deleteBook` / `library:restoreBook` | `id` | 新 `LibraryTree` |
| `library:importBook` | `folderId` | `ImportReport \| null`（用户在对话框里取消时返回 `null`） |
| `library:importPrototype` | `graph` | `PrototypeImportResult` |
| `library:getMeta` | — | 数据目录、库文件、备份数、最近备份、原型迁移时间 |

所有写操作都返回**新的完整树**，渲染进程不做本地增量合并——书架规模小（个人书库），这样能保证界面与数据库不漂移。

## 3.2 阅读器数据流（M3）

```text
渲染进程                      preload（contextBridge）        主进程
ReadingDesk → ReaderPane  window.shiyunDesktop.library   libraryIpc.ts（校验参数）
        │                         │                             │
        ├─ bookSource(bookId) ────┴── ipcRenderer.invoke ──────> libraryService.bookSource()
        │                                                          ├ db/library.findBookSource
        │                                                          └ 拼 shiyun-book:// URL
        ├─ <PdfReader url>  ── fetch(Range) ──> protocol.handle('shiyun-book') ─> 磁盘文件（206 分块）
        ├─ <EpubReader url> ── 相对资源 ──────> 同上（只允许 source.<ext>，其余 404）
        └─ saveReadingState（去抖 700ms + 卸载 flush） ──> reading_states
```

要点：

- 书籍文件永远不暴露绝对路径给渲染进程。协议 URL 形态为 `shiyun-book://book/<id>/source.<ext>`：**必须带文件名**，否则 EPUB.js 按相对路径解析时会把 `<id>` 当成文件名吃掉，导致 `META-INF/container.xml` 之类的请求打到 404。
- `protocol.handle` 支持 `Range` → `206 Partial Content`，PDF.js 才能分块读取大文件；路径按 `/` 切段后逐段校验，任何越权段或 `..` 一律 404。
- 阅读状态一个表两种定位：PDF 存 `page`，EPUB 存 `cfi`，`zoom` 共用；数据库层 `CHECK` 保证至少有一个定位存在（见 [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)）。
- `pdfjs-dist` 的 `cmaps` 与 `standard_fonts` 由 `scripts/copy-pdfjs-assets.mjs` 复制到 `public/pdfjs/`（`predev` / `prebuild` 自动执行），否则中文 PDF 的字形会退化成方块。

## 3.3 划线笔记数据流（M4）

```text
渲染进程                                preload                     主进程
ReaderPane ── 选区(quote/prefix/suffix/rects + page|cfi) ──┐
   │  onSelect 后浮出 .selection-toolbar                   │
   ├─ createHighlight ── annotationBridge ── ipcRenderer ──> annotationIpc.ts（校验）
   │                                                          └ annotations.createHighlight → highlights
   ├─ listForBook(bookId) ←── 返回实体列表 ←──────────────────  listHighlights（含 note_count 子查询）
   ├─ createNote({highlightId}) ──> notes + highlight_notes（复合主键，INSERT OR IGNORE 幂等）
   └─ updateNote（去抖 600ms） ──> notes.body(JSON) + notes.body_text(纯文本)
```

要点：

- **定位不用像素**：PDF 存 `page` + `rect_json`（相对页面宽高的 0–1 矩形）+ `quote/prefix/suffix`；EPUB 存 `cfi` + `quote/prefix/suffix`。复原顺序是「先按页/CFI 找到位置，再用归一化矩形画框」，所以缩放与窗口宽度变化都不会让划线漂移。
- **两种文本层都不是现成的**：pdfjs 的 `TextLayer.render()` 在 Electron 45 里会挂住不返回，因此 PDF 走 `pdfTextLayer.ts` 自己排 span（`multiplyTransform` / `layoutTextSpans` / `horizontalScale`，有单测）；EPUB 的 `book.getRange(cfi)` 返回的 Range 属于旧 document、`getClientRects()` 恒为空（这也是 EPUB.js 自带标注层画不出持久划线的原因），因此用 `new EpubCFI(cfi).toRange(当前 iframe 文档)` 自算几何，两者最后都渲染成同一套 `.book-reader__mark` 按钮。
- **多对多只在一处表达**：`highlight_notes(highlight_id, note_id)` 复合主键，关联与解除都幂等；删除划线只删关联与划线本身，笔记永远不动；删除笔记是软删并清关联。双向查看由 `notesForHighlight` / `highlightsForNote` 两个方向提供。
- **两个渲染陷阱**（都在 M4 踩过并写进 CSS 注释）：划线的金色底必须用 `.book-reader__highlights .book-reader__mark` 这种更具体的选择器，否则被 `.workspace-space button { background: transparent }` 覆盖；同一 canvas 上的并发 `render()` 必须先 `await previous.promise`，否则 pdf.js 会静默拒绝新任务。

## 3.4 星图投影数据流（M5）

```text
渲染进程                                   preload                主进程
App boot ── getGraphBridge().load() ── graphBridge ── ipcRenderer ──> graphIpc.ts（校验来源/参数）
                                                                        └ loadKnowledgeGraph(db)
                                                                           ├ db/graph.loadGraphSource(db)   读 folders/books/highlights/notes/links/layouts
                                                                           ├ graphProjection.projectKnowledgeGraph(source)  ← 纯函数，无 IO，有单测
                                                                           └ db/graph.persistLayouts(db, newLayouts)  （pinned=0，ON CONFLICT DO NOTHING）
   ←── KnowledgeGraphData（nodes/links/layouts）────────────────────────┘

拖动星星 ── onNodeDrag（本地更新）→ onNodeDragEnd ── graph:pin ──> savePinnedLayout(db,nodeId,xyz)（pinned=1）
双击星星 ── App.openInWorkspace(node) → WorkspaceOpenTarget → KnowledgeWorkspace 打开对应标签并定位
```

要点：

- **投影是纯函数**：`src/data/graphProjection.ts` 只吃 `GraphSource`、只吐 `{graph, newLayouts, aggregatedHighlights, droppedNotes}`，不碰数据库、不读时钟、随机数用 `hashText` 派生，所以同一份书库两次投影完全一致，也能在 Vitest 里直接断言（9 个用例）。
- **节点 id 带种类前缀**：`book:` / `hl:` / `hlagg:` / `note:` / `topic:`。`graph_layouts.node_id` 存完整节点 id；读到原型迁移留下的裸实体 id 时按 `kindPrefix()` 兼容，避免旧坐标丢失。
- **渲染进程不能往银河里塞知识**：只有 `graph:load / pin / unpin` 三个通道，节点与连线永远由书库投影出来（AGENTS §1.6「不要把知识身份挂到粒子上」的延伸）。`pin` 只改坐标，不新增实体。
- **星图是缓存，不是真相**：书库变了星图就旧了，所以从书房回银河会重新 `load()`（`refreshGraph()`），Explorer 也有「刷新星图」按钮。
- **拖动与相机抢指针**：拖动期间把 `OrbitControls.enabled` 置 false（`CameraController` 的 `disabled` prop），否则拖星星会同时旋转相机；平面求交用 `THREE.Plane(new Vector3(0,1,0), -y)` 保持在同一水平面内移动。

## 4. 书房结构

```text
KnowledgeWorkspace          # 三栏布局 + 拖拽 + UI 状态持久化 + 书库加载/写操作 + 注释桥
├─ WorkspaceHeader          # 品牌、全局搜索（读 graph）、布局设置、返回银河
├─ FileSidebar              # 真实文件夹树（新建/重命名/拖拽/删除）+ 计数 + 我的划线/我的笔记入口
├─ ReadingDesk              # 标签栏 + 按 kind 分派页面
│   ├─ BookPage             # 内置演示书的排版样例（演示数据，不是真实书页）
│   ├─ ReaderPane           # 真实书籍：取源、进度回写、划线/选区/浮层、错误与缺失提示
│   │   ├─ PdfReader        # PDF.js：canvas + 自排文本层 + 页码 + 缩放 + 目录 + 划线叠加
│   │   └─ EpubReader       # EPUB.js：分页 + CFI + 目录 + 字号 + CFI 划线叠加
│   ├─ NoteEditor           # TipTap 正文（自动保存）+ 标题 + 关联划线（可跳原文/解除/新增）
│   ├─ HighlightListPage    # “我的划线”：全部划线 + 定位原文 + 写笔记
│   └─ NoteListPage         # “我的笔记”：按更新时间 + 关联划线数 + 跳原文
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
| preload 产物格式 | CommonJS（`out/preload/index.js`） | `sandbox: true` 时 preload 不能是 ESM，否则加载失败、桥为空 |
| CSP | 生产 `file://` 注入；开发不注入 | 硬化生产默认策略，又不挡 Vite HMR；Google Fonts 两个域为已知例外 |

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
