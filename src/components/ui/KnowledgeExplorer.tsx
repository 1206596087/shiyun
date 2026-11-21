import { useRef, useState } from 'react'
import type { KnowledgeGraphData, KnowledgeNode, KnowledgeNodeType } from '../../types/knowledge'

const TYPE_LABELS: Record<KnowledgeNodeType, string> = { topic: '主题', book: '书籍', highlight: '划线', note: '笔记', clipping: '摘录' }

interface Props {
  graph: KnowledgeGraphData
  /** library：星图由 SQLite 投影，浏览器里不再写图，所以「新建演示笔记 / 导入」禁用。 */
  source: 'library' | 'prototype'
  visibleTypes: Set<KnowledgeNodeType>
  onToggleType: (type: KnowledgeNodeType) => void
  onSelect: (id: string, focus?: boolean) => void
  onAddNote: (title: string, content: string, discipline: string) => void
  onExport: () => void
  onImport: (file: File) => void
  /** library 模式下重新从 SQLite 投影一次（书房里刚写了划线/笔记时用）。 */
  onRefresh?: () => void
}

export function KnowledgeExplorer(props: Props) {
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [discipline, setDiscipline] = useState('medicine')
  const inputRef = useRef<HTMLInputElement>(null)
  const library = props.source === 'library'
  const results = query.trim()
    ? props.graph.nodes.filter((node) => `${node.title}${node.content}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : []
  const submitNote = () => {
    if (!title.trim() || !content.trim()) return
    props.onAddNote(title.trim(), content.trim(), discipline)
    setTitle('')
    setContent('')
    setAdding(false)
  }
  return (
    <section className="explorer-panel glass-panel">
      <div className="search-box">
        <span aria-hidden="true">⌕</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索知识星辰…" aria-label="搜索知识节点" />
        {query && <button onClick={() => setQuery('')} aria-label="清空搜索">×</button>}
      </div>
      {results.length > 0 && (
        <div className="search-results">
          {results.map((node) => <SearchResult key={node.id} node={node} onClick={() => { props.onSelect(node.id, true); setQuery('') }} />)}
        </div>
      )}
      <div className="type-filters">
        {(Object.keys(TYPE_LABELS) as KnowledgeNodeType[]).map((type) => (
          <button key={type} className={`filter-${type} ${props.visibleTypes.has(type) ? 'active' : ''}`} onClick={() => props.onToggleType(type)}>
            <i />{TYPE_LABELS[type]}
          </button>
        ))}
      </div>
      <div className="data-actions">
        <button onClick={() => setAdding((value) => !value)} disabled={library} title={library ? '星图由书库投影 · 新笔记请在书房里写（划线 → 写笔记）' : undefined}>＋ 新建演示笔记</button>
        <button onClick={props.onExport}>导出 JSON</button>
        {library ? (
          <button onClick={props.onRefresh} title="从 SQLite 重新投影星图">刷新星图</button>
        ) : (
          <button onClick={() => inputRef.current?.click()}>导入</button>
        )}
        <input ref={inputRef} hidden type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) props.onImport(file); event.target.value = '' }} />
      </div>
      {adding && (
        <div className="note-form">
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="笔记标题" />
          <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="写下你的想法…" rows={3} />
          <select value={discipline} onChange={(event) => setDiscipline(event.target.value)}>
            <option value="medicine">医学</option><option value="mathematics">数学</option><option value="physics">物理学</option><option value="literature">文学</option><option value="philosophy">哲学</option>
          </select>
          <div><button onClick={submitNote}>创建星辰</button><button onClick={() => setAdding(false)}>取消</button></div>
        </div>
      )}
      <p className="prototype-note">{library ? '星图由 SQLite 书库投影 · 节点来自真实书、划线与笔记' : '原型存储 · 修改保存在此浏览器，本阶段不作为正式知识库'}</p>
    </section>
  )
}

function SearchResult({ node, onClick }: { node: KnowledgeNode; onClick: () => void }) {
  return <button onClick={onClick}><i className={`dot-${node.type}`} /><span>{node.title}<small>{TYPE_LABELS[node.type]}</small></span><b>定位</b></button>
}
