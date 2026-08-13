<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  cloneWorkflowCard,
  createWorkflowCard,
  deleteWorkflowCard,
  exportWorkflowCard,
  getWorkflowCard,
  getWorkflowCardVersion,
  importWorkflowCard,
  listWorkflowCards,
  listWorkflowCardVersions,
  updateWorkflowCard,
  type WorkflowCard,
  type WorkflowCardVersion,
  type WorkflowDefinition,
  type WorkflowStepType,
} from '@/api/workflowCards'
import {
  cancelWorkflowRun,
  confirmWorkflowRun,
  getWorkflowRun,
  listWorkflowConfirmations,
  listWorkflowRuns,
  listWorkflowRunSteps,
  retryWorkflowRun,
  startWorkflowRun,
  type WorkflowConfirmation,
  type WorkflowRun,
  type WorkflowStepRun,
} from '@/api/workflowRuns'
import { getDeviceMcpScope, type DeviceMcpScope } from '@/api/devices'
import { useMessage } from '@/composables/useMessage'
import { usePopupZIndex } from '@/composables/usePopupZIndex'
import { useSnapshotHistory } from '@/composables/useSnapshotHistory'
import WorkflowCanvasEditor from './WorkflowCanvasEditor.vue'

interface DeviceLike {
  id: string
  name?: string
  deviceType?: string
  platform?: string
  online?: boolean
  capabilities?: string[]
}

interface AiMemberLike {
  name: string
  aiConfigId?: number
  aiRole?: string
  digitalMemberRole?: string
  enabled?: boolean
}

const props = defineProps<{ devices: DeviceLike[]; agents: AiMemberLike[]; initialRunId?: string }>()
const { confirm } = useMessage()

type StepEditor = {
  id: string
  title: string
  type: WorkflowStepType
  deviceId: string
  tool: string
  argumentsText: string
  saveAs: string
  next: string
  onError: string
  timeoutSeconds: number
  projection: string
  maxAttempts: number
  backoff: 'fixed' | 'exponential'
  retryDelay: number
  expressionText: string
  onTrue: string
  onFalse: string
  delaySeconds: number
  message: string
  onDenied: string
  extraText: string
}

const AI_INTERVENTION_TOOL = '__workflow.ai_intervention'
const defaultStepTitles: Record<WorkflowStepType, string> = {
  mcp: '设备 MCP',
  condition: '判断分支',
  delay: '等待',
  confirm: '人工确认',
  ai: 'AI 介入',
  end: '结束',
}

type WorkflowNodePosition = { x: number; y: number }
type WorkflowCanvasConnection = {
  from: string
  to: string
  branch: 'next' | 'error' | 'true' | 'false' | 'denied'
}
type StepTargetField = 'next' | 'onError' | 'onTrue' | 'onFalse' | 'onDenied'
type StepClipboard = {
  step: StepEditor
  sourceId: string
  position: WorkflowNodePosition
  pasteCount: number
  restoreIncoming: boolean
  restoreAsStart: boolean
  cutPending: boolean
  incoming: Array<{ stepId: string; field: StepTargetField }>
}

const tab = ref<'cards' | 'runs'>('cards')
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const cards = ref<WorkflowCard[]>([])
const runs = ref<WorkflowRun[]>([])
const cardSearch = ref('')
const cardStatus = ref('')
const editorOpen = ref(false)
const editorZIndex = usePopupZIndex(editorOpen)
const editorFullscreen = ref(false)
const cardSettingsOpen = ref(false)
const deviceSettingsOpen = ref(false)
const editingId = ref('')
const editor = reactive({
  name: '',
  description: '',
  tags: '',
  accessScope: 'all' as 'all' | 'owner' | 'selected',
  allowedAiConfigIds: [] as number[],
  riskLevel: 'read_only',
  inputSchemaText: '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}',
  outputText: '{}',
  timeoutSeconds: 300,
  maxTransitions: 100,
  startStepId: '',
})
const editorSteps = ref<StepEditor[]>([])
const selectedStepId = ref('')
const canvasPositions = ref<Record<string, WorkflowNodePosition>>({})
const editorCompatibility = ref<Record<string, any>>({})
const publishDeviceIds = ref<string[]>([])
const defaultDeviceId = ref('')
const deviceScopes = ref<Record<string, DeviceMcpScope>>({})
const deviceToolsLoading = ref(false)
const deviceToolsError = ref('')
const versions = ref<WorkflowCardVersion[]>([])
const versionPreview = ref<WorkflowCardVersion | null>(null)
const comparisonOpen = ref(false)
const comparisonZIndex = usePopupZIndex(comparisonOpen)
const comparisonDraft = ref<WorkflowDefinition | null>(null)
let stepClipboard: StepClipboard | null = null
let deviceToolsRequestId = 0
let cardSettingsSnapshot = ''
let deviceSettingsSnapshot: { ids: string[]; defaultId: string } = { ids: [], defaultId: '' }

const openCardSettings = () => {
  cardSettingsSnapshot = JSON.stringify({ ...editor, allowedAiConfigIds: [...editor.allowedAiConfigIds] })
  cardSettingsOpen.value = true
}
const closeCardSettings = (save: boolean) => {
  if (!save && cardSettingsSnapshot) Object.assign(editor, JSON.parse(cardSettingsSnapshot))
  cardSettingsOpen.value = false
}
const openDeviceSettings = () => {
  deviceSettingsSnapshot = { ids: [...publishDeviceIds.value], defaultId: defaultDeviceId.value }
  deviceSettingsOpen.value = true
}
const closeDeviceSettings = (save: boolean) => {
  if (!save) {
    publishDeviceIds.value = [...deviceSettingsSnapshot.ids]
    defaultDeviceId.value = deviceSettingsSnapshot.defaultId
  } else if (!publishDeviceIds.value.includes(defaultDeviceId.value)) {
    defaultDeviceId.value = publishDeviceIds.value[0] || ''
  }
  deviceSettingsOpen.value = false
}

const runModalCard = ref<WorkflowCard | null>(null)
const runDeviceId = ref('')
const runInputText = ref('{}')
const selectedRun = ref<WorkflowRun | null>(null)
const selectedSteps = ref<WorkflowStepRun[]>([])
const confirmations = ref<WorkflowConfirmation[]>([])
const pendingConfirmations = ref<Array<{ run: WorkflowRun; confirmation: WorkflowConfirmation }>>([])
const confirmationClock = ref(Date.now())
const confirmationBusyId = ref('')

const onlineDevices = computed(() => (props.devices || []).filter(device => device.online !== false))
const contractDevices = computed(() => [...(props.devices || [])].sort((first, second) => {
  const onlineOrder = Number(second.online !== false) - Number(first.online !== false)
  if (onlineOrder) return onlineOrder
  return String(first.name || first.id).localeCompare(String(second.name || second.id), 'zh-CN')
}))
const ownerTags = ref<string[]>([])
const aiMemberOptions = computed(() => (props.agents || [])
  .filter(agent => Number.isFinite(Number(agent.aiConfigId)) && Number(agent.aiConfigId) > 0)
  .map(agent => ({
    id: Number(agent.aiConfigId),
    name: agent.name,
    role: agent.aiRole === 'assistant_admin'
      ? '辅助管理员'
      : agent.digitalMemberRole === 'manager' ? '管理员' : '普通成员',
    enabled: agent.enabled !== false,
  }))
  .sort((first, second) => first.name.localeCompare(second.name, 'zh-CN')))
const accessMemberOptions = computed(() => {
  const options = [...aiMemberOptions.value]
  const known = new Set(options.map(member => member.id))
  editor.allowedAiConfigIds.forEach(id => {
    if (!known.has(id)) options.push({ id, name: `成员 ${id}`, role: '已删除', enabled: false })
  })
  return options
})
const ownerIds = computed(() => ownerTags.value
  .map(tag => Number(tag.slice('ai_owner:'.length)))
  .filter(id => Number.isFinite(id) && id > 0))
const accessScopeSummary = (card: WorkflowCard) => {
  if (card.access_scope === 'all') return '全员可调用'
  if (card.access_scope === 'selected') return `${(card.allowed_ai_config_ids || []).length} 位成员可调用`
  return '仅创建者可调用'
}
const visibleCardTags = (card: WorkflowCard) => card.tags.filter(tag => !tag.toLowerCase().startsWith('ai_owner:'))

const toolDefsForStep = (row: StepEditor) => deviceScopes.value[row.deviceId]?.toolDefs || {}
const toolNamesForStep = (row: StepEditor) => Object.keys(toolDefsForStep(row)).sort()
const boundMcpDeviceIds = (definition: WorkflowDefinition) => Array.from(new Set(
  Object.values(definition.steps || {})
    .filter(step => step?.type === 'mcp' && step?.toolRef?.name !== AI_INTERVENTION_TOOL)
    .map(step => String(step?.toolRef?.deviceId || '').trim())
    .filter(Boolean),
))
const selectedStep = computed(() => editorSteps.value.find(step => step.id === selectedStepId.value) || null)
const activeStatuses = new Set(['pending', 'running', 'waiting_device', 'waiting_confirmation', 'waiting_ai', 'retry_wait', 'paused_offline'])
const filteredCards = computed(() => {
  const query = cardSearch.value.trim().toLowerCase()
  return cards.value.filter(card =>
    (!cardStatus.value || card.status === cardStatus.value)
    && (!query || `${card.name} ${card.description} ${card.tags.join(' ')}`.toLowerCase().includes(query)),
  )
})
const cardRunSummary = (cardId: string) => {
  const items = runs.value.filter(run => run.card_id === cardId)
  const terminal = items.filter(run => ['succeeded', 'failed', 'cancelled', 'timed_out'].includes(run.status))
  const succeeded = terminal.filter(run => run.status === 'succeeded' && run.output?.status !== 'manual_required').length
  return {
    rate: terminal.length ? `${Math.round((succeeded / terminal.length) * 100)}%` : '—',
    latest: items[0]?.created_at ? new Date(items[0].created_at * 1000).toLocaleString() : '暂无',
  }
}

