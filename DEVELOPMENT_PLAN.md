# 开发计划

本文件是里程碑的唯一权威清单。每次推进必须先更新「当前进度」，再动代码。

更新时间：2026-11-21 · 当前里程碑：**M2 待开始**

## 进度总览

| 里程碑 | 目标 | 状态 |
| --- | --- | --- |
| M0 | 接管现有银河原型、验证基线、建立可回退标签 | ✅ 完成 |
| M1 | Electron 外壳 + 银河/书房双空间导航 + 书房三栏骨架与状态持久化 | ✅ 完成（桌面窗口已实机验证） |
| M2 | SQLite 书库 + 真实文件夹 + 导入 PDF/EPUB | ✅ 完成（桌面实机验证） |
| M3 | PDF.js / EPUB.js 真实阅读器 | ✅ 完成（桌面实机验证） |
| M4 | 划线、笔记、多对多关联 | ✅ 完成（桌面实机验证） |
| M5 | 真实知识数据生成星图（GraphDataAdapter） | ✅ 完成（桌面实机验证） |
| M6 | 右侧真实内嵌浏览器（WebContentsView） | ✅ 完成（桌面实机验证） |
| M7 | 打磨、Windows 打包与发布 | 未开始 |

## M0 · 接管与基线

- [x] 复核现有银河代码：装饰层与知识层已分离，无回归。
- [x] `npm run typecheck / lint / test / build` 全绿（2 个仓储测试）。
- [x] 在基线提交 `7d82268` 上建立并推送标签 `galaxy-baseline`。
- [x] 记录技术栈与依赖现状，确认无 router / SQLite / PDF 依赖。

## M1 · 双空间（本轮）

目标：让"银河大厅 ↔ 学习书房"成为真实可用的两个空间，而不是两套截图。

- [x] Electron 三进程构建（`electron.vite.config.ts` + `electron/main` + `electron/preload`），保留原 Vite/React 工程。
- [x] 安全基线：`contextIsolation` / `sandbox` / 无 Node 集成 / 导航与弹窗拦截 / IPC 来源校验。
- [x] 书房浅色三栏布局，按参考概念图重做视觉：暖白画布、白卡片、极细边框、1.5px 线性图标。
- [x] 顶部导航：诗云标识 + 「个人知识宇宙」+ 全局搜索 + 布局设置 + 「返回银河」。
- [x] 左栏：三层演示目录、展开/折叠、选中态、真实计数（划线/笔记/关系数）、M2/M4 未完成入口显式标注。
- [x] 中栏：多标签、可关闭、空状态、书页视图、笔记页视图、阅读区自适应。
- [x] 右栏：研究提示区 + **真实可用**的「外部浏览器打开」；输入框在 M6 前禁用并说明原因。
- [x] 三栏可拖拽（左 196–360 / 右 264–440），右栏可隐藏且中栏自动占满。
- [x] UI 状态持久化（`shiyun-workspace-ui-v1`）。
- [x] 全局搜索读取真实图谱，命中后跳回银河并聚焦该节点。
- [x] 补齐 7 份文档（README / ARCHITECTURE / DATABASE_SCHEMA / DEVELOPMENT_PLAN / DECISIONS / THIRD_PARTY_LICENSES / AGENTS）。
- [x] 1440×900 视觉核对（浏览器 `?space=workspace` 截图留档于 `docs/screenshots/`）。
- [x] 实机验证 Electron 窗口（45.4.1）：preload 桥 `window.shiyunDesktop` 可用、IPC 返回 runtime info、书房网格 `236px / 882.4px / 294px`、银河 WebGL 正常（canvas 1783×952）。
- [x] 修复实机验证暴露的真实缺陷：沙箱下 ESM preload 加载失败（已改 CJS 产物，见 ADR-009）；生产加载补 CSP。

**M1 遗留风险（必须如实记录）**

- ~~Electron 二进制未就绪~~：已用 npmmirror 镜像安装并通过 SHA256 校验，桌面路径实机跑通。新机器仍需镜像，见 [AGENTS.md](./AGENTS.md) §7。
- CSP 当前对 Google Fonts 开两个例外（`fonts.googleapis.com` / `fonts.gstatic.com`），离线时字体回退到系统字体；M7 打包前改自托管。
- 书房的书籍内容、划线计数、笔记是演示数据；划线/笔记/关联按钮为禁用态，等 M3/M4。不得把它们描述成已实现。

