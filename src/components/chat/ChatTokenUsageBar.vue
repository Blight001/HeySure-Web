<script setup lang="ts">
import { computed } from 'vue'
import { formatTokenCount } from '@/utils/formatTokenCount'

const props = defineProps<{
  used?: number
  limit?: number
}>()

const usedTokens = computed(() => Math.max(0, Number(props.used) || 0))
const tokenLimit = computed(() => Math.max(0, Number(props.limit) || 0))
const unlimited = computed(() => tokenLimit.value <= 0)
const usagePercent = computed(() => unlimited.value
  ? 0
  : Math.min(100, (usedTokens.value / tokenLimit.value) * 100))
const progressTone = computed(() => {
  if (usagePercent.value >= 100) return 'bg-gradient-to-r from-rose-500 to-red-500'
  if (usagePercent.value >= 80) return 'bg-gradient-to-r from-amber-400 to-orange-500'
  return 'bg-gradient-to-r from-indigo-500 to-cyan-400'
})
const usageLabel = computed(() => unlimited.value
  ? `Token ${formatTokenCount(usedTokens.value)} / 无上限`
  : `Token ${formatTokenCount(usedTokens.value)} / ${formatTokenCount(tokenLimit.value)}`)
</script>

<template>
  <div
    class="relative h-[14px] shrink-0 overflow-hidden bg-zinc-200/65 dark:bg-zinc-800/80"
    role="progressbar"
    :aria-label="usageLabel"
    :aria-valuenow="unlimited ? undefined : Math.round(usagePercent)"
    :aria-valuemax="unlimited ? undefined : 100"
    :title="usageLabel"
  >
    <div
      v-if="!unlimited"
      class="absolute inset-y-0 left-0 transition-[width] duration-500 ease-out"
      :class="progressTone"
      :style="{ width: `${usagePercent}%` }"
    />
    <div class="absolute inset-0 flex items-center justify-end px-1.5 text-[9px] font-medium tabular-nums leading-none text-zinc-700 dark:text-zinc-200">
      <span class="rounded-sm bg-white/75 px-1 py-px dark:bg-zinc-950/70">{{ usageLabel }}</span>
    </div>
  </div>
</template>
