import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { GalaxyScene } from './components/galaxy/GalaxyScene'
import { DebugPanel } from './components/ui/DebugPanel'
import { InspectorPanel } from './components/ui/InspectorPanel'
import { KnowledgeExplorer } from './components/ui/KnowledgeExplorer'
import { TopBar } from './components/ui/TopBar'
import { loadKnowledgeGraph, saveKnowledgeGraph, validateKnowledgeGraph } from './data/knowledgeRepository'
import type { GraphLayout, KnowledgeLink, KnowledgeNode, KnowledgeNodeType } from './types/knowledge'
import { DEFAULT_GALAXY_CONFIG, type GalaxyConfig, type ViewMode } from './types/galaxy'
import { hashString, mulberry32 } from './utils/random'

const ALL_TYPES = new Set<KnowledgeNodeType>(['topic', 'book', 'highlight', 'note'])
const DISCIPLINE_ANGLES: Record<string, number> = { medicine: -0.5, mathematics: 0.76, physics: 2.01, literature: 3.27, philosophy: 4.52 }

function App() {
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

  useEffect(() => saveKnowledgeGraph(graph), [graph])
  useEffect(() => localStorage.setItem('shiyun-view-config', JSON.stringify(config)), [config])
  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) ?? null
  const selectedLink = graph.links.find((link) => link.id === selectedLinkId) ?? null
  const nodeCount = graph.nodes.length

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

  const statistics = useMemo(() => ({ links: graph.links.length, nodes: nodeCount }), [graph.links.length, nodeCount])

  return (
    <main className={`app-shell mode-${mode}`}>
      <GalaxyScene
        config={config}
        graph={graph}
        mode={mode}
        paused={paused}
        selectedNodeId={selectedNodeId}
        selectedLinkId={selectedLinkId}
        visibleTypes={visibleTypes}
        focusPosition={focusPosition}
        resetToken={resetToken}
        onSelectNode={(id) => selectNode(id)}
        onSelectLink={(id) => { setSelectedLinkId(id); setSelectedNodeId(null); if (mode === 'universe') setMode('knowledge') }}
        onFocusNode={focusNode}
        onClearSelection={resetView}
      />
      <div className="vignette" />
      <TopBar mode={mode} paused={paused} onMode={setMode} onReset={resetView} onPause={() => setPaused((value) => !value)} />
      <KnowledgeExplorer graph={graph} visibleTypes={visibleTypes} onToggleType={toggleType} onSelect={selectNode} onAddNote={addNote} onExport={exportJson} onImport={importJson} />
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
        onClose={() => { setSelectedNodeId(null); setSelectedLinkId(null) }}
      />
      <div className="status-strip"><span className="status-dot" /> WebGL 实时渲染 <i /> {statistics.nodes} 个知识节点 <i /> {statistics.links} 条关系</div>
      <div className="interaction-hint"><span>左键旋转</span><span>滚轮缩放</span><span>右键平移</span><span>双击星辰聚焦</span></div>
      {notice && <div className="toast">{notice}</div>}
    </main>
  )
}

export default App
