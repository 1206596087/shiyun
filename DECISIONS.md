# 技术决策记录（ADR）

按时间倒序。每条包含：背景 → 决策 → 理由 → 代价 / 何时重新评估。改决策时新增一条并标注被替代的编号，不要删旧记录。

---

## ADR-013 · PDF.js 5 + EPUB.js 0.3 作为阅读引擎，PDF 单页画布渲染

**背景**：M3 要在中栏里显示真实书页，需要能解析 PDF 与 EPUB 的引擎，并且必须离线可用、许可证允许分发、在 Electron 渲染进程里能跑。

**决策**：PDF 用 `pdfjs-dist@5`（Apache-2.0），把当前页渲染到 canvas：容器宽度经 `ResizeObserver` 量出后按「适合宽度 × 用户缩放」计算尺寸，`devicePixelRatio` 用 `transform: [dpr,0,0,dpr,0,0]` 校正，保证高分屏不糊；EPUB 用 `epubjs@0.3`（BSD-2-Clause），`flow: 'paginated'` 分页渲染，字号缩放走 `rendition.themes.fontSize()`。两者都由渲染进程直接跑，不需要主进程解析文件。

**理由**：PDF.js 是唯一成熟的 PDF 渲染方案（Chrome 自己也是同源代码），EPUB.js 是 EPUB 3 分页/CFI 定位的事实标准；两者都是纯 JS、无原生依赖，打包体积换来的能力（真实书页、CFI、目录）正是这个产品的核心。PDF 选单页画布而非连续滚动，是因为个人书房的中栏固定宽度、单页更适合「专心读一页」的产品定位，且实现与状态（`page` + `zoom`）都更简单。

**代价**：PDF 没有虚拟滚动的连续滚动，长文档要翻页；EPUB.js 会把章节放进 srcdoc iframe，因此要为它放宽 CSP 的 `base-uri`（见 ADR-012）与 `frame-src`。渲染包体因此增加到约 4.7 MB（含 worker 1.2 MB）。**重新评估**：M7 打包时若体积成为问题，可把 worker 与 cmaps 走外部资源；连续滚动如果用户需要再加 `scroll` 模式。

---

## ADR-012 · 书籍通过自定义协议 `shiyun-book://` 提供，URL 必须带文件名

**背景**：PDF.js 与 EPUB.js 都需要一个 URL 去 fetch 文件。直接把绝对路径交给渲染进程会破坏「渲染进程不碰文件系统」的边界，并且 `file://` 在 CSP 与沙箱下也不合适。

**决策**：主进程 `protocol.registerSchemesAsPrivileged` 注册 `shiyun-book`（standard / secure / supportFetchAPI / stream / corsEnabled），`protocol.handle` 里读取磁盘文件并支持 `Range` → `206`。书籍 URL 形态固定为 `shiyun-book://book/<id>/source.<ext>`，协议处理器按 `/` 切段校验：第一段是书籍 ID，其余段必须等于 `source.<format>`，否则 404。同时把 CSP 的 `base-uri 'none'` 放宽为 `base-uri 'self' file: blob:`。

**理由**：URL 里带文件名不是洁癖，而是 EPUB.js 的硬要求——它按文档的相对路径解析章节资源，如果 URL 是 `shiyun-book://book/<id>`，`<id>` 会被当成文件名吃掉，后续 `META-INF/container.xml` 之类的请求会变成 `shiyun-book://book/META-INF/...` 而 404（这个坑在实机里真实踩过，界面表现为「正在解析 EPUB…」永远不结束）。`base-uri` 放宽是因为 EPUB.js 往禁脚本的 srcdoc iframe 里写 `<base>` 以解析章节内的相对图片/字体；iframe 已 `sandbox="allow-same-origin"` 且禁脚本，放开基址不扩大脚本执行面。

**代价**：协议处理器成了文件读取的唯一入口，必须持续审它（目录穿越、越权 ID、软删书籍都要 404）。**重新评估**：M6 引入 `WebContentsView` 后，若研究栏也需要读本地资源，再评估是否复用同一协议与其权限边界。

---

## ADR-011 · 书库能力在浏览器模式下降级为内存演示库

**背景**：M2 的书库全在主进程（`node:sqlite` + `fs`）。但日常界面迭代用 `npm run dev:web`（不需要 Electron 二进制，也方便无头截图核对），那里没有 `window.shiyunDesktop`。

**决策**：`src/data/libraryBridge.ts` 暴露统一的 `LibraryBridge` 接口：有 `window.shiyunDesktop.library` 时走 IPC，否则返回内存实现（`src/data/demoLibrary.ts`），新建/重命名/移动/删除在内存里真实生效、刷新即失效，`importBook` 返回 `null` 并禁用导入入口；左栏页脚明确写「演示书库 · 不会写入真实数据」。

**理由**：让 UI 在没有主进程时也能跑真实交互路径（而不是塞一堆 `if (desktop)` 分支），同时不让人误以为浏览器里存的会持久化。

