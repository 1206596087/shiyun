// 带 .ts 后缀：这份模块同时被渲染进程（bundler 解析）和主进程（nodenext 解析）引用。
import type { GraphLayout, KnowledgeGraphData, KnowledgeLink, KnowledgeNode, KnowledgeNodeType } from '../types/knowledge.ts'

/**
 * GraphDataAdapter 的纯逻辑部分：节点 id 规则、坐标生成、超量聚合。
 *
 * 输入是书库里的实体，输出是银河需要的 `KnowledgeGraphData`。
 * 这一层不碰数据库、不碰 React，因此主进程与 Vitest 都能直接用。
 *
 * 硬约束（ARCHITECTURE.md）：节点 id 与实体 id 是**稳定映射**，
 * 星星永远只是同一份书库数据的投影，不是另一份知识。
 */

export interface SourceFolder {
  id: string
  name: string
  parentId: string | null
}

export interface SourceBook {
  id: string
  title: string
  folderId: string | null
  format: string
  author: string
  pageCount: number | null
  createdAt: string
  updatedAt: string
}

export interface SourceHighlight {
  id: string
  bookId: string
  quote: string
  page: number | null
  cfi: string | null
  createdAt: string
}

export interface SourceNote {
  id: string
  title: string
  bodyText: string
  createdAt: string
  updatedAt: string
}

export interface SourceHighlightNote {
  highlightId: string
  noteId: string
}

export interface SourceClipping {
  id: string
  quote: string
  pageTitle: string
  url: string
  noteId: string | null
  capturedAt: string
}

export interface SourceLink {
  id: string
  sourceKind: KnowledgeNodeType
  sourceId: string
  targetKind: KnowledgeNodeType
  targetId: string
  relationType: string
  description: string
}

export interface SourceLayout {
  nodeId: string
  x: number
  y: number
  z: number
  pinned: boolean
}

export interface GraphSource {
  folders: SourceFolder[]
  books: SourceBook[]
  highlights: SourceHighlight[]
  notes: SourceNote[]
  highlightNotes: SourceHighlightNote[]
  links: SourceLink[]
  layouts: SourceLayout[]
  /** 网页摘录（阶段一）：只挂在笔记上，不属于任何一本书。 */
  clippings?: SourceClipping[]
}

export interface ProjectionOptions {
  /** 超过这个节点数就开始聚合成星团，默认 5000。 */
  maxNodes?: number
}

export interface ProjectionResult {
  graph: KnowledgeGraphData
  /** 还没有落到 graph_layouts 的坐标（调用方写库时 pinned = 0）。 */
  newLayouts: GraphLayout[]
  /** 被聚合掉的划线数量，>0 说明触发了降级。 */
  aggregatedHighlights: number
  /** 聚合后仍然超限、被隐藏的笔记数量。 */
  droppedNotes: number
}

export const MAX_NODES = 5000
export const UNCATEGORIZED_TOPIC_ID = 'topic:uncategorized'

const RADIUS: Record<KnowledgeNodeType, number> = {
  topic: 7.8,
  book: 9.6,
  highlight: 12.2,
  note: 10.9,
  clipping: 11.6,
}

const HEIGHT: Record<KnowledgeNodeType, number> = {
  topic: 0.6,
  book: 0.05,
  highlight: -0.4,
  note: 0.7,
  clipping: -0.15,
}

export function topicNodeId(folderId: string | null): string {
  return folderId ? `topic:${folderId}` : UNCATEGORIZED_TOPIC_ID
}

export function bookNodeId(bookId: string): string {
  return `book:${bookId}`
}

export function highlightNodeId(highlightId: string): string {
  return `hl:${highlightId}`
}

export function aggregatedHighlightNodeId(bookId: string): string {
  return `hlagg:${bookId}`
}

export function noteNodeId(noteId: string): string {
  return `note:${noteId}`
}

export function clippingNodeId(clippingId: string): string {
  return `clip:${clippingId}`
}

/** 从节点 id 反解节点种类（写 graph_layouts 与深链都要用）。 */
export function nodeKindOf(nodeId: string): KnowledgeNodeType | null {
  if (nodeId.startsWith('topic:')) return 'topic'
  if (nodeId.startsWith('book:')) return 'book'
  if (nodeId.startsWith('hl:') || nodeId.startsWith('hlagg:')) return 'highlight'
  if (nodeId.startsWith('note:')) return 'note'
  if (nodeId.startsWith('clip:')) return 'clipping'
  return null
}

