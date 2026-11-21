// Explicit offline recovery into a NEW directory only. Does not touch the active library.
import { open, mkdir, rm, rename, rmdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, dirname, join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

export async function restoreBundle(source, destination) {
  const input = await open(source, 'r')
  const staging = `${resolve(destination)}.${randomUUID()}.restoring`
  let reserved = false
  try {
    await mkdir(destination) // fails if destination already exists, including an empty directory
    reserved = true
    await mkdir(staging)
    let offset = 0
    const read = async (size) => {
      const buffer = Buffer.alloc(size)
      let used = 0
      while (used < size) {
        const result = await input.read(buffer, used, size - used, offset)
        if (!result.bytesRead) throw new Error('Truncated bundle')
        used += result.bytesRead; offset += result.bytesRead
      }
      return buffer
    }
    const line = async () => {
      let value = ''
      while (value.length < 40) {
        const char = (await read(1)).toString()
        if (char === '\n') return value
        value += char
      }
      throw new Error('Invalid header')
    }
    if (await line() !== 'SHIYUNBUNDLE1') throw new Error('Unsupported bundle')
    const length = Number(await line())
    if (!Number.isSafeInteger(length) || length < 1 || length > 16 * 1024 * 1024) throw new Error('Invalid manifest length')
    const manifest = JSON.parse((await read(length)).toString('utf8'))
    if (manifest.version !== 1 || !Array.isArray(manifest.files) || manifest.files.length > 100000) throw new Error('Invalid manifest')
    const seen = new Set()
    let total = 0
    const size = (await input.stat()).size
    for (const file of manifest.files) {
      if (typeof file.path !== 'string' || !/^(shiyun\.db|(?:books|attachments|assets)\/[\w./ -]+)$/.test(file.path) || file.path.split('/').some(part => !part || part === '.' || part === '..') || seen.has(file.path.toLowerCase())) throw new Error('Unsafe or duplicate path')
      if (!Number.isSafeInteger(file.size) || file.size < 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Invalid file metadata')
      seen.add(file.path.toLowerCase()); total += file.size
      if (total > 100 * 1024 ** 3) throw new Error('Bundle exceeds 100 GiB recovery limit')
    }
    if (!seen.has('shiyun.db') || offset + total !== size) throw new Error('Bundle length mismatch')
    for (const file of manifest.files) {
      const target = join(staging, file.path)
      await mkdir(dirname(target), { recursive: true })
      const output = await open(target, 'wx')
      const hash = createHash('sha256')
      try {
        let remaining = file.size
        while (remaining) {
          const bytes = await read(Math.min(65536, remaining))
          hash.update(bytes)
          await output.writeFile(bytes)
          remaining -= bytes.length
        }
      } finally { await output.close() }
      if (hash.digest('hex') !== file.sha256) throw new Error(`Checksum mismatch: ${file.path}`)
    }
    const db = new DatabaseSync(join(staging, 'shiyun.db'), { readOnly: true })
    try {
      if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Database integrity check failed')
    } finally { db.close() }
    await rmdir(destination)
    reserved = false
    await rename(staging, destination)
    return manifest
  } finally {
    await input.close()
    await rm(staging, { recursive: true, force: true })
    if (reserved) await rmdir(destination)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const [, , source, destination] = process.argv
  if (!source || !destination) throw new Error('Usage: node scripts/restore-bundle.mjs backup.shiyunbundle NEW_DIRECTORY')
  const result = await restoreBundle(source, destination)
  console.log(`Recovered ${result.files.length} verified files into ${destination}`)
}
