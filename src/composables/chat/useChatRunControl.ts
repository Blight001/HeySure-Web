import { onBeforeUnmount, watch } from 'vue'
import * as chatApi from '@/api/chat'
import { getAuthToken } from '@/api/http'
import {
  useChatRunStream,
  type ChatHistoryChangedPayload,
  type DeviceTaskEventPayload,
  type RunDonePayload,
  type RunLivePayload,
} from '@/composables/useChatRunStream'
import type { ChatDialogFns, ChatInterfaceEmitFn, ChatInterfaceProps, ChatRunPhase } from '@/types/chat'
import { waitMs } from '@/utils/chatAsync'
import {
  createLiveBoundaryTrackers,
  isTerminalRunStatus,
  matchLivePayloadSession,
  normalizeRunStatus,
  optionalBothEquals,
  optionalEquals,
  pinIfTurnCleared,
  requestSyncForTurn,
  resetLiveBoundaryTrackers,
  shouldAdoptForeignLiveRun,
  syncRunPhase,
  syncRunTool,
} from '@/utils/chatRunLive'
import type { ChatFrontPromptApi } from './useChatFrontPrompt'
import type { ChatHistoryApi } from './useChatHistory'
import type { ChatLiveAssistantApi } from './useChatLiveAssistant'
import type { ChatRunTimersApi } from './useChatRunTimers'
import type { ChatSessionsApi } from './useChatSessions'
import type { ChatWorkspaceState } from './useChatWorkspaceState'

export interface ChatRunControlDeps {
  props: ChatInterfaceProps
  emit: ChatInterfaceEmitFn
  state: ChatWorkspaceState
  timers: ChatRunTimersApi
  live: ChatLiveAssistantApi
  history: ChatHistoryApi
  sessions: ChatSessionsApi
  prompt: ChatFrontPromptApi
  dialogs: ChatDialogFns
}

interface RunCtl {
  deps: ChatRunControlDeps
  lastFinishedRunId: string
  lastRealtimeTokenSyncAt: number
  lastExternalRunCheckAt: number
  runPollEpoch: number
  sessionSyncPollEpoch: number
  externalRunDiscoveryEpoch: number
  runLivePollTimer: number | null
  runHistoryPollTimer: number | null
  sessionSyncPollTimer: number | null
  runHistorySyncRequested: boolean
  runHistorySyncPromise: Promise<void> | null
  trackers: ReturnType<typeof createLiveBoundaryTrackers>
  drainQueue: () => Promise<void>
  streamConnected: { value: boolean }
}

const liveSessionOf = (state: ChatWorkspaceState) => ({
  sessionId: state.currentSessionId.value,
  aiKind: state.aiKindValue.value,
  configId: Number(state.chatCtx.value.aiConfigId || 0),
})

const bumpTaskPlan = (deps: ChatRunControlDeps) => {
  deps.state.taskPlanRefreshSignal.value += 1
  deps.emit('taskPlanRefresh', deps.state.taskPlanRefreshSignal.value)
}

const phaseCtlOf = (ctl: RunCtl) => ({
  phase: ctl.deps.state.currentRunPhase,
  applyPhaseDelta: ctl.deps.timers.applyPhaseDelta,
  setPhaseEnterTs: ctl.deps.timers.setPhaseEnterTs,
})

const toolCtlOf = (ctl: RunCtl) => ({
  tool: ctl.deps.state.currentMcpTool,
  args: ctl.deps.state.currentMcpArguments,
  phase: ctl.deps.state.currentRunPhase,
  resetSegmentTimer: ctl.deps.timers.resetSegmentTimer,
  onPlanTool: () => bumpTaskPlan(ctl.deps),
})

const requestRunHistorySync = (ctl: RunCtl) => {
  ctl.runHistorySyncRequested = true
  if (ctl.runHistorySyncPromise) return
  ctl.runHistorySyncPromise = (async () => {
    await Promise.resolve()
    while (ctl.runHistorySyncRequested) {
      ctl.runHistorySyncRequested = false
      await ctl.deps.history.fetchRunHistoryIncrementalOnce()
    }
  })().finally(() => { ctl.runHistorySyncPromise = null })
}