/** 去掉 `kind:` 前缀，拿到实体 id。 */
export function entityIdOf(nodeId: string): string {
  const index = nodeId.indexOf(':')
  return index === -1 ? nodeId : nodeId.slice(index + 1)
}

function hashText(text: string): number {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** 确定性伪随机：同一个 id 永远得到同一个数，星图不会每次刷新都乱跳。 */
function pseudoRandom(seed: number): number {
  let value = seed + 0x6d2b79f5
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296
}

function jitter(id: string, salt: string): number {
  return pseudoRandom(hashText(`${id}|${salt}`))
}

function layoutFor(node: KnowledgeNode, cluster: number, clusterCount: number): GraphLayout {
  const radius = RADIUS[node.type] + jitter(node.id, 'radius') * 2.4
  const angle =
    -Math.PI / 2 + (cluster / Math.max(1, clusterCount)) * Math.PI * 2 + (jitter(node.id, 'angle') - 0.5) * 0.34
  const height = HEIGHT[node.type] + (jitter(node.id, 'height') - 0.5) * 1.1
  return {
    nodeId: node.id,
    x: Math.cos(angle) * radius,
    y: height,
    z: Math.sin(angle) * radius,
  }
}

function truncate(text: string, limit: number): string {
  const trimmed = text.trim()
  return trimmed.length > limit ? `${trimmed.slice(0, limit)}…` : trimmed
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0]?.trim() ?? ''
}

/**
 * 把书库实体投影成银河图。
 *
 * 顺序很关键：先按库里保存的坐标铺好（含用户拖动固定过的），
 * 再给剩下的节点算确定性坐标，最后把新坐标交给调用方落库。
 */