## M2 · SQLite 书库与文件夹（完成）

目标：把演示数据换成真实、可迁移、可备份的本地书库。

- [x] 主进程接入数据库（改用 Node/Electron 内置 `node:sqlite`，见 [ADR-010](./DECISIONS.md)），按 [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) 建库与迁移（WAL、外键、24 小时自动备份、保留 14 份）。
- [x] 迁移 `electron/main/db/migrations/001_init.ts`，`schema_migrations` 记账；迁移前先备份，失败整版本回滚。
- [x] IPC：`library:listTree` / `createFolder` / `renameNode` / `moveNode` / `deleteFolder` / `deleteBook` / `restoreBook` / `importBook` / `importPrototype` / `getMeta`，全部校验来源与参数类型。
- [x] 渲染进程 `src/data/libraryBridge.ts` 走 IPC；浏览器模式自动降级为内存演示书库（`src/data/demoLibrary.ts`），不再有硬编码 `DEMO_FOLDERS`。
- [x] 真实文件夹树：行内新建、右键重命名、拖拽移动（含"未分类"投放区、禁止移到自身子树、最多 3 层）、删除文件夹后书籍落到未分类、书籍软删进回收站、展开折叠。
- [x] 导入 PDF / EPUB：`dialog` 多选 → sha256 去重 → 复制到 `books/<id>/source.<ext>` → 写库；页数与封面留到 M3 解析。
- [x] `localStorage` 原型数据一次性迁移：书籍/笔记/划线/关系/坐标进库，旧键改名 `shiyun-prototype-knowledge-v1.migrated` 保留，`app_settings['migration.prototype.importedAt']` 记账。
- [x] 测试：迁移幂等、层级上限、禁止移到子树、删文件夹→书落未分类、删书保笔记与划线、导入去重、原型迁移幂等（`electron/main/db/library.test.ts`，10 个用例）。
- [x] 更新 README / DATABASE_SCHEMA 的"已实现"状态。
- [x] 实机复核：`%APPDATA%\shiyun\shiyun.db` 生成、原型 5 本书/20 条划线/10 篇笔记/51 条关系入库、IPC 新建文件夹后刷新界面仍在（证据见 README）。

**M2 已知限制（如实记录）**

- 书籍正文仍未渲染：双击书库里的书只打开"M3 接入"占位页，不排假版面。
- 浏览器模式（`npm run dev:web`）没有 IPC，只能用内存演示书库，刷新即回演示数据。
- 导入还没做撤销/回收站界面；回收站数据在 `books.deleted_at`，只有 `restoreBook` 接口。
- 书库目录仍是 `%APPDATA%\shiyun`（Electron 默认 userData），未做自定义位置设置。

## M3 · PDF / EPUB 阅读器（完成）

- [x] `pdfjs-dist` 渲染真实页面：按容器宽度「适合宽度 × 缩放」渲染当前页 canvas，支持翻页、页码输入、缩放 50%–300%、目录（`getOutline` → `getPageIndex` 跳页）。
- [x] `epubjs` 渲染 EPUB：CFI 定位、目录（`loaded.navigation`）、左右方向键翻页、字号 70%–220% 缩放、`relocated` 回报当前章节。
- [x] 阅读状态写回 `reading_states`（PDF 存 `page`，EPUB 存 `cfi`，共用一个 `zoom`），去抖 700ms 保存、卸载前 flush；重开书恢复到同一页/同一 CFI。
- [x] 书籍内容与右侧研究栏共用中栏标签体系，不新开窗口：真实书籍在 `.reader-body.is-reader` 里铺满中栏。
- [x] 主进程自定义协议 `shiyun-book://book/<id>/source.<ext>`：渲染层拿不到绝对路径，支持 `Range`（206）以便 PDF.js 分块读取，越权路径与目录穿越一律 404。
- [x] 测试：`src/types/reader.test.ts`（clampZoom / clampPage / sanitizeReadingState 7 个用例）、`electron/main/db/reading.test.ts`（默认态、写入回读、部分字段合并、单行约束 4 个用例）。
- [x] 实机复核：真实 PDF（3 页）渲染 canvas 935×1211、翻到第 2 页后 `reading_states.page=2`、重载后仍停在第 2 页；自建 EPUB 渲染正文、目录两项可跳第二章、字号 120% 生效并写入 `cfi`。

