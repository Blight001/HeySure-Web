import type { WorkflowCanvasConnection, WorkflowNodePosition } from './automationTypes'
import { NODE_WIDTH, type TouchGesture } from './canvasTypes'

export function canvasPoint(
  event: { clientX: number; clientY: number },
  canvas: HTMLElement | null,
  offset: WorkflowNodePosition,
  scale: number,
): WorkflowNodePosition {
  const rect = canvas?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  return {
    x: (event.clientX - rect.left - offset.x) / scale,
    y: (event.clientY - rect.top - offset.y) / scale,
  }
}

export function draggedNodePosition(
  initial: WorkflowNodePosition,
  start: WorkflowNodePosition,
  next: WorkflowNodePosition,
  scale: number,
): WorkflowNodePosition {
  return {
    x: Math.max(0, initial.x + (next.x - start.x) / scale),
    y: Math.max(0, initial.y + (next.y - start.y) / scale),
  }
}

export function pannedOffset(
  initial: WorkflowNodePosition,
  start: WorkflowNodePosition,
  next: WorkflowNodePosition,
) {
  return { x: initial.x + next.x - start.x, y: initial.y + next.y - start.y }
}

export function clampZoom(next: number) {
  return Math.min(1.8, Math.max(0.5, next))
}

export function roundedZoom(next: number) {
  return Math.round(clampZoom(next) * 10) / 10
}

export function inspectorStyleFor(
  selected: WorkflowNodePosition | null,
  offset: WorkflowNodePosition,
  scale: number,
  canvasWidth: number,
) {
  if (!selected) return { display: 'none' }
  const nodeCenter = offset.x + (selected.x + NODE_WIDTH / 2) * scale
  return nodeCenter < canvasWidth / 2
    ? { right: '12px', top: '12px' }
    : { left: '12px', top: '12px' }
}

export function touchClientPoint(touch: Touch): WorkflowNodePosition {
  return { x: touch.clientX, y: touch.clientY }
}

export function touchDistance(first: Touch, second: Touch) {
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY)
}

export function touchMidpoint(first: Touch, second: Touch): WorkflowNodePosition {
  return {
    x: (first.clientX + second.clientX) / 2,
    y: (first.clientY + second.clientY) / 2,
  }
}

export function beginPinchGesture(
  first: Touch,
  second: Touch,
  rect: DOMRect,
  scale: number,
  offset: WorkflowNodePosition,
): Extract<TouchGesture, { kind: 'pinch' }> {
  const midpoint = touchMidpoint(first, second)
  return {
    kind: 'pinch',
    distance: Math.max(1, touchDistance(first, second)),
    scale,
    anchor: {
      x: (midpoint.x - rect.left - offset.x) / scale,
      y: (midpoint.y - rect.top - offset.y) / scale,
    },
  }
}

export function applyCanvasPinch(
  first: Touch,
  second: Touch,
  gesture: Extract<TouchGesture, { kind: 'pinch' }>,
  rect: DOMRect,
) {
  const midpoint = touchMidpoint(first, second)
  const nextScale = clampZoom(gesture.scale * touchDistance(first, second) / gesture.distance)
  const appliedScale = Math.round(nextScale * 100) / 100
  return {
    scale: appliedScale,
    offset: {
      x: midpoint.x - rect.left - gesture.anchor.x * appliedScale,
      y: midpoint.y - rect.top - gesture.anchor.y * appliedScale,
    },
  }
}

export function finishConnectionAt(
  clientX: number,
  clientY: number,
  from: string,
  branch: WorkflowCanvasConnection['branch'],
): WorkflowCanvasConnection | null {
  const target = (document.elementFromPoint(clientX, clientY) as HTMLElement | null)
    ?.closest<HTMLElement>('[data-input-step]')
  if (target?.dataset.inputStep && target.dataset.inputStep !== from) {
    return { from, to: target.dataset.inputStep, branch }
  }
  return null
}

export function resolveTouchTarget(target: HTMLElement) {
  const output = target.closest<HTMLElement>('[data-output-step]')
  if (output?.dataset.outputStep && output.dataset.outputBranch) {
    return {
      output: {
        stepId: output.dataset.outputStep,
        branch: output.dataset.outputBranch as WorkflowCanvasConnection['branch'],
      },
    }
  }
  const node = target.closest<HTMLElement>('[data-node-step]')
  if (node?.dataset.nodeStep) return { node: node.dataset.nodeStep }
  return {}
}

export function applyTouchDelta(
  gesture: TouchGesture,
  touch: Touch,
  scale: number,
): { offset?: WorkflowNodePosition; node?: { stepId: string; position: WorkflowNodePosition } } {
  if (!('client' in gesture)) return {}
  const delta = { x: touch.clientX - gesture.client.x, y: touch.clientY - gesture.client.y }
  if (gesture.kind === 'pan') {
    return { offset: { x: gesture.offset.x + delta.x, y: gesture.offset.y + delta.y } }
  }
  if (gesture.kind === 'node') {
    return {
      node: {
        stepId: gesture.stepId,
        position: {
          x: Math.max(0, gesture.position.x + delta.x / scale),
          y: Math.max(0, gesture.position.y + delta.y / scale),
        },
      },
    }
  }
  return {}
}

export function trackWindowPointer(
  onMove: (event: PointerEvent) => void,
  onStop: (event: PointerEvent) => void,
) {
  const move = (next: PointerEvent) => onMove(next)
  const stop = (next: PointerEvent) => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    onStop(next)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
}