const emptyStep = (type: WorkflowStepType = 'mcp', index = editorSteps.value.length + 1): StepEditor => ({
  id: type === 'end' ? `finish_${index}` : `step_${index}`,
  title: `${defaultStepTitles[type]} ${index}`,
  type,
  deviceId: '',
  tool: '',
  argumentsText: '{}',
  saveAs: `result_${index}`,
  next: '',
  onError: 'fail',
  timeoutSeconds: 120,
  projection: '',
  maxAttempts: 1,
  backoff: 'fixed',
  retryDelay: 1,
  expressionText: '{\n  "op": "eq",\n  "left": "${input.value}",\n  "right": true\n}',
  onTrue: '',
  onFalse: '',
  delaySeconds: 1,
  message: type === 'ai' ? '请核对当前流程上下文，并返回继续执行所需的参数' : '请确认继续执行此自动化步骤',
  onDenied: '',
  extraText: '{}',
})

const parseJson = <T,>(raw: string, label: string): T => {
  try {
    return JSON.parse(raw) as T
  } catch (cause: any) {
    throw new Error(`${label}不是有效 JSON：${cause?.message || cause}`)
  }
}

const resetMessages = () => {
  error.value = ''
  notice.value = ''
}

const loadCards = async () => {
  loading.value = true
  try {
    cards.value = (await listWorkflowCards({ limit: 200 })).items
  } catch (cause: any) {
    error.value = cause?.message || '自动化卡片加载失败'
  } finally {
    loading.value = false
  }
}

const loadRuns = async () => {
  try {
    runs.value = (await listWorkflowRuns({ limit: 200 })).items
    const waiting = runs.value.filter(item => ['waiting_confirmation', 'waiting_ai'].includes(item.status))
    const pendingRows = await Promise.all(waiting.map(async run => ({
      run,
      items: (await listWorkflowConfirmations(run.id)).items,
    })))
    pendingConfirmations.value = pendingRows.flatMap(({ run, items }) => items
      .filter(confirmation => confirmation.status === 'pending' && confirmation.type !== 'ai_review')
      .map(confirmation => ({ run, confirmation })))
    if (selectedRun.value) {
      selectedRun.value = runs.value.find(item => item.id === selectedRun.value?.id) || selectedRun.value
      await loadRunDetail(selectedRun.value)
    }
  } catch (cause: any) {
    error.value = cause?.message || '运行历史加载失败'
  }
}

const fromStep = (id: string, step: Record<string, any>): StepEditor => {
  const isAi = step.type === 'mcp' && step.toolRef?.name === AI_INTERVENTION_TOOL
  const type = (isAi ? 'ai' : step.type || 'mcp') as WorkflowStepType
  const knownKeys = new Set([
    'type', 'title', 'toolRef', 'arguments', 'saveAs', 'next', 'onError', 'timeoutSeconds',
    'resultProjection', 'retryPolicy', 'expression', 'onTrue', 'onFalse', 'delaySeconds',
    'seconds', 'message', 'riskSummary', 'onDenied',
  ])
  const extra = Object.fromEntries(Object.entries(step).filter(([key]) => !knownKeys.has(key)))
  return ({
  ...emptyStep(type),
  id,
  title: String(step.title || id),
  type,
  deviceId: isAi ? '' : String(step.toolRef?.deviceId || ''),
  tool: isAi ? '' : String(step.toolRef?.name || ''),
  argumentsText: JSON.stringify(step.arguments || {}, null, 2),
  saveAs: String(step.saveAs || ''),
  next: String(step.next || ''),
  onError: String(step.onError || 'fail'),
  timeoutSeconds: Number(step.timeoutSeconds || 120),
  projection: Array.isArray(step.resultProjection) ? step.resultProjection.join(', ') : '',
  maxAttempts: Number(step.retryPolicy?.maxAttempts || 1),
  backoff: step.retryPolicy?.backoff === 'exponential' ? 'exponential' : 'fixed',
  retryDelay: Number(step.retryPolicy?.delaySeconds ?? 1),
  expressionText: JSON.stringify(step.expression || { op: 'eq', left: '${input.value}', right: true }, null, 2),
  onTrue: String(step.onTrue || ''),
  onFalse: String(step.onFalse || ''),
  delaySeconds: Number(step.delaySeconds ?? step.seconds ?? 1),
  message: String((isAi ? step.arguments?.prompt : step.message || step.riskSummary) || '请确认继续执行此自动化步骤'),
  onDenied: String(isAi && step.onError !== 'fail' ? step.onError || '' : step.onDenied || ''),
  extraText: JSON.stringify(extra, null, 2),
  })
}

const openNew = () => {
  detachClipboardFromSource()
  resetMessages()
  editingId.value = ''
  editor.name = '新自动化卡片'
  editor.description = ''
  editor.tags = ''
  editor.accessScope = 'all'
  editor.allowedAiConfigIds = []
  ownerTags.value = []
  editor.riskLevel = 'read_only'
  editor.inputSchemaText = '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}'
  editor.outputText = '{}'
  editor.timeoutSeconds = 300
  editor.maxTransitions = 100
  const end = emptyStep('end', 1)
  end.id = 'finish'
  end.title = '结束'
  editorSteps.value = [end]
  selectedStepId.value = end.id
  canvasPositions.value = { [end.id]: { x: 360, y: 180 } }
  editorCompatibility.value = {}
  editor.startStepId = 'finish'
  versions.value = []
  versionPreview.value = null
  publishDeviceIds.value = []
  defaultDeviceId.value = ''
  deviceScopes.value = {}
  editorOpen.value = true
  resetEditorHistory()
}

const openEdit = async (card: WorkflowCard) => {
  detachClipboardFromSource()
  resetMessages()
  const full = await getWorkflowCard(card.id)
  editingId.value = full.id
  editor.name = full.name
  editor.description = full.description
  ownerTags.value = full.tags.filter(tag => tag.toLowerCase().startsWith('ai_owner:'))
  editor.tags = full.tags.filter(tag => !tag.toLowerCase().startsWith('ai_owner:')).join(', ')
  editor.accessScope = full.access_scope || (ownerTags.value.length ? 'owner' : 'all')
  editor.allowedAiConfigIds = [...(full.allowed_ai_config_ids || [])]
  editor.riskLevel = full.risk_level
  editor.inputSchemaText = JSON.stringify(full.definition.inputSchema || { type: 'object' }, null, 2)
  editor.outputText = JSON.stringify(full.definition.output || {}, null, 2)
  editor.timeoutSeconds = Number(full.definition.limits?.timeoutSeconds || 300)
  editor.maxTransitions = Number(full.definition.limits?.maxTransitions || 100)
  editor.startStepId = String(full.definition.startStepId || '')
  editorSteps.value = Object.entries(full.definition.steps || {}).map(([id, step]) => fromStep(id, step))
  selectedStepId.value = editor.startStepId || editorSteps.value[0]?.id || ''
  editorCompatibility.value = { ...(full.definition.compatibility || {}) }
  const savedPositions = full.definition.compatibility?.editorLayout?.positions
  canvasPositions.value = savedPositions && typeof savedPositions === 'object' ? { ...savedPositions } : {}
  versions.value = (await listWorkflowCardVersions(card.id)).items
  publishDeviceIds.value = [...(versions.value[0]?.contract_device_ids || [])]
  defaultDeviceId.value = versions.value[0]?.default_device_id || publishDeviceIds.value[0] || ''
  versionPreview.value = null
  editorOpen.value = true
  resetEditorHistory()
}

const addStep = (type: WorkflowStepType, position: WorkflowNodePosition = { x: 48, y: 48 }) => {
  let suffix = editorSteps.value.length + 1
  let step = emptyStep(type, suffix)
  while (editorSteps.value.some(item => item.id === step.id)) {
    suffix += 1
    step = emptyStep(type, suffix)
  }
  editorSteps.value.push(step)
  canvasPositions.value = { ...canvasPositions.value, [step.id]: position }
  if (!editor.startStepId) editor.startStepId = step.id
  selectedStepId.value = step.id
}

const clearStepTarget = (step: StepEditor, targetId: string) => {
  if (step.next === targetId) step.next = ''
  if (step.onTrue === targetId) step.onTrue = ''
  if (step.onFalse === targetId) step.onFalse = ''
  if (step.onDenied === targetId) step.onDenied = ''
  if (step.onError === targetId) step.onError = 'fail'
}

const removeStep = (index: number) => {
  const removed = editorSteps.value[index]
  if (!removed) return
  editorSteps.value.splice(index, 1)
  editorSteps.value.forEach(step => clearStepTarget(step, removed.id))
  const positions = { ...canvasPositions.value }
  delete positions[removed.id]
  canvasPositions.value = positions
  if (editor.startStepId === removed.id) editor.startStepId = editorSteps.value[0]?.id || ''
  selectedStepId.value = editorSteps.value[Math.min(index, editorSteps.value.length - 1)]?.id || ''
}

const removeSelectedStep = () => {
  const index = editorSteps.value.findIndex(step => step.id === selectedStepId.value)
  if (index >= 0) removeStep(index)
}

const cloneEditorStep = (step: StepEditor): StepEditor => JSON.parse(JSON.stringify(step)) as StepEditor

const uniqueCopyName = (source: string, used: Set<string>) => {
  const sourceName = source || 'step'
  const withSuffix = (suffix: string) => `${sourceName.slice(0, Math.max(1, 64 - suffix.length))}${suffix}`
  let candidate = withSuffix('_copy')
  let suffix = 2
  while (used.has(candidate)) candidate = withSuffix(`_copy_${suffix++}`)
  return candidate
}

const detachClipboardFromSource = () => {
  if (!stepClipboard) return
  stepClipboard.restoreIncoming = false
  stepClipboard.restoreAsStart = false
  stepClipboard.cutPending = false
}

const incomingTargets = (targetId: string) => {
  const fields: StepTargetField[] = ['next', 'onError', 'onTrue', 'onFalse', 'onDenied']
  return editorSteps.value.flatMap(step => fields
    .filter(field => step[field] === targetId)
    .map(field => ({ stepId: step.id, field })))
}

const copySelectedStep = (cut = false) => {
  const step = selectedStep.value
  if (!step) return false
  stepClipboard = {
    step: cloneEditorStep(step),
    sourceId: step.id,
    position: { ...(canvasPositions.value[step.id] || { x: 48, y: 48 }) },
    pasteCount: 0,
    restoreIncoming: cut,
    restoreAsStart: cut && editor.startStepId === step.id,
    cutPending: cut,
    incoming: cut ? incomingTargets(step.id) : [],
  }
  if (cut) removeSelectedStep()
  return true
}