const refreshTokensDuringRunIfNeeded = async (ctl: RunCtl, force = false) => {
  const now = Date.now()
  if (!force && now - ctl.lastRealtimeTokenSyncAt < 1000) return
  ctl.lastRealtimeTokenSyncAt = now
  await ctl.deps.sessions.loadTotalTokens()
}

const adoptExternalLiveRun = (ctl: RunCtl, runId: string) => {
  ctl.deps.state.currentRunId.value = runId
  ctl.deps.state.currentRunIsExternal.value = true
  ctl.deps.state.currentRunStatus.value = 'running'
  startRunPolling(ctl)
}

const beginLiveFrame = (ctl: RunCtl) => {
  ctl.deps.state.isTyping.value = true
  if (!ctl.deps.state.isRunActive.value) ctl.deps.state.currentRunStatus.value = 'running'
  if (ctl.deps.timers.runStartTs.value == null) ctl.deps.timers.initTimersFromStartedAt()
}

const applyLiveTexts = (
  ctl: RunCtl,
  currText: string,
  currReason: string,
  incomingPhase: ChatRunPhase,
  toolChanged: boolean,
  nextViewText: string,
  liveLen?: number,
) => {
  pinIfTurnCleared(ctl.trackers, currText, currReason, ctl.deps.live.pinCompletedLiveSegment)
  ctl.deps.live.liveThinkingText.value = currReason
  ctl.deps.live.updateLiveAssistantView(nextViewText)
  ctl.deps.live.liveCursor.value = Number.isFinite(liveLen) ? Number(liveLen) : ctl.deps.live.liveTargetText.value.length
  requestSyncForTurn(ctl.trackers, currText, currReason, incomingPhase, toolChanged, () => requestRunHistorySync(ctl))
}

const handleStreamLive = (ctl: RunCtl, payload: RunLivePayload) => {
  const runId = String(payload?.run_id || '')
  if (!runId) return
  if (runId !== ctl.deps.state.currentRunId.value) {
    if (!shouldAdoptForeignLiveRun(payload, ctl.deps.state.currentRunId.value, ctl.deps.state.isRunActive.value, liveSessionOf(ctl.deps.state))) return
    adoptExternalLiveRun(ctl, runId)
  }
  if (ctl.lastFinishedRunId === runId) return
  beginLiveFrame(ctl)
  const incomingPhase = (payload.phase || 'generating') as ChatRunPhase
  syncRunPhase(phaseCtlOf(ctl), incomingPhase)
  const toolChanged = syncRunTool(toolCtlOf(ctl), String(payload.current_tool || ''), String(payload.current_tool_arguments || ''))
  const currText = String(payload.text || '')
  applyLiveTexts(ctl, currText, String(payload.reasoning || ''), incomingPhase, toolChanged, currText, currText.length)
  void refreshTokensDuringRunIfNeeded(ctl)
}

const handleStreamDone = (ctl: RunCtl, payload: RunDonePayload) => {
  const runId = String(payload?.run_id || '')
  if (!runId) return
  if (runId === ctl.deps.state.currentRunId.value) {
    void finishRun(ctl, runId, String(payload.status || 'completed'), String(payload.error_message || ''))
    return
  }
  if (payload.session_id && payload.session_id === ctl.deps.state.currentSessionId.value) {
    void ctl.deps.history.fetchRunHistoryIncrementalOnce()
  }
}

const isCurrentDeviceTaskEvent = (ctl: RunCtl, payload: DeviceTaskEventPayload) => {
  if (!optionalEquals(String(payload?.sessionId || ''), ctl.deps.state.currentSessionId.value)) return false
  if (!optionalEquals(Number(payload?.aiConfigId || 0), Number(ctl.deps.props.aiConfigId || 0))) return false
  if (!optionalEquals(String(payload?.aiKind || ''), ctl.deps.state.aiKindValue.value)) return false
  if (!optionalBothEquals(String(payload?.tool || ''), ctl.deps.state.currentMcpTool.value)) return false
  return ctl.deps.state.isRunActive.value && ctl.deps.state.currentRunPhase.value === 'waiting_mcp'
}

