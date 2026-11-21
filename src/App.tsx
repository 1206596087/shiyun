import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { GalaxyScene } from './components/galaxy/GalaxyScene'
import { DebugPanel } from './components/ui/DebugPanel'
import { InspectorPanel } from './components/ui/InspectorPanel'
import { KnowledgeExplorer } from './components/ui/KnowledgeExplorer'
import { TopBar } from './components/ui/TopBar'
import { KnowledgeWorkspace } from './components/workspace/KnowledgeWorkspace'
import { loadKnowledgeGraph, saveKnowledgeGraph, validateKnowledgeGraph } from './data/knowledgeRepository'
import { entityIdOf } from './data/graphProjection'
import { getGraphBridge, type GraphMode } from './data/graphBridge'
import type { GraphLayout, KnowledgeLink, KnowledgeNode, KnowledgeNodeType } from './types/knowledge'
import { DEFAULT_GALAXY_CONFIG, type GalaxyConfig, type ViewMode } from './types/galaxy'
import type { WorkspaceOpenTarget } from './types/workspace'
import { hashString, mulberry32 } from './utils/random'

const ALL_TYPES = new Set<KnowledgeNodeType>(['topic', 'book', 'highlight', 'note'])
const DISCIPLINE_ANGLES: Record<string, number> = { medicine: -0.5, mathematics: 0.76, physics: 2.01, literature: 3.27, philosophy: 4.52 }

