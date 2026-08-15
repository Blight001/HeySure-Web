import type { RcInput } from '@/composables/useRemoteControl'

type FullscreenDoc = Document & {
  webkitFullscreenElement?: Element
  webkitExitFullscreen?: () => Promise<void>
}

type FullscreenEl = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>
}

export function enterNativeFullscreen(el: HTMLElement | null) {
  if (!el) return
  const target = el as FullscreenEl
  if (target.requestFullscreen) {
    Promise.resolve(target.requestFullscreen({ navigationUI: 'hide' })).catch(() => { /* CSS fallback */ })
    return
  }
  if (target.webkitRequestFullscreen) {
    Promise.resolve(target.webkitRequestFullscreen()).catch(() => { /* CSS fallback */ })
  }
}

export function exitNativeFullscreen() {
  const doc = document as FullscreenDoc
  if (!doc.fullscreenElement && !doc.webkitFullscreenElement) return
  const exit = doc.exitFullscreen || doc.webkitExitFullscreen
  if (exit) Promise.resolve(exit.call(doc)).catch(() => { /* already exiting */ })
}

export function isNativeFullscreenActive() {
  const doc = document as FullscreenDoc
  return !!(doc.fullscreenElement || doc.webkitFullscreenElement)
}

export function applyFullscreenTextDelta(
  value: string,
  sent: string,
  sendInput: (input: RcInput) => void,
) {
  if (value.startsWith(sent)) {
    const appended = value.slice(sent.length)
    if (appended) sendInput({ type: 'text', text: appended })
    return value
  }
  if (sent.startsWith(value)) {
    for (let i = 0; i < sent.length - value.length; i += 1) sendInput({ type: 'key', action: 'down', key: 'Backspace' })
    return value
  }
  if (value) sendInput({ type: 'text', text: value })
  return value
}