const handleDeviceProgress = (ctl: RunCtl, payload: DeviceTaskEventPayload) => {
  if (!isCurrentDeviceTaskEvent(ctl, payload)) return
  ctl.deps.state.currentMcpDeviceId.value = String(payload.deviceId || '').trim()
  ctl.deps.state.currentDeviceTaskId.value = String(payload.taskId || '')
  ctl.deps.state.currentDeviceProgress.value = String(payload.message || '').trim() || '设备已接收调用'
}

const handleDeviceTerminal = (ctl: RunCtl, payload: DeviceTaskEventPayload) => {
  if (!isCurrentDeviceTaskEvent(ctl, payload)) return
  ctl.deps.state.currentMcpDeviceId.value = String(payload.deviceId || '').trim()
  const taskId = String(payload.taskId || '')
  if (ctl.deps.state.currentDeviceTaskId.value && taskId && taskId !== ctl.deps.state.currentDeviceTaskId.value) return
  ctl.deps.state.currentDeviceProgress.value = payload.error
    ? `设备执行失败：${payload.error}`
    : '设备执行完成，正在返回结果'
  void ctl.deps.history.fetchRunHistoryIncrementalOnce()
}

const handleHistoryChanged = (ctl: RunCtl, payload: ChatHistoryChangedPayload) => {
  const sessionId = String(payload.session_id || '')
  if (!sessionId || !matchLivePayloadSession(payload, liveSessionOf(ctl.deps.state))) return
  if (payload.action === 'append') {
    void ctl.deps.history.fetchRunHistoryIncrementalOnce().then(() => discoverExternalRun(ctl))
    return
  }
  void ctl.deps.history.loadChatHistory(sessionId)
}

const discoverExternalRun = async (ctl: RunCtl) => {
  const epoch = ++ctl.externalRunDiscoveryEpoch
  const sessionId = ctl.deps.state.currentSessionId.value
  for (const delay of [0, 150, 450, 1000]) {
    if (delay) await waitMs(delay)
    if (epoch !== ctl.externalRunDiscoveryEpoch || sessionId !== ctl.deps.state.currentSessionId.value || ctl.deps.state.isRunActive.value) return
    await checkActiveRun(ctl)
  }
}

const finishRun = async (ctl: RunCtl, runId: string, status: string, errorMessage: string) => {
  if (!runId || runId !== ctl.deps.state.currentRunId.value || ctl.lastFinishedRunId === runId) return
  ctl.lastFinishedRunId = runId
  stopRunPolling(ctl)
  const epoch = ctl.runPollEpoch
  ctl.deps.state.isTyping.value = false
  ctl.deps.state.currentRunStatus.value = normalizeRunStatus(status)
  ctl.deps.timers.finalizeRunTimers()
  ctl.deps.state.currentRunPhase.value = 'idle'
  ctl.deps.state.currentMcpTool.value = ''
  resetLiveBoundaryTrackers(ctl.trackers)
  await ctl.deps.history.fetchRunHistoryIncrementalOnce()
  await ensureFinalAssistantMessage(ctl, epoch)
  ctl.deps.live.clearLiveAssistantView()
  if (ctl.deps.state.currentRunStatus.value === 'error') {
    await ctl.deps.history.appendRunErrorNotice(runId, errorMessage || '后端运行失败，但没有返回具体错误信息。')
  }
  await afterRunSettled(ctl)
}

const afterRunSettled = async (ctl: RunCtl) => {
  await ctl.deps.sessions.loadTotalTokens()
  ctl.deps.timers.stopTimeTicker()
  bumpTaskPlan(ctl.deps)
  void ctl.deps.prompt.loadFrontPromptToolSchemas()
  await ctl.drainQueue()
}

const stopRunPolling = (ctl: RunCtl) => {
  ctl.runPollEpoch += 1
  if (ctl.runLivePollTimer !== null) window.clearTimeout(ctl.runLivePollTimer)
  if (ctl.runHistoryPollTimer !== null) window.clearTimeout(ctl.runHistoryPollTimer)
  ctl.runLivePollTimer = null
  ctl.runHistoryPollTimer = null
}

const stopSessionSyncPolling = (ctl: RunCtl) => {
  ctl.sessionSyncPollEpoch += 1
  if (ctl.sessionSyncPollTimer !== null) window.clearTimeout(ctl.sessionSyncPollTimer)
  ctl.sessionSyncPollTimer = null
}

