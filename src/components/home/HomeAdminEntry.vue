<script setup lang="ts">
defineEmits<{ (e: 'open'): void }>()
</script>

<template>
  <button
    class="inline-flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-1.5 text-sm font-medium text-amber-300/90 hover:text-amber-200 hover:bg-amber-400/10 transition-colors"
    title="登录管理员控制台，检查并重启服务"
    @click="$emit('open')"
  >
    <svg viewBox="0 0 24 24" class="h-4 w-4" aria-hidden="true">
      <path d="M12 3 5.5 5.6v5.2c0 4.2 2.7 8 6.5 9.2 3.8-1.2 6.5-5 6.5-9.2V5.6L12 3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
      <path d="M9.3 11.8 11.1 14l3.8-4.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <span class="hidden sm:inline">管理员入口</span>
  </button>
</template>
