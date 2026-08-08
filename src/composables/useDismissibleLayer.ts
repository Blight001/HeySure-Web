import {
  onMounted,
  onUnmounted,
  toValue,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'

interface DismissibleLayerOptions {
  open: MaybeRefOrGetter<boolean>
  roots: Ref<HTMLElement | null>[]
  onDismiss: () => void
}

/** Close a temporary UI layer when focus moves outside it or the window blurs. */
export const useDismissibleLayer = ({ open, roots, onDismiss }: DismissibleLayerOptions) => {
  const isInside = (target: EventTarget | null) => {
    if (!(target instanceof Node)) return false
    return roots.some(root => root.value?.contains(target))
  }

  const dismissOutside = (event: Event) => {
    if (!toValue(open) || isInside(event.target)) return
    onDismiss()
  }

  const dismissOnEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && toValue(open)) onDismiss()
  }

  const dismissOnWindowBlur = () => {
    if (toValue(open)) onDismiss()
  }

  onMounted(() => {
    document.addEventListener('pointerdown', dismissOutside, true)
    document.addEventListener('focusin', dismissOutside, true)
    document.addEventListener('keydown', dismissOnEscape)
    window.addEventListener('blur', dismissOnWindowBlur)
  })

  onUnmounted(() => {
    document.removeEventListener('pointerdown', dismissOutside, true)
    document.removeEventListener('focusin', dismissOutside, true)
    document.removeEventListener('keydown', dismissOnEscape)
    window.removeEventListener('blur', dismissOnWindowBlur)
  })
}
