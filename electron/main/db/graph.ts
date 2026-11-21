import type { DatabaseSync } from 'node:sqlite'
import { execute, queryAll, transaction } from './connection.ts'
import {
  nodeKindOf,
  projectKnowledgeGraph,
  type GraphSource,
  type ProjectionResult,
  type SourceBook,
  type SourceClipping,
  type SourceFolder,
  type SourceHighlight,
  type SourceHighlightNote,
  type SourceLayout,
  type SourceLink,
  type SourceNote,
} from '../../../src/data/graphProjection.ts'
import type { GraphLayout, KnowledgeGraphData, KnowledgeNodeType } from '../../../src/types/knowledge.ts'

/**
 * 银河图的数据库侧：读实体、写坐标。
 *
 * 投影本身在 `src/data/graphProjection.ts`（纯函数，可单测）；
 * 这里只负责 SQL 与「新坐标回填」。
 */

interface FolderRow {
  id: string
  name: string
  parent_id: string | null
}

interface BookRow {
  id: string
  title: string
  folder_id: string | null
  format: string
  author: string | null
  page_count: number | null
  created_at: string
  updated_at: string
}

interface HighlightRow {
  id: string
  book_id: string
  quote: string
  page: number | null
  cfi: string | null
  created_at: string
}

interface NoteRow {
  id: string
  title: string
  body_text: string
  created_at: string
  updated_at: string
}

interface PairRow {
  highlight_id: string
  note_id: string
}

interface ClippingRow {
  id: string
  quote: string
  page_title: string
  url: string
  note_id: string | null
  captured_at: string
}

interface LinkRow {
  id: string
  source_kind: KnowledgeNodeType
  source_id: string
  target_kind: KnowledgeNodeType
  target_id: string
  relation_type: string
  description: string
}

interface LayoutRow {
  node_kind: KnowledgeNodeType
  node_id: string
  x: number
  y: number
  z: number
  pinned: number
}

/** graph_layouts.node_kind 只有五种，划线在银河里的前缀是 hl，网页摘录是 clip。 */
function kindPrefix(kind: KnowledgeNodeType): string {
  if (kind === 'highlight') return 'hl'
  if (kind === 'clipping') return 'clip'
  return kind
}

