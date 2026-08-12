<script setup lang="ts">
import { computed, ref } from 'vue'
import type { WorkflowStepType } from '@/api/workflowCards'

type CanvasStep = {
  id: string
  title?: string
  type: WorkflowStepType
  tool?: string
  next?: string
  onError?: string
  onTrue?: string
  onFalse?: string
  onDenied?: string
  delaySeconds?: number
  message?: string
}

type WorkflowNodePosition = { x: number; y: number }
type WorkflowCanvasConnection = {
  from: string
  to: string
  branch: 'next' | 'error' | 'true' | 'false' | 'denied'
}

const props = defineProps<{
  steps: CanvasStep[]
  startStepId: string
  selectedStepId: string
  positions: Record<string, WorkflowNodePosition>
  readonly?: boolean
  nodeStatuses?: Record<string, 'added' | 'removed' | 'changed' | 'unchanged'>
}>()

const emit = defineEmits<{
  (event: 'select', stepId: string): void
  (event: 'add', type: WorkflowStepType, position: WorkflowNodePosition): void
  (event: 'connect', connection: WorkflowCanvasConnection): void
  (event: 'disconnect', connection: Omit<WorkflowCanvasConnection, 'to'>): void
  (event: 'set-start', stepId: string): void
  (event: 'update:positions', positions: Record<string, WorkflowNodePosition>): void
}>()

type CanvasEdge = WorkflowCanvasConnection & { id: string; label: string }
type PortPlacement = 'right' | 'bottom'
type OutputPort = {
  branch: WorkflowCanvasConnection['branch']
  label: string
  tone: string
  placement: PortPlacement
}

const NODE_WIDTH = 184
const NODE_HEIGHT = 92
const canvasRef = ref<HTMLElement | null>(null)
const scale = ref(1)
const offset = ref({ x: 24, y: 24 })
const selectedEdgeId = ref('')
const connection = ref<{ from: string; branch: WorkflowCanvasConnection['branch'] } | null>(null)
const previewPoint = ref<WorkflowNodePosition | null>(null)
type TouchGesture =
  | { kind: 'pan'; client: WorkflowNodePosition; offset: WorkflowNodePosition }
  | { kind: 'node'; client: WorkflowNodePosition; stepId: string; position: WorkflowNodePosition }
  | { kind: 'connection'; from: string; branch: WorkflowCanvasConnection['branch'] }
  | {
      kind: 'pinch'
      distance: number
      scale: number
      anchor: WorkflowNodePosition
    }
let touchGesture: TouchGesture | null = null

const typeLabels: Record<WorkflowStepType, string> = {
  mcp: '设备 MCP', condition: '判断分支', delay: '等待', confirm: '用户确认', ai: 'AI 介入', end: '结束',
}

const palette: Array<{ type: WorkflowStepType; label: string }> = [
  { type: 'mcp', label: '设备 MCP' },
  { type: 'condition', label: '判断分支' },
  { type: 'delay', label: '等待' },
  { type: 'confirm', label: '人工确认' },
  { type: 'ai', label: 'AI 介入' },
  { type: 'end', label: '结束' },
]

const defaultPosition = (index: number): WorkflowNodePosition => ({
  x: 48 + (index % 4) * 240,
  y: 48 + Math.floor(index / 4) * 145,
})

const positionFor = (stepId: string) => {
  const index = props.steps.findIndex(step => step.id === stepId)
  return props.positions[stepId] || defaultPosition(Math.max(0, index))
}

const outputPorts = (step: CanvasStep): OutputPort[] => {
  if (step.type === 'condition') return [
    { branch: 'true', label: 'true', tone: 'success', placement: 'right' },
    { branch: 'false', label: 'false', tone: 'danger', placement: 'right' },
  ]
  if (step.type === 'mcp') return [
    { branch: 'next', label: '完成', tone: 'normal', placement: 'right' },
    { branch: 'error', label: '失败', tone: 'danger', placement: 'bottom' },
  ]
  if (step.type === 'confirm' || step.type === 'ai') return [
    { branch: 'next', label: '批准', tone: 'success', placement: 'right' },
    { branch: 'denied', label: '拒绝', tone: 'danger', placement: 'right' },
  ]
  if (step.type === 'delay') return [{ branch: 'next', label: '继续', tone: 'normal', placement: 'right' }]
  return []
}