function App() {
  const [activeSpace, setActiveSpace] = useState<'galaxy' | 'workspace'>(() =>
    new URLSearchParams(window.location.search).get('space') === 'workspace' ? 'workspace' : 'galaxy',
  )
  const [config, setConfig] = useState<GalaxyConfig>(() => {
    try { return { ...DEFAULT_GALAXY_CONFIG, ...JSON.parse(localStorage.getItem('shiyun-view-config') ?? '{}') } }
    catch { return DEFAULT_GALAXY_CONFIG }
  })
  const [graph, setGraph] = useState(loadKnowledgeGraph)
  const [mode, setMode] = useState<ViewMode>('universe')
  const [paused, setPaused] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null)
  const [relationCandidates, setRelationCandidates] = useState<string[]>([])
  const [visibleTypes, setVisibleTypes] = useState(new Set(ALL_TYPES))
  const [focusPosition, setFocusPosition] = useState<[number, number, number] | null>(null)
  const [resetToken, setResetToken] = useState(0)
  const [notice, setNotice] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [openTarget, setOpenTarget] = useState<WorkspaceOpenTarget | null>(null)
  // 桌面版：星图由 SQLite 投影；浏览器演示版：仍是 localStorage 里的原型图谱。
  const graphBridge = useMemo(() => getGraphBridge(), [])
  const graphMode: GraphMode = graphBridge.mode

  // 书库模式不在浏览器存储里写图：银河的权威副本是 SQLite（见 ARCHITECTURE 第 3 节）。
  useEffect(() => {
    if (graphMode === 'prototype') saveKnowledgeGraph(graph)
  }, [graph, graphMode])
  useEffect(() => localStorage.setItem('shiyun-view-config', JSON.stringify(config)), [config])
  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    if (graphMode !== 'library') return
    let cancelled = false
    const load = async () => {
      try {
        const projected = await graphBridge.load()
        if (cancelled || !projected) return
        setGraph(projected)
        setNotice(`星图已由书库投影：${projected.nodes.length} 个节点 / ${projected.links.length} 条关系`)
      } catch (error) {
        if (!cancelled) setNotice(error instanceof Error ? `星图读取失败：${error.message}` : '星图读取失败')
      }
    }
    void load()
    return () => { cancelled = true }
  }, [graphBridge, graphMode])

  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) ?? null
  const selectedLink = graph.links.find((link) => link.id === selectedLinkId) ?? null
  const nodeCount = graph.nodes.length

  /**
   * 书库改过（新建文件夹、导入书、写划线/笔记）之后重新投影一次。
   * 从书房回到银河时自动调用，知识探索面板上也有手动入口。
   */
  const refreshGraph = async () => {
    if (graphMode !== 'library') return
    try {
      const projected = await graphBridge.load()
      if (!projected) return
      setGraph(projected)
      setNotice(`星图已刷新：${projected.nodes.length} 个节点 / ${projected.links.length} 条关系`)
    } catch (error) {
      setNotice(error instanceof Error ? `星图刷新失败：${error.message}` : '星图刷新失败')
    }
  }

  const focusNode = (id: string) => {
    const layout = graph.layouts.find((item) => item.nodeId === id)
    if (!layout) return
    setSelectedNodeId(id)
    setSelectedLinkId(null)
    setMode('focus')
    setFocusPosition([layout.x, layout.y, layout.z])
  }

  const selectNode = (id: string, focus = false) => {
    setSelectedNodeId(id)
    setSelectedLinkId(null)
    if (mode === 'universe') setMode('knowledge')
    if (focus) focusNode(id)
  }

  /** 银河节点 → 书房：书打开对应页，划线定位到页码/CFI，笔记直接打开（验收 D）。 */
  const openInWorkspace = (node: KnowledgeNode) => {
    const token = Date.now()
    if (node.type === 'note') {
      setOpenTarget({ token, kind: 'note', noteId: entityIdOf(node.id) })
      setActiveSpace('workspace')
      return
    }
    const entityId = entityIdOf(node.id)
    if (node.type === 'book') {
      setOpenTarget({ token, kind: 'book', bookId: entityId })
      setActiveSpace('workspace')
      return
    }
    if (node.type === 'highlight') {
      const bookId = typeof node.metadata.bookId === 'string' ? node.metadata.bookId : ''
      if (!bookId) return
      const page = typeof node.metadata.page === 'number' ? node.metadata.page : undefined
      const cfi = typeof node.metadata.cfi === 'string' ? node.metadata.cfi : undefined
      // 聚合星团（节点数超限）没有单条划线的定位信息，只能打开这本书。
      setOpenTarget({ token, kind: page || cfi ? 'highlight' : 'book', bookId, ...(page ? { page } : {}), ...(cfi ? { cfi } : {}) })
      setActiveSpace('workspace')
      return
    }
    focusNode(node.id)
  }

  /**
   * 双击语义：书库模式里「进入原文」，演示模式里保持旧的「飞过去」。
   * 主题星没有原文可跳，仍然只是聚焦。
   */
  const handleNodeFocus = (id: string) => {
    const node = graph.nodes.find((item) => item.id === id)
    if (graphMode === 'library' && node && node.type !== 'topic') {
      openInWorkspace(node)
      return
    }
    focusNode(id)
  }

  const resetView = () => {
    setSelectedNodeId(null)
    setSelectedLinkId(null)
    setFocusPosition(null)
    setMode('universe')
    setResetToken((value) => value + 1)
  }

  const toggleType = (type: KnowledgeNodeType) => {
    setVisibleTypes((current) => {
      const next = new Set(current)
      if (next.has(type)) next.delete(type); else next.add(type)
      return next
    })
  }

  const toggleCandidate = (id: string) => {
    setRelationCandidates((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current.slice(-1), id])
  }

  const createRelation = (relationType: string, description: string) => {
    if (relationCandidates.length !== 2) return
    const [sourceId, targetId] = relationCandidates
    const next: KnowledgeLink = {
      id: `link-user-${crypto.randomUUID()}`,
      sourceId,
      targetId,
      relationType,
      description: description.trim() || '用户在原型中创建的知识关系',
    }
    setGraph((current) => ({ ...current, links: [...current.links, next] }))
    setRelationCandidates([])
    setSelectedLinkId(next.id)
    setSelectedNodeId(null)
    setNotice('关系已建立，并保存到浏览器本地存储')
  }

  const deleteRelation = (id: string) => {
    setGraph((current) => ({ ...current, links: current.links.filter((link) => link.id !== id) }))
    setSelectedLinkId(null)
    setNotice('关系已删除，节点保持不变')
  }

  const addNote = (title: string, content: string, discipline: string) => {
    const id = `note-user-${crypto.randomUUID()}`
    const now = new Date().toISOString()
    const item: KnowledgeNode = { id, type: 'note', title, content, metadata: { discipline, status: 'prototype' }, createdAt: now, updatedAt: now }
    const random = mulberry32(hashString(id))
    const angle = (DISCIPLINE_ANGLES[discipline] ?? 0) + 2.05 + (random() - 0.5) * 0.42
    const radius = 10.4 + random() * 2.2
    const layout: GraphLayout = { nodeId: id, x: Math.cos(angle) * radius, y: (random() - 0.5) * 1.5, z: Math.sin(angle) * radius }
    setGraph((current) => ({ ...current, nodes: [...current.nodes, item], layouts: [...current.layouts, layout] }))
    setNotice('演示笔记已创建')
    focusNodeAfterLayout(id, layout)
  }

  const focusNodeAfterLayout = (id: string, layout: GraphLayout) => {
    setSelectedNodeId(id)
    setSelectedLinkId(null)
    setMode('focus')
    setFocusPosition([layout.x, layout.y, layout.z])
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `shiyun-knowledge-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setNotice('知识图谱 JSON 已导出')
  }

  const importJson = async (file: File) => {
    try {
      const imported = validateKnowledgeGraph(JSON.parse(await file.text()))
      setGraph(imported)
      resetView()
      setNotice(`已导入 ${imported.nodes.length} 个知识节点`)
    } catch (error) {
      setNotice(error instanceof Error ? `导入失败：${error.message}` : '导入失败')
    }
  }

  /** 拖动星星：先只更新本地坐标（跟着指针走），松手时才写库。 */
  const moveNode = (id: string, position: [number, number, number]) => {
    setGraph((current) => ({
      ...current,
      layouts: current.layouts.map((layout) =>
        layout.nodeId === id ? { ...layout, x: position[0], y: position[1], z: position[2] } : layout,
      ),
    }))
  }

  const finishMoveNode = (id: string, position: [number, number, number]) => {
    moveNode(id, position)
    if (graphMode !== 'library') return
    const title = graph.nodes.find((node) => node.id === id)?.title ?? '这颗星'
    void graphBridge
      .pin(id, { x: position[0], y: position[1], z: position[2] })
      .then((pinned) => setNotice(pinned ? `已固定「${title}」的位置（写入 graph_layouts）` : `「${title}」的坐标只改了当前会话`))
      .catch((error) => setNotice(error instanceof Error ? `固定位置失败：${error.message}` : '固定位置失败'))
  }

  const statistics = useMemo(() => ({ links: graph.links.length, nodes: nodeCount }), [graph.links.length, nodeCount])

  return (
    <div className="shiyun-root">
    <main className={`app-shell galaxy-space space-layer mode-${mode} ${activeSpace === 'galaxy' ? 'is-active' : 'is-inactive'}`} aria-hidden={activeSpace !== 'galaxy'}>
      <GalaxyScene
        active={activeSpace === 'galaxy'}
        config={config}
        graph={graph}
        mode={mode}
        paused={paused || activeSpace === 'workspace'}
        selectedNodeId={selectedNodeId}
        selectedLinkId={selectedLinkId}
        visibleTypes={visibleTypes}
        focusPosition={focusPosition}
        resetToken={resetToken}
        onSelectNode={(id) => selectNode(id)}
        onSelectLink={(id) => { setSelectedLinkId(id); setSelectedNodeId(null); if (mode === 'universe') setMode('knowledge') }}
        onFocusNode={handleNodeFocus}
        onClearSelection={resetView}
        dragActive={dragActive}
        onNodeDrag={moveNode}
        onNodeDragEnd={finishMoveNode}
        onDragStateChange={setDragActive}
      />
      <div className="vignette" />
      <TopBar mode={mode} paused={paused} onMode={setMode} onReset={resetView} onPause={() => setPaused((value) => !value)} onEnterWorkspace={() => setActiveSpace('workspace')} />
      <KnowledgeExplorer
        graph={graph}
        source={graphMode}
        visibleTypes={visibleTypes}
        onToggleType={toggleType}
        onSelect={selectNode}
        onAddNote={addNote}
        onExport={exportJson}
        onImport={importJson}
        onRefresh={() => { void refreshGraph() }}
      />
      <DebugPanel config={config} onChange={setConfig} />
      <InspectorPanel
        graph={graph}
        selectedNode={selectedNode}
        selectedLink={selectedLink}
        relationCandidates={relationCandidates}
        onToggleCandidate={toggleCandidate}
        onCreateRelation={createRelation}
        onDeleteRelation={deleteRelation}
        onSelectNode={(id) => selectNode(id)}
        onOpenSource={(node) => openInWorkspace(node)}
        onClose={() => { setSelectedNodeId(null); setSelectedLinkId(null) }}
      />
      <div className="status-strip">
        <span className="status-dot" /> WebGL 实时渲染 <i />
        {graphMode === 'library' ? '书库投影' : '浏览器存储'} <i />
        {statistics.nodes} 个知识节点 <i /> {statistics.links} 条关系
      </div>
      <div className="interaction-hint">
        <span>左键旋转</span><span>滚轮缩放</span><span>右键平移</span>
        <span>{graphMode === 'library' ? '拖动星辰固定位置 · 双击回原文' : '双击星辰聚焦'}</span>
      </div>
      {notice && <div className="toast">{notice}</div>}
    </main>
    <KnowledgeWorkspace
      active={activeSpace === 'workspace'}
      graph={graph}
      openTarget={openTarget}
      onReturnGalaxy={() => { setActiveSpace('galaxy'); void refreshGraph() }}
      onOpenNode={(id) => { setActiveSpace('galaxy'); focusNode(id) }}
    />
    </div>
  )
}

export default App
