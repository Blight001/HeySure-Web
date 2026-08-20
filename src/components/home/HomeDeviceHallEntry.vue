<script setup lang="ts">
withDefaults(defineProps<{ prominent?: boolean }>(), { prominent: false })
defineEmits<{ (event: 'open'): void }>()
</script>

<template>
  <button
    v-if="prominent"
    class="w-full rounded-xl border border-cyan-500/30 bg-cyan-950/30 px-7 py-3 text-base font-medium text-cyan-200 transition-all duration-300 hover:-translate-y-0.5 hover:bg-cyan-900/40 sm:w-auto"
    @click="$emit('open')"
  >
    下载设备端
  </button>
  <button
    v-else
    class="hidden rounded-lg px-3 py-1.5 text-sm font-medium text-cyan-300 transition-colors hover:bg-cyan-400/10 hover:text-cyan-200 sm:inline-flex"
    @click="$emit('open')"
  >
    设备大厅
  </button>
</template>
