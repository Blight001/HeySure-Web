import type { RcInput, RcMode } from '@/composables/useRemoteControl'

const MODIFIER_ONLY = new Set(['Control', 'Alt', 'Shift', 'Meta'])

export function keyPayload(mode: RcMode, event: KeyboardEvent, action: 'down' | 'up'): RcInput | null {
  if (mode === 'browser') {
    if (MODIFIER_ONLY.has(event.key)) return null
    return {
      type: 'key',
      action,
      key: event.key,
      ctrl: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey,
      meta: event.metaKey,
    }
  }
  return { type: 'key', action, key: event.key }
}

export function shouldIgnoreRemoteKey(event: KeyboardEvent, composingOnly = false) {
  if (composingOnly) return event.isComposing
  return event.isComposing || event.keyCode === 229
}