const remapSelfTargets = (step: StepEditor, sourceId: string, nextId: string) => {
  const fields: StepTargetField[] = ['next', 'onError', 'onTrue', 'onFalse', 'onDenied']
  fields.forEach(field => { if (step[field] === sourceId) step[field] = nextId })
}

const pasteStep = () => {
  if (!stepClipboard) return false
  const clipboard = stepClipboard
  const pasted = cloneEditorStep(clipboard.step)
  pasted.id = uniqueCopyName(clipboard.sourceId, new Set(editorSteps.value.map(step => step.id)))
  if (pasted.type === 'mcp' || pasted.type === 'ai') {
    pasted.saveAs = uniqueCopyName(pasted.saveAs || 'result', new Set(editorSteps.value.map(step => step.saveAs)))
  }
  remapSelfTargets(pasted, clipboard.sourceId, pasted.id)
  const offset = clipboard.cutPending ? 0 : 32 * (clipboard.pasteCount + 1)
  editorSteps.value.push(pasted)
  canvasPositions.value = {
    ...canvasPositions.value,
    [pasted.id]: { x: clipboard.position.x + offset, y: clipboard.position.y + offset },
  }
  if (clipboard.restoreIncoming) {
    clipboard.incoming.forEach(({ stepId, field }) => {
      const source = editorSteps.value.find(step => step.id === stepId)
      if (source) source[field] = pasted.id
    })
  }
  if (clipboard.restoreAsStart) editor.startStepId = pasted.id
  clipboard.pasteCount += 1
  clipboard.cutPending = false
  clipboard.restoreIncoming = false
  clipboard.restoreAsStart = false
  selectedStepId.value = pasted.id
  return true
}

const captureEditorSnapshot = () => ({
  editor: { ...editor },
  steps: JSON.parse(JSON.stringify(editorSteps.value)) as StepEditor[],
  positions: JSON.parse(JSON.stringify(canvasPositions.value)) as Record<string, WorkflowNodePosition>,
})

type WorkflowEditorSnapshot = ReturnType<typeof captureEditorSnapshot>

const restoreEditorSnapshot = (snapshot: WorkflowEditorSnapshot) => {
  Object.assign(editor, snapshot.editor)
  editorSteps.value = JSON.parse(JSON.stringify(snapshot.steps)) as StepEditor[]
  canvasPositions.value = JSON.parse(JSON.stringify(snapshot.positions)) as Record<string, WorkflowNodePosition>
  if (!editorSteps.value.some(step => step.id === selectedStepId.value)) {
    selectedStepId.value = editor.startStepId || editorSteps.value[0]?.id || ''
  }
}

const editorHistory = useSnapshotHistory<WorkflowEditorSnapshot>(restoreEditorSnapshot, {
  limit: 100,
  delay: 220,
})

const resetEditorHistory = () => editorHistory.reset(captureEditorSnapshot())

const isEditableTarget = (target: EventTarget | null) => target instanceof Element
  && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))

const handleEditorShortcut = (event: KeyboardEvent) => {
  if (!editorOpen.value || comparisonOpen.value || event.defaultPrevented || isEditableTarget(event.target)) return
  const key = event.key.toLowerCase()
  const primary = (event.ctrlKey || event.metaKey) && !event.altKey
  const hasSelection = Boolean(window.getSelection()?.toString())
  let handled = false
  if (primary && key === 'z') handled = event.shiftKey ? editorHistory.redo() : editorHistory.undo()
  else if (primary && key === 'y') handled = editorHistory.redo()
  else if (primary && key === 'c' && !hasSelection) handled = copySelectedStep()
  else if (primary && key === 'x' && !hasSelection) handled = copySelectedStep(true)
  else if (primary && key === 'v') handled = pasteStep()
  else if (!primary && (event.key === 'Delete' || event.key === 'Backspace') && selectedStep.value) {
    removeSelectedStep()
    handled = true
  }
  if (handled) event.preventDefault()
}

const connectSteps = ({ from, to, branch }: WorkflowCanvasConnection) => {
  const step = editorSteps.value.find(item => item.id === from)
  if (!step || from === to) return
  if (branch === 'true') step.onTrue = to
  else if (branch === 'false') step.onFalse = to
  else if (branch === 'error') step.onError = to
  else if (branch === 'denied') step.onDenied = to
  else step.next = to
}

const disconnectStep = ({ from, branch }: Omit<WorkflowCanvasConnection, 'to'>) => {
  const step = editorSteps.value.find(item => item.id === from)
  if (!step) return
  if (branch === 'true') step.onTrue = ''
  else if (branch === 'false') step.onFalse = ''
  else if (branch === 'error') step.onError = 'fail'
  else if (branch === 'denied') step.onDenied = ''
  else step.next = ''
}

const uniqueStepIds = () => {
  const ids = editorSteps.value.map(step => step.id.trim())
  if (ids.some(id => !id)) throw new Error('步骤 ID 不能为空')
  if (new Set(ids).size !== ids.length) throw new Error('步骤 ID 必须唯一')
}

const buildDefinition = (): WorkflowDefinition => {
  uniqueStepIds()
  const steps: Record<string, Record<string, any>> = {}
  for (const row of editorSteps.value) {
    const id = row.id.trim()
    const extra = parseJson<Record<string, any>>(row.extraText || '{}', `步骤 ${id} 扩展配置`)
    if (row.type === 'mcp') {
      if (!row.deviceId.trim()) {
        throw new Error(`步骤 ${id}：请先选择此节点绑定的契约设备`)
      }
      if (!publishDeviceIds.value.includes(row.deviceId)) {
        throw new Error(`步骤 ${id}：绑定设备未勾选为契约设备`)
      }
      if (!row.tool.trim()) {
        throw new Error(`步骤 ${id}：请选择绑定设备上报的工具`)
      }
      const definition = toolDefsForStep(row)[row.tool]
      if (!definition) {
        throw new Error(`步骤 ${id}：设备 ${row.deviceId} 当前未上报工具 ${row.tool}`)
      }
      const step: Record<string, any> = {
        ...extra,
        type: 'mcp',
        toolRef: { namespace: 'device', deviceId: row.deviceId, name: row.tool },
        arguments: parseJson(row.argumentsText, `步骤 ${id} 参数`),
        saveAs: row.saveAs.trim(),
        timeoutSeconds: Number(row.timeoutSeconds),
        next: row.next.trim(),
        onError: row.onError.trim() || 'fail',
      }
      const projection = row.projection.split(',').map(item => item.trim()).filter(Boolean)
      if (projection.length) step.resultProjection = projection
      if (row.maxAttempts > 1) {
        step.retryPolicy = {
          maxAttempts: Number(row.maxAttempts),
          backoff: row.backoff,
          delaySeconds: Number(row.retryDelay),
          maxDelaySeconds: 60,
          retryOn: ['DISPATCH_FAILED', 'STEP_TIMEOUT'],
        }
        if (definition.destructive) step.retryPolicy.idempotencyKey = `\${run.id}:${id}`
      }
      steps[id] = step
    } else if (row.type === 'condition') {
      steps[id] = {
        ...extra,
        type: 'condition',
        expression: parseJson(row.expressionText, `步骤 ${id} 条件`),
        onTrue: row.onTrue.trim(),
        onFalse: row.onFalse.trim(),
      }
    } else if (row.type === 'delay') {
      steps[id] = { ...extra, type: 'delay', delaySeconds: Number(row.delaySeconds), next: row.next.trim() }
    } else if (row.type === 'confirm') {
      steps[id] = {
        ...extra,
        type: 'confirm', message: row.message, timeoutSeconds: Number(row.timeoutSeconds),
        next: row.next.trim(), ...(row.onDenied.trim() ? { onDenied: row.onDenied.trim() } : {}),
      }
    } else if (row.type === 'ai') {
      steps[id] = {
        ...extra,
        type: 'mcp',
        toolRef: { namespace: 'device', name: AI_INTERVENTION_TOOL },
        arguments: { prompt: row.message },
        saveAs: row.saveAs.trim(),
        timeoutSeconds: Number(row.timeoutSeconds),
        next: row.next.trim(),
        onError: row.onDenied.trim() || 'fail',
      }
    } else {
      steps[id] = { ...extra, type: 'end' }
    }
    steps[id].title = row.title.trim() || id
  }
  return {
    schemaVersion: 1,
    name: editor.name.trim(),
    description: editor.description.trim(),
    inputSchema: parseJson(editor.inputSchemaText, '输入 Schema'),
    startStepId: editor.startStepId.trim(),
    limits: { timeoutSeconds: Number(editor.timeoutSeconds), maxTransitions: Number(editor.maxTransitions) },
    steps,
    output: parseJson(editor.outputText, '输出映射'),
    compatibility: {
      ...editorCompatibility.value,
      editorLayout: {
        ...(editorCompatibility.value.editorLayout || {}),
        positions: canvasPositions.value,
      },
    },
  }
}

const saveCard = async () => {
  resetMessages()
  const hasMcpStep = editorSteps.value.some(step => step.type === 'mcp')
  if (hasMcpStep && !publishDeviceIds.value.length) {
    error.value = '请至少选择一台用于冻结工具契约的设备'
    return
  }
  const unboundStep = editorSteps.value.find(step => step.type === 'mcp'
    && (!step.deviceId || !publishDeviceIds.value.includes(step.deviceId) || !step.tool))
  if (unboundStep) {
    selectedStepId.value = unboundStep.id
    error.value = `设备 MCP 节点“${unboundStep.title || unboundStep.id}”必须选择契约设备及该设备的工具`
    return
  }
  busy.value = true
  try {
    const wasExisting = Boolean(editingId.value)
    const body = {
      name: editor.name.trim(), description: editor.description.trim(),
      tags: [
        ...editor.tags.split(',').map(item => item.trim()).filter(Boolean),
        ...ownerTags.value,
      ],
      access_scope: editor.accessScope,
      allowed_ai_config_ids: editor.accessScope === 'selected' ? [...editor.allowedAiConfigIds] : [],
      risk_level: editor.riskLevel, definition: buildDefinition(),
      default_device_id: defaultDeviceId.value || publishDeviceIds.value[0] || undefined,
      device_ids: [...publishDeviceIds.value],
    }
    const saved = wasExisting
      ? await updateWorkflowCard(editingId.value, body)
      : await createWorkflowCard(body)
    editingId.value = saved.id
    versions.value = (await listWorkflowCardVersions(saved.id)).items
    notice.value = wasExisting ? '已保存为新版本' : '卡片与第 1 版已创建'
    await loadCards()
  } catch (cause: any) {
    error.value = cause?.message || '保存版本失败'
  } finally {
    busy.value = false
  }
}

