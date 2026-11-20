import { IconBook, IconFolder, IconHighlight, IconNetwork, IconNote, IconPlus } from './icons'

interface FolderItem {
  id: string
  name: string
  children?: FolderItem[]
  book?: { id: string; title: string }
}

/** 演示树：M2 会由 SQLite 书库生成，结构与层级保持不变。 */
const DEMO_FOLDERS: FolderItem[] = [
  {
    id: 'folder-medicine',
    name: '医学',
    children: [
      {
        id: 'folder-statistics',
        name: '统计学',
        children: [{ id: 'book-biostatistics', name: '生物统计学.pdf', book: { id: 'book-biostatistics', title: '生物统计学.pdf' } }],
      },
      { id: 'folder-clinical', name: '临床医学' },
    ],
  },
  { id: 'folder-literature', name: '文学' },
  { id: 'folder-physics', name: '物理学' },
]

export interface LibraryCounts {
  highlights: number
  notes: number
  links: number
}

interface Props {
  expandedIds: string[]
  selectedId: string | null
  counts: LibraryCounts
  onToggle: (id: string) => void
  onSelect: (id: string) => void
  onOpenBook: (id: string, title: string) => void
  onOpenNebula: () => void
}

export function FileSidebar({ expandedIds, selectedId, counts, onToggle, onSelect, onOpenBook, onOpenNebula }: Props) {
  const shared = { expandedIds, selectedId, onToggle, onSelect, onOpenBook }
  return (
    <aside className="ws-sidebar" aria-label="文件管理器">
      <p className="ws-sidebar__label">我的文件夹</p>
      <div className="ws-tree">
        {DEMO_FOLDERS.map((item) => <FolderRow key={item.id} item={item} level={0} {...shared} />)}
      </div>

      <button
        className="ws-row ws-row--pending"
        disabled
        title="M2 里程碑：接入 SQLite 书库后可自由创建文件夹"
        aria-label="新建文件夹（M2 里程碑接入）"
      >
        <IconPlus size={15} />
        <span>新建文件夹</span>
      </button>

      <div className="ws-divider" />

      <nav className="ws-library" aria-label="知识库入口">
        <button className="ws-row ws-row--pending" disabled title="M4 里程碑：划线库">
          <IconHighlight size={15} />
          <span>我的划线</span>
          <b>{counts.highlights}</b>
        </button>
        <button className="ws-row ws-row--pending" disabled title="M4 里程碑：笔记库">
          <IconNote size={15} />
          <span>我的笔记</span>
          <b>{counts.notes}</b>
        </button>
        <button className="ws-row" onClick={onOpenNebula} title="回到银河查看全部知识连接">
          <IconNetwork size={15} />
          <span>星云网络</span>
          <b>{counts.links}</b>
        </button>
      </nav>

      <p className="ws-sidebar__foot">示例文件夹与演示读物 · M2 接入 SQLite 后转为真实书库</p>
    </aside>
  )
}

interface RowProps extends Omit<Props, 'counts' | 'onOpenNebula'> {
  item: FolderItem
  level: number
}

function FolderRow({ item, level, expandedIds, selectedId, onToggle, onSelect, onOpenBook }: RowProps) {
  const indent = { paddingLeft: `${10 + level * 16}px` }

  if (item.book) {
    return (
      <button
        className="ws-row ws-row--book"
        style={indent}
        title={`双击打开《${item.name}》`}
        onClick={() => onSelect(item.id)}
        onDoubleClick={() => onOpenBook(item.book!.id, item.book!.title)}
      >
        <IconBook size={15} />
        <span>{item.name}</span>
      </button>
    )
  }

  const expanded = expandedIds.includes(item.id)
  const hasChildren = Boolean(item.children?.length)
  return (
    <div>
      <button
        className={`ws-row ws-row--folder ${selectedId === item.id ? 'is-selected' : ''}`}
        style={indent}
        aria-expanded={hasChildren ? expanded : undefined}
        onClick={() => { onSelect(item.id); if (hasChildren) onToggle(item.id) }}
      >
        <IconFolder size={15} open={expanded} />
        <span>{item.name}</span>
      </button>
      {expanded && item.children?.map((child) => (
        <FolderRow key={child.id} item={child} level={level + 1} expandedIds={expandedIds} selectedId={selectedId} onToggle={onToggle} onSelect={onSelect} onOpenBook={onOpenBook} />
      ))}
    </div>
  )
}
