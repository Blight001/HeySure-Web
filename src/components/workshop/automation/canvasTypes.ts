import type { WorkflowStepType } from '@/api/workflowCards'
import type { WorkflowCanvasConnection, WorkflowNodePosition } from './automationTypes'

export type { WorkflowCanvasConnection, WorkflowNodePosition }

export type CanvasStep = {
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
  cardId?: string
  cardName?: string
}

export type CanvasEdge = WorkflowCanvasConnection & { id: string; label: string }
export type PortPlacement = 'right' | 'bottom'
export type OutputPort = {
  branch: WorkflowCanvasConnection['branch']
  label: string
  tone: string
  placement: PortPlacement
}

export type TouchGesture =
  | { kind: 'pan'; client: WorkflowNodePosition; offset: WorkflowNodePosition }
  | { kind: 'node'; client: WorkflowNodePosition; stepId: string; position: WorkflowNodePosition }
  | { kind: 'connection'; from: string; branch: WorkflowCanvasConnection['branch'] }
  | {
      kind: 'pinch'
      distance: number
      scale: number
      anchor: WorkflowNodePosition
    }

export const NODE_WIDTH = 184
export const NODE_HEIGHT = 92

export const typeLabels: Record<WorkflowStepType, string> = {
  mcp: '设备 MCP', condition: '判断分支', delay: '等待', ai: 'AI 审核', card: '引用卡片', end: '结束',
}

export const palette: Array<{ type: WorkflowStepType; label: string }> = [
  { type: 'mcp', label: '设备 MCP' },
  { type: 'condition', label: '判断分支' },
  { type: 'delay', label: '等待' },
  { type: 'ai', label: 'AI 审核' },
  { type: 'card', label: '引用卡片' },
  { type: 'end', label: '结束' },
]

export const defaultPosition = (index: number): WorkflowNodePosition => ({
  x: 48 + (index % 4) * 240,
  y: 48 + Math.floor(index / 4) * 145,
})
