import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

const PROGRAMMATIC_SCROLL_GRACE_MS = 260
const USER_SCROLL_INTENT_MS = 900
const PIN_SETTLE_INTERVAL_MS = 90
const PIN_SETTLE_MAX_MS = 4000
const LOAD_OLDER_THRESHOLD_PX = 800
const FOLLOW_SPRING = 190
const FOLLOW_DAMPING = 27
const FOLLOW_MAX_SPEED = 4200
const FOLLOW_SNAP_DISTANCE = 0.75

interface ScrollBag {
  chatScrollRef: Ref<HTMLElement | null>
  chatRootRef: Ref<HTMLElement | null>
  stickToBottom: Ref<boolean>
  visualViewportFrame: number | null
  followFrame: number | null
  followVelocity: number
  followLastFrameTs: number
  chatResizeObserver: ResizeObserver | null
  pinSettleTimer: number | null
  lastProgrammaticScrollTs: number
  lastObservedScrollTop: number
  userScrollIntentUntil: number
  touchScrollPointerId: number | null
  touchScrollStartY: number
  onLoadOlder: () => void
}

const getDistanceFromBottom = (el: HTMLElement) =>
  el.scrollHeight - el.scrollTop - el.clientHeight

const isNearBottom = (el: HTMLElement, threshold = 36) =>
  getDistanceFromBottom(el) <= threshold

const followBottomNow = (bag: ScrollBag) => {
  const el = bag.chatScrollRef.value
  if (!el) return
  bag.lastProgrammaticScrollTs = Date.now()
  el.scrollTop = el.scrollHeight
  bag.lastObservedScrollTop = el.scrollTop
}

const stopDampedFollow = (bag: ScrollBag) => {
  if (bag.followFrame !== null) window.cancelAnimationFrame(bag.followFrame)
  bag.followFrame = null
  bag.followVelocity = 0
  bag.followLastFrameTs = 0
}

const runDampedFollowFrame = (bag: ScrollBag, ts: number) => {
  bag.followFrame = null
  const el = bag.chatScrollRef.value
  if (!el || !bag.stickToBottom.value) {
    stopDampedFollow(bag)
    return
  }
  const target = Math.max(0, el.scrollHeight - el.clientHeight)
  const distance = target - el.scrollTop
  const dt = bag.followLastFrameTs > 0 ? Math.min(0.034, (ts - bag.followLastFrameTs) / 1000) : 1 / 60
  bag.followLastFrameTs = ts
  const acceleration = distance * FOLLOW_SPRING - bag.followVelocity * FOLLOW_DAMPING
  bag.followVelocity = Math.max(-FOLLOW_MAX_SPEED, Math.min(FOLLOW_MAX_SPEED, bag.followVelocity + acceleration * dt))
  if (Math.abs(distance) <= FOLLOW_SNAP_DISTANCE && Math.abs(bag.followVelocity) < 12) {
    followBottomNow(bag)
    stopDampedFollow(bag)
    return
  }
  const nextTop = el.scrollTop + bag.followVelocity * dt
  bag.lastProgrammaticScrollTs = Date.now()
  el.scrollTop = distance > 0 ? Math.min(target, nextTop) : Math.max(target, nextTop)
  bag.lastObservedScrollTop = el.scrollTop
  bag.followFrame = window.requestAnimationFrame(nextTs => runDampedFollowFrame(bag, nextTs))
}

const followBottomDamped = (bag: ScrollBag) => {
  if (!bag.stickToBottom.value || bag.followFrame !== null) return
  bag.followFrame = window.requestAnimationFrame(ts => runDampedFollowFrame(bag, ts))
}

const syncVisualViewport = (bag: ScrollBag) => {
  if (bag.visualViewportFrame !== null) return
  bag.visualViewportFrame = window.requestAnimationFrame(() => {
    bag.visualViewportFrame = null
    const root = bag.chatRootRef.value
    const viewport = window.visualViewport
    if (!root || !viewport) return
    const isMobileWidth = window.matchMedia('(max-width: 767px)').matches
    const keyboardInset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
    const inset = isMobileWidth && keyboardInset > 80 ? keyboardInset : 0
    root.style.setProperty('--chat-keyboard-inset', `${Math.round(inset)}px`)
    if (inset > 0 && bag.stickToBottom.value) void scrollToBottom(bag, false)
  })
}

const scrollToBottom = async (bag: ScrollBag, smooth = false) => {
  await nextTick()
  const el = bag.chatScrollRef.value
  if (!el) return
  if (smooth) {
    followBottomDamped(bag)
    return
  }
  stopDampedFollow(bag)
  followBottomNow(bag)
}

