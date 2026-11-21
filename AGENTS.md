# AGENTS.md — 给后续开发者与 AI 代理的工作约定

本文件是这个仓库的"接手说明书"。开工前先读它，再读 [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) 的当前进度。

## 1. 绝对不要做的事

1. **不要重建项目。** 这是接手项目，不是新项目。删掉 `src/components/galaxy/**` 或重写 `GalaxyScene` 视为破坏性变更。
2. **不要删除银河的视觉与交互代码**（粒子、星核、星尘、Bloom、相机控制、搜索、信息卡、关系创建）。
3. **不要用静态假功能冒充已完成功能。** 未实现的一律 `disabled` + `title` + 可见的「开发中 / Mx 接入」标注。这条是硬性验收项。
4. **不要覆盖用户真实数据。** 演示数据与用户数据必须能区分；迁移 `localStorage` 时保留旧键。
5. **不要改已应用的迁移文件。** 结构变更 = 新增一个迁移版本。
6. **不要把知识身份挂到粒子上。** 粒子只是氛围（ADR-001）。
7. **不要在渲染进程直接读写文件系统或数据库。** 一切走 `window.shiyunDesktop.*`，主进程校验来源。

## 2. 每次开工的固定流程

```bash
git status            # 确认工作区状态与当前分支
npm run typecheck     # 基线必须全绿
npm run lint
npm run test
npm run dev:web       # 浏览器验证（不需要 Electron 二进制）
```

结束前必须再跑一遍 `typecheck / lint / test / build`，并把结果如实写进提交说明或回复。四项里有任何一项失败，不许声称完成。

## 3. 代码约定

- **语言**：TypeScript strict，无 `any`（需要时用 `unknown` + 收窄）。函数组件 + hooks，不用 class（Three.js 对象除外）。
- **模块边界**：
  - `src/components/galaxy/` 只依赖 `types/galaxy.ts` 与 `types/knowledge.ts`（读布局），不得依赖仓储。
  - `src/components/knowledge/` 只读 `KnowledgeGraphData`。
  - `src/components/workspace/` 通过 props 拿数据，不自行读 `localStorage` 以外的东西。
  - `src/data/` 是唯一的数据出入口；M2 起它在内部调 IPC。
- **状态**：`App.tsx` 持有知识图谱与空间切换；书房内部 UI 状态留在 `KnowledgeWorkspace.tsx`。不引入全局状态库，除非有明确收益并写进 DECISIONS.md。
- **样式**：银河主题在 `src/App.css`，书房主题在 `src/components/workspace/Workspace.css`，两者不要互相 import。书房只用 `--ws-*` 变量。
- **图标**：书房图标必须来自 `src/components/workspace/icons.tsx`（自绘 SVG，1.5px 描边）。禁止 emoji、Unicode 符号、图标字体。
- **命名**：文本用中文（界面语言），标识符用英文。里程碑标注统一写 `M3 接入` / `M4 接入` / `M6 接入`。
- **提交**：`feat: M2 sqlite library` / `fix: ...` / `docs: ...`，一个里程碑一次提交。提交前确认 `docs/screenshots/` 与实际界面一致。

## 4. 新增依赖的准入

必须先回答并写进 [DECISIONS.md](./DECISIONS.md)：

1. 解决什么问题，现有依赖为什么不够？
2. 许可证是什么（是否 GPL/AGPL/商业限制）？写进 [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md)。
3. 体积与是否原生模块（影响 M7 打包）？
4. 维护状态（最近发布、issue 活跃度）？
5. 不装它的替代方案是什么？

已安装：`pdfjs-dist@5.7.284`（PDF）、`epubjs@0.3.93`（EPUB）、`@tiptap/react` + `@tiptap/starter-kit@3.35.0`（笔记编辑器），见 ADR-013 / ADR-014 / ADR-015。SQLite 用内置 `node:sqlite`，不装 `better-sqlite3`（ADR-010）。除此之外的新依赖默认需要说服力（下一步如果需要划线颜色选择器，优先自己画，不引入 UI 库）。

## 5. 测试要求

- 每新增一个纯函数模块（迁移、定位、布局、导入解析）→ 加 Vitest 单测。
- 仓储层必须测：正常读写、非法数据拒绝、删除语义（删书不删笔记）。
- 不为 WebGL 渲染写快照测试；用浏览器截图人工核对，图存 `docs/screenshots/`。
- 测试文件与被测模块同目录，命名 `*.test.ts`。

## 6. 文档同步

任何里程碑推进后，按顺序更新：

1. `DEVELOPMENT_PLAN.md` 的进度表与勾选项（含"已知风险"）。
2. `README.md` 的进度表、已实现列表、已知限制。
3. 涉及表结构 → `DATABASE_SCHEMA.md`；涉及取舍 → `DECISIONS.md`；涉及新依赖 → `THIRD_PARTY_LICENSES.md`；涉及分层/数据流 → `ARCHITECTURE.md`。

文档里的"计划"与"已实现"必须一眼可区分。没实现的写"计划中"。

## 7. 环境事实（2026-11-21 实测）

