import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase } from './connection.ts'
import { currentVersion, migrations, runMigrations } from './migrate.ts'
import { countClippings, createClipping, deleteClipping, getClipping, listClippings, listDeletedClippings, restoreClipping, updateClipping } from './clippings.ts'
import { clippingToNote } from './clippings.ts'
import { getNote } from './annotations.ts'

let db: DatabaseSync

beforeEach(() => {
  db = openDatabase(':memory:')
  runMigrations(db)
})

afterEach(() => {
  db.close()
})

const SAMPLE = {
  quote: '优势比（OR）与相对危险度（RR）在罕见结局下数值接近，但两者含义不同。',
  pageTitle: '比值比 - 维基百科',
  url: 'https://zh.wikipedia.org/wiki/%E6%AF%94%E5%80%BC%E6%AF%94',
  prefix: '在病例对照研究中',
  suffix: '因此不能直接比较。',
}

describe('迁移 004', () => {
  it('把版本推进到 4，并且可以重复运行（幂等）', () => {
    expect(currentVersion(db)).toBe(4)
    expect(migrations.map((migration) => migration.version)).toEqual([1, 2, 3, 4])
    expect(runMigrations(db)).toEqual([])
  })

  it('web_clippings 表存在，且 knowledge_links / graph_layouts 接受 clipping 种类', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>
    expect(tables.map((row) => row.name)).toContain('web_clippings')

    const timestamp = new Date().toISOString()
    // 新种类必须真的能写进去：CHECK 放宽是这次迁移的核心目的。
    expect(() =>
      db
        .prepare(
          `INSERT INTO graph_layouts (node_kind, node_id, x, y, z, pinned, updated_at)
           VALUES ('clipping', 'clip:test', 1, 2, 3, 0, ?)`,
        )
        .run(timestamp),
    ).not.toThrow()
    expect(() =>
      db
        .prepare(
          `INSERT INTO knowledge_links (id, source_kind, source_id, target_kind, target_id, relation_type, description, created_at)
           VALUES ('link-test', 'clipping', 'clip-1', 'note', 'note-1', 'supports', '', ?)`,
        )
        .run(timestamp),
    ).not.toThrow()
  })

  it('重建表时保留旧行（旧种类仍可写入）', () => {
    const timestamp = new Date().toISOString()
    db.prepare(
      `INSERT INTO graph_layouts (node_kind, node_id, x, y, z, pinned, updated_at)
       VALUES ('book', 'book:keep', 4, 5, 6, 1, ?)`,
    ).run(timestamp)
    const row = db.prepare("SELECT node_id, pinned FROM graph_layouts WHERE node_id = 'book:keep'").get() as
      | { node_id: string; pinned: number }
      | undefined
    expect(row?.pinned).toBe(1)
    // 仍应拒绝未知种类（放宽不等于取消约束）。
    expect(() =>
      db
        .prepare(
          `INSERT INTO graph_layouts (node_kind, node_id, x, y, z, pinned, updated_at)
           VALUES ('ghost', 'ghost:1', 0, 0, 0, 0, ?)`,
        )
        .run(timestamp),
    ).toThrow()
  })
})

describe('网页摘录仓储', () => {
  it('写入後能按时间倒序读回，并保留前后文与来源', () => {
    const clipping = createClipping(db, SAMPLE)
    expect(clipping.id.startsWith('clip-')).toBe(true)
    expect(clipping.url).toBe(SAMPLE.url)
    expect(clipping.pageTitle).toBe(SAMPLE.pageTitle)
    expect(clipping.prefix).toBe(SAMPLE.prefix)
    expect(clipping.suffix).toBe(SAMPLE.suffix)
    expect(clipping.noteId).toBeNull()
    expect(countClippings(db)).toBe(1)

    const second = createClipping(db, { ...SAMPLE, quote: '第二条摘录', url: 'https://example.com/a#frag' })
    expect(second.url).toBe('https://example.com/a') // 去掉 hash，避免同一页产生多个"不同"地址
    const list = listClippings(db)
    expect(list.map((item) => item.id)).toEqual([second.id, clipping.id])
  })

  it('拒绝空摘录与非 http(s) 地址', () => {
    expect(() => createClipping(db, { ...SAMPLE, quote: '   ' })).toThrow('摘录内容不能为空')
    expect(() => createClipping(db, { ...SAMPLE, url: 'file:///etc/passwd' })).toThrow('只支持 http/https')
    expect(() => createClipping(db, { ...SAMPLE, url: '不是网址' })).toThrow('不是合法 URL')
  })

  it('只改附注，不动引文与地址', () => {
    const clipping = createClipping(db, SAMPLE)
    const updated = updateClipping(db, clipping.id, { userNote: '这里要回到第四章再看一遍' })
    expect(updated.userNote).toBe('这里要回到第四章再看一遍')
    expect(updated.quote).toBe(clipping.quote)
    expect(updated.url).toBe(clipping.url)
  })

  it('删除是软删，可以恢复；恢复后仍在列表里', () => {
    const clipping = createClipping(db, SAMPLE)
    deleteClipping(db, clipping.id)
    expect(getClipping(db, clipping.id)).toBeUndefined()
    expect(listClippings(db)).toEqual([])
    expect(listDeletedClippings(db).map((item) => item.id)).toEqual([clipping.id])

    restoreClipping(db, clipping.id)
    expect(getClipping(db, clipping.id)?.id).toBe(clipping.id)
    expect(listClippings(db)).toHaveLength(1)
  })

  it('转成笔记：引文、来源与附注都进正文，重复转换不会造第二篇', () => {
    const clipping = createClipping(db, { ...SAMPLE, userNote: '记一笔' })
    const first = clippingToNote(db, clipping.id)
    expect(first.created).toBe(true)
    expect(first.clipping.noteId).toBe(first.noteId)

    const note = getNote(db, first.noteId)
    expect(note?.bodyText).toContain('优势比')
    expect(note?.bodyText).toContain(SAMPLE.url)
    expect(note?.bodyText).toContain('记一笔')

    const again = clippingToNote(db, clipping.id)
    expect(again.created).toBe(false)
    expect(again.noteId).toBe(first.noteId)
  })

  it('删掉笔记不会删掉摘录（外键 SET NULL）', () => {
    const clipping = createClipping(db, SAMPLE)
    const { noteId } = clippingToNote(db, clipping.id)
    db.prepare('DELETE FROM notes WHERE id = ?').run(noteId)
    const after = getClipping(db, clipping.id)
    expect(after).toBeDefined()
    expect(after?.noteId).toBeNull()
  })
})
