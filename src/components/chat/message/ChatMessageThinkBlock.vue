<script setup lang="ts">
import ChatCollapsible from '../ChatCollapsible.vue'

defineProps<{
  text: string
  embedded?: boolean
  thinkOnly?: boolean
  expandByDefault?: boolean
  tokenLabel: string
  tokenTitle: string
  timeLabel: string
}>()
</script>

<template>
  <div :class="embedded && thinkOnly ? 'mb-0' : 'mb-1'">
    <ChatCollapsible
      :key="expandByDefault ? 'active-think' : 'settled-think'"
      details-class="group/think"
      summary-class="flex w-full items-center gap-1 py-0.5 text-[11px] leading-4 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 cursor-pointer select-none transition-colors"
      body-class="mt-1 ml-1 pl-2.5 border-l border-zinc-200 dark:border-zinc-700/80 text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed italic whitespace-pre-wrap"
      :default-open="expandByDefault"
    >
      <template #summary="{ open }">
        <span
          class="chat-collapsible-arrow text-[10px] leading-none"
          :style="{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }"
        >➣</span>
        <span class="font-medium tracking-wide">深度思考</span>
        <span class="segment-metrics ml-auto">
          <span class="segment-token-badge" :title="tokenTitle">{{ tokenLabel }}</span>
          <span v-if="timeLabel" class="segment-time-badge">{{ timeLabel }}</span>
        </span>
      </template>
      {{ text }}
    </ChatCollapsible>
  </div>
</template>

<style scoped>
.segment-metrics {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.3rem;
}

.segment-token-badge,
.segment-time-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  color: rgb(100 116 139);
  font-size: 10px;
  line-height: 1.3;
  font-weight: 400;
  letter-spacing: 0.01em;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.segment-token-badge {
  color: rgb(99 102 241);
}

.dark .segment-token-badge,
.dark .segment-time-badge {
  color: rgb(148 163 184);
}

.dark .segment-token-badge {
  color: rgb(165 180 252);
}
</style>
