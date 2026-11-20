# 开发计划

本文件是里程碑的唯一权威清单。每次推进必须先更新「当前进度」，再动代码。

更新时间：2026-11-21 · 当前里程碑：**M2 待开始**

## 进度总览

| 里程碑 | 目标 | 状态 |
| --- | --- | --- |
| M0 | 接管现有银河原型、验证基线、建立可回退标签 | ✅ 完成 |
| M1 | Electron 外壳 + 银河/书房双空间导航 + 书房三栏骨架与状态持久化 | ✅ 完成（桌面窗口未在实机验证，见「已知风险」） |
| M2 | SQLite 书库 + 真实文件夹 + 导入 PDF/EPUB | ⏳ 下一步 |
| M3 | PDF.js / EPUB.js 真实阅读器 | 未开始 |
| M4 | 划线、笔记、多对多关联 | 未开始 |
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

## M2 · SQLite 书库与文件夹（下一步）

目标：把演示数据换成真实、可迁移、可备份的本地书库。

- [ ] 主进程接入 better-sqlite3，按 [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) 建库与迁移（含 WAL、外键、备份）。
- [ ] 迁移脚本 `001_init.sql`，`schema_migrations` 记账，启动时自动备份。
- [ ] IPC：`library:listTree`、`library:createFolder`、`library:renameNode`、`library:moveBook`、`library:deleteFolder`、`library:importBook`。
- [ ] 渲染进程 `src/data/libraryRepository.ts` 走 IPC，替换 `FileSidebar` 的 `DEMO_FOLDERS`。
- [ ] 真实文件夹树：新建 / 重命名 / 拖动移动 / 删除到回收站 / 展开折叠；删除书籍不误删笔记。
- [ ] 导入 PDF / EPUB：复制到 `books/<id>/source.*`、sha256 去重、解析页数或章节数、生成封面。
- [ ] `localStorage` 原型数据一次性迁移（保留旧键，不删除）。
- [ ] 测试：迁移幂等、外键级联、删除语义（删书保笔记）、导入去重。
- [ ] 更新 README / DATABASE_SCHEMA 的"已实现"状态。

## M3 · PDF / EPUB 阅读器

- [ ] `pdfjs-dist` 渲染真实页面（虚拟滚动、缩放、翻页、目录、文本层）。
- [ ] `epubjs` 渲染 EPUB（CFI 定位、目录、分页/滚动、主题）。
- [ ] 阅读状态写回 `reading_states`，重启后恢复到同一位置。
- [ ] 书籍内容与右侧研究栏共用中栏标签体系，不新开窗口。

## M4 · 划线、笔记与多对多

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
| B | 导入 PDF、划一条线、重启后划线仍在原位 | ⛔ 需 M2 + M4 |
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
