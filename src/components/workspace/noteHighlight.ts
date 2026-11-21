import { Mark, mergeAttributes } from '@tiptap/core'

export const NoteHighlight = Mark.create({
  name: 'selectionHighlight',
  addAttributes() {
    return { color: { default: 'gold', parseHTML: (element) => element.dataset.color || 'gold' } }
  },
  parseHTML() { return [{ tag: 'mark[data-color]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes(HTMLAttributes, { 'data-color': HTMLAttributes.color }), 0]
  },
})
