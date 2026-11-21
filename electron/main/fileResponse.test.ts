import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { fileResponse } from './fileResponse.ts'

let directory: string
let path: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'shiyun-range-'))
  path = join(directory, 'source.pdf')
  await writeFile(path, '0123456789')
})
afterEach(async () => { await rm(directory, { recursive: true, force: true }) })

it.each([
  ['bytes=2-4', 206, '234'], ['bytes=-3', 206, '789'],
  ['bytes=8-', 206, '89'], ['bytes=8-100', 206, '89'],
  ['bytes=10-', 416, ''], ['bytes=-0', 416, ''],
  ['bytes=4-2', 416, ''], ['bytes=0-1,3-4', 416, ''],
  ['bytes=-', 416, ''],
])('serves %s with status %s', async (range, status, body) => {
  const response = await fileResponse(path, new Request('https://test/', { headers: { range } }), 'application/pdf')
  expect(response.status).toBe(status)
  expect(await response.text()).toBe(body)
})

it('serves full files and HEAD without a body', async () => {
  expect(await (await fileResponse(path, new Request('https://test/'), 'application/pdf')).text()).toBe('0123456789')
  const head = await fileResponse(path, new Request('https://test/', { method: 'HEAD' }), 'application/pdf')
  expect(head.headers.get('content-length')).toBe('10')
  expect(await head.text()).toBe('')
})

it('bounds chunks and supports consumer cancellation', async () => {
  await writeFile(path, new Uint8Array(1024 * 1024))
  const response = await fileResponse(path, new Request('https://test/'), 'application/pdf')
  const reader = response.body!.getReader()
  expect((await reader.read()).value?.byteLength).toBe(64 * 1024)
  await reader.cancel()
})

it('rejects aborted requests', async () => {
  const controller = new AbortController()
  controller.abort()
  const response = await fileResponse(path, new Request('https://test/', { signal: controller.signal }), 'application/pdf')
  await expect(response.text()).rejects.toThrow('aborted')
})
