import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase, queryOne } from './connection.ts'
import { currentVersion, pendingVersions, runMigrations } from './migrate.ts'
import {
  MAX_FOLDER_DEPTH,
  countLibrary,
  createFolder,
  deleteBook,
  deleteFolder,
  insertBook,
  listTree,
  moveNode,
  renameNode,
} from './library.ts'
import { importBookFromPath } from './importBook.ts'
import { resolveDataPaths } from './paths.ts'
import { importPrototypeGraph, prototypeImportState, PROTOTYPE_MARKER } from './prototypeImport.ts'
import type { KnowledgeGraphData } from '../../../src/types/knowledge.ts'

let db: DatabaseSync

beforeEach(() => {
  db = openDatabase(':memory:')
  runMigrations(db)
})

afterEach(() => {
  db.close()
})

describe('迁移', () => {
  it('首次运行应用 001，重复运行不再重复应用', () => {
    // beforeEach 里已经跑过一次
    expect(currentVersion(db)).toBe(1)
    expect(pendingVersions(db)).toEqual([])

    const again = runMigrations(db)
    expect(again).toEqual([])

    const rows = queryOne<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM schema_migrations')
    expect(rows?.count).toBe(1)
  })
})

describe('文件夹', () => {
  it('层级不能超过 MAX_FOLDER_DEPTH', () => {
    let parent: string | null = null
    for (let depth = 0; depth < MAX_FOLDER_DEPTH; depth += 1) {
      parent = createFolder(db, `层级 ${depth + 1}`, parent)
    }
    expect(parent).not.toBeNull()
    expect(() => createFolder(db, '太深了', parent)).toThrow(/3 层/)
  })

  it('不能把文件夹移动到自己的子树里', () => {
    const root = createFolder(db, '根', null)
    const child = createFolder(db, '子', root)

    expect(() => moveNode(db, 'folder', root, child)).toThrow()
    // 移动到自己也不行
    expect(() => moveNode(db, 'folder', root, root)).toThrow()
  })

  it('重命名文件夹与书籍', () => {
    const folder = createFolder(db, '旧名', null)
    renameNode(db, 'folder', folder, '新名')

    const book = insertBook(db, { title: '旧书名', format: 'pdf', filePath: 'books/x/source.pdf', folderId: folder })
    renameNode(db, 'book', book.id, '新书名')

    const tree = listTree(db, '记忆库')
    expect(tree.folders[0].name).toBe('新名')
    expect(tree.folders[0].children[0]).toMatchObject({ kind: 'book', title: '新书名' })
  })
})

