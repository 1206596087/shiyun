# 技术决策记录（ADR）

按时间倒序。每条包含：背景 → 决策 → 理由 → 代价 / 何时重新评估。改决策时新增一条并标注被替代的编号，不要删旧记录。

---

## ADR-018 · 用 electron-builder 出 NSIS 安装包，数据目录钉死 `%APPDATA%\shiyun`

**背景**：M7 要交付一个能双击装的 Windows 版本。可选 electron-builder（NSIS/MSI/portable，生态最全、与 electron-vite 常见搭配）或 electron-forge（maker 体系更"官方"，但 NSIS 定制麻烦）。同时有两个打包特有的坑：打包后 `app.getName()` 会从 `shiyun` 变成 `productName`（「诗云」），默认 userData 目录随之改变；打包器默认会去 GitHub 下载 Electron 发行包，在部分网络里会卡满 10 分钟再失败。

**决策**：
- 用 `electron-builder` 26 + NSIS（`oneClick: false`、允许改安装目录、建桌面/开始菜单快捷方式），产物固定 `release/Shiyun-<version>-win-x64.exe`，`release/` 加入 `.gitignore`。
- **数据目录显式钉死**：主进程在 `whenReady` 之前执行 `app.setPath('userData', join(app.getPath('appData'), 'shiyun'))`。开发模式、`win-unpacked`、安装版因此共用同一份书库；升级覆盖安装与卸载都不删数据。
- 图标由仓库内脚本生成（`build/icon-*.png` → `scripts/build-icon.mjs` → `build/icon.ico`），不引图像依赖；`buildResources` 指向 `build/`。
- 打包不重编原生模块（`npmRebuild: false`）——书库用内置 `node:sqlite`，没有任何原生 `.node` 需要处理。
- 提供 `pack` / `dist` 与 `pack:offline` / `dist:offline`：后者带 `-c.electronDist=node_modules/electron/dist`，直接用已装好的 Electron 目录，绕开 GitHub 下载。
- 未配置签名证书（`CSC_IDENTITY_AUTO_DISCOVERY=false`），安装器老实标注「未签名」；自动更新只产出 `latest.yml` 元数据，未接 `autoUpdater`。

**理由**：NSIS 是 Windows 上最不容易被用户误解的安装方式，`electron-builder` 一条命令能同时给出免安装目录与安装器，便于「先验证再交付」。数据目录钉死是数据安全决策，不是配置洁癖：一旦 userData 跟着 productName 变，用户会以为书和划线全丢了。

**代价 / 何时重新评估**：
- 安装包 164 MB 未签名，首次运行有 SmartScreen 提示；有证书后应补签名（`win.certificateFile` / CI 里注入）。
- 自动更新需要发布通道（GitHub Releases 或自建），接线时把 `publish` 配好并在主进程 `autoUpdater` 里加提示 UI。
- 目前只有 x64 与 NSIS 目标；需要便携版或 arm64 时在 `build.win.target` 里加，不影响其他决策。
- `dist:offline` 依赖本机 `node_modules/electron/dist` 与 `%LOCALAPPDATA%\electron-builder\Cache`（`winCodeSign` / `nsis` / `nsis-resources`）已就绪；换机器要先按 AGENTS §7 准备这两处。

---

## ADR-017 · 右栏用主进程 `WebContentsView` 承载真实网页，渲染进程只报矩形

**背景**：需求要求右栏是「真实可用的内嵌浏览器」，不是假面板。可选方案：(a) 渲染进程用 `<webview>` 标签；(b) `<iframe>`；(c) 主进程 `WebContentsView` 挂在窗口上。`<webview>` 已被 Electron 标记为不推荐、且需要额外开关；`iframe` 对多数站点会被 `X-Frame-Options`/CSP 拒绝，还和书房共享同一个渲染进程与安全边界。

