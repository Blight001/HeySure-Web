<script setup lang="ts">
import { computed, ref } from 'vue'
import type { WorkflowStepType } from '@/api/workflowCards'

type CanvasStep = {
  id: string
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
type OutputPort = { branch: WorkflowCanvasConnection['branch']; label: string; tone: string }

const NODE_WIDTH = 184
const NODE_HEIGHT = 92
const canvasRef = ref<HTMLElement | null>(null)
const scale = ref(1)
const offset = ref({ x: 24, y: 24 })
const selectedEdgeId = ref('')
const connection = ref<{ from: string; branch: WorkflowCanvasConnection['branch'] } | null>(null)
const previewPoint = ref<WorkflowNodePosition | null>(null)

const typeLabels: Record<WorkflowStepType, string> = {
  mcp: '设备 MCP', condition: '判断分支', delay: '等待', confirm: '人工确认', end: '结束',
}

const palette: Array<{ type: WorkflowStepType; label: string }> = [
  { type: 'mcp', label: '设备 MCP' },
  { type: 'condition', label: '判断分支' },
  { type: 'delay', label: '等待' },
  { type: 'confirm', label: '人工确认' },
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
    { branch: 'true', label: 'true', tone: 'success' },
    { branch: 'false', label: 'false', tone: 'danger' },
  ]
  if (step.type === 'mcp') return [
    { branch: 'next', label: '完成', tone: 'normal' },
    { branch: 'error', label: '失败', tone: 'danger' },
  ]
  if (step.type === 'confirm') return [
    { branch: 'next', label: '批准', tone: 'success' },
    { branch: 'denied', label: '拒绝', tone: 'danger' },
  ]
  if (step.type === 'delay') return [{ branch: 'next', label: '继续', tone: 'normal' }]
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
  const ports = outputPorts(step)
  const index = Math.max(0, ports.findIndex(port => port.branch === branch))
  return ports.length <= 1 ? NODE_HEIGHT / 2 : 31 + index * 30
}

const edgePoints = (edge: CanvasEdge) => {
  const sourceStep = props.steps.find(step => step.id === edge.from)
  const source = positionFor(edge.from)
  const target = positionFor(edge.to)
  return {
    from: { x: source.x + NODE_WIDTH, y: source.y + portY(sourceStep || { id: '', type: 'end' }, edge.branch) },
    to: { x: target.x, y: target.y + NODE_HEIGHT / 2 },
  }
}

