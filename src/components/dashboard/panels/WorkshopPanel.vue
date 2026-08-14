<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, reactive, ref, watch } from 'vue'
import type { ConnectedDevice } from '@/composables/dashboard/useDashboardData'
import { deleteDeviceRecord, setBuiltinDeviceBinding, setDeviceMemberBinding, updateDeviceDisplay } from '@/api/devices'
import DeviceMcpScopeEditor from '../modals/DeviceMcpScopeEditor.vue'
import AppIcon from '@/components/common/AppIcon.vue'

// 远程画面弹窗懒加载，避免拖进设备面板首屏
const RemoteControlModal = defineAsyncComponent(() => import('@/components/dashboard/RemoteControlModal.vue'))
import { resolveAiAvatarUrl } from '@/utils/aiAvatar'

interface Agent {
  id: string
  name: string
  avatar?: string
  role: 'admin' | 'worker'
  aiRole?: 'assistant_admin' | 'digital_member' | 'admin' | 'worker'
  digitalMemberRole?: 'manager' | 'member'
  aiConfigId?: number
  mcpTools?: string
  status: 'learning' | 'working' | 'reproducing' | 'dead'
  platform: string
  currentTask?: string
  currentTaskTitle?: string
  currentTaskStatus?: string
  projectName?: string
  runtimeStatus?: string
  runtimeTool?: string
}

interface Props {
  devices: ConnectedDevice[]
  agents: Agent[]
  focusedDeviceId?: string
  focusSignal?: number
}

const props = defineProps<Props>()
const panelRootRef = ref<HTMLElement | null>(null)

/** 在线设备保持服务端原顺序；离线设备稳定沉到列表底部。 */
const orderedDevices = computed(() =>
  (props.devices || [])
    .map((device, index) => ({ device, index }))
    .sort((a, b) => Number(a.device.online === false) - Number(b.device.online === false) || a.index - b.index)
    .map(item => item.device),
)

watch(() => props.focusSignal, async () => {
  if (!props.focusedDeviceId) return
  await nextTick()
  const card = Array.from(panelRootRef.value?.querySelectorAll<HTMLElement>('[data-device-card]') || [])
    .find(item => item.dataset.deviceId === props.focusedDeviceId)
  card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
})

const emit = defineEmits<{
  (e: 'open-device-doc'): void
}>()

const memberByConfigId = computed(() => {
  const map = new Map<number, Agent>()
  for (const agent of props.agents || []) {
    const id = Number(agent.aiConfigId)
    if (Number.isFinite(id) && id > 0) map.set(id, agent)
  }
  return map
})

// AI members the operator can assign to a device (those backed by a real config).
const assignableMembers = computed(() =>
  (props.agents || [])
    .filter(a => Number.isFinite(Number(a.aiConfigId)) && Number(a.aiConfigId) > 0)
    .map(a => ({ aiConfigId: Number(a.aiConfigId), name: a.name })),
)

// Member assignment modal state
const assignMemberModal = ref<ConnectedDevice | null>(null)
const assignDraftIds = ref<number[]>([])
const openAssignMember = (device: ConnectedDevice) => {
  assignMemberModal.value = device
  assignDraftIds.value = [...linkedConfigIds(device)]
}
const closeAssignMember = () => {
  assignMemberModal.value = null
  assignDraftIds.value = []
}

const busy = reactive<Record<string, boolean>>({})
const errors = reactive<Record<string, string>>({})
const bindingOverrides = reactive<Record<string, number[]>>({})
const displayRemarkOverride = reactive<Record<string, string>>({})
const displayIconOverride = reactive<Record<string, string>>({})
const displayIconSettingOverride = reactive<Record<string, string>>({})
const aiDescriptionSettingOverride = reactive<Record<string, string>>({})
const effectiveAiDescriptionOverride = reactive<Record<string, string>>({})

const DEVICE_ICON_PRESETS = Array.from({ length: 8 }, (_, index) => `/device_png/${index + 1}.webp`)
const DEVICE_ICON_CACHE_BUST = Date.now().toString(36)

