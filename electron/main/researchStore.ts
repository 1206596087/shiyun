import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseResearchSession, serializeResearchSession } from '../../src/data/researchSession.ts'
import type { ResearchSession } from '../../src/types/research.ts'

/**
 * 浏览器标签的落盘（阶段一）。
 *
 * 为什么用 JSON 文件而不是 SQLite：这属于「界面会话」，不是知识实体。
 * 会话文件损坏最多丢一次标签列表，绝不能让书库打不开——所以这里的读取
 * 一律不抛错，写盘失败也只返回 false（由调用方决定要不要提示）。
 */

export const RESEARCH_SESSION_FILE = 'research-session.json'

export function researchSessionPath(dataRoot: string): string {
  return join(dataRoot, RESEARCH_SESSION_FILE)
}

export interface LoadedResearchSession {
  session: ResearchSession
  droppedTabs: number
  repaired: boolean
  ok: boolean
}

export function readResearchSession(file: string): LoadedResearchSession {
  if (!existsSync(file)) {
    const empty = parseResearchSession('null')
    return { session: empty.session, droppedTabs: 0, repaired: false, ok: true }
  }
  try {
    const loaded = parseResearchSession(readFileSync(file, 'utf8'))
    return { session: loaded.session, droppedTabs: loaded.droppedTabs, repaired: loaded.repaired, ok: true }
  } catch {
    // 读不了（权限/编码/文件被占用）就当没有会话，但不要阻塞启动。
    const empty = parseResearchSession('null')
    return { session: empty.session, droppedTabs: 0, repaired: true, ok: false }
  }
}

export function writeResearchSession(file: string, session: ResearchSession): boolean {
  const temporary = `${file}.tmp`
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(temporary, serializeResearchSession(session), 'utf8')
    renameSync(temporary, file)
    return true
  } catch {
    try { rmSync(temporary, { force: true }) } catch { /* 临时文件清不掉就算了 */ }
    return false
  }
}
