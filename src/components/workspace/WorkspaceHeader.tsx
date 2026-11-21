import { useEffect, useMemo, useRef, useState } from 'react'
import type { KnowledgeGraphData, KnowledgeNode, KnowledgeNodeType } from '../../types/knowledge'
import { IconMark, IconSearch, IconSliders, IconSparkle } from './icons'
import { MaintenancePanel } from './MaintenancePanel'

const TYPE_LABEL: Record<KnowledgeNodeType, string> = { book: '书籍', highlight: '划线', note: '笔记', topic: '主题' }

interface Props {
  graph: KnowledgeGraphData
  rightVisible: boolean
  onReturnGalaxy: () => void
  onToggleRight: () => void
  onResetLayout: () => void
  onOpenNode: (id: string) => void
}

export function WorkspaceHeader({ graph, rightVisible, onReturnGalaxy, onToggleRight, onResetLayout, onOpenNode }: Props) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [maintenanceOpen, setMaintenanceOpen] = useState(false)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const toolsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!toolsRef.current?.contains(event.target as Node)) setSettingsOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setSettingsOpen(false)
      setSearchOpen(false)
      setQuery('')
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', escape)
    }
  }, [])

  const results = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return [] as KnowledgeNode[]
    return graph.nodes
      .filter((node) => `${node.title} ${node.content}`.toLowerCase().includes(keyword))
      .slice(0, 8)
  }, [graph.nodes, query])

  const openNode = (id: string) => {
    onOpenNode(id)
    setQuery('')
    setSearchOpen(false)
  }

  return (
    <header className="ws-header">
      <div className="ws-brand">
        <span className="ws-brand__mark"><IconMark size={22} /></span>
        <span className="ws-brand__title">诗云</span>
        <span className="ws-brand__sub">个人知识宇宙</span>
      </div>

      <div className="ws-tools" ref={toolsRef}>
        <button onClick={() => { if (rightVisible) onToggleRight(); setMaintenanceOpen(true) }}>设置与回收站</button>
        {maintenanceOpen && <MaintenancePanel onClose={() => setMaintenanceOpen(false)} />}
        <button className="ws-return" onClick={onReturnGalaxy}>
          <IconSparkle size={14} />
          <span>返回银河</span>
        </button>

        <div className={`ws-search ${searchOpen ? 'is-open' : ''}`}>
          {searchOpen && (
            <form
              className="ws-search__field"
              onSubmit={(event) => {
                event.preventDefault()
                if (results[0]) openNode(results[0].id)
              }}
            >
              <IconSearch size={14} />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索书籍、划线与笔记"
                aria-label="全局搜索"
              />
              <button type="button" aria-label="关闭搜索" onClick={() => { setSearchOpen(false); setQuery('') }}>×</button>
            </form>
          )}
          {!searchOpen && (
            <button className="ws-icon-btn" aria-label="全局搜索" title="全局搜索" onClick={() => setSearchOpen(true)}>
              <IconSearch size={17} />
            </button>
          )}
          {searchOpen && query.trim() && (
            <div className="ws-search__results" role="listbox" aria-label="搜索结果">
              {results.length === 0 && <p className="ws-search__empty">没有找到匹配的知识节点</p>}
              {results.map((node) => (
                <button key={node.id} role="option" aria-selected={false} onClick={() => openNode(node.id)}>
                  <span className="ws-search__title">{node.title}</span>
                  <small>{TYPE_LABEL[node.type]}</small>
                </button>
              ))}
              <span className="ws-search__hint">结果来自当前银河知识库，点击后在银河中定位该节点</span>
            </div>
          )}
        </div>

        <button
          className="ws-icon-btn"
          aria-label="布局设置"
          title="布局设置"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((value) => !value)}
        >
          <IconSliders size={17} />
        </button>

        {settingsOpen && (
          <div className="ws-settings">
            <p>布局设置</p>
            <button onClick={() => { onResetLayout(); setSettingsOpen(false) }}>重置三栏宽度</button>
            <button onClick={() => { onToggleRight(); setSettingsOpen(false) }}>{rightVisible ? '隐藏' : '显示'}网页研究栏</button>
            <span>拖拽分栏之间的竖线可自由调整宽度，状态会自动保存。</span>
          </div>
        )}
      </div>
    </header>
  )
}
