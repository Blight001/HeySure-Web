<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { formatDateTime } from '@/utils/datetime'
import {
  listDeviceTools,
  upsertDeviceTool,
  toggleDeviceTool,
  setDeviceToolStatus,
  deleteDeviceTool,
  listDeviceToolVersions,
  restoreDeviceToolVersion,
  listDeviceToolStats,
  listDeviceToolFailures,
  getPermissionPolicy,
  setPermissionPolicy,
  type PermissionDecision,
  type DeviceToolType,
  type DeviceDynamicTool,
  type DeviceToolVersion,
  type DeviceToolStat,
  type DeviceToolFailure,
} from '@/api/deviceTools'
import { usePopupZIndex } from '@/composables/usePopupZIndex'
import { useMessage } from '@/composables/useMessage'
import {
  applyDesktopKindChange,
  blankStep,
  buildDraftDefinition,
  createBlankDraft,
  draftBuildMode,
  TABS,
  toolToDraft,
  type Draft,
} from './deviceTools/deviceToolDraft'
import DeviceToolList from './deviceTools/DeviceToolList.vue'
import DeviceToolEditor from './deviceTools/DeviceToolEditor.vue'

const props = defineProps<{ show: boolean; initialDeviceType?: DeviceToolType }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const zIndex = usePopupZIndex(() => props.show)
const { confirm } = useMessage()

const deviceType = ref<DeviceToolType>('desktop')
const tools = ref<DeviceDynamicTool[]>([])
const availableTools = ref<{ name: string; description: string }[]>([])
const statsByTool = ref<Record<string, DeviceToolStat>>({})
const listQuery = ref('')
const filteredTools = computed(() => {
  const q = listQuery.value.trim().toLowerCase()
  if (!q) return tools.value
  return tools.value.filter(t =>
    [t.name, t.description].some(s => String(s || '').toLowerCase().includes(q)),
  )
})
const loading = ref(false)
const error = ref('')
const notice = ref('')
const draft = ref<Draft | null>(null)
const saving = ref(false)
const versions = ref<DeviceToolVersion[]>([])
const versionsOpen = ref(false)
const versionsLoading = ref(false)
const failures = ref<DeviceToolFailure[]>([])
const failuresOpen = ref(false)
const failuresLoading = ref(false)
const policyOpen = ref(false)
const policyTags = ref<string[]>([])
const policy = ref<Record<string, PermissionDecision | ''>>({})
const policySaving = ref(false)

const isDesktop = computed(() => deviceType.value === 'desktop')
const isJsMode = computed(() => isDesktop.value && draft.value?.desktopKind === 'js')
const isRuntimeMode = computed(() => isDesktop.value && draft.value != null && draft.value.desktopKind !== 'js')
const currentTabLabel = computed(() => TABS.find(t => t.key === deviceType.value)?.label || '')
const fmtTime = (ts: number) => formatDateTime(ts, '--')

const resetEditorExtras = () => {
  versions.value = []
  versionsOpen.value = false
  failures.value = []
  failuresOpen.value = false
  notice.value = ''
  error.value = ''
}

const load = async () => {
  if (!props.show) return
  loading.value = true
  error.value = ''
  try {
    const data = await listDeviceTools(deviceType.value)
    tools.value = data.tools || []
    availableTools.value = data.availableTools || []
    try {
      const s = await listDeviceToolStats(deviceType.value)
      statsByTool.value = Object.fromEntries((s.stats || []).map(st => [st.tool, st]))
    } catch {
      statsByTool.value = {}
    }
  } catch (err: any) {
    error.value = err?.message || '加载失败'
  } finally {
    loading.value = false
  }
}

const loadFailures = async () => {
  if (!draft.value?.original) { failures.value = []; return }
  failuresLoading.value = true
  try {
    const data = await listDeviceToolFailures(draft.value.original)
    failures.value = data.failures || []
  } catch (err: any) {
    error.value = err?.message || '失败记录加载失败'
  } finally {
    failuresLoading.value = false
  }
}

const toggleFailures = () => {
  failuresOpen.value = !failuresOpen.value
  if (failuresOpen.value && !failures.value.length) loadFailures()
}

