<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, reactive, ref, watch } from 'vue'
import type { ConnectedDevice } from '@/composables/dashboard/useDashboardData'
import type { McpRoleMeta } from '@/types'
import { assignDeviceAi, deleteDeviceRecord, updateDeviceDisplay } from '@/api/devices'
import { setWorkshopBinding } from '@/api/workshop'
import DeviceMcpScopeEditor from '../modals/DeviceMcpScopeEditor.vue'
import ToolboxRoleMcpModal from '../modals/ToolboxRoleMcpModal.vue'
import LibraryMcpUnifiedPanel from '@/components/dashboard/panels/LibraryMcpUnifiedPanel.vue'
import AppIcon from '@/components/common/AppIcon.vue'

// 远程画面/终端弹窗依赖 @xterm（约 300KB），懒加载避免拖进作坊面板首屏
const RemoteControlModal = defineAsyncComponent(() => import('@/components/dashboard/RemoteControlModal.vue'))
const RemoteTerminalModal = defineAsyncComponent(() => import('@/components/dashboard/RemoteTerminalModal.vue'))
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
  mcpRoleMeta: McpRoleMeta
  roleMcpPermissions: Record<string, string[]>
  focusedDeviceId?: string
  focusSignal?: number
}

const props = defineProps<Props>()
const panelRootRef = ref<HTMLElement | null>(null)

watch(() => props.focusSignal, async () => {
  if (!props.focusedDeviceId) return
  await nextTick()
  const card = Array.from(panelRootRef.value?.querySelectorAll<HTMLElement>('[data-device-card]') || [])
    .find(item => item.dataset.deviceId === props.focusedDeviceId)
  card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
})

const emit = defineEmits<{
  (e: 'toggle-role-tool', payload: { role: string; tool: string; checked: boolean }): void
  (e: 'save-role-mcp-permissions'): void
}>()

// The toolbox tool set (12 tools): used to scope the role-permission editor so
// it only shows tools that actually belong to the toolbox.
const toolboxToolNames = computed<string[]>(() => {
  const tb = (props.devices || []).find(device => isToolboxDevice(device))
  return Array.isArray(tb?.capabilities) ? tb!.capabilities : []
})

// Map a bound AI member to its role tier (mirrors backend config_role_tier).
const ROLE_MEMBER = 'digital_member_member'
const ROLE_MANAGER = 'digital_member_manager'
const ROLE_ASSISTANT_ADMIN = 'assistant_admin'
const tierForAgent = (agent?: Agent): string => {
  if (!agent) return ROLE_MEMBER
  if (agent.aiRole === 'assistant_admin') return ROLE_ASSISTANT_ADMIN
  return agent.digitalMemberRole === 'manager' ? ROLE_MANAGER : ROLE_MEMBER
}

// Per-AI role permission editor: opened from the bound-AI list in the toolbox card.
const roleEditor = ref<{ role: string; aiName: string } | null>(null)
const openRoleEditor = (aiConfigId: number) => {
  const agent = memberByConfigId.value.get(aiConfigId)
  roleEditor.value = {
    role: tierForAgent(agent),
    aiName: agent?.name || `AI-${aiConfigId}`,
  }
}

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
const openAssignMember = (device: ConnectedDevice) => {
  assignMemberModal.value = device
}
const closeAssignMember = () => {
  assignMemberModal.value = null
}

const busy = reactive<Record<string, boolean>>({})
const errors = reactive<Record<string, string>>({})
const bindingOverride = reactive<Record<string, number | null>>({})
const governanceToolsOverride = reactive<Record<number, string[]>>({})
const displayRemarkOverride = reactive<Record<string, string>>({})
const displayIconOverride = reactive<Record<string, string>>({})
const displayIconSettingOverride = reactive<Record<string, string>>({})

const DEVICE_ICON_PRESETS = Array.from({ length: 8 }, (_, index) => `/device_png/${index + 1}.webp`)
const DEVICE_ICON_CACHE_BUST = Date.now().toString(36)

