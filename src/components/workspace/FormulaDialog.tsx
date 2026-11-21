import { useEffect, useRef, useState } from 'react'

export type FormulaKind = 'math' | 'chemistry'

interface Props {
  initialLatex?: string
  initialKind?: FormulaKind
  displayMode: boolean
  onSave: (latex: string, kind: FormulaKind) => void
  onClose: () => void
}

type MathFieldLike = HTMLElement & {
  value: string
  mathVirtualKeyboardPolicy: 'auto' | 'manual' | 'sandboxed'
  executeCommand: (command: [string, string]) => void
}

const SYMBOLS = [
  ['分式', '\\frac{a}{b}'],
  ['根号', '\\sqrt{x}'],
  ['积分', '\\int_{a}^{b} f(x)\\,dx'],
  ['求和', '\\sum_{i=1}^{n} x_i'],
  ['极限', '\\lim_{x\\to 0}'],
  ['矩阵', '\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}'],
  ['偏导', '\\frac{\\partial f}{\\partial x}'],
  ['希腊字母', '\\alpha+\\beta+\\gamma'],
] as const

function normalizeFormula(latex: string, kind: FormulaKind): string {
  const trimmed = latex.trim()
  if (kind === 'chemistry' && trimmed && !trimmed.startsWith('\\ce{')) return `\\ce{${trimmed}}`
  return trimmed
}

export function FormulaDialog({ initialLatex = '', initialKind = 'math', displayMode, onSave, onClose }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const fieldRef = useRef<MathFieldLike | null>(null)
  const [latex, setLatex] = useState(initialLatex)
  const [kind, setKind] = useState<FormulaKind>(initialKind)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    let field: MathFieldLike | null = null
    let handleInput: (() => void) | null = null
    void import('mathlive').then(({ MathfieldElement }) => {
      if (cancelled || !hostRef.current) return
      field = new MathfieldElement() as unknown as MathFieldLike
      field.value = initialLatex
      field.mathVirtualKeyboardPolicy = 'auto'
      field.setAttribute('aria-label', 'LaTeX 公式输入')
      handleInput = () => setLatex(field?.value ?? '')
      field.addEventListener('input', handleInput)
      hostRef.current.append(field)
      fieldRef.current = field
      setLoading(false)
      window.setTimeout(() => field?.focus(), 0)
    }).catch(() => setLoading(false))
    return () => {
      cancelled = true
      if (field && handleInput) field.removeEventListener('input', handleInput)
      field?.remove()
      fieldRef.current = null
    }
  }, [initialLatex])

  const insertSymbol = (value: string) => {
    const field = fieldRef.current
    if (!field) return
    field.executeCommand(['insert', value])
    setLatex(field.value)
    field.focus()
  }

  return (
    <div className="formula-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="formula-dialog" role="dialog" aria-modal="true" aria-label="公式编辑器" onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}>
        <header>
          <div>
            <strong>{displayMode ? '块级公式' : '行内公式'}</strong>
            <small>LaTeX 是持久化源数据</small>
          </div>
          <button onClick={onClose} aria-label="关闭公式编辑器">×</button>
        </header>
        <div className="formula-dialog__kind" role="group" aria-label="公式类型">
          <button className={kind === 'math' ? 'is-on' : ''} onClick={() => setKind('math')}>数学 / 物理</button>
          <button className={kind === 'chemistry' ? 'is-on' : ''} onClick={() => setKind('chemistry')}>化学方程式</button>
        </div>
        <div className="formula-dialog__field">
          {loading && <p>正在加载可视化公式键盘…</p>}
          <div className="formula-dialog__field-mount" ref={hostRef} />
        </div>
        <div className="formula-dialog__symbols" aria-label="常用数学符号">
          {SYMBOLS.map(([label, value]) => <button key={label} onClick={() => insertSymbol(value)}>{label}</button>)}
        </div>
        <label className="formula-dialog__source">
          <span>LaTeX 源码</span>
          <textarea value={latex} onChange={(event) => {
            setLatex(event.target.value)
            if (fieldRef.current) fieldRef.current.value = event.target.value
          }} />
        </label>
        <footer>
          <button onClick={() => void navigator.clipboard.writeText(normalizeFormula(latex, kind))}>复制 LaTeX</button>
          <span />
          <button onClick={onClose}>取消</button>
          <button className="is-primary" disabled={!latex.trim()} onClick={() => onSave(normalizeFormula(latex, kind), kind)}>保存公式</button>
        </footer>
      </section>
    </div>
  )
}