const loadDeviceTools = async () => {
  const requestId = ++deviceToolsRequestId
  const deviceIds = [...publishDeviceIds.value]
  deviceScopes.value = {}
  deviceToolsError.value = ''
  if (!deviceIds.length) {
    deviceToolsLoading.value = false
    return
  }
  deviceToolsLoading.value = true
  try {
    const pairs = await Promise.all(deviceIds.map(async id => [id, await getDeviceMcpScope(id)] as const))
    if (requestId !== deviceToolsRequestId) return
    deviceScopes.value = Object.fromEntries(pairs)
  } catch (cause: any) {
    if (requestId !== deviceToolsRequestId) return
    deviceToolsError.value = cause?.message || '设备工具加载失败'
  } finally {
    if (requestId === deviceToolsRequestId) deviceToolsLoading.value = false
  }
}

const changeStepDevice = (row: StepEditor) => {
  row.tool = ''
  row.argumentsText = '{}'
}

const scaffoldArguments = (row: StepEditor) => {
  const schema = toolDefsForStep(row)[row.tool]?.input_schema || {}
  const inputSchema = parseJson<Record<string, any>>(editor.inputSchemaText, '输入 Schema')
  const inputProps = inputSchema.properties || {}
  const args: Record<string, any> = {}
  for (const [name, property] of Object.entries<any>(schema.properties || {})) {
    if (name in inputProps) args[name] = `\${input.${name}}`
    else if (property.default !== undefined) args[name] = property.default
    else if ((schema.required || []).includes(name)) args[name] = property.type === 'boolean' ? false : property.type === 'number' || property.type === 'integer' ? 0 : ''
  }
  row.argumentsText = JSON.stringify(args, null, 2)
}

const toolProperties = (row: StepEditor) => Object.entries<any>(toolDefsForStep(row)[row.tool]?.input_schema?.properties || {})

const stepArgumentValue = (row: StepEditor, name: string) => {
  try {
    return JSON.parse(row.argumentsText || '{}')?.[name] ?? ''
  } catch {
    return ''
  }
}

const setStepArgumentValue = (row: StepEditor, name: string, schema: any, event: Event) => {
  const target = event.target as HTMLInputElement | HTMLSelectElement
  let value: any = target.value
  if (schema?.type === 'boolean') value = value === 'true'
  else if (schema?.type === 'number' || schema?.type === 'integer') value = Number(value)
  let args: Record<string, any> = {}
  try { args = JSON.parse(row.argumentsText || '{}') } catch { /* replace invalid editor text from the generated form */ }
  args[name] = value
  row.argumentsText = JSON.stringify(args, null, 2)
}

const openRun = (card: WorkflowCard) => {
  runModalCard.value = card
  const boundIds = card.definition.contractDeviceIds?.length
    ? card.definition.contractDeviceIds
    : boundMcpDeviceIds(card.definition)
  runDeviceId.value = card.default_device_id || card.definition.defaultDeviceId || boundIds[0] || ''
  const properties = card.definition.inputSchema?.properties || {}
  const sample: Record<string, any> = {}
  for (const [key, cfg] of Object.entries<any>(properties)) {
    sample[key] = cfg.default ?? (cfg.type === 'boolean' ? false : cfg.type === 'number' || cfg.type === 'integer' ? 0 : '')
  }
  runInputText.value = JSON.stringify(sample, null, 2)
}

const startRun = async () => {
  if (!runModalCard.value || !runDeviceId.value) return
  resetMessages()
  busy.value = true
  try {
    const run = await startWorkflowRun(runModalCard.value.id, {
      device_id: runDeviceId.value,
      input: parseJson(runInputText.value, '运行输入'),
      idempotency_key: `web:${crypto.randomUUID()}`,
    })
    runModalCard.value = null
    tab.value = 'runs'
    await loadRuns()
    await loadRunDetail(run)
  } catch (cause: any) {
    error.value = cause?.message || '启动失败'
  } finally {
    busy.value = false
  }
}

const loadRunDetail = async (run: WorkflowRun) => {
  selectedRun.value = run
  const [stepRows, confirmationRows] = await Promise.all([
    listWorkflowRunSteps(run.id), listWorkflowConfirmations(run.id),
  ])
  selectedSteps.value = stepRows.items
  confirmations.value = confirmationRows.items
}

const cancelRun = async (run: WorkflowRun) => {
  await cancelWorkflowRun(run.id)
  await loadRuns()
}

const retryRun = async (run: WorkflowRun) => {
  const next = await retryWorkflowRun(run.id, `web-retry:${run.id}:${crypto.randomUUID()}`)
  await loadRuns()
  await loadRunDetail(next)
}

const cloneCurrentCard = async () => {
  await saveCard()
  if (error.value || !editingId.value) return
  busy.value = true
  try {
    await cloneWorkflowCard(editingId.value)
    notice.value = '卡片副本已创建'
    await loadCards()
  } catch (cause: any) {
    error.value = cause?.message || '卡片复制失败'
  } finally {
    busy.value = false
  }
}

const submitConfirmation = async (run: WorkflowRun, confirmationId: string, approved: boolean) => {
  if (confirmationBusyId.value) return
  resetMessages()
  confirmationBusyId.value = confirmationId
  try {
    const updated = await confirmWorkflowRun(run.id, approved)
    if (selectedRun.value?.id === run.id) selectedRun.value = updated
    notice.value = approved ? '已批准，自动化将继续执行' : '已拒绝，本次自动化已停止'
    await loadRuns()
  } catch (cause: any) {
    error.value = cause?.message || '提交确认失败'
  } finally {
    confirmationBusyId.value = ''
  }
}

const decide = async (approved: boolean) => {
  if (!selectedRun.value) return
  const pending = confirmations.value.find(item => item.status === 'pending' && item.type !== 'ai_review')
  if (!pending) return
  await submitConfirmation(selectedRun.value, pending.id, approved)
}

const decidePending = async (
  item: { run: WorkflowRun; confirmation: WorkflowConfirmation },
  approved: boolean,
) => {
  await submitConfirmation(item.run, item.confirmation.id, approved)
}

const openPendingConfirmation = async (item: { run: WorkflowRun }) => {
  tab.value = 'runs'
  await loadRunDetail(item.run)
}

const focusRequestedRun = async (runId: string) => {
  const safeRunId = runId.trim()
  if (!safeRunId) return
  try {
    const run = runs.value.find(item => item.id === safeRunId) || await getWorkflowRun(safeRunId)
    tab.value = 'runs'
    await loadRunDetail(run)
  } catch (cause: any) {
    error.value = cause?.message || '待确认任务不存在或已无权访问'
  }
}

const confirmationRemaining = (expiresAt: number) => {
  const seconds = Math.max(0, Math.ceil(expiresAt - confirmationClock.value / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

const deleteCurrentCard = async () => {
  if (!editingId.value) return
  const cardId = editingId.value
  const cardName = editor.name
  const approved = await confirm({
    message: `确认删除自动化卡片“${cardName}”？卡片将从列表中移除，历史运行仍保留。`,
    type: 'warning',
  })
  if (!approved) return
  resetMessages()
  busy.value = true
  try {
    await deleteWorkflowCard(cardId)
    editorOpen.value = false
    notice.value = '卡片已删除'
    await loadCards()
  } catch (cause: any) {
    error.value = cause?.message || '卡片删除失败'
  } finally {
    busy.value = false
  }
}

const exportCurrentCard = async () => {
  await saveCard()
  if (error.value || !editingId.value) return
  busy.value = true
  try {
    const payload = await exportWorkflowCard(editingId.value)
    const href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = `${editor.name || 'workflow-card'}.json`
    anchor.click()
    URL.revokeObjectURL(href)
    notice.value = '卡片已导出'
  } catch (cause: any) {
    error.value = cause?.message || '卡片导出失败'
  } finally {
    busy.value = false
  }
}

const importFile = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const payload = JSON.parse(await file.text())
    await importWorkflowCard({
      name: String(payload.name || file.name.replace(/\.json$/i, '')),
      description: String(payload.description || ''),
      tags: Array.isArray(payload.tags) ? payload.tags : [],
      access_scope: ['all', 'owner', 'selected'].includes(payload.access_scope) ? payload.access_scope : 'all',
      allowed_ai_config_ids: Array.isArray(payload.allowed_ai_config_ids) ? payload.allowed_ai_config_ids : [],
      risk_level: String(payload.risk_level || 'read_only'),
      definition: payload.definition || {},
    })
    notice.value = '卡片已导入并创建第 1 版'
    await loadCards()
  } catch (cause: any) {
    error.value = cause?.message || '导入失败'
  } finally {
    input.value = ''
  }
}

const previewVersion = async (version: WorkflowCardVersion) => {
  versionPreview.value = editingId.value
    ? await getWorkflowCardVersion(editingId.value, version.id)
    : version
  comparisonDraft.value = buildDefinition()
  comparisonOpen.value = true
}

type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged'

const definitionSteps = (definition: WorkflowDefinition | null) => Object.entries(definition?.steps || {})
  .map(([id, step]) => fromStep(id, step))

const definitionPositions = (definition: WorkflowDefinition | null) => {
  const positions = definition?.compatibility?.editorLayout?.positions
  return positions && typeof positions === 'object' ? positions as Record<string, WorkflowNodePosition> : {}
}

const comparisonVersionSteps = computed(() => definitionSteps(versionPreview.value?.definition || null))
const comparisonDraftSteps = computed(() => definitionSteps(comparisonDraft.value))
const comparisonVersionPositions = computed(() => definitionPositions(versionPreview.value?.definition || null))
const comparisonDraftPositions = computed(() => definitionPositions(comparisonDraft.value))

const comparisonStatuses = computed(() => {
  const released = versionPreview.value?.definition?.steps || {}
  const draft = comparisonDraft.value?.steps || {}
  const version: Record<string, DiffStatus> = {}
  const current: Record<string, DiffStatus> = {}
  for (const id of new Set([...Object.keys(released), ...Object.keys(draft)])) {
    if (!(id in draft)) version[id] = 'removed'
    else if (!(id in released)) current[id] = 'added'
    else {
      const status = JSON.stringify(released[id]) === JSON.stringify(draft[id]) ? 'unchanged' : 'changed'
      version[id] = status
      current[id] = status
    }
  }
  return { version, current }
})

const statusLabel = (status: string) => ({
  active: '可执行', deprecated: '旧版本', draft: '历史草稿', validated: '历史已校验', published: '可执行',
  pending: '待领取', running: '推进中', waiting_device: '等待设备', waiting_confirmation: '等待确认',
  waiting_ai: '等待 AI', retry_wait: '等待重试', paused_offline: '设备离线', succeeded: '成功', failed: '失败',
  cancelled: '已取消', timed_out: '超时', dispatch_pending: '待派发', dispatching: '派发中',
}[status] || status)

const runStatusLabel = (run: WorkflowRun) => {
  if (run.status === 'succeeded' && run.output?.status === 'published') return '已发布'
  if (run.status === 'succeeded' && run.output?.status === 'manual_required') return '需要人工接管'
  if (run.status === 'succeeded' && run.output?.status === 'ready_for_review') return '待人工检查'
  return statusLabel(run.status)
}

const statusClass = (status: string) => {
  if (status === 'succeeded' || ['active', 'published'].includes(status)) return 'text-emerald-600 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/10'
  if (['failed', 'timed_out', 'cancelled'].includes(status)) return 'text-rose-600 bg-rose-50 dark:text-rose-300 dark:bg-rose-500/10'
  if (['waiting_confirmation', 'waiting_ai', 'paused_offline', 'retry_wait'].includes(status)) return 'text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-500/10'
  return 'text-indigo-600 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-500/10'
}

watch(publishDeviceIds, loadDeviceTools, { deep: true })
watch(tab, value => { if (value === 'runs') loadRuns() })
watch(() => props.initialRunId, value => { if (value) focusRequestedRun(value) })
watch(editorOpen, value => { if (!value) editorFullscreen.value = false })
watch(
  [() => ({ ...editor }), editorSteps, canvasPositions],
  () => { if (editorOpen.value) editorHistory.schedule(captureEditorSnapshot()) },
  { deep: true },
)

let timer: number | undefined
onMounted(async () => {
  window.addEventListener('keydown', handleEditorShortcut)
  await Promise.all([loadCards(), loadRuns()])
  if (props.initialRunId) await focusRequestedRun(props.initialRunId)
  timer = window.setInterval(() => {
    confirmationClock.value = Date.now()
    if (runs.value.some(run => activeStatuses.has(run.status))) loadRuns()
  }, 2500)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleEditorShortcut)
  if (timer) window.clearInterval(timer)
})
</script>

