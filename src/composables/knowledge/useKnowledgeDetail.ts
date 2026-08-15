import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { readEntry, type KnowledgeEntryItem } from '@/api/librarian'
import { getAuthToken } from '@/api/http'
import { usePopupZIndex } from '@/composables/usePopupZIndex'
import { inheritanceToolKey } from './knowledgeFormat'
import { buildDetailPresentation } from './knowledgeFilters'
import type { KnowledgeItem, KnowledgeShared } from './types'
import type { useKnowledgeClawHub } from './useKnowledgeClawHub'
import type { useKnowledgeInheritance } from './useKnowledgeInheritance'
import type { useKnowledgePersona } from './useKnowledgePersona'
import type { useKnowledgePrompts } from './useKnowledgePrompts'

export type PersonaSlice = ReturnType<typeof useKnowledgePersona>
export type PromptSlice = ReturnType<typeof useKnowledgePrompts>
export type InheritanceSlice = ReturnType<typeof useKnowledgeInheritance>
export type ClawHubSlice = ReturnType<typeof useKnowledgeClawHub>

export interface KnowledgeDomains {
  persona: PersonaSlice
  prompts: PromptSlice
  inheritance: InheritanceSlice
  clawhub: ClawHubSlice
}

export function createDetailState() {
  return {
    detailOpen: ref(false),
    detailLoading: ref(false),
    detailError: ref(''),
    detailCloseButton: ref<HTMLButtonElement | null>(null),
    detailHistory: ref<KnowledgeEntryItem[]>([]),
  }
}

export type DetailState = ReturnType<typeof createDetailState>

export function initializeDetailColumns(detail: KnowledgeEntryItem, domains: KnowledgeDomains) {
  domains.persona.closePersonaDetail()
  domains.prompts.activePromptSectionKey.value = detail.system_prompts?.sections[0]?.key || ''
  domains.prompts.activePromptItemKey.value = detail.system_prompts?.sections[0]?.items[0]?.key || ''
  const firstDevice = detail.inheritance_skills?.devices.find(device => device.tools.length)
  const firstTool = firstDevice?.tools[0]
  domains.inheritance.activeInheritanceToolKey.value = firstDevice && firstTool
    ? inheritanceToolKey(firstDevice, firstTool)
    : ''
  const firstPersona = detail.intrinsic_personas?.agents.find(agent => Boolean(agent.id))
  if (firstPersona) domains.persona.openPersonaDetail(firstPersona)
}

export function assignDetailCloseButton(state: DetailState, el: unknown) {
  state.detailCloseButton.value = el instanceof HTMLButtonElement ? el : null
}

export function closeDetail(state: DetailState, shared: KnowledgeShared, domains: KnowledgeDomains) {
  state.detailOpen.value = false
  state.detailError.value = ''
  shared.detailQuery.value = ''
  state.detailHistory.value = []
  shared.currentDetail.value = null
  domains.inheritance.closeMcpTestModal()
  shared.selectedItem.value = null
  resetPersonaOnClose(domains.persona)
  resetPropertyOnClose(domains.inheritance)
  resetPromptOnClose(domains.prompts)
  resetClawHubOnClose(domains.clawhub)
}

function resetPersonaOnClose(persona: PersonaSlice) {
  persona.savingPersonaId.value = null
  persona.detailPersonaId.value = null
  persona.personaEditError.value = ''
  persona.personaEditNotice.value = ''
  persona.personaDraftPrompt.value = ''
}

function resetPropertyOnClose(inheritance: InheritanceSlice) {
  inheritance.editingPropertyCategory.value = null
  inheritance.savingPropertyCategory.value = null
  inheritance.propertyEditError.value = ''
  inheritance.propertyEditNotice.value = ''
  inheritance.propertyDraftTools.value = []
  inheritance.activeInheritanceToolKey.value = ''
}

