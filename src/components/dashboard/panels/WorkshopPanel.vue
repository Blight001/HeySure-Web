<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { deviceDisplayName } from './workshop/workshopDeviceDisplay'
import { useWorkshopPanel } from './workshop/useWorkshopPanel'
import WorkshopAssignMemberModal from './workshop/WorkshopAssignMemberModal.vue'
import WorkshopDeleteConfirm from './workshop/WorkshopDeleteConfirm.vue'
import WorkshopDeviceCard from './workshop/WorkshopDeviceCard.vue'
import WorkshopDeviceSettingsModal from './workshop/WorkshopDeviceSettingsModal.vue'
import type { WorkshopPanelProps } from './workshop/workshopTypes'

const RemoteControlModal = defineAsyncComponent(() => import('@/components/dashboard/RemoteControlModal.vue'))

const props = defineProps<WorkshopPanelProps>()
const emit = defineEmits<{
  (e: 'open-device-doc'): void
  (e: 'install-device'): void
}>()

const wp = useWorkshopPanel(props)
</script>

<template>
  <div :ref="(el) => { wp.panelRootRef = el as HTMLElement | null }" class="relative flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
    <div class="grid grid-cols-2 gap-2">
      <button
        type="button"
        class="flex min-w-0 items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-2.5 text-left text-sm font-semibold text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100/80 active:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:border-indigo-400/50 dark:hover:bg-indigo-500/15"
        @click="emit('open-device-doc')"
      >
        <span class="flex min-w-0 items-center gap-2">
          <AppIcon name="book" class="h-4 w-4 shrink-0" />
          <span class="truncate">开发文档</span>
        </span>
        <span aria-hidden="true" class="ml-1 text-indigo-400">›</span>
      </button>
      <button
        type="button"
        class="flex min-w-0 items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-2.5 text-left text-sm font-semibold text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100/80 active:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:border-indigo-400/50 dark:hover:bg-indigo-500/15"
        @click="emit('install-device')"
      >
        <span class="flex min-w-0 items-center gap-2">
          <AppIcon name="download" class="h-4 w-4 shrink-0" />
          <span class="truncate">安装设备</span>
        </span>
        <span aria-hidden="true" class="ml-1 text-indigo-400">›</span>
      </button>
    </div>

    <div v-if="wp.orderedDevices.length === 0" class="py-10 text-center text-sm text-zinc-400 dark:text-zinc-500">
      暂无已连接设备。
    </div>

    <WorkshopDeviceCard
      v-for="device in wp.orderedDevices"
      :key="device.id"
      :device="device"
      :focused="device.id === focusedDeviceId"
      :busy="!!wp.busy[device.id]"
      :error="wp.errors[device.id] || ''"
      :members="wp.memberByConfigId"
      :display="wp.display"
      @settings="wp.openDeviceSettings(device)"
      @delete="wp.deleteRecord(device)"
      @remote="wp.openRemoteControl(device)"
      @assign="wp.openAssignMember(device)"
      @unbind="(id) => wp.unbindSpecific(device, id)"
    />

    <RemoteControlModal
      v-if="wp.rcTarget"
      :device-id="wp.rcTarget.deviceId"
      :device-name="wp.rcTarget.name"
      :mode="wp.rcTarget.mode"
      @close="wp.rcTarget = null"
    />

    <WorkshopDeviceSettingsModal
      :device="wp.deviceSettingsTarget ?? null"
      :draft="wp.deviceSettingsDraft"
      :display="wp.display"
      :busy="!!(wp.deviceSettingsTarget && wp.busy[wp.deviceSettingsTarget.id])"
      :error="wp.deviceSettingsTarget ? (wp.errors[wp.deviceSettingsTarget.id] || '') : ''"
      @close="wp.closeDeviceSettings()"
      @save="wp.saveDeviceSettings()"
      @select-icon="wp.selectDeviceIcon"
    />

    <WorkshopAssignMemberModal
      :show="!!wp.assignMemberModal"
      :device-name="wp.assignMemberModal?.name || wp.assignMemberModal?.id || ''"
      :members="wp.assignableMembers"
      :draft-ids="wp.assignDraftIds ?? []"
      :busy="!!(wp.assignMemberModal && wp.busy[wp.assignMemberModal.id])"
      @close="wp.closeAssignMember()"
      @toggle="wp.toggleAssignDraft"
      @clear="wp.assignDraftIds = []"
      @save="wp.saveMemberAssignments()"
    />

    <WorkshopDeleteConfirm
      :show="!!wp.deleteConfirmTarget"
      :device-name="wp.deleteConfirmTarget ? deviceDisplayName(wp.deleteConfirmTarget, wp.display) : ''"
      @close="wp.closeDeleteConfirm()"
      @confirm="wp.confirmDeleteRecord()"
    />
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 10px;
}
.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.05);
}
</style>