<template>
  <section class="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-indigo-200/80 bg-indigo-50/50 p-3 touch-pan-y custom-scrollbar dark:border-indigo-500/25 dark:bg-indigo-500/5">
    <header class="flex items-center justify-between gap-2">
      <div class="min-w-0 text-left">
        <div class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">自动化卡片</div>
        <div class="text-[10px] text-zinc-500">服务器确定性编排设备 MCP，不逐步调用模型</div>
      </div>
      <span class="rounded-full bg-white/70 px-2 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-900/50">{{ cards.length }} 张</span>
    </header>

    <div v-if="pendingConfirmations.length" class="mt-3 space-y-2">
      <article
        v-for="item in pendingConfirmations"
        :key="item.confirmation.id"
        class="flex w-full flex-col gap-2 rounded-lg border border-amber-300 bg-amber-100/90 px-3 py-2 text-left sm:flex-row sm:items-center sm:justify-between dark:border-amber-500/40 dark:bg-amber-500/15"
      >
        <button type="button" class="min-w-0 flex-1 text-left" @click="openPendingConfirmation(item)">
          <span class="block truncate text-[11px] font-semibold text-amber-800 dark:text-amber-200">待人工确认：{{ cards.find(card => card.id === item.run.card_id)?.name || item.run.card_id }}</span>
          <span class="mt-0.5 block text-[9px] text-amber-700/80 dark:text-amber-200/70">{{ item.confirmation.risk_summary }}</span>
        </button>
        <div class="flex shrink-0 items-center gap-1.5">
          <span class="mr-1 text-[10px] font-medium text-amber-700 dark:text-amber-200">剩余 {{ confirmationRemaining(item.confirmation.expires_at) }}</span>
          <button type="button" class="rounded border border-amber-400 px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-200 disabled:cursor-wait disabled:opacity-50 dark:border-amber-500/50 dark:text-amber-200 dark:hover:bg-amber-500/20" :disabled="Boolean(confirmationBusyId)" @click="openPendingConfirmation(item)">详情</button>
          <button type="button" class="rounded bg-rose-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-rose-700 disabled:cursor-wait disabled:opacity-50" :disabled="Boolean(confirmationBusyId)" @click="decidePending(item, false)">拒绝</button>
          <button type="button" class="rounded bg-emerald-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-50" :disabled="Boolean(confirmationBusyId)" @click="decidePending(item, true)">{{ confirmationBusyId === item.confirmation.id ? '提交中…' : '批准' }}</button>
        </div>
      </article>
    </div>

    <div class="mt-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex rounded-lg bg-white/70 p-0.5 text-xs dark:bg-zinc-900/50">
          <button class="rounded-md px-3 py-1" :class="tab === 'cards' ? 'bg-indigo-600 text-white' : 'text-zinc-500'" @click="tab = 'cards'">卡片</button>
          <button class="rounded-md px-3 py-1" :class="tab === 'runs' ? 'bg-indigo-600 text-white' : 'text-zinc-500'" @click="tab = 'runs'">运行历史</button>
        </div>
        <div v-if="tab === 'cards'" class="flex gap-1">
          <input v-model="cardSearch" class="w-36 rounded-lg border border-zinc-200 bg-white/70 px-2 py-1 text-[11px] dark:border-zinc-700 dark:bg-zinc-900/60" placeholder="搜索名称或标签" />
          <select v-model="cardStatus" class="rounded-lg border border-zinc-200 bg-white/70 px-2 py-1 text-[11px] dark:border-zinc-700 dark:bg-zinc-900/60"><option value="">全部状态</option><option value="active">可执行</option><option value="deprecated">旧版本</option></select>
          <label class="cursor-pointer rounded-lg border border-zinc-200 bg-white/70 px-2 py-1 text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300">
            导入<input type="file" accept="application/json,.json" class="hidden" @change="importFile" />
          </label>
          <button class="rounded-lg bg-indigo-600 px-2 py-1 text-[11px] text-white" @click="openNew">新建卡片</button>
        </div>
      </div>

      <div v-if="error" class="mt-2 rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">{{ error }}</div>
      <div v-if="notice" class="mt-2 rounded-lg bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">{{ notice }}</div>

      <div v-if="tab === 'cards'" class="mt-3 grid grid-cols-1 gap-2">
        <div v-if="!loading && filteredCards.length === 0" class="col-span-full py-6 text-center text-xs text-zinc-400">暂无匹配卡片。</div>
        <article v-for="card in filteredCards" :key="card.id" class="rounded-lg border border-zinc-200 bg-white/75 p-2.5 dark:border-zinc-700 dark:bg-zinc-900/55">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-100">{{ card.name }}</div>
              <div class="mt-0.5 line-clamp-2 text-[10px] text-zinc-500">{{ card.description || '暂无说明' }}</div>
            </div>
            <span class="shrink-0 rounded px-1.5 py-0.5 text-[9px]" :class="statusClass(card.status)">{{ statusLabel(card.status) }}</span>
          </div>
          <div class="mt-2 flex flex-wrap gap-1">
            <span v-for="tag in visibleCardTags(card)" :key="tag" class="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] text-zinc-500 dark:bg-zinc-800">{{ tag }}</span>
            <span class="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] text-zinc-500 dark:bg-zinc-800">{{ card.risk_level }}</span>
            <span class="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">{{ accessScopeSummary(card) }}</span>
          </div>
          <div class="mt-1 text-[9px] text-zinc-400">成功率 {{ cardRunSummary(card.id).rate }} · 最近运行 {{ cardRunSummary(card.id).latest }}</div>
          <div class="mt-2 flex flex-wrap gap-1 text-[10px]">
            <button class="rounded border px-2 py-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" @click="openEdit(card)">编辑</button>
            <button :disabled="!['active', 'published', 'deprecated'].includes(card.status)" class="rounded border border-indigo-200 px-2 py-0.5 text-indigo-600 disabled:opacity-40 dark:border-indigo-500/30 dark:text-indigo-300" @click="openRun(card)">运行</button>
          </div>
        </article>
      </div>

      <div v-else class="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
        <div class="space-y-1.5">
          <button v-for="run in runs" :key="run.id" class="w-full rounded-lg border border-zinc-200 bg-white/75 p-2 text-left dark:border-zinc-700 dark:bg-zinc-900/55" @click="loadRunDetail(run)">
            <div class="flex items-center justify-between gap-2">
              <span class="truncate text-[11px] font-medium">{{ cards.find(card => card.id === run.card_id)?.name || run.card_id }}</span>
              <span class="rounded px-1.5 py-0.5 text-[9px]" :class="statusClass(run.output?.status === 'manual_required' ? 'failed' : run.status)">{{ runStatusLabel(run) }}</span>
            </div>
            <div class="mt-1 text-[9px] text-zinc-400">{{ run.device_id }} · {{ run.current_step_id || '完成' }} · {{ new Date(run.created_at * 1000).toLocaleString() }}</div>
          </button>
          <div v-if="runs.length === 0" class="py-6 text-center text-xs text-zinc-400">暂无运行记录</div>
        </div>
        <div class="rounded-lg border border-zinc-200 bg-white/75 p-2.5 dark:border-zinc-700 dark:bg-zinc-900/55">
          <div v-if="!selectedRun" class="py-8 text-center text-xs text-zinc-400">选择一条运行查看详情</div>
          <template v-else>
            <div class="flex items-center justify-between">
              <div class="text-xs font-semibold">运行详情</div>
              <span class="rounded px-1.5 py-0.5 text-[9px]" :class="statusClass(selectedRun.output?.status === 'manual_required' ? 'failed' : selectedRun.status)">{{ runStatusLabel(selectedRun) }}</span>
            </div>
            <div class="mt-1 break-all text-[9px] text-zinc-400">{{ selectedRun.id }}</div>
            <div v-if="selectedRun.error" class="mt-2 rounded bg-rose-50 p-2 text-[10px] text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">{{ selectedRun.error.code }}：{{ selectedRun.error.message }}</div>
            <pre v-if="selectedRun.output" class="mt-2 max-h-36 overflow-auto rounded bg-zinc-950 p-2 text-[9px] text-emerald-300">{{ JSON.stringify(selectedRun.output, null, 2) }}</pre>
            <div class="mt-2 flex gap-1 text-[10px]">
              <button v-if="activeStatuses.has(selectedRun.status)" class="rounded border border-rose-200 px-2 py-1 text-rose-500" @click="cancelRun(selectedRun)">取消</button>
              <button v-if="['failed', 'timed_out', 'cancelled'].includes(selectedRun.status)" class="rounded border border-indigo-200 px-2 py-1 text-indigo-600" @click="retryRun(selectedRun)">新运行重试</button>
            </div>
            <div v-for="confirmation in confirmations.filter(item => item.status === 'pending')" :key="confirmation.id" class="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 dark:border-amber-500/30 dark:bg-amber-500/10">
              <template v-if="confirmation.type === 'ai_review'">
                <div class="text-[10px] font-medium text-amber-700 dark:text-amber-200">{{ confirmation.type === 'ai_review' ? '等待 AI 核对' : '等待 AI 转达确认' }}：{{ confirmation.risk_summary }}</div>
                <div class="mt-1 text-[9px] text-amber-600/80 dark:text-amber-200/70">{{ confirmation.notified_at ? 'AI 已收到通知，正在处理' : '正在通知负责本次运行的 AI' }}</div>
              </template>
              <template v-else>
                <div class="text-[10px] font-medium text-amber-700 dark:text-amber-200">人工授权：{{ confirmation.risk_summary }}</div>
                <div class="mt-1 text-[9px] text-amber-600/80 dark:text-amber-200/70">剩余 {{ confirmationRemaining(confirmation.expires_at) }}；手机与网页均可处理，原任务保持等待</div>
                <div class="mt-1 flex gap-1"><button class="rounded bg-emerald-600 px-2 py-0.5 text-[10px] text-white disabled:cursor-wait disabled:opacity-50" :disabled="Boolean(confirmationBusyId)" @click="decide(true)">{{ confirmationBusyId === confirmation.id ? '提交中…' : '批准' }}</button><button class="rounded bg-rose-600 px-2 py-0.5 text-[10px] text-white disabled:cursor-wait disabled:opacity-50" :disabled="Boolean(confirmationBusyId)" @click="decide(false)">拒绝</button></div>
              </template>
            </div>
            <div class="mt-3 text-[10px] font-semibold text-zinc-500">步骤</div>
            <div class="mt-1 space-y-1">
              <div v-for="step in selectedSteps" :key="step.id" class="rounded border border-zinc-200 p-1.5 text-[9px] dark:border-zinc-700">
                <div class="flex justify-between"><span>{{ step.step_id }} · {{ step.tool_name || '控制步骤' }} · #{{ step.attempt }}</span><span>{{ statusLabel(step.status) }}</span></div>
                <div v-if="step.error" class="mt-1 text-rose-500">{{ step.error.code }}：{{ step.error.message }}</div>
                <pre v-if="step.result" class="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-zinc-500">{{ JSON.stringify(step.result, null, 2) }}</pre>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <Teleport to="body">
    <div v-if="editorOpen" class="fixed inset-0 flex justify-center overflow-y-auto bg-zinc-950/45 backdrop-blur-sm" :class="editorFullscreen ? 'p-0' : 'p-3'" :style="{ zIndex: editorZIndex }" @click.self="editorOpen = false">
      <div class="automation-editor-modal w-full border p-4 shadow-2xl" :class="editorFullscreen ? 'is-fullscreen min-h-app-viewport max-w-none rounded-none' : 'my-auto max-w-[1500px] rounded-xl'">
        <div class="automation-editor-header flex items-center justify-between gap-3">
          <div class="automation-editor-title text-sm font-semibold">{{ editingId ? '编辑自动化卡片' : '新建自动化卡片' }}</div>
          <div class="flex items-center gap-1">
            <button class="automation-editor-close" :aria-label="editorFullscreen ? '退出全屏编辑' : '全屏编辑'" :title="editorFullscreen ? '退出全屏' : '全屏编辑'" @click="editorFullscreen = !editorFullscreen">{{ editorFullscreen ? '↙' : '⛶' }}</button>
            <button class="automation-editor-close" aria-label="关闭自动化卡片编辑器" title="关闭" @click="editorOpen = false">✕</button>
          </div>
        </div>
        <div v-if="error" class="mt-2 rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">{{ error }}</div>
        <div v-if="notice" class="mt-2 rounded-lg bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">{{ notice }}</div>
        <div v-if="cardSettingsOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/55 p-4" @click.self="closeCardSettings(false)">
        <section class="automation-editor-section max-h-[85vh] w-full max-w-5xl overflow-auto rounded-xl border p-4 shadow-2xl">
          <header class="flex items-center justify-between gap-3"><div class="text-sm font-semibold">卡片设置</div><button class="rounded border px-2 py-1 text-xs" @click="closeCardSettings(false)">✕</button></header>
          <div class="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-4">
            <label class="text-[10px] text-zinc-500">名称<input v-model="editor.name" class="mt-1 w-full rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950" /></label>
            <label class="text-[10px] text-zinc-500">标签（逗号分隔）<input v-model="editor.tags" class="mt-1 w-full rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950" /></label>
            <label class="text-[10px] text-zinc-500">风险等级<select v-model="editor.riskLevel" class="mt-1 w-full rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"><option value="read_only">只读</option><option value="normal_change">普通变更</option><option value="high_risk">高风险</option></select></label>
            <label class="text-[10px] text-zinc-500">入口步骤<select v-model="editor.startStepId" class="mt-1 w-full rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"><option v-for="step in editorSteps" :key="step.id" :value="step.id">{{ step.title || step.id }}</option></select></label>
            <label class="md:col-span-2 lg:col-span-4 text-[10px] text-zinc-500">说明<textarea v-model="editor.description" rows="2" class="mt-1 w-full rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950" /></label>
            <label class="text-[10px] text-zinc-500">总超时（秒）<input v-model.number="editor.timeoutSeconds" type="number" class="mt-1 w-full rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950" /></label>
            <label class="text-[10px] text-zinc-500">最大推进次数<input v-model.number="editor.maxTransitions" type="number" class="mt-1 w-full rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950" /></label>
            <label class="md:col-span-2 text-[10px] text-zinc-500">输入 JSON Schema<textarea v-model="editor.inputSchemaText" rows="6" class="mt-1 w-full rounded border p-2 font-mono text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label>
            <label class="md:col-span-2 text-[10px] text-zinc-500">输出映射<textarea v-model="editor.outputText" rows="6" class="mt-1 w-full rounded border p-2 font-mono text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label>
          </div>
          <div class="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 dark:border-indigo-500/20 dark:bg-indigo-500/5">
            <div class="text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">允许调用的 AI 成员</div>
            <div class="mt-2 flex flex-wrap gap-3 text-[10px] text-zinc-600 dark:text-zinc-300">
              <label class="flex items-center gap-1"><input v-model="editor.accessScope" type="radio" value="all" /> 所有成员</label>
              <label class="flex items-center gap-1" :class="{ 'opacity-40': ownerIds.length === 0 }"><input v-model="editor.accessScope" type="radio" value="owner" :disabled="ownerIds.length === 0" /> 仅创建者</label>
              <label class="flex items-center gap-1"><input v-model="editor.accessScope" type="radio" value="selected" /> 指定成员</label>
            </div>
            <div v-if="editor.accessScope === 'selected'" class="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              <label v-for="member in accessMemberOptions" :key="member.id" class="flex items-center gap-2 rounded border bg-white/70 px-2 py-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-900/60">
                <input v-model="editor.allowedAiConfigIds" type="checkbox" :value="member.id" />
                <span class="min-w-0 flex-1 truncate">{{ member.name }}</span>
                <span class="shrink-0 text-[9px] text-zinc-400">{{ member.role }}{{ member.enabled ? '' : ' · 已停用' }}</span>
              </label>
              <div v-if="accessMemberOptions.length === 0" class="text-[10px] text-zinc-400">暂无可选 AI 成员。</div>
            </div>
            <div v-else-if="editor.accessScope === 'owner'" class="mt-2 text-[10px] text-zinc-400">创建者：{{ ownerIds.map(id => aiMemberOptions.find(member => member.id === id)?.name || `成员 ${id}`).join('、') }}</div>
            <div class="mt-2 text-[9px] text-zinc-400">管理员或辅助管理员创建时默认全员可调用；普通成员创建时默认仅自己可调用。</div>
          </div>
          <footer class="mt-4 flex justify-end gap-2"><button class="rounded border px-3 py-1.5 text-xs" @click="closeCardSettings(false)">取消</button><button class="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white" @click="closeCardSettings(true)">保存设置</button></footer>
        </section>
        </div>

        <div v-if="deviceSettingsOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/55 p-4" @click.self="closeDeviceSettings(false)">
        <section class="contract-device-select w-full max-w-3xl rounded-xl border shadow-2xl">
          <header class="flex items-center justify-between gap-3 px-3 py-2.5 text-xs"><span class="font-semibold">契约设备（多选）</span><button class="rounded border px-2 py-1" @click="closeDeviceSettings(false)">✕</button></header>
          <div class="contract-device-options border-t p-2.5">
            <div class="grid max-h-48 gap-1 overflow-y-auto overscroll-contain pr-1 custom-scrollbar sm:grid-cols-2 lg:grid-cols-3">
              <label
                v-for="device in contractDevices"
                :key="device.id"
                class="flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-[10px]"
                :class="device.online === false ? 'opacity-60' : ''"
              >
                <input
                  v-model="publishDeviceIds"
                  type="checkbox"
                  :value="device.id"
                  :disabled="device.online === false && !publishDeviceIds.includes(device.id)"
                />
                <span class="min-w-0"><span class="block truncate">{{ device.name || '未命名设备' }}</span><span class="block truncate font-mono text-[9px] text-zinc-400">{{ device.id }}</span></span>
                <span class="ml-auto shrink-0 text-zinc-400">{{ device.online === false ? '离线' : (device.deviceType || device.platform) }}</span>
              </label>
              <div v-if="!contractDevices.length" class="text-[10px] text-zinc-400">暂无可选设备</div>
            </div>
            <label class="mt-2 block text-[10px] text-zinc-500">默认设备<select v-model="defaultDeviceId" class="mt-1 w-full rounded border px-2 py-1.5 font-mono text-[10px] dark:border-zinc-700 dark:bg-zinc-950"><option value="">请选择默认设备</option><option v-for="deviceId in publishDeviceIds" :key="deviceId" :value="deviceId">{{ contractDevices.find(item => item.id === deviceId)?.name || '未命名设备' }} · {{ deviceId }}</option></select></label>
            <div class="mt-2 text-[10px] leading-5 text-zinc-500">
              <span v-if="deviceToolsLoading">正在读取所选设备的 MCP 工具…</span>
              <span v-else-if="deviceToolsError" class="text-rose-500">{{ deviceToolsError }}</span>
              <span v-else>已读取 {{ Object.keys(deviceScopes).length }} 台契约设备的独立工具清单。</span>
              每个 MCP 节点可分别绑定一台已选设备及其工具。
            </div>
          </div>
          <footer class="flex justify-end gap-2 border-t p-3"><button class="rounded border px-3 py-1.5 text-xs" @click="closeDeviceSettings(false)">取消</button><button class="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white" @click="closeDeviceSettings(true)">保存设置</button></footer>
        </section>
        </div>

        <div class="mt-3">
          <WorkflowCanvasEditor
            :steps="editorSteps"
            :start-step-id="editor.startStepId"
            :selected-step-id="selectedStepId"
            :positions="canvasPositions"
            @select="selectedStepId = $event"
            @add="addStep"
            @connect="connectSteps"
            @disconnect="disconnectStep"
            @set-start="editor.startStepId = $event"
            @update:positions="canvasPositions = $event"
          >
          <template #bottom-left>
            <button class="canvas-overlay-button" type="button" @click="openCardSettings">卡片设置</button>
            <button class="canvas-overlay-button" type="button" @click="openDeviceSettings">契约设备 · {{ publishDeviceIds.length }}</button>
          </template>
          <template #inspector>

          <aside class="automation-editor-inspector">
            <template v-if="selectedStep">
              <div class="flex items-center justify-between gap-2">
                <div class="automation-editor-subtitle text-xs font-semibold">节点属性</div>
                <div class="flex gap-1"><button class="rounded border px-2 py-1 text-[9px] text-indigo-600" @click="editor.startStepId = selectedStep.id">设为入口</button><button class="rounded border border-rose-200 px-2 py-1 text-[9px] text-rose-500" @click="removeSelectedStep">删除</button></div>
              </div>
              <div class="mt-3 grid gap-2">
                <label class="text-[9px] text-zinc-500">步骤标题<input v-model="selectedStep.title" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label>
                <label class="text-[9px] text-zinc-500">类型<select v-model="selectedStep.type" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950"><option v-for="kind in (['mcp','condition','delay','confirm','ai','end'] as WorkflowStepType[])" :key="kind">{{ kind }}</option></select></label>

                <template v-if="selectedStep.type === 'mcp'">
                  <label class="text-[9px] text-zinc-500">节点绑定设备<select v-model="selectedStep.deviceId" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" @change="changeStepDevice(selectedStep)"><option value="">选择契约设备</option><option v-for="device in onlineDevices.filter(item => publishDeviceIds.includes(item.id))" :key="device.id" :value="device.id">{{ device.name || '未命名设备' }} · {{ device.id }} · {{ device.deviceType || device.platform }}</option></select></label>
                  <label class="text-[9px] text-zinc-500">设备工具<select v-model="selectedStep.tool" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" @change="scaffoldArguments(selectedStep)"><option value="">{{ deviceToolsLoading ? '正在加载设备工具…' : deviceToolsError ? '设备工具加载失败' : !selectedStep.deviceId ? '请先选择节点绑定设备' : toolNamesForStep(selectedStep).length ? '选择该设备的工具' : '该设备没有可用工具' }}</option><option v-if="selectedStep.tool && !toolNamesForStep(selectedStep).includes(selectedStep.tool)" :value="selectedStep.tool" disabled>{{ selectedStep.tool }}（绑定设备当前未上报）</option><option v-for="tool in toolNamesForStep(selectedStep)" :key="tool">{{ tool }}</option></select></label>
                  <label class="text-[9px] text-zinc-500">结果保存为<input v-model="selectedStep.saveAs" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label>
                  <label class="text-[9px] text-zinc-500">参数模板<textarea v-model="selectedStep.argumentsText" rows="6" class="mt-1 w-full rounded border p-1.5 font-mono text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label>
                  <div v-if="toolProperties(selectedStep).length" class="grid gap-1 rounded border border-dashed border-zinc-200 p-2 dark:border-zinc-700"><div class="text-[9px] font-medium text-zinc-500">Schema 参数</div><label v-for="([name, schema]) in toolProperties(selectedStep)" :key="name" class="text-[9px] text-zinc-500">{{ name }}<span v-if="(toolDefsForStep(selectedStep)[selectedStep.tool]?.input_schema?.required || []).includes(name)" class="text-rose-500"> *</span><select v-if="schema.type === 'boolean'" :value="String(stepArgumentValue(selectedStep, name))" class="mt-0.5 w-full rounded border p-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" @change="setStepArgumentValue(selectedStep, name, schema, $event)"><option value="true">true</option><option value="false">false</option></select><input v-else :type="schema.type === 'number' || schema.type === 'integer' ? 'number' : 'text'" :value="stepArgumentValue(selectedStep, name)" :placeholder="schema.description || schema.type" class="mt-0.5 w-full rounded border p-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" @input="setStepArgumentValue(selectedStep, name, schema, $event)" /></label></div>
                  <details class="rounded border border-zinc-200 p-2 dark:border-zinc-700"><summary class="cursor-pointer text-[9px] font-medium text-zinc-500">重试与结果设置</summary><div class="mt-2 grid grid-cols-2 gap-1"><label class="text-[9px] text-zinc-500">超时<input v-model.number="selectedStep.timeoutSeconds" type="number" class="mt-0.5 w-full rounded border p-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label><label class="text-[9px] text-zinc-500">最大尝试<input v-model.number="selectedStep.maxAttempts" type="number" min="1" max="10" class="mt-0.5 w-full rounded border p-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label><label class="text-[9px] text-zinc-500">退避<select v-model="selectedStep.backoff" class="mt-0.5 w-full rounded border p-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-950"><option value="fixed">固定</option><option value="exponential">指数</option></select></label><label class="text-[9px] text-zinc-500">重试等待<input v-model.number="selectedStep.retryDelay" type="number" class="mt-0.5 w-full rounded border p-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label><label class="col-span-2 text-[9px] text-zinc-500">结果投影<input v-model="selectedStep.projection" class="mt-0.5 w-full rounded border p-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" placeholder="字段以逗号分隔" /></label></div></details>
                </template>

                <label v-else-if="selectedStep.type === 'condition'" class="text-[9px] text-zinc-500">条件表达式<textarea v-model="selectedStep.expressionText" rows="8" class="mt-1 w-full rounded border p-1.5 font-mono text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label>
                <label v-else-if="selectedStep.type === 'delay'" class="text-[9px] text-zinc-500">延迟秒数<input v-model.number="selectedStep.delaySeconds" type="number" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label>
                <template v-else-if="selectedStep.type === 'confirm'"><label class="text-[9px] text-zinc-500">需要 AI 向用户发送的确认问题<input v-model="selectedStep.message" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label><label class="text-[9px] text-zinc-500">确认超时<input v-model.number="selectedStep.timeoutSeconds" type="number" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label></template>
                <template v-else-if="selectedStep.type === 'ai'"><label class="text-[9px] text-zinc-500">AI 核对说明<textarea v-model="selectedStep.message" rows="5" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label><label class="text-[9px] text-zinc-500">回调参数保存为<input v-model="selectedStep.saveAs" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" placeholder="ai_review" /></label><label class="text-[9px] text-zinc-500">AI 回调超时<input v-model.number="selectedStep.timeoutSeconds" type="number" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label><div class="rounded bg-sky-50 p-2 text-[9px] text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">回调参数可在后续节点中用 ${steps.保存名.result.字段} 引用。</div></template>
                <div v-else class="rounded-lg bg-emerald-50 p-3 text-[10px] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">结束节点会生成卡片输出并终止运行。</div>
              </div>
            </template>
          </aside>
          </template>
          </WorkflowCanvasEditor>
        </div>

        <div v-if="versions.length" class="mt-3"><div class="text-[10px] font-semibold text-zinc-500">历史版本与当前未保存修改</div><div class="mt-1 flex flex-wrap gap-1"><button v-for="version in versions" :key="version.id" class="rounded border px-2 py-0.5 text-[9px]" @click="previewVersion(version)">画布对比 v{{ version.version_number }}</button></div></div>
        <div class="automation-editor-footer mt-4 flex flex-wrap items-center justify-between gap-2"><div class="flex gap-2"><button v-if="editingId" :disabled="busy" class="rounded border border-rose-200 px-3 py-1.5 text-xs text-rose-600 dark:border-rose-500/30 dark:text-rose-300" @click="deleteCurrentCard">删除卡片</button><button v-if="editingId" :disabled="busy" class="rounded border px-3 py-1.5 text-xs" @click="cloneCurrentCard">复制</button><button v-if="editingId" :disabled="busy" class="rounded border px-3 py-1.5 text-xs" @click="exportCurrentCard">导出</button></div><div class="flex flex-wrap justify-end gap-2"><button class="rounded border px-3 py-1.5 text-xs" @click="editorOpen = false">舍弃修改</button><button :disabled="busy" class="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white" @click="saveCard">{{ editingId ? '保存为新版本' : '创建卡片' }}</button></div></div>
      </div>
    </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="comparisonOpen && versionPreview?.definition && comparisonDraft" class="fixed inset-0 flex items-center justify-center overflow-auto bg-zinc-950/55 p-3 backdrop-blur-sm" :style="{ zIndex: comparisonZIndex }" @click.self="comparisonOpen = false">
        <section class="automation-diff-modal w-full max-w-[1800px] rounded-xl border bg-white p-4 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
          <header class="flex flex-wrap items-center justify-between gap-3">
            <div><div class="text-sm font-semibold">版本画布对比 · v{{ versionPreview.version_number }}</div><div class="mt-1 text-[10px] text-zinc-500">节点内容或连线目标变化均标记为“已修改”</div></div>
            <div class="flex flex-wrap items-center gap-3 text-[10px]"><span class="text-emerald-500">● 新增</span><span class="text-rose-500">● 删除</span><span class="text-amber-500">● 修改</span><span class="text-zinc-400">● 未变化</span><button class="rounded border px-2 py-1" @click="comparisonOpen = false">关闭</button></div>
          </header>
          <div class="mt-3 grid gap-3 xl:grid-cols-2">
            <div><div class="mb-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">历史版本 v{{ versionPreview.version_number }}</div><WorkflowCanvasEditor readonly :steps="comparisonVersionSteps" :start-step-id="versionPreview.definition.startStepId" selected-step-id="" :positions="comparisonVersionPositions" :node-statuses="comparisonStatuses.version" /></div>
            <div><div class="mb-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">当前未保存修改</div><WorkflowCanvasEditor readonly :steps="comparisonDraftSteps" :start-step-id="comparisonDraft.startStepId" selected-step-id="" :positions="comparisonDraftPositions" :node-statuses="comparisonStatuses.current" /></div>
          </div>
        </section>
      </div>
    </Teleport>

    <div v-if="runModalCard" class="absolute inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-4 backdrop-blur-sm" @click.self="runModalCard = null"><div class="w-full max-w-lg rounded-xl bg-white p-4 shadow-2xl dark:bg-zinc-900"><div class="flex justify-between"><div class="text-sm font-semibold">运行 {{ runModalCard.name }}</div><button @click="runModalCard = null">✕</button></div><div class="mt-3 rounded border border-indigo-200 bg-indigo-50 p-2 text-[10px] text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">可指定本次运行设备；不指定时服务端使用卡片默认设备。多端卡片中，显式绑定到其他设备的节点保持原绑定。</div><label class="mt-3 block text-[10px] text-zinc-500">本次运行设备<select v-model="runDeviceId" class="mt-1 w-full rounded border p-2 text-[10px] dark:border-zinc-700 dark:bg-zinc-950"><option v-for="deviceId in (runModalCard.definition.contractDeviceIds || boundMcpDeviceIds(runModalCard.definition))" :key="deviceId" :value="deviceId">{{ props.devices.find(item => item.id === deviceId)?.name || '未命名设备' }} · {{ deviceId }}</option></select></label><label class="mt-3 block text-[10px] text-zinc-500">运行输入<textarea v-model="runInputText" rows="10" class="mt-1 w-full rounded border p-2 font-mono text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label><div class="mt-3 flex justify-end gap-2"><button class="rounded border px-3 py-1.5 text-xs" @click="runModalCard = null">取消</button><button :disabled="busy || !runDeviceId" class="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white disabled:opacity-50" @click="startRun">启动</button></div></div></div>
  </section>