function resetPromptOnClose(prompts: PromptSlice) {
  prompts.editingPromptSection.value = null
  prompts.activePromptSectionKey.value = ''
  prompts.activePromptItemKey.value = ''
  prompts.savingPromptSection.value = null
  prompts.promptEditError.value = ''
  prompts.promptEditNotice.value = ''
  prompts.promptDraftItems.value = []
}

function resetClawHubOnClose(clawhub: ClawHubSlice) {
  clawhub.clawhubQuery.value = ''
  clawhub.clawhubModalOpen.value = false
  clawhub.clawhubError.value = ''
  clawhub.clawhubNotice.value = ''
  clawhub.clawhubResults.value = []
  clawhub.clawhubSelected.value = null
  clawhub.clawhubInspectingSlug.value = ''
  clawhub.clawhubInstallingSlug.value = ''
  clawhub.installedClawhubModalOpen.value = false
  clawhub.installedClawhubSelected.value = null
  clawhub.installedClawhubDraft.value = ''
}

export async function requestCloseDetail(
  state: DetailState,
  shared: KnowledgeShared,
  domains: KnowledgeDomains,
) {
  const dirty = domains.persona.personaHasUnsavedChanges.value
    || Boolean(domains.prompts.editingPromptSection.value)
    || Boolean(domains.inheritance.editingPropertyCategory.value)
  if (dirty) {
    const ok = await shared.confirm({
      message: '当前栏目还有未保存的编辑内容，确认关闭吗？',
      type: 'warning',
      confirmText: '放弃并关闭',
      cancelText: '继续编辑',
    })
    if (!ok) return
  }
  closeDetail(state, shared, domains)
}

export function goBackDetail(state: DetailState, shared: KnowledgeShared, domains: KnowledgeDomains) {
  const previous = state.detailHistory.value[state.detailHistory.value.length - 1]
  if (!previous) return
  state.detailHistory.value = state.detailHistory.value.slice(0, -1)
  shared.currentDetail.value = previous
  initializeDetailColumns(previous, domains)
  shared.detailQuery.value = ''
  state.detailError.value = ''
}

export function navigateBackOrCloseDetail(
  state: DetailState,
  shared: KnowledgeShared,
  domains: KnowledgeDomains,
) {
  if (state.detailHistory.value.length > 0) {
    goBackDetail(state, shared, domains)
    return
  }
  void requestCloseDetail(state, shared, domains)
}

export function handleDetailKeydown(
  state: DetailState,
  shared: KnowledgeShared,
  domains: KnowledgeDomains,
  event: KeyboardEvent,
) {
  if (event.key !== 'Escape' || !state.detailOpen.value) return
  event.preventDefault()
  if (domains.clawhub.installedClawhubModalOpen.value) {
    void domains.clawhub.requestCloseInstalledClawHubModal()
    return
  }
  if (domains.clawhub.clawhubModalOpen.value) {
    domains.clawhub.closeClawHubModal()
    return
  }
  if (domains.inheritance.mcpTestModalOpen.value) return
  navigateBackOrCloseDetail(state, shared, domains)
}

export async function openDetail(
  state: DetailState,
  shared: KnowledgeShared,
  domains: KnowledgeDomains,
  item: KnowledgeItem,
) {
  prepareOpenDetail(state, shared, domains, item)
  try {
    const detail = await readEntry(getAuthToken(), item.id)
    shared.currentDetail.value = detail
    initializeDetailColumns(detail, domains)
  } catch (err) {
    state.detailError.value = (err as Error).message || '条目加载失败'
  } finally {
    state.detailLoading.value = false
    await nextTick()
    state.detailCloseButton.value?.focus()
  }
}

function prepareOpenDetail(
  state: DetailState,
  shared: KnowledgeShared,
  domains: KnowledgeDomains,
  item: KnowledgeItem,
) {
  shared.selectedItem.value = item
  state.detailOpen.value = true
  state.detailLoading.value = true
  state.detailError.value = ''
  shared.detailQuery.value = ''
  state.detailHistory.value = []
  shared.currentDetail.value = null
  resetPersonaOnOpen(domains.persona)
  resetPropertyOnOpen(domains.inheritance)
  resetPromptOnOpen(domains.prompts)
  resetClawHubOnOpen(domains.clawhub)
}

