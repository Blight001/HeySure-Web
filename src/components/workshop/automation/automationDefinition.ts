import type { WorkflowDefinition, WorkflowStepType } from '@/api/workflowCards'
import { DEFAULT_STEP_TITLES, type EditorDraft, type StepEditor, type WorkflowNodePosition } from './automationTypes'

export function parseJson<T>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T
  } catch (cause: any) {
    throw new Error(`${label}不是有效 JSON：${cause?.message || cause}`)
  }
}

export function createEmptyStep(type: WorkflowStepType = 'mcp', index = 1): StepEditor {
  return {
    id: type === 'end' ? `finish_${index}` : `step_${index}`,
    title: `${DEFAULT_STEP_TITLES[type]} ${index}`,
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
    message: type === 'ai' ? '请核对此前完整运行过程，完成本节点任务并返回继续执行所需的参数' : '',
    onDenied: '',
    extraText: '{}',
  }
}

const KNOWN_STEP_KEYS = new Set([
  'type', 'title', 'toolRef', 'arguments', 'saveAs', 'next', 'onError', 'timeoutSeconds',
  'resultProjection', 'retryPolicy', 'expression', 'onTrue', 'onFalse', 'delaySeconds',
  'seconds', 'prompt',
])

function extraFromStep(step: Record<string, any>) {
  return Object.fromEntries(Object.entries(step).filter(([key]) => !KNOWN_STEP_KEYS.has(key)))
}

function retryFields(step: Record<string, any>) {
  return {
    maxAttempts: Number(step.retryPolicy?.maxAttempts || 1),
    backoff: (step.retryPolicy?.backoff === 'exponential' ? 'exponential' : 'fixed') as StepEditor['backoff'],
    retryDelay: Number(step.retryPolicy?.delaySeconds ?? 1),
  }
}

function toolFields(step: Record<string, any>, isAi: boolean) {
  return {
    deviceId: isAi ? '' : String(step.toolRef?.deviceId || ''),
    tool: isAi ? '' : String(step.toolRef?.name || ''),
    argumentsText: JSON.stringify(step.arguments || {}, null, 2),
    saveAs: String(step.saveAs || ''),
  }
}

function branchFields(step: Record<string, any>, isAi: boolean) {
  return {
    next: String(step.next || ''),
    onError: String(step.onError || 'fail'),
    timeoutSeconds: Number(step.timeoutSeconds || 120),
    projection: Array.isArray(step.resultProjection) ? step.resultProjection.join(', ') : '',
    expressionText: JSON.stringify(step.expression || { op: 'eq', left: '${input.value}', right: true }, null, 2),
    onTrue: String(step.onTrue || ''),
    onFalse: String(step.onFalse || ''),
    delaySeconds: Number(step.delaySeconds ?? step.seconds ?? 1),
    message: String(step.prompt || ''),
    onDenied: String(isAi && step.onError !== 'fail' ? step.onError || '' : ''),
    extraText: JSON.stringify(extraFromStep(step), null, 2),
  }
}

function routingFields(id: string, step: Record<string, any>, isAi: boolean) {
  return { id, title: String(step.title || id), ...toolFields(step, isAi), ...branchFields(step, isAi) }
}

export function stepEditorFromDefinition(id: string, step: Record<string, any>): StepEditor {
  const isAi = step.type === 'ai'
  const type = (step.type || 'mcp') as WorkflowStepType
  return { ...createEmptyStep(type), type, ...routingFields(id, step, isAi), ...retryFields(step) }
}

function assertUniqueStepIds(steps: StepEditor[]) {
  const ids = steps.map(step => step.id.trim())
  if (ids.some(id => !id)) throw new Error('步骤 ID 不能为空')
  if (new Set(ids).size !== ids.length) throw new Error('步骤 ID 必须唯一')
}

function buildMcpStep(
  row: StepEditor,
  extra: Record<string, any>,
  toolDefs: Record<string, any>,
) {
  const id = row.id.trim()
  if (!row.deviceId.trim()) throw new Error(`步骤 ${id}：请先选择此节点绑定的契约设备`)
  if (!row.tool.trim()) throw new Error(`步骤 ${id}：请选择绑定设备上报的工具`)
  const definition = toolDefs[row.tool]
  if (!definition) throw new Error(`步骤 ${id}：设备 ${row.deviceId} 当前未上报工具 ${row.tool}`)
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
  if (row.maxAttempts <= 1) return step
  step.retryPolicy = {
    maxAttempts: Number(row.maxAttempts),
    backoff: row.backoff,
    delaySeconds: Number(row.retryDelay),
    maxDelaySeconds: 60,
    retryOn: ['DISPATCH_FAILED', 'STEP_TIMEOUT'],
  }
  if (definition.destructive) step.retryPolicy.idempotencyKey = `\${run.id}:${id}`
  return step
}

function buildTypedStep(row: StepEditor, extra: Record<string, any>, toolDefs: Record<string, any>) {
  const id = row.id.trim()
  if (row.type === 'mcp') return buildMcpStep(row, extra, toolDefs)
  if (row.type === 'condition') {
    return {
      ...extra,
      type: 'condition',
      expression: parseJson(row.expressionText, `步骤 ${id} 条件`),
      onTrue: row.onTrue.trim(),
      onFalse: row.onFalse.trim(),
    }
  }
  if (row.type === 'delay') {
    return { ...extra, type: 'delay', delaySeconds: Number(row.delaySeconds), next: row.next.trim() }
  }
  if (row.type === 'ai') {
    return {
      ...extra,
      type: 'ai',
      prompt: row.message,
      saveAs: row.saveAs.trim(),
      timeoutSeconds: Number(row.timeoutSeconds),
      next: row.next.trim(),
      onError: row.onDenied.trim() || 'fail',
    }
  }
  return { ...extra, type: 'end' }
}

export function buildWorkflowDefinition(options: {
  steps: StepEditor[]
  editor: EditorDraft
  editorCompatibility: Record<string, any>
  canvasPositions: Record<string, WorkflowNodePosition>
  toolDefsForStep: (row: StepEditor) => Record<string, any>
}): WorkflowDefinition {
  const { steps: editorSteps, editor, editorCompatibility, canvasPositions, toolDefsForStep } = options
  assertUniqueStepIds(editorSteps)
  const steps: Record<string, Record<string, any>> = {}
  for (const row of editorSteps) {
    const id = row.id.trim()
    const extra = parseJson<Record<string, any>>(row.extraText || '{}', `步骤 ${id} 扩展配置`)
    steps[id] = buildTypedStep(row, extra, toolDefsForStep(row))
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
      ...editorCompatibility,
      editorLayout: {
        ...(editorCompatibility.editorLayout || {}),
        positions: canvasPositions,
      },
    },
  }
}

export function boundMcpDeviceIds(definition: WorkflowDefinition) {
  return Array.from(new Set(
    Object.values(definition.steps || {})
      .filter(step => step?.type === 'mcp')
      .map(step => String(step?.toolRef?.deviceId || '').trim())
      .filter(Boolean),
  ))
}

export function definitionSteps(definition: WorkflowDefinition | null) {
  return Object.entries(definition?.steps || {}).map(([id, step]) => stepEditorFromDefinition(id, step))
}

export function definitionPositions(definition: WorkflowDefinition | null) {
  const positions = definition?.compatibility?.editorLayout?.positions
  return positions && typeof positions === 'object' ? positions as Record<string, WorkflowNodePosition> : {}
}
