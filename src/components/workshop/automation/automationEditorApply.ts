import type { WorkflowCard } from '@/api/workflowCards'
import { createEmptyStep, stepEditorFromDefinition } from './automationDefinition'
import type { EditorDraft, StepEditor, WorkflowNodePosition } from './automationTypes'

export { useAutomationCardNavigation } from './useAutomationCardNavigation'

export function blankEditorDraft(): EditorDraft {
  return {
    name: '新自动化卡片',
    description: '',
    tags: '',
    accessScope: 'all',
    allowedAiConfigIds: [],
    riskLevel: 'read_only',
    inputSchemaText: '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}',
    outputText: '{}',
    timeoutSeconds: 300,
    maxTransitions: 100,
    startStepId: 'finish',
  }
}

export function applyCardToEditor(full: WorkflowCard) {
  const ownerTags = full.tags.filter(tag => tag.toLowerCase().startsWith('ai_owner:'))
  const editor: EditorDraft = {
    name: full.name,
    description: full.description,
    tags: full.tags.filter(tag => !tag.toLowerCase().startsWith('ai_owner:')).join(', '),
    accessScope: full.access_scope || (ownerTags.length ? 'owner' : 'all'),
    allowedAiConfigIds: [...(full.allowed_ai_config_ids || [])],
    riskLevel: full.risk_level,
    inputSchemaText: JSON.stringify(full.definition.inputSchema || { type: 'object' }, null, 2),
    outputText: JSON.stringify(full.definition.output || {}, null, 2),
    timeoutSeconds: Number(full.definition.limits?.timeoutSeconds || 300),
    maxTransitions: Number(full.definition.limits?.maxTransitions || 100),
    startStepId: String(full.definition.startStepId || ''),
  }
  const steps: StepEditor[] = Object.entries(full.definition.steps || {}).map(([id, step]) => (
    stepEditorFromDefinition(id, step)
  ))
  const savedPositions = savedEditorPositions(full)
  const positions: Record<string, WorkflowNodePosition> = savedPositions && typeof savedPositions === 'object'
    ? { ...savedPositions }
    : {}
  return {
    editor,
    ownerTags,
    steps,
    positions,
    compatibility: { ...(full.definition.compatibility || {}) },
    startStepId: editor.startStepId || steps[0]?.id || '',
  }
}

function savedEditorPositions(full: WorkflowCard) {
  if (full.editor_layout?.positions) return full.editor_layout.positions
  return full.definition.compatibility?.editorLayout?.positions
}

export function createBlankEditorSteps() {
  const end = createEmptyStep('end', 1)
  end.id = 'finish'
  end.title = '结束'
  return {
    steps: [end],
    positions: { [end.id]: { x: 360, y: 180 } } as Record<string, WorkflowNodePosition>,
    startStepId: 'finish',
  }
}
