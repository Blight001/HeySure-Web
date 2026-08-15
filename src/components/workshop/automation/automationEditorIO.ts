import {
  cloneWorkflowCard,
  createWorkflowCard,
  deleteWorkflowCard,
  exportWorkflowCard,
  listWorkflowCardVersions,
  updateWorkflowCard,
  type WorkflowDefinition,
} from '@/api/workflowCards'
import { getDeviceMcpScope, type DeviceMcpScope } from '@/api/devices'
import type { EditorDraft, StepEditor } from './automationTypes'

export function buildCardSaveBody(
  editor: EditorDraft,
  ownerTags: string[],
  definition: WorkflowDefinition,
  defaultDeviceId: string,
  inferredDeviceIds: string[],
) {
  return {
    name: editor.name.trim(),
    description: editor.description.trim(),
    tags: [...editor.tags.split(',').map(item => item.trim()).filter(Boolean), ...ownerTags],
    access_scope: editor.accessScope,
    allowed_ai_config_ids: editor.accessScope === 'selected' ? [...editor.allowedAiConfigIds] : [],
    risk_level: editor.riskLevel,
    definition,
    default_device_id: defaultDeviceId || inferredDeviceIds[0] || undefined,
    device_ids: inferredDeviceIds,
  }
}

export function inferredMcpDeviceIds(steps: StepEditor[]) {
  return Array.from(new Set(steps.filter(step => step.type === 'mcp').map(step => step.deviceId.trim()).filter(Boolean)))
}

export async function persistWorkflowCard(
  editingId: string,
  body: ReturnType<typeof buildCardSaveBody>,
) {
  const saved = editingId ? await updateWorkflowCard(editingId, body) : await createWorkflowCard(body)
  const versions = (await listWorkflowCardVersions(saved.id)).items
  return { saved, versions, notice: editingId ? '已保存为新版本' : '卡片与第 1 版已创建' }
}

export async function cloneSavedCard(editingId: string) {
  await cloneWorkflowCard(editingId)
}

export async function deleteSavedCard(cardId: string) {
  await deleteWorkflowCard(cardId)
}

export async function downloadExportedCard(editingId: string, name: string) {
  const payload = await exportWorkflowCard(editingId)
  const href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = `${name || 'workflow-card'}.json`
  anchor.click()
  URL.revokeObjectURL(href)
}

export async function fetchDeviceScopes(deviceIds: string[]) {
  const pairs = await Promise.all(deviceIds.map(async id => [id, await getDeviceMcpScope(id)] as const))
  return Object.fromEntries(pairs) as Record<string, DeviceMcpScope>
}

export function defaultArgumentValue(property: any, required: boolean) {
  if (property.default !== undefined) return property.default
  if (!required) return undefined
  if (property.type === 'boolean') return false
  if (property.type === 'number' || property.type === 'integer') return 0
  return ''
}

export function scaffoldStepArguments(
  row: StepEditor,
  schema: any,
  inputProps: Record<string, any>,
) {
  const args: Record<string, any> = {}
  const required = schema.required || []
  for (const [name, property] of Object.entries<any>(schema.properties || {})) {
    if (name in inputProps) args[name] = `\${input.${name}}`
    else {
      const value = defaultArgumentValue(property, required.includes(name))
      if (value !== undefined) args[name] = value
    }
  }
  row.argumentsText = JSON.stringify(args, null, 2)
}

export function writeStepArgument(row: StepEditor, name: string, schema: any, event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement
  let value: any = target.value
  if (schema?.type === 'boolean') value = value === 'true'
  else if (schema?.type === 'number' || schema?.type === 'integer') value = Number(value)
  let args: Record<string, any> = {}
  try { args = JSON.parse(row.argumentsText || '{}') } catch { /* replace invalid editor text */ }
  args[name] = value
  row.argumentsText = JSON.stringify(args, null, 2)
}
