import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComputedRef, type CSSProperties, type Ref } from 'vue'
import { PINNED_POPUP_Z_INDEX } from '@/composables/usePopupZIndex'
import { useDismissibleLayer } from '@/composables/useDismissibleLayer'
import type { ChatInterfaceProps } from '@/types/chat'
import { copyTextToClipboard } from '@/utils/clipboard'
import type { ChatWorkspaceState } from './useChatWorkspaceState'

interface PopupBag {
  frontPromptCopied: Ref<boolean>
  frontPromptButtonRef: Ref<HTMLElement | null>
  frontPromptPopupRef: Ref<HTMLElement | null>
  frontPromptPopupOpen: Ref<boolean>
  frontPromptPopupStyle: Ref<CSSProperties>
  frontPromptPopupTarget: Ref<HTMLElement | string>
  compactFrontPromptViewport: Ref<boolean>
  frontPromptUsesPortal: ComputedRef<boolean>
  closeTimer: number | null
  previewText: () => string
  floatingLayer: () => boolean
}

const clearFrontPromptPopupClose = (bag: PopupBag) => {
  if (bag.closeTimer === null) return
  window.clearTimeout(bag.closeTimer)
  bag.closeTimer = null
}

const updateFrontPromptPopupPosition = (bag: PopupBag) => {
  const button = bag.frontPromptButtonRef.value
  if (!button || !bag.frontPromptUsesPortal.value) return
  const view = button.ownerDocument.defaultView || window
  const visualViewport = view.visualViewport
  const rect = button.getBoundingClientRect()
  const viewportLeft = visualViewport?.offsetLeft || 0
  const viewportTop = visualViewport?.offsetTop || 0
  const viewportWidth = visualViewport?.width || view.innerWidth
  const viewportHeight = visualViewport?.height || view.innerHeight
  const viewportRight = viewportLeft + viewportWidth
  const viewportBottom = viewportTop + viewportHeight
  const margin = bag.compactFrontPromptViewport.value ? 12 : 16
  const gap = 8
  const width = Math.min(672, viewportWidth - margin * 2)
  const belowSpace = viewportBottom - rect.bottom - gap - margin
  const aboveSpace = rect.top - viewportTop - gap - margin
  const placeAbove = belowSpace < 220 && aboveSpace > belowSpace
  const availableHeight = Math.max(120, placeAbove ? aboveSpace : belowSpace)
  applyPopupStyle({
    bag, view, rect, viewportLeft, viewportRight, margin, gap, width, availableHeight, placeAbove,
  })
}

const applyPopupStyle = (opts: {
  bag: PopupBag
  view: Window
  rect: DOMRect
  viewportLeft: number
  viewportRight: number
  margin: number
  gap: number
  width: number
  availableHeight: number
  placeAbove: boolean
}) => {
  const { bag, view, rect, viewportLeft, viewportRight, margin, gap, width, availableHeight, placeAbove } = opts
  const style: CSSProperties = {
    left: `${Math.min(Math.max(rect.right - width, viewportLeft + margin), viewportRight - width - margin)}px`,
    width: `${width}px`,
    maxHeight: `${availableHeight}px`,
    zIndex: PINNED_POPUP_Z_INDEX + 1,
  }
  if (placeAbove) style.bottom = `${view.innerHeight - rect.top + gap}px`
  else style.top = `${rect.bottom + gap}px`
  bag.frontPromptPopupStyle.value = style
}

const openFrontPromptPopup = async (bag: PopupBag) => {
  if (!bag.frontPromptUsesPortal.value) return
  clearFrontPromptPopupClose(bag)
  bag.frontPromptPopupTarget.value = bag.frontPromptButtonRef.value?.ownerDocument.body || 'body'
  updateFrontPromptPopupPosition(bag)
  bag.frontPromptPopupOpen.value = true
  await nextTick()
  updateFrontPromptPopupPosition(bag)
}

const scheduleFrontPromptPopupClose = (bag: PopupBag) => {
  if (!bag.floatingLayer()) return
  clearFrontPromptPopupClose(bag)
  bag.closeTimer = window.setTimeout(() => {
    bag.frontPromptPopupOpen.value = false
    bag.closeTimer = null
  }, 120)
}

const toggleFrontPromptPopup = (bag: PopupBag) => {
  if (!bag.frontPromptUsesPortal.value) return
  if (bag.frontPromptPopupOpen.value) {
    clearFrontPromptPopupClose(bag)
    bag.frontPromptPopupOpen.value = false
    return
  }
  void openFrontPromptPopup(bag)
}

const copyFrontPrompt = async (bag: PopupBag, event?: Event) => {
  const text = bag.previewText()
  if (!text) return
  const contextEl = (event?.currentTarget || event?.target) as Element | null
  if (!(await copyTextToClipboard(text, contextEl))) {
    console.warn('copy front prompt failed')
    return
  }
  bag.frontPromptCopied.value = true
  window.setTimeout(() => { bag.frontPromptCopied.value = false }, 1200)
}

