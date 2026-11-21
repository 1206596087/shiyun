import type { ImportReport, LibraryCounts, LibraryFolder, LibraryNodeKind, LibraryTreeNode, LibraryTree } from '../types/library'
import { cloneTree, createDemoTree } from './demoLibrary'

export type LibraryMode = 'desktop' | 'demo'

export interface LibraryMeta {
  dataDir: string
  dbFile: string
  backups: number
  lastBackupAt: string | null
  prototypeImportedAt: string | null
}

export interface LibraryBridge {
  readonly mode: LibraryMode
  listTree: () => Promise<LibraryTree>
  createFolder: (name: string, parentId: string | null) => Promise<LibraryTree>
  renameNode: (kind: LibraryNodeKind, id: string, name: string) => Promise<LibraryTree>
  moveNode: (kind: LibraryNodeKind, id: string, targetFolderId: string | null) => Promise<LibraryTree>
  deleteFolder: (id: string) => Promise<LibraryTree>
  deleteBook: (id: string) => Promise<LibraryTree>
  importBook: (folderId: string | null) => Promise<ImportReport | null>
  getMeta: () => Promise<LibraryMeta | null>
}

/** 演示书库：只在内存里改，刷新页面即复原。用来在没有 Electron 的环境下验证交互。 */
function createDemoBridge(): LibraryBridge {
  let tree = createDemoTree()

  const recount = (): LibraryTree => {
    const counts: LibraryCounts = { ...tree.counts }
    let folders = 0
    let books = 0
    const walk = (nodes: LibraryTree['folders']) => {
      for (const node of nodes) {
        folders += 1
        walk(node.children.filter((child): child is LibraryFolder => child.kind === 'folder'))
        books += node.children.filter((child) => child.kind === 'book').length
      }
    }
    walk(tree.folders)
    counts.folders = folders
    counts.books = books + tree.uncategorized.length
    tree = { ...tree, counts }
    return cloneTree(tree)
  }

  const findFolder = (id: string): LibraryFolder | undefined => {
    const stack: LibraryFolder[] = [...tree.folders]
    while (stack.length > 0) {
      const current = stack.pop()!
      if (current.id === id) return current
      stack.push(...current.children.filter((child): child is LibraryFolder => child.kind === 'folder'))
    }
    return undefined
  }

  const detach = (id: string) => {
    const drop = (nodes: LibraryTree['folders']): LibraryTreeNode | undefined => {
      const index = nodes.findIndex((node) => node.id === id)
      if (index >= 0) return nodes.splice(index, 1)[0]
      for (const node of nodes) {
        if (node.kind !== 'folder') continue
        const found = drop(node.children as LibraryFolder[])
        if (found) return found
      }
      return undefined
    }
    return drop(tree.folders)
  }

  const attach = (parentId: string | null, node: LibraryTree['folders'][number] | LibraryBookLike) => {
    if (!parentId) {
      if (node.kind === 'folder') tree.folders.push(node as LibraryFolder)
      else tree.uncategorized.push(node as LibraryTree['uncategorized'][number])
      return
    }
    const parent = findFolder(parentId)
    if (!parent) throw new Error('目标文件夹不存在（演示模式）')
    parent.children.push(node as LibraryFolder)
  }

  return {
    mode: 'demo',
    listTree: async () => cloneTree(tree),
    createFolder: async (name, parentId) => {
      if (!name.trim()) throw new Error('文件夹名不能为空')
      const folder: LibraryFolder = { kind: 'folder', id: `folder-demo-${Date.now()}`, name: name.trim(), parentId, children: [] }
      attach(parentId, folder)
      return recount()
    },
    renameNode: async (kind, id, name) => {
      if (!name.trim()) throw new Error('名称不能为空')
      if (kind === 'folder') {
        const folder = findFolder(id)
        if (!folder) throw new Error('文件夹不存在')
        folder.name = name.trim()
      } else {
        const target = findBook(tree, id)
        if (!target) throw new Error('书籍不存在')
        target.title = name.trim()
      }
      return recount()
    },
    moveNode: async (kind, id, targetFolderId) => {
      if (targetFolderId === id) throw new Error('不能移动到自身')
      const node = detach(id)
      if (!node) throw new Error('节点不存在')
      attach(targetFolderId, node)
      void kind
      return recount()
    },
    deleteFolder: async (id) => {
      const folder = findFolder(id)
      if (!folder) throw new Error('文件夹不存在')
      const books = collectBooks(folder)
      detach(id)
      tree.uncategorized.push(...books)
      return recount()
    },
    deleteBook: async (id) => {
      const removed = detach(id)
      if (!removed) tree.uncategorized = tree.uncategorized.filter((item) => item.id !== id)
      return recount()
    },
    importBook: async () => null,
    getMeta: async () => null,
  }
}

type LibraryBookLike = LibraryTree['uncategorized'][number]

function findBook(tree: LibraryTree, id: string): LibraryTree['uncategorized'][number] | undefined {
  const stack: LibraryTree['folders'] = [...tree.folders]
  while (stack.length > 0) {
    const current = stack.pop()!
    for (const child of current.children) {
      if (child.kind === 'book' && child.id === id) return child
      if (child.kind === 'folder') stack.push(child)
    }
  }
  return tree.uncategorized.find((item) => item.id === id)
}

function collectBooks(folder: LibraryFolder): LibraryBookLike[] {
  const collected: LibraryBookLike[] = []
  const stack: LibraryFolder[] = [folder]
  while (stack.length > 0) {
    const current = stack.pop()!
    for (const child of current.children) {
      if (child.kind === 'book') collected.push(child)
      else stack.push(child)
    }
  }
  return collected
}

/** 桌面版：所有读写都走 IPC，渲染进程不碰数据库。 */
function createDesktopBridge(api: NonNullable<Window['shiyunDesktop']>['library']): LibraryBridge {
  return {
    mode: 'desktop',
    listTree: () => api.listTree(),
    createFolder: (name, parentId) => api.createFolder(name, parentId),
    renameNode: (kind, id, name) => api.renameNode(kind, id, name),
    moveNode: (kind, id, targetFolderId) => api.moveNode(kind, id, targetFolderId),
    deleteFolder: (id) => api.deleteFolder(id),
    deleteBook: (id) => api.deleteBook(id),
    importBook: (folderId) => api.importBook(folderId),
    getMeta: () => api.getMeta(),
  }
}

export function getLibraryBridge(): LibraryBridge {
  const desktop = window.shiyunDesktop
  if (desktop?.library) return createDesktopBridge(desktop.library)
  return createDemoBridge()
}
