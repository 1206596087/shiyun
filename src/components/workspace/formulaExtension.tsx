/* oxlint-disable react/only-export-components -- TipTap extensions must export Node definitions beside their node view. */
import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { useEffect, useRef } from 'react'
import type { FormulaKind } from './FormulaDialog'

export const FORMULA_EDIT_EVENT = 'shiyun-formula-edit'

export interface FormulaEditRequest {
  pos: number
  latex: string
  formulaKind: FormulaKind
  displayMode: boolean
}

interface FormulaAttributes {
  latex: string
  formulaKind: FormulaKind
}

function FormulaNodeView({ node, getPos, selected }: NodeViewProps) {
  const attributes = node.attrs as FormulaAttributes
  const displayMode = node.type.name === 'formulaBlock'
  const hostRef = useRef<HTMLSpanElement | null>(null)

  const requestEdit = () => {
    const pos = getPos()
    if (typeof pos !== 'number') return
    window.dispatchEvent(new CustomEvent<FormulaEditRequest>(FORMULA_EDIT_EVENT, {
      detail: { pos, latex: attributes.latex, formulaKind: attributes.formulaKind, displayMode },
    }))
  }

  useEffect(() => {
    let cancelled = false
    const render = async () => {
      const [katexModule] = await Promise.all([
        import('katex'),
        import('katex/dist/katex.min.css'),
      ])
      if (attributes.formulaKind === 'chemistry') await import('katex/contrib/mhchem')
      if (cancelled || !hostRef.current) return
      katexModule.default.render(attributes.latex || '\\square', hostRef.current, {
        displayMode,
        throwOnError: false,
        strict: 'warn',
        trust: false,
        output: 'htmlAndMathml',
      })
    }
    void render().catch(() => {
      if (hostRef.current) hostRef.current.textContent = attributes.latex || '空公式'
    })
    return () => { cancelled = true }
  }, [attributes.formulaKind, attributes.latex, displayMode])

  const content = (
    <>
      <span ref={hostRef} className="note-formula__render" />
      <button
        type="button"
        className="note-formula__edit"
        aria-label="编辑公式"
        title="编辑公式"
        onClick={requestEdit}
      >编辑</button>
    </>
  )

  return displayMode ? (
    <NodeViewWrapper
      as="div"
      className={`note-formula note-formula--block ${selected ? 'is-selected' : ''}`}
      data-formula-kind={attributes.formulaKind}
      onDoubleClick={requestEdit}
    >
      {content}
    </NodeViewWrapper>
  ) : (
    <NodeViewWrapper
      as="span"
      className={`note-formula note-formula--inline ${selected ? 'is-selected' : ''}`}
      data-formula-kind={attributes.formulaKind}
      onDoubleClick={requestEdit}
    >
      {content}
    </NodeViewWrapper>
  )
}

const formulaAttributes = {
  latex: {
    default: '',
    parseHTML: (element: HTMLElement) => element.getAttribute('data-latex') ?? '',
    renderHTML: (attributes: Record<string, unknown>) => ({ 'data-latex': String(attributes.latex ?? '') }),
  },
  formulaKind: {
    default: 'math',
    parseHTML: (element: HTMLElement) => element.getAttribute('data-formula-kind') === 'chemistry' ? 'chemistry' : 'math',
    renderHTML: (attributes: Record<string, unknown>) => ({
      'data-formula-kind': attributes.formulaKind === 'chemistry' ? 'chemistry' : 'math',
    }),
  },
}

export const FormulaInline = Node.create({
  name: 'formulaInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => formulaAttributes,
  parseHTML: () => [{ tag: 'span[data-formula-inline]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-formula-inline': '' })],
  addNodeView: () => ReactNodeViewRenderer(FormulaNodeView),
})

export const FormulaBlock = Node.create({
  name: 'formulaBlock',
  group: 'block',
  atom: true,
  selectable: true,
  defining: true,
  addAttributes: () => formulaAttributes,
  parseHTML: () => [{ tag: 'div[data-formula-block]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-formula-block': '' })],
  addNodeView: () => ReactNodeViewRenderer(FormulaNodeView),
})
