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
| M4 | 划线、笔记、多对多关联 | ⏳ 下一步 |
| M5 | 真实知识数据生成星图（GraphDataAdapter） | 未开始 |
| M6 | 右侧真实内嵌浏览器（WebContentsView） | 未开始 |
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

- PDF 每次只渲染当前页（没有虚拟滚动的连续滚动），大文档靠翻页；文本层与划到 M4 一起做。
- 目录依赖 PDF 自身的 outline / EPUB 的 nav：样例 PDF 由 Edge 打印生成、没有书签，因此「目录」按钮是禁用态，这是真实状态而不是故障。
- EPUB 的章节内相对资源（图片/字体）依赖 EPUB.js 写入的 `<base>`；为此 CSP 的 `base-uri` 从 `'none'` 放宽到 `'self' file: blob:`（iframe 已禁脚本）。
- 主题、双栏排版、滚动模式（`flow: 'scrolled'`）尚未提供；阅读进度里的 `scroll_ratio` 字段先占位。

## M4 · 划线、笔记与多对多（下一步）

- [ ] PDF 文本层与 EPUB CFI 划线，写入 `highlights`（含 `quote / prefix / suffix`，页/CFI 必填）。
- [ ] 选中文字浮动工具栏：划线 / 写笔记 / 关联节点。
- [ ] TipTap 笔记编辑器，自动保存 `body` 与 `body_text`。
- [ ] 一条划线关联多篇笔记；一篇笔记引用多条划线；双向查看。
- [ ] 右侧抽屉或面板支持"这篇笔记关联了哪些划线"，可跳回原文。
- [ ] 删除笔记/划线/关系的语义按 DATABASE_SCHEMA 第 4 节执行。

## M5 · 真实知识进入银河

- [ ] `GraphDataAdapter`：从 SQLite 读取实体生成 `KnowledgeGraphData`，替代 `mockKnowledge.ts` 的默认数据（保留演示数据作为可开关的示例库）。
- [ ] 星图坐标持久化到 `graph_layouts`，用户拖动节点后固定。
- [ ] 银河节点 → 双击进入书房并定位到该书/该划线原文。
- [ ] 性能：>5000 节点时降级为聚合星团。

## M6 · 内嵌网页研究栏

- [ ] 主进程创建 `WebContentsView`，定位到右栏矩形，随栏宽/显隐同步 bounds。
- [ ] 地址栏、前进后退、刷新、外部打开；持久化最近访问。
- [ ] 权限收紧：拒绝摄像头/麦克风/地理位置/通知/下载（或显式询问）；跨站导航提示。
- [ ] 禁用态说明与「开发中」标注全部移除，改为真实状态。

## M7 · 打磨与发布

- [ ] 键盘可达性与焦点顺序、命令面板、快捷键。
- [ ] 启动性能、首屏拆包、内存占用（银河与书房并存）。
- [ ] `electron-builder` Windows NSIS 安装包、签名、自动更新通道。
- [ ] 崩溃与日志、用户反馈入口。

## 验收流程（来自需求文档，逐条可复验）

| 编号 | 场景 | 当前状态 |
| --- | --- | --- |
| A | 银河点「进入书房」→ 书房；书房点「返回银河」→ 银河，相机与选中状态不丢 | ✅ M1 已实现 |
| B | 导入 PDF、划一条线、重启后划线仍在原位 | 🟡 导入与持久化已通（M2）、真实 PDF 渲染与阅读进度回写已通（M3），划线本身待 M4 |
| C | 一条划线关联两篇笔记，两篇笔记都能看到对方 | ⛔ 需 M4 |
| D | 银河中某节点双击跳回该书的原文位置 | ⛔ 需 M5（书房→银河方向已通） |
| E | 右侧研究栏开关时，中栏自动扩展、阅读排版不跳版 | ✅ M1 已实现（`.is-research-hidden` 网格重排） |

## 工作纪律

1. 不重建项目，不删除银河视觉与交互代码。
2. 每个里程碑一次提交，提交信息用 `feat: Mx ...`；无法提交必须如实报告原因。
3. 新依赖必须在 [DECISIONS.md](./DECISIONS.md) 说明理由（体积、许可证、维护状态、替代方案）。
4. 数据库结构变更必须新增迁移文件，改旧迁移视为破坏性错误。
5. 未实现的功能必须显式标注「开发中 / Mx 接入」，禁止用静态假功能冒充。
6. 每次推进后更新本文件与 README 的进度表。
