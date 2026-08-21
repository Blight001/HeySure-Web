<script setup lang="ts">
defineProps<{
  show: boolean
  deviceName: string
  members: { aiConfigId: number; name: string }[]
  draftIds: number[]
  busy: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'toggle', aiConfigId: number): void
  (e: 'clear'): void
  (e: 'save'): void
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
        <div class="acrylic-modal rounded-xl border border-zinc-200 dark:border-zinc-700 w-full max-w-[420px] p-4" @click.stop>
          <div class="flex items-center justify-between mb-3">
            <div class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              分配 AI 成员到 {{ deviceName }}
            </div>
            <button class="text-zinc-400 hover:text-zinc-600" @click="emit('close')">✕</button>
          </div>
          <div v-if="members.length === 0" class="py-4 text-center text-sm text-zinc-500">
            暂无可分配成员
          </div>
          <div v-else class="max-h-64 overflow-auto divide-y divide-zinc-100 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
            <button
              v-for="m in members"
              :key="m.aiConfigId"
              class="w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 flex justify-between items-center transition-colors"
              @click="emit('toggle', m.aiConfigId)"
            >
              <span class="flex items-center gap-2 font-medium">
                <span
                  class="inline-flex h-4 w-4 items-center justify-center rounded border text-[10px]"
                  :class="draftIds.includes(m.aiConfigId) ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-zinc-300 dark:border-zinc-600'"
                >{{ draftIds.includes(m.aiConfigId) ? '✓' : '' }}</span>
                {{ m.name }}
              </span>
              <span class="text-xs text-zinc-500">ID: {{ m.aiConfigId }}</span>
            </button>
          </div>
          <div class="mt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              class="rounded border border-rose-200 px-3 py-1 text-sm text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300"
              @click="emit('clear')"
            >
              清空选择
            </button>
            <div class="flex gap-2">
            <button
              type="button"
              class="rounded border border-zinc-200 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700"
              @click="emit('close')"
            >
              取消
            </button>
            <button
              type="button"
              :disabled="busy"
              class="rounded border border-indigo-200 bg-indigo-50 px-3 py-1 text-sm text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200"
              @click="emit('save')"
            >
              {{ busy ? '保存中...' : `保存（${draftIds.length}）` }}
            </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