const deviceIconUrl = (url: string) => {
  if (!url.startsWith('/device_png/')) return url
  return `${url}${url.includes('?') ? '&' : '?'}v=${DEVICE_ICON_CACHE_BUST}`
}

const parseMcpTools = (raw?: string): string[] => {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed)
      ? parsed.map(item => String(item || '').trim()).filter(Boolean)
      : []
  } catch {
    return []
  }
}

const governanceToolsForDevice = (device: ConnectedDevice): string[] => {
  const cfgId = linkedConfigId(device)
  if (!cfgId) return []
  if (Array.isArray(governanceToolsOverride[cfgId])) return governanceToolsOverride[cfgId]
  return parseMcpTools(linkedMember(device)?.mcpTools)
}

const onGovernanceSaved = (device: ConnectedDevice, tools: string[]) => {
  const cfgId = linkedConfigId(device)
  if (!cfgId) return
  governanceToolsOverride[cfgId] = [...tools]
}

const linkedConfigId = (device: ConnectedDevice): number | null => {
  if (device.id in bindingOverride) return bindingOverride[device.id]
  const id = Number(device.aiConfigId)
  return Number.isFinite(id) && id > 0 ? id : null
}

// For multi-bind devices (toolbox), return all bound AI config ids (from server boundAiConfigIds or fallback to single)
const linkedConfigIds = (device: ConnectedDevice): number[] => {
  if (isToolboxDevice(device)) {
    const ids = Array.isArray(device.boundAiConfigIds)
      ? device.boundAiConfigIds.filter((n) => Number.isFinite(n) && n > 0)
      : []
    const single = linkedConfigId(device)
    if (single && !ids.includes(single)) ids.push(single)
    return Array.from(new Set(ids))
  }
  const single = linkedConfigId(device)
  return single ? [single] : []
}



const assign = async (device: ConnectedDevice, cfgId: number | null) => {
  busy[device.id] = true
  errors[device.id] = ''
  try {
    if (isWorkshopDevice(device)) {
      const currentId = linkedConfigId(device)
      if (cfgId) {
        await setWorkshopBinding(cfgId, device.id, true)
      } else if (currentId) {
        await setWorkshopBinding(currentId, device.id, false)
      }
      bindingOverride[device.id] = cfgId
    } else {
      // The server broadcasts an updated device:list, so the card refreshes itself.
      await assignDeviceAi(device.id, cfgId)
    }
  } catch (err: any) {
    errors[device.id] = err?.message || '分配失败'
  } finally {
    busy[device.id] = false
  }
}

// Specific unbind for multi-bind toolbox: unbind only the given AI id from the toolbox
const unbindSpecific = async (device: ConnectedDevice, aiConfigId: number) => {
  if (!isToolboxDevice(device)) return
  busy[device.id] = true
  errors[device.id] = ''
  try {
    await setWorkshopBinding(aiConfigId, device.id, false)
    // refresh local override / let socket update
    // remove from any local override if matches
    if (bindingOverride[device.id] === aiConfigId) delete bindingOverride[device.id]
    // force reload devices to see updated bound list
    // (socket device:list will refresh, or we can call load)
  } catch (err: any) {
    errors[device.id] = err?.message || '解除绑定失败'
  } finally {
    busy[device.id] = false
  }
}

const selectMemberAndAssign = async (aiConfigId: number | null) => {
  const device = assignMemberModal.value
  if (!device) return
  closeAssignMember()
  await assign(device, aiConfigId)
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
const deviceSettingsDraft = reactive({ remark: '', icon: '' })
const openDeviceSettings = (device: ConnectedDevice) => {
  deviceSettingsTarget.value = device
  deviceSettingsDraft.remark = displayRemark(device)
  deviceSettingsDraft.icon = device.id in displayIconSettingOverride
    ? displayIconSettingOverride[device.id]
    : device.iconOverride ?? device.icon ?? ''
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
    })
    displayRemarkOverride[device.id] = data.remark || ''
    displayIconOverride[device.id] = data.icon || ''
    displayIconSettingOverride[device.id] = data.iconOverride || ''
    closeDeviceSettings()
  } catch (err: any) {
    errors[device.id] = err?.message || '显示设置保存失败'
  } finally {
    busy[device.id] = false
  }
}

