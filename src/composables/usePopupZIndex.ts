import { ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'

/**
 * 全局弹窗层级管理器 —— "后开者居上"。
 *
 * 历史问题：每个全屏弹窗（modal / overlay）各自硬编码 z-index（z-[600]/z-[620]/
 * z-[640]…），嵌套弹窗能否正确叠放完全依赖人工挑数字，极易冲突。
 *
 * 现在所有弹窗不再关心具体层级，统一向这里领取一个**自增**的 z-index：
 * 谁最后打开，谁就拿到更大的值，从而始终显示在已打开弹窗之上。
 *
 * 基准值之上保证高于普通页面内容（导航/侧栏等均在 z-50 以内）。
 */
const POPUP_Z_BASE = 1000
let counter = POPUP_Z_BASE

/** 领取下一个（更高的）弹窗层级值。 */
export function nextPopupZIndex(): number {
  counter += 1
  return counter
}

/**
 * 为一个弹窗维护"自动置顶"的 z-index。
 *
 * 每当 `visible` 从隐藏变为可见，弹窗领取一个新的、更高的层级值，
 * 因此最后打开的弹窗（含同组件内的嵌套弹窗）总在最上层。
 *
 * @param visible 弹窗可见状态（ref 或 getter，如 `() => props.show`）。
 * @returns zIndex —— 绑定到弹窗根节点：`:style="{ zIndex }"`（并移除原有 `z-[...]` 类）。
 */
export function usePopupZIndex(visible: MaybeRefOrGetter<boolean>): Ref<number> {
  const zIndex = ref(0)
  watch(
    () => toValue(visible),
    (v) => {
      if (v) zIndex.value = nextPopupZIndex()
    },
    { immediate: true },
  )
  return zIndex
}