function resetPersonaOnOpen(persona: PersonaSlice) {
  persona.detailPersonaId.value = null
  persona.personaEditError.value = ''
  persona.personaEditNotice.value = ''
}

function resetPropertyOnOpen(inheritance: InheritanceSlice) {
  inheritance.editingPropertyCategory.value = null
  inheritance.propertyEditError.value = ''
  inheritance.propertyEditNotice.value = ''
  inheritance.activeInheritanceToolKey.value = ''
}

function resetPromptOnOpen(prompts: PromptSlice) {
  prompts.editingPromptSection.value = null
  prompts.activePromptSectionKey.value = ''
  prompts.activePromptItemKey.value = ''
  prompts.promptEditError.value = ''
  prompts.promptEditNotice.value = ''
}

function resetClawHubOnOpen(clawhub: ClawHubSlice) {
  clawhub.clawhubModalOpen.value = false
  clawhub.clawhubError.value = ''
  clawhub.clawhubNotice.value = ''
  clawhub.clawhubResults.value = []
  clawhub.clawhubSelected.value = null
  clawhub.clawhubInspectingSlug.value = ''
  clawhub.clawhubInstallingSlug.value = ''
  clawhub.installedClawhubModalOpen.value = false
  clawhub.installedClawhubSelected.value = null
  clawhub.installedClawhubDraft.value = ''
}

export function useKnowledgeDetail(shared: KnowledgeShared, domains: KnowledgeDomains) {
  const state = createDetailState()
  const canGoBackDetail = computed(() => state.detailHistory.value.length > 0)
  const detailContent = computed(() =>
    shared.currentDetail.value?.body || shared.currentDetail.value?.summary || '（无内容）',
  )
  const detailSearchVisible = computed(() => Boolean(
    domains.persona.intrinsicPersonas.value
    || domains.prompts.systemPrompts.value
    || domains.inheritance.inheritanceSkills.value
    || domains.clawhub.inheritanceThoughts.value,
  ))
  const detailPresentation = computed(() => buildDetailPresentation({
    currentDetail: shared.currentDetail.value,
    selectedItem: shared.selectedItem.value,
    filteredPersonaCount: domains.persona.filteredPersonaAgents.value.length,
    visiblePromptCount: domains.prompts.filteredPromptSections.value.reduce((sum, section) => sum + section.items.length, 0),
    visibleToolCount: domains.inheritance.filteredInheritanceDevices.value.reduce((sum, device) => sum + device.tools.length, 0),
    filteredThoughtCount: domains.clawhub.filteredInstalledThoughts.value.length,
  }))
  const detailZIndex = usePopupZIndex(state.detailOpen)
  const clawhubZIndex = usePopupZIndex(domains.clawhub.clawhubModalOpen)
  const installedClawhubZIndex = usePopupZIndex(domains.clawhub.installedClawhubModalOpen)
  const onKeydown = (event: KeyboardEvent) => handleDetailKeydown(state, shared, domains, event)
  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
  return {
    ...state,
    canGoBackDetail,
    detailContent,
    detailSearchVisible,
    detailPresentation,
    detailZIndex,
    clawhubZIndex,
    installedClawhubZIndex,
    assignDetailCloseButton: (el: unknown) => assignDetailCloseButton(state, el),
    openDetail: (item: KnowledgeItem) => openDetail(state, shared, domains, item),
    retryDetail: () => {
      if (shared.selectedItem.value) void openDetail(state, shared, domains, shared.selectedItem.value)
    },
    closeDetail: () => closeDetail(state, shared, domains),
    requestCloseDetail: () => requestCloseDetail(state, shared, domains),
    goBackDetail: () => goBackDetail(state, shared, domains),
    navigateBackOrCloseDetail: () => navigateBackOrCloseDetail(state, shared, domains),
  }
}
