import { computed, nextTick, onMounted, onUnmounted, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { Agent } from '@/types'
import {
  conversationRunActive,
  IDLE_THINKING_TEXT,
  thinkingFallbackText,
} from './agentCardDisplay'

const reduceCardMotion = typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce), (hover: none) and (pointer: coarse)').matches

interface ThinkingMotionState {
  thinkingPreview: Ref<string>
  thinkingViewportRef: Ref<HTMLElement | null>
  thinkingTextRef: Ref<HTMLElement | null>
  isConversationRunActive: ComputedRef<boolean>
  getAgent: () => Agent
  thinkingRaf: number
  thinkingOffset: number
  thinkingMaxScroll: number
  thinkingIdleTimer: number
  lastLiveThinking: string
}

function thinkingScrollSpeed(textLength: number, maxScroll: number) {
  const lengthFactor = Math.min(3.0, Math.max(0, textLength / 220))
  const distanceFactor = Math.min(3.5, Math.max(0, maxScroll / 180))
  return 0.8 + lengthFactor + distanceFactor
}

function stopThinkingMotion(state: ThinkingMotionState) {
  if (!state.thinkingRaf) return
  window.cancelAnimationFrame(state.thinkingRaf)
  state.thinkingRaf = 0
}

function clearThinkingIdleTimer(state: ThinkingMotionState) {
  if (!state.thinkingIdleTimer) return
  window.clearTimeout(state.thinkingIdleTimer)
  state.thinkingIdleTimer = 0
}

function stepThinkingMotion(state: ThinkingMotionState) {
  const viewport = state.thinkingViewportRef.value
  if (!viewport) return
  if (state.thinkingMaxScroll <= 1) {
    state.thinkingOffset = 0
    viewport.scrollTop = 0
    return
  }
  const speed = thinkingScrollSpeed(state.thinkingPreview.value.length, state.thinkingMaxScroll)
  state.thinkingOffset = Math.min(state.thinkingMaxScroll, state.thinkingOffset + speed)
  viewport.scrollTop = state.thinkingOffset
  if (state.thinkingOffset >= state.thinkingMaxScroll - 0.5) {
    stopThinkingMotion(state)
    return
  }
  state.thinkingRaf = window.requestAnimationFrame(() => stepThinkingMotion(state))
}

function startThinkingMotion(state: ThinkingMotionState, reset = true) {
  stopThinkingMotion(state)
  const viewport = state.thinkingViewportRef.value
  const text = state.thinkingTextRef.value
  if (!viewport || !text) return
  state.thinkingMaxScroll = Math.max(0, text.scrollHeight - viewport.clientHeight)
  state.thinkingOffset = reset
    ? 0
    : Math.max(0, Math.min(viewport.scrollTop, state.thinkingMaxScroll))
  viewport.scrollTop = state.thinkingOffset
  if (state.thinkingMaxScroll <= 1) return
  state.thinkingRaf = window.requestAnimationFrame(() => stepThinkingMotion(state))
}

async function showIdleThinking(state: ThinkingMotionState) {
  state.thinkingPreview.value = thinkingFallbackText(state.getAgent(), state.isConversationRunActive.value)
  state.lastLiveThinking = ''
  await nextTick()
  stopThinkingMotion(state)
  state.thinkingOffset = 0
  const viewport = state.thinkingViewportRef.value
  if (viewport) viewport.scrollTop = 0
}

function scheduleIdleThinking(state: ThinkingMotionState) {
  clearThinkingIdleTimer(state)
  state.thinkingIdleTimer = window.setTimeout(() => {
    void showIdleThinking(state)
  }, 5000)
}

function applyContinuedThinking(state: ThinkingMotionState) {
  const viewport = state.thinkingViewportRef.value
  const text = state.thinkingTextRef.value
  if (viewport && text) {
    const maxScroll = Math.max(0, text.scrollHeight - viewport.clientHeight)
    state.thinkingOffset = Math.max(0, Math.min(viewport.scrollTop, maxScroll))
  }
  if (!state.thinkingRaf) startThinkingMotion(state, false)
}

function applyReducedMotionThinking(state: ThinkingMotionState) {
  stopThinkingMotion(state)
  const viewport = state.thinkingViewportRef.value
  if (viewport) viewport.scrollTop = viewport.scrollHeight
}

async function syncEmptyThinking(state: ThinkingMotionState) {
  if (state.isConversationRunActive.value) {
    clearThinkingIdleTimer(state)
    await showIdleThinking(state)
    return
  }
  scheduleIdleThinking(state)
}

async function syncThinkingFromLive(state: ThinkingMotionState) {
  const liveThinking = String(state.getAgent().latestThinking || '').trim()
  if (!liveThinking) {
    await syncEmptyThinking(state)
    return
  }
  clearThinkingIdleTimer(state)
  const shouldContinue = !!state.lastLiveThinking
    && liveThinking.length >= state.lastLiveThinking.length
    && liveThinking.startsWith(state.lastLiveThinking)
  state.thinkingPreview.value = liveThinking
  await nextTick()
  if (reduceCardMotion) applyReducedMotionThinking(state)
  else if (shouldContinue) applyContinuedThinking(state)
  else startThinkingMotion(state, true)
  state.lastLiveThinking = liveThinking
}

function thinkingWatchSource(getAgent: () => Agent) {
  const agent = getAgent()
  return [
    agent.latestThinking,
    agent.activeRunStatus,
    agent.activeRunPhase,
    agent.userChatActive,
    agent.runtimeStatus,
    agent.runtimeTool,
  ]
}

export function useAgentCardThinking(getAgent: () => Agent) {
  const thinkingPreview = ref(IDLE_THINKING_TEXT)
  const thinkingViewportRef = ref<HTMLElement | null>(null)
  const thinkingTextRef = ref<HTMLElement | null>(null)
  const isConversationRunActive = computed(() => conversationRunActive(getAgent()))
  const state: ThinkingMotionState = {
    thinkingPreview,
    thinkingViewportRef,
    thinkingTextRef,
    isConversationRunActive,
    getAgent,
    thinkingRaf: 0,
    thinkingOffset: 0,
    thinkingMaxScroll: 0,
    thinkingIdleTimer: 0,
    lastLiveThinking: '',
  }

  watch(
    () => thinkingWatchSource(getAgent),
    () => {
      void syncThinkingFromLive(state)
    },
  )

  onMounted(async () => {
    await nextTick()
    await syncThinkingFromLive(state)
  })

  onUnmounted(() => {
    stopThinkingMotion(state)
    clearThinkingIdleTimer(state)
  })

  return {
    thinkingPreview,
    thinkingViewportRef,
    thinkingTextRef,
  }
}