const syncFrontPromptViewportMode = (bag: PopupBag) => {
  bag.compactFrontPromptViewport.value = window.matchMedia('(max-width: 767px)').matches
  if (bag.frontPromptPopupOpen.value) updateFrontPromptPopupPosition(bag)
}

const latestRecordedSystemPrompt = (state: ChatWorkspaceState) => {
  for (let i = state.chatMessages.value.length - 1; i >= 0; i -= 1) {
    const prompt = String(state.chatMessages.value[i]?.system_prompt || '').trim()
    if (prompt) return prompt
  }
  return ''
}

export const useFrontPromptPopup = (props: ChatInterfaceProps, state: ChatWorkspaceState) => {
  const compactFrontPromptViewport = ref(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  )
  const frontPromptUsesPortal = computed(() => !!(props.floatingLayer || compactFrontPromptViewport.value))
  const frontPromptBaseText = computed(() =>
    state.effectiveSystemPromptPreview.value
    || latestRecordedSystemPrompt(state)
    || state.configuredFrontPrompt.value
    || '运行时 Prompt 预览加载中或暂不可用')
  const frontPromptPreviewText = computed(() => {
    const error = state.frontPromptPreviewError.value
    if (error) return `${frontPromptBaseText.value}\n\n（Prompt 预览加载失败：${error}）`
    return frontPromptBaseText.value
  })
  const bag = createPopupBag(props, compactFrontPromptViewport, frontPromptUsesPortal, frontPromptPreviewText)
  wireFrontPromptPopup(bag, frontPromptUsesPortal)
  return exposeFrontPromptPopup(bag, frontPromptUsesPortal, frontPromptBaseText)
}

const createPopupBag = (
  props: ChatInterfaceProps,
  compactFrontPromptViewport: Ref<boolean>,
  frontPromptUsesPortal: ComputedRef<boolean>,
  frontPromptPreviewText: ComputedRef<string>,
): PopupBag => ({
  frontPromptCopied: ref(false),
  frontPromptButtonRef: ref<HTMLElement | null>(null),
  frontPromptPopupRef: ref<HTMLElement | null>(null),
  frontPromptPopupOpen: ref(false),
  frontPromptPopupStyle: ref<CSSProperties>({}),
  frontPromptPopupTarget: ref<HTMLElement | string>('body'),
  compactFrontPromptViewport,
  frontPromptUsesPortal,
  closeTimer: null,
  previewText: () => frontPromptPreviewText.value,
  floatingLayer: () => !!props.floatingLayer,
})

const wireFrontPromptPopup = (bag: PopupBag, frontPromptUsesPortal: ComputedRef<boolean>) => {
  useDismissibleLayer({
    open: bag.frontPromptPopupOpen,
    roots: [bag.frontPromptButtonRef, bag.frontPromptPopupRef],
    onDismiss: () => {
      clearFrontPromptPopupClose(bag)
      bag.frontPromptPopupOpen.value = false
    },
  })
  watch(frontPromptUsesPortal, enabled => {
    if (!enabled) {
      clearFrontPromptPopupClose(bag)
      bag.frontPromptPopupOpen.value = false
    }
  })
  const onResize = () => syncFrontPromptViewportMode(bag)
  const onViewport = () => updateFrontPromptPopupPosition(bag)
  onMounted(() => {
    window.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('resize', onViewport)
  })
  onBeforeUnmount(() => {
    clearFrontPromptPopupClose(bag)
    window.removeEventListener('resize', onResize)
    window.visualViewport?.removeEventListener('resize', onViewport)
  })
}

const exposeFrontPromptPopup = (
  bag: PopupBag,
  frontPromptUsesPortal: ComputedRef<boolean>,
  frontPromptBaseText: ComputedRef<string>,
) => ({
  frontPromptCopied: bag.frontPromptCopied,
  frontPromptButtonRef: bag.frontPromptButtonRef,
  frontPromptPopupRef: bag.frontPromptPopupRef,
  frontPromptPopupOpen: bag.frontPromptPopupOpen,
  frontPromptPopupStyle: bag.frontPromptPopupStyle,
  frontPromptPopupTarget: bag.frontPromptPopupTarget,
  frontPromptUsesPortal,
  frontPromptBaseText,
  copyFrontPrompt: (event?: Event) => copyFrontPrompt(bag, event),
  openFrontPromptPopup: () => openFrontPromptPopup(bag),
  scheduleFrontPromptPopupClose: () => scheduleFrontPromptPopupClose(bag),
  toggleFrontPromptPopup: () => toggleFrontPromptPopup(bag),
  clearFrontPromptPopupClose: () => clearFrontPromptPopupClose(bag),
})

export type FrontPromptPopupApi = ReturnType<typeof useFrontPromptPopup>
