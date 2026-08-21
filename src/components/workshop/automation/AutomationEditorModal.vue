<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  getWorkflowCardVersion,
  type WorkflowCard,
  type WorkflowCardVersion,
  type WorkflowDefinition,
  type WorkflowStepType,
} from '@/api/workflowCards'
import type { DeviceMcpScope } from '@/api/devices'
import { useMessage } from '@/composables/useMessage'
import { usePopupZIndex } from '@/composables/usePopupZIndex'
import { useSnapshotHistory } from '@/composables/useSnapshotHistory'
import WorkflowCanvasEditor from './WorkflowCanvasEditor.vue'
import AutomationEditorSettings from './AutomationEditorSettings.vue'
import AutomationStepInspector from './AutomationStepInspector.vue'
import AutomationVersionCompare from './AutomationVersionCompare.vue'
import { blankEditorDraft, createBlankEditorSteps, useAutomationCardNavigation, useAutomationCardSettings } from './automationEditorApply'
import {
  applyBranchTarget,
  clearStepTarget,
  createClipboard,
  incomingTargets,
  pasteClipboardStep,
  resolveEditorShortcut,
} from './automationEditorClipboard'
import { buildWorkflowDefinition, createEmptyStep, isTerminalStep, parseJson } from './automationDefinition'
import {
  buildCardSaveBody,
  downloadExportedCard,
  fetchDeviceScopes,
  inferredMcpDeviceIds,
  persistWorkflowCard,
  scaffoldStepArguments,
  writeStepArgument,
  cloneSavedCard,
  deleteSavedCard,
} from './automationEditorIO'
import type { AiMemberLike, DeviceLike, StepClipboard, StepEditor, WorkflowCanvasConnection, WorkflowNodePosition } from './automationTypes'

const props = defineProps<{ devices: DeviceLike[]; agents: AiMemberLike[]; cards: WorkflowCard[] }>()
const emit = defineEmits<{ (e: 'changed'): void; (e: 'notice', message: string): void; (e: 'error', message: string): void }>()
const { confirm } = useMessage()

const editorOpen = ref(false)
const editorZIndex = usePopupZIndex(editorOpen)
const editorFullscreen = ref(false)
const cardSettingsOpen = ref(false)
const deviceSettingsOpen = ref(false)
const editingId = ref('')
const editor = reactive(blankEditorDraft())
const editorSteps = ref<StepEditor[]>([])
const selectedStepId = ref('')
const canvasPositions = ref<Record<string, WorkflowNodePosition>>({})
const editorCompatibility = ref<Record<string, any>>({})
const publishDeviceIds = ref<string[]>([])
const defaultDeviceId = ref('')
const deviceScopes = ref<Record<string, DeviceMcpScope>>({})
const deviceToolsLoading = ref(false)
const deviceToolsError = ref('')
const versions = ref<WorkflowCardVersion[]>([])
const versionPreview = ref<WorkflowCardVersion | null>(null)
const comparisonOpen = ref(false)
const comparisonZIndex = usePopupZIndex(comparisonOpen)
const comparisonDraft = ref<WorkflowDefinition | null>(null)
const ownerTags = ref<string[]>([])
const error = ref('')
const notice = ref('')
const busy = ref(false)
let stepClipboard: StepClipboard | null = null
let deviceToolsRequestId = 0
let deviceSettingsSnapshot = { ids: [] as string[], defaultId: '' }

const onlineDevices = computed(() => (props.devices || []).filter(device => device.online !== false))
const selectedStep = computed(() => editorSteps.value.find(step => step.id === selectedStepId.value) || null)
const selectedStepTerminal = computed(() => Boolean(selectedStep.value && isTerminalStep(selectedStep.value, editorSteps.value)))
const aiMemberOptions = computed(() => (props.agents || [])
  .filter(agent => Number.isFinite(Number(agent.aiConfigId)) && Number(agent.aiConfigId) > 0)
  .map(agent => ({
    id: Number(agent.aiConfigId),
    name: agent.name,
    role: agent.digitalMemberRole === 'manager' ? '管理员' : '普通成员',
    enabled: agent.enabled !== false,
  }))
  .sort((first, second) => first.name.localeCompare(second.name, 'zh-CN')))
const accessMemberOptions = computed(() => {
  const options = [...aiMemberOptions.value]
  const known = new Set(options.map(member => member.id))
  editor.allowedAiConfigIds.forEach(id => {
    if (!known.has(id)) options.push({ id, name: `成员 ${id}`, role: '已删除', enabled: false })
  })
  return options
})
const ownerIds = computed(() => ownerTags.value
  .map(tag => Number(tag.slice('ai_owner:'.length)))
  .filter(id => Number.isFinite(id) && id > 0))
