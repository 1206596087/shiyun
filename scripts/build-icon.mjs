// 把 build/icon-<size>.png 打包成 build/icon.ico（PNG 压缩的 ICO，Vista+ 支持）。
// 只是为了给 electron-builder 一个应用图标；不引入图像库。
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), 'build')
const sizes = [256, 128, 64, 48, 32, 24, 16]

const images = sizes.map((size) => ({ size, data: readFileSync(join(dir, `icon-${size}.png`)) }))

const headerSize = 6
const dirEntrySize = 16
const header = Buffer.alloc(headerSize)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(images.length, 4)

let offset = headerSize + dirEntrySize * images.length
const entries = []
for (const image of images) {
  const entry = Buffer.alloc(dirEntrySize)
  entry.writeUInt8(image.size >= 256 ? 0 : image.size, 0) // width（256 记为 0）
  entry.writeUInt8(image.size >= 256 ? 0 : image.size, 1) // height
  entry.writeUInt8(0, 2) // 调色板
  entry.writeUInt8(0, 3) // reserved
  entry.writeUInt16LE(1, 4) // planes
  entry.writeUInt16LE(32, 6) // bpp
  entry.writeUInt32LE(image.data.length, 8)
  entry.writeUInt32LE(offset, 12)
  offset += image.data.length
  entries.push(entry)
}

writeFileSync(join(dir, 'icon.ico'), Buffer.concat([header, ...entries, ...images.map((image) => image.data)]))
console.log(`wrote build/icon.ico with ${images.length} sizes: ${sizes.join(', ')}`)
