import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { FileSidebar } from './FileSidebar'
import { ReadingDesk } from './ReadingDesk'
import { ResearchSidebar, type ResearchLayout } from './BrowserSidebar'
import { WorkspaceHeader } from './WorkspaceHeader'
import { clampWidth, sanitizeWorkspaceUi } from './workspaceLayout'
import { DEFAULT_WORKSPACE_UI, type WorkspaceOpenTarget, type WorkspaceTab, type WorkspaceUiState } from '../../types/workspace'
import type { KnowledgeGraphData } from '../../types/knowledge'
import type { LibraryCounts, LibraryFolder, LibraryNodeKind, LibraryTree } from '../../types/library'
import { getLibraryBridge, type LibraryBridge, type LibraryMode } from '../../data/libraryBridge'
import { getAnnotationBridge } from '../../data/annotationBridge'
import { getClippingBridge } from '../../data/clippingBridge'
import { readableNoteTitle, type Highlight } from '../../types/annotation'
import type { ReaderFocus } from './ReaderPane'
import { migratePrototypeOnce } from '../../data/prototypeMigration'
import type { ResearchRequest } from '../../data/selectionActions'
import './Workspace.css'

const STORAGE_KEY = 'shiyun-workspace-ui-v1'
const RESEARCH_LAYOUT_KEY = 'shiyun-research-layout-v1'
const EMPTY_COUNTS: LibraryCounts = { books: 0, folders: 0, highlights: 0, notes: 0, clippings: 0, links: 0 }
const HIGHLIGHTS_TAB: WorkspaceTab = { id: 'highlights', kind: 'highlights', title: '我的划线' }
const NOTES_TAB: WorkspaceTab = { id: 'notes', kind: 'notes', title: '我的笔记' }
const CLIPPINGS_TAB: WorkspaceTab = { id: 'clippings', kind: 'clippings', title: '我的摘录' }
const LEGACY_NOTE_TAB_ID = 'note-or-rr'

function loadResearchLayout(): ResearchLayout {
  const saved = localStorage.getItem(RESEARCH_LAYOUT_KEY)
  return saved === 'expanded' || saved === 'immersive' ? saved : 'compact'
}