describe('删除语义', () => {
  it('删文件夹后书籍落到未分类，而不是被删掉', () => {
    const folder = createFolder(db, '统计学', null)
    const book = insertBook(db, { title: '生物统计学.pdf', format: 'pdf', filePath: 'books/a/source.pdf', folderId: folder })

    deleteFolder(db, folder)

    const tree = listTree(db, '记忆库')
    expect(tree.folders).toHaveLength(0)
    expect(tree.uncategorized.map((item) => item.id)).toEqual([book.id])
  })

  it('删书籍不会连带删掉笔记与划线', () => {
    const book = insertBook(db, { title: '待删.pdf', format: 'pdf', filePath: 'books/b/source.pdf' })
    const now = new Date().toISOString()

    db.prepare(
      'INSERT INTO highlights (id, book_id, locator_type, page, quote, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run('hl-1', book.id, 'pdf_page', 12, '优势比与相对危险度', now, now)
    db.prepare('INSERT INTO notes (id, title, body, body_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      'note-1',
      'OR 与 RR',
      '罕见结局下 OR 近似 RR',
      '罕见结局下 OR 近似 RR',
      now,
      now,
    )
    db.prepare('INSERT INTO highlight_notes (highlight_id, note_id, created_at) VALUES (?, ?, ?)').run('hl-1', 'note-1', now)

    deleteBook(db, book.id)

    const tree = listTree(db, '记忆库')
    expect(tree.uncategorized).toHaveLength(0)
    expect(tree.counts.books).toBe(0)

    // 划线与笔记必须还在：书籍是软删除，笔记从不级联删除
    const highlight = queryOne<{ id: string }>(db, 'SELECT id FROM highlights WHERE id = ?', 'hl-1')
    const note = queryOne<{ id: string }>(db, 'SELECT id FROM notes WHERE id = ?', 'note-1')
    const link = queryOne<{ note_id: string }>(db, 'SELECT note_id FROM highlight_notes WHERE highlight_id = ?', 'hl-1')
    expect(highlight?.id).toBe('hl-1')
    expect(note?.id).toBe('note-1')
    expect(link?.note_id).toBe('note-1')
  })
})

describe('导入书籍', () => {
  let workDir: string

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'shiyun-test-'))
  })

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true })
  })

  it('同一份文件第二次导入被识别为重复，不重复入库', async () => {
    const paths = resolveDataPaths(workDir)
    const source = join(workDir, '生物统计学.pdf')
    writeFileSync(source, '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')

    const first = await importBookFromPath(db, paths, source, null)
    expect(first.duplicate).toBeNull()
    expect(first.book?.title).toBe('生物统计学')
    expect(existsSync(join(paths.booksDir, first.book!.id, 'source.pdf'))).toBe(true)

    const second = await importBookFromPath(db, paths, source, null)
    expect(second.book).toBeNull()
    expect(second.duplicate?.id).toBe(first.book!.id)

    expect(countLibrary(db).books).toBe(1)
  })

  it('不支持的文件类型直接拒绝', async () => {
    const paths = resolveDataPaths(workDir)
    const source = join(workDir, '笔记.docx')
    writeFileSync(source, 'not a book')

    await expect(importBookFromPath(db, paths, source, null)).rejects.toThrow(/PDF|EPUB/)
  })
})

describe('原型数据迁移', () => {
  const graph: KnowledgeGraphData = {
    version: 1,
    nodes: [
      {
        id: 'book-course',
        type: 'book',
        title: '生物统计学.pdf',
        content: '',
        metadata: { format: 'pdf' },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'note-or-rr',
        type: 'note',
        title: 'OR 与 RR',
        content: '罕见结局下 OR 近似 RR',
        metadata: {},
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'hl-1',
        type: 'highlight',
        title: '正文高亮',
        content: '优势比与相对危险度并不等同',
        metadata: { page: 7 },
        createdAt: '2026-01-03T00:00:00.000Z',
        updatedAt: '2026-01-03T00:00:00.000Z',
      },
    ],
    links: [
      {
        id: 'link-1',
        sourceId: 'note-or-rr',
        targetId: 'hl-1',
        relationType: 'explains',
        description: '解释划线',
      },
    ],
    layouts: [{ nodeId: 'book-course', x: 1, y: 2, z: 3 }],
  }

  it('迁移一次后再次调用直接返回 alreadyImported', () => {
    const first = importPrototypeGraph(db, graph)
    expect(first.alreadyImported).toBe(false)
    expect(first.books).toBeGreaterThan(0)
    expect(first.highlights).toBe(1)
    expect(first.notes).toBe(1)

    const second = importPrototypeGraph(db, graph)
    expect(second.alreadyImported).toBe(true)
    expect(second.books).toBe(0)

    const marker = queryOne<{ value: string }>(db, 'SELECT value FROM app_settings WHERE key = ?', PROTOTYPE_MARKER)
    expect(marker?.value).toBeTruthy()
    expect(prototypeImportState(db).importedAt).toBe(marker?.value)
  })

  it('划线找不到所属书时落到 fallback 书，不丢数据', () => {
    const orphan: KnowledgeGraphData = {
      version: 1,
      nodes: [
        {
          id: 'hl-orphan',
          type: 'highlight',
          title: '独立划线',
          content: '没有书',
          metadata: { page: 3 },
          createdAt: '2026-01-04T00:00:00.000Z',
          updatedAt: '2026-01-04T00:00:00.000Z',
        },
      ],
      links: [],
      layouts: [],
    }

    const result = importPrototypeGraph(db, orphan)
    expect(result.highlights).toBe(1)
    expect(result.books).toBe(1)
    expect(listTree(db, '记忆库').uncategorized.map((book) => book.title)).toContain('原型划线（原书未知）')
  })
})
