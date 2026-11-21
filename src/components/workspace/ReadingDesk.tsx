import type { WorkspaceTab } from '../../types/workspace'
import type { LibraryBridge } from '../../data/libraryBridge'
import type { AnnotationBridge } from '../../data/annotationBridge'
import type { Highlight } from '../../types/annotation'
import { ReaderPane, type ReaderFocus } from './ReaderPane'
import { NoteEditor } from './NoteEditor'
import { HighlightListPage, NoteListPage } from './AnnotationLists'
import { IconBook, IconHighlight, IconNote, IconPanel, IconPlus } from './icons'

interface Props {
  tabs: WorkspaceTab[]
  activeTabId: string | null
  rightVisible: boolean
  bridge: LibraryBridge
  annotations: AnnotationBridge
  bookTitle: (bookId: string) => string
  focusFor: (bookId: string) => ReaderFocus | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onNewNote: () => void
  onNewNoteForHighlight: (highlightId: string) => void
  onOpenNote: (noteId: string) => void
  onOpenSource: (highlight: Highlight) => void
  onFocusHighlight: (highlight: Highlight) => void
  onTitleChange: (noteId: string, title: string) => void
  /** 划线 / 笔记发生变化后重新计数（左栏的「我的划线 / 我的笔记」）。 */
  onAnnotationsChange?: () => void
  onToggleRight: () => void
}

/** 演示阅读页只属于内置的这本演示书；书库里的真实书籍走 ReaderPane。 */
const DEMO_BOOK_TAB_ID = 'book-biostatistics'

export function ReadingDesk(props: Props) {
  const activeTab = props.tabs.find((tab) => tab.id === props.activeTabId) ?? null
  const isRealBook = activeTab?.kind === 'book' && activeTab.id !== DEMO_BOOK_TAB_ID
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
                <TabIcon kind={tab.kind} />
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
            <button className="reader-tab-add" onClick={props.onNewNote} title="新建一篇笔记" aria-label="新建一篇笔记">
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

        <div className={`reader-body ${isRealBook ? 'is-reader' : ''}`}>
          {!activeTab ? (
            <EmptyDesk onNewNote={props.onNewNote} />
          ) : activeTab.kind === 'book' ? (
            activeTab.id === DEMO_BOOK_TAB_ID ? (
              <BookPage onOpenNote={() => props.onOpenNote(DEMO_NOTE_ID)} />
            ) : (
              <ReaderPane
                bookId={activeTab.id}
                title={activeTab.title}
                bridge={props.bridge}
                annotations={props.annotations}
                focusRequest={props.focusFor(activeTab.id)}
                onOpenNote={props.onOpenNote}
                {...(props.onAnnotationsChange ? { onAnnotationsChange: props.onAnnotationsChange } : {})}
              />
            )
          ) : activeTab.kind === 'note' ? (
            <NoteEditor
              noteId={activeTab.id}
              annotations={props.annotations}
              onOpenSource={props.onOpenSource}
              onTitleChange={(title) => props.onTitleChange(activeTab.id, title)}
            />
          ) : activeTab.kind === 'highlights' ? (
            <HighlightListPage
              annotations={props.annotations}
              bookTitle={props.bookTitle}
              onOpenSource={props.onOpenSource}
              onCreateNote={props.onNewNoteForHighlight}
            />
          ) : (
            <NoteListPage
              annotations={props.annotations}
              bookTitle={props.bookTitle}
              onOpenNote={props.onOpenNote}
              onFocusHighlight={props.onFocusHighlight}
            />
          )}
        </div>
      </div>
    </section>
  )
}

/** 演示书里那张卡片挂着的种子笔记（annotationBridge 的 demo 实现里有同一份数据）。 */
const DEMO_NOTE_ID = 'note-demo-rr'

function TabIcon({ kind }: { kind: WorkspaceTab['kind'] }) {
  if (kind === 'book') return <IconBook size={14} />
  if (kind === 'highlights') return <IconHighlight size={14} />
  return <IconNote size={14} />
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
        <button disabled title="这是演示排版，不是真实文件：真实 PDF / EPUB 请在左侧打开书库里的书"><IconHighlight size={14} />添加划线</button>
        <span aria-hidden="true">/</span>
        <button onClick={onOpenNote}><IconNote size={14} />写笔记</button>
      </div>

      <aside className="reader-note-card">
        <p className="reader-note-card__label"><IconNote size={14} />我的笔记</p>
        <p className="reader-note-card__title">为什么在罕见结局下，OR 会近似 RR？</p>
        <button className="reader-note-card__link" onClick={onOpenNote}>
          <IconNote size={13} />打开这篇笔记（示例数据）
        </button>
      </aside>

      <p className="reader-page__foot">
        演示阅读视图 · 真实书籍走 PDF.js / EPUB.js 渲染，这里的排版只用来展示笔记卡片的样子
      </p>
    </article>
  )
}

function EmptyDesk({ onNewNote }: { onNewNote: () => void }) {
  return (
    <div className="empty-desk">
      <IconBook size={26} />
      <h2>打开一本书或一篇笔记</h2>
      <p>在左侧双击书籍开始阅读；选中一句话就能划线、写笔记。也可以在「我的笔记」里找回之前写下的东西。</p>
      <button onClick={onNewNote}><IconPlus size={14} />新建笔记</button>
    </div>
  )
}
