import { ref } from 'vue'
import type { ChatMentionType } from '@/utils/chatMentions'

export interface ChatMentionTooltipState {
  open: boolean
  label: string
  detail: string
  type: ChatMentionType
  x: number
  y: number
  placement: 'above' | 'below'
  width: number
  maxHeight: number
}

const EMPTY_TOOLTIP: ChatMentionTooltipState = {
  open: false,
  label: '',
  detail: '',
  type: 'mcp',
  x: 0,
  y: 0,
  placement: 'above',
  width: 360,
  maxHeight: 320,
}

const mentionTypeFromDataset = (value: string | undefined): ChatMentionType => {
  if (value === 'file') return 'file'
  if (value === 'skill') return 'skill'
  return 'mcp'
}

const fitTooltipHeightToWholeLines = (availableHeight: number, hasScrollHint: boolean) => {
  const cappedHeight = availableHeight
  // Header, body padding, border and optional 24px hint; body text uses a fixed 16px line-height.
  const fixedHeight = 54 + (hasScrollHint ? 24 : 0)
  const lineHeight = 16
  if (cappedHeight <= fixedHeight + lineHeight) return Math.max(1, cappedHeight)
  return fixedHeight + Math.floor((cappedHeight - fixedHeight) / lineHeight) * lineHeight
}

export const useChatMentionTooltip = () => {
  const mentionTooltip = ref<ChatMentionTooltipState>({ ...EMPTY_TOOLTIP })
  let hideTimer: ReturnType<typeof setTimeout> | null = null

  const keepMentionTooltip = () => {
    if (hideTimer !== null) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
  }

  const showMentionTooltip = (event: PointerEvent) => {
    keepMentionTooltip()
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-mention-detail]')
    if (!target) return
    const detail = String(target.dataset.mentionDetail || '').trim()
    if (!detail) return
    const rect = target.getBoundingClientRect()
    const view = target.ownerDocument.defaultView || window
    const viewportWidth = view.innerWidth
    const availableAbove = Math.max(0, rect.top - 12)
    const availableBelow = Math.max(0, view.innerHeight - rect.bottom - 12)
    const placement = availableAbove >= availableBelow ? 'above' : 'below'
    const availableHeight = placement === 'above' ? availableAbove : availableBelow
    const tooltipWidth = Math.min(target.dataset.mentionType === 'file' ? 520 : 440, Math.max(1, viewportWidth - 24))
    const tooltipHalfWidth = tooltipWidth / 2
    mentionTooltip.value = {
      open: true,
      label: String(target.dataset.mentionLabel || target.textContent || '').trim(),
      detail,
      type: mentionTypeFromDataset(target.dataset.mentionType),
      x: Math.max(12 + tooltipHalfWidth, Math.min(viewportWidth - 12 - tooltipHalfWidth, rect.left + rect.width / 2)),
      y: placement === 'above' ? rect.top - 8 : rect.bottom + 8,
      placement,
      width: tooltipWidth,
      maxHeight: fitTooltipHeightToWholeLines(availableHeight, detail.length > 320),
    }
  }

  const hideMentionTooltip = (event?: PointerEvent) => {
    const next = event?.relatedTarget as Node | null
    const current = (event?.target as HTMLElement | null)?.closest<HTMLElement>('[data-mention-detail]')
    if (current && next && current.contains(next)) return
    keepMentionTooltip()
    hideTimer = setTimeout(() => {
      mentionTooltip.value = { ...EMPTY_TOOLTIP }
      hideTimer = null
    }, 140)
  }

  return { mentionTooltip, showMentionTooltip, hideMentionTooltip, keepMentionTooltip }
}
