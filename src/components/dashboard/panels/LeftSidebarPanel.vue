<script setup lang="ts">
import { defineAsyncComponent, ref, watch } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import BrainCorePanel from './BrainCorePanel.vue'

// 知识库/作坊体量大（合计 ~140KB 源码）且藏在非默认 Tab 后，懒加载切走，
// 避免拖慢首屏（移动端"控制台"Tab 默认只需要数字生命面板）
const KnowledgeBasePanel = defineAsyncComponent(() => import('./KnowledgeBasePanel.vue'))
const WorkshopPanel = defineAsyncComponent(() => import('./WorkshopPanel.vue'))
import type { ConnectedDevice } from '@/composables/dashboard/useDashboardData'
import type { KnowledgeItem, McpRoleMeta, User } from '@/types'

interface Agent {
  id: string
  name: string
  role: 'admin' | 'worker'
  aiRole?: 'assistant_admin' | 'digital_member' | 'admin' | 'worker'
  tokensUsed: number
  tokenLimit: number
  generation: number
  status: 'learning' | 'working' | 'reproducing' | 'dead'
  platform: string
  currentTask?: string
  summary?: string
  projectId?: string
  projectName?: string
  aiConfigId?: number
  enabled?: boolean
  mcpEnabled?: boolean
  mcpTools?: string
  runtimeStatus?: string
  runtimeTool?: string
  digitalMemberRole?: 'manager' | 'member'
  currentTaskTitle?: string
  currentTaskStatus?: string
  activeRunStatus?: string
  latestThinking?: string
}

interface Props {
  currentUserId?: number
  adminAgents: Agent[]
  memberAgents: Agent[]
  activeAgents: Agent[]
  connectedDevices: ConnectedDevice[]
  knowledgeItems: KnowledgeItem[]
  knowledgeTotalCount: number
  brainViewMode: 'sections' | 'all'
  focusedAiConfigId?: number | null
  focusSignal?: number
  knowledgeFocusSignal?: number
  focusedDeviceId?: string
  deviceFocusSignal?: number
  mcpRoleMeta: McpRoleMeta
  roleMcpPermissions: Record<string, string[]>
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:brain-view-mode', value: Props['brainViewMode']): void
  (e: 'show-tasks', agent: Agent): void
  (e: 'show-task-detail', payload: { agent: Agent; jobId: string }): void
  (e: 'chat', agent: Agent): void
  (e: 'settings', agent: Agent): void
  (e: 'create-ai'): void
  (e: 'refresh-user', user: User): void
  (e: 'view-all-mcp'): void
  (e: 'manage-device-tools', payload?: { deviceType?: string }): void
  (e: 'toggle-role-tool', payload: { role: string; tool: string; checked: boolean }): void
  (e: 'save-role-mcp-permissions'): void
}>()

const activeTab = ref<'brain' | 'knowledge' | 'workshop'>('brain')

watch(() => props.focusSignal, () => {
  if (props.focusedAiConfigId) activeTab.value = 'brain'
})

watch(() => props.knowledgeFocusSignal, () => {
  activeTab.value = 'knowledge'
})

watch(() => props.deviceFocusSignal, () => {
  if (props.focusedDeviceId) activeTab.value = 'workshop'
})
</script>

<template>
  <div class="glass rounded-2xl border border-zinc-200 shadow-sm flex flex-col overflow-hidden h-full dark:bg-zinc-900/80 dark:border-zinc-800 transition-all duration-300 hover:shadow-md">
    <!-- Tab Header -->
    <div class="px-2 py-2 border-b border-zinc-100 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div class="flex p-1 bg-zinc-100/50 rounded-lg dark:bg-zinc-800/50">
        <button 
          @click="activeTab = 'brain'"
          class="flex-1 min-w-0 lg:min-w-[60px] px-2 sm:px-2.5 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold rounded-md transition-all duration-200 flex items-center justify-center gap-1 sm:gap-1.5 active:scale-[0.985] touch-manipulation whitespace-nowrap lg:whitespace-normal"
          :class="activeTab === 'brain' 
            ? 'bg-white/75 text-indigo-600 shadow-sm dark:bg-zinc-700/70 dark:text-indigo-400' 
            : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'"
        >
          <AppIcon name="brain" class="w-4 h-4" /> 数字生命
        </button>
        <button 
          @click="activeTab = 'knowledge'"
          class="flex-1 min-w-0 lg:min-w-[60px] px-2 sm:px-2.5 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold rounded-md transition-all duration-200 flex items-center justify-center gap-1 sm:gap-1.5 active:scale-[0.985] touch-manipulation whitespace-nowrap lg:whitespace-normal"
          :class="activeTab === 'knowledge' 
            ? 'bg-white/75 text-indigo-600 shadow-sm dark:bg-zinc-700/70 dark:text-indigo-400' 
            : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'"
        >
          <AppIcon name="book" class="w-4 h-4" /> 知识库
        </button>
        <button
          @click="activeTab = 'workshop'"
          class="flex-1 min-w-0 lg:min-w-[60px] px-2 sm:px-2.5 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold rounded-md transition-all duration-200 flex items-center justify-center gap-1 sm:gap-1.5 active:scale-[0.985] touch-manipulation whitespace-nowrap lg:whitespace-normal"
          :class="activeTab === 'workshop'
            ? 'bg-white/75 text-indigo-600 shadow-sm dark:bg-zinc-700/70 dark:text-indigo-400'
            : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'"
        >
          <AppIcon name="workshop" class="w-4 h-4" /> 作坊
        </button>
      </div>
    </div>
    
    <div class="flex-1 overflow-hidden flex flex-col">
      <Transition name="fade" mode="out-in">
        <BrainCorePanel
          v-if="activeTab === 'brain'"
          class="flex-1"
          no-glass
          :admin-agents="adminAgents"
          :member-agents="memberAgents"
          :view-mode="brainViewMode"
          :focused-ai-config-id="focusedAiConfigId"
          :focus-signal="focusSignal"
          @update:view-mode="emit('update:brain-view-mode', $event)"
          @show-tasks="emit('show-tasks', $event)"
          @show-task-detail="emit('show-task-detail', $event)"
          @chat="emit('chat', $event)"
          @settings="emit('settings', $event)"
          @create-ai="emit('create-ai')"
        />
        <KnowledgeBasePanel
          v-else-if="activeTab === 'knowledge'"
          class="flex-1"
          no-glass
          :items="knowledgeItems"
          :total-count="knowledgeTotalCount"
          @refresh-user="emit('refresh-user', $event)"
          @view-all-mcp="emit('view-all-mcp')"
          @manage-device-tools="emit('manage-device-tools')"
        />
        <WorkshopPanel
          v-else
          class="flex-1"
          :devices="connectedDevices"
          :agents="activeAgents"
          :mcp-role-meta="mcpRoleMeta"
          :role-mcp-permissions="roleMcpPermissions"
          :focused-device-id="focusedDeviceId"
          :focus-signal="deviceFocusSignal"
          @toggle-role-tool="emit('toggle-role-tool', $event)"
          @save-role-mcp-permissions="emit('save-role-mcp-permissions')"
        />
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
