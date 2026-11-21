import { useEffect, useRef, useState } from 'react'

interface Props {
  onInsert: (value: string) => void
  onClose: () => void
}

interface EmojiSelection {
  native?: string
}

const SYMBOL_GROUPS = {
  数学: ['±', '×', '÷', '≈', '≠', '≤', '≥', '∞', '∂', '∇', '∈', '∉', '⊂', '⊆', '∪', '∩', '∴', '∵'],
  希腊: ['α', 'β', 'γ', 'δ', 'ε', 'θ', 'λ', 'μ', 'π', 'ρ', 'σ', 'φ', 'ψ', 'ω', 'Γ', 'Δ', 'Θ', 'Λ', 'Σ', 'Φ', 'Ψ', 'Ω'],
  学术: ['→', '←', '↔', '⇒', '⇔', '°', '℃', 'Å', 'µ', '·', '•', '§', '¶', '†', '‡', '※', '✓', '✗'],
} as const

export function EmojiDialog({ onInsert, onClose }: Props) {
  const pickerHostRef = useRef<HTMLDivElement | null>(null)
  const [loading, setLoading] = useState(true)
  const [symbolGroup, setSymbolGroup] = useState<keyof typeof SYMBOL_GROUPS>('数学')

  useEffect(() => {
    let cancelled = false
    let picker: HTMLElement | null = null
    void Promise.all([
      import('emoji-mart'),
      import('@emoji-mart/data'),
      import('@emoji-mart/data/i18n/zh.json'),
    ]).then(([emojiMart, dataModule, i18nModule]) => {
      if (cancelled || !pickerHostRef.current) return
      picker = new emojiMart.Picker({
        data: dataModule.default,
        i18n: i18nModule.default,
        locale: 'zh',
        set: 'native',
        theme: 'light',
        dynamicWidth: true,
        autoFocus: true,
        previewPosition: 'none',
        onEmojiSelect: (emoji: EmojiSelection) => {
          if (emoji.native) onInsert(emoji.native)
        },
      }) as unknown as HTMLElement
      pickerHostRef.current.append(picker)
      setLoading(false)
    }).catch(() => setLoading(false))
    return () => {
      cancelled = true
      picker?.remove()
    }
  }, [onInsert])

  return (
    <div className="emoji-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="emoji-dialog" role="dialog" aria-modal="true" aria-label="Emoji 与特殊符号" onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}>
        <header>
          <div><strong>Emoji 与特殊符号</strong><small>以 Unicode 文本保存，可搜索并记录最近使用</small></div>
          <button onClick={onClose} aria-label="关闭 Emoji 面板">×</button>
        </header>
        <div className="emoji-dialog__picker">
          {loading && <p>正在加载离线 Emoji 数据…</p>}
          <div className="emoji-dialog__picker-mount" ref={pickerHostRef} />
        </div>
        <div className="emoji-dialog__symbol-tabs" role="tablist" aria-label="特殊符号分类">
          {(Object.keys(SYMBOL_GROUPS) as Array<keyof typeof SYMBOL_GROUPS>).map((group) => (
            <button key={group} role="tab" aria-selected={group === symbolGroup} className={group === symbolGroup ? 'is-on' : ''} onClick={() => setSymbolGroup(group)}>{group}</button>
          ))}
        </div>
        <div className="emoji-dialog__symbols" aria-label={`${symbolGroup}符号`}>
          {SYMBOL_GROUPS[symbolGroup].map((symbol) => <button key={symbol} onClick={() => onInsert(symbol)}>{symbol}</button>)}
        </div>
      </section>
    </div>
  )
}