const ensureFinalAssistantMessage = async (ctl: RunCtl, epoch: number) => {
  const finalText = String(ctl.deps.live.liveTargetText.value || '').trim()
  if (!finalText || ctl.deps.history.hasAssistantMessageWithContent(finalText)) return
  for (let i = 0; i < 8; i += 1) {
    if (epoch !== ctl.runPollEpoch) return
    await waitMs(120)
    await ctl.deps.history.fetchRunHistoryIncrementalOnce()
    if (ctl.deps.history.hasAssistantMessageWithContent(finalText)) return
  }
  await ctl.deps.history.appendLiveAssistantAsLocalMessage(ctl.deps.live.liveTargetText.value)
}

const pollRunHistory = async (ctl: RunCtl, epoch: number) => {
  if (epoch !== ctl.runPollEpoch) return
  try {
    await ctl.deps.history.fetchRunHistoryIncrementalOnce()
  } finally {
    if (epoch === ctl.runPollEpoch && ctl.deps.state.isRunActive.value) {
      ctl.runHistoryPollTimer = window.setTimeout(() => { void pollRunHistory(ctl, epoch) }, 900)
    }
  }
}

const applyPolledRunSnapshot = (ctl: RunCtl, run: any) => {
  ctl.deps.state.currentRunStatus.value = run.status || 'running'
  if (run.started_at && ctl.deps.timers.runStartTs.value == null) ctl.deps.timers.initTimersFromStartedAt(run.started_at)
  const incomingPhase = (run.live_phase || 'generating') as ChatRunPhase
  syncRunPhase(phaseCtlOf(ctl), incomingPhase)
  const incomingTool = String(run.current_tool || '')
  const toolChanged = syncRunTool(toolCtlOf(ctl), incomingTool, String(run.current_tool_arguments || ''))
  const currText = String(run.live_text || '')
  const currReason = String(run.live_reasoning || '')
  const delta = String(run.live_delta || '')
  const nextView = delta ? ctl.deps.live.liveTargetText.value + delta : currText
  const liveLen = Number.isFinite(Number(run.live_len)) ? Number(run.live_len) : undefined
  applyLiveTexts(ctl, currText, currReason, incomingPhase, toolChanged, nextView, liveLen)
}

const handlePollLiveError = async (ctl: RunCtl, err: any) => {
  if (ctl.streamConnected.value) return false
  ctl.deps.state.currentRunStatus.value = 'error'
  ctl.deps.state.isTyping.value = false
  ctl.deps.timers.finalizeRunTimers()
  ctl.deps.live.clearLiveAssistantView()
  ctl.deps.timers.stopTimeTicker()
  await ctl.deps.history.appendRunErrorNotice(ctl.deps.state.currentRunId.value, err?.message || '状态查询失败')
  return true
}

const pollRunLive = async (ctl: RunCtl, epoch: number) => {
  if (epoch !== ctl.runPollEpoch || !ctl.deps.state.currentRunId.value || !getAuthToken()) return
  let run
  try {
    run = await chatApi.getRunStatus(ctl.deps.state.currentRunId.value, ctl.deps.live.liveCursor.value)
  } catch (err: any) {
    if (await handlePollLiveError(ctl, err)) return
    return
  }
  try {
    applyPolledRunSnapshot(ctl, run)
    if (isTerminalRunStatus(ctl.deps.state.currentRunStatus.value)) {
      await finishRun(ctl, ctl.deps.state.currentRunId.value, ctl.deps.state.currentRunStatus.value, String(run.error_message || ''))
      return
    }
    await refreshTokensDuringRunIfNeeded(ctl)
  } catch {
    // ignore transient errors and keep polling
  } finally {
    if (epoch === ctl.runPollEpoch && ctl.deps.state.isRunActive.value) {
      const interval = ctl.streamConnected.value ? 350 : 90
      ctl.runLivePollTimer = window.setTimeout(() => { void pollRunLive(ctl, epoch) }, interval)
    }
  }
}

const startRunPolling = (ctl: RunCtl) => {
  stopRunPolling(ctl)
  ctl.lastFinishedRunId = ''
  ctl.lastRealtimeTokenSyncAt = 0
  const epoch = ctl.runPollEpoch
  ctl.deps.live.liveCursor.value = ctl.deps.live.liveTargetText.value.length
  if (!ctl.streamConnected.value || ctl.deps.state.currentRunIsExternal.value) void pollRunLive(ctl, epoch)
  void pollRunHistory(ctl, epoch)
}

