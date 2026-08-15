import { activeChatMentions, mentionToken, type ChatMention } from '@/utils/chatMentions'
import type { MentionCandidate } from '@/utils/chatInputMentions'

export const createMentionElement = (document: Document, mention: ChatMention) => {
  const element = document.createElement('span')
  element.contentEditable = 'false'
  element.dataset.mentionToken = mentionToken(mention)
  element.dataset.mentionLabel = mention.label
  element.dataset.mentionType = mention.type
  element.dataset.mentionDetail = mention.type === 'mcp'
    ? `${mention.reference}\n${mention.detail}`
    : mention.detail
  element.className = mention.type === 'mcp'
    ? 'chat-input-mention chat-input-mention-mcp'
    : 'chat-input-mention chat-input-mention-file'
  element.textContent = mention.label
  return element
}

export const mentionFromCandidate = (candidate: MentionCandidate): ChatMention => ({
  type: candidate.type === 'tool' ? 'mcp' : 'file',
  label: candidate.label,
  reference: candidate.type === 'tool' ? candidate.label : candidate.detail,
  detail: candidate.detail,
})

export const renderEditorValue = (
  editor: HTMLDivElement | null,
  value: string,
  mentions: ChatMention[],
) => {
  if (!editor) return
  const document = editor.ownerDocument
  const occurrences = activeChatMentions(value, mentions)
    .map(mention => ({ mention, index: value.indexOf(mentionToken(mention)) }))
    .filter(item => item.index >= 0)
    .sort((left, right) => left.index - right.index)
  editor.replaceChildren()
  let offset = 0
  for (const item of occurrences) {
    if (item.index > offset) editor.append(document.createTextNode(value.slice(offset, item.index)))
    editor.append(createMentionElement(document, item.mention))
    offset = item.index + mentionToken(item.mention).length
  }
  if (offset < value.length) editor.append(document.createTextNode(value.slice(offset)))
}

const serializeNode = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
  if (!(node instanceof HTMLElement)) return ''
  const mention = node.dataset.mentionToken
  if (mention) return mention
  if (node.tagName === 'BR') return '\n'
  const body = Array.from(node.childNodes).map(serializeNode).join('')
  return ['DIV', 'P'].includes(node.tagName) ? `${body}\n` : body
}

export const serializeEditor = (root: HTMLDivElement | null) => {
  if (!root) return ''
  return Array.from(root.childNodes).map(serializeNode).join('').replace(/\n$/, '')
}

export const findTypedMentionRange = (root: HTMLDivElement | null) => {
  if (!root) return null
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null = walker.nextNode()
  let resolved: Range | null = null
  while (node) {
    const text = String(node.textContent || '')
    const match = text.match(/(^|\s)@([^\s@]*)$/)
    if (match) {
      const queryLength = String(match[2] || '').length
      const range = root.ownerDocument.createRange()
      range.setStart(node, text.length - queryLength - 1)
      range.setEnd(node, text.length)
      resolved = range
    }
    node = walker.nextNode()
  }
  return resolved
}

const resolveCaretTextNode = (root: HTMLDivElement, range: Range) => {
  let node: Node = range.startContainer
  let offset = range.startOffset
  if (node.nodeType === Node.ELEMENT_NODE && offset > 0) {
    const previous = node.childNodes[offset - 1]
    if (previous?.nodeType === Node.TEXT_NODE) {
      node = previous
      offset = String(previous.textContent || '').length
    }
  }
  if (node.nodeType !== Node.TEXT_NODE || !root.contains(node)) return null
  return { node, offset }
}

export const mentionRangeFromSelection = (root: HTMLDivElement | null) => {
  const selection = root?.ownerDocument.getSelection()
  if (!root || !selection?.rangeCount || !selection.isCollapsed) return null
  const caret = resolveCaretTextNode(root, selection.getRangeAt(0))
  if (!caret) return null
  const before = String(caret.node.textContent || '').slice(0, caret.offset)
  const match = before.match(/(^|\s)@([^\s@]*)$/)
  if (!match) return null
  const query = String(match[2] || '')
  const tokenRange = root.ownerDocument.createRange()
  tokenRange.setStart(caret.node, caret.offset - query.length - 1)
  tokenRange.setEnd(caret.node, caret.offset)
  return { query: query.toLowerCase(), range: tokenRange }
}

export const insertMentionAtRange = (document: Document, range: Range, mention: ChatMention) => {
  const element = createMentionElement(document, mention)
  const spacer = document.createTextNode(' ')
  range.deleteContents()
  range.insertNode(spacer)
  range.insertNode(element)
  const selection = document.getSelection()
  const caret = document.createRange()
  caret.setStartAfter(spacer)
  caret.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(caret)
}

export const editorMentionTokens = (root: HTMLDivElement | null) =>
  Array.from(root?.querySelectorAll<HTMLElement>('[data-mention-token]') || [])
    .map(element => String(element.dataset.mentionToken || ''))

export const expectedMentionTokens = (value: string, mentions: ChatMention[]) =>
  activeChatMentions(value, mentions).map(mentionToken)
