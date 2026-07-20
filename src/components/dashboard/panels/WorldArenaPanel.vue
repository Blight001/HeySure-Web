<script setup lang="ts">
/**
 * 社会显示：直接内嵌游戏世界（/game/ 同源 iframe），实时显示数字社会。
 * 原"项目安排 + 运行中 AI 卡片"功能已按需求移除（2026-06-11）。
 * postMessage 桥：把人物、图书馆与设备建筑点击转成控制台栏目定位。
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'

const props = defineProps<{
  chatAiConfigId?: number | null
}>()

const emit = defineEmits<{
  (e: 'focus-agent', aiConfigId: number): void
  (e: 'open-knowledge'): void
  (e: 'focus-device', deviceId: string): void
}>()

const GAME_URL = '/game/'
const gameFrame = ref<HTMLIFrameElement | null>(null)
const rootEl = ref<HTMLElement | null>(null)

const getBoundingRect = () => rootEl.value?.getBoundingClientRect() ?? null
defineExpose({ getBoundingRect })

const syncChatState = () => {
  gameFrame.value?.contentWindow?.postMessage(
    { type: 'world:chat-state', aiConfigId: props.chatAiConfigId ?? null },
    window.location.origin,
  )
}

watch(() => props.chatAiConfigId, syncChatState)

// 移动端底部 Tab 用 v-show 收起本面板时，iframe 内部的 visibilitychange 不会
// 触发（display:none 不改变文档可见性），Phaser 会在后台整帧空跑烧 CPU。
// 用 IntersectionObserver 观察自身可见性，postMessage 通知游戏暂停/恢复渲染循环。
let panelVisible = true
let visibilityObserver: IntersectionObserver | null = null

const postVisibility = () => {
  gameFrame.value?.contentWindow?.postMessage(
    { type: 'world:set-visible', visible: panelVisible },
    window.location.origin,
  )
}

const onFrameLoad = () => {
  syncChatState()
  postVisibility()
}

const onMessage = (event: MessageEvent) => {
  if (event.origin !== window.location.origin) return
  const data = event.data as { type?: string; aiConfigId?: number } | null
  if (data?.type === 'world:focus-agent' && Number.isFinite(Number(data.aiConfigId))) {
    emit('focus-agent', Number(data.aiConfigId))
  } else if (data?.type === 'world:open-knowledge') {
    emit('open-knowledge')
  } else if (data?.type === 'world:focus-device' && typeof (data as { deviceId?: unknown }).deviceId === 'string') {
    emit('focus-device', (data as { deviceId: string }).deviceId)
  }
}

onMounted(() => {
  window.addEventListener('message', onMessage)
  if (typeof IntersectionObserver !== 'undefined' && rootEl.value) {
    visibilityObserver = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (!entry) return
      panelVisible = entry.isIntersecting
      postVisibility()
    })
    visibilityObserver.observe(rootEl.value)
  }
})
onUnmounted(() => {
  window.removeEventListener('message', onMessage)
  visibilityObserver?.disconnect()
  visibilityObserver = null
})
</script>

<template>
  <section ref="rootEl" class="flex-1 rounded-2xl border-2 border-zinc-200 flex flex-col overflow-hidden relative dark:border-zinc-700 transition-colors duration-500 bg-[#23262e]">
    <div class="absolute top-0 left-0 bg-zinc-100/60 text-zinc-500 text-xs px-3 py-1 rounded-br-lg font-medium z-10 border-b border-r border-zinc-200 dark:bg-zinc-900/60 dark:text-zinc-400 dark:border-zinc-700 shadow-sm">
      <span class="flex items-center gap-1.5"><AppIcon name="globe" class="w-3.5 h-3.5" /> 社会显示</span>
    </div>
    <iframe
      ref="gameFrame"
      :src="GAME_URL"
      class="flex-1 w-full border-0"
      title="社会显示"
      @load="onFrameLoad"
    />
  </section>
</template>
