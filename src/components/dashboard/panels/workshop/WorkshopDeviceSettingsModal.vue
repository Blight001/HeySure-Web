<script setup lang="ts">
import type { ConnectedDevice } from '@/composables/dashboard/useDashboardData'
import { DEVICE_ICON_PRESETS, deviceIconUrl, effectiveAiDescription } from './workshopDeviceDisplay'
import type { DeviceSettingsDraft, WorkshopDisplayState } from './workshopTypes'

defineProps<{
  device: ConnectedDevice | null
  draft: DeviceSettingsDraft
  display: WorkshopDisplayState
  busy: boolean
  error: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save'): void
  (e: 'select-icon', icon: string): void
}>()
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="device"
        class="fixed inset-0 modal-overlay flex items-center justify-center p-4 z-[120]"
        @click="emit('close')"
      >
        <div class="acrylic-modal rounded-xl border border-zinc-200 dark:border-zinc-700 w-full max-w-[430px] p-4" @click.stop>
          <div class="flex items-center justify-between mb-3">
            <div class="min-w-0">
              <div class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">设备设置</div>
              <div class="mt-0.5 truncate text-xs text-zinc-400">{{ device.name || device.id }}</div>
            </div>
            <button class="text-zinc-400 hover:text-zinc-600" @click="emit('close')">✕</button>
          </div>

          <label class="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">备注</label>
          <input
            v-model.trim="draft.remark"
            maxlength="64"
            class="w-full rounded-lg border border-zinc-200 bg-white/80 px-3 py-2 text-sm outline-none transition-colors focus:border-indigo-300 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-100"
            placeholder="例如：客厅电脑、测试手机、仓库传感器"
          />

          <label class="mb-1 mt-3 block text-xs font-medium text-zinc-500 dark:text-zinc-400">AI 用途描述</label>
          <textarea
            v-model.trim="draft.aiDescriptionOverride"
            maxlength="240"
            rows="3"
            class="w-full resize-none rounded-lg border border-zinc-200 bg-white/80 px-3 py-2 text-sm outline-none transition-colors focus:border-indigo-300 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-100"
            :placeholder="effectiveAiDescription(device, display) || '例如：用于操作已登录的内容平台并发布图文'"
          />
          <div class="mt-1 text-xs leading-relaxed text-zinc-400">
            这段说明会作为设备能力元数据提供给 AI，不会替代上面的界面备注。留空时使用设备上报或类型默认说明。
          </div>
          <div v-if="device.reportedAiDescription" class="mt-1 text-xs leading-relaxed text-zinc-400">
            设备上报：{{ device.reportedAiDescription }}
          </div>

          <div class="mt-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">图标</div>
          <div class="mt-2 grid grid-cols-5 gap-2">
            <button
              type="button"
              class="h-12 rounded-lg border text-xs transition-colors"
              :class="!draft.icon ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200' : 'border-zinc-200 bg-white/70 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300 dark:hover:bg-zinc-800'"
              @click="emit('select-icon', '')"
            >
              默认
            </button>
            <button
              v-for="icon in DEVICE_ICON_PRESETS"
              :key="icon"
              type="button"
              class="h-12 rounded-lg border p-1 transition-colors"
              :class="draft.icon === icon ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-500/40 dark:bg-indigo-500/10' : 'border-zinc-200 bg-white/70 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/60 dark:hover:bg-zinc-800'"
              @click="emit('select-icon', icon)"
            >
              <img :src="deviceIconUrl(icon)" class="mx-auto h-9 w-9 rounded-md object-contain" alt="" />
            </button>
          </div>

          <label class="mb-1 mt-3 block text-xs font-medium text-zinc-500 dark:text-zinc-400">自定义图标 URL</label>
          <input
            v-model.trim="draft.icon"
            class="w-full rounded-lg border border-zinc-200 bg-white/80 px-3 py-2 text-sm outline-none transition-colors focus:border-indigo-300 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-100"
            placeholder="/device_png/3.webp 或 https://..."
          />

          <div v-if="error" class="mt-2 text-xs text-rose-500">
            {{ error }}
          </div>

          <div class="mt-4 flex justify-end gap-2">
            <button
              type="button"
              class="rounded border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              @click="emit('close')"
            >
              取消
            </button>
            <button
              type="button"
              :disabled="busy"
              class="rounded border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20"
              @click="emit('save')"
            >
              {{ busy ? '保存中...' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
