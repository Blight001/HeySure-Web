<script setup lang="ts">
defineProps<{
  show: boolean
  deviceName: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm'): void
}>()
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="show"
        class="fixed inset-0 modal-overlay flex items-center justify-center p-4 z-[120]"
        @click="emit('close')"
      >
        <div class="acrylic-modal rounded-xl border border-zinc-200 dark:border-zinc-700 w-full max-w-[380px] p-4" @click.stop>
          <div class="flex items-center justify-between mb-3">
            <div class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">删除设备记录</div>
            <button class="text-zinc-400 hover:text-zinc-600" @click="emit('close')">✕</button>
          </div>
          <div class="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            确认删除设备「{{ deviceName }}」的记录？包括已保存的 AI 分配与 MCP 权限范围，删除后需要设备重新连接才会再次出现在列表中。
          </div>
          <div class="mt-3 flex justify-end gap-2">
            <button
              type="button"
              class="text-xs px-3 py-1 rounded border border-zinc-200 hover:bg-zinc-100 dark:border-zinc-700"
              @click="emit('close')"
            >
              取消
            </button>
            <button
              type="button"
              class="text-xs px-3 py-1 rounded border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
              @click="emit('confirm')"
            >
              删除
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
