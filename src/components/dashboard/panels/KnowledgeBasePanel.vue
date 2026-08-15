<script setup lang="ts">
import AppIcon from '@/components/common/AppIcon.vue'
import McpAiTestModal from '@/components/dashboard/modals/McpAiTestModal.vue'
import { useKnowledgeBasePanel } from '@/composables/knowledge/useKnowledgeBasePanel'
import type { KnowledgeItem, User } from '@/types'
import ClawHubInspectModal from './knowledge/ClawHubInspectModal.vue'
import ClawHubInstallModal from './knowledge/ClawHubInstallModal.vue'
import InheritanceSkillsView from './knowledge/InheritanceSkillsView.vue'
import InheritanceThoughtsView from './knowledge/InheritanceThoughtsView.vue'
import KnowledgeEntryDetailView from './knowledge/KnowledgeEntryDetailView.vue'
import PersonaDetailView from './knowledge/PersonaDetailView.vue'
import PromptSectionsView from './knowledge/PromptSectionsView.vue'

defineOptions({
  inheritAttrs: false,
})

interface Props {
  items: KnowledgeItem[]
  totalCount: number
  noGlass?: boolean
}

defineProps<Props>()
const emit = defineEmits<{
  (e: 'refresh-user', user: User): void
  (e: 'view-all-mcp'): void
  (e: 'manage-device-tools', payload?: { deviceType?: string }): void
}>()

const kb = useKnowledgeBasePanel(emit)
</script>

