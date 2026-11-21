import { useState } from 'react'
import type { GalaxyUniverse, IntergalacticConnection, KnowledgeGalaxy } from '../../types/universe'
import { membershipCount } from '../../data/universeProjection'

interface Props {
  universe: GalaxyUniverse
  selectedGalaxyId: string | null
  selectedConnection: IntergalacticConnection | null
  editable: boolean
  onSelect: (id: string) => void
  onEnter: (id: string) => void
  onCreate: (input: { name: string; color: string }) => void
  onUpdate: (id: string, patch: { name?: string; description?: string; color?: string }) => void
  onDelete: (id: string) => void
}

export function GalaxyNavigator(props: Props) {
  const selected = props.universe.galaxies.find((item) => item.id === props.selectedGalaxyId) ?? null
  const [creating, setCreating] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createColor, setCreateColor] = useState('#8b7dff')

  const submitCreate = () => {
    if (!createName.trim()) return
    props.onCreate({ name: createName.trim(), color: createColor })
    setCreating(false)
  }

  return (
    <section className="galaxy-navigator glass-panel" aria-label="星系导航">
      <header>
        <div><p>知识宇宙</p><h2>{props.universe.galaxies.length} 个星系</h2></div>
        <button disabled={!props.editable} title={props.editable ? '创建一个真实星系' : '浏览器预览使用临时星系'}
          onClick={() => { setCreating(true); setCreateName(''); setCreateColor('#8b7dff') }}>＋</button>
      </header>

      <div className="galaxy-navigator__list">
        {props.universe.galaxies.map((galaxy) => (
          <button key={galaxy.id} className={galaxy.id === props.selectedGalaxyId ? 'is-active' : ''} onClick={() => props.onSelect(galaxy.id)} onDoubleClick={() => props.onEnter(galaxy.id)}>
            <i style={{ background: galaxy.color, boxShadow: `0 0 12px ${galaxy.color}` }} />
            <span><b>{galaxy.name}</b><small>{membershipCount(props.universe, galaxy.id)} 个知识对象</small></span>
            <em>{galaxy.isDefault ? '默认' : '↗'}</em>
          </button>
        ))}
      </div>

      {creating && (
        <div className="galaxy-navigator__editor">
          <label>星系名称<input value={createName} autoFocus maxLength={80} onChange={(event) => setCreateName(event.target.value)} /></label>
          <label>代表颜色<input type="color" value={createColor} onChange={(event) => setCreateColor(event.target.value)} /></label>
          <div><button onClick={submitCreate}>创建星系</button><button onClick={() => setCreating(false)}>取消</button></div>
        </div>
      )}

      {!creating && selected && (
        <GalaxyEditor
          key={selected.id}
          galaxy={selected}
          editable={props.editable}
          onSave={(patch) => props.onUpdate(selected.id, patch)}
          onEnter={() => props.onEnter(selected.id)}
          onDelete={() => props.onDelete(selected.id)}
        />
      )}

      {props.selectedConnection && (
        <div className="galaxy-connection-detail">
          <p>跨星系光带</p>
          <strong>{props.selectedConnection.count} 条真实知识关系</strong>
          <small>光带由成员节点之间已有关系聚合，不是随机装饰。</small>
        </div>
      )}
      {!props.editable && <p className="galaxy-navigator__demo">浏览器预览 · 正式星系在桌面版 SQLite 中保存</p>}
    </section>
  )
}

function GalaxyEditor({ galaxy, editable, onSave, onEnter, onDelete }: {
  galaxy: KnowledgeGalaxy
  editable: boolean
  onSave: (patch: { name?: string; description?: string; color?: string }) => void
  onEnter: () => void
  onDelete: () => void
}) {
  const [name, setName] = useState(galaxy.name)
  const [color, setColor] = useState(galaxy.color)
  const [description, setDescription] = useState(galaxy.description)
  return (
    <div className="galaxy-navigator__editor">
      <label>名称<input value={name} disabled={!editable} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
      <label>颜色<input type="color" value={color} disabled={!editable} onChange={(event) => setColor(event.target.value)} /></label>
      <label>说明<textarea value={description} disabled={!editable} maxLength={400} onChange={(event) => setDescription(event.target.value)} /></label>
      <div><button onClick={onEnter}>进入星系</button><button onClick={() => onSave({ name: name.trim(), color, description })} disabled={!editable || !name.trim()}>保存</button></div>
      {!galaxy.isDefault && <button className="is-danger" disabled={!editable} onClick={onDelete}>删除星系（保留知识）</button>}
      <small>可直接拖动三维星系调整它在宇宙中的位置。</small>
    </div>
  )
}
