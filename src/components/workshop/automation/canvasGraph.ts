import type { WorkflowCanvasConnection, WorkflowNodePosition } from './automationTypes'
import {
  defaultPosition,
  NODE_HEIGHT,
  NODE_WIDTH,
  type CanvasEdge,
  type CanvasStep,
  type OutputPort,
  type PortPlacement,
} from './canvasTypes'

export function positionFor(
  stepId: string,
  steps: CanvasStep[],
  positions: Record<string, WorkflowNodePosition>,
): WorkflowNodePosition {
  if (positions[stepId]) return positions[stepId]
  const index = steps.findIndex(step => step.id === stepId)
  return defaultPosition(Math.max(0, index))
}

export function outputPorts(step: CanvasStep): OutputPort[] {
  if (step.type === 'condition') return [
    { branch: 'true', label: 'true', tone: 'success', placement: 'right' },
    { branch: 'false', label: 'false', tone: 'danger', placement: 'right' },
  ]
  if (step.type === 'mcp') return [
    { branch: 'next', label: '完成', tone: 'normal', placement: 'right' },
    { branch: 'error', label: '失败', tone: 'danger', placement: 'bottom' },
  ]
  if (step.type === 'ai') return [
    { branch: 'next', label: '批准', tone: 'success', placement: 'right' },
    { branch: 'denied', label: '拒绝', tone: 'danger', placement: 'right' },
  ]
  if (step.type === 'card') return [
    { branch: 'next', label: '完成', tone: 'success', placement: 'right' },
    { branch: 'error', label: '失败', tone: 'danger', placement: 'bottom' },
  ]
  if (step.type === 'delay') return [{ branch: 'next', label: '继续', tone: 'normal', placement: 'right' }]
  return []
}

export function branchTarget(step: CanvasStep, branch: WorkflowCanvasConnection['branch']) {
  if (branch === 'true') return step.onTrue || ''
  if (branch === 'false') return step.onFalse || ''
  if (branch === 'error') return step.onError && step.onError !== 'fail' ? step.onError : ''
  if (branch === 'denied') return step.onDenied || ''
  return step.next || ''
}

export function isTerminalStep(step: CanvasStep, steps: CanvasStep[]) {
  if (step.type === 'end') return false
  const endIds = new Set(steps.filter(item => item.type === 'end').map(item => item.id))
  return outputPorts(step).every(port => {
    const target = branchTarget(step, port.branch)
    return !target || endIds.has(target)
  })
}

export function buildCanvasEdges(steps: CanvasStep[]): CanvasEdge[] {
  const ids = new Set(steps.map(step => step.id))
  return steps.flatMap(step => outputPorts(step).flatMap(port => {
    const to = branchTarget(step, port.branch)
    return to && ids.has(to)
      ? [{ id: `${step.id}:${port.branch}`, from: step.id, to, branch: port.branch, label: port.label }]
      : []
  }))
}

export function portY(step: CanvasStep, branch: WorkflowCanvasConnection['branch']) {
  const ports = outputPorts(step).filter(port => port.placement === 'right')
  const index = Math.max(0, ports.findIndex(port => port.branch === branch))
  return ports.length <= 1 ? NODE_HEIGHT / 2 : 31 + index * 30
}

export function outputPort(step: CanvasStep, branch: WorkflowCanvasConnection['branch']) {
  return outputPorts(step).find(port => port.branch === branch)
}

export function outputPoint(
  step: CanvasStep,
  branch: WorkflowCanvasConnection['branch'],
  steps: CanvasStep[],
  positions: Record<string, WorkflowNodePosition>,
) {
  const position = positionFor(step.id, steps, positions)
  const placement = outputPort(step, branch)?.placement || 'right'
  return {
    placement,
    point: placement === 'bottom'
      ? { x: position.x + NODE_WIDTH / 2, y: position.y + NODE_HEIGHT }
      : { x: position.x + NODE_WIDTH, y: position.y + portY(step, branch) },
  }
}