**M3 已知限制（如实记录）**

- PDF 每次只渲染当前页（没有虚拟滚动的连续滚动），大文档靠翻页；文本层与划线已在 M4 完成（自己排坐标，因为 pdfjs 的 `TextLayer.render()` 在本项目里会挂住）。
- 目录依赖 PDF 自身的 outline / EPUB 的 nav：样例 PDF 由 Edge 打印生成、没有书签，因此「目录」按钮是禁用态，这是真实状态而不是故障。
- EPUB 的章节内相对资源（图片/字体）依赖 EPUB.js 写入的 `<base>`；为此 CSP 的 `base-uri` 从 `'none'` 放宽到 `'self' file: blob:`（iframe 已禁脚本）。
- 主题、双栏排版、滚动模式（`flow: 'scrolled'`）尚未提供；阅读进度里的 `scroll_ratio` 字段先占位。

## M4 · 划线、笔记与多对多（完成）

- [x] PDF 文本层与 EPUB CFI 划线，写入 `highlights`（`quote / prefix / suffix` 必填，页/CFI 至少一个）——PDF 用自排 span + 归一化矩形，EPUB 用 CFI。
- [x] 选中文字浮动工具栏：添加划线 / 写笔记（`selection-toolbar`）。
- [x] TipTap 笔记编辑器（`@tiptap/react` 3 + `@tiptap/starter-kit` 3），正文去抖 600ms 自动保存 `body` 与 `body_text`，标题可留空由正文首行代替。
- [x] 一条划线关联多篇笔记、一篇笔记引用多条划线，`highlight_notes` 复合主键，笔记页与划线卡片双向可查。
- [x] 笔记页底部「关联的划线」可跳回原文（PDF 跳页 / EPUB 跳 CFI）与解除关联；划线卡片可「写笔记」「定位到这里」「删除划线」。
- [x] 删除语义按 DATABASE_SCHEMA 第 4 节：删划线保笔记、删笔记软删且解除关联、删书不级联笔记。
- [x] 单测：`src/types/annotation.test.ts`（16）、`electron/main/db/annotations.test.ts`（11）、`src/components/workspace/pdfTextLayer.test.ts`（9）。
- [x] 实机复核（Electron 45.4.1 + CDP）：划线 8 条、重载后仍 8 条；一条划线挂 2–3 篇笔记；EPUB 关掉重开后 CFI 划线 5 条全部复原。

### M4 已知限制

- 划线颜色固定金色；`highlights.color` 支持 gold/rose/sage，但还没有颜色选择器。
- 多行选区只画「第一条矩形」的高亮框（`rects` 已存全部矩形，画面后续细化）。
- 空笔记的提示是自绘覆盖层（没装 `@tiptap/extension-placeholder`），语义上等价但不参与编辑器 undo 栈。
- 浏览器演示模式（`dev:web`）用的是内存注释桥，刷新即丢；这是刻意的降级（ADR-011）。

## M5 · 真实知识进入银河（完成）

- [x] `GraphDataAdapter`：`src/data/graphProjection.ts` 把书库实体投影成 `KnowledgeGraphData`，主进程 `db/graph.ts` 读 SQLite 后调用它；`src/data/graphBridge.ts` 在桌面模式走 IPC，浏览器模式退回 localStorage 原型图（ADR-016）。
- [x] 星图坐标持久化到 `graph_layouts`：新增坐标 `INSERT ... ON CONFLICT DO NOTHING`（`pinned=0`），用户拖动后 `graph:pin` 写入 `pinned=1`，重启仍是原位。
- [x] 银河节点 → 双击进入书房并定位到该书/该划线原文：书 → 打开书页，划线 → 定位到页码或 CFI，笔记 → 打开笔记页；检查面板另有「回到这段原文 / 打开这篇笔记」按钮。
- [x] 性能：超过 5000 节点时先把每本书的划线聚合成一个星团，仍超限才隐藏笔记（`droppedNotes` 会如实上报）。
- [x] 书房里新写划线后回银河会自动重新投影（`refreshGraph()`），左栏「我的划线 / 我的笔记」计数改为问注释层要实时数字。

M5 已知限制：