const applyActiveRun = (ctl: RunCtl, run: any) => {
  if (ctl.deps.state.currentRunId.value !== run.run_id) ctl.deps.state.currentRunIsExternal.value = true
  ctl.deps.state.currentRunId.value = run.run_id
  ctl.deps.state.currentRunStatus.value = run.status || 'running'
  if (ctl.deps.timers.runStartTs.value == null) ctl.deps.timers.initTimersFromStartedAt(run.started_at)
  syncRunPhase(phaseCtlOf(ctl), (run.live_phase || 'generating') as ChatRunPhase)
  ctl.deps.state.currentMcpTool.value = String(run.current_tool || '')
  ctl.deps.state.currentMcpArguments.value = String(run.current_tool_arguments || '')
  ctl.deps.live.liveThinkingText.value = String(run.live_reasoning || '')
  ctl.deps.live.updateLiveAssistantView(String(run.live_text || ''))
  ctl.deps.live.liveCursor.value = Number(run.live_len || String(run.live_text || '').length || 0)
  ctl.deps.state.isTyping.value = ['queued', 'running'].includes(ctl.deps.state.currentRunStatus.value)
}

const checkActiveRun = async (ctl: RunCtl) => {
  if (!ctl.deps.state.currentSessionId.value || !getAuthToken()) return
  let data
  try {
    data = await chatApi.getActiveRun(ctl.deps.state.chatCtx.value, ctl.deps.state.currentSessionId.value)
  } catch {
    return
  }
  if (!data?.run?.run_id) return
  applyActiveRun(ctl, data.run)
  if (ctl.deps.state.isTyping.value) startRunPolling(ctl)
}

const stopCurrentRun = async (ctl: RunCtl) => {
  if (!ctl.deps.state.currentRunId.value || !getAuthToken()) return
  try {
    await chatApi.stopRun(ctl.deps.state.currentRunId.value)
    ctl.lastFinishedRunId = ctl.deps.state.currentRunId.value
    stopRunPolling(ctl)
    ctl.deps.state.isTyping.value = false
    ctl.deps.state.currentRunStatus.value = 'stopped'
    ctl.deps.timers.finalizeRunTimers()
    ctl.deps.state.currentRunPhase.value = 'idle'
    ctl.deps.state.currentMcpTool.value = ''
    ctl.deps.live.clearLiveAssistantView()
    resetLiveBoundaryTrackers(ctl.trackers)
    await ctl.deps.history.fetchRunHistoryIncrementalOnce()
    await ctl.deps.sessions.loadTotalTokens()
    ctl.deps.timers.stopTimeTicker()
    await ctl.drainQueue()
  } catch (err: any) {
    await ctl.deps.dialogs.alert({ message: `终止失败: ${String(err?.message || '未知错误')}`, type: 'error' })
  }
}

const pollSessionSync = async (ctl: RunCtl, epoch: number) => {
  if (epoch !== ctl.sessionSyncPollEpoch) return
  try {
    if (ctl.deps.state.currentSessionId.value && getAuthToken() && !ctl.deps.state.isRunActive.value) {
      await ctl.deps.history.fetchRunHistoryIncrementalOnce()
      const now = Date.now()
      if (now - ctl.lastExternalRunCheckAt > 1500) {
        ctl.lastExternalRunCheckAt = now
        await checkActiveRun(ctl)
      }
    }
  } finally {
    if (epoch === ctl.sessionSyncPollEpoch) {
      const interval = ctl.streamConnected.value ? 3000 : 1200
      ctl.sessionSyncPollTimer = window.setTimeout(() => { void pollSessionSync(ctl, epoch) }, interval)
    }
  }
}

const startSessionSyncPolling = (ctl: RunCtl) => {
  stopSessionSyncPolling(ctl)
  if (!ctl.deps.state.currentSessionId.value || !getAuthToken()) return
  ctl.lastExternalRunCheckAt = 0
  ctl.sessionSyncPollTimer = window.setTimeout(() => { void pollSessionSync(ctl, ctl.sessionSyncPollEpoch) }, 1200)
}