const branchTarget = (step: CanvasStep, branch: WorkflowCanvasConnection['branch']) => {
  if (branch === 'true') return step.onTrue || ''
  if (branch === 'false') return step.onFalse || ''
  if (branch === 'error') return step.onError && step.onError !== 'fail' ? step.onError : ''
  if (branch === 'denied') return step.onDenied || ''
  return step.next || ''
}

const edges = computed<CanvasEdge[]>(() => {
  const ids = new Set(props.steps.map(step => step.id))
  return props.steps.flatMap(step => outputPorts(step).flatMap(port => {
    const to = branchTarget(step, port.branch)
    return to && ids.has(to)
      ? [{ id: `${step.id}:${port.branch}`, from: step.id, to, branch: port.branch, label: port.label }]
      : []
  }))
})

const portY = (step: CanvasStep, branch: WorkflowCanvasConnection['branch']) => {
  const ports = outputPorts(step).filter(port => port.placement === 'right')
  const index = Math.max(0, ports.findIndex(port => port.branch === branch))
  return ports.length <= 1 ? NODE_HEIGHT / 2 : 31 + index * 30
}

const outputPort = (step: CanvasStep, branch: WorkflowCanvasConnection['branch']) =>
  outputPorts(step).find(port => port.branch === branch)

const outputPoint = (step: CanvasStep, branch: WorkflowCanvasConnection['branch']) => {
  const position = positionFor(step.id)
  const placement = outputPort(step, branch)?.placement || 'right'
  return {
    placement,
    point: placement === 'bottom'
      ? { x: position.x + NODE_WIDTH / 2, y: position.y + NODE_HEIGHT }
      : { x: position.x + NODE_WIDTH, y: position.y + portY(step, branch) },
  }
}

const edgePoints = (edge: CanvasEdge) => {
  const sourceStep = props.steps.find(step => step.id === edge.from)
  const target = positionFor(edge.to)
  const source = sourceStep
    ? outputPoint(sourceStep, edge.branch)
    : { placement: 'right' as PortPlacement, point: positionFor(edge.from) }
  return {
    from: source.point,
    fromPlacement: source.placement,
    to: { x: target.x, y: target.y + NODE_HEIGHT / 2 },
  }
}