// 内置工具箱作坊：多绑，现在在作坊面板支持分配绑定 + MCP 范围勾选（像其他设备一样）。
const isToolboxDevice = (device: ConnectedDevice) => String(device.id || '').startsWith('toolbox_builtin_')

const deviceTypeLabel = (device: ConnectedDevice) => {
  if (isToolboxDevice(device)) return '工具箱'
  if (isWorkshopDevice(device)) return '图书馆'
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
const isWorkshopDevice = (device: ConnectedDevice) => {
  if (device.deviceType) return device.deviceType === 'workshop'
  const platform = String(device.platform || '').toLowerCase()
  return platform.includes('workshop')
}

const canCustomizeDevice = (device: ConnectedDevice) => !isToolboxDevice(device) && !isWorkshopDevice(device)

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

// 命令行远程（PTY）：仅桌面端。走服务器 rt:* relay，与画面远程一样凭
// remote_terminal 能力放行；旧客户端会在会话里返回明确错误。
const rtTarget = ref<{ deviceId: string; name: string } | null>(null)
const canRemoteTerminal = (device: ConnectedDevice) => isSoftwareDevice(device)
const openRemoteTerminal = (device: ConnectedDevice) => {
  rtTarget.value = { deviceId: device.id, name: deviceDisplayName(device) }
}

const isEndpointDevice = (device: ConnectedDevice) => {
  const platform = String(device.platform || '').toLowerCase()
  return isSoftwareDevice(device) || isAndroidDevice(device) || !!device.isBrowserExtension || platform.includes('browser') || isWorkshopDevice(device) || isCustomDevice(device)
}

const displayRemark = (device: ConnectedDevice) => {
  if (device.id in displayRemarkOverride) return displayRemarkOverride[device.id]
  return String(device.remark || '').trim()
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

const hasLinkedMember = (device: ConnectedDevice) => !!linkedMember(device)

// For toolbox treat as "linked" if has any bound
const hasAnyLinked = (device: ConnectedDevice) => isToolboxDevice(device) ? linkedConfigIds(device).length > 0 : hasLinkedMember(device)

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
  // 仅单AI绑定设备（非工具箱等）显示头像背景
  if (isToolboxDevice(device) || !hasLinkedMember(device)) return ''
  const member = linkedMember(device)
  return resolveAiAvatarUrl(member?.avatar) || ''
}
</script>

<template>
  <div ref="panelRootRef" class="relative flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
    <div v-if="devices.length === 0" class="text-center text-zinc-400 text-xs py-10 dark:text-zinc-500">
      暂无已连接设备。
    </div>

    <div
      v-for="device in devices"
      :key="device.id"
      data-device-card
      :data-device-id="device.id"
      class="relative rounded-xl border p-3 transition-[transform,box-shadow,border-color] duration-300"
      :class="[
        deviceCardClass(device),
        device.id === focusedDeviceId ? 'z-20 scale-[1.045] !border-indigo-400 ring-2 ring-indigo-300/70 shadow-2xl shadow-indigo-500/25 dark:!border-indigo-400 dark:ring-indigo-500/50' : '',
      ]"
    >
      <!-- 单AI绑定设备的AI头像作为背景填充（作坊设备卡片）：85% 透明 + 虚化处理（与数字生命一致） -->
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
            v-if="isOffline(device) && !isToolboxDevice(device) && !isWorkshopDevice(device)"
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
        <button
          v-if="canRemoteTerminal(device) && !isOffline(device)"
          type="button"
          class="flex-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
          @click="openRemoteTerminal(device)"
        >
          <AppIcon name="terminal" class="w-3.5 h-3.5" /> 命令行
        </button>
      </div>

      <div v-if="isToolboxDevice(device) || (hasLinkedMember(device) && linkedMember(device)?.status === 'learning')" class="mt-2 rounded-lg border p-2" :class="memberPanelClass(device)">

        <!-- Multi-bind display for toolbox: list all bound AIs with individual unbind -->
        <div v-if="isToolboxDevice(device) && linkedConfigIds(device).length > 0" class="mb-2">
          <div class="text-[9px] mb-0.5 text-zinc-500">已绑定 AI（这些 AI 的对话 prompt 中会出现 工具箱 MCP）：</div>
          <div v-for="mid in linkedConfigIds(device)" :key="mid" class="flex justify-between items-center gap-1 text-[10px] bg-zinc-50/60 dark:bg-zinc-800/60 px-1 py-0.5 rounded mb-0.5">
            <span class="min-w-0 truncate">{{ assignableMembers.find((m: any) => Number(m.aiConfigId) === mid)?.name || 'AI-' + mid }} (ID: {{ mid }})</span>
            <span class="shrink-0 flex items-center gap-1">
              <button
                class="text-[9px] px-1 py-0 rounded border border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-500/30 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                @click="openRoleEditor(mid)"
              >权限</button>
              <button
                :disabled="busy[device.id]"
                class="text-[9px] px-1 py-0 rounded border hover:bg-rose-50"
                @click="unbindSpecific(device, mid)"
              >解除</button>
            </span>
          </div>
        </div>
        <div v-else-if="isToolboxDevice(device)" class="text-[10px] text-amber-600 mb-1">暂无 AI 绑定工具箱。</div>

        <!-- Single display for other devices: only 学习中 when applicable (no name, no ID, no 等待指令) -->
        <div v-if="!isToolboxDevice(device) && hasLinkedMember(device) && linkedMember(device)?.status === 'learning'" class="mt-0.5 text-[10px] leading-tight">
          <span class="shrink-0 rounded px-1 py-0.5 text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
            学习中
          </span>
        </div>

        <div v-if="errors[device.id]" class="mt-1 text-[10px] text-rose-500">{{ errors[device.id] }}</div>
      </div>

      <!-- 分配AI成员 左侧 of 配置MCP权限范围 -->
      <div v-if="isWorkshopDevice(device) && !isToolboxDevice(device) && device.libraryMcpCatalog || isToolboxDevice(device) || (isEndpointDevice(device) && !isWorkshopDevice(device))" class="mt-2 flex gap-1">
        <button
          type="button"
          :disabled="busy[device.id]"
          class="flex-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
          @click="openAssignMember(device)"
        >
          {{ busy[device.id] ? '...' : '分配AI成员' }}
        </button>
        <LibraryMcpUnifiedPanel
          v-if="isWorkshopDevice(device) && !isToolboxDevice(device) && device.libraryMcpCatalog"
          class="flex-1"
          :catalog="device.libraryMcpCatalog"
          mode="workshop"
          :workshop-device-id="device.id"
          :bound-ai-config-id="linkedConfigId(device)"
          :bound-ai-name="linkedMember(device)?.name || ''"
          :governance-mcp-tools="governanceToolsForDevice(device)"
          @governance-saved="tools => onGovernanceSaved(device, tools)"
        />
        <DeviceMcpScopeEditor
          v-else-if="(isToolboxDevice(device) || (isEndpointDevice(device) && !isWorkshopDevice(device))) && !isOffline(device)"
          class="flex-1"
          :device-id="device.id"
          :refresh-key="`${(isToolboxDevice(device) ? (linkedConfigIds(device).join(',') || 'multi') : (device.aiConfigId ?? ''))}-${device.lifecycle ?? ''}`"
        />
        <div
          v-else-if="isOffline(device) && (isToolboxDevice(device) || (isEndpointDevice(device) && !isWorkshopDevice(device)))"
          class="flex-1 flex items-center justify-center px-1 text-[10px] text-zinc-400 dark:text-zinc-500"
        >
          已离线，无法获取MCP
        </div>
      </div>
      <div v-else-if="device.capabilities.length && !(isWorkshopDevice(device) && device.libraryMcpCatalog)" class="mt-2 flex flex-wrap gap-1">
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

    <RemoteTerminalModal
      v-if="rtTarget"
      :device-id="rtTarget.deviceId"
      :device-name="rtTarget.name"
      @close="rtTarget = null"
    />

    <ToolboxRoleMcpModal
      :show="!!roleEditor"
      :role="roleEditor?.role || ''"
      :ai-name="roleEditor?.aiName || ''"
      :mcp-role-meta="mcpRoleMeta"
      :role-mcp-permissions="roleMcpPermissions"
      :toolbox-tools="toolboxToolNames"
      @toggle-role-tool="emit('toggle-role-tool', $event)"
      @save="emit('save-role-mcp-permissions')"
      @close="roleEditor = null"
    />

    <!-- Device display customization modal -->
    <Transition name="fade">
      <div
        v-if="deviceSettingsTarget"
        class="absolute inset-0 modal-overlay flex items-center justify-center p-4 z-50"
        @click="closeDeviceSettings"
      >
        <div class="acrylic-modal rounded-xl border border-zinc-200 dark:border-zinc-700 w-full max-w-[430px] p-4" @click.stop>
          <div class="flex items-center justify-between mb-3">
            <div class="min-w-0">
              <div class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">设备显示设置</div>
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

    <!-- Member selection modal for assign (contained within workshop column) -->
    <Transition name="fade">
      <div
        v-if="assignMemberModal"
        class="absolute inset-0 modal-overlay flex items-center justify-center p-4 z-50"
        @click="closeAssignMember"
      >
        <div class="acrylic-modal rounded-xl border border-zinc-200 dark:border-zinc-700 w-full max-w-[420px] p-4" @click.stop>
          <div class="flex items-center justify-between mb-3">
            <div class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              选择成员分配到 {{ assignMemberModal.name || assignMemberModal.id }}
            </div>
            <button class="text-zinc-400 hover:text-zinc-600" @click="closeAssignMember">✕</button>
          </div>
          <div v-if="assignableMembers.length === 0" class="text-xs text-zinc-500 py-4 text-center">
            暂无可分配成员
          </div>
          <div v-else class="max-h-64 overflow-auto divide-y divide-zinc-100 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
            <button
              class="w-full text-left px-3 py-2 text-sm hover:bg-rose-50 dark:hover:bg-rose-950/30 flex justify-between items-center transition-colors text-rose-600"
              @click="selectMemberAndAssign(null)"
            >
              <span class="font-medium">不分配成员</span>
            </button>
            <button
              v-for="m in assignableMembers"
              :key="m.aiConfigId"
              class="w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 flex justify-between items-center transition-colors"
              @click="selectMemberAndAssign(m.aiConfigId)"
            >
              <span class="font-medium">{{ m.name }}</span>
              <span class="text-[10px] text-zinc-500">ID: {{ m.aiConfigId }}</span>
            </button>
          </div>
          <div class="mt-2 flex justify-end">
            <button
              type="button"
              class="text-xs px-3 py-1 rounded border border-zinc-200 hover:bg-zinc-100 dark:border-zinc-700"
              @click="closeAssignMember"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Delete-record confirmation, scoped to the workshop panel like the assign modal above -->
    <Transition name="fade">
      <div
        v-if="deleteConfirmTarget"
        class="absolute inset-0 modal-overlay flex items-center justify-center p-4 z-50"
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
