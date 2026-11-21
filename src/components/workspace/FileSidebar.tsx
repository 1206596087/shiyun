import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import type { LibraryBook, LibraryCounts, LibraryFolder, LibraryNodeKind, LibraryTree } from '../../types/library'
import type { LibraryMode } from '../../data/libraryBridge'
import { IconBook, IconFolder, IconHighlight, IconNetwork, IconNote, IconPlus } from './icons'

interface Props {
  tree: LibraryTree
  mode: LibraryMode
  busy: boolean
  expandedIds: string[]
  selectedId: string | null
  counts: LibraryCounts
  onToggle: (id: string) => void
  onSelect: (id: string) => void
  onOpenBook: (id: string, title: string) => void
  onOpenHighlights: () => void
  onOpenNotes: () => void
  onOpenNebula: () => void
  onCreateFolder: (parentId: string | null, name: string) => void
  onRename: (kind: LibraryNodeKind, id: string, name: string) => void
  onMove: (kind: LibraryNodeKind, id: string, targetFolderId: string | null) => void
  onDeleteFolder: (id: string, name: string) => void
  onDeleteBook: (id: string, title: string) => void
  onImport: () => void
}

interface Editing {
  kind: 'create' | 'rename'
  nodeKind: LibraryNodeKind
  id: string | null
  parentId: string | null
  value: string
}

interface MenuState {
  x: number
  y: number
  kind: LibraryNodeKind
  id: string
  label: string
  folderId: string | null
}

type DragItem = { kind: LibraryNodeKind; id: string } | null

export function FileSidebar(props: Props) {
  const { tree, mode, busy, selectedId, counts } = props
  const [editing, setEditing] = useState<Editing | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [dragging, setDragging] = useState<DragItem>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', close)
    }
  }, [menu])

  const commitEditing = () => {
    if (!editing) return
    const value = editing.value.trim()
    if (value) {
      if (editing.kind === 'create') props.onCreateFolder(editing.parentId, value)
      else if (editing.id) props.onRename(editing.nodeKind, editing.id, value)
    }
    setEditing(null)
  }

  const openMenu = (event: ReactMouseEvent, node: LibraryFolder | LibraryBook, folderId: string | null) => {
    event.preventDefault()
    event.stopPropagation()
    setMenu({
      x: event.clientX,
      y: event.clientY,
      kind: node.kind,
      id: node.id,
      label: node.kind === 'folder' ? node.name : node.title,
      folderId,
    })
  }

  const dropInto = (targetFolderId: string | null) => {
    if (dragging && dragging.id !== targetFolderId) props.onMove(dragging.kind, dragging.id, targetFolderId)
    setDragging(null)
    setDropTarget(null)
  }

  const branch: BranchProps = {
    props,
    editing,
    inputRef,
    dragging,
    dropTargetId: dropTarget,
    setDragging,
    setDropTarget,
    dropInto,
    onCommit: commitEditing,
    onCancel: () => setEditing(null),
    onValue: (value) => setEditing((current) => (current ? { ...current, value } : current)),
    onMenu: openMenu,
  }

  return (
    <aside className="ws-sidebar" aria-label="文件管理器">
      <p className="ws-sidebar__label">我的文件夹</p>

      <div className="ws-tree">
        {tree.folders.map((folder) => (
          <FolderBranch key={folder.id} folder={folder} level={0} branch={branch} />
        ))}

        {tree.uncategorized.length > 0 && (
          <div
            className={`ws-uncategorized ${dropTarget === 'uncategorized' ? 'is-drop-target' : ''}`}
            onDragOver={(event) => { if (dragging) { event.preventDefault(); setDropTarget('uncategorized') } }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(event) => { event.preventDefault(); dropInto(null) }}
          >
            <p className="ws-uncategorized__label">未分类</p>
            {tree.uncategorized.map((item) => (
              <BookRow key={item.id} book={item} level={0} branch={branch} />
            ))}
          </div>
        )}
      </div>

      {editing?.kind === 'create' ? (
        <div className="ws-row ws-row--editing">
          <IconFolder size={15} />
          <input
            ref={inputRef}
            className="ws-inline-input"
            value={editing.value}
            placeholder="新文件夹名称"
            onChange={(event) => setEditing({ ...editing, value: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitEditing()
              if (event.key === 'Escape') setEditing(null)
            }}
            onBlur={commitEditing}
            aria-label="新文件夹名称"
          />
        </div>
      ) : (
        <button
          className="ws-row ws-row--pending"
          onClick={() => setEditing({ kind: 'create', nodeKind: 'folder', id: null, parentId: selectedFolderId(tree, selectedId), value: '' })}
          title="在当前选中的文件夹里新建"
        >
          <IconPlus size={15} />
          <span>新建文件夹</span>
        </button>
      )}

      <button
        className="ws-row ws-row--pending"
        onClick={props.onImport}
        disabled={mode === 'demo' || busy}
        title={mode === 'demo' ? '导入书籍需要桌面版（SQLite 书库）' : '导入 PDF / EPUB，复制进书库并按哈希去重'}
      >
        <IconBook size={15} />
        <span>导入书籍</span>
      </button>

      <div className="ws-divider" />

      <nav className="ws-library" aria-label="知识库入口">
        <button className="ws-row" onClick={props.onOpenHighlights} title="书库里所有划线，可按书定位回原文">
          <IconHighlight size={15} />
          <span>我的划线</span>
          <b>{counts.highlights}</b>
        </button>
        <button className="ws-row" onClick={props.onOpenNotes} title="书库里所有笔记，双向查看它关联的划线">
          <IconNote size={15} />
          <span>我的笔记</span>
          <b>{counts.notes}</b>
        </button>
        <button className="ws-row" onClick={props.onOpenNebula} title="回到银河查看全部知识连接">
          <IconNetwork size={15} />
          <span>星云网络</span>
          <b>{counts.links}</b>
        </button>
      </nav>

      <p className="ws-sidebar__foot" title={tree.dataDir}>
        {mode === 'desktop' ? `SQLite 书库 · ${tree.dataDir}` : '演示书库 · 不会写入真实数据'}
      </p>

      {menu && (
        <div className="ws-menu" style={{ left: menu.x, top: menu.y }} role="menu">
          {menu.kind === 'book' && (
            <button role="menuitem" onClick={() => { props.onOpenBook(menu.id, menu.label); setMenu(null) }}>打开</button>
          )}
          <button
            role="menuitem"
            onClick={() => {
              setEditing({ kind: 'rename', nodeKind: menu.kind, id: menu.id, parentId: null, value: menu.label })
              setMenu(null)
            }}
          >
            重命名
          </button>
          {menu.kind === 'book' && menu.folderId !== null && (
            <button role="menuitem" onClick={() => { props.onMove('book', menu.id, null); setMenu(null) }}>移到未分类</button>
          )}
          <button
            role="menuitem"
            className="is-danger"
            onClick={() => {
              if (menu.kind === 'folder') props.onDeleteFolder(menu.id, menu.label)
              else props.onDeleteBook(menu.id, menu.label)
              setMenu(null)
            }}
          >
            {menu.kind === 'folder' ? '删除文件夹' : '移到回收站'}
          </button>
        </div>
      )}
    </aside>
  )
}

