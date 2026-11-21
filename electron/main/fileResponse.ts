import { open } from 'node:fs/promises'

/** Bounded reads; closing or aborting a response releases its file descriptor. */
export async function fileResponse(path: string, request: Request, mime: string): Promise<Response> {
  const file = await open(path, 'r')
  try {
    const { size } = await file.stat()
    let start = 0
    let end = size - 1
    const range = request.headers.get('range')
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
      if (!match || (!match[1] && !match[2])) {
        await file.close()
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
      }
      start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
      end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
        await file.close()
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
      }
    }
    const headers: Record<string, string> = {
      'Content-Type': mime, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes',
    }
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`
    if (request.method === 'HEAD' || size === 0) {
      await file.close()
      return new Response(null, { status: range ? 206 : 200, headers })
    }
    let closed = false
    const close = async () => {
      if (closed) return
      closed = true
      request.signal.removeEventListener('abort', abort)
      await file.close()
    }
    const abort = () => { void close() }
    request.signal.addEventListener('abort', abort, { once: true })
    if (request.signal.aborted) await close()
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          if (request.signal.aborted) throw new Error('Request aborted')
          const buffer = new Uint8Array(Math.min(64 * 1024, end - start + 1))
          const { bytesRead } = await file.read(buffer, 0, buffer.length, start)
          if (!bytesRead) throw new Error('Unexpected end of book file')
          start += bytesRead
          controller.enqueue(buffer.subarray(0, bytesRead))
          if (start > end) { await close(); controller.close() }
        } catch (error) { await close(); controller.error(error) }
      },
      cancel: close,
    })
    return new Response(body, { status: range ? 206 : 200, headers })
  } catch (error) {
    await file.close()
    throw error
  }
}
