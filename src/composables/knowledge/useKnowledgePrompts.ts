import { computed, ref } from 'vue'
import { me } from '@/api/auth'
import { getAuthToken } from '@/api/http'
import { saveSystemPrompts } from '@/api/librarian'
import {
  filterPromptSections,
  normalizeDetailQuery,
  pickPromptItem,
  pickPromptSection,
} from './knowledgeFilters'
import type { KnowledgeShared, PromptDraftItem, SystemPromptSection } from './types'

export function createPromptState() {
  return {
    editingPromptSection: ref<string | null>(null),
    activePromptSectionKey: ref(''),
    activePromptItemKey: ref(''),
    savingPromptSection: ref<string | null>(null),
    promptEditError: ref(''),
    promptEditNotice: ref(''),
    promptDraftItems: ref<PromptDraftItem[]>([]),
  }
}

export type PromptState = ReturnType<typeof createPromptState>

export async function selectPromptSection(
  state: PromptState,
  shared: KnowledgeShared,
  section: SystemPromptSection,
  currentKey?: string,
) {
  if (currentKey === section.key) return
  if (state.editingPromptSection.value) {
    const ok = await shared.confirm({
      message: '当前提示词栏目还有未保存的修改，确认切换栏目吗？',
      type: 'warning',
      confirmText: '放弃并切换',
      cancelText: '继续编辑',
    })
    if (!ok) return
    cancelEditPromptSection(state)
  }
  state.activePromptSectionKey.value = section.key
  state.activePromptItemKey.value = section.items[0]?.key || ''
  state.promptEditError.value = ''
  state.promptEditNotice.value = ''
}

export function startEditPromptSection(state: PromptState, section: SystemPromptSection) {
  state.editingPromptSection.value = section.key
  state.promptEditError.value = ''
  state.promptEditNotice.value = ''
  state.promptDraftItems.value = section.items.map(item => ({
    key: item.key,
    content: item.type === 'number' ? Number(item.content || 0) : item.content || '',
  }))
}

export function cancelEditPromptSection(state: PromptState) {
  state.editingPromptSection.value = null
  state.promptEditError.value = ''
  state.promptDraftItems.value = []
}

export function promptDraftValue(state: PromptState, key: string) {
  return state.promptDraftItems.value.find(item => item.key === key)?.content ?? ''
}

export function updatePromptDraftValue(state: PromptState, key: string, value: string | number) {
  state.promptDraftItems.value = state.promptDraftItems.value.map(item =>
    item.key === key ? { ...item, content: value } : item,
  )
}

export async function savePromptSection(
  state: PromptState,
  shared: KnowledgeShared,
  section: SystemPromptSection,
) {
  state.savingPromptSection.value = section.key
  state.promptEditError.value = ''
  state.promptEditNotice.value = ''
  try {
    const token = getAuthToken()
    const updated = await saveSystemPrompts(token, state.promptDraftItems.value)
    shared.currentDetail.value = updated
    if (token) {
      const refreshedUser = await me(token)
      shared.emit('refresh-user', refreshedUser)
    }
    state.editingPromptSection.value = null
    state.promptDraftItems.value = []
    state.promptEditNotice.value = `${section.title} 已保存`
  } catch (err) {
    state.promptEditError.value = (err as Error).message || '保存失败'
  } finally {
    state.savingPromptSection.value = null
  }
}

export function useKnowledgePrompts(shared: KnowledgeShared) {
  const state = createPromptState()
  const systemPrompts = computed(() => shared.currentDetail.value?.system_prompts || null)
  const filteredPromptSections = computed(() => filterPromptSections(
    systemPrompts.value?.sections || [],
    normalizeDetailQuery(shared.detailQuery.value),
  ))
  const selectedPromptSection = computed(() => pickPromptSection(
    filteredPromptSections.value,
    state.activePromptSectionKey.value,
  ))
  const selectedPromptItem = computed(() => pickPromptItem(
    selectedPromptSection.value,
    state.activePromptItemKey.value,
  ))
  return {
    ...state,
    systemPrompts,
    filteredPromptSections,
    selectedPromptSection,
    selectedPromptItem,
    selectPromptSection: (section: SystemPromptSection) => selectPromptSection(
      state,
      shared,
      section,
      selectedPromptSection.value?.key,
    ),
    startEditPromptSection: (section: SystemPromptSection) => startEditPromptSection(state, section),
    cancelEditPromptSection: () => cancelEditPromptSection(state),
    promptDraftValue: (key: string) => promptDraftValue(state, key),
    updatePromptDraftValue: (key: string, value: string | number) => updatePromptDraftValue(state, key, value),
    savePromptSection: (section: SystemPromptSection) => savePromptSection(state, shared, section),
  }
}
