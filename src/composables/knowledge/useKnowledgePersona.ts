import { computed, ref } from 'vue'
import { updateAiConfigFields } from '@/api/ai'
import type { KnowledgeShared, IntrinsicPersonaAgent } from './types'
import { filterPersonaAgents, findDetailAgent, normalizeDetailQuery } from './knowledgeFilters'

export function createPersonaState() {
  return {
    savingPersonaId: ref<number | null>(null),
    personaEditError: ref(''),
    personaEditNotice: ref(''),
    personaDraftPrompt: ref(''),
    detailPersonaId: ref<number | null>(null),
  }
}

export type PersonaState = ReturnType<typeof createPersonaState>

export function openPersonaDetail(state: PersonaState, agent: IntrinsicPersonaAgent) {
  if (!agent.id) return
  state.detailPersonaId.value = agent.id
  state.personaEditError.value = ''
  state.personaEditNotice.value = ''
  state.personaDraftPrompt.value = agent.prompt || ''
}

export function closePersonaDetail(state: PersonaState) {
  state.detailPersonaId.value = null
  state.personaEditError.value = ''
  state.personaEditNotice.value = ''
  state.personaDraftPrompt.value = ''
}

export async function selectPersonaSection(
  state: PersonaState,
  shared: KnowledgeShared,
  agent: IntrinsicPersonaAgent,
  hasUnsaved: boolean,
) {
  if (!agent.id) return
  if (state.detailPersonaId.value === agent.id) return
  if (hasUnsaved) {
    const ok = await shared.confirm({
      message: '当前成员的人格 Prompt 尚未保存，确认切换到其他成员吗？',
      type: 'warning',
      confirmText: '放弃并切换',
      cancelText: '继续编辑',
    })
    if (!ok) return
  }
  closePersonaDetail(state)
  openPersonaDetail(state, agent)
}

export async function savePersona(state: PersonaState, agent: IntrinsicPersonaAgent) {
  if (!agent.id) return
  state.savingPersonaId.value = agent.id
  state.personaEditError.value = ''
  state.personaEditNotice.value = ''
  try {
    await updateAiConfigFields(agent.id, {
      prompt: state.personaDraftPrompt.value,
    })
    agent.prompt = state.personaDraftPrompt.value
    state.personaEditNotice.value = `${agent.name} 人格 Prompt 已保存`
  } catch (err) {
    state.personaEditError.value = (err as Error).message || '保存失败'
  } finally {
    state.savingPersonaId.value = null
  }
}

export function useKnowledgePersona(shared: KnowledgeShared) {
  const state = createPersonaState()
  const intrinsicPersonas = computed(() => shared.currentDetail.value?.intrinsic_personas || null)
  const filteredPersonaAgents = computed(() => filterPersonaAgents(
    intrinsicPersonas.value?.agents || [],
    normalizeDetailQuery(shared.detailQuery.value),
  ))
  const detailAgent = computed(() => findDetailAgent(
    intrinsicPersonas.value?.agents || [],
    state.detailPersonaId.value,
  ))
  const personaHasUnsavedChanges = computed(() => Boolean(
    detailAgent.value && state.personaDraftPrompt.value !== (detailAgent.value.prompt || ''),
  ))
  return {
    ...state,
    intrinsicPersonas,
    filteredPersonaAgents,
    detailAgent,
    personaHasUnsavedChanges,
    openPersonaDetail: (agent: IntrinsicPersonaAgent) => openPersonaDetail(state, agent),
    closePersonaDetail: () => closePersonaDetail(state),
    selectPersonaSection: (agent: IntrinsicPersonaAgent) => selectPersonaSection(
      state,
      shared,
      agent,
      personaHasUnsavedChanges.value,
    ),
    savePersona: (agent: IntrinsicPersonaAgent) => savePersona(state, agent),
  }
}
