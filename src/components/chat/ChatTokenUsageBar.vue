<script setup lang="ts">
import { computed, ref } from 'vue'
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
const detailsOpen = ref(false)
</script>

<template>
  <div
    class="group relative h-[7px] shrink-0 cursor-pointer"
    tabindex="0"
    :aria-label="usageLabel"
    @click="detailsOpen = !detailsOpen"
    @blur="detailsOpen = false"
    @keydown.enter.prevent="detailsOpen = !detailsOpen"
    @keydown.space.prevent="detailsOpen = !detailsOpen"
  >
    <div
      class="absolute inset-0 overflow-hidden bg-zinc-200/65 dark:bg-zinc-800/80"
      role="progressbar"
      :aria-valuenow="unlimited ? undefined : Math.round(usagePercent)"
      :aria-valuemax="unlimited ? undefined : 100"
    >
      <div
        v-if="!unlimited"
        class="absolute inset-y-0 left-0 transition-[width] duration-500 ease-out"
        :class="progressTone"
        :style="{ width: `${usagePercent}%` }"
      />
    </div>
    <div
      class="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-medium tabular-nums text-white opacity-0 shadow-lg transition-opacity dark:bg-zinc-100 dark:text-zinc-900"
      :class="detailsOpen ? 'opacity-100' : 'group-hover:opacity-100 group-focus-visible:opacity-100'"
      role="tooltip"
    >
      {{ usageLabel }}
    </div>
  </div>
</template>
