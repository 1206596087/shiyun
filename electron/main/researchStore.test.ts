import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readResearchSession, researchSessionPath, writeResearchSession } from './researchStore.ts'

let dir = ''
let file = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shiyun-session-'))
  file = researchSessionPath(dir)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const SESSION = {
  version: 1,
  tabs: [{ id: 'a', url: 'https://example.com/', title: '示例', zoom: 1, userAgentMode: 'auto' as const }],
  activeTabId: 'a',
}

describe('researchStore', () => {
  it('文件不存在时返回空会话，且 ok=true', () => {
    const loaded = readResearchSession(file)
    expect(loaded.ok).toBe(true)
    expect(loaded.session.tabs).toEqual([])
    expect(loaded.session.activeTabId).toBeNull()
  })

  it('写盘再读回来内容一致', () => {
    expect(writeResearchSession(file, SESSION)).toBe(true)
    const loaded = readResearchSession(file)
    expect(loaded.session.tabs[0]).toMatchObject({ id: 'a', url: 'https://example.com/', title: '示例' })
    expect(loaded.session.activeTabId).toBe('a')
    // 落盘的是那个会话文件名，不是别的地方。
    expect(file.endsWith('research-session.json')).toBe(true)
  })

  it('覆盖写入不留临时文件', () => {
    expect(writeResearchSession(file, SESSION)).toBe(true)
    expect(writeResearchSession(file, { version: 1, tabs: [], activeTabId: null })).toBe(true)
    expect(readResearchSession(file).session.tabs).toEqual([])
    expect(() => readFileSync(`${file}.tmp`, 'utf8')).toThrow()
  })

  it('文件损坏时退化成空会话而不是抛错', () => {
    writeFileSync(file, '{ 不是 json', 'utf8')
    const loaded = readResearchSession(file)
    expect(loaded.ok).toBe(true)
    expect(loaded.repaired).toBe(true)
    expect(loaded.session.tabs).toEqual([])
  })

  it('目录不可写时返回 false（由调用方决定是否提示）', () => {
    // 用一个已经存在且是"文件"的路径当作目录：mkdir 会失败，rename 也会失败。
    const blocked = join(dir, 'blocked')
    writeFileSync(blocked, 'x', 'utf8')
    expect(writeResearchSession(join(blocked, 'session.json'), SESSION)).toBe(false)
  })
})
