import type { WorkflowStepType } from '@/api/workflowCards'

export interface DeviceLike {
  id: string
  name?: string
  deviceType?: string
  platform?: string
  online?: boolean
  capabilities?: string[]
}

export interface AiMemberLike {
  name: string
  aiConfigId?: number
  aiRole?: string
  digitalMemberRole?: string
  enabled?: boolean
}

export type StepEditor = {
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

export type WorkflowNodePosition = { x: number; y: number }
export type WorkflowCanvasConnection = {
  from: string
  to: string
  branch: 'next' | 'error' | 'true' | 'false' | 'denied'
}
export type StepTargetField = 'next' | 'onError' | 'onTrue' | 'onFalse' | 'onDenied'
export type StepClipboard = {
  step: StepEditor
  sourceId: string
  position: WorkflowNodePosition
  pasteCount: number
  restoreIncoming: boolean
  restoreAsStart: boolean
  cutPending: boolean
  incoming: Array<{ stepId: string; field: StepTargetField }>
}

export type EditorDraft = {
  name: string
  description: string
  tags: string
  accessScope: 'all' | 'owner' | 'selected'
  allowedAiConfigIds: number[]
  riskLevel: string
  inputSchemaText: string
  outputText: string
  timeoutSeconds: number
  maxTransitions: number
  startStepId: string
}

export const DEFAULT_STEP_TITLES: Record<WorkflowStepType, string> = {
  mcp: '设备 MCP',
  condition: '判断分支',
  delay: '等待',
  ai: 'AI 审核',
  end: '结束',
}

export const STEP_TARGET_FIELDS: StepTargetField[] = ['next', 'onError', 'onTrue', 'onFalse', 'onDenied']