const toolDefsForStep = (row: StepEditor) => deviceScopes.value[row.deviceId]?.toolDefs || {}

const resetMessages = () => { error.value = ''; notice.value = '' }
const setNotice = (message: string) => { notice.value = message; emit('notice', message) }
const setError = (message: string) => { error.value = message; emit('error', message) }

const captureEditorSnapshot = () => ({
  editor: { ...editor },
  steps: JSON.parse(JSON.stringify(editorSteps.value)) as StepEditor[],
  positions: JSON.parse(JSON.stringify(canvasPositions.value)) as Record<string, WorkflowNodePosition>,
})
type WorkflowEditorSnapshot = ReturnType<typeof captureEditorSnapshot>
const restoreEditorSnapshot = (snapshot: WorkflowEditorSnapshot) => {
  Object.assign(editor, snapshot.editor)
  editorSteps.value = JSON.parse(JSON.stringify(snapshot.steps)) as StepEditor[]
  canvasPositions.value = JSON.parse(JSON.stringify(snapshot.positions)) as Record<string, WorkflowNodePosition>
  if (selectedStepId.value && !editorSteps.value.some(step => step.id === selectedStepId.value)) {
    selectedStepId.value = ''
  }
}
const editorHistory = useSnapshotHistory<WorkflowEditorSnapshot>(restoreEditorSnapshot, { limit: 100, delay: 220 })
const resetEditorHistory = () => editorHistory.reset(captureEditorSnapshot())
const { navigationStack, loadCard, openReferencedCard, returnToParentCard, saveLayout } = useAutomationCardNavigation({
  editingId, editor, editorSteps, selectedStepId, canvasPositions, editorCompatibility,
  ownerTags, versions, publishDeviceIds, defaultDeviceId, versionPreview, busy,
  resetMessages, setError, setNotice, resetEditorHistory,
})

const detachClipboardFromSource = () => {
  if (!stepClipboard) return
  stepClipboard.restoreIncoming = false
  stepClipboard.restoreAsStart = false
  stepClipboard.cutPending = false
}

const openNew = () => {
  detachClipboardFromSource()
  resetMessages()
  navigationStack.value = []
  editingId.value = ''
  Object.assign(editor, blankEditorDraft())
  ownerTags.value = []
  const blank = createBlankEditorSteps()
  editorSteps.value = blank.steps
  selectedStepId.value = ''
  canvasPositions.value = blank.positions
  editorCompatibility.value = {}
  editor.startStepId = blank.startStepId
  versions.value = []
  versionPreview.value = null
  publishDeviceIds.value = []
  defaultDeviceId.value = ''
  deviceScopes.value = {}
  editorOpen.value = true
  resetEditorHistory()
}

const openEdit = async (card: WorkflowCard) => {
  detachClipboardFromSource()
  resetMessages()
  navigationStack.value = []
  await loadCard(card.id)
  editorOpen.value = true
}

const addStep = (type: WorkflowStepType, position: WorkflowNodePosition = { x: 48, y: 48 }) => {
  let suffix = editorSteps.value.filter(step => step.type !== 'end').length + 1
  let step = createEmptyStep(type, suffix)
  while (editorSteps.value.some(item => item.id === step.id)) {
    suffix += 1
    step = createEmptyStep(type, suffix)
  }
  editorSteps.value.push(step)
  canvasPositions.value = { ...canvasPositions.value, [step.id]: position }
  if (!editor.startStepId || editorSteps.value.find(item => item.id === editor.startStepId)?.type === 'end') editor.startStepId = step.id
  selectedStepId.value = step.id
}

const removeStep = (index: number) => {
  const removed = editorSteps.value[index]
  if (!removed) return
  editorSteps.value.splice(index, 1)
  editorSteps.value.forEach(step => clearStepTarget(step, removed.id))
  const positions = { ...canvasPositions.value }
  delete positions[removed.id]
  canvasPositions.value = positions
  const visibleSteps = editorSteps.value.filter(step => step.type !== 'end')
  if (editor.startStepId === removed.id) editor.startStepId = visibleSteps[0]?.id || editorSteps.value[0]?.id || ''
  selectedStepId.value = visibleSteps[Math.min(index, visibleSteps.length - 1)]?.id || ''
}

