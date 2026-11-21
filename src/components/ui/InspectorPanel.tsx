import { useState } from 'react'
import type { KnowledgeGraphData, KnowledgeLink, KnowledgeNode } from '../../types/knowledge'

interface Props {
  graph: KnowledgeGraphData
  selectedNode: KnowledgeNode | null
  selectedLink: KnowledgeLink | null
  relationCandidates: string[]
  onToggleCandidate: (id: string) => void
  onCreateRelation: (type: string, description: string) => void
  onDeleteRelation: (id: string) => void
  onSelectNode: (id: string) => void
  /** 把这本书 / 这条划线 / 这篇笔记送回书房原文（M5 验收 D）。 */
  onOpenSource: (node: KnowledgeNode) => void
  onClose: () => void
}

const labels = { topic: '主题星团', book: '书籍', highlight: '划线', note: '笔记' }

export function InspectorPanel(props: Props) {
  const [relationType, setRelationType] = useState('relates-to')
  const [description, setDescription] = useState('')
  if (!props.selectedNode && !props.selectedLink && props.relationCandidates.length === 0) return null
  const associations = props.selectedNode
    ? props.graph.links.filter((link) => link.sourceId === props.selectedNode!.id || link.targetId === props.selectedNode!.id)
    : []
  const candidateNodes = props.relationCandidates.map((id) => props.graph.nodes.find((node) => node.id === id)).filter(Boolean) as KnowledgeNode[]

  return (
    <aside className="inspector-panel glass-panel">
      <button className="inspector-close" onClick={props.onClose}>×</button>
      {props.selectedNode && (
        <>
          <span className={`node-kind kind-${props.selectedNode.type}`}>{labels[props.selectedNode.type]}</span>
          <h2>{props.selectedNode.title}</h2>
          <p className="node-content">{props.selectedNode.content}</p>
          <dl>
            {Object.entries(props.selectedNode.metadata).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}
          </dl>
          {props.selectedNode.type !== 'topic' && (
            <button className="source-button" onClick={() => props.onOpenSource(props.selectedNode!)}>
              {props.selectedNode.type === 'book'
                ? '在书房打开这本书'
                : props.selectedNode.type === 'highlight'
                  ? '回到这段原文'
                  : '打开这篇笔记'}
            </button>
          )}
          <button className={`candidate-button ${props.relationCandidates.includes(props.selectedNode.id) ? 'active' : ''}`} onClick={() => props.onToggleCandidate(props.selectedNode!.id)}>
            {props.relationCandidates.includes(props.selectedNode.id) ? '✓ 已选为关系端点' : '＋ 选为关系端点'}
          </button>
          <div className="associations">
            <h3>关联对象 <span>{associations.length}</span></h3>
            {associations.map((link) => {
              const otherId = link.sourceId === props.selectedNode!.id ? link.targetId : link.sourceId
              const other = props.graph.nodes.find((node) => node.id === otherId)
              return other ? <button key={link.id} onClick={() => props.onSelectNode(other.id)}><span>{other.title}</span><small>{link.relationType}</small></button> : null
            })}
          </div>
        </>
      )}
      {props.selectedLink && (
        <div className="link-detail">
          <span className="node-kind">知识关系</span>
          <h2>{props.selectedLink.relationType}</h2>
          <p>{props.selectedLink.description || '这条关系暂无说明。'}</p>
          <div className="link-endpoints">
            <button onClick={() => props.onSelectNode(props.selectedLink!.sourceId)}>{props.graph.nodes.find((node) => node.id === props.selectedLink!.sourceId)?.title}</button>
            <span>↔</span>
            <button onClick={() => props.onSelectNode(props.selectedLink!.targetId)}>{props.graph.nodes.find((node) => node.id === props.selectedLink!.targetId)?.title}</button>
          </div>
          <button className="danger-button" onClick={() => props.onDeleteRelation(props.selectedLink!.id)}>删除此关系（保留节点）</button>
        </div>
      )}
      {candidateNodes.length > 0 && (
        <div className="relation-editor">
          <h3>手动创建关系 <span>{candidateNodes.length}/2</span></h3>
          <div className="candidate-list">
            {candidateNodes.map((node) => <button key={node.id} onClick={() => props.onToggleCandidate(node.id)}>{node.title}<span>×</span></button>)}
          </div>
          {candidateNodes.length === 2 && (
            <>
              <select value={relationType} onChange={(event) => setRelationType(event.target.value)}>
                <option value="relates-to">相关</option><option value="supports">支持</option><option value="questions">质疑</option><option value="analogy">类比</option><option value="extends">延伸</option>
              </select>
              <textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="关系说明" />
              <button onClick={() => { props.onCreateRelation(relationType, description); setDescription('') }}>建立星际航道</button>
            </>
          )}
        </div>
      )}
    </aside>
  )
}
