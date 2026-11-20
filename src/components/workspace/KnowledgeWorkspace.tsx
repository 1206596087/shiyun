import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { FileSidebar } from './FileSidebar'
import { ReadingDesk } from './ReadingDesk'
import { ResearchSidebar } from './BrowserSidebar'
import { WorkspaceHeader } from './WorkspaceHeader'
import { clampWidth, sanitizeWorkspaceUi } from './workspaceLayout'
import { DEFAULT_WORKSPACE_UI, type WorkspaceTab, type WorkspaceUiState } from '../../types/workspace'
import type { KnowledgeGraphData } from '../../types/knowledge'
import './Workspace.css'

const STORAGE_KEY = 'shiyun-workspace-ui-v1'
const NOTE_TAB: WorkspaceTab = { id: 'note-or-rr', title: 'OR 与 RR：罕见结局近似', kind: 'note', dirty: true }

function loadWorkspaceState(): WorkspaceUiState {
  try {
    return sanitizeWorkspaceUi(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'))
  } catch {
    return sanitizeWorkspaceUi(null)
  }
}

interface Props {
  active: boolean
  graph: KnowledgeGraphData
  onReturnGalaxy: () => void
  onOpenNode: (id: string) => void
}

export function KnowledgeWorkspace({ active, graph, onReturnGalaxy, onOpenNode }: Props) {
  const [state, setState] = useState(loadWorkspaceState)
  const resizeSide = useRef<'left' | 'right' | null>(null)

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)), [state])

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

  const counts = useMemo(() => ({
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
          expandedIds={state.expandedFolderIds}
          selectedId={state.selectedFolderId}
          counts={counts}
          onToggle={toggleFolder}
          onSelect={(selectedFolderId) => update({ selectedFolderId })}
          onOpenBook={(id, title) => openTab({ id, title, kind: 'book' })}
          onOpenNebula={onReturnGalaxy}
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
    </section>
  )
}