**决策**：
- 主进程 `electron/main/researchView.ts` 创建 `WebContentsView`，`win.contentView.addChildView(view)`，独立分区 `persist:research`，`sandbox:true`、`contextIsolation:true`、`nodeIntegration:false`，**不挂 preload**（网页拿不到任何桌面 API）。
- 渲染进程的 `.research-view` 只是占位矩形，`ResearchSidebar` 用 `ResizeObserver` + `window.resize` 把 `getBoundingClientRect()` 报给 `research:setBounds`，主进程用 `win.getContentSize()` 夹一遍再 `setBounds`。
- 切空间 / 隐藏右栏时 `setVisible(false)` → `setBounds({0,0,0,0})`，但 `WebContents` 保留（不销毁）。
- 权限一律拒绝：`setPermissionRequestHandler(cb => cb(false))`、`setPermissionCheckHandler(() => false)`、`will-download` 阻止；`setWindowOpenHandler` 拒绝并把 http(s) 转 `shell.openExternal`；`will-navigate` 拦非 http(s)。
- 地址栏输入由纯函数 `src/data/researchUrl.ts` 归一：完整 URL 直连、裸域名补 `https://`、其余走 Bing 搜索，`file:` / `shiyun-book:` / `javascript:` 一律降级成搜索词。

**理由**：原生视图是唯一能真正加载任意站点、又与外层应用完全隔离的选项；不挂 preload 意味着即使网页被攻破也拿不到 `window.shiyunDesktop`；矩形上报而不是让渲染进程算坐标，避免两套坐标系互相污染。

**代价 / 何时重新评估**：
- 原生视图不进入 DOM：不吃书房的 CSS，也不被 DOM 截图工具拍到（README 的截图是把它自己的截图贴回矩形）；M7 若要「网页跟随阅读进度滚动」需要另设通道。
- 右栏窄（默认 294px）时桌面版网站会横向溢出，属站点排版问题；若用户反馈强烈，M7 可加「移动版链接」或建议宽度。
- 目前不持久化上次访问 URL，也没有站点级权限记忆；需要时在主进程加 `app_settings` 键即可，不必改协议。

---

## ADR-016 · 星图由书库投影（纯函数 + 坐标表），不在渲染进程里造知识

**背景**：M5 要让银河显示真实的知识。三条路可选：渲染进程直接读 SQLite、主进程把实体塞进 `KnowledgeGraphData`、或者让界面自己从实体算坐标。同时要满足「拖动后固定」「双击回原文」「大库不卡死」。

**决策**：
- `src/data/graphProjection.ts` 是**纯函数**投影：输入 `GraphSource`（folders/books/highlights/notes/links/layouts），输出 `{graph, newLayouts, aggregatedHighlights, droppedNotes}`。不读数据库、不读时钟、随机抖动由 `hashText(id)` 派生，因此确定性、可单测（9 个用例）。
- 主进程 `electron/main/db/graph.ts` 负责 IO：`loadGraphSource` → `projectKnowledgeGraph` → `persistLayouts`（新坐标以 `pinned=0` 写入）。
- 渲染进程只有三个通道：`graph:load`、`graph:pin`、`graph:unpin`；**没有任何「新增节点」的入口**——银河里的每个点都必须来自书库实体。
- 节点 id 带种类前缀（`book:` / `hl:` / `hlagg:` / `note:` / `topic:`），`graph_layouts.node_id` 存完整 id，并兼容原型迁移留下的裸实体 id。
- 星图视为**缓存**：从书房回银河时重新 `load()`，Explorer 另有「刷新星图」。
- 超过 5000 节点时按书聚合划线（`hlagg:`），仍超限才丢笔记并在返回值里报告（`droppedNotes`），不静默截断。

**理由**：把「怎么排」和「从哪读」分开，投影可以脱离 Electron 单测；书库是唯一真相，星图只是视图，就不会出现「银河里存在但书库里没有」的幽灵节点（原型阶段的知识层和演示数据正是这个问题）。确定性布局让用户的空间记忆稳定，比每次力导向重排更好用。