const deviceIconUrl = (url: string) => {
  if (!url.startsWith('/device_png/')) return url
  return `${url}${url.includes('?') ? '&' : '?'}v=${DEVICE_ICON_CACHE_BUST}`
}

const linkedConfigId = (device: ConnectedDevice): number | null => {
  return linkedConfigIds(device)[0] || null
}

const linkedConfigIds = (device: ConnectedDevice): number[] => {
  if (device.id in bindingOverrides) return [...bindingOverrides[device.id]]
  const ids = Array.isArray(device.boundAiConfigIds)
    ? device.boundAiConfigIds.map(Number).filter((id) => Number.isFinite(id) && id > 0)
    : []
  const legacyId = Number(device.aiConfigId)
  if (Number.isFinite(legacyId) && legacyId > 0 && !ids.includes(legacyId)) ids.push(legacyId)
  return Array.from(new Set(ids)).sort((a, b) => a - b)
}

const updateOneBinding = async (device: ConnectedDevice, cfgId: number, bound: boolean) => {
  if (isLibraryDevice(device) || isToolboxDevice(device)) {
    await setBuiltinDeviceBinding(cfgId, device.id, bound)
  } else {
    await setDeviceMemberBinding(device.id, cfgId, bound)
  }
}

const saveMemberAssignments = async () => {
  const device = assignMemberModal.value
  if (!device) return
  busy[device.id] = true
  errors[device.id] = ''
  try {
    const current = new Set(linkedConfigIds(device))
    const desired = new Set(assignDraftIds.value)
    for (const cfgId of current) {
      if (!desired.has(cfgId)) await updateOneBinding(device, cfgId, false)
    }
    for (const cfgId of desired) {
      if (!current.has(cfgId)) await updateOneBinding(device, cfgId, true)
    }
    bindingOverrides[device.id] = [...desired].sort((a, b) => a - b)
    closeAssignMember()
  } catch (err: any) {
    errors[device.id] = err?.message || '分配失败'
  } finally {
    busy[device.id] = false
  }
}

const unbindSpecific = async (device: ConnectedDevice, aiConfigId: number) => {
  busy[device.id] = true
  errors[device.id] = ''
  try {
    await updateOneBinding(device, aiConfigId, false)
    bindingOverrides[device.id] = linkedConfigIds(device).filter(id => id !== aiConfigId)
  } catch (err: any) {
    errors[device.id] = err?.message || '解除绑定失败'
  } finally {
    busy[device.id] = false
  }
}

const toggleAssignDraft = (aiConfigId: number) => {
  assignDraftIds.value = assignDraftIds.value.includes(aiConfigId)
    ? assignDraftIds.value.filter(id => id !== aiConfigId)
    : [...assignDraftIds.value, aiConfigId]
}

// Forget an offline device's record entirely (binding + presence + saved MCP
// scope). The server refuses this while the device is connected, so the
// button only ever appears on offline cards. Confirmation is a panel-local
// modal (matching the assign-member modal below) rather than the browser's
// native confirm().
const deleteConfirmTarget = ref<ConnectedDevice | null>(null)
const deleteRecord = (device: ConnectedDevice) => {
  deleteConfirmTarget.value = device
}
const closeDeleteConfirm = () => {
  deleteConfirmTarget.value = null
}
const confirmDeleteRecord = async () => {
  const device = deleteConfirmTarget.value
  if (!device) return
  closeDeleteConfirm()
  busy[device.id] = true
  errors[device.id] = ''
  try {
    await deleteDeviceRecord(device.id)
  } catch (err: any) {
    errors[device.id] = err?.message || '删除失败'
  } finally {
    busy[device.id] = false
  }
}

