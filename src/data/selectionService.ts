import type { TextSelectionAnchor } from '../types/annotation'
import type { ReaderFormat } from '../types/reader'
import { researchSearchUrl, translationUrl, type ResearchRequest } from './selectionActions'

export type SelectionSource = 'pdf' | 'epub' | 'note'
export type SharedSelectionAction = 'copy' | 'translate' | 'search'

export interface UnifiedSelection {
  text: string
  source: SelectionSource
  sourceId: string
  prefix: string | null
  suffix: string | null
  page: number | null
  cfi: string | null
  editorRange: { from: number; to: number } | null
  anchor: { x: number; y: number }
  actions: SharedSelectionAction[]
}

export interface SelectionActionEnvironment {
  copyText: (text: string) => Promise<void>
  openResearch: (request: ResearchRequest) => void
}

export function adaptReaderSelection(
  bookId: string,
  format: ReaderFormat,
  selection: TextSelectionAnchor,
): UnifiedSelection {
  return {
    text: selection.quote,
    source: format,
    sourceId: bookId,
    prefix: selection.prefix,
    suffix: selection.suffix,
    page: selection.page,
    cfi: selection.cfi,
    editorRange: null,
    anchor: selection.anchor,
    actions: ['copy', 'translate', 'search'],
  }
}

export function adaptNoteSelection(
  noteId: string,
  text: string,
  anchor: { x: number; y: number },
  editorRange: { from: number; to: number },
): UnifiedSelection {
  return {
    text: text.trim().slice(0, 2000),
    source: 'note',
    sourceId: noteId,
    prefix: null,
    suffix: null,
    page: null,
    cfi: null,
    editorRange,
    anchor,
    actions: ['copy', 'translate', 'search'],
  }
}

export async function executeSelectionAction(
  action: SharedSelectionAction,
  selection: UnifiedSelection,
  environment: SelectionActionEnvironment,
): Promise<void> {
  if (!selection.actions.includes(action)) throw new Error(`选区不支持 ${action} 操作`)
  if (action === 'copy') {
    await environment.copyText(selection.text)
    return
  }
  environment.openResearch({
    url: action === 'translate' ? translationUrl(selection.text) : researchSearchUrl(selection.text),
    newTab: true,
  })
}