**代价**：不是力导向布局，增删节点后邻居不会自动重排；没有文件夹的书都挤在「未分类」星团；渲染进程拿到的是一份完整快照，节点规模大时 IPC 有一次性开销（靠聚合分支兜底）。

**何时重新评估**：书库超过 5000 实体、或需要增量刷新（只推 diff）时，改成 `graph:load({since})` 的增量协议；若日后要做「手动布局 + 力导向混合」，保持投影纯函数、把物理模拟放在渲染侧即可。

---

## ADR-015 · 划线用自绘叠加层，不依赖阅读引擎自带的标注层

**背景**：M4 要把划线画回书页，并支持点开查看与跳转。EPUB.js 自带 `rendition.annotations.highlight()`，pdfjs 自带 `TextLayer` + 文本高亮思路，看似应该直接用。

**决策**：两边都不用引擎自带的标注层。
- PDF：`pdfjs-dist` 的 `TextLayer.render()` 在 Electron 45 里 `await` 永不返回（也不抛错），因此用 `src/components/workspace/pdfTextLayer.ts` 自己把 `textContent.items` 排成绝对定位的 span（`multiplyTransform` / `layoutTextSpans` / `horizontalScale`，纯函数 + 单测）。
- EPUB：`rendition.annotations` 在重开书后一条都画不出来（实测 svg 数为 0），根因是 `book.getRange(cfi)` 返回的 Range 属于旧 document，`getClientRects()` 恒为空；改为 `new EpubCFI(cfi).toRange(当前 iframe 的 document)` 自算几何。
- 两边最后都渲染成同一套 `.book-reader__mark` 按钮（金色/rose/sage），点击走同一个 popover。

**理由**：引擎的标注层在这个 Electron 版本上与「存档后再复原」不兼容，而复原正是这个产品的核心要求；自绘叠加层的坐标来源单一（归一化矩形 / CFI + Range），行为可测、可调试，也不绑死引擎版本。

**代价**：多维护两套几何换算（PDF 的 transform 矩阵、EPUB 的 iframe 坐标偏移），多行选区目前只画第一条矩形的框。

**何时重新评估**：升级 pdfjs / epubjs 大版本时，或需要「跨页划线」「逐行高亮」时——`highlights.rect_json` 已经存了全部矩形，届时只需改渲染层。

---

## ADR-014 · 划线定位 = 页码 + 归一化矩形（PDF）/ CFI（EPUB），两者都带原文与上下文

**背景**：划线必须在缩放、窗口宽度变化、重开应用后仍然落在同一段文字上。需求文档明确禁止「只靠像素坐标」。

**决策**：
- `highlights` 一行只存一种定位：`locator_type='pdf_page'` 时 `page` 必填、`locator_type='epub_cfi'` 时 `cfi` 必填（数据库 `CHECK` 兜底）。
- PDF 额外存 `rect_json`：相对页面宽高的 0–1 矩形数组，绘制时乘回当前视口尺寸，所以缩放不漂移。
- 两者都存 `quote`（原文）、`prefix` / `suffix`（各 40 字上下文，`CONTEXT_WINDOW`），用于未来做「页面改版后的二次对齐」与列表展示。
- 上下文用 `buildContext(pageText, quote)` 从当前页纯文本里截取；找不到就写空，绝不编造。

**理由**：页码/CFI 是「定位到哪」，矩形/引文是「画在哪、是哪句话」。分开之后，即使将来 PDF 页码错位（换版本），也能靠引文做校正；而只存像素的话，一次缩放就全废。

**代价**：一条划线要写 5–7 个字段，导入与复原路径更啰嗦；EPUB 的 CFI 字符串长且难读（界面上只显示前 24 个字符）。

**何时重新评估**：需要跨书、跨版本锚定时（可加 `text_quote_selector` 一类的模糊匹配层），或引入「整章重排」的阅读模式时。

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