</template>

<style scoped>
.canvas-overlay-button {
  min-height: 34px;
  border: 1px solid #475569;
  border-radius: 7px;
  padding: 6px 10px;
  color: #e2e8f0;
  background: rgb(30 41 59 / 0.96);
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 8px 20px rgb(0 0 0 / 0.25);
}
.canvas-overlay-button:hover { border-color: #818cf8; color: #c7d2fe; }
.automation-editor-modal {
  --editor-surface: #f8fafc;
  --editor-panel: #eef2f7;
  --editor-field: #e8eef5;
  --editor-field-focus: #f1f5ff;
  --editor-border: #b8c4d3;
  --editor-heading: #3730a3;
  --editor-label: #3f3f46;
  --editor-muted: #52525b;
  --editor-text: #18181b;
  border-color: #c7d2fe;
  color: var(--editor-text);
  background:
    linear-gradient(180deg, rgb(238 242 255 / 0.72), transparent 180px),
    var(--editor-surface);
  font-size: 14px;
}

.automation-editor-modal.is-fullscreen :deep(.workflow-canvas) {
  height: max(620px, calc(100dvh - 390px));
}

.automation-editor-header {
  padding-bottom: 12px;
  border-bottom: 1px solid #dbe3ee;
}

.automation-editor-title,
.automation-editor-subtitle {
  color: var(--editor-heading);
}

.automation-editor-close {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid #c7d2fe;
  border-radius: 8px;
  color: #4f46e5;
  background: #e0e7ff;
  transition: border-color 150ms ease, background-color 150ms ease, color 150ms ease;
}

.automation-editor-close:hover {
  border-color: #a5b4fc;
  color: #3730a3;
  background: #c7d2fe;
}

.automation-editor-section {
  border-color: #c7d2fe !important;
  background: rgb(238 242 255 / 0.52);
}

.automation-editor-inspector {
  border-color: var(--editor-border) !important;
  background: var(--editor-panel) !important;
}

.contract-device-select {
  border-color: var(--editor-border) !important;
  background: var(--editor-panel);
}

.contract-device-select[open] > summary {
  background: rgb(99 102 241 / 0.08);
}

.contract-device-select > summary::after {
  content: '⌄';
  flex: 0 0 auto;
  color: var(--editor-muted);
  transition: transform 150ms ease;
}

.contract-device-select > summary::-webkit-details-marker {
  display: none;
}

.contract-device-select[open] > summary::after {
  transform: rotate(180deg);
}

.contract-device-options {
  border-color: var(--editor-border) !important;
}

.contract-device-options label {
  border-color: var(--editor-border) !important;
  background: var(--editor-field);
}

.automation-editor-footer {
  padding-top: 14px;
  border-top: 1px solid #dbe3ee;
}

.automation-diff-modal :deep(.workflow-canvas) {
  height: min(58vh, 640px);
}

.automation-diff-modal :deep(.canvas-editor) {
  min-width: 0;
}

.automation-editor-modal :deep(.text-\[9px\]) {
  font-size: 12px;
  line-height: 1.45;
}

.automation-editor-modal :deep(.text-\[10px\]),
.automation-editor-modal :deep(.text-\[11px\]),
.automation-editor-modal :deep(.text-xs) {
  font-size: 13px;
  line-height: 1.5;
}

.automation-editor-modal :deep(.text-sm) {
  font-size: 15px;
}

.automation-editor-modal :deep(.text-zinc-400),
.automation-editor-modal :deep(.text-zinc-500) {
  color: var(--editor-muted);
}

.automation-editor-modal label {
  color: var(--editor-label) !important;
  font-weight: 600;
}

.automation-editor-modal summary {
  color: var(--editor-heading) !important;
  font-weight: 700;
}

.automation-editor-modal input,
.automation-editor-modal select,
.automation-editor-modal textarea {
  border-color: var(--editor-border) !important;
  color: var(--editor-text) !important;
  background-color: var(--editor-field) !important;
  font-size: 13px;
  font-weight: 500;
  opacity: 1 !important;
  transition: border-color 150ms ease, background-color 150ms ease, box-shadow 150ms ease;
}

.automation-editor-modal input:hover,
.automation-editor-modal select:hover,
.automation-editor-modal textarea:hover {
  border-color: #94a3b8 !important;
}

.automation-editor-modal input:focus,
.automation-editor-modal select:focus,
.automation-editor-modal textarea:focus {
  border-color: #6366f1 !important;
  outline: none;
  background-color: var(--editor-field-focus) !important;
  box-shadow: 0 0 0 3px rgb(99 102 241 / 0.16);
}

.automation-editor-modal select option {
  color: var(--editor-text) !important;
  background-color: var(--editor-panel) !important;
}

.automation-editor-modal input::placeholder,
.automation-editor-modal textarea::placeholder {
  color: #64748b !important;
  opacity: 1;
}

:global(.dark .automation-editor-modal) {
  --editor-surface: #111827;
  --editor-panel: #172033;
  --editor-field: #1e293b;
  --editor-field-focus: #222d45;
  --editor-border: #475569;
  --editor-heading: #c7d2fe;
  --editor-label: #e4e4e7;
  --editor-muted: #a1a1aa;
  --editor-text: #f4f4f5;
  border-color: #374151;
  background:
    linear-gradient(180deg, rgb(49 46 129 / 0.24), transparent 190px),
    var(--editor-surface);
}

:global(.dark .automation-editor-header),
:global(.dark .automation-editor-footer) {
  border-color: #334155;
}

:global(.dark .automation-editor-close) {
  border-color: #4338ca;
  color: #c7d2fe;
  background: rgb(49 46 129 / 0.55);
}

:global(.dark .automation-editor-close:hover) {
  border-color: #6366f1;
  color: #eef2ff;
  background: rgb(67 56 202 / 0.68);
}

:global(.dark .automation-editor-section) {
  border-color: #373e68 !important;
  background: rgb(49 46 129 / 0.13);
}

:global(.dark .automation-editor-modal .text-zinc-400),
:global(.dark .automation-editor-modal .text-zinc-500),
:global(.dark .automation-editor-modal label) {
  color: var(--editor-label) !important;
}

:global(.dark .automation-editor-modal summary) {
  color: var(--editor-heading) !important;
}

:global(.dark .automation-editor-modal input),
:global(.dark .automation-editor-modal select),
:global(.dark .automation-editor-modal textarea) {
  border-color: var(--editor-border) !important;
  color: var(--editor-text) !important;
  background-color: var(--editor-field) !important;
}

:global(.dark .automation-editor-modal select option) {
  color: var(--editor-text) !important;
  background-color: var(--editor-panel) !important;
}

:global(.dark .automation-editor-modal input::placeholder),
:global(.dark .automation-editor-modal textarea::placeholder) {
  color: #94a3b8 !important;
}
</style>
