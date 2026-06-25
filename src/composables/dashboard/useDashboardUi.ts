import { computed, ref, type Ref } from 'vue'
import type { Agent, KnowledgeItem } from '@/types'

interface UseDashboardUiOptions {
  unassignedProjectId: string
  agents: Ref<Agent[]>
  knowledgeBase: Ref<KnowledgeItem[]>
}

export const useDashboardUi = (options: UseDashboardUiOptions) => {
  const { unassignedProjectId, agents, knowledgeBase } = options

  const settingsOpen = ref(false)
  const leftCollapsed = ref(false)
  const rightCollapsed = ref(false)
  const knowledgeFilterOpen = ref(false)
  const knowledgeFilter = ref<'all' | 'personas' | 'skills' | 'tools' | 'inheritance' | 'system' | 'business'>('all')
  const userMenuOpen = ref(false)

  const closeSettings = () => {
    if (!settingsOpen.value) return
    settingsOpen.value = false
  }

  const closeKnowledgeFilter = () => {
    if (!knowledgeFilterOpen.value) return
    knowledgeFilterOpen.value = false
  }

  const closeUserMenu = () => {
    if (!userMenuOpen.value) return
    userMenuOpen.value = false
  }

  const isUnassignedAgent = (agent: Agent) => (agent.projectId || unassignedProjectId) === unassignedProjectId

  const adminAgents = computed(() => agents.value.filter(a => a.role === 'admin'))
  const sidebarMemberAgents = computed(() => agents.value.filter(
    agent => agent.role === 'worker'
      && isUnassignedAgent(agent)
  ))
  const activeAgents = computed(() => [...agents.value].reverse())

  const filteredKnowledgeBase = computed(() => {
    if (knowledgeFilter.value === 'all') return knowledgeBase.value
    if (knowledgeFilter.value === 'inheritance') {
      return knowledgeBase.value.filter(item => item.tags.includes('传承'))
    }
    if (knowledgeFilter.value === 'personas') {
      return knowledgeBase.value.filter(item => item.tags.includes('固有人格'))
    }
    if (knowledgeFilter.value === 'skills') {
      return knowledgeBase.value.filter(item => item.tags.includes('传承技能'))
    }
    if (knowledgeFilter.value === 'tools') {
      return knowledgeBase.value.filter(item => item.tags.includes('传承思想'))
    }
    if (knowledgeFilter.value === 'system') {
      return knowledgeBase.value.filter(item => item.tags.includes('固有思想'))
    }
    if (knowledgeFilter.value === 'business') {
      return knowledgeBase.value.filter(item => item.tags.includes('业务'))
    }
    return knowledgeBase.value
  })

  return {
    settingsOpen,
    leftCollapsed,
    rightCollapsed,
    knowledgeFilterOpen,
    knowledgeFilter,
    userMenuOpen,
    closeSettings,
    closeKnowledgeFilter,
    closeUserMenu,
    adminAgents,
    sidebarMemberAgents,
    activeAgents,
    filteredKnowledgeBase,
  }
}
