import { describe, expect, it } from 'vitest'
import {
  UNCATEGORIZED_TOPIC_ID,
  aggregatedHighlightNodeId,
  bookNodeId,
  entityIdOf,
  highlightNodeId,
  nodeKindOf,
  noteNodeId,
  projectKnowledgeGraph,
  topicNodeId,
  type GraphSource,
} from './graphProjection'

function makeSource(overrides: Partial<GraphSource> = {}): GraphSource {
  return {
    folders: [
      { id: 'folder-medicine', name: '医学', parentId: null },
      { id: 'folder-statistics', name: '统计学', parentId: 'folder-medicine' },
      { id: 'folder-literature', name: '文学', parentId: null },
    ],
    books: [
      {
        id: 'book-biostat',
        title: '生物统计学',
        folderId: 'folder-statistics',
        format: 'pdf',
        author: '某作者',
        pageCount: 320,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'book-essays',
        title: '散文选',
        folderId: 'folder-literature',
        format: 'epub',
        author: '',
        pageCount: null,
        createdAt: '2026-01-03T00:00:00.000Z',
        updatedAt: '2026-01-04T00:00:00.000Z',
      },
      {
        id: 'book-loose',
        title: '散落在外的书',
        folderId: null,
        format: 'pdf',
        author: '佚名',
        pageCount: 10,
        createdAt: '2026-01-05T00:00:00.000Z',
        updatedAt: '2026-01-05T00:00:00.000Z',
      },
    ],
    highlights: [
      {
        id: 'hl-1',
        bookId: 'book-biostat',
        quote: '优势比 OR 在罕见结局下近似相对危险度 RR。',
        page: 12,
        cfi: null,
        createdAt: '2026-02-01T00:00:00.000Z',
      },
      {
        id: 'hl-2',
        bookId: 'book-essays',
        quote: '山中何事？松花酿酒，春水煎茶。',
        page: null,
        cfi: 'epubcfi(/6/4!/4/2/1:0)',
        createdAt: '2026-02-02T00:00:00.000Z',
      },
    ],
    notes: [
      {
        id: 'note-1',
        title: 'OR 与 RR',
        bodyText: '罕见结局下两者数值接近。',
        createdAt: '2026-02-03T00:00:00.000Z',
        updatedAt: '2026-02-03T00:00:00.000Z',
      },
      {
        id: 'note-2',
        title: '',
        bodyText: '第一行就是标题\n第二行是正文',
        createdAt: '2026-02-04T00:00:00.000Z',
        updatedAt: '2026-02-04T00:00:00.000Z',
      },
    ],
    highlightNotes: [
      { highlightId: 'hl-1', noteId: 'note-1' },
      { highlightId: 'hl-1', noteId: 'note-2' },
    ],
    links: [
      {
        id: 'kl-1',
        sourceKind: 'note',
        sourceId: 'note-1',
        targetKind: 'note',
        targetId: 'note-2',
        relationType: 'supports',
        description: '笔记互证',
      },
      {
        id: 'kl-broken',
        sourceKind: 'note',
        sourceId: 'note-1',
        targetKind: 'book',
        targetId: 'book-missing',
        relationType: 'interprets',
        description: '指向不存在的书，应被丢弃',
      },
    ],
    layouts: [],
    ...overrides,
  }
}

describe('node id helpers', () => {
  it('round-trips kinds and entity ids', () => {
    expect(topicNodeId('folder-a')).toBe('topic:folder-a')
    expect(topicNodeId(null)).toBe(UNCATEGORIZED_TOPIC_ID)
    expect(bookNodeId('b1')).toBe('book:b1')
    expect(highlightNodeId('h1')).toBe('hl:h1')
    expect(aggregatedHighlightNodeId('b1')).toBe('hlagg:b1')
    expect(noteNodeId('n1')).toBe('note:n1')
    expect(nodeKindOf('topic:folder-a')).toBe('topic')
    expect(nodeKindOf('hl:h1')).toBe('highlight')
    expect(nodeKindOf('hlagg:b1')).toBe('highlight')
    expect(nodeKindOf('unknown:x')).toBeNull()
    expect(entityIdOf('hlagg:b1')).toBe('b1')
  })
})