**代价**：桥接层要维护两份实现，行为可能有细微差异（例如演示库不校验 3 层上限）。**重新评估**：M5 前后如果浏览器模式不再用于验收，可改为直接抛错。

---

## ADR-010 · 用内置 `node:sqlite` 替代 better-sqlite3

**背景**：M2 需要在主进程持久化书库。原计划（ADR-002）用 `better-sqlite3`，它是原生模块：要 node-gyp 编译、要针对 Electron 的 ABI 重编译、M7 打包还要处理 `.node` 产物与签名。

**决策**：改用 Node 24 内置的 `node:sqlite`（`DatabaseSync` / `prepare` / `run` / `all` / `get` / `exec`）。实测 Electron 45.4.1 的 Node 为 24.22.3、系统 Node 为 24.19.0，两端都能直接 `require('node:sqlite')` 并跑建表、插入、查询；Vitest 也能用同一套代码跑真实数据库测试（`electron/main/db/library.test.ts` 用 `:memory:` 与临时目录）。

**理由**：零依赖、零编译、零 ABI 风险，`npm install` 不再需要构建工具链；API 与 better-sqlite3 高度相似（同步语句对象），迁移成本低到几乎透明——`connection.ts` 只包了 4 个函数（`queryAll/queryOne/execute/transaction`），事务用显式 `BEGIN/COMMIT/ROLLBACK` 手工实现。

**代价**：`node:sqlite` 仍标注为实验性 API（Node 24 下无需 flag，但升级 Node 时要注意签名变化）；没有 better-sqlite3 的 `pragma()` 便捷方法与自定义函数注册能力（本项目用不到）。**重新评估**：升级到 Electron 50+ 时复核 API 稳定性；若需要全文检索（FTS5）再检查编译选项是否可用。

---

## ADR-009 · 沙箱 preload 打包为 CommonJS，生产注入 CSP

**背景**：M1 提交后在本机装好 Electron 45.4.1 实机验证，发现 `sandbox: true` 下 preload 被打成 ESM（`out/preload/index.mjs`），Electron 报 `SyntaxError: Cannot use import statement outside a module`，`window.shiyunDesktop` 为 `undefined`——即「外部浏览器打开」在真实桌面里是坏的，而浏览器模式下完全看不出来。同时控制台报 `Insecure Content-Security-Policy` 警告。

**决策**：1）`electron.vite.config.ts` 的 preload 段固定 `output.format: 'cjs'`、`entryFileNames: '[name].js'`，主进程 preload 路径改为 `../preload/index.js`；2）主进程在 `app.whenReady()` 里调用 `installContentSecurityPolicy()`，仅在 `ELECTRON_RENDERER_URL` 未设置（生产 `file://`）时通过 `session.defaultSession.webRequest.onHeadersReceived` 注入 CSP；开发模式不注入，以免挡住 Vite 的内联 HMR 客户端。

**理由**：沙箱化的 preload 不支持 ESM（只有 `sandbox: false` 才支持），而打开沙箱的收益远大于 preload 用 ESM 的便利。CSP 只在生产注入既拿到硬化的默认策略，又不破坏热更新。

**代价**：CSP 当前为 `@import` 的 Google Fonts 开了 `style-src https://fonts.googleapis.com` 与 `font-src https://fonts.gstatic.com` 两个例外，离线时会静默回退到系统字体。**重新评估**：M7 打包前把中文字体自托管，CSP 收紧回 `'self'`。

---

## ADR-008 · 书房的"未完成功能"一律禁用并标注里程碑

**背景**：需求明确禁止用静态假功能冒充已完成功能，但视觉验收又要求界面完整。

**决策**：布局、入口、图标全部到位；凡需要真实数据或真实渲染的动作（添加划线、写笔记、关联节点、笔记格式栏、研究栏地址输入）使用 `disabled` + `title` + 正文小字标注 `M3 / M4 / M6 接入`。禁用态保留可读性，不做"点了没反应"的静默失败。

**理由**：把"缺什么"写进界面，比事后口头说明更可靠；同时避免用户误以为数据已保存。

**代价**：书房在 M4 之前看起来"不完全可用"。这是诚实的代价。**重新评估**：M4 完成后逐个移除禁用态。

---

## ADR-007 · 书房视觉改为暖白阅读主题，与银河完全分离

**背景**：原有书房是深色玻璃拟态，与"学习书房"语义不符；用户提供了浅色概念图。

**决策**：书房用独立 CSS 变量集（`--ws-canvas #fbfaf6`、`--ws-paper #fff`、`--ws-line #ece9e1`、`--ws-gold #c3a05a`），图标改自绘 1.5px 描边 SVG，不使用 emoji/Unicode 符号。两个空间通过 `opacity/transform/visibility` 过渡共存。

**理由**：读书场景需要长时间阅读，浅色低对比更耐久；SVG 图标在不同字体与缩放下形状稳定。

**代价**：两套视觉令牌要各自维护；银河的深色玻璃组件不能复用到书房。**重新评估**：暂不。

---

## ADR-006 · 双空间同时挂载，切换靠 CSS 过渡 + 暂停渲染