const loadPolicy = async () => {
  if (deviceType.value !== 'desktop') return
  try {
    const data = await getPermissionPolicy('desktop')
    policyTags.value = data.knownTags || []
    const next: Record<string, PermissionDecision | ''> = {}
    for (const t of policyTags.value) next[t] = (data.policy && data.policy[t]) || ''
    policy.value = next
  } catch { /* policy is optional; stay silent */ }
}

const togglePolicy = () => {
  policyOpen.value = !policyOpen.value
  if (policyOpen.value && !policyTags.value.length) loadPolicy()
}

const savePolicy = async () => {
  policySaving.value = true
  error.value = ''
  notice.value = ''
  try {
    const out: Record<string, PermissionDecision> = {}
    for (const [tag, dec] of Object.entries(policy.value)) if (dec) out[tag] = dec as PermissionDecision
    const res = await setPermissionPolicy('desktop', out)
    notice.value = `权限策略已保存，已推送到 ${res.pushedToDevices} 台在线设备`
  } catch (err: any) {
    error.value = err?.message || '保存权限策略失败'
  } finally {
    policySaving.value = false
  }
}

watch(() => props.show, value => {
  if (value) {
    draft.value = null
    notice.value = ''
    if (props.initialDeviceType && ['desktop', 'browser', 'android'].includes(props.initialDeviceType)) {
      deviceType.value = props.initialDeviceType
    }
    load()
  }
}, { immediate: true })
watch(deviceType, () => { draft.value = null; notice.value = ''; load() })

const newTool = () => {
  draft.value = createBlankDraft(isDesktop.value)
  resetEditorExtras()
}

const editTool = (tool: DeviceDynamicTool) => {
  draft.value = toolToDraft(tool, isDesktop.value)
  resetEditorExtras()
}

const save = async () => {
  if (!draft.value) return
  const result = buildDraftDefinition(draft.value, draftBuildMode(isJsMode.value, isRuntimeMode.value))
  if (result.error || !result.definition) {
    error.value = result.error || '保存失败'
    return
  }
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    const res = await upsertDeviceTool(deviceType.value, result.definition)
    notice.value = `已保存，已推送到 ${res.pushedToDevices} 台在线设备`
    draft.value = null
    await load()
  } catch (err: any) {
    error.value = err?.message || '保存失败'
  } finally {
    saving.value = false
  }
}

const toggle = async (tool: DeviceDynamicTool) => {
  try {
    await toggleDeviceTool(deviceType.value, tool.name, !tool.enabled)
    await load()
  } catch (err: any) {
    error.value = err?.message || '切换失败'
  }
}

const approve = async (tool: DeviceDynamicTool) => {
  error.value = ''
  notice.value = ''
  try {
    const res = await setDeviceToolStatus(deviceType.value, tool.name, 'active')
    notice.value = `已批准 ${tool.name}，已下发到 ${res.pushedToDevices} 台在线设备`
    await load()
  } catch (err: any) {
    error.value = err?.message || '批准失败'
  }
}

const remove = async (tool: DeviceDynamicTool) => {
  if (!(await confirm({ message: `删除动态工具 ${tool.name}？设备将恢复内置实现。`, type: 'warning' }))) return
  try {
    await deleteDeviceTool(deviceType.value, tool.name)
    if (draft.value?.original === tool.name) draft.value = null
    await load()
  } catch (err: any) {
    error.value = err?.message || '删除失败'
  }
}

const loadVersions = async () => {
  if (!draft.value?.original) { versions.value = []; return }
  versionsLoading.value = true
  try {
    const data = await listDeviceToolVersions(deviceType.value, draft.value.original)
    versions.value = data.versions || []
  } catch (err: any) {
    error.value = err?.message || '历史版本加载失败'
  } finally {
    versionsLoading.value = false
  }
}

const toggleVersions = () => {
  versionsOpen.value = !versionsOpen.value
  if (versionsOpen.value && !versions.value.length) loadVersions()
}

