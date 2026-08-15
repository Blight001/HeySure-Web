export const CHAT_FLOAT_MARGIN = 16
export const CHAT_FLOAT_CONSTRAINTS = {
  minWidth: '320px',
  minHeight: '380px',
  maxWidth: '96vw',
  maxHeight: '92vh',
}

export type ChatResizeEdge = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'
export type ChatResizeState = {
  edge: ChatResizeEdge
  startX: number
  startY: number
  left: number
  top: number
  width: number
  height: number
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function applyChatFloatPosition(el: HTMLElement, socialRect?: DOMRect | null) {
  const bounds = socialRect && socialRect.width > 0 && socialRect.height > 0
    ? socialRect
    : new DOMRect(0, 0, window.innerWidth, window.innerHeight)
  const width = Math.min(420, Math.max(320, bounds.width - CHAT_FLOAT_MARGIN * 2))
  const height = Math.min(620, Math.max(380, bounds.height - CHAT_FLOAT_MARGIN * 2))
  el.style.width = `${width}px`
  el.style.height = `${height}px`
  el.style.left = `${Math.max(CHAT_FLOAT_MARGIN, bounds.right - width - CHAT_FLOAT_MARGIN)}px`
  el.style.top = `${Math.max(CHAT_FLOAT_MARGIN, bounds.bottom - height - CHAT_FLOAT_MARGIN)}px`
}

export function clampChatFloatIntoView(el: HTMLElement) {
  const rect = el.getBoundingClientRect()
  el.style.left = `${Math.min(Math.max(rect.left, CHAT_FLOAT_MARGIN), Math.max(CHAT_FLOAT_MARGIN, window.innerWidth - rect.width - CHAT_FLOAT_MARGIN))}px`
  el.style.top = `${Math.min(Math.max(rect.top, CHAT_FLOAT_MARGIN), Math.max(CHAT_FLOAT_MARGIN, window.innerHeight - rect.height - CHAT_FLOAT_MARGIN))}px`
}

export function applyChatDragMove(
  el: HTMLElement,
  event: PointerEvent,
  offset: { dx: number; dy: number },
) {
  const rect = el.getBoundingClientRect()
  el.style.left = `${Math.min(Math.max(event.clientX - offset.dx, CHAT_FLOAT_MARGIN), Math.max(CHAT_FLOAT_MARGIN, window.innerWidth - rect.width - CHAT_FLOAT_MARGIN))}px`
  el.style.top = `${Math.min(Math.max(event.clientY - offset.dy, CHAT_FLOAT_MARGIN), Math.max(CHAT_FLOAT_MARGIN, window.innerHeight - rect.height - CHAT_FLOAT_MARGIN))}px`
}

export function resetChatPanelGeometry(el: HTMLElement | null) {
  if (!el) return
  el.style.width = ''
  el.style.height = ''
  el.style.left = ''
  el.style.top = ''
}

export function isChatDragIgnored(target: EventTarget | null) {
  return !!(target as HTMLElement | null)?.closest?.('button, a, input, textarea, select, [data-chat-drag-ignore]')
}

export function applyChatResizeMove(el: HTMLElement, state: ChatResizeState, event: PointerEvent) {
  const dx = event.clientX - state.startX
  const dy = event.clientY - state.startY
  const startRight = state.left + state.width
  const startBottom = state.top + state.height
  const minWidth = Math.min(320, window.innerWidth - CHAT_FLOAT_MARGIN * 2)
  const minHeight = Math.min(380, window.innerHeight - CHAT_FLOAT_MARGIN * 2)
  const maxWidth = Math.max(minWidth, Math.min(window.innerWidth * 0.96, window.innerWidth - CHAT_FLOAT_MARGIN * 2))
  const maxHeight = Math.max(minHeight, Math.min(window.innerHeight * 0.92, window.innerHeight - CHAT_FLOAT_MARGIN * 2))
  let left = state.left
  let right = startRight
  let top = state.top
  let bottom = startBottom
  if (state.edge.includes('e')) {
    right = clampNumber(startRight + dx, state.left + minWidth, Math.min(window.innerWidth - CHAT_FLOAT_MARGIN, state.left + maxWidth))
  }
  if (state.edge.includes('w')) {
    left = clampNumber(state.left + dx, Math.max(CHAT_FLOAT_MARGIN, startRight - maxWidth), startRight - minWidth)
  }
  if (state.edge.includes('s')) {
    bottom = clampNumber(startBottom + dy, state.top + minHeight, Math.min(window.innerHeight - CHAT_FLOAT_MARGIN, state.top + maxHeight))
  }
  if (state.edge.includes('n')) {
    top = clampNumber(state.top + dy, Math.max(CHAT_FLOAT_MARGIN, startBottom - maxHeight), startBottom - minHeight)
  }
  el.style.left = `${left}px`
  el.style.top = `${top}px`
  el.style.width = `${right - left}px`
  el.style.height = `${bottom - top}px`
}

export async function requestChatPipWindow() {
  return (window as unknown as {
    documentPictureInPicture: { requestWindow(options: { width: number; height: number }): Promise<Window> }
  }).documentPictureInPicture.requestWindow({ width: 420, height: 640 })
}

export function syncStylesToPipDocument(pip: Window) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = pip.document.createElement('style')
      style.textContent = Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n')
      pip.document.head.appendChild(style)
    } catch {
      if (!sheet.href) continue
      const link = pip.document.createElement('link')
      link.rel = 'stylesheet'
      link.href = sheet.href
      pip.document.head.appendChild(link)
    }
  }
}

export function createPipHost(pip: Window) {
  pip.document.documentElement.className = document.documentElement.className
  pip.document.documentElement.style.height = '100%'
  pip.document.body.className = 'overflow-hidden bg-zinc-50 dark:bg-zinc-950'
  pip.document.body.style.height = '100%'
  pip.document.body.style.margin = '0'
  const host = pip.document.createElement('div')
  host.style.height = '100%'
  pip.document.body.appendChild(host)
  return host
}
