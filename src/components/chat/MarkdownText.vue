<script setup lang="ts">
import { computed } from 'vue'
import { stripMarkdownFormatting } from '@/utils/chatMarkdown'

const props = defineProps<{
  text: string
  plainTextMode?: boolean
  mentionTokens?: Array<{ token: string; type: 'mcp' | 'file' | 'skill'; detail?: string }>
}>()

const escapeHtml = (raw: string) => String(raw || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const escapeRegExp = (raw: string) => raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const highlightMentions = (html: string) => {
  const mentions = [...(props.mentionTokens || [])]
    .filter(item => item.token)
    .sort((a, b) => b.token.length - a.token.length)
  return mentions.reduce((result, mention) => {
    const escapedToken = escapeHtml(mention.token)
    const visibleLabel = escapedToken.startsWith('@') ? escapedToken.slice(1) : escapedToken
    const title = escapeHtml(mention.detail || '')
        const type = mention.type === 'file' ? 'file' : mention.type === 'skill' ? 'skill' : 'mcp'
        const className = mention.type === 'mcp'
          ? 'md-mention md-mention-mcp'
          : mention.type === 'skill' ? 'md-mention md-mention-skill' : 'md-mention md-mention-file'
    return result.replace(
      new RegExp(`${escapeRegExp(escapedToken)}(?![\\w.+/\\-])`, 'g'),
      `<span class="${className}" data-mention-label="${visibleLabel}" data-mention-type="${type}" data-mention-detail="${title}">${visibleLabel}</span>`,
    )
  }, html)
}

const renderInline = (raw: string) => {
  let text = escapeHtml(raw)
  text = text.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>')
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  return highlightMentions(text)
}

const isTableSeparator = (line: string) => {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
}

const splitTableRow = (line: string) => {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim())
}

const renderTable = (lines: string[], start: number) => {
  const header = splitTableRow(lines[start])
  const rows: string[][] = []
  let idx = start + 2
  while (idx < lines.length && /^\s*\|/.test(lines[idx] || '')) {
    rows.push(splitTableRow(lines[idx]))
    idx += 1
  }

  const headHtml = header.map(cell => `<th>${renderInline(cell)}</th>`).join('')
  const bodyHtml = rows
    .map(row => `<tr>${row.map(cell => `<td>${renderInline(cell)}</td>`).join('')}</tr>`)
    .join('')
  return {
    html: `<div class="md-table-wrap"><table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`,
    next: idx,
  }
}

const renderList = (lines: string[], start: number) => {
  const ordered = /^\s*\d+\.\s+/.test(lines[start])
  const tag = ordered ? 'ol' : 'ul'
  const rows: string[] = []
  let idx = start
  const pattern = ordered ? /^\s*\d+\.\s+(.+)$/ : /^\s*[-+*]\s+(.+)$/
  while (idx < lines.length) {
    const match = lines[idx].match(pattern)
    if (!match) break
    rows.push(`<li>${renderInline(match[1] || '')}</li>`)
    idx += 1
  }
  return { html: `<${tag} class="md-list">${rows.join('')}</${tag}>`, next: idx }
}