describe('projectKnowledgeGraph', () => {
  it('projects folders into topics and rolls nested folders up', () => {
    const { graph } = projectKnowledgeGraph(makeSource())
    const topics = graph.nodes.filter((node) => node.type === 'topic')
    expect(topics.map((node) => node.id).sort()).toEqual([topicNodeId('folder-literature'), topicNodeId('folder-medicine'), UNCATEGORIZED_TOPIC_ID])
    const medicine = topics.find((node) => node.id === topicNodeId('folder-medicine'))
    expect(medicine?.metadata.bookCount).toBe(1)
    expect(medicine?.title).toBe('医学')
  })

  it('keeps highlight locators in metadata for deep links', () => {
    const { graph } = projectKnowledgeGraph(makeSource())
    const pdfHighlight = graph.nodes.find((node) => node.id === highlightNodeId('hl-1'))
    const epubHighlight = graph.nodes.find((node) => node.id === highlightNodeId('hl-2'))
    expect(pdfHighlight?.metadata).toMatchObject({ bookId: 'book-biostat', page: 12 })
    expect(epubHighlight?.metadata).toMatchObject({ bookId: 'book-essays', cfi: 'epubcfi(/6/4!/4/2/1:0)' })
    expect(epubHighlight?.metadata.page).toBeUndefined()
  })

  it('derives note titles from the first body line when no title is set', () => {
    const { graph } = projectKnowledgeGraph(makeSource())
    const note = graph.nodes.find((node) => node.id === noteNodeId('note-2'))
    expect(note?.title).toBe('第一行就是标题')
    expect(note?.metadata.highlightCount).toBe(1)
  })

  it('builds topic→book, book→highlight, highlight→note and note→note links', () => {
    const { graph } = projectKnowledgeGraph(makeSource())
    const pairs = graph.links.map((link) => `${link.sourceId}->${link.targetId}`)
    expect(pairs).toContain(`${topicNodeId('folder-medicine')}->${bookNodeId('book-biostat')}`)
    expect(pairs).toContain(`${bookNodeId('book-biostat')}->${highlightNodeId('hl-1')}`)
    expect(pairs).toContain(`${highlightNodeId('hl-1')}->${noteNodeId('note-1')}`)
    expect(pairs).toContain(`${highlightNodeId('hl-1')}->${noteNodeId('note-2')}`)
    expect(pairs).toContain(`${noteNodeId('note-1')}->${noteNodeId('note-2')}`)
    // 指向不存在书籍的连线必须被丢掉，而不是留一条悬空边。
    expect(graph.links.some((link) => link.id === 'link:knowledge:kl-broken')).toBe(false)
    expect(graph.links.every((link) => link.sourceId !== link.targetId)).toBe(true)
  })

  it('produces one deterministic layout per node and reports only new ones', () => {
    const first = projectKnowledgeGraph(makeSource())
    const second = projectKnowledgeGraph(makeSource())
    expect(first.graph.layouts).toEqual(second.graph.layouts)
    expect(first.newLayouts).toHaveLength(first.graph.nodes.length)
    expect(first.graph.layouts).toHaveLength(first.graph.nodes.length)

    const pinned = { nodeId: bookNodeId('book-biostat'), x: 1.5, y: 0.25, z: -2.5, pinned: true }
    const source = makeSource({ layouts: [pinned] })
    const withSaved = projectKnowledgeGraph(source)
    expect(withSaved.graph.layouts.find((layout) => layout.nodeId === pinned.nodeId)).toEqual({
      nodeId: pinned.nodeId,
      x: pinned.x,
      y: pinned.y,
      z: pinned.z,
    })
    expect(withSaved.newLayouts.some((layout) => layout.nodeId === pinned.nodeId)).toBe(false)
  })

  it('aggregates highlights per book when the graph would grow past maxNodes', () => {
    const manyHighlights = Array.from({ length: 12 }, (_, index) => ({
      id: `hl-${index}`,
      bookId: 'book-biostat',
      quote: `第 ${index} 条划线`,
      page: index + 1,
      cfi: null,
      createdAt: '2026-02-01T00:00:00.000Z',
    }))
    const { graph, aggregatedHighlights, droppedNotes } = projectKnowledgeGraph(
      makeSource({ highlights: manyHighlights }),
      { maxNodes: 10 },
    )
    expect(aggregatedHighlights).toBe(12)
    expect(droppedNotes).toBe(0)
    expect(graph.nodes.some((node) => node.id === aggregatedHighlightNodeId('book-biostat'))).toBe(true)
    const aggregated = graph.nodes.find((node) => node.id === aggregatedHighlightNodeId('book-biostat'))
    expect(aggregated?.metadata).toMatchObject({ aggregated: true, count: 12 })
    expect(graph.nodes.some((node) => node.id.startsWith('hl:'))).toBe(false)
    // 聚合后笔记仍然挂在「聚合划线」上，多对多没有被降级丢掉。
    expect(graph.links.some((link) => link.sourceId === aggregatedHighlightNodeId('book-biostat') && link.targetId === noteNodeId('note-1'))).toBe(true)
  })

  it('drops notes only when aggregation is still over the limit', () => {
    const manyHighlights = Array.from({ length: 40 }, (_, index) => ({
      id: `hl-${index}`,
      bookId: 'book-biostat',
      quote: `第 ${index} 条划线`,
      page: index + 1,
      cfi: null,
      createdAt: '2026-02-01T00:00:00.000Z',
    }))
    const { graph, aggregatedHighlights, droppedNotes } = projectKnowledgeGraph(
      makeSource({ highlights: manyHighlights }),
      { maxNodes: 5 },
    )
    expect(aggregatedHighlights).toBe(40)
    expect(droppedNotes).toBeGreaterThan(0)
    expect(graph.nodes.some((node) => node.type === 'note')).toBe(false)
    expect(graph.links.some((link) => link.targetId.startsWith('note:'))).toBe(false)
  })

  it('adds an uncategorized topic when the library has no folders', () => {
    const source = makeSource({
      folders: [],
      books: [{ ...makeSource().books[0], folderId: null }],
      highlights: [],
      notes: [],
      highlightNotes: [],
      links: [],
    })
    const { graph } = projectKnowledgeGraph(source)
    const topics = graph.nodes.filter((node) => node.type === 'topic')
    expect(topics).toHaveLength(1)
    expect(topics[0]?.id).toBe(UNCATEGORIZED_TOPIC_ID)
    expect(topics[0]?.title).toBe('未分类')
    expect(graph.links).toHaveLength(1)
  })
})
