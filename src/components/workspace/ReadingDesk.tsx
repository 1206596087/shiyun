import type { WorkspaceTab } from '../../types/workspace'
import { IconBook, IconHighlight, IconLink, IconList, IconNetwork, IconNote, IconPanel, IconPlus, IconQuote } from './icons'

interface Props {
  tabs: WorkspaceTab[]
  activeTabId: string | null
  noteDraft: string
  rightVisible: boolean
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onOpenNote: () => void
  onNoteDraft: (value: string) => void
  onToggleRight: () => void
}

export function ReadingDesk(props: Props) {
  const activeTab = props.tabs.find((tab) => tab.id === props.activeTabId) ?? null
  return (
    <section className="reading-desk" aria-label="阅读与编辑">
      <div className="reader-card">
        <div className="reader-tabbar">
          <div className="reader-tabs" role="tablist" aria-label="打开的标签页">
            {props.tabs.map((tab) => (
              <div
                key={tab.id}
                role="tab"
                tabIndex={0}
                aria-selected={tab.id === props.activeTabId}
                className={`reader-tab ${tab.id === props.activeTabId ? 'is-active' : ''}`}
                onClick={() => props.onActivate(tab.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); props.onActivate(tab.id) }
                }}
              >
                {tab.kind === 'book' ? <IconBook size={14} /> : <IconNote size={14} />}
                <span className="reader-tab__title">{tab.title}</span>
                {tab.dirty && <i className="reader-tab__dot" title="有未保存的编辑" />}
                <button
                  className="reader-tab__close"
                  aria-label={`关闭 ${tab.title}`}
                  title="关闭标签页"
                  onClick={(event) => { event.stopPropagation(); props.onClose(tab.id) }}
                >×</button>
              </div>
            ))}
            <button className="reader-tab-add" onClick={props.onOpenNote} title="新建笔记标签页" aria-label="新建笔记标签页">
              <IconPlus size={15} />
            </button>
          </div>
          <button
            className={`ws-icon-btn ws-icon-btn--sm ${props.rightVisible ? 'is-on' : ''}`}
            onClick={props.onToggleRight}
            title={props.rightVisible ? '隐藏网页研究栏' : '显示网页研究栏'}
            aria-label={props.rightVisible ? '隐藏网页研究栏' : '显示网页研究栏'}
            aria-pressed={props.rightVisible}
          >
            <IconPanel size={16} />
          </button>
        </div>

        <div className="reader-body">
          {!activeTab ? (
            <EmptyDesk onOpenNote={props.onOpenNote} />
          ) : activeTab.kind === 'book' ? (
            <BookPage onOpenNote={props.onOpenNote} />
          ) : (
            <NotePage title={activeTab.title} value={props.noteDraft} onChange={props.onNoteDraft} />
          )}
        </div>
      </div>
    </section>
  )
}

function BookPage({ onOpenNote }: { onOpenNote: () => void }) {
  return (
    <article className="reader-page">
      <p className="reader-page__chapter">第三章 · 回归模型</p>
      <p className="reader-paragraph">
        Logistic 回归适用于二分类结局变量的建模，其回归系数可以通过指数变换得到优势比。
      </p>
      <p className="reader-highlight">
        优势比（OR）和相对危险度（RR）在某些情况下数值接近，但两者并不等同。
      </p>
      <p className="reader-paragraph">
        当结局事件较为罕见时，OR 可以近似 RR；随着事件发生率升高，两者的差异会逐渐增大。
      </p>

      <div className="reader-actions" aria-label="选中文字工具栏">
        <button disabled title="M4 里程碑：真实选区锚点与高亮持久化"><IconHighlight size={14} />添加划线</button>
        <span aria-hidden="true">/</span>
        <button onClick={onOpenNote}><IconNote size={14} />写笔记</button>
        <span aria-hidden="true">/</span>
        <button disabled title="M4 里程碑：知识关系"><IconNetwork size={14} />关联节点</button>
      </div>

      <aside className="reader-note-card">
        <p className="reader-note-card__label"><IconNote size={14} />我的笔记</p>
        <p className="reader-note-card__title">为什么在罕见结局下，OR 会近似 RR？</p>
        <button className="reader-note-card__link" onClick={onOpenNote}>
          <IconLink size={13} />已关联到上方划线
        </button>
      </aside>

      <p className="reader-page__foot">演示阅读视图 · M3 接入 PDF.js 与 EPUB.js 后显示真实文件内容与目录</p>
    </article>
  )
}

function NotePage({ title, value, onChange }: { title: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="note-page">
      <div className="note-page__head">
        <p className="note-page__kind">独立笔记</p>
        <h1>{title}</h1>
        <p className="note-page__meta">草稿自动保存到本地 · M4 替换为 TipTap 富文本编辑器</p>
      </div>
      <div className="note-format" aria-label="格式工具栏">
        <button disabled title="M4：加粗"><b>B</b></button>
        <button disabled title="M4：斜体"><i>I</i></button>
        <button disabled title="M4：列表"><IconList size={15} /></button>
        <button disabled title="M4：引用"><IconQuote size={15} /></button>
        <button disabled title="M4：超链接"><IconLink size={15} /></button>
      </div>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} aria-label="笔记正文" spellCheck={false} />
    </div>
  )
}

function EmptyDesk({ onOpenNote }: { onOpenNote: () => void }) {
  return (
    <div className="empty-desk">
      <IconBook size={26} />
      <h2>打开一本书或一篇笔记</h2>
      <p>在左侧双击书籍开始阅读，或从这里新建一篇独立笔记。</p>
      <button onClick={onOpenNote}><IconPlus size={14} />新建笔记</button>
    </div>
  )
}
