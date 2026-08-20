import { ref, type Ref } from 'vue'
import { parseChatResponseInline } from '@/utils/chatParser'
import { hasAssistantMessageWithContent } from '@/utils/chatHistoryMap'
import type { ChatMessage } from '@/types/chat'

const LIVE_MIN_SPEED = 36
const LIVE_MAX_SPEED = 560
const LIVE_DAMPING = 12
const LIVE_SPEED_GAIN = 58
const LIVE_SCROLL_INTERVAL_MS = 32

export interface LiveScrollHooks {
  stickToBottom: Ref<boolean>
  chatScrollRef: Ref<HTMLElement | null>
  followBottomNow: () => void
  followBottomDamped: () => void
}

interface LiveAssistState {
  liveThinkingText: Ref<string>
  liveAssistantText: Ref<string>
  liveTargetText: Ref<string>
  liveCursor: Ref<number>
  liveTypingFrame: number | null
  liveRenderLength: number
  liveRenderVelocity: number
  liveLastFrameTs: number
  liveLastScrollTs: number
  scroll: LiveScrollHooks
  messages: Ref<ChatMessage[]>
}

const applyLiveAssistantText = (bag: LiveAssistState, text: string) => {
  bag.liveAssistantText.value = text
}

const updateLiveThinkingView = (bag: LiveAssistState, text: string) => {
  bag.liveThinkingText.value = text
  if (bag.scroll.stickToBottom.value) bag.scroll.followBottomDamped()
}

const maybeAutoScrollDuringLive = (bag: LiveAssistState, ts: number) => {
  const el = bag.scroll.chatScrollRef.value
  if (!el || !bag.scroll.stickToBottom.value) return
  if (ts - bag.liveLastScrollTs < LIVE_SCROLL_INTERVAL_MS) return
  bag.liveLastScrollTs = ts
  bag.scroll.followBottomDamped()
}

const stopLiveTypingLoop = (bag: LiveAssistState) => {
  if (bag.liveTypingFrame !== null) {
    window.cancelAnimationFrame(bag.liveTypingFrame)
    bag.liveTypingFrame = null
  }
  bag.liveRenderVelocity = 0
  bag.liveLastFrameTs = 0
}

const finishLiveFrame = (bag: LiveAssistState, target: string, ts: number) => {
  applyLiveAssistantText(bag, target)
  bag.liveRenderLength = target.length
  bag.liveRenderVelocity = 0
  stopLiveTypingLoop(bag)
  maybeAutoScrollDuringLive(bag, ts)
}

const runLiveTypingFrame = (bag: LiveAssistState, ts: number) => {
  const target = bag.liveTargetText.value || ''
  const current = bag.liveAssistantText.value || ''
  const frameDt = bag.liveLastFrameTs > 0 ? Math.min(0.05, (ts - bag.liveLastFrameTs) / 1000) : 1 / 60
  bag.liveLastFrameTs = ts
  if (!target) {
    applyLiveAssistantText(bag, '')
    bag.liveRenderLength = 0
    stopLiveTypingLoop(bag)
    return
  }
  if (!target.startsWith(current)) {
    finishLiveFrame(bag, target, ts)
    return
  }
  if (bag.liveRenderLength < current.length) bag.liveRenderLength = current.length
  const distance = Math.max(0, target.length - bag.liveRenderLength)
  if (distance <= 0.0001) {
    finishLiveFrame(bag, target, ts)
    return
  }
  advanceLiveTyping(bag, target, current, distance, frameDt, ts)
}

