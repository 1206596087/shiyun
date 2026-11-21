import type { DatabaseSync } from 'node:sqlite'
import type { KnowledgeGraphData, KnowledgeNode } from '../../../src/types/knowledge.ts'
import { execute, queryOne } from './connection.ts'
import { getSetting, setSetting } from './library.ts'

export const PROTOTYPE_MARKER = 'migration.prototype.importedAt'
const FALLBACK_BOOK_ID = 'book-prototype-orphans'

export interface PrototypeImportResult {
  alreadyImported: boolean
  books: number
  highlights: number
  notes: number
  links: number
  layouts: number
  notesLog: string[]
}

function formatFromTitle(title: string): 'pdf' | 'epub' {
  return title.toLowerCase().endsWith('.epub') ? 'epub' : 'pdf'
}

function pageFromMetadata(node: KnowledgeNode): number {
  const raw = node.metadata.page
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1
}

/**
 * 把 localStorage 里的原型图谱一次性搬进 SQLite（DATABASE_SCHEMA.md 第 6 节）。
 *
 * 只做结构搬迁：原型里的划线没有真实页码/CFI 时用演示值补齐并记入 app_settings，
 * 绝不假装这些定位是精确的。已迁移过就直接返回，不重复写入。
 */
export function importPrototypeGraph(db: DatabaseSync, graph: KnowledgeGraphData): PrototypeImportResult {
  const result: PrototypeImportResult = {
    alreadyImported: false,
    books: 0,
    highlights: 0,
    notes: 0,
    links: 0,
    layouts: 0,
    notesLog: [],
  }

  if (getSetting(db, PROTOTYPE_MARKER)) {
    return { ...result, alreadyImported: true }
  }

  const stamp = new Date().toISOString()
  const nodeIds = new Set(graph.nodes.map((node) => node.id))
  const bookIds = new Set(graph.nodes.filter((node) => node.type === 'book').map((node) => node.id))

  db.exec('BEGIN')
  try {
    for (const node of graph.nodes) {
      if (node.type === 'book') {
        const format = formatFromTitle(node.title)
        execute(
          db,
          `INSERT OR IGNORE INTO books
             (id, folder_id, title, author, format, file_path, file_hash, file_size, page_count,
              cover_path, sort_order, created_at, updated_at, last_opened_at, deleted_at)
           VALUES (?, NULL, ?, NULL, ?, ?, NULL, NULL, NULL, NULL, 0, ?, ?, NULL, NULL)`,
          node.id,
          node.title,
          format,
          `books/${node.id}/source.${format}`,
          node.createdAt || stamp,
          node.updatedAt || stamp,
        )
        result.books += 1
      } else if (node.type === 'note') {
        execute(
          db,
          `INSERT OR IGNORE INTO notes (id, title, body, body_text, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL)`,
          node.id,
          node.title,
          node.content,
          node.content,
          node.createdAt || stamp,
          node.updatedAt || stamp,
        )
        result.notes += 1
      } else if (node.type === 'highlight') {
        const declared = typeof node.metadata.bookId === 'string' ? node.metadata.bookId : null
        let bookId = declared && nodeIds.has(declared) ? declared : null
        if (!bookId) {
          bookId = bookIds.values().next().value ?? FALLBACK_BOOK_ID
          if (!bookIds.has(bookId)) {
            execute(
              db,
              `INSERT OR IGNORE INTO books
                 (id, folder_id, title, author, format, file_path, file_hash, file_size, page_count,
                  cover_path, sort_order, created_at, updated_at, last_opened_at, deleted_at)
               VALUES (?, NULL, '原型划线（原书未知）', NULL, 'pdf', ?, NULL, NULL, NULL, NULL, 0, ?, ?, NULL, NULL)`,
              FALLBACK_BOOK_ID,
              `books/${FALLBACK_BOOK_ID}/source.pdf`,
              stamp,
              stamp,
            )
            result.books += 1
            result.notesLog.push('有划线找不到所属书籍，已归入「原型划线（原书未知）」')
          }
        }
        execute(
          db,
          `INSERT OR IGNORE INTO highlights
             (id, book_id, locator_type, page, cfi, quote, prefix, suffix, rect_json, color, created_at, updated_at)
           VALUES (?, ?, 'pdf_page', ?, NULL, ?, NULL, NULL, NULL, 'gold', ?, ?)`,
          node.id,
          bookId,
          pageFromMetadata(node),
          node.content || node.title,
          node.createdAt || stamp,
          node.updatedAt || stamp,
        )
        result.highlights += 1
      }
    }

    for (const link of graph.links) {
      const source = graph.nodes.find((node) => node.id === link.sourceId)
      const target = graph.nodes.find((node) => node.id === link.targetId)
      if (!source || !target) continue
      execute(
        db,
        `INSERT OR IGNORE INTO knowledge_links
           (id, source_kind, source_id, target_kind, target_id, relation_type, description, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        link.id,
        source.type,
        link.sourceId,
        target.type,
        link.targetId,
        link.relationType,
        link.description,
        stamp,
      )
      result.links += 1
    }

    for (const layout of graph.layouts) {
      const node = graph.nodes.find((item) => item.id === layout.nodeId)
      if (!node) continue
      execute(
        db,
        `INSERT INTO graph_layouts (node_kind, node_id, x, y, z, pinned, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)
         ON CONFLICT(node_kind, node_id) DO UPDATE SET x = excluded.x, y = excluded.y, z = excluded.z`,
        node.type,
        layout.nodeId,
        layout.x,
        layout.y,
        layout.z,
        stamp,
      )
      result.layouts += 1
    }

    setSetting(db, PROTOTYPE_MARKER, stamp)
    if (result.notesLog.length > 0) {
      setSetting(db, 'migration.notes', result.notesLog.join('；'))
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  return result
}

export function prototypeImportState(db: DatabaseSync): { importedAt: string | null; books: number } {
  const importedAt = getSetting(db, PROTOTYPE_MARKER) ?? null
  const row = queryOne<{ books: number }>(db, 'SELECT COUNT(*) AS books FROM books')
  return { importedAt, books: Number(row?.books ?? 0) }
}
