import type {
  GraphLayout,
  KnowledgeGraphData,
  KnowledgeLink,
  KnowledgeNode,
  KnowledgeNodeType,
} from '../types/knowledge'
import { hashString, mulberry32 } from '../utils/random'

const NOW = '2026-11-21T00:00:00.000Z'
const topics = [
  ['medicine', '医学', '生命、疾病与治愈的知识星团'],
  ['mathematics', '数学', '抽象结构与证明的知识星团'],
  ['physics', '物理学', '物质、能量与时空的知识星团'],
  ['literature', '文学', '叙事、语言与经验的知识星团'],
  ['philosophy', '哲学', '存在、认识与价值的知识星团'],
] as const

const books = [
  ['book-medicine', 'medicine', '疾病的隐喻', '疾病如何进入语言与文化想象'],
  ['book-math', 'mathematics', '数学之美', '从结构、对称与算法理解数学'],
  ['book-physics', 'physics', '时间简史', '宇宙、黑洞与时间的边界'],
  ['book-literature', 'literature', '百年孤独', '记忆、循环时间与家族叙事'],
  ['book-philosophy', 'philosophy', '沉思录', '自我、秩序与日常伦理'],
] as const

function node(
  id: string,
  type: KnowledgeNodeType,
  title: string,
  content: string,
  metadata: KnowledgeNode['metadata'],
): KnowledgeNode {
  return { id, type, title, content, metadata, createdAt: NOW, updatedAt: NOW }
}

const nodes: KnowledgeNode[] = [
  ...topics.map(([id, title, content]) => node(`topic-${id}`, 'topic', title, content, { discipline: id })),
  ...books.map(([id, discipline, title, content]) => node(id, 'book', title, content, { discipline, author: '演示书目' })),
]

const highlightTexts = [
  ['隐喻会改变我们理解痛苦的方式', '身体不仅是医学对象，也是叙事发生之处'],
  ['对称是复杂系统中的节约原则', '证明把直觉变成可以共享的确定性'],
  ['引力让时间呈现不同的速度', '观察者的位置参与了世界的描述'],
  ['家族记忆像螺旋一样重复又偏移', '语言保存了被时间冲淡的经验'],
  ['我们能控制的首先是自己的判断', '秩序不是静止，而是关系的协调'],
] as const

books.forEach(([bookId, discipline], disciplineIndex) => {
  for (let index = 0; index < 4; index += 1) {
    const text = highlightTexts[disciplineIndex][index % 2]
    nodes.push(
      node(
        `highlight-${discipline}-${index + 1}`,
        'highlight',
        `划线 · ${text.slice(0, 8)}`,
        `${text}。这是用于验证知识网络关系的模拟划线。`,
        { discipline, bookId, page: 18 + index * 27 },
      ),
    )
  }
})

const noteTitles = [
  ['叙事与诊断', '身体经验的双重语言'],
  ['证明与想象', '结构如何产生美感'],
  ['时间不是背景', '观察者与尺度'],
  ['循环叙事的引力', '记忆构成的时间'],
  ['判断的边界', '秩序与自由'],
] as const

topics.forEach(([discipline], disciplineIndex) => {
  for (let index = 0; index < 2; index += 1) {
    const title = noteTitles[disciplineIndex][index]
    nodes.push(
      node(
        `note-${discipline}-${index + 1}`,
        'note',
        title,
        `${title}：把书籍与多条划线重新组织成个人理解。`,
        { discipline, status: 'demo' },
      ),
    )
  }
})

const links: KnowledgeLink[] = []
function link(sourceId: string, targetId: string, relationType: string, description: string) {
  links.push({ id: `link-${links.length + 1}`, sourceId, targetId, relationType, description })
}

books.forEach(([bookId, discipline]) => {
  link(`topic-${discipline}`, bookId, 'contains', '主题星团收录这本书')
  for (let index = 1; index <= 4; index += 1) {
    link(bookId, `highlight-${discipline}-${index}`, 'contains', '划线摘自这本书')
  }
  for (let index = 1; index <= 2; index += 1) {
    link(`note-${discipline}-${index}`, `highlight-${discipline}-${index}`, 'interprets', '笔记解释并延伸这条划线')
    link(`note-${discipline}-${index}`, `highlight-${discipline}-${index + 2}`, 'synthesizes', '笔记综合了多条划线')
  }
})

link('note-medicine-1', 'highlight-literature-2', 'analogy', '用文学叙事理解疾病经验')
link('note-medicine-1', 'note-philosophy-1', 'questions', '医学判断与伦理判断相互照亮')
link('note-mathematics-2', 'highlight-physics-1', 'supports', '数学结构解释物理时空')
link('note-physics-2', 'highlight-philosophy-2', 'questions', '观察者问题跨越物理与认识论')
link('note-literature-1', 'highlight-physics-1', 'analogy', '把循环叙事与弯曲时空并置')
link('note-philosophy-2', 'highlight-medicine-1', 'questions', '讨论痛苦与自我控制的边界')

const clusterAngles = new Map<string, number>(
  topics.map(([discipline], index): [string, number] => [discipline, index * ((Math.PI * 2) / topics.length) - 0.5]),
)
const layouts: GraphLayout[] = nodes.map((item) => {
  const discipline = String(item.metadata.discipline ?? 'medicine')
  const random = mulberry32(hashString(item.id))
  const baseAngle = clusterAngles.get(discipline) ?? 0
  const typeRadius = ({ topic: 7.8, book: 9.6, highlight: 12.2, note: 10.9, clipping: 11.6 } as Record<KnowledgeNodeType, number>)[item.type]
  const armCurve = typeRadius * 0.18
  const angle = baseAngle + armCurve + (random() - 0.5) * 0.36
  const radius = typeRadius + (random() - 0.5) * 2.1
  return {
    nodeId: item.id,
    x: Math.cos(angle) * radius,
    y: (random() - 0.5) * (item.type === 'topic' ? 0.45 : 1.8),
    z: Math.sin(angle) * radius,
  }
})

export const INITIAL_KNOWLEDGE_GRAPH: KnowledgeGraphData = { nodes, links, layouts, version: 1 }
