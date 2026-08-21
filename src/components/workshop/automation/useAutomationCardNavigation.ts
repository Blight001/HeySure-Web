import { ref, type Ref } from 'vue'
import {
  getWorkflowCard,
  listWorkflowCardVersions,
  saveWorkflowCardLayout,
  type WorkflowCard,
  type WorkflowCardVersion,
} from '@/api/workflowCards'
import { applyCardToEditor } from './automationEditorApply'
import type { EditorDraft, StepEditor, WorkflowNodePosition } from './automationTypes'

type EditorSnapshot = {
  editor: EditorDraft
  steps: StepEditor[]
  positions: Record<string, WorkflowNodePosition>
}

type NavigationFrame = {
  cardId: string
  cardName: string
  snapshot: EditorSnapshot
  ownerTags: string[]
  compatibility: Record<string, any>
  versions: WorkflowCardVersion[]
  publishDeviceIds: string[]
  defaultDeviceId: string
  selectedStepId: string
}

type NavigationContext = {
  editingId: Ref<string>
  editor: EditorDraft
  editorSteps: Ref<StepEditor[]>
  selectedStepId: Ref<string>
  canvasPositions: Ref<Record<string, WorkflowNodePosition>>
  editorCompatibility: Ref<Record<string, any>>
  ownerTags: Ref<string[]>
  versions: Ref<WorkflowCardVersion[]>
  publishDeviceIds: Ref<string[]>
  defaultDeviceId: Ref<string>
  versionPreview: Ref<WorkflowCardVersion | null>
  busy: Ref<boolean>
  resetMessages: () => void
  setError: (message: string) => void
  setNotice: (message: string) => void
  resetEditorHistory: () => void
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

async function persistLayout(ctx: NavigationContext, positions: Record<string, WorkflowNodePosition>) {
  if (!ctx.editingId.value) {
    ctx.setError('请先创建卡片，再单独保存布局')
    return
  }
  ctx.resetMessages()
  ctx.busy.value = true
  try {
    await saveWorkflowCardLayout(ctx.editingId.value, positions)
    ctx.setNotice('布局坐标已保存，未创建新版本')
  } catch (cause: any) {
    ctx.setError(cause?.message || '布局保存失败')
  } finally {
    ctx.busy.value = false
  }
}

export function useAutomationCardNavigation(ctx: NavigationContext) {
  const navigationStack = ref<NavigationFrame[]>([])
  const snapshot = (): EditorSnapshot => ({
    editor: { ...ctx.editor, allowedAiConfigIds: [...ctx.editor.allowedAiConfigIds] },
    steps: clone(ctx.editorSteps.value),
    positions: clone(ctx.canvasPositions.value),
  })
  const applySnapshot = (value: EditorSnapshot) => {
    Object.assign(ctx.editor, value.editor)
    ctx.editorSteps.value = clone(value.steps)
    ctx.canvasPositions.value = clone(value.positions)
  }
  const applyLoadedCard = async (full: WorkflowCard) => {
    const applied = applyCardToEditor(full)
    ctx.editingId.value = full.id
    Object.assign(ctx.editor, applied.editor)
    ctx.ownerTags.value = applied.ownerTags
    ctx.editorSteps.value = applied.steps
    ctx.selectedStepId.value = ''
    ctx.editorCompatibility.value = applied.compatibility
    ctx.canvasPositions.value = applied.positions
    ctx.versions.value = (await listWorkflowCardVersions(full.id)).items
    ctx.publishDeviceIds.value = [...(ctx.versions.value[0]?.contract_device_ids || [])]
    ctx.defaultDeviceId.value = ctx.versions.value[0]?.default_device_id || ctx.publishDeviceIds.value[0] || ''
    ctx.versionPreview.value = null
    ctx.resetEditorHistory()
  }
  const loadCard = async (cardId: string) => applyLoadedCard(await getWorkflowCard(cardId))
  const captureFrame = (): NavigationFrame => ({
    cardId: ctx.editingId.value,
    cardName: ctx.editor.name,
    snapshot: snapshot(),
    ownerTags: [...ctx.ownerTags.value],
    compatibility: clone(ctx.editorCompatibility.value),
    versions: [...ctx.versions.value],
    publishDeviceIds: [...ctx.publishDeviceIds.value],
    defaultDeviceId: ctx.defaultDeviceId.value,
    selectedStepId: ctx.selectedStepId.value,
  })
  const restoreFrame = (frame: NavigationFrame) => {
    ctx.editingId.value = frame.cardId
    applySnapshot(frame.snapshot)
    ctx.ownerTags.value = [...frame.ownerTags]
    ctx.editorCompatibility.value = clone(frame.compatibility)
    ctx.versions.value = [...frame.versions]
    ctx.publishDeviceIds.value = [...frame.publishDeviceIds]
    ctx.defaultDeviceId.value = frame.defaultDeviceId
    ctx.selectedStepId.value = frame.selectedStepId
    ctx.resetEditorHistory()
  }
  const openReferencedCard = async (cardId: string) => {
    if (!cardId || cardId === ctx.editingId.value) return
    ctx.resetMessages()
    ctx.busy.value = true
    try {
      navigationStack.value.push(captureFrame())
      await loadCard(cardId)
    } catch (cause: any) {
      const frame = navigationStack.value.pop()
      if (frame) restoreFrame(frame)
      ctx.setError(cause?.message || '引用卡片加载失败')
    } finally {
      ctx.busy.value = false
    }
  }
  const returnToParentCard = () => {
    const frame = navigationStack.value.pop()
    if (frame) restoreFrame(frame)
  }
  const saveLayout = (positions: Record<string, WorkflowNodePosition>) => persistLayout(ctx, positions)
  return { navigationStack, loadCard, openReferencedCard, returnToParentCard, saveLayout }
}
