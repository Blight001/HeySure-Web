import type { RcInput, RcMouseButton } from '@/composables/useRemoteControl'

export const SWIPE_THRESHOLD = 0.025
export const ANDROID_DRAG_STEP_THRESHOLD = 0.004
export const ANDROID_DRAG_INTERVAL_MS = 45
export const LONG_PRESS_MS = 500
export const MOVE_INTERVAL_MS = 33

export type AndroidDown = {
  x: number
  y: number
  t: number
  lastX: number
  lastY: number
  lastMoveAt: number
  dragging: boolean
  longPressSent: boolean
  longPressTimer: number | null
  holdInterval: number | null
}

export type PointerPos = { x: number; y: number }

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

export function mouseButton(button: number): RcMouseButton {
  return button === 2 ? 'right' : button === 1 ? 'middle' : 'left'
}

export function normalizePointer(
  event: PointerEvent | WheelEvent,
  video: HTMLVideoElement | null,
  deviceWidth: number,
  deviceHeight: number,
): PointerPos | null {
  if (!video) return null
  const rect = video.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  const sourceWidth = video.videoWidth || deviceWidth
  const sourceHeight = video.videoHeight || deviceHeight
  let contentLeft = rect.left
  let contentTop = rect.top
  let contentWidth = rect.width
  let contentHeight = rect.height
  if (sourceWidth > 0 && sourceHeight > 0) {
    const sourceRatio = sourceWidth / sourceHeight
    const rectRatio = rect.width / rect.height
    if (rectRatio > sourceRatio) {
      contentWidth = rect.height * sourceRatio
      contentLeft += (rect.width - contentWidth) / 2
    } else if (rectRatio < sourceRatio) {
      contentHeight = rect.width / sourceRatio
      contentTop += (rect.height - contentHeight) / 2
    }
  }
  return {
    x: clamp01((event.clientX - contentLeft) / contentWidth),
    y: clamp01((event.clientY - contentTop) / contentHeight),
  }
}

export function clearAndroidTimers(down: AndroidDown | null) {
  if (down?.longPressTimer != null) {
    window.clearTimeout(down.longPressTimer)
    down.longPressTimer = null
  }
  if (down?.holdInterval != null) {
    window.clearInterval(down.holdInterval)
    down.holdInterval = null
  }
}

export function startAndroidLongPress(down: AndroidDown, sendInput: (input: RcInput) => void) {
  clearAndroidTimers(down)
  down.longPressTimer = window.setTimeout(() => {
    if (down.dragging) return
    down.longPressSent = true
    down.dragging = true
    down.longPressTimer = null
    down.lastMoveAt = Date.now()
    sendInput({ type: 'down', x: down.x, y: down.y })
    down.holdInterval = window.setInterval(() => {
      if (!down.dragging) return
      sendInput({ type: 'move', x: down.lastX, y: down.lastY, durationMs: ANDROID_DRAG_INTERVAL_MS + 25 })
    }, ANDROID_DRAG_INTERVAL_MS + 10)
  }, LONG_PRESS_MS)
}

export function sendAndroidDragMove(
  down: AndroidDown,
  pos: PointerPos,
  sendInput: (input: RcInput) => void,
  force = false,
) {
  if (!down.dragging) return
  const now = Date.now()
  const elapsed = now - down.lastMoveAt
  const step = Math.hypot(pos.x - down.lastX, pos.y - down.lastY)
  if (!force && (elapsed < ANDROID_DRAG_INTERVAL_MS || step < ANDROID_DRAG_STEP_THRESHOLD)) return
  sendInput({
    type: 'move',
    x: pos.x,
    y: pos.y,
    durationMs: Math.min(120, Math.max(24, elapsed || ANDROID_DRAG_INTERVAL_MS)),
  })
  down.lastX = pos.x
  down.lastY = pos.y
  down.lastMoveAt = now
}

export function finishAndroidPointer(
  down: AndroidDown,
  end: PointerPos,
  sendInput: (input: RcInput) => void,
) {
  clearAndroidTimers(down)
  const dt = Date.now() - down.t
  const dist = Math.hypot(end.x - down.x, end.y - down.y)
  if (down.dragging) {
    sendAndroidDragMove(down, end, sendInput, true)
    sendInput({ type: 'up', x: end.x, y: end.y })
    return
  }
  if (down.longPressSent) return
  if (dist >= SWIPE_THRESHOLD) {
    sendInput({ type: 'swipe', x: down.x, y: down.y, x2: end.x, y2: end.y, durationMs: Math.min(800, Math.max(120, dt)) })
    return
  }
  if (dt >= LONG_PRESS_MS) {
    sendInput({ type: 'long_press', x: down.x, y: down.y, durationMs: Math.max(LONG_PRESS_MS + 180, dt) })
    return
  }
  sendInput({ type: 'tap', x: down.x, y: down.y })
}

export function handleDesktopPointerUp(
  isDesktopLike: boolean,
  twoFingerTap: (PointerPos & { moved: boolean }) | null,
  sendInput: (input: RcInput) => void,
) {
  if (!isDesktopLike || !twoFingerTap || twoFingerTap.moved) return
  sendInput({ type: 'down', x: twoFingerTap.x, y: twoFingerTap.y, button: 'right' })
  sendInput({ type: 'up', x: twoFingerTap.x, y: twoFingerTap.y, button: 'right' })
}