**背景**：切换空间若卸载银河，会丢失 Three.js 上下文与相机状态，重新初始化约数百毫秒。

**决策**：`App.tsx` 让银河与书房同时挂载，用 `is-active / is-inactive` 类切换可见性；书房激活时给 `GalaxyScene` 传 `paused` 停止渲染循环。

**理由**：切换瞬时，相机与选中状态天然保留（验收项 A）。暂停后 CPU/GPU 占用接近零。

**代价**：WebGL 上下文常驻内存（约 100–200 MB）。**重新评估**：若 M7 打包后低配机器内存吃紧，改为延迟卸载 + 状态序列化恢复。

---

## ADR-005 · 右侧研究栏 M1 不做"假浏览器"，M6 用 WebContentsView

**背景**：`<iframe>` 无法处理跨站限制、无法做权限控制、无法与主进程共享会话；`<webview>` 已被 Electron 官方标记为不推荐。

**决策**：M1 只放真实可用的"外部浏览器打开"（`shell.openExternal`，限 http/https）和研究提示；地址栏禁用并注明 M6 前不加载第三方网页。M6 在主进程用 `WebContentsView` 实现，随右栏矩形同步 bounds。

**理由**：`WebContentsView` 是官方推荐的嵌入式浏览方案，权限粒度与生命周期可控。

**代价**：M6 之前右侧不是浏览器。**重新评估**：M6。

---

## ADR-004 · 阅读与编辑依赖推迟到 M3/M4（PDF.js / EPUB.js / TipTap）

**背景**：M1 的目标是"两个空间真实可用"，不是"能读 PDF"。

**决策**：M1 只写阅读区视图与交互骨架，不装 PDF.js / EPUB.js / TipTap。M3 引 `pdfjs-dist`（Apache-2.0）+ `epubjs`（BSD-2-Clause），M4 引 TipTap（MIT）。

**理由**：这三个依赖体积与 API 面都大，提前引入会让 M1 的验收被它们的问题拖住；且选型需要真实书库（M2）才能被验证。

**代价**：M1 的阅读区是排版演示。**重新评估**：M2 结束时确认版本与许可证再安装。

---

## ADR-003 · Electron 45 + electron-vite 6，保留原 Vite/React 工程

**背景**：已有 Vite 8 + React 19 + R3F 工程；需要桌面壳与文件系统能力。

**决策**：用 `electron-vite` 在同一仓库构建 main / preload / renderer 三份产物，`package.json` 的 `main` 指向 `out/main/index.js`，浏览器模式保留 `npm run dev:web`。安全基线：`contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`、`webSecurity: true`，只暴露 `getRuntimeInfo` 与 `openExternal` 两个 API。

**理由**：不重写渲染层即可获得桌面能力；`electron-vite` 与现有 Vite 配置语义一致；浏览器模式让没有 Electron 二进制的环境（含 CI、本机网络受限时）也能验证 UI。

**代价**：两套构建入口要同时维护；Electron 二进制约 100 MB，下载失败时无法验证桌面路径。**重新评估**：若启动性能或打包体积成为问题，再考虑 Tauri（但会重写文件系统与 IPC 层）。

---

## ADR-002 · M2 用 better-sqlite3，主进程独占数据库（已被 ADR-010 替代）

**背景**：需求要求本地优先、稳定 ID、迁移、备份，且删除书籍不得误删笔记。

**决策**：主进程用 `better-sqlite3`（MIT，同步 API，事务简单）持有唯一连接；渲染进程只能通过 IPC 访问。WAL + `foreign_keys=ON`；迁移只进不退，迁移前自动备份。

**理由**：同步 API 让迁移与事务代码是线性可读的；把数据库锁在单一进程内避免多连接写冲突；SQLite 单文件便于备份与"整个知识库带走"。

**代价**：`better-sqlite3` 是原生模块，需要为 Electron ABI 重新编译（`electron-rebuild`），Windows 上需要构建工具链。**重新评估**：若原生模块打包成为 M7 的阻碍，改用 `node:sqlite`（Node 22+/Electron 内置）或 `sql.js`。

---

## ADR-001 · 银河装饰层与知识层严格分离

**背景**：原始原型已有 3–5 万粒子的银河，视觉是核心资产；但知识对象需要稳定的 ID 与交互。

**决策**：粒子只由 `GalaxyConfig` 与确定性随机数驱动，不携带节点身份；书籍/划线/笔记/主题由 `KnowledgeGraphData` 渲染在独立层，两层共享相机坐标但不共享数据身份。未来 `GraphDataAdapter` 只做投影，不创造 ID。

**理由**：让"好看"与"可查询"解耦；粒子数量可以随时调整而不影响知识库；避免点击粒子反查知识的脆弱实现。

**代价**：星图布局不能直接用力导向模拟粒子的位置，需要单独的 `graph_layouts` 表（M5）。**重新评估**：M5 若发现布局表达力不足，引入受约束的力导向布局，但仍写入 `graph_layouts`。
