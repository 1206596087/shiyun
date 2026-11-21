import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdtemp, open, readdir, rm, stat, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { DataPaths } from './paths.ts'

interface Entry { path: string; size: number; sha256: string }
export const BUNDLE_MAGIC = 'SHIYUNBUNDLE1\n'

/** Immutable originals plus a consistent SQLite snapshot; never copy a live WAL database. */
export async function exportBundle(db: DatabaseSync, paths: DataPaths, destination: string): Promise<void> {
  const temp = await mkdtemp(join(tmpdir(), 'shiyun-export-'))
  const output = `${destination}.${randomUUID()}.partial`
  try {
    const snapshot = join(temp, 'shiyun.db')
    db.prepare('VACUUM INTO ?').run(snapshot)
    const files = [{ path: 'shiyun.db', source: snapshot }]
    const walk = async (directory: string) => {
      let entries
      try { entries = await readdir(directory, { withFileTypes: true }) }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
      for (const entry of entries) {
        const source = join(directory, entry.name)
        if (entry.isSymbolicLink()) throw new Error('Backup refuses symbolic links')
        if (entry.isDirectory()) await walk(source)
        else if (entry.isFile()) files.push({ path: relative(paths.root, source).split(sep).join('/'), source })
      }
    }
    for (const folder of ['books', 'attachments', 'assets']) await walk(join(paths.root, folder))
    const manifest: { version: number; createdAt: string; files: Entry[] } = { version: 1, createdAt: new Date().toISOString(), files: [] }
    for (const file of files) {
      const hash = createHash('sha256')
      for await (const chunk of createReadStream(file.source)) hash.update(chunk)
      manifest.files.push({ path: file.path, size: (await stat(file.source)).size, sha256: hash.digest('hex') })
    }
    const header = Buffer.from(JSON.stringify(manifest))
    const handle = await open(output, 'wx')
    try {
      const write = async (data: Uint8Array) => {
        let offset = 0
        while (offset < data.length) {
          const { bytesWritten } = await handle.write(data, offset, data.length - offset)
          if (!bytesWritten) throw new Error('Backup write failed')
          offset += bytesWritten
        }
      }
      await write(Buffer.from(`${BUNDLE_MAGIC}${header.length}\n`))
      await write(header)
      for (let index = 0; index < files.length; index++) {
        const hash = createHash('sha256')
        let size = 0
        for await (const chunk of createReadStream(files[index]!.source)) {
          hash.update(chunk); size += chunk.length; await write(chunk)
        }
        if (size !== manifest.files[index]!.size || hash.digest('hex') !== manifest.files[index]!.sha256) throw new Error('Source changed during backup; retry')
      }
      await handle.sync()
    } finally { await handle.close() }
    await rename(output, destination)
  } finally {
    await rm(output, { force: true })
    await rm(temp, { recursive: true, force: true })
  }
}