const deviceSettingsTarget = ref<ConnectedDevice | null>(null)
const deviceSettingsDraft = reactive({ remark: '', icon: '', aiDescriptionOverride: '' })
const openDeviceSettings = (device: ConnectedDevice) => {
  deviceSettingsTarget.value = device
  deviceSettingsDraft.remark = displayRemark(device)
  deviceSettingsDraft.icon = device.id in displayIconSettingOverride
    ? displayIconSettingOverride[device.id]
    : device.iconOverride ?? device.icon ?? ''
  deviceSettingsDraft.aiDescriptionOverride = device.id in aiDescriptionSettingOverride
    ? aiDescriptionSettingOverride[device.id]
    : device.aiDescriptionOverride ?? ''
}
const closeDeviceSettings = () => {
  deviceSettingsTarget.value = null
}
const selectDeviceIcon = (icon: string) => {
  deviceSettingsDraft.icon = icon
}
const saveDeviceSettings = async () => {
  const device = deviceSettingsTarget.value
  if (!device) return
  busy[device.id] = true
  errors[device.id] = ''
  try {
    const data = await updateDeviceDisplay(device.id, {
      remark: deviceSettingsDraft.remark,
      icon: deviceSettingsDraft.icon,
      aiDescriptionOverride: deviceSettingsDraft.aiDescriptionOverride,
    })
    displayRemarkOverride[device.id] = data.remark || ''
    displayIconOverride[device.id] = data.icon || ''
    displayIconSettingOverride[device.id] = data.iconOverride || ''
    aiDescriptionSettingOverride[device.id] = data.aiDescriptionOverride || ''
    effectiveAiDescriptionOverride[device.id] = data.effectiveAiDescription || ''
    closeDeviceSettings()
  } catch (err: any) {
    errors[device.id] = err?.message || '显示设置保存失败'
  } finally {
    busy[device.id] = false
  }
}

// 内置工具箱设备：多绑，现在在设备面板支持分配绑定 + MCP 范围勾选（像其他设备一样）。
const isToolboxDevice = (device: ConnectedDevice) => String(device.id || '').startsWith('toolbox_builtin_')

const deviceTypeLabel = (device: ConnectedDevice) => {
  if (isToolboxDevice(device)) return '工具箱'
  if (isLibraryDevice(device)) return '图书馆'
  if (isCustomDevice(device)) return '自定义设备'
  if (isAndroidDevice(device)) return '安卓端'
  if (isBrowserDevice(device)) return '浏览器插件'
  if (isSoftwareDevice(device)) return '软件端'
  return '设备端'
}

// 开发者按 device/read.md 自建的设备：服务端归一化为 deviceType === 'custom'，
// 绑定 / MCP 范围编辑与内置端一致，但不参与远控与动态工具下发。
const isCustomDevice = (device: ConnectedDevice) => String(device.deviceType || '').toLowerCase() === 'custom'

// 内置图书馆使用专用绑定接口，但在本面板保持与其它设备一致的交互。
// 各分类函数优先用服务端归一化的 deviceType（自定义设备的 platform 是任意字符串，
// 不能再用关键词启发式判断），缺失时退回旧的 platform 启发式。
const isLibraryDevice = (device: ConnectedDevice) => {
  if (device.deviceType) return ['workshop', 'library'].includes(device.deviceType)
  if (device.isWorkshop || String(device.id || '').startsWith('workshop_builtin_')) return true
  const platform = String(device.platform || '').toLowerCase()
  return platform.includes('workshop')
}

const canCustomizeDevice = (device: ConnectedDevice) => !isToolboxDevice(device) && !isLibraryDevice(device)

const isSoftwareDevice = (device: ConnectedDevice) => {
  if (device.deviceType) return device.deviceType === 'desktop'
  const platform = String(device.platform || '').toLowerCase()
  return !!device.isWindowsDesktop || platform.includes('desktop') || platform.includes('windows')
}

const isAndroidDevice = (device: ConnectedDevice) => {
  if (device.deviceType) return device.deviceType === 'android'
  const platform = String(device.platform || '').toLowerCase()
  return !!device.isAndroid || platform.includes('android')
}

// Live remote control is available for desktop + android endpoints. The device
// advertises the ``remote_control`` capability once its client supports it; we
// still show the button for those device types and let the session surface a
// clear error if an older client hasn't been updated yet.
const rcTarget = ref<{ deviceId: string; name: string; mode: 'android' | 'desktop' | 'browser' } | null>(null)

const isBrowserDevice = (device: ConnectedDevice) => {
  if (device.deviceType) return device.deviceType === 'browser'
  const platform = String(device.platform || '').toLowerCase()
  return !!device.isBrowserExtension || platform.includes('browser')
}