const resetRunUi = (ctl: RunCtl) => {
  stopRunPolling(ctl)
  stopSessionSyncPolling(ctl)
  ctl.deps.timers.stopTimeTicker()
  ctl.deps.timers.resetRunTimers()
  ctl.deps.timers.lastRunDurations.value = null
  ctl.deps.state.currentRunId.value = ''
  ctl.deps.state.currentRunIsExternal.value = false
  ctl.deps.state.currentRunStatus.value = 'idle'
  ctl.deps.state.currentRunPhase.value = 'idle'
  ctl.deps.state.currentMcpTool.value = ''
  ctl.deps.state.currentMcpDeviceId.value = ''
  ctl.deps.live.clearLiveAssistantView()
  ctl.deps.state.isTyping.value = false
}

const createRunCtl = (deps: ChatRunControlDeps): RunCtl => ({
  deps,
  lastFinishedRunId: '',
  lastRealtimeTokenSyncAt: 0,
  lastExternalRunCheckAt: 0,
  runPollEpoch: 0,
  sessionSyncPollEpoch: 0,
  externalRunDiscoveryEpoch: 0,
  runLivePollTimer: null,
  runHistoryPollTimer: null,
  sessionSyncPollTimer: null,
  runHistorySyncRequested: false,
  runHistorySyncPromise: null,
  trackers: createLiveBoundaryTrackers(),
  drainQueue: async () => {},
  streamConnected: { value: false },
})

const wireRunWatchers = (ctl: RunCtl, stream: ReturnType<typeof useChatRunStream>) => {
  ctl.streamConnected = stream.connected
  watch(ctl.deps.state.currentRunPhase, phase => {
    if (phase !== 'waiting_mcp') ctl.deps.state.currentMcpArguments.value = ''
  })
  watch([ctl.deps.state.currentRunPhase, ctl.deps.state.currentMcpTool], ([phase, tool], [previousPhase, previousTool]) => {
    if (phase !== 'waiting_mcp' || phase !== previousPhase || tool !== previousTool) {
      ctl.deps.state.currentDeviceTaskId.value = ''
      ctl.deps.state.currentDeviceProgress.value = ''
    }
  })
  watch(() => ctl.deps.props.currentUserId, uid => { if (uid) stream.connect(uid) })
  watch(() => stream.connected.value, () => {
    if (ctl.deps.state.isRunActive.value) startRunPolling(ctl)
  })
}

export const useChatRunControl = (deps: ChatRunControlDeps) => {
  const ctl = createRunCtl(deps)
  const stream = useChatRunStream({
    onLive: payload => handleStreamLive(ctl, payload),
    onDone: payload => handleStreamDone(ctl, payload),
    onDeviceProgress: payload => handleDeviceProgress(ctl, payload),
    onDeviceResult: payload => handleDeviceTerminal(ctl, payload),
    onDeviceError: payload => handleDeviceTerminal(ctl, payload),
    onHistoryChanged: payload => handleHistoryChanged(ctl, payload),
  })
  wireRunWatchers(ctl, stream)
  onBeforeUnmount(() => {
    stopRunPolling(ctl)
    stopSessionSyncPolling(ctl)
    ctl.deps.live.clearLiveAssistantView()
  })
  return {
    bumpTaskPlan: () => bumpTaskPlan(deps),
    startRunPolling: () => startRunPolling(ctl),
    stopRunPolling: () => stopRunPolling(ctl),
    startSessionSyncPolling: () => startSessionSyncPolling(ctl),
    stopSessionSyncPolling: () => stopSessionSyncPolling(ctl),
    checkActiveRun: () => checkActiveRun(ctl),
    stopCurrentRun: () => stopCurrentRun(ctl),
    finishRun: (runId: string, status: string, errorMessage: string) => finishRun(ctl, runId, status, errorMessage),
    resetRunUi: () => resetRunUi(ctl),
    resetBoundaryTrackers: () => resetLiveBoundaryTrackers(ctl.trackers),
    bumpExternalDiscovery: () => { ctl.externalRunDiscoveryEpoch += 1 },
    connectStream: (uid: number) => stream.connect(uid),
    setDrainQueue: (fn: () => Promise<void>) => { ctl.drainQueue = fn },
  }
}

export type ChatRunControlApi = ReturnType<typeof useChatRunControl>
