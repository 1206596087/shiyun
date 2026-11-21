// 把 PDF.js 的 CJK 字符映射与标准字体复制到 public/pdfjs/，供运行时按 URL 取用。
// 不复制这两份资产，中文 PDF 会渲染成空白方块（PDF.js 需要 cmaps 才能解析 CID 字体）。
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = join(here, '..', 'node_modules', 'pdfjs-dist')
const target = join(here, '..', 'public', 'pdfjs')

const folders = ['cmaps', 'standard_fonts']

function needsCopy() {
  return folders.some((folder) => {
    const from = join(source, folder)
    const to = join(target, folder)
    if (!existsSync(from) || !existsSync(to)) return true
    const files = readdirSync(from).filter((name) => statSync(join(from, name)).isFile())
    return files.some((name) => !existsSync(join(to, name)))
  })
}

if (!existsSync(source)) {
  console.warn('[pdfjs-assets] 未找到 node_modules/pdfjs-dist，跳过')
  process.exit(0)
}

if (!needsCopy()) {
  console.log('[pdfjs-assets] public/pdfjs 已是最新')
  process.exit(0)
}

mkdirSync(target, { recursive: true })
for (const folder of folders) {
  cpSync(join(source, folder), join(target, folder), { recursive: true })
  console.log(`[pdfjs-assets] ${folder} → public/pdfjs/${folder}`)
}
