<script setup lang="ts">
import AppIcon from '@/components/common/AppIcon.vue'
import MarkdownText from '@/components/chat/MarkdownText.vue'
import type { InstalledEndpointKind } from '@/composables/knowledge/types'
import type { KnowledgePanelApi } from '@/composables/knowledge/types'

defineProps<{ kb: KnowledgePanelApi }>()
</script>

<template>
  <div
    v-if="kb.installedClawhubModalOpen"
    :style="{ zIndex: kb.installedClawhubZIndex }"
    class="fixed inset-0 modal-overlay flex items-center justify-center p-0 sm:p-4"
    role="dialog"
    aria-modal="true"
    aria-label="本地知识快照"
    @click.self="kb.requestCloseInstalledClawHubModal"
  >
    <div class="acrylic-modal h-app-viewport w-full max-w-5xl rounded-none shadow-2xl flex flex-col border-0 sm:h-[88vh] sm:rounded-2xl sm:border border-zinc-200 dark:border-zinc-800">
      <div class="flex items-center justify-between px-5 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <div class="min-w-0">
          <div class="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">
            {{ kb.installedClawhubSelected?.skill?.displayName || kb.installedClawhubSelected?.slug || (kb.installedClawhubIsKnowledge ? '传承知识' : '本地快照') }}
          </div>
          <div class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 truncate">
            {{ kb.installedClawhubSelected?.slug || '加载中' }}
          </div>
        </div>
        <button type="button" class="ml-3 flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label="关闭本地快照" @click="kb.requestCloseInstalledClawHubModal">
          <AppIcon name="close" class="h-4 w-4" />
        </button>
      </div>

      <div v-if="kb.installedClawhubLoading" class="flex-1 flex items-center justify-center text-sm text-zinc-400">加载中…</div>
      <div v-else class="flex-1 min-h-0 flex flex-col">
        <div class="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span class="px-2 py-1 rounded bg-zinc-100/60 dark:bg-zinc-800/60">{{ kb.installedClawhubIsKnowledge ? '知识' : (kb.installedClawhubSelected?.skill?.version || 'latest') }}</span>
            <span class="px-2 py-1 rounded bg-zinc-100/60 dark:bg-zinc-800/60">{{ kb.installedClawhubSelected?.present ? '文件可用' : '文件缺失' }}</span>
            <label v-if="!kb.installedClawhubIsKnowledge" class="flex items-center gap-1">
              端
              <select
                :value="kb.installedEndpointKind"
                :disabled="kb.installedEndpointSaving || !kb.installedClawhubSelected"
                class="text-[11px] text-zinc-700 dark:text-zinc-200 bg-white/60 dark:bg-zinc-900/50 px-1.5 py-1 rounded border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800 disabled:opacity-60"
                @change="kb.applyInstalledEndpoint(($event.target as HTMLSelectElement).value as InstalledEndpointKind)"
              >
                <option value="any">通用</option>
                <option value="desktop">桌面端</option>
                <option value="browser">浏览器端</option>
              </select>
            </label>
            <span class="px-2 py-1 rounded bg-zinc-100/60 dark:bg-zinc-800/60 truncate max-w-[20rem]">{{ kb.installedClawhubSelected?.path || '' }}</span>
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              class="px-3 py-1.5 rounded border text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              :class="kb.installedClawhubEditMode
                ? 'border-indigo-300 bg-indigo-50 text-indigo-600 dark:border-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300'
                : 'border-zinc-200 bg-white/75 text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-900/60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'"
              :disabled="!kb.installedClawhubSelected"
              @click.stop.prevent="kb.installedClawhubEditMode = !kb.installedClawhubEditMode"
            >
              {{ kb.installedClawhubEditMode ? '预览' : '编辑' }}
            </button>
            <button
              type="button"
              class="px-3 py-1.5 rounded border border-rose-200 bg-white/75 text-xs text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-900/60 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
              :disabled="kb.installedClawhubDeleting || !kb.installedClawhubSelected"
              @click.stop.prevent="kb.removeInstalledClawHubSkill"
            >
              {{ kb.installedClawhubDeleting ? '删除中…' : '删除' }}
            </button>
            <button
              v-if="kb.installedClawhubEditMode"
              type="button"
              class="px-3 py-1.5 rounded bg-indigo-600 text-xs text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="kb.installedClawhubSaving || !kb.installedClawhubSelected"
              @click.stop.prevent="kb.saveInstalledClawHubSkill"
            >
              {{ kb.installedClawhubSaving ? '保存中…' : '保存' }}
            </button>
          </div>
        </div>
        <div v-if="kb.installedClawhubError" class="mx-5 mt-3 text-xs text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900 rounded-lg px-3 py-2">
          {{ kb.installedClawhubError }}
        </div>
        <div v-if="kb.installedClawhubNotice" class="mx-5 mt-3 text-xs text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 rounded-lg px-3 py-2">
          {{ kb.installedClawhubNotice }}
        </div>
        <div class="flex-1 min-h-0 p-5 overflow-y-auto">
          <div
            v-if="!kb.installedClawhubEditMode"
            class="h-full text-xs leading-relaxed text-zinc-700 dark:text-zinc-200 bg-zinc-50/60 dark:bg-zinc-800/40 p-4 rounded-lg border border-zinc-100 dark:border-zinc-800"
          >
            <MarkdownText
              v-if="kb.installedClawhubPreview.trim()"
              :text="kb.installedClawhubPreview"
            />
            <div v-else class="text-zinc-400">（无内容）</div>
          </div>
          <textarea
            v-else
            v-model="kb.installedClawhubDraft"
            class="w-full h-full resize-none whitespace-pre font-mono text-xs leading-relaxed text-zinc-700 dark:text-zinc-200 bg-zinc-50/60 dark:bg-zinc-800/40 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800"
            spellcheck="false"
          />
        </div>
      </div>
    </div>
  </div>
</template>