const removeSelectedStep = () => {
  const index = editorSteps.value.findIndex(step => step.id === selectedStepId.value)
  if (index >= 0) removeStep(index)
}

const copySelectedStep = (cut = false) => {
  const step = selectedStep.value
  if (!step) return false
  stepClipboard = createClipboard({
    step,
    position: canvasPositions.value[step.id] || { x: 48, y: 48 },
    startStepId: editor.startStepId,
    incoming: cut ? incomingTargets(editorSteps.value, step.id) : [],
    cut,
  })
  if (cut) removeSelectedStep()
  return true
}

const pasteStep = () => {
  if (!stepClipboard) return false
  const result = pasteClipboardStep(stepClipboard, editorSteps.value, canvasPositions.value)
  editorSteps.value.push(result.pasted)
  canvasPositions.value = result.nextPositions
  if (result.restoreIncoming) {
    stepClipboard.incoming.forEach(({ stepId, field }) => {
      const source = editorSteps.value.find(step => step.id === stepId)
      if (source) source[field] = result.pasted.id
    })
  }
  if (result.restoreAsStart) editor.startStepId = result.pasted.id
  selectedStepId.value = result.pasted.id
  return true
}

const handleEditorShortcut = (event: KeyboardEvent) => {
  if (!editorOpen.value || comparisonOpen.value) return
  const action = resolveEditorShortcut(event, { hasSelectedStep: Boolean(selectedStep.value) })
  if (!action) return
  const handled = action === 'undo' ? editorHistory.undo()
    : action === 'redo' ? editorHistory.redo()
      : action === 'copy' ? copySelectedStep()
        : action === 'cut' ? copySelectedStep(true)
          : action === 'paste' ? pasteStep()
            : (removeSelectedStep(), true)
  if (handled) event.preventDefault()
}

const connectSteps = ({ from, to, branch }: WorkflowCanvasConnection) => {
  const step = editorSteps.value.find(item => item.id === from)
  if (!step || from === to) return
  applyBranchTarget(step, branch, to)
}

const disconnectStep = ({ from, branch }: Omit<WorkflowCanvasConnection, 'to'>) => {
  const step = editorSteps.value.find(item => item.id === from)
  if (!step) return
  applyBranchTarget(step, branch, branch === 'error' ? 'fail' : '')
}

const buildDefinition = () => buildWorkflowDefinition({
  steps: editorSteps.value,
  editor,
  editorCompatibility: editorCompatibility.value,
  canvasPositions: canvasPositions.value,
  toolDefsForStep,
})

const saveCard = async () => {
  resetMessages()
  const unboundStep = editorSteps.value.find(step => step.type === 'mcp' && (!step.deviceId || !step.tool))
  if (unboundStep) {
    selectedStepId.value = unboundStep.id
    setError(`设备 MCP 节点“${unboundStep.title || unboundStep.id}”必须选择设备及该设备的工具`)
    return
  }
  busy.value = true
  try {
    const inferredDeviceIds = inferredMcpDeviceIds(editorSteps.value)
    publishDeviceIds.value = inferredDeviceIds
    const result = await persistWorkflowCard(
      editingId.value,
      buildCardSaveBody(editor, ownerTags.value, buildDefinition(), defaultDeviceId.value, inferredDeviceIds),
    )
    editingId.value = result.saved.id
    versions.value = result.versions
    setNotice(result.notice)
    emit('changed')
  } catch (cause: any) {
    setError(cause?.message || '保存版本失败')
  } finally {
    busy.value = false
  }
}

const loadDeviceTools = async () => {
  const requestId = ++deviceToolsRequestId
  const deviceIds = onlineDevices.value.map(device => device.id)
  deviceScopes.value = {}
  deviceToolsError.value = ''
  if (!deviceIds.length) { deviceToolsLoading.value = false; return }
  deviceToolsLoading.value = true
  try {
    const scopes = await fetchDeviceScopes(deviceIds)
    if (requestId !== deviceToolsRequestId) return
    deviceScopes.value = scopes
  } catch (cause: any) {
    if (requestId !== deviceToolsRequestId) return
    deviceToolsError.value = cause?.message || '设备工具加载失败'
  } finally {
    if (requestId === deviceToolsRequestId) deviceToolsLoading.value = false
  }
}

const changeStepDevice = (row: StepEditor) => { row.tool = ''; row.argumentsText = '{}' }
const scaffoldArguments = (row: StepEditor) => {
  const schema = toolDefsForStep(row)[row.tool]?.input_schema || {}
  const inputProps = parseJson<Record<string, any>>(editor.inputSchemaText, '输入 Schema').properties || {}
  scaffoldStepArguments(row, schema, inputProps)
}
const setStepArgumentValue = (payload: { step: StepEditor; name: string; schema: any; event: Event }) => {
  writeStepArgument(payload.step, payload.name, payload.schema, payload.event)
}