function loadWorkspaceState(): WorkspaceUiState {
  const state = (() => {
    try {
      return sanitizeWorkspaceUi(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'))
    } catch {
      return sanitizeWorkspaceUi(null)
    }
  })()
  // M3 之前那个「草稿笔记」标签是纯演示数据，M4 起笔记标签的 id 就是笔记 ID：
  // 旧 id 留在状态里会指向一篇不存在的笔记，直接丢掉。
  const tabs = state.tabs.filter((tab) => !(tab.kind === 'note' && tab.id === LEGACY_NOTE_TAB_ID))
  return {
    ...state,
    tabs,
    activeTabId: tabs.some((tab) => tab.id === state.activeTabId) ? state.activeTabId : tabs[0]?.id ?? null,
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function collectLibraryIds(tree: LibraryTree): { folders: Set<string>; nodes: Set<string> } {
  const folders = new Set<string>()
  const nodes = new Set<string>(tree.uncategorized.map((book) => book.id))
  const nodesForFolder = (folder: LibraryFolder) => {
    folders.add(folder.id)
    folder.children.forEach((child) => {
      nodes.add(child.id)
      if (child.kind === 'folder') nodesForFolder(child)
    })
  }
  const visitRoots = (roots: LibraryFolder[]) => roots.forEach((folder) => {
    nodes.add(folder.id)
    nodesForFolder(folder)
  })
  visitRoots(tree.folders)
  return { folders, nodes }
}

function importFolderId(tree: LibraryTree, selectedId: string | null): string | null {
  if (!selectedId) return null
  const ids = collectLibraryIds(tree)
  if (ids.folders.has(selectedId)) return selectedId
  return findBook(tree, selectedId)?.folderId ?? null
}

interface Props {
  active: boolean
  graph: KnowledgeGraphData
  onReturnGalaxy: () => void
  onOpenNode: (id: string) => void
  /** 银河里双击一颗星后交给书房的目标（书籍 / 划线定位 / 笔记）。 */
  openTarget?: WorkspaceOpenTarget | null
}

export function KnowledgeWorkspace({ active, graph, onReturnGalaxy, onOpenNode, openTarget }: Props) {
  const [state, setState] = useState(loadWorkspaceState)
  const [library, setLibrary] = useState<LibraryTree | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // 桥接对象在挂载时确定一次：桌面版走 IPC，浏览器版走内存演示库。
  const bridge = useMemo(() => getLibraryBridge(), [])
  const annotations = useMemo(() => getAnnotationBridge(), [])
  const clippings = useMemo(() => getClippingBridge(), [])
  const mode: LibraryMode = bridge.mode
  const bridgeRef = useRef<LibraryBridge | null>(bridge)
  const resizeSide = useRef<'left' | 'right' | null>(null)
  const [focusMap, setFocusMap] = useState<Record<string, ReaderFocus>>({})
  const [researchLayout, setResearchLayout] = useState<ResearchLayout>(loadResearchLayout)
  const [researchRequest, setResearchRequest] = useState<(ResearchRequest & { token: number }) | null>(null)

  const acceptLibrary = useCallback((tree: LibraryTree) => {
    setLibrary(tree)
    const valid = collectLibraryIds(tree)
    setState((current) => {
      const tabs = current.tabs.filter((tab) => tab.kind !== 'book' || valid.nodes.has(tab.id))
      return {
        ...current,
        tabs,
        activeTabId: tabs.some((tab) => tab.id === current.activeTabId)
          ? current.activeTabId
          : tabs.at(-1)?.id ?? null,
        selectedFolderId: current.selectedFolderId && valid.nodes.has(current.selectedFolderId)
          ? current.selectedFolderId
          : null,
        expandedFolderIds: current.expandedFolderIds.filter((id) => valid.folders.has(id)),
      }
    })
  }, [])

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)), [state])
  useEffect(() => localStorage.setItem(RESEARCH_LAYOUT_KEY, researchLayout), [researchLayout])

  useEffect(() => {
    const openResearch = (event: Event) => {
      const detail = (event as CustomEvent<ResearchRequest>).detail
      if (!detail?.url) return
      setState((current) => ({ ...current, rightVisible: true }))
      setResearchRequest({ ...detail, token: Date.now() })
    }
    window.addEventListener('shiyun-research-open', openResearch)
    return () => window.removeEventListener('shiyun-research-open', openResearch)
  }, [])

  // 打开书库一次：桌面版先做原型数据迁移，再取树；浏览器版直接用演示书库。
  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      if (bridge.mode === 'desktop' && window.shiyunDesktop) {
        try {
          const migrated = await migratePrototypeOnce(window.shiyunDesktop.library)
          if (migrated.imported && !cancelled) {
            setNotice(`已把原型数据写入书库：${migrated.books} 本书 / ${migrated.notes} 篇笔记 / ${migrated.highlights} 条划线`)
          }
        } catch (error) {
          if (!cancelled) setNotice(`原型数据迁移失败：${describeError(error)}`)
        }
      }
      try {
        const tree = await bridge.listTree()
        if (!cancelled) acceptLibrary(tree)
      } catch (error) {
        if (!cancelled) setNotice(`书库读取失败：${describeError(error)}`)
      }
    }
    void boot()
    return () => { cancelled = true }
  }, [acceptLibrary, bridge])

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (resizeSide.current === 'left') setState((current) => ({ ...current, leftWidth: clampWidth('left', event.clientX) }))
      if (resizeSide.current === 'right') setState((current) => ({ ...current, rightWidth: clampWidth('right', window.innerWidth - event.clientX) }))
    }
    const stop = () => {
      if (!resizeSide.current) return
      resizeSide.current = null
      document.body.classList.remove('is-resizing-workspace')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      document.body.classList.remove('is-resizing-workspace')
    }
  }, [])

  const graphCounts = useMemo(() => ({
    highlights: graph.nodes.filter((node) => node.type === 'highlight').length,
    notes: graph.nodes.filter((node) => node.type === 'note').length,
    links: graph.links.length,
  }), [graph])

  const update = (patch: Partial<WorkspaceUiState>) => setState((current) => ({ ...current, ...patch }))
  const beginResize = (side: 'left' | 'right', event: ReactPointerEvent) => {
    event.preventDefault()
    resizeSide.current = side
    document.body.classList.add('is-resizing-workspace')
  }
  const toggleFolder = (id: string) => update({
    expandedFolderIds: state.expandedFolderIds.includes(id)
      ? state.expandedFolderIds.filter((value) => value !== id)
      : [...state.expandedFolderIds, id],
  })
  const openTab = (tab: WorkspaceTab) => update({
    tabs: state.tabs.some((item) => item.id === tab.id) ? state.tabs : [...state.tabs, tab],
    activeTabId: tab.id,
  })
  const closeTab = (id: string) => {
    const tabs = state.tabs.filter((tab) => tab.id !== id)
    update({ tabs, activeTabId: state.activeTabId === id ? tabs.at(-1)?.id ?? null : state.activeTabId })
  }
  const resetLayout = () => update({
    leftWidth: DEFAULT_WORKSPACE_UI.leftWidth,
    rightWidth: DEFAULT_WORKSPACE_UI.rightWidth,
    rightVisible: true,
  })

  /** 书库里的书 ID → 可读标题，划线/笔记列表里用来标明「这条划线是哪本书的」。 */
  const bookTitle = (bookId: string) => findBook(library, bookId)?.title ?? '未知书籍'

  const refreshLibrary = async () => {
    const current = bridgeRef.current
    if (!current) return
    try {
      acceptLibrary(await current.listTree())
    } catch {
      // 刷新失败不影响正在看的页面，下一次操作会再试
    }
  }

  useEffect(() => {
    const changed = () => {
      void bridgeRef.current?.listTree().then(acceptLibrary)
    }
    window.addEventListener('shiyun-library-changed', changed)
    return () => window.removeEventListener('shiyun-library-changed', changed)
  }, [acceptLibrary])

  /** 笔记标签页的 id 就是笔记 ID；标题取「显式标题 → 正文首行」。 */
  const openNoteTab = async (noteId: string) => {
    if (state.tabs.some((tab) => tab.id === noteId)) {
      update({ activeTabId: noteId })
      return
    }
    let title = '笔记'
    try {
      const note = await annotations.getNote(noteId)
      if (note) title = readableNoteTitle(note.title, note.bodyText)
    } catch {
      // 读不到就用占位标题，NoteEditor 里会显示具体错误
    }
    openTab({ id: noteId, kind: 'note', title })
  }

  const createNoteTab = async () => {
    try {
      const note = await annotations.createNote({})
      openTab({ id: note.id, kind: 'note', title: '未命名笔记' })
      void refreshLibrary()
    } catch (error) {
      setNotice(`新建笔记失败：${describeError(error)}`)
    }
  }

  /** 从一条划线新建笔记：笔记创建时就带上 highlightId，双向关系一次落库。 */
  const createNoteForHighlight = async (highlightId: string) => {
    try {
      const note = await annotations.createNote({ highlightId })
      openTab({ id: note.id, kind: 'note', title: '未命名笔记' })
      void refreshLibrary()
    } catch (error) {
      setNotice(`新建笔记失败：${describeError(error)}`)
    }
  }

  /** 从划线列表 / 笔记里的关联划线跳到原文：打开那本书的标签页，并把页码或 CFI 交给 ReaderPane。 */
  const openSource = (highlight: Highlight) => {
    const title = bookTitle(highlight.bookId)
    const focus: ReaderFocus = {
      token: Date.now(),
      ...(highlight.locatorType === 'pdf_page' && highlight.page ? { page: highlight.page } : {}),
      ...(highlight.cfi ? { cfi: highlight.cfi } : {}),
    }
    setFocusMap((current) => ({ ...current, [highlight.bookId]: focus }))
    openTab({ id: highlight.bookId, kind: 'book', title })
  }

  const openLibraryList = (kind: 'highlights' | 'notes' | 'clippings') => {
    openTab(kind === 'highlights' ? HIGHLIGHTS_TAB : kind === 'notes' ? NOTES_TAB : CLIPPINGS_TAB)
    void refreshLibrary()
    void recountAnnotations()
  }

  /**
   * 左栏的划线 / 笔记计数必须跟着真实写入走。
   * 书库树里的 counts 是打开书库那一刻的快照，写一篇笔记或划一条线之后就不准了，
   * 所以这里单独问注释层要一次数量。
   */
  const [annotationCounts, setAnnotationCounts] = useState<{ highlights: number; notes: number; clippings: number } | null>(null)
  const recountAnnotations = useCallback(async () => {
    try {
      const [highlightList, noteList, clippingCount] = await Promise.all([
        annotations.listAllHighlights(),
        annotations.listNotes(),
        clippings.count(),
      ])
      setAnnotationCounts({ highlights: highlightList.length, notes: noteList.length, clippings: clippingCount })
    } catch {
      // 计数失败不影响主流程，保持上一次的数字
    }
  }, [annotations, clippings])
  useEffect(() => {
    void recountAnnotations()
  }, [recountAnnotations])

  const retitleNote = (noteId: string, title: string) => {
    update({
      tabs: state.tabs.map((tab) => (tab.id === noteId && tab.kind === 'note' ? { ...tab, title } : tab)),
    })
  }

  // 银河 → 书房：双击一颗星就打开对应的书 / 笔记，划线还要定位到页码或 CFI（验收 D）。
  // 用 token 去重，避免重新渲染时把用户已经切走的标签又拉回来。
  const handledTarget = useRef(0)
  useEffect(() => {
    if (!openTarget || openTarget.token === handledTarget.current) return
    handledTarget.current = openTarget.token
    if (openTarget.kind === 'note' && openTarget.noteId) {
      void openNoteTab(openTarget.noteId)
      return
    }
    const bookId = openTarget.bookId
    if (!bookId) return
    if (openTarget.kind === 'highlight') {
      const focus: ReaderFocus = {
        token: openTarget.token,
        ...(openTarget.page ? { page: openTarget.page } : {}),
        ...(openTarget.cfi ? { cfi: openTarget.cfi } : {}),
      }
      setFocusMap((current) => ({ ...current, [bookId]: focus }))
    }
    openTab({ id: bookId, kind: 'book', title: bookTitle(bookId) })
    // 只在收到新的跳转目标时执行一次；token 已经保证同一次跳转不会重复处理。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTarget])

  /** 所有书库写操作都走这里：统一 busy 状态、统一错误提示，失败不留半截 UI。 */
  const mutate = async (label: string, action: (bridge: LibraryBridge) => Promise<LibraryTree>) => {
    const bridge = bridgeRef.current
    if (!bridge) return
    setBusy(true)
    try {
      acceptLibrary(await action(bridge))
      setNotice(null)
    } catch (error) {
      setNotice(`${label}失败：${describeError(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const tree: LibraryTree = library ?? {
    folders: [],
    uncategorized: [],
    counts: { ...EMPTY_COUNTS, highlights: graphCounts.highlights, notes: graphCounts.notes, links: graphCounts.links },
    dataDir: '正在打开书库…',
  }

  const handleImport = async () => {
    const bridge = bridgeRef.current
    if (!bridge || bridge.mode !== 'desktop') {
      setNotice('导入书籍需要桌面版（SQLite 书库）')
      return
    }
    setBusy(true)
    try {
      const report = await bridge.importBook(importFolderId(tree, state.selectedFolderId))
      if (report) {
        acceptLibrary(report.tree)
        setNotice(report.imported > 0
          ? `已导入 ${report.imported} 本${report.skipped > 0 ? `，${report.skipped} 本已在书库里` : ''}`
          : `这些文件已在书库里（${report.skipped} 本），没有重复导入`)
      }
    } catch (error) {
      setNotice(`导入失败：${describeError(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const style = {
    '--ws-left': `${state.leftWidth}px`,
    '--ws-right': state.rightVisible
      ? researchLayout === 'expanded' ? `min(62vw, ${Math.max(620, state.rightWidth)}px)` : `${state.rightWidth}px`
      : '0px',
  } as CSSProperties

  // 键盘快捷键：只在书房是当前空间时生效，输入框里的按键照旧交给输入框。
  // Ctrl/Cmd+O 导入书籍、Ctrl/Cmd+B 开关右栏（研究栏）；其余组合键不动，避免抢系统快捷键。
  const shortcutRef = useRef({ import: handleImport, toggleRight: () => update({ rightVisible: !state.rightVisible }) })
  shortcutRef.current = { import: handleImport, toggleRight: () => update({ rightVisible: !state.rightVisible }) }

  useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'o') {
        event.preventDefault()
        void shortcutRef.current.import()
        return
      }
      if (key === 'b') {
        event.preventDefault()
        shortcutRef.current.toggleRight()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active])

  return (
    <section
      className={`workspace-space ${active ? 'is-active' : 'is-inactive'} ${state.rightVisible ? 'has-research' : 'is-research-hidden'} research-layout-${researchLayout}`}
      style={style}
      aria-hidden={!active}
    >
      <WorkspaceHeader
        graph={graph}
        rightVisible={state.rightVisible}
        onReturnGalaxy={onReturnGalaxy}
        onToggleRight={() => update({ rightVisible: !state.rightVisible })}
        onResetLayout={resetLayout}
        onOpenNode={onOpenNode}
      />

      <div className="workspace-grid">
        <FileSidebar
          tree={tree}
          mode={mode}
          busy={busy}
          expandedIds={state.expandedFolderIds}
          selectedId={state.selectedFolderId}
          counts={{
            ...tree.counts,
            highlights: annotationCounts?.highlights ?? tree.counts.highlights,
            notes: annotationCounts?.notes ?? tree.counts.notes,
            clippings: annotationCounts?.clippings ?? tree.counts.clippings,
          }}
          onToggle={toggleFolder}
          onSelect={(selectedFolderId) => update({ selectedFolderId })}
          onOpenBook={(id, title) => openTab({ id, title, kind: 'book' })}
          onOpenHighlights={() => openLibraryList('highlights')}
          onOpenNotes={() => openLibraryList('notes')}
          onOpenClippings={() => openLibraryList('clippings')}
          onOpenNebula={onReturnGalaxy}
          onCreateFolder={(parentId, name) => void mutate('新建文件夹', (bridge) => bridge.createFolder(name, parentId))}
          onRename={(kind: LibraryNodeKind, id, name) => void mutate('重命名', (bridge) => bridge.renameNode(kind, id, name))}
          onMove={(kind: LibraryNodeKind, id, targetFolderId) => void mutate('移动', (bridge) => bridge.moveNode(kind, id, targetFolderId))}
          onDeleteFolder={(id, name) => {
            if (!window.confirm(`删除文件夹「${name}」？里面的书会移到「未分类」，不会被删除。`)) return
            void mutate('删除文件夹', (bridge) => bridge.deleteFolder(id))
          }}
          onDeleteBook={(id, title) => {
            if (!window.confirm(`把《${title}》移到回收站？它的笔记不会被删除。`)) return
            void mutate('删除书籍', (bridge) => bridge.deleteBook(id))
          }}
          onImport={() => void handleImport()}
        />

        <div
          className="ws-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整左侧文件栏宽度"
          onPointerDown={(event) => beginResize('left', event)}
        />

        <ReadingDesk
          tabs={state.tabs}
          activeTabId={state.activeTabId}
          rightVisible={state.rightVisible}
          bridge={bridge}
          annotations={annotations}
          clippings={clippings}
          bookTitle={bookTitle}
          focusFor={(bookId) => focusMap[bookId] ?? null}
          onActivate={(activeTabId) => update({ activeTabId })}
          onClose={closeTab}
          onNewNote={() => void createNoteTab()}
          onNewNoteForHighlight={(highlightId) => void createNoteForHighlight(highlightId)}
          onOpenNote={(noteId) => void openNoteTab(noteId)}
          onOpenSource={openSource}
          onFocusHighlight={openSource}
          onTitleChange={retitleNote}
          onResearchUrl={(url) => {
            // 「打开原网页」走右栏原生网页视图；右栏被隐藏时先打开它。
            if (!state.rightVisible) update({ rightVisible: true })
            setResearchRequest({ url, newTab: true, token: Date.now() })
          }}
          onAnnotationsChange={() => void recountAnnotations()}
          onToggleRight={() => update({ rightVisible: !state.rightVisible })}
        />

        {state.rightVisible && (
          <>
            <div
              className="ws-resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="调整网页研究栏宽度"
              onPointerDown={(event) => beginResize('right', event)}
            />
            <ResearchSidebar
              active={active}
              visible={state.rightVisible}
              layout={researchLayout}
              request={researchRequest}
              onLayoutChange={setResearchLayout}
            />
          </>
        )}
      </div>

      {notice && (
        <p className="ws-toast" role="status">
          {notice}
          <button onClick={() => setNotice(null)} aria-label="关闭提示">×</button>
        </p>
      )}
    </section>
  )
}

/** 在书库树里按 ID 找书（文件夹递归 + 未分类）。 */
function findBook(tree: LibraryTree | null, bookId: string) {
  if (!tree) return null
  const stack = [...tree.folders, ...tree.uncategorized]
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node) break
    if (node.kind === 'book' && node.id === bookId) return node
    if (node.kind === 'folder') stack.push(...node.children)
  }
  return null
}