/** 当前选中的如果是文件夹就用它做新建位置，否则落到根。 */
function selectedFolderId(tree: LibraryTree, selectedId: string | null): string | null {
  if (!selectedId) return null
  const stack: LibraryFolder[] = [...tree.folders]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current.id === selectedId) return current.id
    stack.push(...current.children.filter((child): child is LibraryFolder => child.kind === 'folder'))
  }
  return null
}

interface BranchProps {
  props: Props
  editing: Editing | null
  inputRef: RefObject<HTMLInputElement | null>
  dragging: DragItem
  dropTargetId: string | null
  setDragging: (value: DragItem) => void
  setDropTarget: (value: string | null) => void
  dropInto: (targetFolderId: string | null) => void
  onCommit: () => void
  onCancel: () => void
  onValue: (value: string) => void
  onMenu: (event: ReactMouseEvent, node: LibraryFolder | LibraryBook, folderId: string | null) => void
}

function FolderBranch({ folder, level, branch }: { folder: LibraryFolder; level: number; branch: BranchProps }) {
  const { props, editing, inputRef, dragging, setDragging, setDropTarget, dropInto, onCommit, onCancel, onValue, onMenu } = branch
  const expanded = props.expandedIds.includes(folder.id)
  const isEditing = editing?.kind === 'rename' && editing.id === folder.id
  const indent = { paddingLeft: `${10 + level * 16}px` }
  const isDropTarget = branch.dropTargetId === folder.id

  return (
    <div>
      {isEditing ? (
        <div className="ws-row ws-row--editing" style={indent}>
          <IconFolder size={15} />
          <input
            ref={inputRef}
            className="ws-inline-input"
            value={editing.value}
            onChange={(event) => onValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onCommit()
              if (event.key === 'Escape') onCancel()
            }}
            onBlur={onCommit}
            aria-label="重命名文件夹"
          />
        </div>
      ) : (
        <button
          className={`ws-row ws-row--folder ${props.selectedId === folder.id ? 'is-selected' : ''} ${isDropTarget ? 'is-drop-target' : ''}`}
          style={indent}
          aria-expanded={expanded}
          draggable
          onDragStart={() => setDragging({ kind: 'folder', id: folder.id })}
          onDragEnd={() => { setDragging(null); setDropTarget(null) }}
          onDragOver={(event) => { if (dragging && dragging.id !== folder.id) { event.preventDefault(); setDropTarget(folder.id) } }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(event) => { event.preventDefault(); dropInto(folder.id) }}
          onContextMenu={(event) => onMenu(event, folder, folder.parentId)}
          onClick={() => { props.onSelect(folder.id); props.onToggle(folder.id) }}
        >
          <IconFolder size={15} open={expanded} />
          <span>{folder.name}</span>
        </button>
      )}

      {expanded && folder.children.map((child) =>
        child.kind === 'folder' ? (
          <FolderBranch key={child.id} folder={child} level={level + 1} branch={branch} />
        ) : (
          <BookRow key={child.id} book={child} level={level + 1} branch={branch} />
        ),
      )}
    </div>
  )
}

function BookRow({ book, level, branch }: { book: LibraryBook; level: number; branch: BranchProps }) {
  const { props, setDragging, onMenu } = branch
  return (
    <button
      className={`ws-row ws-row--book ${props.selectedId === book.id ? 'is-selected' : ''}`}
      style={{ paddingLeft: `${10 + level * 16}px` }}
      title={`${book.title}（双击打开）`}
      draggable
      onDragStart={() => setDragging({ kind: 'book', id: book.id })}
      onDragEnd={() => setDragging(null)}
      onContextMenu={(event) => onMenu(event, book, book.folderId)}
      onClick={() => props.onSelect(book.id)}
      onDoubleClick={() => props.onOpenBook(book.id, book.title)}
    >
      <IconBook size={15} />
      <span>{book.title}</span>
    </button>
  )
}
