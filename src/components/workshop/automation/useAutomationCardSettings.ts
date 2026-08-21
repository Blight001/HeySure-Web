import type { Ref } from 'vue'
import type { EditorDraft } from './automationTypes'
import { buildCardMetadataBody, persistWorkflowCardMetadata } from './automationEditorIO'

type CardSettingsOptions = {
  editingId: Ref<string>
  editor: EditorDraft
  ownerTags: Ref<string[]>
  open: Ref<boolean>
  busy: Ref<boolean>
  setNotice: (message: string) => void
  setError: (message: string) => void
  changed: () => void
}

export function useAutomationCardSettings(options: CardSettingsOptions) {
  let snapshot = ''
  const openCardSettings = () => {
    snapshot = JSON.stringify({ ...options.editor, allowedAiConfigIds: [...options.editor.allowedAiConfigIds] })
    options.open.value = true
  }
  const closeCardSettings = async (save: boolean) => {
    if (!save) {
      if (snapshot) Object.assign(options.editor, JSON.parse(snapshot))
      options.open.value = false
      return
    }
    if (!options.editingId.value) {
      options.open.value = false
      options.setNotice('基础设置已应用，将在创建卡片时保存')
      return
    }
    options.busy.value = true
    try {
      await persistWorkflowCardMetadata(
        options.editingId.value,
        buildCardMetadataBody(options.editor, options.ownerTags.value),
      )
      options.open.value = false
      options.setNotice('卡片基础信息已保存，当前版本未变更')
      options.changed()
    } catch (cause: any) {
      options.setError(cause?.message || '卡片基础信息保存失败')
    } finally { options.busy.value = false }
  }
  return { openCardSettings, closeCardSettings }
}
