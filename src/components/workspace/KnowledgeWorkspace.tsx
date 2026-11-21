import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { FileSidebar } from './FileSidebar'
import { ReadingDesk } from './ReadingDesk'
import { ResearchSidebar } from './BrowserSidebar'
import { WorkspaceHeader } from './WorkspaceHeader'
import { clampWidth, sanitizeWorkspaceUi } from './workspaceLayout'
import { DEFAULT_WORKSPACE_UI, type WorkspaceTab, type WorkspaceUiState } from '../../types/workspace'
import type { KnowledgeGraphData } from '../../types/knowledge'
import type { LibraryCounts, LibraryNodeKind, LibraryTree } from '../../types/library'
import { getLibraryBridge, type LibraryBridge, type LibraryMode } from '../../data/libraryBridge'
import { migratePrototypeOnce } from '../../data/prototypeMigration'
import './Workspace.css'

const STORAGE_KEY = 'shiyun-workspace-ui-v1'
const NOTE_TAB: WorkspaceTab = { id: 'note-or-rr', title: 'OR 与 RR：罕见结局近似', kind: 'note', dirty: true }
const EMPTY_COUNTS: LibraryCounts = { books: 0, folders: 0, highlights: 0, notes: 0, links: 0 }

function loadWorkspaceState(): WorkspaceUiState {
  try {
    return sanitizeWorkspaceUi(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'))
  } catch {
    return sanitizeWorkspaceUi(null)
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

interface Props {
  active: boolean
  graph: KnowledgeGraphData
  onReturnGalaxy: () => void
  onOpenNode: (id: string) => void
}

export function KnowledgeWorkspace({ active, graph, onReturnGalaxy, onOpenNode }: Props) {
  const [state, setState] = useState(loadWorkspaceState)
  const [library, setLibrary] = useState<LibraryTree | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // 桥接对象在挂载时确定一次：桌面版走 IPC，浏览器版走内存演示库。
  const bridge = useMemo(() => getLibraryBridge(), [])
  const mode: LibraryMode = bridge.mode
  const bridgeRef = useRef<LibraryBridge | null>(bridge)
  const resizeSide = useRef<'left' | 'right' | null>(null)

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)), [state])

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
        if (!cancelled) setLibrary(tree)
      } catch (error) {
        if (!cancelled) setNotice(`书库读取失败：${describeError(error)}`)
      }
    }
    void boot()
    return () => { cancelled = true }
  }, [bridge])

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

  /** 所有书库写操作都走这里：统一 busy 状态、统一错误提示，失败不留半截 UI。 */
  const mutate = async (label: string, action: (bridge: LibraryBridge) => Promise<LibraryTree>) => {
    const bridge = bridgeRef.current
    if (!bridge) return
    setBusy(true)
    try {
      setLibrary(await action(bridge))
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
      const report = await bridge.importBook(state.selectedFolderId)
      if (report) {
        setLibrary(report.tree)
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
    '--ws-right': state.rightVisible ? `${state.rightWidth}px` : '0px',
  } as CSSProperties

  return (
    <section
      className={`workspace-space ${active ? 'is-active' : 'is-inactive'} ${state.rightVisible ? 'has-research' : 'is-research-hidden'}`}
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
          counts={tree.counts}
          onToggle={toggleFolder}
          onSelect={(selectedFolderId) => update({ selectedFolderId })}
          onOpenBook={(id, title) => openTab({ id, title, kind: 'book' })}
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
          noteDraft={state.noteDraft}
          rightVisible={state.rightVisible}
          onActivate={(activeTabId) => update({ activeTabId })}
          onClose={closeTab}
          onOpenNote={() => openTab(NOTE_TAB)}
          onNoteDraft={(noteDraft) => update({ noteDraft })}
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
            <ResearchSidebar />
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
