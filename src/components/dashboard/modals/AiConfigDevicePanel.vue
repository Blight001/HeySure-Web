<script setup lang="ts">
import { ref, watch } from 'vue'
import { fetchBuiltinDeviceBindings, setBuiltinDeviceBinding, type BuiltinDeviceItem } from '@/api/devices'
import type { ConnectedDevice } from '@/composables/dashboard/useDashboardData'
import DeviceMcpScopeEditor from './DeviceMcpScopeEditor.vue'

const props = defineProps<{
  editingConfigId: number
  boundEndpointAgents: ConnectedDevice[]
  settingsSection: string
}>()

const builtinDevices = ref<BuiltinDeviceItem[]>([])
const builtinDevicesLoading = ref(false)
const builtinDevicesError = ref('')

const loadBuiltinDevices = async () => {
  if (!props.editingConfigId) {
    builtinDevices.value = []
    return
  }
  builtinDevicesLoading.value = true
  builtinDevicesError.value = ''
  try {
    const data = await fetchBuiltinDeviceBindings(props.editingConfigId)
    builtinDevices.value = Array.isArray(data.agents) ? data.agents : []
  } catch (err: any) {
    builtinDevicesError.value = err?.message || '内置设备列表加载失败'
  } finally {
    builtinDevicesLoading.value = false
  }
}

const builtinDeviceOccupiedByOther = (agent: BuiltinDeviceItem) => !agent.bound && !!agent.bound_ai_config_id

const toggleBuiltinDeviceBinding = async (agent: BuiltinDeviceItem, event: Event) => {
  const target = event.target as HTMLInputElement | null
  const next = !!target?.checked
  if (!props.editingConfigId) return
  if (next && !agent.bound && agent.bound_ai_config_id) {
    if (target) target.checked = false
    return
  }
  try {
    await setBuiltinDeviceBinding(props.editingConfigId, agent.device_id, next)
    await loadBuiltinDevices()
  } catch (err: any) {
    builtinDevicesError.value = err?.message || '更新内置设备绑定失败'
    if (target) target.checked = agent.bound
  }
}

watch(() => props.editingConfigId, () => { void loadBuiltinDevices() }, { immediate: true })
</script>

<template>
  <div>
    <div v-if="boundEndpointAgents.length" class="mb-3 space-y-2">
      <div class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">已绑定端侧设备</div>
      <DeviceMcpScopeEditor
        v-for="agent in boundEndpointAgents"
        :key="`ai-config-agent-scope-${agent.id}`"
        :device-id="agent.id"
        :ai-config-id="editingConfigId"
        :refresh-key="`${agent.aiConfigId ?? ''}-${settingsSection}`"
      />
    </div>

    <div
      v-if="editingConfigId"
      class="mb-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 dark:border-indigo-500/30 dark:bg-indigo-500/5"
    >
      <div class="flex items-center justify-between">
        <div class="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">设备绑定</div>
        <button
          class="text-[10px] px-1.5 py-0.5 rounded border border-indigo-200 text-indigo-600 dark:border-indigo-500/40 dark:text-indigo-300"
          @click="loadBuiltinDevices"
        >刷新</button>
      </div>
      <div v-if="builtinDevicesLoading" class="mt-2 text-[11px] text-zinc-400">加载中…</div>
      <div v-else-if="builtinDevicesError" class="mt-2 text-[11px] text-rose-500">{{ builtinDevicesError }}</div>
      <div v-else-if="builtinDevices.length === 0" class="mt-2 text-[11px] text-zinc-400">
        内置设备暂不可用，请刷新重试（正常情况下会自动上线）。
      </div>
      <label
        v-for="agent in builtinDevices"
        :key="`builtin-device-${agent.device_id}`"
        class="mt-2 flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs"
        :class="builtinDeviceOccupiedByOther(agent)
          ? 'border-zinc-200 bg-zinc-100/70 opacity-60 dark:border-zinc-700 dark:bg-zinc-800/50'
          : 'border-zinc-200 bg-white/70 dark:border-zinc-700 dark:bg-zinc-900/50'"
      >
        <span class="flex items-center gap-2 min-w-0">
          <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="agent.online ? 'bg-emerald-500' : 'bg-zinc-400'"></span>
          <span class="truncate text-zinc-700 dark:text-zinc-200">{{ agent.name }}</span>
          <span class="shrink-0 text-[10px] text-zinc-400">
            {{ agent.online ? `${agent.tools.length} 个工具` : '离线' }} ·
            {{ agent.bound ? '已绑定当前 AI' : (agent.bound_ai_config_id ? `已被 ${agent.bound_ai_name} 绑定` : '可绑定') }}
          </span>
        </span>
        <input
          type="checkbox"
          :checked="agent.bound"
          :disabled="builtinDeviceOccupiedByOther(agent)"
          @change="toggleBuiltinDeviceBinding(agent, $event)"
        />
      </label>
    </div>
  </div>
</template>