const pinToBottomSettled = (bag: ScrollBag) => {
  if (bag.pinSettleTimer !== null) {
    window.clearTimeout(bag.pinSettleTimer)
    bag.pinSettleTimer = null
  }
  const start = Date.now()
  let prevHeight = -1
  let stableTicks = 0
  const step = () => {
    bag.pinSettleTimer = null
    const el = bag.chatScrollRef.value
    if (!el || !bag.stickToBottom.value) return
    const height = el.scrollHeight
    followBottomDamped(bag)
    if (height === prevHeight) stableTicks += 1
    else {
      stableTicks = 0
      prevHeight = height
    }
    if (stableTicks >= 4 || Date.now() - start > PIN_SETTLE_MAX_MS) return
    bag.pinSettleTimer = window.setTimeout(step, PIN_SETTLE_INTERVAL_MS)
  }
  bag.pinSettleTimer = window.setTimeout(step, 0)
}

const updateStickFromScroll = (bag: ScrollBag) => {
  const el = bag.chatScrollRef.value
  if (!el) return
  const now = Date.now()
  const currentTop = el.scrollTop
  const movedTowardHistory = currentTop < bag.lastObservedScrollTop - 1
  bag.lastObservedScrollTop = currentTop
  if (movedTowardHistory && now <= bag.userScrollIntentUntil) {
    bag.stickToBottom.value = false
    stopDampedFollow(bag)
    return
  }
  if (isNearBottom(el)) {
    bag.stickToBottom.value = true
    return
  }
  if (now - bag.lastProgrammaticScrollTs < PROGRAMMATIC_SCROLL_GRACE_MS) return
  if (bag.stickToBottom.value) followBottomDamped(bag)
}

const handleScroll = (bag: ScrollBag) => {
  updateStickFromScroll(bag)
  const el = bag.chatScrollRef.value
  if (!el || bag.stickToBottom.value) return
  if (Date.now() - bag.lastProgrammaticScrollTs < PROGRAMMATIC_SCROLL_GRACE_MS) return
  if (el.scrollTop <= LOAD_OLDER_THRESHOLD_PX) bag.onLoadOlder()
}

const markUserScrollIntent = (bag: ScrollBag) => {
  bag.userScrollIntentUntil = Date.now() + USER_SCROLL_INTENT_MS
  bag.stickToBottom.value = false
  stopDampedFollow(bag)
}

const resumeFollowingLatest = async (bag: ScrollBag) => {
  bag.stickToBottom.value = true
  bag.userScrollIntentUntil = 0
  await scrollToBottom(bag, true)
  pinToBottomSettled(bag)
}

const handleWheel = (bag: ScrollBag, event: WheelEvent) => {
  if (event.deltaY < 0) markUserScrollIntent(bag)
}

const handlePointerDown = (bag: ScrollBag, event: PointerEvent) => {
  if (!event.isPrimary) return
  const el = bag.chatScrollRef.value
  if (!el) return
  const nearScrollbar = event.clientX >= el.getBoundingClientRect().right - 24
  if (event.pointerType === 'mouse') {
    if (nearScrollbar) markUserScrollIntent(bag)
    return
  }
  bag.touchScrollPointerId = event.pointerId
  bag.touchScrollStartY = event.clientY
}

const handlePointerMove = (bag: ScrollBag, event: PointerEvent) => {
  if (event.pointerId !== bag.touchScrollPointerId) return
  if (event.clientY - bag.touchScrollStartY > 8) markUserScrollIntent(bag)
}

const handlePointerEnd = (bag: ScrollBag, event: PointerEvent) => {
  if (event.pointerId === bag.touchScrollPointerId) bag.touchScrollPointerId = null
}

const handleScrollKey = (bag: ScrollBag, event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null
  if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
  if (event.key === 'End') {
    void resumeFollowingLatest(bag)
    return
  }
  if (!['ArrowUp', 'PageUp', 'Home'].includes(event.key)) return
  markUserScrollIntent(bag)
}

const unbindScrollElement = (bag: ScrollBag, el: HTMLElement) => {
  el.removeEventListener('scroll', bagScroll(bag).onScroll)
  el.removeEventListener('wheel', bagScroll(bag).onWheel)
  el.removeEventListener('pointerdown', bagScroll(bag).onPointerDown)
  el.removeEventListener('pointermove', bagScroll(bag).onPointerMove)
  el.removeEventListener('pointerup', bagScroll(bag).onPointerEnd)
  el.removeEventListener('pointercancel', bagScroll(bag).onPointerEnd)
}

const listenersByBag = new WeakMap<ScrollBag, {
  onScroll: () => void
  onWheel: (event: WheelEvent) => void
  onPointerDown: (event: PointerEvent) => void
  onPointerMove: (event: PointerEvent) => void
  onPointerEnd: (event: PointerEvent) => void
  onKey: (event: KeyboardEvent) => void
  onViewport: () => void
}>()

const bagScroll = (bag: ScrollBag) => listenersByBag.get(bag)!