const edgePathFromPoints = (
  from: WorkflowNodePosition,
  to: WorkflowNodePosition,
  fromPlacement: PortPlacement = 'right',
) => {
  if (fromPlacement === 'bottom') {
    const bendY = Math.max(64, Math.abs(to.y - from.y) * 0.42)
    const bendX = Math.max(64, Math.abs(to.x - from.x) * 0.36)
    return `M ${from.x} ${from.y} C ${from.x} ${from.y + bendY}, ${to.x - bendX} ${to.y}, ${to.x} ${to.y}`
  }
  const bend = Math.max(72, Math.abs(to.x - from.x) * 0.45)
  return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`
}

const edgePath = (edge: CanvasEdge) => {
  const points = edgePoints(edge)
  return edgePathFromPoints(points.from, points.to, points.fromPlacement)
}

const nodeMeta = (step: CanvasStep) => {
  if (step.type === 'mcp') return step.tool || '请选择设备工具'
  if (step.type === 'condition') return 'true / false 双分支'
  if (step.type === 'delay') return `${Number(step.delaySeconds || 0)} 秒`
  if (step.type === 'confirm') return step.message || '等待用户批准'
  if (step.type === 'ai') return step.message || '等待 AI 审核与回调'
  return '生成输出并结束'
}

const updatePosition = (stepId: string, position: WorkflowNodePosition) => {
  emit('update:positions', { ...props.positions, [stepId]: position })
}

const startNodeDrag = (event: PointerEvent, step: CanvasStep) => {
  if (props.readonly) return
  if (event.pointerType === 'touch') return
  if (event.button !== 0 || (event.target as HTMLElement).closest('[data-port]')) return
  event.preventDefault()
  emit('select', step.id)
  selectedEdgeId.value = ''
  const initial = positionFor(step.id)
  const start = { x: event.clientX, y: event.clientY }
  const move = (next: PointerEvent) => updatePosition(step.id, {
    x: Math.max(0, initial.x + (next.clientX - start.x) / scale.value),
    y: Math.max(0, initial.y + (next.clientY - start.y) / scale.value),
  })
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
}

const canvasPoint = (event: { clientX: number; clientY: number }): WorkflowNodePosition => {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  return {
    x: (event.clientX - rect.left - offset.value.x) / scale.value,
    y: (event.clientY - rect.top - offset.value.y) / scale.value,
  }
}

const startConnection = (
  event: PointerEvent,
  step: CanvasStep,
  branch: WorkflowCanvasConnection['branch'],
) => {
  if (props.readonly) return
  if (event.pointerType === 'touch') return
  event.preventDefault()
  event.stopPropagation()
  emit('select', step.id)
  selectedEdgeId.value = ''
  connection.value = { from: step.id, branch }
  previewPoint.value = canvasPoint(event)
  const move = (next: PointerEvent) => { previewPoint.value = canvasPoint(next) }
  const stop = (next: PointerEvent) => {
    const target = (document.elementFromPoint(next.clientX, next.clientY) as HTMLElement | null)
      ?.closest<HTMLElement>('[data-input-step]')
    if (target?.dataset.inputStep && target.dataset.inputStep !== step.id) {
      emit('connect', { from: step.id, to: target.dataset.inputStep, branch })
    }
    connection.value = null
    previewPoint.value = null
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
}

const previewPath = computed(() => {
  if (!connection.value || !previewPoint.value) return ''
  const step = props.steps.find(item => item.id === connection.value?.from)
  if (!step) return ''
  const source = outputPoint(step, connection.value.branch)
  return edgePathFromPoints(source.point, previewPoint.value, source.placement)
})

const startPan = (event: PointerEvent) => {
  if (event.pointerType === 'touch') return
  if (event.button !== 0 || (event.target as Element).closest('[data-node], [data-port], [data-edge]')) return
  event.preventDefault()
  emit('select', '')
  selectedEdgeId.value = ''
  const initial = { ...offset.value }
  const start = { x: event.clientX, y: event.clientY }
  const move = (next: PointerEvent) => {
    offset.value = { x: initial.x + next.clientX - start.x, y: initial.y + next.clientY - start.y }
  }
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
}

const clampZoom = (next: number) => Math.min(1.8, Math.max(0.5, next))
const setZoom = (next: number) => { scale.value = Math.round(clampZoom(next) * 10) / 10 }
const resetView = () => { scale.value = 1; offset.value = { x: 24, y: 24 } }
const inspectorStyle = computed(() => {
  const selected = props.selectedStepId ? positionFor(props.selectedStepId) : null
  if (!selected) return { display: 'none' }
  const nodeCenter = offset.value.x + (selected.x + NODE_WIDTH / 2) * scale.value
  const canvasWidth = canvasRef.value?.clientWidth || 1000
  return nodeCenter < canvasWidth / 2
    ? { right: '12px', top: '12px' }
    : { left: '12px', top: '12px' }
})

const touchClientPoint = (touch: Touch): WorkflowNodePosition => ({ x: touch.clientX, y: touch.clientY })
const touchDistance = (first: Touch, second: Touch) => Math.hypot(
  second.clientX - first.clientX,
  second.clientY - first.clientY,
)
const touchMidpoint = (first: Touch, second: Touch): WorkflowNodePosition => ({
  x: (first.clientX + second.clientX) / 2,
  y: (first.clientY + second.clientY) / 2,
})

const beginPinch = (first: Touch, second: Touch) => {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return
  const midpoint = touchMidpoint(first, second)
  touchGesture = {
    kind: 'pinch',
    distance: Math.max(1, touchDistance(first, second)),
    scale: scale.value,
    anchor: {
      x: (midpoint.x - rect.left - offset.value.x) / scale.value,
      y: (midpoint.y - rect.top - offset.value.y) / scale.value,
    },
  }
  connection.value = null
  previewPoint.value = null
}

const startCanvasTouch = (event: TouchEvent) => {
  event.preventDefault()
  if (event.touches.length >= 2) {
    beginPinch(event.touches[0], event.touches[1])
    return
  }
  const touch = event.touches[0]
  if (!touch) return
  const target = event.target as HTMLElement
  const output = target.closest<HTMLElement>('[data-output-step]')
  if (!props.readonly && output?.dataset.outputStep && output.dataset.outputBranch) {
    const branch = output.dataset.outputBranch as WorkflowCanvasConnection['branch']
    emit('select', output.dataset.outputStep)
    connection.value = { from: output.dataset.outputStep, branch }
    previewPoint.value = canvasPoint(touch)
    touchGesture = { kind: 'connection', from: output.dataset.outputStep, branch }
    return
  }
  const node = target.closest<HTMLElement>('[data-node-step]')
  if (!props.readonly && node?.dataset.nodeStep) {
    emit('select', node.dataset.nodeStep)
    selectedEdgeId.value = ''
    touchGesture = {
      kind: 'node',
      client: touchClientPoint(touch),
      stepId: node.dataset.nodeStep,
      position: { ...positionFor(node.dataset.nodeStep) },
    }
    return
  }
  emit('select', '')
  selectedEdgeId.value = ''
  touchGesture = { kind: 'pan', client: touchClientPoint(touch), offset: { ...offset.value } }
}

const moveCanvasTouch = (event: TouchEvent) => {
  event.preventDefault()
  if (event.touches.length >= 2) {
    if (touchGesture?.kind !== 'pinch') beginPinch(event.touches[0], event.touches[1])
    if (touchGesture?.kind !== 'pinch') return
    const rect = canvasRef.value?.getBoundingClientRect()
    if (!rect) return
    const midpoint = touchMidpoint(event.touches[0], event.touches[1])
    const nextScale = clampZoom(
      touchGesture.scale * touchDistance(event.touches[0], event.touches[1]) / touchGesture.distance,
    )
    const appliedScale = Math.round(nextScale * 100) / 100
    scale.value = appliedScale
    offset.value = {
      x: midpoint.x - rect.left - touchGesture.anchor.x * appliedScale,
      y: midpoint.y - rect.top - touchGesture.anchor.y * appliedScale,
    }
    return
  }
  const touch = event.touches[0]
  if (!touch || !touchGesture) return
  const delta = {
    x: touch.clientX - ('client' in touchGesture ? touchGesture.client.x : touch.clientX),
    y: touch.clientY - ('client' in touchGesture ? touchGesture.client.y : touch.clientY),
  }
  if (touchGesture.kind === 'pan') {
    offset.value = { x: touchGesture.offset.x + delta.x, y: touchGesture.offset.y + delta.y }
  } else if (touchGesture.kind === 'node') {
    updatePosition(touchGesture.stepId, {
      x: Math.max(0, touchGesture.position.x + delta.x / scale.value),
      y: Math.max(0, touchGesture.position.y + delta.y / scale.value),
    })
  } else if (touchGesture.kind === 'connection') {
    previewPoint.value = canvasPoint(touch)
  }
}

const finishCanvasTouch = (event: TouchEvent) => {
  event.preventDefault()
  if (touchGesture?.kind === 'connection' && event.changedTouches[0]) {
    const touch = event.changedTouches[0]
    const target = (document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null)
      ?.closest<HTMLElement>('[data-input-step]')
    if (target?.dataset.inputStep && target.dataset.inputStep !== touchGesture.from) {
      emit('connect', { from: touchGesture.from, to: target.dataset.inputStep, branch: touchGesture.branch })
    }
  }
  connection.value = null
  previewPoint.value = null
  if (event.touches.length === 1) {
    const touch = event.touches[0]
    touchGesture = { kind: 'pan', client: touchClientPoint(touch), offset: { ...offset.value } }
  } else {
    touchGesture = null
  }
}

const autoLayout = () => {
  const ids = props.steps.map(step => step.id)
  const outgoing = new Map(ids.map(id => [id, [] as string[]]))
  const incoming = new Map(ids.map(id => [id, 0]))
  for (const edge of edges.value) {
    outgoing.get(edge.from)?.push(edge.to)
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1)
  }
  const roots = ids.filter(id => (incoming.get(id) || 0) === 0)
  const queue = [...new Set([props.startStepId, ...roots].filter(id => outgoing.has(id)))]
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
  emit('update:positions', positions)
  resetView()
}

const addStep = (type: WorkflowStepType, position?: WorkflowNodePosition) => {
  if (props.readonly) return
  emit('add', type, position || defaultPosition(props.steps.length))
}

const onDrop = (event: DragEvent) => {
  if (props.readonly) return
  const type = event.dataTransfer?.getData('application/x-heysure-workflow-step') as WorkflowStepType
  if (palette.some(item => item.type === type)) addStep(type, canvasPoint(event))
}

const onPaletteDrag = (event: DragEvent, type: WorkflowStepType) => {
  event.dataTransfer?.setData('application/x-heysure-workflow-step', type)
}

const selectEdge = (edgeId: string) => {
  if (props.readonly) return
  selectedEdgeId.value = edgeId
  emit('select', '')
}

const deleteSelectedEdge = () => {
  if (props.readonly) return
  const edge = edges.value.find(item => item.id === selectedEdgeId.value)
  if (!edge) return
  emit('disconnect', { from: edge.from, branch: edge.branch })
  selectedEdgeId.value = ''
}

const onCanvasKeydown = (event: KeyboardEvent) => {
  if (!selectedEdgeId.value || (event.key !== 'Delete' && event.key !== 'Backspace')) return
  event.preventDefault()
  event.stopPropagation()
  deleteSelectedEdge()
}
</script>

<template>
  <section class="canvas-editor">
    <header class="canvas-toolbar">
      <div class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">流程画布</div>
      <div class="flex items-center gap-1 text-[10px]">
        <button v-if="selectedEdgeId" class="canvas-button text-rose-500" type="button" @click="deleteSelectedEdge">删除连线</button>
      </div>
    </header>

    <div v-if="!readonly" class="flex flex-wrap gap-1.5">
      <button
        v-for="item in palette"
        :key="item.type"
        type="button"
        draggable="true"
        class="canvas-button"
        @click="addStep(item.type)"
        @dragstart="onPaletteDrag($event, item.type)"
      >+ {{ item.label }}</button>
    </div>

    <div
      ref="canvasRef"
      class="workflow-canvas"
      tabindex="0"
      @pointerdown="startPan"
      @touchstart="startCanvasTouch"
      @touchmove="moveCanvasTouch"
      @touchend="finishCanvasTouch"
      @touchcancel="finishCanvasTouch"
      @wheel.prevent="setZoom(scale + ($event.deltaY < 0 ? 0.1 : -0.1))"
      @dragover.prevent
      @drop.prevent="onDrop"
      @keydown="onCanvasKeydown"
    >
      <div class="workflow-viewport" :style="{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }">
        <svg class="workflow-svg" width="2200" height="1400" aria-hidden="true">
          <defs>
            <marker id="workflow-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <path d="M0,0 L0,6 L9,3 z" fill="#64748b" />
            </marker>
          </defs>
          <g v-for="edge in edges" :key="edge.id" :data-edge="edge.id" @pointerdown.stop="selectEdge(edge.id)">
            <path class="edge-hit" :d="edgePath(edge)" />
            <path class="workflow-edge" :class="{ selected: selectedEdgeId === edge.id }" :d="edgePath(edge)" marker-end="url(#workflow-arrow)" />
            <text
              v-if="edge.branch !== 'next'"
              class="edge-label"
              :x="(edgePoints(edge).from.x + edgePoints(edge).to.x) / 2"
              :y="(edgePoints(edge).from.y + edgePoints(edge).to.y) / 2 - 8"
            >{{ edge.label }}</text>
          </g>
          <path v-if="previewPath" class="edge-preview" :d="previewPath" />
        </svg>

        <article
          v-for="(step, index) in steps"
          :key="step.id"
          data-node
          :data-node-step="step.id"
          class="workflow-node"
          :class="[`type-${step.type}`, nodeStatuses?.[step.id] ? `diff-${nodeStatuses[step.id]}` : '', { selected: selectedStepId === step.id, 'is-start': startStepId === step.id, 'is-end': step.type === 'end' }]"
          :style="{ left: `${positionFor(step.id).x}px`, top: `${positionFor(step.id).y}px` }"
          @pointerdown="startNodeDrag($event, step)"
          @click.stop="emit('select', step.id); selectedEdgeId = ''"
          @dblclick.stop="emit('set-start', step.id)"
        >
          <button data-port :data-input-step="step.id" class="node-port input-port" type="button" aria-label="输入端点" />
          <div class="flex items-center justify-between text-[9px] text-slate-400">
            <span>#{{ index + 1 }} · {{ typeLabels[step.type] }}</span>
            <span v-if="startStepId === step.id" class="rounded bg-indigo-500/20 px-1 text-indigo-300">入口</span>
          </div>
          <div class="mt-2 truncate text-xs font-bold text-slate-100">{{ step.title || step.id }}</div>
          <div class="mt-1 truncate text-[10px] text-slate-400">{{ nodeMeta(step) }}</div>
          <div
            v-for="port in outputPorts(step)"
            :key="port.branch"
            class="output-port-wrap"
            :class="`is-${port.placement}`"
            :style="port.placement === 'right' ? { top: `${portY(step, port.branch) - 7}px` } : undefined"
          >
            <span class="port-label" :class="`tone-${port.tone}`">{{ port.label }}</span>
            <button
              data-port
              :data-output-step="step.id"
              :data-output-branch="port.branch"
              class="node-port output-port"
              :class="`tone-${port.tone}`"
              type="button"
              :disabled="readonly"
              :aria-label="`${port.label}输出端点`"
              @pointerdown="startConnection($event, step, port.branch)"
            />
          </div>
        </article>
      </div>
      <div v-if="steps.length === 0" class="absolute inset-0 grid place-items-center text-xs text-slate-400">从上方添加第一个流程节点</div>
      <div v-if="!readonly" class="canvas-bottom-left" @pointerdown.stop @touchstart.stop @touchmove.stop @touchend.stop>
        <slot name="bottom-left" />
      </div>
      <div v-if="!readonly && selectedStepId" class="canvas-inspector" :style="inspectorStyle" @pointerdown.stop @touchstart.stop @touchmove.stop @touchend.stop>
        <slot name="inspector" />
      </div>
      <div class="canvas-view-controls" @pointerdown.stop @touchstart.stop @touchmove.stop @touchend.stop>
        <button v-if="!readonly" class="canvas-button" type="button" @click="autoLayout">自动排版</button>
        <button class="canvas-button" type="button" aria-label="缩小画布" @click="setZoom(scale - 0.1)">−</button>
        <button class="canvas-button min-w-12" type="button" title="重置画布视图" @click="resetView">{{ Math.round(scale * 100) }}%</button>
        <button class="canvas-button" type="button" aria-label="放大画布" @click="setZoom(scale + 0.1)">＋</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.canvas-editor { display: grid; gap: 10px; min-width: 0; }
.canvas-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.canvas-button { border: 1px solid var(--editor-border, rgb(161 161 170)); border-radius: 7px; padding: 6px 9px; color: var(--editor-text, #27272a); background: var(--editor-field, #eef2f7); font-size: 13px; font-weight: 500; transition: border-color 150ms ease, background-color 150ms ease, color 150ms ease; }
.canvas-button:hover { border-color: #818cf8; color: var(--editor-heading, #3730a3); background: var(--editor-field-focus, #f1f5ff); }
.canvas-button:focus-visible { outline: none; box-shadow: 0 0 0 3px rgb(99 102 241 / 0.18); }
.workflow-canvas { position: relative; height: clamp(500px, 58vh, 680px); overflow: hidden; border: 1px solid #334155; border-radius: 12px; background-color: #0f172a; background-image: radial-gradient(circle, rgb(148 163 184 / 0.25) 1px, transparent 1px); background-size: 20px 20px; cursor: grab; touch-action: none; }
.canvas-view-controls { position: absolute; right: 12px; bottom: 12px; z-index: 20; display: flex; align-items: center; gap: 4px; padding: 5px; border: 1px solid rgb(100 116 139 / 0.7); border-radius: 10px; background: rgb(15 23 42 / 0.86); box-shadow: 0 8px 24px rgb(0 0 0 / 0.28); backdrop-filter: blur(8px); }
.canvas-bottom-left { position: absolute; left: 12px; bottom: 12px; z-index: 25; display: flex; gap: 6px; }
.canvas-inspector { position: absolute; z-index: 30; width: min(360px, calc(100% - 24px)); max-height: calc(100% - 24px); overflow: auto; border: 1px solid rgb(100 116 139 / 0.8); border-radius: 12px; color: #e2e8f0; background: rgb(15 23 42 / 0.96); box-shadow: 0 16px 40px rgb(0 0 0 / 0.42); padding: 12px; touch-action: pan-y; }
.canvas-view-controls .canvas-button { min-height: 34px; color: #e2e8f0; border-color: #475569; background: rgb(30 41 59 / 0.94); }
.workflow-viewport { position: absolute; inset: 0 auto auto 0; width: 2200px; height: 1400px; transform-origin: 0 0; }
.workflow-svg { position: absolute; inset: 0; overflow: visible; }
.workflow-edge { fill: none; stroke: #64748b; stroke-width: 2.2; pointer-events: none; }
.workflow-edge.selected { stroke: #818cf8; stroke-width: 3.2; }
.edge-hit { fill: none; stroke: transparent; stroke-width: 14; cursor: pointer; pointer-events: stroke; }
.edge-preview { fill: none; stroke: #818cf8; stroke-width: 2; stroke-dasharray: 7 5; }
.edge-label { fill: #f1f5f9; font: 700 12px ui-sans-serif, system-ui; paint-order: stroke; stroke: #0f172a; stroke-width: 3px; }
.workflow-node { position: absolute; width: 184px; height: 92px; box-sizing: border-box; padding: 10px 15px; border: 1px solid #64748b; border-radius: 11px; color: #f8fafc; background: rgb(30 41 59 / 0.82); box-shadow: 0 10px 24px rgb(0 0 0 / 0.28); cursor: move; user-select: none; backdrop-filter: blur(7px); }
.workflow-node.selected { outline: 2px solid rgb(196 181 253 / 0.9); outline-offset: 3px; }
.workflow-node.type-mcp { border-color: #60a5fa; background: rgb(37 99 235 / 0.22); }
.workflow-node.type-condition { border-color: #f59e0b; background: rgb(245 158 11 / 0.2); }
.workflow-node.type-delay { border-color: #2dd4bf; background: rgb(13 148 136 / 0.2); }
.workflow-node.type-confirm { border-color: #e879f9; background: rgb(192 38 211 / 0.2); }
.workflow-node.type-ai { border-color: #38bdf8; background: rgb(14 165 233 / 0.2); }
.workflow-node.type-end { border-color: #60a5fa; background: rgb(37 99 235 / 0.2); }
.workflow-node.is-start { border-color: #4ade80; box-shadow: 0 0 0 2px rgb(74 222 128 / 0.42), 0 0 22px rgb(34 197 94 / 0.5), 0 10px 24px rgb(0 0 0 / 0.28); }
.workflow-node.is-end { border-color: #60a5fa; box-shadow: 0 0 0 2px rgb(96 165 250 / 0.42), 0 0 22px rgb(59 130 246 / 0.52), 0 10px 24px rgb(0 0 0 / 0.28); }
.workflow-node.is-start.is-end { box-shadow: 0 0 0 2px rgb(74 222 128 / 0.48), 0 0 18px rgb(34 197 94 / 0.45), 0 0 30px rgb(59 130 246 / 0.42), 0 10px 24px rgb(0 0 0 / 0.28); }
.workflow-node.diff-added { border-color: #22c55e; box-shadow: 0 0 0 2px rgb(34 197 94 / 0.25), 0 10px 24px rgb(0 0 0 / 0.28); }
.workflow-node.diff-removed { border-color: #f43f5e; box-shadow: 0 0 0 2px rgb(244 63 94 / 0.25), 0 10px 24px rgb(0 0 0 / 0.28); }
.workflow-node.diff-changed { border-color: #f59e0b; box-shadow: 0 0 0 2px rgb(245 158 11 / 0.25), 0 10px 24px rgb(0 0 0 / 0.28); }
.workflow-node.diff-unchanged { opacity: 0.72; }
.node-port { position: absolute; width: 15px; height: 15px; padding: 0; border: 2px solid #94a3b8; border-radius: 50%; background: #172033; cursor: crosshair; }
.node-port:hover { border-color: #818cf8; background: #818cf8; }
.input-port { left: -9px; top: 38px; }
.output-port-wrap { position: absolute; right: -9px; height: 15px; }
.output-port-wrap.is-bottom { right: auto; bottom: -8px; left: 50%; transform: translateX(-50%); }
.output-port { position: relative; inset: auto; display: block; }
.port-label { position: absolute; right: 19px; top: -2px; color: #e2e8f0; font-size: 11px; font-weight: 600; white-space: nowrap; text-shadow: 0 1px 2px #0f172a; }
.output-port-wrap.is-bottom .port-label { top: -20px; right: auto; left: 50%; transform: translateX(-50%); }
.tone-success { border-color: #34d399; color: #6ee7b7; }
.tone-danger { border-color: #fb7185; color: #fda4af; }
@media (max-width: 900px) { .workflow-canvas { height: 480px; } .canvas-view-controls { right: 8px; bottom: 8px; max-width: calc(100% - 16px); } .canvas-view-controls .canvas-button { padding: 6px 8px; } }
</style>
