<script setup lang="ts">
import { computed, ref } from 'vue'
import type { WorkflowStepType } from '@/api/workflowCards'
import {
  defaultPosition,
  palette,
  typeLabels,
  type CanvasEdge,
  type CanvasStep,
  type TouchGesture,
  type WorkflowCanvasConnection,
  type WorkflowNodePosition,
} from './canvasTypes'
import {
  buildCanvasEdges,
  computeAutoLayout,
  edgePath as edgePathOf,
  edgePoints as edgePointsOf,
  nodeMeta,
  outputPorts,
  portY,
  positionFor as locatePosition,
  previewEdgePath,
} from './canvasGraph'
import {
  applyCanvasPinch,
  applyTouchDelta,
  beginPinchGesture,
  canvasPoint as toCanvasPoint,
  draggedNodePosition,
  finishConnectionAt,
  inspectorStyleFor,
  pannedOffset,
  resolveTouchTarget,
  roundedZoom,
  touchClientPoint,
  trackWindowPointer,
} from './canvasGestures'

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

const canvasRef = ref<HTMLElement | null>(null)
const scale = ref(1)
const offset = ref({ x: 24, y: 24 })
const selectedEdgeId = ref('')
const connection = ref<{ from: string; branch: WorkflowCanvasConnection['branch'] } | null>(null)
const previewPoint = ref<WorkflowNodePosition | null>(null)
let touchGesture: TouchGesture | null = null

const positionFor = (stepId: string) => locatePosition(stepId, props.steps, props.positions)
const edges = computed(() => buildCanvasEdges(props.steps))
const edgePath = (edge: CanvasEdge) => edgePathOf(edge, props.steps, props.positions)
const edgePoints = (edge: CanvasEdge) => edgePointsOf(edge, props.steps, props.positions)
const previewPath = computed(() => previewEdgePath(connection.value, previewPoint.value, props.steps, props.positions))

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
  trackWindowPointer((next) => updatePosition(step.id, draggedNodePosition(initial, start, next, scale.value)), () => {})
}

const canvasPoint = (event: { clientX: number; clientY: number }) => (
  toCanvasPoint(event, canvasRef.value, offset.value, scale.value)
)

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
  trackWindowPointer(
    (next) => { previewPoint.value = canvasPoint(next) },
    (next) => {
      const linked = finishConnectionAt(next.clientX, next.clientY, step.id, branch)
      if (linked) emit('connect', linked)
      connection.value = null
      previewPoint.value = null
    },
  )
}

const startPan = (event: PointerEvent) => {
  if (event.pointerType === 'touch') return
  if (event.button !== 0 || (event.target as Element).closest('[data-node], [data-port], [data-edge]')) return
  event.preventDefault()
  emit('select', '')
  selectedEdgeId.value = ''
  const initial = { ...offset.value }
  const start = { x: event.clientX, y: event.clientY }
  trackWindowPointer((next) => { offset.value = pannedOffset(initial, start, next) }, () => {})
}

const setZoom = (next: number) => { scale.value = roundedZoom(next) }
const resetView = () => { scale.value = 1; offset.value = { x: 24, y: 24 } }
const inspectorStyle = computed(() => inspectorStyleFor(
  props.selectedStepId ? positionFor(props.selectedStepId) : null,
  offset.value,
  scale.value,
  canvasRef.value?.clientWidth || 1000,
))

const beginPinch = (first: Touch, second: Touch) => {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return
  touchGesture = beginPinchGesture(first, second, rect, scale.value, offset.value)
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
  const hit = resolveTouchTarget(event.target as HTMLElement)
  if (!props.readonly && hit.output) {
    emit('select', hit.output.stepId)
    connection.value = { from: hit.output.stepId, branch: hit.output.branch }
    previewPoint.value = canvasPoint(touch)
    touchGesture = { kind: 'connection', from: hit.output.stepId, branch: hit.output.branch }
    return
  }
  if (!props.readonly && hit.node) {
    emit('select', hit.node)
    selectedEdgeId.value = ''
    touchGesture = {
      kind: 'node',
      client: touchClientPoint(touch),
      stepId: hit.node,
      position: { ...positionFor(hit.node) },
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
    const next = applyCanvasPinch(event.touches[0], event.touches[1], touchGesture, rect)
    scale.value = next.scale
    offset.value = next.offset
    return
  }
  const touch = event.touches[0]
  if (!touch || !touchGesture) return
  if (touchGesture.kind === 'connection') {
    previewPoint.value = canvasPoint(touch)
    return
  }
  const applied = applyTouchDelta(touchGesture, touch, scale.value)
  if (applied.offset) offset.value = applied.offset
  if (applied.node) updatePosition(applied.node.stepId, applied.node.position)
}

const finishCanvasTouch = (event: TouchEvent) => {
  event.preventDefault()
  if (touchGesture?.kind === 'connection' && event.changedTouches[0]) {
    const touch = event.changedTouches[0]
    const linked = finishConnectionAt(touch.clientX, touch.clientY, touchGesture.from, touchGesture.branch)
    if (linked) emit('connect', linked)
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
  emit('update:positions', computeAutoLayout(props.steps, edges.value, props.startStepId))
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

<style scoped src="./workflowCanvas.css"></style>