const bindListeners = (bag: ScrollBag) => {
  listenersByBag.set(bag, {
    onScroll: () => handleScroll(bag),
    onWheel: event => handleWheel(bag, event),
    onPointerDown: event => handlePointerDown(bag, event),
    onPointerMove: event => handlePointerMove(bag, event),
    onPointerEnd: event => handlePointerEnd(bag, event),
    onKey: event => handleScrollKey(bag, event),
    onViewport: () => syncVisualViewport(bag),
  })
}

const bindScrollElement = (bag: ScrollBag, el: HTMLElement) => {
  const listeners = bagScroll(bag)
  bag.lastObservedScrollTop = el.scrollTop
  el.addEventListener('scroll', listeners.onScroll, { passive: true })
  el.addEventListener('wheel', listeners.onWheel, { passive: true })
  el.addEventListener('pointerdown', listeners.onPointerDown, { passive: true })
  el.addEventListener('pointermove', listeners.onPointerMove, { passive: true })
  el.addEventListener('pointerup', listeners.onPointerEnd, { passive: true })
  el.addEventListener('pointercancel', listeners.onPointerEnd, { passive: true })
  if (typeof ResizeObserver === 'undefined') return
  bag.chatResizeObserver = new ResizeObserver(() => {
    if (!bag.chatScrollRef.value || !bag.stickToBottom.value) return
    followBottomDamped(bag)
  })
  bag.chatResizeObserver.observe(el)
  if (el.firstElementChild) bag.chatResizeObserver.observe(el.firstElementChild)
}

const detachScrollElement = (bag: ScrollBag, el: HTMLElement | null) => {
  if (el) unbindScrollElement(bag, el)
  if (bag.chatResizeObserver) {
    bag.chatResizeObserver.disconnect()
    bag.chatResizeObserver = null
  }
}

const preserveAnchorAfterPrepend = (bag: ScrollBag, prevHeight: number, prevTop: number) => {
  const el = bag.chatScrollRef.value
  if (!el) return
  bag.lastProgrammaticScrollTs = Date.now()
  el.scrollTop = el.scrollHeight - prevHeight + prevTop
}

const cleanupViewport = (bag: ScrollBag) => {
  stopDampedFollow(bag)
  if (bag.visualViewportFrame !== null) {
    window.cancelAnimationFrame(bag.visualViewportFrame)
    bag.visualViewportFrame = null
  }
  if (bag.pinSettleTimer !== null) {
    window.clearTimeout(bag.pinSettleTimer)
    bag.pinSettleTimer = null
  }
}

export const useChatScroll = () => {
  const bag: ScrollBag = {
    chatScrollRef: ref<HTMLElement | null>(null),
    chatRootRef: ref<HTMLElement | null>(null),
    stickToBottom: ref(true),
    visualViewportFrame: null,
    followFrame: null,
    followVelocity: 0,
    followLastFrameTs: 0,
    chatResizeObserver: null,
    pinSettleTimer: null,
    lastProgrammaticScrollTs: 0,
    lastObservedScrollTop: 0,
    userScrollIntentUntil: 0,
    touchScrollPointerId: null,
    touchScrollStartY: 0,
    onLoadOlder: () => {},
  }
  bindListeners(bag)
  watch(bag.chatScrollRef, (newEl, oldEl) => {
    detachScrollElement(bag, oldEl)
    if (newEl) bindScrollElement(bag, newEl)
  })
  onMounted(() => {
    window.addEventListener('keydown', bagScroll(bag).onKey)
    window.visualViewport?.addEventListener('resize', bagScroll(bag).onViewport)
    window.visualViewport?.addEventListener('scroll', bagScroll(bag).onViewport)
    syncVisualViewport(bag)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', bagScroll(bag).onKey)
    window.visualViewport?.removeEventListener('resize', bagScroll(bag).onViewport)
    window.visualViewport?.removeEventListener('scroll', bagScroll(bag).onViewport)
    cleanupViewport(bag)
    detachScrollElement(bag, bag.chatScrollRef.value)
  })
  return {
    chatScrollRef: bag.chatScrollRef,
    chatRootRef: bag.chatRootRef,
    stickToBottom: bag.stickToBottom,
    scrollToBottom: (smooth = false) => scrollToBottom(bag, smooth),
    pinToBottomSettled: () => pinToBottomSettled(bag),
    resumeFollowingLatest: () => resumeFollowingLatest(bag),
    followBottomNow: () => followBottomNow(bag),
    followBottomDamped: () => followBottomDamped(bag),
    setLoadOlder: (fn: () => void) => { bag.onLoadOlder = fn },
    preserveAnchorAfterPrepend: (prevHeight: number, prevTop: number) =>
      preserveAnchorAfterPrepend(bag, prevHeight, prevTop),
  }
}

export type ChatScrollApi = ReturnType<typeof useChatScroll>