- 投影出的位置是确定性的伪随机布局（按文件夹分星团 + 抖动），不是力导向布局；同库两次投影一致，但删掉节点后邻居不会重排。
- 没有文件夹的书全部落在「未分类」星团里，视觉上是一个密集小星团（真实反映书库结构，不做美化）。
- 浏览器演示模式没有真实书库，星图仍是原型数据（`library` 模式标识会显示「浏览器存储」）。
- 聚合星团只在超过 5000 节点时出现，正常书库看不到这个分支的界面。

## M6 · 内嵌网页研究栏（完成）

- [x] 主进程创建 `WebContentsView`（`electron/main/researchView.ts`），独立分区 `persist:research`、`sandbox:true`、无 preload；渲染进程用 `ResizeObserver` 报右栏矩形，拖栏宽、开关右栏、切空间都会同步 bounds，隐藏时 bounds 归零（ADR-017）。
- [x] 地址栏（完整 URL / 裸域名 / 搜索词三态，`researchUrl.ts` 纯函数 + 8 个单测）、前进 / 后退 / 刷新、标题与 loading 事件推送、外部浏览器打开。
- [x] 权限收紧：`setPermissionRequestHandler` / `setPermissionCheckHandler` 一律拒绝，`will-download` 阻止，`window.open` 转系统浏览器，非 http(s) 导航拦截。
- [x] 未实现状态的处理：浏览器模式（无主进程）明确写「右侧网页在桌面版里是真实网页」并给外部浏览器出口，不再有「开发中」占位。
- [x] 实机验证：研究栏页面视口 262×568 对上右栏矩形 262×570；导航到 example.com 后标题为 `Example Domain`；回银河 `visible:false`、再进书房恢复 `visible:true`；`canGoBack` 随导航变化；Bing 搜索与维基百科页面在实机里真实渲染。

### M6 已知限制

- 右栏默认 294px（最大 440px），桌面版网站在这个宽度会横向溢出——网站自己的排版问题，界面不做缩放伪装。
- 原生视图不进入 DOM，因此不吃书房 CSS，也不被 DOM 截图工具拍到（README 那张图是把视图截图贴回矩形）。
- 没有做「最近访问列表」与站点级权限记忆；每次启动从空白页开始（尚未持久化上次 URL）。
- 网页视图复用同一个 `persist:research` 分区，不随空间销毁；关闭窗口时由 `disposeResearchView()` 回收。

## M7 · 打磨与发布（下一步）

- [ ] 键盘可达性与焦点顺序、命令面板、快捷键。
- [ ] 启动性能、首屏拆包、内存占用（银河与书房并存）。
- [ ] `electron-builder` Windows NSIS 安装包、签名、自动更新通道。
- [ ] 崩溃与日志、用户反馈入口。

## 验收流程（来自需求文档，逐条可复验）

| 编号 | 场景 | 当前状态 |
| --- | --- | --- |
| A | 银河点「进入书房」→ 书房；书房点「返回银河」→ 银河，相机与选中状态不丢 | ✅ M1 已实现 |
| B | 导入 PDF、划一条线、重启后划线仍在原位 | ✅ M2 导入持久化 + M3 真实渲染 + M4 划线落库与重载复原（PDF 按页、EPUB 按 CFI） |
| C | 一条划线关联两篇笔记，两篇笔记都能看到对方 | ✅ M4 已实现（`highlight_notes` 多对多，实测一条划线挂 3 篇笔记） |
| D | 银河中某节点双击跳回该书的原文位置 | ✅ M5 已实现（书 → 书页、划线 → 页码/CFI、笔记 → 笔记页；实机实测双击后停在第 2 页并画出划线） |
| E | 右侧研究栏开关时，中栏自动扩展、阅读排版不跳版 | ✅ M1 已实现（`.is-research-hidden` 网格重排）；M6 起右栏换成原生视图，开关时同步把视图 bounds 归零 / 复原 |

## 工作纪律

1. 不重建项目，不删除银河视觉与交互代码。
2. 每个里程碑一次提交，提交信息用 `feat: Mx ...`；无法提交必须如实报告原因。
3. 新依赖必须在 [DECISIONS.md](./DECISIONS.md) 说明理由（体积、许可证、维护状态、替代方案）。
4. 数据库结构变更必须新增迁移文件，改旧迁移视为破坏性错误。
5. 未实现的功能必须显式标注「开发中 / Mx 接入」，禁止用静态假功能冒充。
6. 每次推进后更新本文件与 README 的进度表。