const edgePathFromPoints = (from: WorkflowNodePosition, to: WorkflowNodePosition) => {
  const bend = Math.max(72, Math.abs(to.x - from.x) * 0.45)
  return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`
}

const edgePath = (edge: CanvasEdge) => {
  const points = edgePoints(edge)
  return edgePathFromPoints(points.from, points.to)
}

const nodeMeta = (step: CanvasStep) => {
  if (step.type === 'mcp') return step.tool || '请选择设备工具'
  if (step.type === 'condition') return 'true / false 双分支'
  if (step.type === 'delay') return `${Number(step.delaySeconds || 0)} 秒`
  if (step.type === 'confirm') return step.message || '等待用户批准'
  return '生成输出并结束'
}

const updatePosition = (stepId: string, position: WorkflowNodePosition) => {
  emit('update:positions', { ...props.positions, [stepId]: position })
}

const startNodeDrag = (event: PointerEvent, step: CanvasStep) => {
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

const canvasPoint = (event: PointerEvent | DragEvent): WorkflowNodePosition => {
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
  const position = positionFor(step.id)
  const from = { x: position.x + NODE_WIDTH, y: position.y + portY(step, connection.value.branch) }
  return edgePathFromPoints(from, previewPoint.value)
})

const startPan = (event: PointerEvent) => {
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

const setZoom = (next: number) => { scale.value = Math.min(1.8, Math.max(0.5, Math.round(next * 10) / 10)) }
const resetView = () => { scale.value = 1; offset.value = { x: 24, y: 24 } }

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
  emit('add', type, position || defaultPosition(props.steps.length))
}

const onDrop = (event: DragEvent) => {
  const type = event.dataTransfer?.getData('application/x-heysure-workflow-step') as WorkflowStepType
  if (palette.some(item => item.type === type)) addStep(type, canvasPoint(event))
}

const onPaletteDrag = (event: DragEvent, type: WorkflowStepType) => {
  event.dataTransfer?.setData('application/x-heysure-workflow-step', type)
}

const selectEdge = (edgeId: string) => {
  selectedEdgeId.value = edgeId
  emit('select', '')
}

const deleteSelectedEdge = () => {
  const edge = edges.value.find(item => item.id === selectedEdgeId.value)
  if (!edge) return
  emit('disconnect', { from: edge.from, branch: edge.branch })
  selectedEdgeId.value = ''
}
</script>

<template>
  <section class="canvas-editor">
    <header class="canvas-toolbar">
      <div>
        <div class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">流程画布</div>
        <div class="text-[10px] text-zinc-500">拖动节点和端点完成编排，双击节点可设为入口</div>
      </div>
      <div class="flex flex-wrap items-center gap-1 text-[10px]">
        <button class="canvas-button" type="button" @click="autoLayout">自动排版</button>
        <button v-if="selectedEdgeId" class="canvas-button text-rose-500" type="button" @click="deleteSelectedEdge">删除连线</button>
        <button class="canvas-button" type="button" @click="setZoom(scale - 0.1)">−</button>
        <button class="canvas-button min-w-12" type="button" @click="resetView">{{ Math.round(scale * 100) }}%</button>
        <button class="canvas-button" type="button" @click="setZoom(scale + 0.1)">＋</button>
      </div>
    </header>

    <div class="flex flex-wrap gap-1.5">
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
      @wheel.prevent="setZoom(scale + ($event.deltaY < 0 ? 0.1 : -0.1))"
      @dragover.prevent
      @drop.prevent="onDrop"
      @keydown.delete.prevent="deleteSelectedEdge"
      @keydown.backspace.prevent="deleteSelectedEdge"
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
          class="workflow-node"
          :class="[`type-${step.type}`, { selected: selectedStepId === step.id }]"
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
          <div class="mt-2 truncate text-xs font-bold text-slate-100">{{ step.id }}</div>
          <div class="mt-1 truncate text-[10px] text-slate-400">{{ nodeMeta(step) }}</div>
          <div
            v-for="port in outputPorts(step)"
            :key="port.branch"
            class="output-port-wrap"
            :style="{ top: `${portY(step, port.branch) - 7}px` }"
          >
            <span class="port-label" :class="`tone-${port.tone}`">{{ port.label }}</span>
            <button
              data-port
              class="node-port output-port"
              :class="`tone-${port.tone}`"
              type="button"
              :aria-label="`${port.label}输出端点`"
              @pointerdown="startConnection($event, step, port.branch)"
            />
          </div>
        </article>
      </div>
      <div v-if="steps.length === 0" class="absolute inset-0 grid place-items-center text-xs text-slate-400">从上方添加第一个流程节点</div>
    </div>

    <p class="text-[10px] leading-5 text-zinc-500">点击节点在右侧编辑属性；从输出端点拖到目标输入端点建立或替换连线。选中连线后可按 Delete 删除。</p>
  </section>
</template>

<style scoped>
.canvas-editor { display: grid; gap: 10px; min-width: 0; }
.canvas-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.canvas-button { border: 1px solid rgb(212 212 216); border-radius: 7px; padding: 5px 8px; background: rgb(255 255 255 / 0.72); }
.workflow-canvas { position: relative; height: clamp(500px, 58vh, 680px); overflow: hidden; border: 1px solid #334155; border-radius: 12px; background-color: #0f172a; background-image: radial-gradient(circle, rgb(148 163 184 / 0.25) 1px, transparent 1px); background-size: 20px 20px; cursor: grab; touch-action: none; }
.workflow-viewport { position: absolute; inset: 0 auto auto 0; width: 2200px; height: 1400px; transform-origin: 0 0; }
.workflow-svg { position: absolute; inset: 0; overflow: visible; }
.workflow-edge { fill: none; stroke: #64748b; stroke-width: 2.2; pointer-events: none; }
.workflow-edge.selected { stroke: #818cf8; stroke-width: 3.2; }
.edge-hit { fill: none; stroke: transparent; stroke-width: 14; cursor: pointer; pointer-events: stroke; }
.edge-preview { fill: none; stroke: #818cf8; stroke-width: 2; stroke-dasharray: 7 5; }
.edge-label { fill: #cbd5e1; font: 700 10px ui-sans-serif, system-ui; }
.workflow-node { position: absolute; width: 184px; height: 92px; box-sizing: border-box; padding: 11px 15px; border: 1px solid #475569; border-radius: 11px; background: #1e293b; box-shadow: 0 10px 24px rgb(0 0 0 / 0.28); cursor: move; user-select: none; }
.workflow-node.selected { border-color: #818cf8; box-shadow: 0 0 0 2px rgb(129 140 248 / 0.26), 0 10px 24px rgb(0 0 0 / 0.28); }
.workflow-node.type-condition { border-top-color: #f59e0b; }
.workflow-node.type-confirm { border-top-color: #e879f9; }
.workflow-node.type-end { border-top-color: #34d399; }
.node-port { position: absolute; width: 15px; height: 15px; padding: 0; border: 2px solid #94a3b8; border-radius: 50%; background: #172033; cursor: crosshair; }
.node-port:hover { border-color: #818cf8; background: #818cf8; }
.input-port { left: -9px; top: 38px; }
.output-port-wrap { position: absolute; right: -9px; height: 15px; }
.output-port { position: relative; inset: auto; display: block; }
.port-label { position: absolute; right: 19px; top: -1px; color: #94a3b8; font-size: 8px; white-space: nowrap; }
.tone-success { border-color: #34d399; color: #6ee7b7; }
.tone-danger { border-color: #fb7185; color: #fda4af; }
@media (prefers-color-scheme: dark) { .canvas-button { border-color: rgb(63 63 70); background: rgb(24 24 27 / 0.72); } }
@media (max-width: 900px) { .canvas-toolbar { align-items: flex-start; flex-direction: column; } .workflow-canvas { height: 480px; } }
</style>