const canRemoteControl = (device: ConnectedDevice) =>
  isSoftwareDevice(device) || isAndroidDevice(device) || isBrowserDevice(device)

const openRemoteControl = (device: ConnectedDevice) => {
  rcTarget.value = {
    deviceId: device.id,
    name: deviceDisplayName(device),
    mode: isAndroidDevice(device) ? 'android' : isBrowserDevice(device) ? 'browser' : 'desktop',
  }
}

const isEndpointDevice = (device: ConnectedDevice) => {
  const platform = String(device.platform || '').toLowerCase()
  return isSoftwareDevice(device) || isAndroidDevice(device) || !!device.isBrowserExtension || platform.includes('browser') || isLibraryDevice(device) || isCustomDevice(device)
}

const displayRemark = (device: ConnectedDevice) => {
  if (device.id in displayRemarkOverride) return displayRemarkOverride[device.id]
  return String(device.remark || '').trim()
}

const effectiveAiDescription = (device: ConnectedDevice) => {
  if (device.id in effectiveAiDescriptionOverride) return effectiveAiDescriptionOverride[device.id]
  return String(device.effectiveAiDescription || device.reportedAiDescription || '').trim()
}

const deviceDisplayName = (device: ConnectedDevice) => {
  const base = device.name || device.id || deviceTypeLabel(device)
  const remark = displayRemark(device)
  return remark ? `${base}（${remark}）` : base
}

const deviceIcon = (device: ConnectedDevice) => {
  const icon = device.id in displayIconOverride ? displayIconOverride[device.id] : device.icon || ''
  return icon ? deviceIconUrl(icon) : ''
}

const lifecycleLabel = (lifecycle?: string) => {
  switch (lifecycle) {
    case 'offline':
      return '离线，等待重连'
    case 'dispatching':
      return '执行中'
    case 'registered':
    case 'connected':
      return '已连接'
    case 'degraded':
      return '异常'
    default:
      return '在线'
  }
}

const lifecycleClass = (lifecycle?: string) => {
  switch (lifecycle) {
    case 'offline':
      return 'bg-zinc-300 dark:bg-zinc-600'
    case 'dispatching':
      return 'bg-indigo-500'
    case 'registered':
    case 'connected':
      return 'bg-emerald-500'
    case 'degraded':
      return 'bg-amber-500'
    default:
      return 'bg-zinc-400'
  }
}

// A device we've seen before but that isn't connected right now. It still gets
// a card (so its AI assignment can be saved/changed), but live-only actions
// (remote control, per-device MCP scope) need a connected socket and are hidden.
const isOffline = (device: ConnectedDevice) => device.online === false

const linkedMember = (device: ConnectedDevice) => {
  const id = linkedConfigId(device)
  if (!id) return undefined
  return memberByConfigId.value.get(id)
}

const hasAnyLinked = (device: ConnectedDevice) => linkedConfigIds(device).length > 0

const getBoundMemberNames = (device: ConnectedDevice): string[] => {
  const ids = linkedConfigIds(device)
  return ids.map(id => {
    const m = memberByConfigId.value.get(id)
    return m?.name || `AI-${id}`
  })
}

const memberPanelClass = (device: ConnectedDevice) => hasAnyLinked(device)
  ? 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-500/30 dark:bg-emerald-500/10'
  : 'border-amber-200 bg-amber-50/80 dark:border-amber-500/30 dark:bg-amber-500/10'

const deviceCardClass = (device: ConnectedDevice) => {
  const hasAvatar = !!deviceAvatarUrl(device)
  const linked = hasAnyLinked(device)
  const offline = isOffline(device)
  // Offline cards are always grey (regardless of assignment state) so a
  // device waiting to reconnect reads as "dormant", not as a warning.
  const baseBorder = offline
    ? 'border-zinc-200 dark:border-zinc-600'
    : linked
      ? 'border-emerald-200 dark:border-emerald-500/30'
      : 'border-amber-200 dark:border-amber-500/30'
  if (hasAvatar) {
    // 头像背景时，使用透明底让头像显示；保留边框色调
    return baseBorder + ' bg-transparent dark:bg-transparent'
  }
  const bg = offline
    ? ' bg-zinc-100/60 dark:bg-zinc-800/40'
    : linked
      ? ' bg-emerald-50/60 dark:bg-emerald-500/10'
      : ' bg-amber-50/60 dark:bg-amber-500/10'
  return baseBorder + bg
}

