import type { LibraryBook, LibraryFolder, LibraryTree } from '../types/library'

const stamp = '2026-01-01T00:00:00.000Z'

function book(id: string, title: string, folderId: string | null): LibraryBook {
  return {
    kind: 'book',
    id,
    title,
    author: null,
    format: 'pdf',
    folderId,
    pageCount: null,
    fileSize: null,
    lastOpenedAt: null,
    createdAt: stamp,
    updatedAt: stamp,
  }
}

/**
 * 浏览器（`npm run dev:web`）里的演示书库。
 *
 * 桌面版的书库来自 SQLite；这里只是让没装 Electron 的环境也能点得动，
 * 界面上会明确标注「演示书库」，并且不会写入任何真实数据。
 */
export function createDemoTree(): LibraryTree {
  const statistics: LibraryFolder = {
    kind: 'folder',
    id: 'folder-statistics',
    name: '统计学',
    parentId: 'folder-medicine',
    children: [book('book-biostatistics', '生物统计学.pdf', 'folder-statistics')],
  }
  const medicine: LibraryFolder = {
    kind: 'folder',
    id: 'folder-medicine',
    name: '医学',
    parentId: null,
    children: [statistics, { kind: 'folder', id: 'folder-clinical', name: '临床医学', parentId: 'folder-medicine', children: [] }],
  }

  return {
    folders: [
      medicine,
      { kind: 'folder', id: 'folder-literature', name: '文学', parentId: null, children: [] },
      { kind: 'folder', id: 'folder-physics', name: '物理学', parentId: null, children: [] },
    ],
    uncategorized: [],
    counts: { books: 1, folders: 5, highlights: 20, notes: 10, clippings: 1, links: 51 },
    dataDir: '浏览器演示模式 · 未连接数据库',
  }
}

export function cloneTree(tree: LibraryTree): LibraryTree {
  return structuredClone(tree)
}
