import type { ViewMode } from '../../types/galaxy'

export function TopBar({ mode, paused, onMode, onReset, onPause, onEnterWorkspace }: { mode: ViewMode; paused: boolean; onMode: (mode: ViewMode) => void; onReset: () => void; onPause: () => void; onEnterWorkspace: () => void }) {
  return (
    <header className="top-bar">
      <div className="brand-block">
        <div className="brand-mark"><span /></div>
        <div><h1>诗云 <b>SHIYUN</b></h1><p>在知识的宇宙中，寻找自己的星辰</p></div>
      </div>
      <nav className="mode-switch" aria-label="显示模式">
        <button className={mode === 'universe' ? 'active' : ''} onClick={() => onMode('universe')}>宇宙</button>
        <button className={mode === 'knowledge' ? 'active' : ''} onClick={() => onMode('knowledge')}>知识</button>
        <button className={mode === 'focus' ? 'active' : ''} onClick={() => onMode('focus')}>聚焦</button>
      </nav>
      <div className="view-actions">
        <button onClick={onPause} title={paused ? '恢复动态效果' : '暂停动态效果'}>{paused ? '▶' : 'Ⅱ'}<span>{paused ? '恢复' : '暂停'}</span></button>
        <button onClick={onReset} title="回到银河全景">◎<span>全景</span></button>
        <button className="workspace-entry-button" onClick={onEnterWorkspace} title="进入浅色学习书房">▤<span>进入书房</span></button>
      </div>
    </header>
  )
}
