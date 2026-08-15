import { computed, onBeforeUnmount, ref, type Ref } from 'vue'
import type { ChatInterfaceProps, ChatRunPhase } from '@/types/chat'
import { formatDurationMs } from '@/utils/datetime'
import type { ChatWorkspaceState } from './useChatWorkspaceState'

const RUN_STATS_KEY = 'heysure_run_stats'
const RUN_STATS_MAX = 500

interface TimerBag {
  runStartTs: Ref<number | null>
  mcpElapsedMs: Ref<number>
  thinkElapsedMs: Ref<number>
  phaseEnterTs: Ref<number | null>
  lastRunDurations: Ref<{ total: number; mcp: number; think: number } | null>
  timeTick: Ref<number>
  timeTickTimer: number | null
}

const saveRunStat = (
  props: ChatInterfaceProps,
  sessionId: string,
  durations: { total: number; mcp: number; think: number },
) => {
  try {
    const raw = localStorage.getItem(RUN_STATS_KEY)
    const arr: unknown[] = raw ? (JSON.parse(raw) as unknown[]) : []
    arr.push({
      ts: Math.floor(Date.now() / 1000),
      aiConfigId: props.aiConfigId ?? null,
      sessionId: sessionId || null,
      total: durations.total,
      think: durations.think,
      mcp: durations.mcp,
    })
    if (arr.length > RUN_STATS_MAX) arr.splice(0, arr.length - RUN_STATS_MAX)
    localStorage.setItem(RUN_STATS_KEY, JSON.stringify(arr))
  } catch {
    // localStorage unavailable
  }
}

const startTimeTicker = (bag: TimerBag) => {
  if (bag.timeTickTimer != null) return
  bag.timeTickTimer = window.setInterval(() => {
    bag.timeTick.value = Date.now()
  }, 200)
}

const stopTimeTicker = (bag: TimerBag) => {
  if (bag.timeTickTimer == null) return
  window.clearInterval(bag.timeTickTimer)
  bag.timeTickTimer = null
}

const applyPhaseDelta = (bag: TimerBag, phase: ChatRunPhase) => {
  if (bag.phaseEnterTs.value == null) return
  const delta = Date.now() - bag.phaseEnterTs.value
  if (phase === 'waiting_mcp') bag.mcpElapsedMs.value += delta
  else if (phase === 'generating') bag.thinkElapsedMs.value += delta
}

const resetRunTimers = (bag: TimerBag) => {
  bag.runStartTs.value = null
  bag.mcpElapsedMs.value = 0
  bag.thinkElapsedMs.value = 0
  bag.phaseEnterTs.value = null
}

const startRunTimers = (bag: TimerBag) => {
  resetRunTimers(bag)
  const now = Date.now()
  bag.runStartTs.value = now
  bag.phaseEnterTs.value = now
  bag.lastRunDurations.value = null
  startTimeTicker(bag)
}

const finalizeRunTimers = (
  bag: TimerBag,
  props: ChatInterfaceProps,
  sessionId: string,
  phase: ChatRunPhase,
) => {
  applyPhaseDelta(bag, phase)
  if (bag.runStartTs.value != null) {
    const total = Date.now() - bag.runStartTs.value
    bag.lastRunDurations.value = {
      total,
      mcp: bag.mcpElapsedMs.value,
      think: bag.thinkElapsedMs.value,
    }
    saveRunStat(props, sessionId, bag.lastRunDurations.value)
  }
  bag.runStartTs.value = null
  bag.phaseEnterTs.value = null
}

const updatePhase = (bag: TimerBag, state: ChatWorkspaceState, newPhase: ChatRunPhase) => {
  if (newPhase === state.currentRunPhase.value) return
  applyPhaseDelta(bag, state.currentRunPhase.value)
  state.currentRunPhase.value = newPhase
  bag.phaseEnterTs.value = newPhase === 'idle' ? null : Date.now()
}

const resetSegmentTimer = (bag: TimerBag, phase: ChatRunPhase) => {
  if (bag.phaseEnterTs.value == null) return
  applyPhaseDelta(bag, phase)
  bag.phaseEnterTs.value = Date.now()
}

const initTimersFromStartedAt = (bag: TimerBag, startedAt?: number) => {
  if (bag.runStartTs.value != null) return
  bag.lastRunDurations.value = null
  bag.runStartTs.value = startedAt
    ? Math.floor(Number(startedAt) * 1000)
    : Date.now()
  bag.phaseEnterTs.value = Date.now()
  startTimeTicker(bag)
}

export const useChatRunTimers = (props: ChatInterfaceProps, state: ChatWorkspaceState) => {
  const bag: TimerBag = {
    runStartTs: ref<number | null>(null),
    mcpElapsedMs: ref(0),
    thinkElapsedMs: ref(0),
    phaseEnterTs: ref<number | null>(null),
    lastRunDurations: ref<{ total: number; mcp: number; think: number } | null>(null),
    timeTick: ref(Date.now()),
    timeTickTimer: null,
  }
  const liveSegmentMs = computed(() => {
    if (bag.phaseEnterTs.value == null) return 0
    return Math.max(0, bag.timeTick.value - bag.phaseEnterTs.value)
  })
  const runTimingText = computed(() => {
    if (!state.isRunActive.value) return ''
    if (state.currentRunPhase.value === 'waiting_mcp') {
      const label = state.currentMcpTool.value
        ? `正在执行 MCP：${state.currentMcpTool.value}`
        : '正在执行 MCP'
      const progress = state.currentDeviceProgress.value
        ? ` · ${state.currentDeviceProgress.value}`
        : ''
      return `${label}${progress} · ${formatDurationMs(liveSegmentMs.value)}`
    }
    return `AI 思考中 · ${formatDurationMs(liveSegmentMs.value)}`
  })
  onBeforeUnmount(() => stopTimeTicker(bag))
  return {
    runStartTs: bag.runStartTs,
    phaseEnterTs: bag.phaseEnterTs,
    lastRunDurations: bag.lastRunDurations,
    timeTick: bag.timeTick,
    liveSegmentMs,
    runTimingText,
    startTimeTicker: () => startTimeTicker(bag),
    stopTimeTicker: () => stopTimeTicker(bag),
    applyPhaseDelta: () => applyPhaseDelta(bag, state.currentRunPhase.value),
    resetRunTimers: () => resetRunTimers(bag),
    startRunTimers: () => startRunTimers(bag),
    finalizeRunTimers: () => finalizeRunTimers(bag, props, state.currentSessionId.value, state.currentRunPhase.value),
    updatePhase: (phase: ChatRunPhase) => updatePhase(bag, state, phase),
    resetSegmentTimer: () => resetSegmentTimer(bag, state.currentRunPhase.value),
    initTimersFromStartedAt: (startedAt?: number) => initTimersFromStartedAt(bag, startedAt),
    setPhaseEnterTs: (ts: number | null) => { bag.phaseEnterTs.value = ts },
  }
}

export type ChatRunTimersApi = ReturnType<typeof useChatRunTimers>
