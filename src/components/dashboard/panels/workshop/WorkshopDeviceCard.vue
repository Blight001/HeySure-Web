<script setup lang="ts">
import type { ConnectedDevice } from '@/composables/dashboard/useDashboardData'
import DeviceMcpScopeEditor from '../../modals/DeviceMcpScopeEditor.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import {
  canCustomizeDevice,
  canRemoteControl,
  deviceTypeLabel,
  isEndpointDevice,
  isLibraryDevice,
  isOffline,
  isToolboxDevice,
  lifecycleClass,
  lifecycleLabel,
  remoteControlLabel,
} from './workshopDeviceKinds'
import {
  deviceAvatarUrl,
  deviceCardClass,
  deviceDisplayName,
  deviceIcon,
  linkedConfigIds,
  memberPanelClass,
  memberStatusBadgeClass,
  memberStatusLabel,
} from './workshopDeviceDisplay'
import type { WorkshopAgent, WorkshopDisplayState } from './workshopTypes'

const props = defineProps<{
  device: ConnectedDevice
  focused: boolean
  busy: boolean
  error: string
  members: Map<number, WorkshopAgent>
  display: WorkshopDisplayState
}>()

const emit = defineEmits<{
  (e: 'settings'): void
  (e: 'delete'): void
  (e: 'remote'): void
  (e: 'assign'): void
  (e: 'unbind', aiConfigId: number): void
}>()

const hideBrokenIcon = (event: Event) => {
  (event.target as HTMLImageElement).style.display = 'none'
}

const cardClass = () => deviceCardClass(props.device, props.display, props.members)
const avatarUrl = () => deviceAvatarUrl(props.device, props.display, props.members)
const iconUrl = () => deviceIcon(props.device, props.display)
const displayName = () => deviceDisplayName(props.device, props.display)
const boundIds = () => linkedConfigIds(props.device, props.display)
const memberName = (id: number) => props.members.get(id)?.name || `AI-${id}`
const memberLearning = (id: number) => props.members.get(id)?.status === 'learning'
</script>

<template>
  <div
    data-device-card
    :data-device-id="device.id"
    class="relative rounded-xl border p-3 transition-[transform,box-shadow,border-color] duration-300"
    :class="[
      cardClass(),
      focused ? 'z-20 scale-[1.045] !border-indigo-400 ring-2 ring-indigo-300/70 shadow-2xl shadow-indigo-500/25 dark:!border-indigo-400 dark:ring-indigo-500/50' : '',
    ]"
  >
    <div 
      v-if="avatarUrl()"
      class="absolute inset-0 rounded-xl overflow-hidden pointer-events-none z-0"
      :style="{ opacity: '0.15' }"
    >
      <img :src="avatarUrl()" class="w-full h-full object-cover select-none blur scale-[1.03]" alt="" />
    </div>

    <div class="relative z-10">
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0 flex items-center gap-1.5">
        <span class="inline-block w-2 h-2 rounded-full shrink-0" :class="lifecycleClass(device.lifecycle)"></span>
        <img
          v-if="iconUrl()"
          :src="iconUrl()"
          class="w-5 h-5 rounded-md object-contain shrink-0 select-none"
          :class="isOffline(device) ? 'opacity-60 grayscale' : ''"
          alt=""
          @error="hideBrokenIcon"
        />
        <h4 class="text-sm font-bold text-zinc-700 dark:text-zinc-200 truncate">{{ displayName() }}</h4>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <span class="shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium" :class="memberStatusBadgeClass(device, display)">
          {{ memberStatusLabel(device, display, members) }}
        </span>
        <button
          v-if="canCustomizeDevice(device)"
          type="button"
          :disabled="busy"
          title="设备显示设置"
          class="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded border border-zinc-200 bg-white/70 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300 dark:hover:bg-zinc-700"
          @click="emit('settings')"
        >
          <AppIcon name="gear" class="w-3.5 h-3.5" />
        </button>
        <button
          v-if="isOffline(device) && !isToolboxDevice(device) && !isLibraryDevice(device)"
          type="button"
          :disabled="busy"
          title="删除该离线设备的记录"
          class="shrink-0 rounded border border-rose-200 px-1.5 py-0.5 text-xs text-rose-600 transition-colors hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
          @click="emit('delete')"
        >
          删除记录
        </button>
      </div>
    </div>
    <div class="mt-1 flex items-center justify-between gap-2 min-w-0">
      <div class="min-w-0 truncate text-xs text-zinc-400 dark:text-zinc-500" :title="`${deviceTypeLabel(device)} · ${device.platform || 'unknown'} · ${device.id}`">
        {{ deviceTypeLabel(device) }} · {{ device.platform || 'unknown' }} · {{ device.id }}
      </div>
      <span class="shrink-0 rounded bg-zinc-100/60 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-300">
        {{ lifecycleLabel(device.lifecycle) }}
      </span>
    </div>

    <div class="mt-2 flex gap-1">
      <button
        v-if="canRemoteControl(device) && !isOffline(device)"
        type="button"
        class="flex-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
        @click="emit('remote')"
      >
        <AppIcon name="monitor" class="w-3.5 h-3.5" /> {{ remoteControlLabel(device) }}
      </button>
    </div>

    <div v-if="boundIds().length || error" class="mt-2 rounded-lg border p-2" :class="memberPanelClass(device, display)">
      <div v-if="boundIds().length" class="space-y-1">
        <div class="text-xs text-zinc-500 dark:text-zinc-400">已分配 AI 成员（权限互相独立）</div>
        <div
          v-for="mid in boundIds()"
          :key="mid"
          class="flex items-center justify-between gap-2 rounded-md bg-white/60 px-2 py-1.5 text-xs dark:bg-zinc-800/60"
        >
          <span class="min-w-0 truncate">
            {{ memberName(mid) }}
            <span v-if="memberLearning(mid)" class="ml-1 text-emerald-600 dark:text-emerald-300">学习中</span>
          </span>
          <span class="flex shrink-0 items-center gap-1">
            <DeviceMcpScopeEditor
              v-if="!isOffline(device)"
              :device-id="device.id"
              :ai-config-id="mid"
              :refresh-key="`${mid}-${device.lifecycle ?? ''}`"
            />
            <span v-else class="text-xs text-zinc-400">离线</span>
            <button
              type="button"
              :disabled="busy"
              class="rounded border border-rose-200 px-1.5 py-0.5 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
              @click="emit('unbind', mid)"
            >解除</button>
          </span>
        </div>
      </div>
      <div v-if="error" class="mt-1 text-xs text-rose-500">{{ error }}</div>
    </div>

    <div v-if="isEndpointDevice(device) || isToolboxDevice(device)" class="mt-2 flex gap-1">
      <button
        type="button"
        :disabled="busy"
        class="flex-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
        @click="emit('assign')"
      >
        {{ busy ? '...' : '分配 AI 成员' }}
      </button>
    </div>
    <div v-else-if="device.capabilities.length" class="mt-2 flex flex-wrap gap-1">
      <span
        v-for="cap in device.capabilities"
        :key="cap"
        class="rounded bg-zinc-100/60 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400"
      >
        {{ cap }}
      </span>
    </div>

    <div v-if="device.lastError" class="mt-2 truncate text-xs text-rose-500" :title="device.lastError">
      错误: {{ device.lastError }}
    </div>
    </div>
  </div>
</template>
