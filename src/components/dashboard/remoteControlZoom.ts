export type ZoomPoint = { x: number; y: number }

export type PinchStart = {
  distance: number
  centerX: number
  centerY: number
  scale: number
  x: number
  y: number
}

export function zoomStyle(scale: number, x: number, y: number, keyboardOffset: number) {
  return {
    transform: `translate3d(${x}px, ${y - keyboardOffset / 2}px, 0) scale(${scale})`,
    transformOrigin: 'center center',
  }
}

export function beginPinchFromPoints(
  a: ZoomPoint,
  b: ZoomPoint,
  scale: number,
  x: number,
  y: number,
): PinchStart {
  return {
    distance: Math.hypot(b.x - a.x, b.y - a.y),
    centerX: (a.x + b.x) / 2,
    centerY: (a.y + b.y) / 2,
    scale,
    x,
    y,
  }
}

export function applyPinchPoints(
  a: ZoomPoint,
  b: ZoomPoint,
  pinchStart: PinchStart,
  twoFingerTap: { moved: boolean } | null,
) {
  const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))
  const cx = (a.x + b.x) / 2
  const cy = (a.y + b.y) / 2
  const scale = Math.min(4, Math.max(1, pinchStart.scale * distance / Math.max(1, pinchStart.distance)))
  const moved = Math.hypot(cx - pinchStart.centerX, cy - pinchStart.centerY) > 8
    || Math.abs(distance - pinchStart.distance) > 10
  if (twoFingerTap && moved) twoFingerTap.moved = true
  const x = scale === 1 ? 0 : pinchStart.x + (cx - pinchStart.centerX)
  const y = scale === 1 ? 0 : pinchStart.y + (cy - pinchStart.centerY)
  return { scale, x, y }
}

export function viewportKeyboardOffset(inputOpen: boolean) {
  const viewport = window.visualViewport
  if (!inputOpen || !viewport) return 0
  return Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
}
