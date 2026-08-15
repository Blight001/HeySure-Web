import type { ChatRunPhase } from '@/types/chat'

export const STREAM_PLAN_TOOLS = ['todo.manage']

export interface LiveSessionMatch {
  sessionId: string
  aiKind: string
  configId: number
}

export interface LiveBoundaryTrackers {
  prevText: string
  prevReasoning: string
  prevPhase: string
}

export const createLiveBoundaryTrackers = (): LiveBoundaryTrackers => ({
  prevText: '',
  prevReasoning: '',
  prevPhase: 'idle',
})

export const resetLiveBoundaryTrackers = (trackers: LiveBoundaryTrackers) => {
  trackers.prevText = ''
  trackers.prevReasoning = ''
  trackers.prevPhase = 'idle'
}

export const optionalEquals = (incoming: string | number, current: string | number) =>
  !incoming || incoming === current

export const optionalBothEquals = (incoming: string, current: string) =>
  !incoming || !current || incoming === current

export const matchLivePayloadSession = (
  payload: { session_id?: string; ai_kind?: string; ai_config_id?: number | null },
  current: LiveSessionMatch,
) => {
  const sessionId = String(payload.session_id || '')
  const aiKind = String(payload.ai_kind || 'assistant')
  const eventConfigId = Number(payload.ai_config_id || 0)
  return !!sessionId
    && sessionId === current.sessionId
    && aiKind === current.aiKind
    && eventConfigId === current.configId
}

export const shouldAdoptForeignLiveRun = (
  payload: { run_id?: string; session_id?: string; ai_kind?: string; ai_config_id?: number | null },
  currentRunId: string,
  isRunActive: boolean,
  current: LiveSessionMatch,
) => {
  const runId = String(payload?.run_id || '')
  if (!runId || runId === currentRunId || isRunActive) return false
  return matchLivePayloadSession(payload, current)
}

export const isTerminalRunStatus = (status: string) =>
  ['completed', 'error', 'stopped'].includes(status)

export const normalizeRunStatus = (status: string) =>
  (isTerminalRunStatus(status) ? status : 'completed') as 'completed' | 'error' | 'stopped'

export const noteContentCleared = (trackers: LiveBoundaryTrackers, text: string, reason: string) =>
  !!(trackers.prevText || trackers.prevReasoning) && !text && !reason

export const noteToolToGenerate = (trackers: LiveBoundaryTrackers, phase: string) =>
  trackers.prevPhase === 'waiting_mcp' && phase === 'generating'

export const commitBoundaryTrackers = (
  trackers: LiveBoundaryTrackers,
  text: string,
  reason: string,
  phase: string,
) => {
  trackers.prevText = text
  trackers.prevReasoning = reason
  trackers.prevPhase = phase
}

export interface PhaseSyncCtl {
  phase: { value: ChatRunPhase }
  applyPhaseDelta: () => void
  setPhaseEnterTs: (ts: number | null) => void
}

export const syncRunPhase = (ctl: PhaseSyncCtl, incoming: ChatRunPhase) => {
  if (incoming === ctl.phase.value) return false
  ctl.applyPhaseDelta()
  ctl.phase.value = incoming
  ctl.setPhaseEnterTs(incoming === 'idle' ? null : Date.now())
  return true
}

export interface ToolSyncCtl {
  tool: { value: string }
  args: { value: string }
  phase: { value: ChatRunPhase }
  resetSegmentTimer: () => void
  onPlanTool: () => void
}

export const syncRunTool = (ctl: ToolSyncCtl, incomingTool: string, incomingArgs: string) => {
  const toolChanged = incomingTool !== ctl.tool.value
  if (toolChanged && STREAM_PLAN_TOOLS.includes(incomingTool)) ctl.onPlanTool()
  if (toolChanged && incomingTool && ctl.phase.value === 'waiting_mcp') ctl.resetSegmentTimer()
  ctl.tool.value = incomingTool
  ctl.args.value = incomingArgs
  return toolChanged
}

export const pinIfTurnCleared = (
  trackers: LiveBoundaryTrackers,
  text: string,
  reason: string,
  pin: (text: string, reason: string) => void,
) => {
  if (noteContentCleared(trackers, text, reason)) pin(trackers.prevText, trackers.prevReasoning)
}

export const requestSyncForTurn = (
  trackers: LiveBoundaryTrackers,
  text: string,
  reason: string,
  phase: string,
  toolChanged: boolean,
  requestSync: () => void,
) => {
  if (noteContentCleared(trackers, text, reason)) requestSync()
  if (noteToolToGenerate(trackers, phase)) requestSync()
  if (toolChanged) requestSync()
  commitBoundaryTrackers(trackers, text, reason, phase)
}
