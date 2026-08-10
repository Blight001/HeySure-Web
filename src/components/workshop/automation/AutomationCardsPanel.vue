<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  cloneWorkflowCard,
  createWorkflowCard,
  deleteWorkflowCard,
  deprecateWorkflowCard,
  exportWorkflowCard,
  getWorkflowCard,
  getWorkflowCardVersion,
  importWorkflowCard,
  listWorkflowCards,
  listWorkflowCardVersions,
  publishWorkflowCard,
  updateWorkflowCard,
  validateWorkflowCard,
  type WorkflowCard,
  type WorkflowCardVersion,
  type WorkflowDefinition,
  type WorkflowStepType,
} from '@/api/workflowCards'
import {
  cancelWorkflowRun,
  confirmWorkflowRun,
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
import WorkflowCanvasEditor from './WorkflowCanvasEditor.vue'

interface DeviceLike {
  id: string
  name?: string
  deviceType?: string
  platform?: string
  online?: boolean
  capabilities?: string[]
}

const props = defineProps<{ devices: DeviceLike[] }>()
const { confirm } = useMessage()

type StepEditor = {
  id: string
  type: WorkflowStepType
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
}

type WorkflowNodePosition = { x: number; y: number }
type WorkflowCanvasConnection = {
  from: string
  to: string
  branch: 'next' | 'error' | 'true' | 'false' | 'denied'
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
const editingId = ref('')
const editor = reactive({
  name: '',
  description: '',
  tags: '',
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
const publishDeviceId = ref('')
const deviceScope = ref<DeviceMcpScope | null>(null)
const validation = ref<{ valid: boolean; digest: string; warnings: string[] } | null>(null)
const versions = ref<WorkflowCardVersion[]>([])
const versionPreview = ref<WorkflowCardVersion | null>(null)

const runModalCard = ref<WorkflowCard | null>(null)
const runDeviceId = ref('')
const runInputText = ref('{}')
const selectedRun = ref<WorkflowRun | null>(null)
const selectedSteps = ref<WorkflowStepRun[]>([])
const confirmations = ref<WorkflowConfirmation[]>([])

const onlineDevices = computed(() => (props.devices || []).filter(device => device.online !== false))
const toolDefs = computed(() => deviceScope.value?.toolDefs || {})
const toolNames = computed(() => Object.keys(toolDefs.value).sort())
const selectedStep = computed(() => editorSteps.value.find(step => step.id === selectedStepId.value) || null)
const activeStatuses = new Set(['pending', 'running', 'waiting_device', 'waiting_confirmation', 'retry_wait', 'paused_offline'])
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
  const succeeded = terminal.filter(run => run.status === 'succeeded').length
  return {
    rate: terminal.length ? `${Math.round((succeeded / terminal.length) * 100)}%` : '—',
    latest: items[0]?.created_at ? new Date(items[0].created_at * 1000).toLocaleString() : '暂无',
  }
}

const emptyStep = (type: WorkflowStepType = 'mcp', index = editorSteps.value.length + 1): StepEditor => ({
  id: type === 'end' ? `finish_${index}` : `step_${index}`,
  type,
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
  message: '请确认继续执行此自动化步骤',
  onDenied: '',
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
    if (selectedRun.value) {
      selectedRun.value = runs.value.find(item => item.id === selectedRun.value?.id) || selectedRun.value
      await loadRunDetail(selectedRun.value)
    }
  } catch (cause: any) {
    error.value = cause?.message || '运行历史加载失败'
  }
}

const fromStep = (id: string, step: Record<string, any>): StepEditor => ({
  ...emptyStep((step.type || 'mcp') as WorkflowStepType),
  id,
  type: (step.type || 'mcp') as WorkflowStepType,
  tool: String(step.toolRef?.name || ''),
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
  message: String(step.message || step.riskSummary || '请确认继续执行此自动化步骤'),
  onDenied: String(step.onDenied || ''),
})

const openNew = () => {
  resetMessages()
  editingId.value = ''
  editor.name = '新自动化卡片'
  editor.description = ''
  editor.tags = ''
  editor.riskLevel = 'read_only'
  editor.inputSchemaText = '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}'
  editor.outputText = '{}'
  editor.timeoutSeconds = 300
  editor.maxTransitions = 100
  const end = emptyStep('end', 1)
  end.id = 'finish'
  editorSteps.value = [end]
  selectedStepId.value = end.id
  canvasPositions.value = { [end.id]: { x: 360, y: 180 } }
  editorCompatibility.value = {}
  editor.startStepId = 'finish'
  versions.value = []
  versionPreview.value = null
  validation.value = null
  editorOpen.value = true
}

const openEdit = async (card: WorkflowCard) => {
  resetMessages()
  const full = await getWorkflowCard(card.id)
  editingId.value = full.id
  editor.name = full.name
  editor.description = full.description
  editor.tags = full.tags.join(', ')
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
  versionPreview.value = null
  validation.value = null
  editorOpen.value = true
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

const renameSelectedStep = (event: Event) => {
  const step = selectedStep.value
  if (!step) return
  const target = event.target as HTMLInputElement
  const oldId = step.id
  const newId = target.value.trim()
  if (!newId || newId === oldId) return
  if (editorSteps.value.some(item => item !== step && item.id === newId)) {
    error.value = '步骤 ID 必须唯一'
    target.value = oldId
    return
  }
  step.id = newId
  editorSteps.value.forEach(item => {
    if (item.next === oldId) item.next = newId
    if (item.onTrue === oldId) item.onTrue = newId
    if (item.onFalse === oldId) item.onFalse = newId
    if (item.onDenied === oldId) item.onDenied = newId
    if (item.onError === oldId) item.onError = newId
  })
  if (editor.startStepId === oldId) editor.startStepId = newId
  const positions = { ...canvasPositions.value }
  if (positions[oldId]) positions[newId] = positions[oldId]
  delete positions[oldId]
  canvasPositions.value = positions
  selectedStepId.value = newId
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
    if (row.type === 'mcp') {
      const definition = toolDefs.value[row.tool] || {}
      const step: Record<string, any> = {
        type: 'mcp',
        toolRef: { namespace: 'device', name: row.tool },
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
        type: 'condition',
        expression: parseJson(row.expressionText, `步骤 ${id} 条件`),
        onTrue: row.onTrue.trim(),
        onFalse: row.onFalse.trim(),
      }
    } else if (row.type === 'delay') {
      steps[id] = { type: 'delay', delaySeconds: Number(row.delaySeconds), next: row.next.trim() }
    } else if (row.type === 'confirm') {
      steps[id] = {
        type: 'confirm', message: row.message, timeoutSeconds: Number(row.timeoutSeconds),
        next: row.next.trim(), ...(row.onDenied.trim() ? { onDenied: row.onDenied.trim() } : {}),
      }
    } else {
      steps[id] = { type: 'end' }
    }
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

const draftPreview = computed(() => {
  try {
    return buildDefinition()
  } catch (cause: any) {
    return { preview_error: cause?.message || String(cause) }
  }
})

const saveCard = async () => {
  resetMessages()
  busy.value = true
  try {
    const body = {
      name: editor.name.trim(), description: editor.description.trim(),
      tags: editor.tags.split(',').map(item => item.trim()).filter(Boolean),
      risk_level: editor.riskLevel, definition: buildDefinition(),
    }
    const saved = editingId.value
      ? await updateWorkflowCard(editingId.value, body)
      : await createWorkflowCard(body)
    editingId.value = saved.id
    notice.value = '草稿已保存'
    await loadCards()
  } catch (cause: any) {
    error.value = cause?.message || '保存失败'
  } finally {
    busy.value = false
  }
}

const validateCard = async () => {
  await saveCard()
  if (error.value || !editingId.value) return
  try {
    validation.value = await validateWorkflowCard(editingId.value)
    notice.value = validation.value.warnings.length ? `校验通过：${validation.value.warnings.join('；')}` : '静态校验通过'
    await loadCards()
  } catch (cause: any) {
    error.value = cause?.message || '校验失败'
  }
}

const publishCard = async () => {
  await saveCard()
  if (error.value || !editingId.value || !publishDeviceId.value) {
    if (!publishDeviceId.value) error.value = '请选择用于冻结工具契约的设备'
    return
  }
  busy.value = true
  try {
    await publishWorkflowCard(editingId.value, publishDeviceId.value)
    versions.value = (await listWorkflowCardVersions(editingId.value)).items
    notice.value = '新版本已发布'
    await loadCards()
  } catch (cause: any) {
    error.value = cause?.message || '发布失败'
  } finally {
    busy.value = false
  }
}

const loadDeviceTools = async () => {
  deviceScope.value = null
  if (!publishDeviceId.value) return
  try {
    deviceScope.value = await getDeviceMcpScope(publishDeviceId.value)
  } catch (cause: any) {
    error.value = cause?.message || '设备工具加载失败'
  }
}

const scaffoldArguments = (row: StepEditor) => {
  const schema = toolDefs.value[row.tool]?.input_schema || {}
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

const toolProperties = (row: StepEditor) => Object.entries<any>(toolDefs.value[row.tool]?.input_schema?.properties || {})

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
  runDeviceId.value = onlineDevices.value[0]?.id || ''
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

const decide = async (approved: boolean) => {
  if (!selectedRun.value) return
  await confirmWorkflowRun(selectedRun.value.id, approved)
  await loadRuns()
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

const deleteCard = async (card: WorkflowCard) => {
  const approved = await confirm({
    message: `确认删除自动化卡片“${card.name}”？卡片将从列表中移除，历史运行仍保留。`,
    type: 'warning',
  })
  if (!approved) return
  resetMessages()
  try {
    await deleteWorkflowCard(card.id)
    if (editingId.value === card.id) editorOpen.value = false
    notice.value = '卡片已删除'
    await loadCards()
  } catch (cause: any) {
    error.value = cause?.message || '卡片删除失败'
  }
}

const deprecateCard = async (card: WorkflowCard) => {
  await deprecateWorkflowCard(card.id)
  await loadCards()
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
      risk_level: String(payload.risk_level || 'read_only'),
      definition: payload.definition || {},
    })
    notice.value = '卡片已导入为草稿'
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
}

const statusLabel = (status: string) => ({
  draft: '草稿', validated: '已校验', published: '已发布', deprecated: '已弃用',
  pending: '待领取', running: '推进中', waiting_device: '等待设备', waiting_confirmation: '等待确认',
  retry_wait: '等待重试', paused_offline: '设备离线', succeeded: '成功', failed: '失败',
  cancelled: '已取消', timed_out: '超时', dispatch_pending: '待派发', dispatching: '派发中',
}[status] || status)

const statusClass = (status: string) => {
  if (status === 'succeeded' || status === 'published') return 'text-emerald-600 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/10'
  if (['failed', 'timed_out', 'cancelled'].includes(status)) return 'text-rose-600 bg-rose-50 dark:text-rose-300 dark:bg-rose-500/10'
  if (['waiting_confirmation', 'paused_offline', 'retry_wait'].includes(status)) return 'text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-500/10'
  return 'text-indigo-600 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-500/10'
}

watch(publishDeviceId, loadDeviceTools)
watch(tab, value => { if (value === 'runs') loadRuns() })

let timer: number | undefined
onMounted(async () => {
  await Promise.all([loadCards(), loadRuns()])
  timer = window.setInterval(() => {
    if (runs.value.some(run => activeStatuses.has(run.status))) loadRuns()
  }, 2500)
})
onBeforeUnmount(() => { if (timer) window.clearInterval(timer) })
</script>

<template>
  <section class="rounded-xl border border-indigo-200/80 bg-indigo-50/50 p-3 dark:border-indigo-500/25 dark:bg-indigo-500/5">
    <header class="flex items-center justify-between gap-2">
      <div class="min-w-0 text-left">
        <div class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">自动化卡片</div>
        <div class="text-[10px] text-zinc-500">服务器确定性编排设备 MCP，不逐步调用模型</div>
      </div>
      <span class="rounded-full bg-white/70 px-2 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-900/50">{{ cards.length }} 张</span>
    </header>

    <div class="mt-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex rounded-lg bg-white/70 p-0.5 text-xs dark:bg-zinc-900/50">
          <button class="rounded-md px-3 py-1" :class="tab === 'cards' ? 'bg-indigo-600 text-white' : 'text-zinc-500'" @click="tab = 'cards'">卡片</button>
          <button class="rounded-md px-3 py-1" :class="tab === 'runs' ? 'bg-indigo-600 text-white' : 'text-zinc-500'" @click="tab = 'runs'">运行历史</button>
        </div>
        <div v-if="tab === 'cards'" class="flex gap-1">
          <input v-model="cardSearch" class="w-36 rounded-lg border border-zinc-200 bg-white/70 px-2 py-1 text-[11px] dark:border-zinc-700 dark:bg-zinc-900/60" placeholder="搜索名称或标签" />
          <select v-model="cardStatus" class="rounded-lg border border-zinc-200 bg-white/70 px-2 py-1 text-[11px] dark:border-zinc-700 dark:bg-zinc-900/60"><option value="">全部状态</option><option value="draft">草稿</option><option value="validated">已校验</option><option value="published">已发布</option><option value="deprecated">已弃用</option></select>
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
            <span v-for="tag in card.tags" :key="tag" class="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] text-zinc-500 dark:bg-zinc-800">{{ tag }}</span>
            <span class="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] text-zinc-500 dark:bg-zinc-800">{{ card.risk_level }}</span>
          </div>
          <div class="mt-1 text-[9px] text-zinc-400">成功率 {{ cardRunSummary(card.id).rate }} · 最近运行 {{ cardRunSummary(card.id).latest }}</div>
          <div class="mt-2 flex flex-wrap gap-1 text-[10px]">
            <button class="rounded border px-2 py-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" @click="openEdit(card)">编辑</button>
            <button :disabled="card.status !== 'published'" class="rounded border border-indigo-200 px-2 py-0.5 text-indigo-600 disabled:opacity-40 dark:border-indigo-500/30 dark:text-indigo-300" @click="openRun(card)">运行</button>
            <button v-if="card.status === 'published'" class="rounded border border-amber-200 px-2 py-0.5 text-amber-600 dark:border-amber-500/30" @click="deprecateCard(card)">弃用</button>
            <button class="ml-auto rounded border border-rose-200 px-2 py-0.5 text-rose-500 dark:border-rose-500/30" @click="deleteCard(card)">删除</button>
          </div>
        </article>
      </div>

      <div v-else class="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
        <div class="space-y-1.5">
          <button v-for="run in runs" :key="run.id" class="w-full rounded-lg border border-zinc-200 bg-white/75 p-2 text-left dark:border-zinc-700 dark:bg-zinc-900/55" @click="loadRunDetail(run)">
            <div class="flex items-center justify-between gap-2">
              <span class="truncate text-[11px] font-medium">{{ cards.find(card => card.id === run.card_id)?.name || run.card_id }}</span>
              <span class="rounded px-1.5 py-0.5 text-[9px]" :class="statusClass(run.status)">{{ statusLabel(run.status) }}</span>
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
              <span class="rounded px-1.5 py-0.5 text-[9px]" :class="statusClass(selectedRun.status)">{{ statusLabel(selectedRun.status) }}</span>
            </div>
            <div class="mt-1 break-all text-[9px] text-zinc-400">{{ selectedRun.id }}</div>
            <div v-if="selectedRun.error" class="mt-2 rounded bg-rose-50 p-2 text-[10px] text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">{{ selectedRun.error.code }}：{{ selectedRun.error.message }}</div>
            <pre v-if="selectedRun.output" class="mt-2 max-h-36 overflow-auto rounded bg-zinc-950 p-2 text-[9px] text-emerald-300">{{ JSON.stringify(selectedRun.output, null, 2) }}</pre>
            <div class="mt-2 flex gap-1 text-[10px]">
              <button v-if="activeStatuses.has(selectedRun.status)" class="rounded border border-rose-200 px-2 py-1 text-rose-500" @click="cancelRun(selectedRun)">取消</button>
              <button v-if="['failed', 'timed_out', 'cancelled'].includes(selectedRun.status)" class="rounded border border-indigo-200 px-2 py-1 text-indigo-600" @click="retryRun(selectedRun)">新运行重试</button>
            </div>
            <div v-for="confirmation in confirmations.filter(item => item.status === 'pending')" :key="confirmation.id" class="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 dark:border-amber-500/30 dark:bg-amber-500/10">
              <div class="text-[10px] font-medium text-amber-700 dark:text-amber-200">等待确认：{{ confirmation.risk_summary }}</div>
              <div class="mt-1 flex gap-1"><button class="rounded bg-emerald-600 px-2 py-0.5 text-[10px] text-white" @click="decide(true)">批准</button><button class="rounded bg-rose-600 px-2 py-0.5 text-[10px] text-white" @click="decide(false)">拒绝</button></div>
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
    <div v-if="editorOpen" class="fixed inset-0 overflow-y-auto bg-zinc-950/45 p-3 backdrop-blur-sm" :style="{ zIndex: editorZIndex }" @click.self="editorOpen = false">
      <div class="mx-auto w-full max-w-[1500px] rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <div class="flex items-center justify-between"><div class="text-sm font-semibold">{{ editingId ? '编辑自动化卡片' : '新建自动化卡片' }}</div><button @click="editorOpen = false">✕</button></div>
        <div v-if="error" class="mt-2 rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">{{ error }}</div>
        <div v-if="notice" class="mt-2 rounded-lg bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">{{ notice }}</div>
        <details class="mt-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
          <summary class="cursor-pointer text-xs font-semibold text-zinc-700 dark:text-zinc-200">卡片设置</summary>
          <div class="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-4">
            <label class="text-[10px] text-zinc-500">名称<input v-model="editor.name" class="mt-1 w-full rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950" /></label>
            <label class="text-[10px] text-zinc-500">标签（逗号分隔）<input v-model="editor.tags" class="mt-1 w-full rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950" /></label>
            <label class="text-[10px] text-zinc-500">风险等级<select v-model="editor.riskLevel" class="mt-1 w-full rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"><option value="read_only">只读</option><option value="normal_change">普通变更</option><option value="high_risk">高风险</option></select></label>
            <label class="text-[10px] text-zinc-500">入口步骤<select v-model="editor.startStepId" class="mt-1 w-full rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"><option v-for="step in editorSteps" :key="step.id" :value="step.id">{{ step.id }}</option></select></label>
            <label class="md:col-span-2 lg:col-span-4 text-[10px] text-zinc-500">说明<textarea v-model="editor.description" rows="2" class="mt-1 w-full rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950" /></label>
            <label class="text-[10px] text-zinc-500">总超时（秒）<input v-model.number="editor.timeoutSeconds" type="number" class="mt-1 w-full rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950" /></label>
            <label class="text-[10px] text-zinc-500">最大推进次数<input v-model.number="editor.maxTransitions" type="number" class="mt-1 w-full rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950" /></label>
            <label class="md:col-span-2 text-[10px] text-zinc-500">输入 JSON Schema<textarea v-model="editor.inputSchemaText" rows="6" class="mt-1 w-full rounded border p-2 font-mono text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label>
            <label class="md:col-span-2 text-[10px] text-zinc-500">输出映射<textarea v-model="editor.outputText" rows="6" class="mt-1 w-full rounded border p-2 font-mono text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label>
          </div>
        </details>

        <div class="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
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
          />

          <aside class="max-h-[680px] overflow-auto rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-700 dark:bg-zinc-950/60">
            <template v-if="selectedStep">
              <div class="flex items-center justify-between gap-2">
                <div><div class="text-xs font-semibold">节点属性</div><div class="mt-0.5 text-[9px] text-zinc-400">连线请直接在画布中拖动端点</div></div>
                <div class="flex gap-1"><button class="rounded border px-2 py-1 text-[9px] text-indigo-600" @click="editor.startStepId = selectedStep.id">设为入口</button><button class="rounded border border-rose-200 px-2 py-1 text-[9px] text-rose-500" @click="removeSelectedStep">删除</button></div>
              </div>
              <div class="mt-3 grid gap-2">
                <label class="text-[9px] text-zinc-500">步骤 ID<input :value="selectedStep.id" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" @change="renameSelectedStep" /></label>
                <label class="text-[9px] text-zinc-500">类型<select v-model="selectedStep.type" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950"><option v-for="kind in (['mcp','condition','delay','confirm','end'] as WorkflowStepType[])" :key="kind">{{ kind }}</option></select></label>

                <template v-if="selectedStep.type === 'mcp'">
                  <label class="text-[9px] text-zinc-500">设备工具<select v-model="selectedStep.tool" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" @change="scaffoldArguments(selectedStep)"><option value="">选择设备工具</option><option v-for="tool in toolNames" :key="tool">{{ tool }}</option></select></label>
                  <label class="text-[9px] text-zinc-500">结果保存为<input v-model="selectedStep.saveAs" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label>
                  <label class="text-[9px] text-zinc-500">参数模板<textarea v-model="selectedStep.argumentsText" rows="6" class="mt-1 w-full rounded border p-1.5 font-mono text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label>
                  <div v-if="toolProperties(selectedStep).length" class="grid gap-1 rounded border border-dashed border-zinc-200 p-2 dark:border-zinc-700"><div class="text-[9px] font-medium text-zinc-500">Schema 参数</div><label v-for="([name, schema]) in toolProperties(selectedStep)" :key="name" class="text-[9px] text-zinc-500">{{ name }}<span v-if="(toolDefs[selectedStep.tool]?.input_schema?.required || []).includes(name)" class="text-rose-500"> *</span><select v-if="schema.type === 'boolean'" :value="String(stepArgumentValue(selectedStep, name))" class="mt-0.5 w-full rounded border p-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" @change="setStepArgumentValue(selectedStep, name, schema, $event)"><option value="true">true</option><option value="false">false</option></select><input v-else :type="schema.type === 'number' || schema.type === 'integer' ? 'number' : 'text'" :value="stepArgumentValue(selectedStep, name)" :placeholder="schema.description || schema.type" class="mt-0.5 w-full rounded border p-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" @input="setStepArgumentValue(selectedStep, name, schema, $event)" /></label></div>
                  <details class="rounded border border-zinc-200 p-2 dark:border-zinc-700"><summary class="cursor-pointer text-[9px] font-medium text-zinc-500">重试与结果设置</summary><div class="mt-2 grid grid-cols-2 gap-1"><label class="text-[9px] text-zinc-500">超时<input v-model.number="selectedStep.timeoutSeconds" type="number" class="mt-0.5 w-full rounded border p-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label><label class="text-[9px] text-zinc-500">最大尝试<input v-model.number="selectedStep.maxAttempts" type="number" min="1" max="10" class="mt-0.5 w-full rounded border p-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label><label class="text-[9px] text-zinc-500">退避<select v-model="selectedStep.backoff" class="mt-0.5 w-full rounded border p-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-950"><option value="fixed">固定</option><option value="exponential">指数</option></select></label><label class="text-[9px] text-zinc-500">重试等待<input v-model.number="selectedStep.retryDelay" type="number" class="mt-0.5 w-full rounded border p-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label><label class="col-span-2 text-[9px] text-zinc-500">结果投影<input v-model="selectedStep.projection" class="mt-0.5 w-full rounded border p-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" placeholder="字段以逗号分隔" /></label></div></details>
                </template>

                <label v-else-if="selectedStep.type === 'condition'" class="text-[9px] text-zinc-500">条件表达式<textarea v-model="selectedStep.expressionText" rows="8" class="mt-1 w-full rounded border p-1.5 font-mono text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label>
                <label v-else-if="selectedStep.type === 'delay'" class="text-[9px] text-zinc-500">延迟秒数<input v-model.number="selectedStep.delaySeconds" type="number" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label>
                <template v-else-if="selectedStep.type === 'confirm'"><label class="text-[9px] text-zinc-500">确认提示<input v-model="selectedStep.message" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label><label class="text-[9px] text-zinc-500">确认超时<input v-model.number="selectedStep.timeoutSeconds" type="number" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label></template>
                <div v-else class="rounded-lg bg-emerald-50 p-3 text-[10px] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">结束节点会生成卡片输出并终止运行。</div>
              </div>
            </template>
            <div v-else class="grid min-h-48 place-items-center text-center text-xs text-zinc-400">点击画布节点<br />在这里编辑属性</div>
          </aside>
        </div>

        <div class="mt-4 grid gap-2 md:grid-cols-2"><label class="text-[10px] text-zinc-500">契约设备<select v-model="publishDeviceId" class="mt-1 w-full rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"><option value="">请选择设备</option><option v-for="device in onlineDevices" :key="device.id" :value="device.id">{{ device.name || device.id }}</option></select></label><div class="text-[10px] text-zinc-500">设备上报工具：{{ toolNames.length }} 个。MCP 参数表单从当前 JSON Schema 自动生成。</div></div>
        <div v-if="versions.length" class="mt-3"><div class="text-[10px] font-semibold text-zinc-500">已发布版本与草稿对比</div><div class="mt-1 flex flex-wrap gap-1"><button v-for="version in versions" :key="version.id" class="rounded border px-2 py-0.5 text-[9px]" @click="previewVersion(version)">v{{ version.version_number }}</button></div><div v-if="versionPreview?.definition" class="mt-1 grid gap-1 md:grid-cols-2"><div><div class="mb-1 text-[9px] text-zinc-400">所选版本</div><pre class="max-h-40 overflow-auto rounded bg-zinc-950 p-2 text-[9px] text-zinc-300">{{ JSON.stringify(versionPreview.definition, null, 2) }}</pre></div><div><div class="mb-1 text-[9px] text-zinc-400">当前草稿</div><pre class="max-h-40 overflow-auto rounded bg-zinc-950 p-2 text-[9px] text-zinc-300">{{ JSON.stringify(draftPreview, null, 2) }}</pre></div></div></div>
        <div class="mt-4 flex flex-wrap items-center justify-between gap-2"><div class="flex gap-2"><button v-if="editingId" :disabled="busy" class="rounded border px-3 py-1.5 text-xs" @click="cloneCurrentCard">复制</button><button v-if="editingId" :disabled="busy" class="rounded border px-3 py-1.5 text-xs" @click="exportCurrentCard">导出</button></div><div class="flex flex-wrap justify-end gap-2"><button class="rounded border px-3 py-1.5 text-xs" @click="editorOpen = false">关闭</button><button :disabled="busy" class="rounded border border-zinc-300 px-3 py-1.5 text-xs" @click="saveCard">保存草稿</button><button :disabled="busy" class="rounded border border-emerald-300 px-3 py-1.5 text-xs text-emerald-600" @click="validateCard">校验</button><button :disabled="busy" class="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white" @click="publishCard">发布版本</button></div></div>
      </div>
    </div>
    </Teleport>

    <div v-if="runModalCard" class="absolute inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-4 backdrop-blur-sm" @click.self="runModalCard = null"><div class="w-full max-w-lg rounded-xl bg-white p-4 shadow-2xl dark:bg-zinc-900"><div class="flex justify-between"><div class="text-sm font-semibold">运行 {{ runModalCard.name }}</div><button @click="runModalCard = null">✕</button></div><label class="mt-3 block text-[10px] text-zinc-500">目标设备<select v-model="runDeviceId" class="mt-1 w-full rounded border p-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"><option v-for="device in onlineDevices" :key="device.id" :value="device.id">{{ device.name || device.id }}</option></select></label><label class="mt-3 block text-[10px] text-zinc-500">运行输入<textarea v-model="runInputText" rows="10" class="mt-1 w-full rounded border p-2 font-mono text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label><div class="mt-3 flex justify-end gap-2"><button class="rounded border px-3 py-1.5 text-xs" @click="runModalCard = null">取消</button><button :disabled="busy || !runDeviceId" class="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white disabled:opacity-50" @click="startRun">启动</button></div></div></div>
  </section>
</template>