- 工作目录：`C:\Users\admin\Desktop\awa\poetry cloud`。
- Node / npm 可用；Vite 8、React 19、TypeScript 7、Three 0.187、R3F 9、Vitest 5、oxlint。
- 基线提交 `7d82268`，标签 `galaxy-baseline`。
- `npm run dev:web` 在 `http://localhost:5173`；`?space=workspace` 直接进入书房。
- **Electron 二进制已在本机装好**（45.4.1）。若新机器 `node_modules/electron/dist` 为空，用镜像下载而非反复重试 GitHub：`https://cdn.npmmirror.com/binaries/electron/<version>/electron-v<version>-win32-x64.zip`，用同目录 `SHASUMS256.txt` 校验后解压到 `node_modules/electron/dist`，并在 `node_modules/electron/path.txt` 写入 `electron.exe`。
- **本 shell 默认带 `ELECTRON_RUN_AS_NODE=1`**（DSH 自身是 Electron 应用）。启动桌面窗口前必须 `Remove-Item Env:ELECTRON_RUN_AS_NODE`，否则 `electron.exe` 会退化成 Node（`--version` 返回 Node 版本）。
- **全链路验证脚本**（仓库外，可重建）：用 `electron.exe` 直接跑一个 `.cjs`，创建与主进程同配置的 `BrowserWindow`（`sandbox: true`、preload 指向 `out/preload/index.js`），`loadFile(out/renderer/index.html, { search: 'space=workspace' })`，再 `executeJavaScript` 探测 `window.shiyunDesktop.getRuntimeInfo()`、读 `.workspace-grid` 的 `grid-template-columns`、`capturePage()` 存 PNG。监听 `preload-error` 与 `console-message`，任何 `Unable to load preload` 都必须当作缺陷修掉，不许当警告忽略。
- 视觉核对可用无头 Edge 截图：
  ```powershell
  & "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu `
    --hide-scrollbars --window-size=1440,900 --virtual-time-budget=8000 `
    --user-data-dir="$env:TEMP\edge-shot" --screenshot="$env:TEMP\shot.png" `
    "http://localhost:5173/?space=workspace"
  ```
  注意 `--screenshot` 路径不要带空格（会被拆成多个参数并报 "Multiple targets are not supported in headless mode"）。
- **桌面端数据目录**：`%APPDATA%\shiyun\`（`shiyun.db`、`shiyun.db-wal`、`books\`、`backups\`）。跑真机验证前先 `Get-Process electron | Stop-Process -Force`，同一 userData 起两个实例会 `bind() 失败` / `Unable to create cache (0x5)`。
- **桌面端自动化验证**：`electron.exe . --remote-debugging-port=<port>`，再用 Node 24 内置 `fetch` + `WebSocket` 写个临时 CDP 客户端（`Runtime.evaluate`、`Page.reload`），不需要 puppeteer 之类的新依赖。
- **PDF.js 运行资产**：`public/pdfjs/`（`cmaps` 169 个 + `standard_fonts` 16 个）由 `npm run assets` 从 `pdfjs-dist` 复制，已挂在 `predev` / `predev:web` / `prebuild` / `prebuild:web` 上；`public/pdfjs` 不进版本库。缺了这组文件，中文 PDF 的字形会退化成方块。
- **书籍文件访问**：渲染进程只有 `shiyun-book://book/<id>/source.<ext>` 这种 URL，没有绝对路径。验证阅读器时可以在临时脚本里用 `node:sqlite` 直接往书库插一行 + 把样例文件放到 `books/<id>/`，验证完记得把测试数据删干净。

## 7.1 两条血泪规则（务必遵守）

1. **绝不用 `Get-Content | Set-Content`（或 `-replace ... | Set-Content`）改源码。** 中文会被按 GBK 误解码重写成 mojibake，文件变成非法 UTF-8，`tsc` 报 `TS1490 File appears to be binary`，`read`/`write` 工具也会因为非法编码拒绝该文件，只能从临时副本重建。改字一律用 `edit` / `write` 工具；脚本文件（`.cjs`）也一样。
2. **不要用并发 Electron 实例验证同一个数据目录**，先杀进程再启动，否则 SQLite 与 Chromium cache 会互相打脸。

## 7.2 数据库改动清单

- 表结构改动 = 新增 `electron/main/db/migrations/00X_<name>.ts` 并追加到 `migrate.ts` 的 `migrations` 数组，**不得修改 `001_init.ts`**。
- 迁移必须（1）在事务里执行，（2）失败即回滚，（3）迁移前备份。
- 删除语义的硬约束写在 [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) 第 4 节：删书不删笔记、删关系不删实体。改这条之前先改文档再改代码。
- 仓储层改动必须加/改测试：`electron/main/db/library.test.ts` 已有迁移幂等、层级上限、删除语义、导入去重、原型迁移幂等 10 个用例。

## 8. 下一步建议

M5 按 [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) 执行：书库已经是权威数据源（`books` / `highlights` / `notes` / `knowledge_links` / `graph_layouts` 都有真实数据），所以 M5 的第一步是写 `GraphDataAdapter`——从 SQLite 读实体生成 `KnowledgeGraphData`，让银河显示真实的书、划线、笔记与主题，而不是 `mockKnowledge.ts` 的演示图谱。顺序建议：先只读投影（渲染真实节点、保留现有银河视觉），再做「银河节点双击 → 进书房 → 定位到该书/该划线原文」（验收 D），最后做坐标持久化与 >5000 节点聚合。禁止改动银河的粒子/星核/Bloom 代码来「顺手优化」，也禁止把知识身份挂到粒子上（ADR-001）。

M4 已经落地的东西不要重做：划线定位（页码 + 归一化矩形 / CFI）、自绘叠加层、TipTap 笔记、`highlight_notes` 多对多、删除语义，都在 `annotations.ts` / `ReaderPane.tsx` / `NoteEditor.tsx` / `AnnotationLists.tsx` 里，有 36 个单测护着。