const renderBlocks = (raw: string) => {
  const text = String(raw || '').replace(/\r\n?/g, '\n').trim()
  if (!text) return ''

  const lines = text.split('\n')
  const html: string[] = []
  let idx = 0

  while (idx < lines.length) {
    const line = lines[idx]
    const trimmed = line.trim()

    if (!trimmed) {
      idx += 1
      continue
    }

    const fence = trimmed.match(/^```(\w+)?\s*$/)
    if (fence) {
      const codeLines: string[] = []
      idx += 1
      while (idx < lines.length && !/^```\s*$/.test(lines[idx].trim())) {
        codeLines.push(lines[idx])
        idx += 1
      }
      if (idx < lines.length) idx += 1
      const lang = (fence[1] || '').trim()
      html.push(`<pre class="md-code" data-lang="${lang}"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
      continue
    }

    if (/^---+\s*$/.test(trimmed)) {
      html.push('<hr class="md-hr">')
      idx += 1
      continue
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      const level = Math.min(6, heading[1].length)
      const tag = `h${level}`
      html.push(`<${tag} class="md-heading md-heading-${Math.min(3, level)}">${renderInline(heading[2])}</${tag}>`)
      idx += 1
      continue
    }

    if (
      idx + 1 < lines.length
      && /^\s*\|/.test(line)
      && isTableSeparator(lines[idx + 1])
    ) {
      const table = renderTable(lines, idx)
      html.push(table.html)
      idx = table.next
      continue
    }

    if (/^\s*(?:[-+*]|\d+\.)\s+/.test(line)) {
      const list = renderList(lines, idx)
      html.push(list.html)
      idx = list.next
      continue
    }

    // Blockquote (modern docs style: > ...)
    if (/^\s*>\s?/.test(line)) {
      const qLines: string[] = []
      let j = idx
      while (j < lines.length) {
        const l = lines[j]
        const m = l.match(/^\s*>\s?(.*)$/)
        if (m) {
          qLines.push(m[1] || '')
          j++
        } else if (!l.trim()) {
          break
        } else {
          break
        }
      }
      const qHtml = qLines.map(l => renderInline(l)).join('<br>')
      html.push(`<blockquote class="md-blockquote">${qHtml}</blockquote>`)
      idx = j
      continue
    }

    const paragraph: string[] = [line]
    idx += 1
    while (idx < lines.length) {
      const next = lines[idx]
      const nextTrimmed = next.trim()
      if (
        !nextTrimmed
        || /^```/.test(nextTrimmed)
        || /^#{1,6}\s+/.test(nextTrimmed)
        || /^---+\s*$/.test(nextTrimmed)
        || /^\s*(?:[-+*]|\d+\.)\s+/.test(next)
        || /^\s*>\s?/.test(next)
        || (idx + 1 < lines.length && /^\s*\|/.test(next) && isTableSeparator(lines[idx + 1]))
      ) {
        break
      }
      paragraph.push(next)
      idx += 1
    }
    html.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`)
  }

  return html.join('')
}

const renderedHtml = computed(() => renderBlocks(props.text))
const plainTextContent = computed(() => stripMarkdownFormatting(props.text))
const plainRenderedHtml = computed(() => highlightMentions(escapeHtml(plainTextContent.value)).replace(/\n/g, '<br>'))
</script>

<template>
  <div v-if="!props.plainTextMode" class="markdown-text" v-html="renderedHtml"></div>
  <div v-else class="markdown-text markdown-text-plain" v-html="plainRenderedHtml"></div>
</template>

<style scoped>
.markdown-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-width: 100%;
  gap: 0.48rem;
  line-height: 1.62;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.markdown-text-plain {
  display: block;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Paragraphs - modern readable spacing */
.markdown-text :deep(p) {
  max-width: 100%;
  margin: 0;
  line-height: 1.65;
}

.markdown-text :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-text :deep(strong) {
  font-weight: 700;
  color: inherit;
}

.markdown-text :deep(em) {
  font-style: italic;
}

/* Modern headings: larger, colored, good rhythm + accent */
.markdown-text :deep(.md-heading),
.markdown-text :deep(h1),
.markdown-text :deep(h2),
.markdown-text :deep(h3),
.markdown-text :deep(h4),
.markdown-text :deep(h5),
.markdown-text :deep(h6) {
  margin: 0.55rem 0 0.1rem;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: rgb(63 66 243); /* indigo-600 */
}

.dark .markdown-text :deep(.md-heading),
.dark .markdown-text :deep(h1),
.dark .markdown-text :deep(h2),
.dark .markdown-text :deep(h3),
.dark .markdown-text :deep(h4),
.dark .markdown-text :deep(h5),
.dark .markdown-text :deep(h6) {
  color: rgb(129 140 248); /* indigo-400 */
}

.markdown-text :deep(.md-heading-1),
.markdown-text :deep(h1) {
  font-size: 1.35rem;
  margin-top: 0.2rem;
}

.markdown-text :deep(.md-heading-2),
.markdown-text :deep(h2) {
  font-size: 1.15rem;
  border-bottom: 1px solid rgba(99, 102, 241, 0.15);
  padding-bottom: 0.2rem;
}

.dark .markdown-text :deep(.md-heading-2),
.dark .markdown-text :deep(h2) {
  border-bottom-color: rgba(129, 140, 248, 0.2);
}

.markdown-text :deep(.md-heading-3),
.markdown-text :deep(h3) {
  font-size: 1.02rem;
  color: rgb(79 70 229); /* indigo-700 */
}

.dark .markdown-text :deep(.md-heading-3),
.dark .markdown-text :deep(h3) {
  color: rgb(165 243 252);
}

/* Smaller headings */
.markdown-text :deep(h4),
.markdown-text :deep(h5),
.markdown-text :deep(h6) {
  font-size: 0.95rem;
  color: inherit;
  opacity: 0.95;
}

/* Horizontal rule */
.markdown-text :deep(.md-hr) {
  margin: 0.9rem 0;
  border: 0;
  border-top: 1px solid rgba(148, 163, 184, 0.25);
}

/* Tables - clean modern look */
.markdown-text :deep(.md-table-wrap) {
  max-width: 100%;
  overflow: hidden;
  margin: 0.25rem 0;
  border-radius: 0.5rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.dark .markdown-text :deep(.md-table-wrap) {
  border-color: rgba(63, 63, 70, 0.5);
}

.markdown-text :deep(table) {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 0.78rem;
  background: white;
}

.dark .markdown-text :deep(table) {
  background: rgba(24, 24, 27, 0.6);
}

.markdown-text :deep(th),
.markdown-text :deep(td) {
  padding: 0.45rem 0.65rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  text-align: left;
  vertical-align: top;
  line-height: 1.4;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.dark .markdown-text :deep(th),
.dark .markdown-text :deep(td) {
  border-color: rgba(63, 63, 70, 0.55);
}

.markdown-text :deep(th) {
  background: linear-gradient(to bottom, rgba(99, 102, 241, 0.12), rgba(99, 102, 241, 0.05));
  font-weight: 700;
  color: rgb(63 66 243);
}

.dark .markdown-text :deep(th) {
  background: rgba(129, 140, 248, 0.12);
  color: rgb(165 243 252);
}

/* Zebra rows for readability */
.markdown-text :deep(tbody tr:nth-child(even)) {
  background: rgba(241, 245, 249, 0.5);
}

.dark .markdown-text :deep(tbody tr:nth-child(even)) {
  background: rgba(39, 39, 42, 0.45);
}

/* Modern code blocks - dark surface, good contrast, rounded */
.markdown-text :deep(.md-code) {
  max-width: 100%;
  overflow-x: hidden;
  margin: 0.35rem 0;
  padding: 0.85rem 1rem;
  border-radius: 0.65rem;
  background: #0b0f19;
  border: 1px solid rgba(63, 63, 70, 0.6);
  color: #e2e8f0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  font-size: 0.78rem;
  line-height: 1.55;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
}

.dark .markdown-text :deep(.md-code) {
  background: #0b0f19;
  border-color: rgba(63, 63, 70, 0.8);
}

/* Inline code - subtle pill with color */
.markdown-text :deep(.md-inline-code) {
  padding: 0.08rem 0.35rem;
  border-radius: 0.3rem;
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.2);
  font-size: 0.88em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  color: rgb(63 66 243);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.markdown-text :deep(.md-mention) {
  display: inline;
  font-weight: 650;
  white-space: nowrap;
}

.markdown-text :deep(.md-mention-mcp) {
  color: rgb(5 150 105);
}

.markdown-text :deep(.md-mention-file) {
  color: rgb(2 132 199);
}

.markdown-text :deep(.md-mention-skill) {
  color: rgb(124 58 237);
}

.dark .markdown-text :deep(.md-mention-mcp) {
  color: rgb(110 231 183);
}

.dark .markdown-text :deep(.md-mention-file) {
  color: rgb(125 211 252);
}

.dark .markdown-text :deep(.md-mention-skill) {
  color: rgb(196 181 253);
}

.dark .markdown-text :deep(.md-inline-code) {
  background: rgba(129, 140, 248, 0.15);
  border-color: rgba(129, 140, 248, 0.25);
  color: rgb(165 243 252);
}

/* Lists */
.markdown-text :deep(.md-list) {
  margin: 0.1rem 0 0.25rem;
  padding-left: 1.35rem;
}

.markdown-text :deep(li) {
  margin: 0.2rem 0;
  line-height: 1.6;
}

/* Blockquote - modern accent bar + soft background (color annotation) */
.markdown-text :deep(.md-blockquote) {
  margin: 0.6rem 0;
  padding: 0.55rem 0.85rem 0.55rem 0.95rem;
  border-left: 3.5px solid rgb(99 102 241);
  background: linear-gradient(to right, rgba(99, 102, 241, 0.07), transparent);
  border-radius: 0 0.4rem 0.4rem 0;
  color: inherit;
  font-size: 0.95em;
  line-height: 1.65;
}

.dark .markdown-text :deep(.md-blockquote) {
  background: linear-gradient(to right, rgba(129, 140, 248, 0.1), transparent 70%);
  border-left-color: rgb(129 140 248);
}
</style>
