import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { openDatabase } from './connection.ts'
import { runMigrations } from './migrate.ts'
import { resolveDataPaths } from './paths.ts'
import { exportBundle } from './bundle.ts'
import { createNote } from './annotations.ts'

it('exports and restores a consistent library, rejects corrupt packages and existing destinations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shiyun-bundle-'))
  const paths = resolveDataPaths(root)
  const db = openDatabase(paths.dbFile)
  try {
    runMigrations(db)
    const note = createNote(db, { bodyText: 'preserve current WAL content' })
    await mkdir(join(paths.booksDir, 'fixture'), { recursive: true })
    await writeFile(join(paths.booksDir, 'fixture/source.pdf'), 'original bytes')
    const bundle = join(root, 'test.shiyunbundle')
    await exportBundle(db, paths, bundle)
    const destination = join(root, 'restored')
    execFileSync(process.execPath, ['scripts/restore-bundle.mjs', bundle, destination])
    expect(await readFile(join(destination, 'books/fixture/source.pdf'), 'utf8')).toBe('original bytes')
    const restored = openDatabase(join(destination, 'shiyun.db'))
    try { expect(restored.prepare('SELECT body_text FROM notes WHERE id = ?').get(note.id)?.body_text).toBe(note.bodyText) }
    finally { restored.close() }
    expect(() => execFileSync(process.execPath, ['scripts/restore-bundle.mjs', bundle, destination], { stdio: 'pipe' })).toThrow()
    const damaged = await readFile(bundle)
    damaged[damaged.length - 1] = 0
    await writeFile(bundle, damaged)
    expect(() => execFileSync(process.execPath, ['scripts/restore-bundle.mjs', bundle, join(root, 'damaged')], { stdio: 'pipe' })).toThrow()
    expect(await readFile(join(destination, 'books/fixture/source.pdf'), 'utf8')).toBe('original bytes')
  } finally { db.close(); await rm(root, { recursive: true, force: true }) }
})