const memberStatusLabel = (device: ConnectedDevice) => {
  const names = getBoundMemberNames(device)
  if (names.length === 0) {
    return isToolboxDevice(device) ? '未绑定 AI' : '未链接成员'
  }
  if (names.length === 1) {
    return names[0] + '已绑定'
  }
  const display = names.slice(0, 2).join('、')
  const more = names.length > 2 ? '等' : ''
  return display + more + '已绑定'
}

const memberStatusBadgeClass = (device: ConnectedDevice) => hasAnyLinked(device)
  ? 'border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200'
  : 'border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200'

const deviceAvatarUrl = (device: ConnectedDevice) => {
  if (linkedConfigIds(device).length !== 1) return ''
  const member = linkedMember(device)
  return resolveAiAvatarUrl(member?.avatar) || ''
}
</script>

<template>
  <div ref="panelRootRef" class="relative flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
    <button
      type="button"
      class="flex w-full items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-2.5 text-left text-xs font-semibold text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100/80 active:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:border-indigo-400/50 dark:hover:bg-indigo-500/15"
      @click="emit('open-device-doc')"
    >
      <span class="flex items-center gap-2">
        <AppIcon name="book" class="h-4 w-4" />
        设备端开发文档
      </span>
      <span aria-hidden="true" class="text-indigo-400">›</span>
    </button>

    <div v-if="orderedDevices.length === 0" class="text-center text-zinc-400 text-xs py-10 dark:text-zinc-500">
      暂无已连接设备。
    </div>

    <div
      v-for="device in orderedDevices"
      :key="device.id"
      data-device-card
      :data-device-id="device.id"
      class="relative rounded-xl border p-3 transition-[transform,box-shadow,border-color] duration-300"
      :class="[
        deviceCardClass(device),
        device.id === focusedDeviceId ? 'z-20 scale-[1.045] !border-indigo-400 ring-2 ring-indigo-300/70 shadow-2xl shadow-indigo-500/25 dark:!border-indigo-400 dark:ring-indigo-500/50' : '',
      ]"
    >
      <!-- 单AI绑定设备的AI头像作为背景填充：85% 透明 + 虚化处理（与数字生命一致） -->
      <div 
        v-if="deviceAvatarUrl(device)"
        class="absolute inset-0 rounded-xl overflow-hidden pointer-events-none z-0"
        :style="{ opacity: '0.15' }"
      >
        <img :src="deviceAvatarUrl(device)" class="w-full h-full object-cover select-none blur scale-[1.03]" alt="" />
      </div>

      <div class="relative z-10">
      <!-- 第一行：标题 + 绑定状态 + 操作；第二行：设备说明/编号 + 在线状态标签（离线标签不挤标题） -->
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex items-center gap-1.5">
          <span class="inline-block w-2 h-2 rounded-full shrink-0" :class="lifecycleClass(device.lifecycle)"></span>
          <!-- 设备自选图标（注册时上报）；未选择时保持网页默认样式 -->
          <img
            v-if="deviceIcon(device)"
            :src="deviceIcon(device)"
            class="w-5 h-5 rounded-md object-contain shrink-0 select-none"
            :class="isOffline(device) ? 'opacity-60 grayscale' : ''"
            alt=""
            @error="($event.target as HTMLImageElement).style.display = 'none'"
          />
          <h4 class="text-sm font-bold text-zinc-700 dark:text-zinc-200 truncate">{{ deviceDisplayName(device) }}</h4>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <span class="shrink-0 text-[9px] px-1 py-0.5 rounded border font-medium" :class="memberStatusBadgeClass(device)">
            {{ memberStatusLabel(device) }}
          </span>
          <button
            v-if="canCustomizeDevice(device)"
            type="button"
            :disabled="busy[device.id]"
            title="设备显示设置"
            class="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded border border-zinc-200 bg-white/70 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300 dark:hover:bg-zinc-700"
            @click="openDeviceSettings(device)"
          >
            <AppIcon name="gear" class="w-3.5 h-3.5" />
          </button>
          <button
            v-if="isOffline(device) && !isToolboxDevice(device) && !isLibraryDevice(device)"
            type="button"
            :disabled="busy[device.id]"
            title="删除该离线设备的记录"
            class="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-rose-200 text-rose-600 transition-colors hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
            @click="deleteRecord(device)"
          >
            删除记录
          </button>
        </div>
      </div>
      <div class="mt-1 flex items-center justify-between gap-2 min-w-0">
        <div class="min-w-0 text-[10px] text-zinc-400 dark:text-zinc-500 truncate" :title="`${deviceTypeLabel(device)} · ${device.platform || 'unknown'} · ${device.id}`">
          {{ deviceTypeLabel(device) }} · {{ device.platform || 'unknown' }} · {{ device.id }}
        </div>
        <span class="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-zinc-100/60 text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-300">
          {{ lifecycleLabel(device.lifecycle) }}
        </span>
      </div>

      <div class="mt-2 flex gap-1">
        <button
          v-if="canRemoteControl(device) && !isOffline(device)"
          type="button"
          class="flex-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700 transition-colors hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
          @click="openRemoteControl(device)"
        >
          <AppIcon name="monitor" class="w-3.5 h-3.5" /> {{ isAndroidDevice(device) ? '远程控制' : isBrowserDevice(device) ? '浏览器控制' : '桌面控制' }}
        </button>
      </div>

      <div v-if="linkedConfigIds(device).length || errors[device.id]" class="mt-2 rounded-lg border p-2" :class="memberPanelClass(device)">
        <div v-if="linkedConfigIds(device).length" class="space-y-1">
          <div class="text-[9px] text-zinc-500 dark:text-zinc-400">已分配 AI 成员（权限互相独立）</div>
          <div
            v-for="mid in linkedConfigIds(device)"
            :key="mid"
            class="flex items-center justify-between gap-2 rounded-md bg-white/60 px-2 py-1 text-[10px] dark:bg-zinc-800/60"
          >
            <span class="min-w-0 truncate">
              {{ memberByConfigId.get(mid)?.name || 'AI-' + mid }}
              <span v-if="memberByConfigId.get(mid)?.status === 'learning'" class="ml-1 text-emerald-600 dark:text-emerald-300">学习中</span>
            </span>
            <span class="flex shrink-0 items-center gap-1">
              <DeviceMcpScopeEditor
                v-if="!isOffline(device)"
                :device-id="device.id"
                :ai-config-id="mid"
                :refresh-key="`${mid}-${device.lifecycle ?? ''}`"
              />
              <span v-else class="text-[9px] text-zinc-400">离线</span>
              <button
                type="button"
                :disabled="busy[device.id]"
                class="rounded border border-rose-200 px-1 py-0.5 text-[9px] text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
                @click="unbindSpecific(device, mid)"
              >解除</button>
            </span>
          </div>
        </div>
        <div v-if="errors[device.id]" class="mt-1 text-[10px] text-rose-500">{{ errors[device.id] }}</div>
      </div>

      <div v-if="isEndpointDevice(device) || isToolboxDevice(device)" class="mt-2 flex gap-1">
        <button
          type="button"
          :disabled="busy[device.id]"
          class="flex-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
          @click="openAssignMember(device)"
        >
          {{ busy[device.id] ? '...' : '分配 AI 成员' }}
        </button>
      </div>
      <div v-else-if="device.capabilities.length" class="mt-2 flex flex-wrap gap-1">
        <span
          v-for="cap in device.capabilities"
          :key="cap"
          class="text-[9px] px-1 py-0.5 rounded bg-zinc-100/60 text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400"
        >
          {{ cap }}
        </span>
      </div>

      <div v-if="device.lastError" class="mt-2 text-[10px] text-rose-500 truncate" :title="device.lastError">
        错误: {{ device.lastError }}
      </div>
      </div> <!-- /relative z-10 content wrapper for avatar bg -->
    </div>

    <RemoteControlModal
      v-if="rcTarget"
      :device-id="rcTarget.deviceId"
      :device-name="rcTarget.name"
      :mode="rcTarget.mode"
      @close="rcTarget = null"
    />

    <!-- Device display customization modal -->
    <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="deviceSettingsTarget"
        class="fixed inset-0 modal-overlay flex items-center justify-center p-4 z-[120]"
        @click="closeDeviceSettings"
      >
        <div class="acrylic-modal rounded-xl border border-zinc-200 dark:border-zinc-700 w-full max-w-[430px] p-4" @click.stop>
          <div class="flex items-center justify-between mb-3">
            <div class="min-w-0">
              <div class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">设备设置</div>
              <div class="mt-0.5 text-[10px] text-zinc-400 truncate">{{ deviceSettingsTarget.name || deviceSettingsTarget.id }}</div>
            </div>
            <button class="text-zinc-400 hover:text-zinc-600" @click="closeDeviceSettings">✕</button>
          </div>

          <label class="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">备注</label>
          <input
            v-model.trim="deviceSettingsDraft.remark"
            maxlength="64"
            class="w-full rounded-lg border border-zinc-200 bg-white/80 px-3 py-2 text-sm outline-none transition-colors focus:border-indigo-300 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-100"
            placeholder="例如：客厅电脑、测试手机、仓库传感器"
          />

          <label class="mt-3 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">AI 用途描述</label>
          <textarea
            v-model.trim="deviceSettingsDraft.aiDescriptionOverride"
            maxlength="240"
            rows="3"
            class="w-full resize-none rounded-lg border border-zinc-200 bg-white/80 px-3 py-2 text-xs outline-none transition-colors focus:border-indigo-300 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-100"
            :placeholder="effectiveAiDescription(deviceSettingsTarget) || '例如：用于操作已登录的内容平台并发布图文'"
          />
          <div class="mt-1 text-[10px] leading-4 text-zinc-400">
            这段说明会作为设备能力元数据提供给 AI，不会替代上面的界面备注。留空时使用设备上报或类型默认说明。
          </div>
          <div v-if="deviceSettingsTarget.reportedAiDescription" class="mt-1 text-[10px] leading-4 text-zinc-400">
            设备上报：{{ deviceSettingsTarget.reportedAiDescription }}
          </div>

          <div class="mt-3 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">图标</div>
          <div class="mt-2 grid grid-cols-5 gap-2">
            <button
              type="button"
              class="h-12 rounded-lg border text-[11px] transition-colors"
              :class="!deviceSettingsDraft.icon ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200' : 'border-zinc-200 bg-white/70 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300 dark:hover:bg-zinc-800'"
              @click="selectDeviceIcon('')"
            >
              默认
            </button>
            <button
              v-for="icon in DEVICE_ICON_PRESETS"
              :key="icon"
              type="button"
              class="h-12 rounded-lg border p-1 transition-colors"
              :class="deviceSettingsDraft.icon === icon ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-500/40 dark:bg-indigo-500/10' : 'border-zinc-200 bg-white/70 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/60 dark:hover:bg-zinc-800'"
              @click="selectDeviceIcon(icon)"
            >
              <img :src="deviceIconUrl(icon)" class="mx-auto h-9 w-9 rounded-md object-contain" alt="" />
            </button>
          </div>

          <label class="mt-3 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">自定义图标 URL</label>
          <input
            v-model.trim="deviceSettingsDraft.icon"
            class="w-full rounded-lg border border-zinc-200 bg-white/80 px-3 py-2 text-xs outline-none transition-colors focus:border-indigo-300 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-100"
            placeholder="/device_png/3.webp 或 https://..."
          />

          <div v-if="errors[deviceSettingsTarget.id]" class="mt-2 text-[10px] text-rose-500">
            {{ errors[deviceSettingsTarget.id] }}
          </div>

          <div class="mt-4 flex justify-end gap-2">
            <button
              type="button"
              class="text-xs px-3 py-1.5 rounded border border-zinc-200 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              @click="closeDeviceSettings"
            >
              取消
            </button>
            <button
              type="button"
              :disabled="busy[deviceSettingsTarget.id]"
              class="text-xs px-3 py-1.5 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20"
              @click="saveDeviceSettings"
            >
              {{ busy[deviceSettingsTarget.id] ? '保存中...' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
    </Teleport>

    <!-- Member selection modal for assign -->
    <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="assignMemberModal"
        class="fixed inset-0 modal-overlay flex items-center justify-center p-4 z-[120]"
        @click="closeAssignMember"
      >
        <div class="acrylic-modal rounded-xl border border-zinc-200 dark:border-zinc-700 w-full max-w-[420px] p-4" @click.stop>
          <div class="flex items-center justify-between mb-3">
            <div class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              分配 AI 成员到 {{ assignMemberModal.name || assignMemberModal.id }}
            </div>
            <button class="text-zinc-400 hover:text-zinc-600" @click="closeAssignMember">✕</button>
          </div>
          <div v-if="assignableMembers.length === 0" class="text-xs text-zinc-500 py-4 text-center">
            暂无可分配成员
          </div>
          <div v-else class="max-h-64 overflow-auto divide-y divide-zinc-100 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
            <button
              v-for="m in assignableMembers"
              :key="m.aiConfigId"
              class="w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 flex justify-between items-center transition-colors"
              @click="toggleAssignDraft(m.aiConfigId)"
            >
              <span class="flex items-center gap-2 font-medium">
                <span
                  class="inline-flex h-4 w-4 items-center justify-center rounded border text-[10px]"
                  :class="assignDraftIds.includes(m.aiConfigId) ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-zinc-300 dark:border-zinc-600'"
                >{{ assignDraftIds.includes(m.aiConfigId) ? '✓' : '' }}</span>
                {{ m.name }}
              </span>
              <span class="text-[10px] text-zinc-500">ID: {{ m.aiConfigId }}</span>
            </button>
          </div>
          <div class="mt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              class="text-xs px-3 py-1 rounded border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300"
              @click="assignDraftIds = []"
            >
              清空选择
            </button>
            <div class="flex gap-2">
            <button
              type="button"
              class="text-xs px-3 py-1 rounded border border-zinc-200 hover:bg-zinc-100 dark:border-zinc-700"
              @click="closeAssignMember"
            >
              取消
            </button>
            <button
              type="button"
              :disabled="busy[assignMemberModal.id]"
              class="text-xs px-3 py-1 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200"
              @click="saveMemberAssignments"
            >
              {{ busy[assignMemberModal.id] ? '保存中...' : `保存（${assignDraftIds.length}）` }}
            </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
    </Teleport>

    <!-- Delete-record confirmation -->
    <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="deleteConfirmTarget"
        class="fixed inset-0 modal-overlay flex items-center justify-center p-4 z-[120]"
        @click="closeDeleteConfirm"
      >
        <div class="acrylic-modal rounded-xl border border-zinc-200 dark:border-zinc-700 w-full max-w-[380px] p-4" @click.stop>
          <div class="flex items-center justify-between mb-3">
            <div class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">删除设备记录</div>
            <button class="text-zinc-400 hover:text-zinc-600" @click="closeDeleteConfirm">✕</button>
          </div>
          <div class="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            确认删除设备「{{ deviceDisplayName(deleteConfirmTarget) }}」的记录？包括已保存的 AI 分配与 MCP 权限范围，删除后需要设备重新连接才会再次出现在列表中。
          </div>
          <div class="mt-3 flex justify-end gap-2">
            <button
              type="button"
              class="text-xs px-3 py-1 rounded border border-zinc-200 hover:bg-zinc-100 dark:border-zinc-700"
              @click="closeDeleteConfirm"
            >
              取消
            </button>
            <button
              type="button"
              class="text-xs px-3 py-1 rounded border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
              @click="confirmDeleteRecord"
            >
              删除
            </button>
          </div>
        </div>
      </div>
    </Transition>
    </Teleport>
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
