import { IconExternal, IconGlobe, IconSearch } from './icons'

const RESEARCH_TOPIC = 'OR 与 RR 的区别'
const RESEARCH_QUERY = `https://www.bing.com/search?q=${encodeURIComponent(RESEARCH_TOPIC + ' 流行病学')}`

function openExternally(url: string) {
  if (window.shiyunDesktop) {
    void window.shiyunDesktop.openExternal(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function ResearchSidebar() {
  return (
    <aside className="research-sidebar" aria-label="网页搜索">
      <p className="research-sidebar__title"><IconGlobe size={16} />网页搜索</p>

      <div className="research-input">
        <input disabled placeholder="搜索关键词或输入网址" aria-label="网页搜索（M6 里程碑接入）" />
        <button disabled title="M6 里程碑：接入 WebContentsView 后可用" aria-label="搜索">
          <IconSearch size={15} />
        </button>
      </div>

      <div className="research-card">
        <h3>研究资料</h3>
        <p>{RESEARCH_TOPIC}</p>
      </div>

      <div className="research-rule" />

      <p className="research-copy">可打开搜索引擎、教学网站、AI 网页及其他在线资料。</p>
      <p className="research-copy research-copy--muted">
        内置浏览器将在 M6 里程碑接入（Electron WebContentsView）。在此之前，此区域不会加载任何第三方网页，也不会把本地知识库暴露给网络。
      </p>

      <div className="research-footer">
        <button onClick={() => openExternally(RESEARCH_QUERY)} title="在系统默认浏览器中搜索当前主题">
          <IconExternal size={14} />外部浏览器打开
        </button>
      </div>
    </aside>
  )
}
