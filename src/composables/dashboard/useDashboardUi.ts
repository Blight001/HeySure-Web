import { computed, ref, type Ref } from 'vue'
import type { Agent } from '@/types'

interface UseDashboardUiOptions {
  unassignedProjectId: string
  agents: Ref<Agent[]>
}

export const useDashboardUi = (options: UseDashboardUiOptions) => {
  const { unassignedProjectId, agents } = options

  const settingsOpen = ref(false)
  const leftCollapsed = ref(false)
  const rightCollapsed = ref(false)
  const userMenuOpen = ref(false)

  const closeSettings = () => {
    if (!settingsOpen.value) return
    settingsOpen.value = false
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

  return {
    settingsOpen,
    leftCollapsed,
    rightCollapsed,
    userMenuOpen,
    closeSettings,
    closeUserMenu,
    adminAgents,
    sidebarMemberAgents,
    activeAgents,
  }
}