const cloneCurrentCard = async () => {
  await saveCard()
  if (error.value || !editingId.value) return
  busy.value = true
  try {
    await cloneSavedCard(editingId.value)
    setNotice('卡片副本已创建')
    emit('changed')
  } catch (cause: any) {
    setError(cause?.message || '卡片复制失败')
  } finally { busy.value = false }
}

const deleteCurrentCard = async () => {
  if (!editingId.value) return
  const cardId = editingId.value
  const approved = await confirm({
    message: `确认删除自动化卡片“${editor.name}”？卡片将从列表中移除，历史运行仍保留。`,
    type: 'warning',
  })
  if (!approved) return
  resetMessages()
  busy.value = true
  try {
    await deleteSavedCard(cardId)
    editorOpen.value = false
    setNotice('卡片已删除')
    emit('changed')
  } catch (cause: any) {
    setError(cause?.message || '卡片删除失败')
  } finally { busy.value = false }
}

const exportCurrentCard = async () => {
  await saveCard()
  if (error.value || !editingId.value) return
  busy.value = true
  try {
    await downloadExportedCard(editingId.value, editor.name)
    setNotice('卡片已导出')
  } catch (cause: any) {
    setError(cause?.message || '卡片导出失败')
  } finally { busy.value = false }
}

const previewVersion = async (version: WorkflowCardVersion) => {
  versionPreview.value = editingId.value ? await getWorkflowCardVersion(editingId.value, version.id) : version
  comparisonDraft.value = buildDefinition()
  comparisonOpen.value = true
}

const { openCardSettings, closeCardSettings } = useAutomationCardSettings({
  editingId, editor, ownerTags, open: cardSettingsOpen, busy, setNotice, setError,
  changed: () => emit('changed'),
})
const openDeviceSettings = () => {
  deviceSettingsSnapshot = { ids: [...publishDeviceIds.value], defaultId: defaultDeviceId.value }
  deviceSettingsOpen.value = true
}
const closeDeviceSettings = (save: boolean) => {
  if (!save) {
    publishDeviceIds.value = [...deviceSettingsSnapshot.ids]
    defaultDeviceId.value = deviceSettingsSnapshot.defaultId
  } else if (defaultDeviceId.value && !onlineDevices.value.some(device => device.id === defaultDeviceId.value)) {
    defaultDeviceId.value = ''
  }
  deviceSettingsOpen.value = false
}

watch(onlineDevices, loadDeviceTools, { deep: true, immediate: true })
watch(editorOpen, value => { if (!value) editorFullscreen.value = false })
watch([() => ({ ...editor }), editorSteps, canvasPositions], () => {
  if (editorOpen.value) editorHistory.schedule(captureEditorSnapshot)
}, { deep: true })

onMounted(() => window.addEventListener('keydown', handleEditorShortcut))
onBeforeUnmount(() => window.removeEventListener('keydown', handleEditorShortcut))
defineExpose({ openNew, openEdit })
</script>