export function edgePoints(
  edge: CanvasEdge,
  steps: CanvasStep[],
  positions: Record<string, WorkflowNodePosition>,
) {
  const sourceStep = steps.find(step => step.id === edge.from)
  const target = positionFor(edge.to, steps, positions)
  const source = sourceStep
    ? outputPoint(sourceStep, edge.branch, steps, positions)
    : { placement: 'right' as PortPlacement, point: positionFor(edge.from, steps, positions) }
  return {
    from: source.point,
    fromPlacement: source.placement,
    to: { x: target.x, y: target.y + NODE_HEIGHT / 2 },
  }
}

export function edgePathFromPoints(
  from: WorkflowNodePosition,
  to: WorkflowNodePosition,
  fromPlacement: PortPlacement = 'right',
) {
  if (fromPlacement === 'bottom') {
    const bendY = Math.max(64, Math.abs(to.y - from.y) * 0.42)
    const bendX = Math.max(64, Math.abs(to.x - from.x) * 0.36)
    return `M ${from.x} ${from.y} C ${from.x} ${from.y + bendY}, ${to.x - bendX} ${to.y}, ${to.x} ${to.y}`
  }
  const bend = Math.max(72, Math.abs(to.x - from.x) * 0.45)
  return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`
}

export function edgePath(
  edge: CanvasEdge,
  steps: CanvasStep[],
  positions: Record<string, WorkflowNodePosition>,
) {
  const points = edgePoints(edge, steps, positions)
  return edgePathFromPoints(points.from, points.to, points.fromPlacement)
}

export function previewEdgePath(
  connection: { from: string; branch: WorkflowCanvasConnection['branch'] } | null,
  previewPoint: WorkflowNodePosition | null,
  steps: CanvasStep[],
  positions: Record<string, WorkflowNodePosition>,
) {
  if (!connection || !previewPoint) return ''
  const step = steps.find(item => item.id === connection.from)
  if (!step) return ''
  const source = outputPoint(step, connection.branch, steps, positions)
  return edgePathFromPoints(source.point, previewPoint, source.placement)
}

export function nodeMeta(step: CanvasStep) {
  if (step.type === 'mcp') return step.tool || '请选择设备工具'
  if (step.type === 'condition') return 'true / false 双分支'
  if (step.type === 'delay') return `${Number(step.delaySeconds || 0)} 秒`
  if (step.type === 'ai') return step.message || '暂停并等待 AI 完成节点任务'
  if (step.type === 'card') return step.cardName || '请选择要引用的卡片'
  return '生成输出并结束'
}

export function computeAutoLayout(
  steps: CanvasStep[],
  edges: CanvasEdge[],
  startStepId: string,
): Record<string, WorkflowNodePosition> {
  const ids = steps.map(step => step.id)
  const outgoing = new Map(ids.map(id => [id, [] as string[]]))
  const incoming = new Map(ids.map(id => [id, 0]))
  for (const edge of edges) {
    outgoing.get(edge.from)?.push(edge.to)
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1)
  }
  const roots = ids.filter(id => (incoming.get(id) || 0) === 0)
  const queue = [...new Set([startStepId, ...roots].filter(id => outgoing.has(id)))]
  const layers = new Map(queue.map(id => [id, 0]))
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index]
    for (const target of outgoing.get(id) || []) {
      if (layers.has(target)) continue
      layers.set(target, (layers.get(id) || 0) + 1)
      queue.push(target)
    }
  }
  let fallback = Math.max(0, ...layers.values()) + 1
  ids.forEach(id => { if (!layers.has(id)) layers.set(id, fallback++) })
  const rowByLayer = new Map<number, number>()
  const positions: Record<string, WorkflowNodePosition> = {}
  ids.forEach(id => {
    const layer = layers.get(id) || 0
    const row = rowByLayer.get(layer) || 0
    rowByLayer.set(layer, row + 1)
    positions[id] = { x: 48 + layer * 260, y: 48 + row * 145 }
  })
  return positions
}
