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

已预定的选型：`better-sqlite3`（M2）、`pdfjs-dist` + `epubjs`（M3）、`@tiptap/react`（M4）。除此之外的新依赖默认需要说服力。

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
- **本机 Electron 二进制未下载完成**（`node_modules/electron/dist` 为空，GitHub Releases 下载超时），因此 `npm run dev` / `electron-vite build` 的桌面产物未验证。修法：`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install` 或手动放置二进制。
- 视觉核对可用无头 Edge 截图：
  ```powershell
  & "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu `
    --hide-scrollbars --window-size=1440,900 --virtual-time-budget=8000 `
    --user-data-dir="$env:TEMP\edge-shot" --screenshot="$env:TEMP\shot.png" `
    "http://localhost:5173/?space=workspace"
  ```
  注意 `--screenshot` 路径不要带空格（会被拆成多个参数并报 "Multiple targets are not supported in headless mode"）。

## 8. 下一步建议

M2 按 [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) 执行：先建库与迁移（表结构已定稿在 [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)），再替换 `FileSidebar` 的演示数据，最后做导入。不要反过来先做界面——M1 已经把界面骨架立好了。