<template>
  <Teleport to="body">
    <div v-if="editorOpen" class="fixed inset-0 flex justify-center overflow-y-auto bg-zinc-950/45 backdrop-blur-sm" :class="editorFullscreen ? 'p-0' : 'p-3'" :style="{ zIndex: editorZIndex }" @click.self="editorOpen = false">
      <div class="automation-editor-modal w-full border p-4 shadow-2xl" :class="editorFullscreen ? 'is-fullscreen min-h-app-viewport max-w-none rounded-none' : 'my-auto max-w-[1500px] rounded-xl'">
        <div class="automation-editor-header flex items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-2">
            <button v-if="navigationStack.length" type="button" class="rounded border px-2 py-1 text-xs text-indigo-600 dark:border-zinc-700 dark:text-indigo-300" @click="returnToParentCard">← 返回</button>
            <div class="min-w-0">
              <div class="automation-editor-title truncate text-sm font-semibold">{{ editingId ? `编辑自动化卡片 · ${editor.name}` : '新建自动化卡片' }}</div>
              <div v-if="navigationStack.length" class="truncate text-[10px] text-zinc-400">来自 {{ navigationStack[navigationStack.length - 1]?.cardName }}</div>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button class="automation-editor-close" :aria-label="editorFullscreen ? '退出全屏编辑' : '全屏编辑'" :title="editorFullscreen ? '退出全屏' : '全屏编辑'" @click="editorFullscreen = !editorFullscreen">{{ editorFullscreen ? '↙' : '⛶' }}</button>
            <button class="automation-editor-close" aria-label="关闭自动化卡片编辑器" title="关闭" @click="editorOpen = false">✕</button>
          </div>
        </div>
        <div v-if="error" class="mt-2 rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">{{ error }}</div>
        <div v-if="notice" class="mt-2 rounded-lg bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">{{ notice }}</div>

        <AutomationEditorSettings
          :editor="editor"
          :owner-ids="ownerIds"
          :access-member-options="accessMemberOptions"
          :ai-member-options="aiMemberOptions"
          :online-devices="onlineDevices"
          :default-device-id="defaultDeviceId"
          :device-scopes="deviceScopes"
          :device-tools-loading="deviceToolsLoading"
          :device-tools-error="deviceToolsError"
          :card-settings-open="cardSettingsOpen"
          :device-settings-open="deviceSettingsOpen"
          @update:default-device-id="defaultDeviceId = $event"
          @close-card-settings="closeCardSettings"
          @close-device-settings="closeDeviceSettings"
        />

        <div class="mt-3">
          <WorkflowCanvasEditor
            :steps="editorSteps"
            :start-step-id="editor.startStepId"
            :selected-step-id="selectedStepId"
            :positions="canvasPositions"
            @select="selectedStepId = $event"
            @add="addStep"
            @connect="connectSteps"
            @disconnect="disconnectStep"
            @set-start="editor.startStepId = $event"
            @open-card="openReferencedCard"
            @save-layout="saveLayout"
            @update:positions="canvasPositions = $event"
          >
            <template #bottom-left>
              <button class="canvas-overlay-button" type="button" @click="openCardSettings">卡片设置</button>
              <button class="canvas-overlay-button" type="button" @click="openDeviceSettings">跨设备 MCP · 自动</button>
            </template>
            <template #inspector>
              <AutomationStepInspector
                :selected-step="selectedStep"
                :start-step-id="editor.startStepId"
                v-model:input-schema-text="editor.inputSchemaText"
                v-model:output-text="editor.outputText"
                :terminal="selectedStepTerminal"
                :online-devices="onlineDevices"
                :device-scopes="deviceScopes"
                :device-tools-loading="deviceToolsLoading"
                :device-tools-error="deviceToolsError"
                :cards="cards"
                :current-card-id="editingId"
                @set-start="editor.startStepId = $event"
                @remove="removeSelectedStep"
                @change-device="changeStepDevice"
                @scaffold="scaffoldArguments"
                @set-argument="setStepArgumentValue"
              />
            </template>
          </WorkflowCanvasEditor>
        </div>

        <div v-if="versions.length" class="mt-3">
          <div class="text-[10px] font-semibold text-zinc-500">历史版本与当前未保存修改</div>
          <div class="mt-1 flex flex-wrap gap-1">
            <button v-for="version in versions" :key="version.id" class="rounded border px-2 py-0.5 text-[9px]" @click="previewVersion(version)">画布对比 v{{ version.version_number }}</button>
          </div>
        </div>
        <div class="automation-editor-footer mt-4 flex flex-wrap items-center justify-between gap-2">
          <div class="flex gap-2">
            <button v-if="editingId" :disabled="busy" class="rounded border border-rose-200 px-3 py-1.5 text-xs text-rose-600 dark:border-rose-500/30 dark:text-rose-300" @click="deleteCurrentCard">删除卡片</button>
            <button v-if="editingId" :disabled="busy" class="rounded border px-3 py-1.5 text-xs" @click="cloneCurrentCard">复制</button>
            <button v-if="editingId" :disabled="busy" class="rounded border px-3 py-1.5 text-xs" @click="exportCurrentCard">导出</button>
          </div>
          <div class="flex flex-wrap justify-end gap-2">
            <button class="rounded border px-3 py-1.5 text-xs" @click="editorOpen = false">舍弃修改</button>
            <button :disabled="busy" class="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white" @click="saveCard">{{ editingId ? '保存为新版本' : '创建卡片' }}</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <AutomationVersionCompare
    :open="comparisonOpen"
    :z-index="comparisonZIndex"
    :version-preview="versionPreview"
    :comparison-draft="comparisonDraft"
    @close="comparisonOpen = false"
  />
</template>

<style scoped src="./automationEditor.css"></style>
