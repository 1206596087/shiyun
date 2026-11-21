import { loadKnowledgeGraph } from './knowledgeRepository'

const PROTOTYPE_KEY = 'shiyun-prototype-knowledge-v1'
const MIGRATED_KEY = `${PROTOTYPE_KEY}.migrated`

export interface PrototypeMigrationOutcome {
  imported: boolean
  books: number
  notes: number
  highlights: number
}

/**
 * 把 localStorage 里的原型图谱搬进 SQLite（DATABASE_SCHEMA.md 第 6 节）。
 *
 * 只在桌面版首次启动时跑一次：搬运成功后保留一份旧 JSON（键名加 `.migrated`），
 * 用户可以回退，也不会因为键被删掉而失去原始数据。
 */
export async function migratePrototypeOnce(
  library: NonNullable<Window['shiyunDesktop']>['library'],
): Promise<PrototypeMigrationOutcome> {
  const meta = await library.getMeta()
  if (meta.prototypeImportedAt) return { imported: false, books: 0, notes: 0, highlights: 0 }

  const raw = localStorage.getItem(PROTOTYPE_KEY)
  if (!raw) return { imported: false, books: 0, notes: 0, highlights: 0 }

  const result = await library.importPrototype(loadKnowledgeGraph())
  localStorage.setItem(MIGRATED_KEY, raw)
  localStorage.removeItem(PROTOTYPE_KEY)
  return { imported: true, books: result.books, notes: result.notes, highlights: result.highlights }
}