/** 读出投影需要的全部实体（自动过滤软删的书、文件夹与笔记）。 */
export function loadGraphSource(db: DatabaseSync): GraphSource {
  const folders = queryAll<FolderRow>(
    db,
    'SELECT id, name, parent_id FROM folders WHERE deleted_at IS NULL ORDER BY name',
  ).map<SourceFolder>((row) => ({ id: row.id, name: row.name, parentId: row.parent_id }))

  const books = queryAll<BookRow>(
    db,
    `SELECT id, title, folder_id, format, author, page_count, created_at, updated_at
       FROM books WHERE deleted_at IS NULL ORDER BY title`,
  ).map<SourceBook>((row) => ({
    id: row.id,
    title: row.title,
    folderId: row.folder_id,
    format: row.format,
    author: row.author ?? '',
    pageCount: row.page_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  const highlights = queryAll<HighlightRow>(
    db,
    `SELECT id, book_id, quote, page, cfi, created_at
       FROM highlights ORDER BY created_at`,
  ).map<SourceHighlight>((row) => ({
    id: row.id,
    bookId: row.book_id,
    quote: row.quote,
    page: row.page,
    cfi: row.cfi,
    createdAt: row.created_at,
  }))

  const notes = queryAll<NoteRow>(
    db,
    `SELECT id, title, body_text, created_at, updated_at
       FROM notes WHERE deleted_at IS NULL ORDER BY updated_at DESC`,
  ).map<SourceNote>((row) => ({
    id: row.id,
    title: row.title,
    bodyText: row.body_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  const highlightNotes = queryAll<PairRow>(db, 'SELECT highlight_id, note_id FROM highlight_notes').map<SourceHighlightNote>(
    (row) => ({ highlightId: row.highlight_id, noteId: row.note_id }),
  )

  const clippings = queryAll<ClippingRow>(
    db,
    `SELECT id, quote, page_title, url, note_id, captured_at
       FROM web_clippings WHERE deleted_at IS NULL ORDER BY captured_at DESC`,
  ).map<SourceClipping>((row) => ({
    id: row.id,
    quote: row.quote,
    pageTitle: row.page_title,
    url: row.url,
    noteId: row.note_id,
    capturedAt: row.captured_at,
  }))

  const links = queryAll<LinkRow>(
    db,
    `SELECT id, source_kind, source_id, target_kind, target_id, relation_type, description
       FROM knowledge_links ORDER BY created_at`,
  ).map<SourceLink>((row) => ({
    id: row.id,
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    targetKind: row.target_kind,
    targetId: row.target_id,
    relationType: row.relation_type,
    description: row.description,
  }))

  const layouts = queryAll<LayoutRow>(db, 'SELECT node_kind, node_id, x, y, z, pinned FROM graph_layouts').map<SourceLayout>(
    (row) => ({
      // 新记录存的是完整节点 id（hl:xxx / hlagg:xxx）；原型迁移留下的旧记录存的是实体 id，按种类补前缀。
      nodeId: nodeKindOf(row.node_id) ? row.node_id : `${kindPrefix(row.node_kind)}:${row.node_id}`,
      x: row.x,
      y: row.y,
      z: row.z,
      pinned: row.pinned === 1,
    }),
  )

  return { folders, books, highlights, notes, highlightNotes, links, layouts, clippings }
}

/** 把投影出来的新坐标写库；用户没动过的星 pinned = 0，下次仍可重算。 */
export function persistLayouts(db: DatabaseSync, layouts: GraphLayout[]): void {
  if (layouts.length === 0) return
  const now = new Date().toISOString()
  transaction(db, () => {
    layouts.forEach((layout) => {
      const kind = nodeKindOf(layout.nodeId)
      if (!kind) return
      execute(
        db,
        `INSERT INTO graph_layouts (node_kind, node_id, x, y, z, pinned, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)
         ON CONFLICT(node_kind, node_id) DO NOTHING`,
        kind,
        layout.nodeId,
        layout.x,
        layout.y,
        layout.z,
        now,
      )
    })
  })
}

/** 用户拖动一颗星 → 固定它的位置（pinned = 1，之后不再被投影覆盖）。 */
export function savePinnedLayout(db: DatabaseSync, nodeId: string, position: { x: number; y: number; z: number }): GraphLayout {
  const kind = nodeKindOf(nodeId)
  if (!kind) throw new Error(`无法识别的节点 id：${nodeId}`)
  execute(
    db,
    `INSERT INTO graph_layouts (node_kind, node_id, x, y, z, pinned, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(node_kind, node_id) DO UPDATE SET
       x = excluded.x, y = excluded.y, z = excluded.z, pinned = 1, updated_at = excluded.updated_at`,
    kind,
    nodeId,
    position.x,
    position.y,
    position.z,
    new Date().toISOString(),
  )
  return { nodeId, x: position.x, y: position.y, z: position.z }
}

/** 取消固定，让这颗星回到自动布局（M7 可能提供右键菜单入口）。 */
export function releaseLayout(db: DatabaseSync, nodeId: string): void {
  const kind = nodeKindOf(nodeId)
  if (!kind) return
  execute(db, 'DELETE FROM graph_layouts WHERE node_kind = ? AND node_id = ?', kind, nodeId)
}

export function loadKnowledgeGraph(db: DatabaseSync): ProjectionResult & { graph: KnowledgeGraphData } {
  const result = projectKnowledgeGraph(loadGraphSource(db))
  persistLayouts(db, result.newLayouts)
  return result
}