export function projectKnowledgeGraph(source: GraphSource, options: ProjectionOptions = {}): ProjectionResult {
  const maxNodes = options.maxNodes ?? MAX_NODES

  const folders = [...source.folders].sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'))
  const folderIds = new Set(folders.map((folder) => folder.id))
  const books = [...source.books].sort((left, right) => left.title.localeCompare(right.title, 'zh-Hans-CN'))
  const bookById = new Map(books.map((book) => [book.id, book]))

  // 星团顺序：先顶层文件夹（按名字），最后是「未分类」。
  const topLevelFolders = folders.filter((folder) => !folder.parentId || !folderIds.has(folder.parentId))
  const topicIds: string[] = topLevelFolders.map((folder) => topicNodeId(folder.id))
  const hasUncategorized = books.some((book) => !book.folderId || !folderIds.has(book.folderId))
  if (hasUncategorized || topicIds.length === 0) topicIds.push(UNCATEGORIZED_TOPIC_ID)

  const clusterOfTopic = new Map<string, number>()
  topicIds.forEach((id, index) => clusterOfTopic.set(id, index))
  const clusterCount = Math.max(1, topicIds.length)

  // 二级文件夹的书并入它的顶层祖先所属星团。
  const topLevelOf = (folderId: string | null): string => {
    if (!folderId || !folderIds.has(folderId)) return UNCATEGORIZED_TOPIC_ID
    let current = folders.find((folder) => folder.id === folderId)
    let guard = 0
    while (current && current.parentId && folderIds.has(current.parentId) && guard < 16) {
      current = folders.find((folder) => folder.id === current?.parentId)
      guard += 1
    }
    return topicNodeId(current ? current.id : null)
  }

  const topicOfBook = new Map<string, string>()
  const clusterOfBook = new Map<string, number>()
  books.forEach((book) => {
    const topicId = topLevelOf(book.folderId)
    topicOfBook.set(book.id, topicId)
    clusterOfBook.set(book.id, clusterOfTopic.get(topicId) ?? clusterCount - 1)
  })

  // —— 是否降级：先按「划线逐条展开」算一次，再看要不要聚合/隐藏笔记 ——
  const clippings = source.clippings ?? []
  const rawNodeCount = topicIds.length + books.length + source.highlights.length + source.notes.length + clippings.length
  const shouldAggregate = rawNodeCount > maxNodes
  const highlightCountByBook = new Map<string, number>()
  if (shouldAggregate) {
    source.highlights.forEach((highlight) => {
      highlightCountByBook.set(highlight.bookId, (highlightCountByBook.get(highlight.bookId) ?? 0) + 1)
    })
  }
  const afterAggregate = topicIds.length + books.length + highlightCountByBook.size + source.notes.length
  const shouldDropNotes = shouldAggregate && afterAggregate > maxNodes

  // —— 节点 ——
  const nodes: KnowledgeNode[] = []

  topicIds.forEach((topicId) => {
    const folderId = topicId === UNCATEGORIZED_TOPIC_ID ? null : entityIdOf(topicId)
    const folder = folderId ? folders.find((item) => item.id === folderId) : undefined
    const count = books.filter((book) => topicOfBook.get(book.id) === topicId).length
    const newest = books
      .filter((book) => topicOfBook.get(book.id) === topicId)
      .map((book) => book.updatedAt)
      .sort()
      .at(-1)
    nodes.push({
      id: topicId,
      type: 'topic',
      title: folder ? folder.name : '未分类',
      content: `这个主题下投影了 ${count} 本书。`,
      metadata: { discipline: folder ? folder.name : '未分类', bookCount: count },
      createdAt: newest ?? '',
      updatedAt: newest ?? '',
    })
  })

  books.forEach((book) => {
    nodes.push({
      id: bookNodeId(book.id),
      type: 'book',
      title: book.title,
      content: `${book.author || '作者未知'} · ${book.format.toUpperCase()}${book.pageCount ? ` · ${book.pageCount} 页` : ''}`,
      metadata: {
        format: book.format,
        author: book.author,
        pageCount: book.pageCount ?? 0,
        folderId: book.folderId ?? '',
      },
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
    })
  })

  if (shouldAggregate) {
    highlightCountByBook.forEach((count, bookId) => {
      const book = bookById.get(bookId)
      if (!book) return
      nodes.push({
        id: aggregatedHighlightNodeId(book.id),
        type: 'highlight',
        title: `${book.title} · ${count} 条划线`,
        content: `节点数超过 ${maxNodes}，这本书的 ${count} 条划线折叠成一个星团；展开请回书房。`,
        metadata: { bookId: book.id, bookTitle: book.title, aggregated: true, count },
        createdAt: book.createdAt,
        updatedAt: book.updatedAt,
      })
    })
  } else {
    source.highlights.forEach((highlight) => {
      const book = bookById.get(highlight.bookId)
      const quote = highlight.quote.trim()
      const metadata: Record<string, string | number | boolean> = {
        bookId: highlight.bookId,
        bookTitle: book ? book.title : '',
      }
      if (highlight.page !== null) metadata.page = highlight.page
      if (highlight.cfi) metadata.cfi = highlight.cfi
      nodes.push({
        id: highlightNodeId(highlight.id),
        type: 'highlight',
        title: truncate(quote, 22) || '（空划线）',
        content: quote,
        metadata,
        createdAt: highlight.createdAt,
        updatedAt: highlight.createdAt,
      })
    })
  }

  if (!shouldDropNotes) {
    source.notes.forEach((note) => {
      const count = source.highlightNotes.filter((pair) => pair.noteId === note.id).length
      nodes.push({
        id: noteNodeId(note.id),
        type: 'note',
        title: note.title.trim() || truncate(firstLine(note.bodyText), 22) || '未命名笔记',
        content: truncate(note.bodyText, 180),
        metadata: { highlightCount: count },
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      })
    })
  }

  // 网页摘录：不属于任何一本书，只可能在「已转成笔记」时与笔记相连。
  // 笔记被隐藏时摘录仍然保留——它自己就是一份可读的原文。
  clippings.forEach((clipping) => {
    const quote = clipping.quote.trim()
    const metadata: Record<string, string | number | boolean> = {
      url: clipping.url,
      pageTitle: clipping.pageTitle,
    }
    if (clipping.noteId) metadata.noteId = clipping.noteId
    nodes.push({
      id: clippingNodeId(clipping.id),
      type: 'clipping',
      title: truncate(quote, 22) || '（空摘录）',
      content: quote,
      metadata,
      createdAt: clipping.capturedAt,
      updatedAt: clipping.capturedAt,
    })
  })

  // —— 连线 ——
  const nodeIds = new Set(nodes.map((node) => node.id))
  const links: KnowledgeLink[] = []
  const pushLink = (id: string, sourceId: string, targetId: string, relationType: string, description: string) => {
    if (sourceId === targetId || !nodeIds.has(sourceId) || !nodeIds.has(targetId)) return
    links.push({ id, sourceId, targetId, relationType, description })
  }

  books.forEach((book) => {
    const topicId = topicOfBook.get(book.id)
    if (topicId) pushLink(`link:topic-book:${book.id}`, topicId, bookNodeId(book.id), 'contains', '主题包含书籍')
  })

  const aggregatedTargetOf = (highlightId: string): string | null => {
    const highlight = source.highlights.find((item) => item.id === highlightId)
    if (!highlight) return null
    return shouldAggregate ? aggregatedHighlightNodeId(highlight.bookId) : highlightNodeId(highlight.id)
  }

  if (shouldAggregate) {
    highlightCountByBook.forEach((count, bookId) => {
      pushLink(`link:book-hlagg:${bookId}`, bookNodeId(bookId), aggregatedHighlightNodeId(bookId), 'contains', `${count} 条划线（聚合）`)
    })
  } else {
    source.highlights.forEach((highlight) => {
      pushLink(`link:book-hl:${highlight.id}`, bookNodeId(highlight.bookId), highlightNodeId(highlight.id), 'contains', '书里的划线')
    })
  }

  if (!shouldDropNotes) {
    source.highlightNotes.forEach((pair) => {
      const target = aggregatedTargetOf(pair.highlightId)
      if (!target) return
      pushLink(`link:hl-note:${pair.highlightId}:${pair.noteId}`, target, noteNodeId(pair.noteId), 'annotates', '划线被笔记引用')
    })
    source.links.forEach((link) => {
      const prefixOf = (kind: KnowledgeNodeType) => (kind === 'highlight' ? 'hl' : kind === 'clipping' ? 'clip' : kind)
      const sourceId = `${prefixOf(link.sourceKind)}:${link.sourceId}`
      const targetId = `${prefixOf(link.targetKind)}:${link.targetId}`
      pushLink(`link:knowledge:${link.id}`, sourceId, targetId, link.relationType, link.description)
    })
  }

  // 摘录 → 笔记：只在笔记真的在图上时才连（笔记被降级隐藏时不画半边线）。
  clippings.forEach((clipping) => {
    if (!clipping.noteId) return
    pushLink(`link:clip-note:${clipping.id}`, clippingNodeId(clipping.id), noteNodeId(clipping.noteId), 'annotates', '摘录已整理成笔记')
  })

  // —— 坐标 ——
  const saved = new Map(source.layouts.map((layout) => [layout.nodeId, layout]))
  const layouts: GraphLayout[] = []
  const newLayouts: GraphLayout[] = []
  const highlightById = new Map(source.highlights.map((highlight) => [highlight.id, highlight]))
  const firstHighlightOfNote = new Map<string, string>()
  source.highlightNotes.forEach((pair) => {
    if (!firstHighlightOfNote.has(pair.noteId)) firstHighlightOfNote.set(pair.noteId, pair.highlightId)
  })

  const clusterOfNode = (node: KnowledgeNode): number => {
    if (node.type === 'topic') return clusterOfTopic.get(node.id) ?? clusterCount - 1
    if (node.type === 'book') return clusterOfBook.get(entityIdOf(node.id)) ?? clusterCount - 1
    if (node.type === 'highlight') {
      const bookId = node.metadata.bookId
      return typeof bookId === 'string' ? (clusterOfBook.get(bookId) ?? clusterCount - 1) : clusterCount - 1
    }
    if (node.type === 'clipping') {
      // 摘录没有归属书：如果它已经变成笔记，就跟着那篇笔记所在的星团。
      const noteId = node.metadata.noteId
      if (typeof noteId === 'string') {
        const highlightId = firstHighlightOfNote.get(noteId)
        const highlight = highlightId ? highlightById.get(highlightId) : undefined
        if (highlight) return clusterOfBook.get(highlight.bookId) ?? clusterCount - 1
      }
      return Math.floor(jitter(node.id, 'cluster') * clusterCount)
    }
    const highlightId = firstHighlightOfNote.get(entityIdOf(node.id))
    const highlight = highlightId ? highlightById.get(highlightId) : undefined
    if (highlight) return clusterOfBook.get(highlight.bookId) ?? clusterCount - 1
    return Math.floor(jitter(node.id, 'cluster') * clusterCount)
  }

  nodes.forEach((node) => {
    const savedLayout = saved.get(node.id)
    if (savedLayout) {
      layouts.push({ nodeId: node.id, x: savedLayout.x, y: savedLayout.y, z: savedLayout.z })
      return
    }
    const layout = layoutFor(node, clusterOfNode(node), clusterCount)
    layouts.push(layout)
    newLayouts.push(layout)
  })

  return {
    graph: { nodes, links, layouts, version: 2 },
    newLayouts,
    aggregatedHighlights: shouldAggregate ? source.highlights.length : 0,
    droppedNotes: shouldDropNotes ? source.notes.length : 0,
  }
}