<template>
  <div v-bind="kb.rootAttrs" :class="[
    kb.attrs.class,
    'p-4 flex-1 flex flex-col overflow-hidden transition-all duration-300',
    noGlass ? '' : 'glass rounded-2xl border border-zinc-200 shadow-sm dark:bg-zinc-900/80 dark:border-zinc-800 hover:shadow-md'
  ]">
    <div class="flex justify-between items-center border-b border-zinc-100 pb-2 mb-2 dark:border-zinc-800">
      <h2 v-if="!noGlass" class="font-bold text-zinc-800 flex items-center gap-2 dark:text-zinc-100">
        <AppIcon name="book" class="w-[18px] h-[18px]" /> 知识库
      </h2>
      <div v-else class="flex items-center gap-2">
        <span class="text-xs font-semibold text-zinc-500 dark:text-zinc-400">知识库</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs bg-zinc-100/60 px-2 py-0.5 rounded-full text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-300">{{ totalCount }} 条目</span>
      </div>
    </div>
    
    <div class="overflow-y-auto pr-1 space-y-2 flex-1 custom-scrollbar">
      <div v-if="items.length === 0" class="text-center text-zinc-400 text-xs py-10 dark:text-zinc-500">
        暂无知识库条目
      </div>
      <TransitionGroup name="list" tag="div" class="space-y-2">
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          class="w-full text-center p-5 bg-zinc-50/60 rounded border border-zinc-100 hover:border-indigo-200 transition-all duration-200 cursor-pointer group hover:scale-[1.01] hover:shadow-sm dark:bg-zinc-800/60 dark:border-zinc-700 dark:hover:border-indigo-400"
          @click="kb.openDetail(item)"
        >
          <h4 class="text-lg font-medium text-zinc-800 group-hover:text-indigo-600 truncate dark:text-zinc-100 dark:group-hover:text-indigo-300">{{ item.title }}</h4>
        </button>
      </TransitionGroup>
    </div>

    <Teleport to="body">
    <div
      v-if="kb.detailOpen"
      :style="{ zIndex: kb.detailZIndex }"
      class="fixed inset-0 modal-overlay flex items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="knowledge-detail-title"
      @click.self="kb.navigateBackOrCloseDetail"
    >
      <div class="acrylic-modal w-full max-w-7xl h-app-viewport sm:h-[92vh] flex flex-col overflow-hidden rounded-none sm:rounded-2xl shadow-2xl border-0 sm:border border-zinc-200 dark:border-zinc-800">
        <header class="shrink-0 border-b border-zinc-200/80 bg-white/45 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950/25 sm:px-6">
          <div class="flex items-center gap-2 sm:gap-3">
            <button
              :ref="kb.assignDetailCloseButton"
              type="button"
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 active:scale-95 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              :aria-label="kb.canGoBackDetail ? '返回上一级' : '关闭知识库详情'"
              :title="kb.canGoBackDetail ? '返回上一级（Esc）' : '关闭（Esc）'"
              @click="kb.navigateBackOrCloseDetail"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <h2 id="knowledge-detail-title" class="truncate text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {{ kb.detailPresentation.title }}
            </h2>
          </div>
        </header>

        <div
          v-if="!kb.detailLoading && !kb.detailError && kb.currentDetail && kb.detailSearchVisible"
          class="shrink-0 border-b border-zinc-100 bg-zinc-50/50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/25 sm:px-6"
        >
          <div class="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center">
            <label class="relative min-w-0 flex-1">
              <span class="sr-only">筛选当前栏目</span>
              <AppIcon name="search" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                v-model="kb.detailQuery"
                type="search"
                class="w-full rounded-xl border border-zinc-200 bg-white/80 py-2.5 pl-9 pr-9 text-sm text-zinc-800 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-100 dark:focus:border-indigo-700 dark:focus:ring-indigo-950"
                :placeholder="kb.detailPresentation.searchPlaceholder"
              />
              <button
                v-if="kb.detailQuery"
                type="button"
                class="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                aria-label="清空搜索"
                @click="kb.detailQuery = ''"
              >
                <AppIcon name="close" class="h-3 w-3" />
              </button>
            </label>
            <div class="shrink-0 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 sm:min-w-[9rem] sm:text-right">
              {{ kb.detailPresentation.resultText }}
            </div>
          </div>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar sm:p-6">
          <div v-if="kb.detailLoading" class="mx-auto max-w-6xl space-y-3 py-5" aria-live="polite">
            <div class="h-20 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/70"></div>
            <div class="h-28 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/70"></div>
            <div class="h-28 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/70"></div>
            <div class="text-center text-xs text-zinc-400">正在整理栏目内容…</div>
          </div>
          <div v-else-if="kb.detailError" class="mx-auto flex max-w-md flex-col items-center py-16 text-center" role="alert">
            <div class="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500 dark:bg-rose-950/40 dark:text-rose-300">
              <AppIcon name="warning" class="h-5 w-5" />
            </div>
            <div class="mt-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">栏目加载失败</div>
            <div class="mt-1 text-xs leading-relaxed text-rose-500 dark:text-rose-300">{{ kb.detailError }}</div>
            <button type="button" class="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500" @click="kb.retryDetail">
              重新加载
            </button>
          </div>
          <template v-else-if="kb.currentDetail">
            <div class="mx-auto max-w-6xl">
              <PersonaDetailView v-if="kb.intrinsicPersonas" :kb="kb" />
              <PromptSectionsView v-else-if="kb.systemPrompts" :kb="kb" />
              <InheritanceSkillsView
                v-else-if="kb.inheritanceSkills"
                :kb="kb"
                @view-all-mcp="emit('view-all-mcp')"
                @manage-device-tools="emit('manage-device-tools')"
              />
              <InheritanceThoughtsView v-else-if="kb.inheritanceThoughts" :kb="kb" />
              <KnowledgeEntryDetailView v-else :kb="kb" />

              <div v-if="kb.currentDetail.source_job_id" class="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
                来源任务：{{ kb.currentDetail.source_job_id }} · 第 {{ kb.currentDetail.source_generation || 1 }} 代
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
    <ClawHubInstallModal :kb="kb" />
    <ClawHubInspectModal :kb="kb" />
    <McpAiTestModal
      v-model:show="kb.mcpTestModalOpen"
      :tool-name="kb.mcpTestTarget?.tool?.name || ''"
      :device-id="kb.mcpTestTarget?.device?.device_id || ''"
      :device-type="kb.mcpTestTarget?.device?.device_type || 'desktop'"
      :description="kb.mcpTestTarget?.tool?.description || ''"
      :input-schema="kb.mcpTestInputSchema"
      @close="kb.closeMcpTestModal"
    />
    </Teleport>
  </div>
</template>