const advanceLiveTyping = (
  bag: LiveAssistState,
  target: string,
  current: string,
  distance: number,
  frameDt: number,
  ts: number,
) => {
  const desiredVelocity = Math.min(LIVE_MAX_SPEED, LIVE_MIN_SPEED + Math.sqrt(distance) * LIVE_SPEED_GAIN)
  const smoothing = 1 - Math.exp(-LIVE_DAMPING * frameDt)
  bag.liveRenderVelocity += (desiredVelocity - bag.liveRenderVelocity) * smoothing
  const advance = Math.max(0.2, bag.liveRenderVelocity * frameDt)
  bag.liveRenderLength = Math.min(target.length, bag.liveRenderLength + advance)
  const nextLen = Math.max(0, Math.floor(bag.liveRenderLength))
  if (nextLen !== current.length || current !== target.slice(0, nextLen)) {
    applyLiveAssistantText(bag, target.slice(0, nextLen))
  }
  maybeAutoScrollDuringLive(bag, ts)
  bag.liveTypingFrame = window.requestAnimationFrame(nextTs => runLiveTypingFrame(bag, nextTs))
}

const updateLiveAssistantView = (bag: LiveAssistState, text: string) => {
  const nextTarget = text || ''
  const current = bag.liveAssistantText.value || ''
  bag.liveTargetText.value = nextTarget
  if (!nextTarget) {
    applyLiveAssistantText(bag, '')
    bag.liveRenderLength = 0
    stopLiveTypingLoop(bag)
    return
  }
  if (!nextTarget.startsWith(current)) {
    applyLiveAssistantText(bag, '')
    bag.liveRenderLength = 0
    bag.liveRenderVelocity = 0
  } else {
    bag.liveRenderLength = Math.min(nextTarget.length, Math.max(bag.liveRenderLength, current.length))
  }
  if (bag.liveTypingFrame === null) {
    bag.liveLastFrameTs = 0
    bag.liveTypingFrame = window.requestAnimationFrame(ts => runLiveTypingFrame(bag, ts))
  }
}

const clearLiveAssistantView = (bag: LiveAssistState) => {
  applyLiveAssistantText(bag, '')
  bag.liveThinkingText.value = ''
  bag.liveTargetText.value = ''
  bag.liveCursor.value = 0
  bag.liveRenderLength = 0
  bag.liveLastScrollTs = 0
  stopLiveTypingLoop(bag)
}

const pinCompletedLiveSegment = (bag: LiveAssistState, text: string, reasoning: string) => {
  const content = String(text || '')
  if (!content.trim() || hasAssistantMessageWithContent(bag.messages.value, content)) return
  const parsed = parseChatResponseInline(content)
  bag.messages.value.push({
    role: 'assistant',
    content,
    created_at: Date.now(),
    display_text: parsed.displayText,
    think: String(reasoning || '').trim() || parsed.think,
    blocks: parsed.blocks,
    inlineContent: parsed.inlineContent,
  })
}

export const useChatLiveAssistant = (scroll: LiveScrollHooks, messages: Ref<ChatMessage[]>) => {
  const bag: LiveAssistState = {
    liveThinkingText: ref(''),
    liveAssistantText: ref(''),
    liveTargetText: ref(''),
    liveCursor: ref(0),
    liveTypingFrame: null,
    liveRenderLength: 0,
    liveRenderVelocity: 0,
    liveLastFrameTs: 0,
    liveLastScrollTs: 0,
    scroll,
    messages,
  }
  return {
    liveThinkingText: bag.liveThinkingText,
    liveAssistantText: bag.liveAssistantText,
    liveTargetText: bag.liveTargetText,
    liveCursor: bag.liveCursor,
    updateLiveThinkingView: (text: string) => updateLiveThinkingView(bag, text),
    updateLiveAssistantView: (text: string) => updateLiveAssistantView(bag, text),
    clearLiveAssistantView: () => clearLiveAssistantView(bag),
    stopLiveTypingLoop: () => stopLiveTypingLoop(bag),
    pinCompletedLiveSegment: (text: string, reasoning: string) => pinCompletedLiveSegment(bag, text, reasoning),
  }
}

export type ChatLiveAssistantApi = ReturnType<typeof useChatLiveAssistant>
