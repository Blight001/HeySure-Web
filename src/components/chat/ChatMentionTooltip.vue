<script setup lang="ts">
import type { ChatMentionTooltipState } from '@/composables/useChatMentionTooltip'

defineProps<{ state: ChatMentionTooltipState }>()
defineEmits<{
  keep: []
  hide: []
}>()
</script>

<template>
  <Teleport to="body">
    <Transition name="mention-tooltip">
      <div
        v-if="state.open"
        class="pointer-events-auto fixed z-[10000] flex -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-zinc-200/90 bg-white/95 shadow-2xl shadow-zinc-950/15 backdrop-blur-xl dark:border-zinc-700/90 dark:bg-zinc-900/95 dark:shadow-black/40"
        :class="state.placement === 'above' ? '-translate-y-full' : ''"
        :style="{ left: `${state.x}px`, top: `${state.y}px`, width: `${state.width}px`, maxHeight: `${state.maxHeight}px` }"
        role="tooltip"
        @pointerenter="$emit('keep')"
        @pointerleave="$emit('hide')"
        @wheel.stop
      >
        <div class="flex h-9 shrink-0 items-center gap-2 border-b border-zinc-100 px-3 dark:border-zinc-800">
          <span
            class="rounded-md px-1.5 py-0.5 text-[9px] font-bold tracking-wide"
            :class="state.type === 'mcp'
              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300'
              : state.type === 'skill' ? 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300' : 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300'"
          >{{ state.type === 'mcp' ? 'MCP' : state.type === 'skill' ? 'Skill' : '文件' }}</span>
          <strong class="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-700 dark:text-zinc-200">{{ state.label }}</strong>
        </div>
        <div class="mention-tooltip-body min-h-0 flex-auto overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 text-[10px] leading-4 text-zinc-500 dark:text-zinc-400">{{ state.detail }}</div>
        <div
          v-if="state.detail.length > 320"
          class="flex h-6 shrink-0 items-center justify-center border-t border-zinc-100 px-3 text-center text-[9px] text-zinc-400 dark:border-zinc-800 dark:text-zinc-500"
        >滚轮查看完整详情</div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.mention-tooltip-enter-active,
.mention-tooltip-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}

.mention-tooltip-enter-from,
.mention-tooltip-leave-to {
  opacity: 0;
  transform: translate(-50%, calc(-100% + 4px)) scale(0.985);
}

.mention-tooltip-body {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.mention-tooltip-body::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}
</style>
