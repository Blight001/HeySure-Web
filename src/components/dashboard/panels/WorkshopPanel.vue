<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { ConnectedDevice } from '@/composables/dashboard/useDashboardData'
import type { McpRoleMeta } from '@/types'
import { assignDeviceAi } from '@/api/devices'
import { setWorkshopBinding } from '@/api/workshop'
import DeviceMcpScopeEditor from '../modals/DeviceMcpScopeEditor.vue'
import ToolboxRoleMcpModal from '../modals/ToolboxRoleMcpModal.vue'
import LibraryMcpUnifiedPanel from '@/components/dashboard/panels/LibraryMcpUnifiedPanel.vue'
import RemoteControlModal from '@/components/dashboard/RemoteControlModal.vue'
import AppIcon from '@/components/common/AppIcon.vue'
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
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'toggle-role-tool', payload: { role: string; tool: string; checked: boolean }): void
  (e: 'save-role-mcp-permissions'): void
  (e: 'manage-device-tools', payload?: { deviceType?: string }): void
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

// 内置工具箱作坊：多绑，现在在作坊面板支持分配绑定 + MCP 范围勾选（像其他设备一样）。
const isToolboxDevice = (device: ConnectedDevice) => String(device.id || '').startsWith('toolbox_builtin_')

const deviceTypeLabel = (device: ConnectedDevice) => {
  const platform = String(device.platform || '').toLowerCase()
  if (isToolboxDevice(device)) return '工具箱'
  if (isWorkshopDevice(device)) return '图书馆'
  if (isAndroidDevice(device)) return '安卓端'
  if (device.isBrowserExtension || platform.includes('browser')) return '浏览器插件'
  if (device.isWindowsDesktop || platform.includes('desktop') || platform.includes('windows')) return '软件端'
  return '设备端'
}

// 内置图书馆使用专用绑定接口，但在本面板保持与其它设备一致的交互。
const isWorkshopDevice = (device: ConnectedDevice) => {
  const platform = String(device.platform || '').toLowerCase()
  return platform.includes('workshop')
}

const isSoftwareDevice = (device: ConnectedDevice) => {
  const platform = String(device.platform || '').toLowerCase()
  return !!device.isWindowsDesktop || platform.includes('desktop') || platform.includes('windows')
}

const isAndroidDevice = (device: ConnectedDevice) => {
  const platform = String(device.platform || '').toLowerCase()
  return !!device.isAndroid || platform.includes('android')
}

// Live remote control is available for desktop + android endpoints. The device
// advertises the ``remote_control`` capability once its client supports it; we
// still show the button for those device types and let the session surface a
// clear error if an older client hasn't been updated yet.
const rcTarget = ref<{ deviceId: string; name: string; mode: 'android' | 'desktop' | 'browser' } | null>(null)

const isBrowserDevice = (device: ConnectedDevice) => {
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
  return isSoftwareDevice(device) || isAndroidDevice(device) || !!device.isBrowserExtension || platform.includes('browser') || isWorkshopDevice(device)
}

const getDynamicMcpType = (device: ConnectedDevice): 'desktop' | 'browser' | 'android' | null => {
  if (isAndroidDevice(device)) return 'android'
  if (isBrowserDevice(device)) return 'browser'
  if (isSoftwareDevice(device)) return 'desktop'
  return null
}

const openDynamicMcp = (device: ConnectedDevice) => {
  const dt = getDynamicMcpType(device)
  if (dt) {
    emit('manage-device-tools', { deviceType: dt })
  } else {
    emit('manage-device-tools')
  }
}

const deviceDisplayName = (device: ConnectedDevice) => {
  return device.name || device.id || deviceTypeLabel(device)
}

const lifecycleLabel = (lifecycle?: string) => {
  switch (lifecycle) {
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
  const baseBorder = linked
    ? 'border-emerald-200 dark:border-emerald-500/30'
    : 'border-amber-200 dark:border-amber-500/30'
  if (hasAvatar) {
    // 头像背景时，使用透明底让头像显示；保留边框色调
    return baseBorder + ' bg-transparent dark:bg-transparent'
  }
  return baseBorder + (linked
    ? ' bg-emerald-50/60 dark:bg-emerald-500/10'
    : ' bg-amber-50/60 dark:bg-amber-500/10')
}

const memberLabelClass = (device: ConnectedDevice) => hasAnyLinked(device)
  ? 'text-emerald-600 dark:text-emerald-300'
  : 'text-amber-600 dark:text-amber-300'

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
  <div class="relative flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
    <div v-if="devices.length === 0" class="text-center text-zinc-400 text-xs py-10 dark:text-zinc-500">
      暂无已连接设备。
    </div>

    <div
      v-for="device in devices"
      :key="device.id"
      class="relative rounded-xl border p-3"
      :class="deviceCardClass(device)"
    >
      <!-- 单AI绑定设备的AI头像作为90%透明背景填充（类似数字生命卡片） -->
      <div 
        v-if="deviceAvatarUrl(device)"
        class="absolute inset-0 rounded-xl overflow-hidden pointer-events-none z-0"
        :style="{ opacity: '0.1' }"
      >
        <img :src="deviceAvatarUrl(device)" class="w-full h-full object-cover select-none" alt="" />
      </div>

      <div class="relative z-10">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="inline-block w-2 h-2 rounded-full shrink-0" :class="lifecycleClass(device.lifecycle)"></span>
            <h4 class="text-sm font-bold text-zinc-700 dark:text-zinc-200 truncate">{{ deviceDisplayName(device) }}</h4>
          </div>
          <div class="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
            {{ deviceTypeLabel(device) }} · {{ device.platform || 'unknown' }}
          </div>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <span class="shrink-0 text-[9px] px-1 py-0.5 rounded border font-medium" :class="memberStatusBadgeClass(device)">
            {{ memberStatusLabel(device) }}
          </span>
          <span class="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-zinc-100/60 text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-300">
            {{ lifecycleLabel(device.lifecycle) }}
          </span>
        </div>
      </div>

      <!-- 远程控制 + 动态MCP管理 同行显示 -->
      <div class="mt-2 flex gap-1">
        <button
          v-if="canRemoteControl(device)"
          type="button"
          class="flex-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700 transition-colors hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
          @click="openRemoteControl(device)"
        >
          <AppIcon name="monitor" class="w-3.5 h-3.5" /> {{ isAndroidDevice(device) ? '远程控制' : isBrowserDevice(device) ? '浏览器控制' : '桌面控制' }}
        </button>
        <button
          v-if="getDynamicMcpType(device)"
          type="button"
          class="flex-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-700 transition-colors hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20"
          @click="openDynamicMcp(device)"
        >
          动态 MCP 管理
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
          v-else-if="isToolboxDevice(device) || (isEndpointDevice(device) && !isWorkshopDevice(device))"
          class="flex-1"
          :device-id="device.id"
          :refresh-key="`${(isToolboxDevice(device) ? (linkedConfigIds(device).join(',') || 'multi') : (device.aiConfigId ?? ''))}-${device.lifecycle ?? ''}`"
        />
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

    <!-- Member selection modal for assign (contained within workshop column) -->
    <Transition name="fade">
      <div
        v-if="assignMemberModal"
        class="absolute inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
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