const restore = async (versionId: number) => {
  if (!(await confirm({ message: '回滚到该版本？当前内容会被覆盖（并记录为一次新版本，可再回滚）。', type: 'warning' }))) return
  error.value = ''
  notice.value = ''
  try {
    const res = await restoreDeviceToolVersion(deviceType.value, versionId)
    notice.value = `已回滚，已推送到 ${res.pushedToDevices} 台在线设备`
    draft.value = null
    versionsOpen.value = false
    await load()
  } catch (err: any) {
    error.value = err?.message || '回滚失败'
  }
}

const addStep = () => draft.value?.steps.push(blankStep())
const removeStep = (i: number) => draft.value?.steps.splice(i, 1)
const moveStep = (i: number, delta: number) => {
  const steps = draft.value?.steps
  if (!steps) return
  const j = i + delta
  if (j < 0 || j >= steps.length) return
  const [s] = steps.splice(i, 1)
  steps.splice(j, 0, s)
}
const addArg = (stepIndex: number) => draft.value?.steps[stepIndex]?.args.push({ key: '', value: '' })
const removeArg = (stepIndex: number, argIndex: number) => draft.value?.steps[stepIndex]?.args.splice(argIndex, 1)
const addParam = () => draft.value?.params.push({ name: '', type: 'string', description: '', required: false })
const removeParam = (i: number) => draft.value?.params.splice(i, 1)
const onDesktopKindChange = () => {
  if (draft.value) applyDesktopKindChange(draft.value)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="props.show" :style="{ zIndex }" class="fixed inset-0 modal-overlay flex items-center justify-center p-4" @click="emit('close')">
      <div class="acrylic-modal rounded-xl border border-zinc-200 dark:border-zinc-700 w-full max-w-[680px] max-h-[82vh] p-4 overflow-auto" @click.stop>
        <div class="mb-3 flex items-center justify-between gap-2">
          <div class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">设备动态 MCP 工具（网页管理 · 自动下发）</div>
          <button type="button" class="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200" @click="emit('close')">✕</button>
        </div>

        <div class="mb-3 flex gap-1">
          <button
            v-for="tab in TABS"
            :key="tab.key"
            type="button"
            class="rounded-lg px-3 py-1 text-xs font-medium border"
            :class="deviceType === tab.key
              ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
              : 'border-zinc-200 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800'"
            @click="deviceType = tab.key"
          >{{ tab.label }}</button>
        </div>

        <div v-if="notice" class="mb-3 text-xs text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 rounded-lg px-3 py-2">{{ notice }}</div>
        <div v-if="error" class="mb-3 text-xs text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900 rounded-lg px-3 py-2">{{ error }}</div>

        <DeviceToolList
          v-if="!draft"
          v-model:list-query="listQuery"
          :loading="loading"
          :tools="tools"
          :filtered-tools="filteredTools"
          :stats-by-tool="statsByTool"
          :current-tab-label="currentTabLabel"
          :device-type="deviceType"
          :policy-open="policyOpen"
          :policy-tags="policyTags"
          :policy="policy"
          :policy-saving="policySaving"
          @create="newTool"
          @edit="editTool"
          @remove="remove"
          @toggle="toggle"
          @approve="approve"
          @toggle-policy="togglePolicy"
          @save-policy="savePolicy"
        />

        <DeviceToolEditor
          v-else
          :draft="draft"
          :is-desktop="isDesktop"
          :is-js-mode="isJsMode"
          :is-runtime-mode="isRuntimeMode"
          :available-tools="availableTools"
          :saving="saving"
          :versions-open="versionsOpen"
          :versions-loading="versionsLoading"
          :versions="versions"
          :failures-open="failuresOpen"
          :failures-loading="failuresLoading"
          :failures="failures"
          :stats-by-tool="statsByTool"
          :fmt-time="fmtTime"
          @cancel="draft = null"
          @save="save"
          @add-param="addParam"
          @remove-param="removeParam"
          @desktop-kind="onDesktopKindChange"
          @add-step="addStep"
          @remove-step="removeStep"
          @move-step="moveStep"
          @add-arg="addArg"
          @remove-arg="removeArg"
          @toggle-versions="toggleVersions"
          @restore="restore"
          @toggle-failures="toggleFailures"
        />
      </div>
      </div>
    </Transition>
  </Teleport>
</template>
