<script setup lang="ts">
import AppIcon from '@/components/common/AppIcon.vue'
import type { KnowledgePanelApi } from '@/composables/knowledge/types'

defineProps<{ kb: KnowledgePanelApi }>()
</script>

<template>
  <div
    v-if="kb.clawhubModalOpen"
    :style="{ zIndex: kb.clawhubZIndex }"
    class="fixed inset-0 modal-overlay flex items-center justify-center p-0 sm:p-4"
    role="dialog"
    aria-modal="true"
    aria-label="ClawHub 搜索"
    @click.self="kb.closeClawHubModal"
  >
    <div class="acrylic-modal h-app-viewport w-full max-w-6xl rounded-none shadow-2xl flex flex-col border-0 sm:h-[88vh] sm:rounded-2xl sm:border border-zinc-200 dark:border-zinc-800">
      <div class="flex items-center justify-between px-5 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <div class="min-w-0">
          <div class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">ClawHub 搜索</div>
          <div class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 truncate">
            {{ kb.inheritanceThoughts?.registry_url || 'https://clawhub.ai' }}
          </div>
        </div>
        <button type="button" class="ml-3 flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label="关闭 ClawHub 搜索" @click="kb.closeClawHubModal">
          <AppIcon name="close" class="h-4 w-4" />
        </button>
      </div>

      <div class="flex-1 min-h-0 grid grid-cols-1 grid-rows-[minmax(13rem,40%)_1fr] lg:grid-cols-[22rem_1fr] lg:grid-rows-1">
        <aside class="min-h-0 border-b lg:border-b-0 lg:border-r border-zinc-100 dark:border-zinc-800 flex flex-col">
          <div class="p-3 border-b border-zinc-100 dark:border-zinc-800">
            <div class="flex gap-2">
              <input
                v-model="kb.clawhubQuery"
                type="search"
                class="min-w-0 flex-1 text-xs text-zinc-700 dark:text-zinc-200 bg-white/60 dark:bg-zinc-900/50 px-3 py-2 rounded border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800"
                placeholder="calendar、github、browser"
                @keydown.enter.prevent="kb.searchClawHub"
              />
              <button
                type="button"
                class="px-3 py-2 rounded bg-indigo-600 text-xs text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="kb.clawhubSearching"
                @click="kb.searchClawHub"
              >
                {{ kb.clawhubSearching ? '搜索中…' : '搜索' }}
              </button>
            </div>
          </div>

          <div class="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 custom-scrollbar">
            <div v-if="kb.clawhubError" class="text-xs text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900 rounded-lg px-3 py-2">
              {{ kb.clawhubError }}
            </div>
            <div v-if="kb.clawhubNotice" class="text-xs text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 rounded-lg px-3 py-2">
              {{ kb.clawhubNotice }}
            </div>
            <div v-if="!kb.clawhubSearching && kb.clawhubResults.length === 0" class="text-center text-zinc-400 text-xs py-10">
              输入关键词搜索 ClawHub
            </div>
            <button
              v-for="result in kb.clawhubResults"
              :key="result.slug"
              type="button"
              class="w-full text-left rounded-lg border px-3 py-2 transition-colors"
              :class="kb.clawhubSelected?.slug === result.slug ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/30' : 'border-zinc-100 bg-zinc-50/60 hover:border-indigo-200 dark:border-zinc-800 dark:bg-zinc-800/40 dark:hover:border-indigo-700'"
              @click.stop.prevent="kb.inspectClawHubSkill(result.slug)"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <div class="text-xs font-semibold text-zinc-800 dark:text-zinc-100 truncate">{{ result.displayName || result.slug }}</div>
                  <code class="text-[11px] text-indigo-600 dark:text-indigo-300 break-all">{{ result.slug }}</code>
                </div>
                <span v-if="kb.clawhubInspectingSlug === result.slug" class="shrink-0 text-[10px] text-zinc-400">查看中…</span>
              </div>
              <div class="mt-1 flex flex-wrap gap-2 text-[10px] text-zinc-500 dark:text-zinc-400">
                <span>{{ result.owner?.displayName || result.ownerHandle || 'unknown' }}</span>
                <span>{{ result.version || 'latest' }}</span>
                <span v-if="result.installed" class="text-emerald-600 dark:text-emerald-300">已安装</span>
              </div>
            </button>
          </div>
        </aside>

        <main class="min-h-0 flex flex-col">
          <div v-if="kb.clawhubDetailLoading" class="flex-1 flex items-center justify-center text-sm text-zinc-400">详情加载中…</div>
          <div v-else-if="kb.clawhubSelected" class="flex-1 min-h-0 flex flex-col">
            <div class="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
              <div class="min-w-0">
                <div class="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">
                  {{ kb.clawhubSelected.detail?.skill?.displayName || kb.clawhubSelected.slug }}
                </div>
                <div class="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  {{ kb.clawhubSelected.slug }} · {{ kb.clawhubSelected.version || 'latest' }} · 扫描：{{ kb.clawhubScanLabel }}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <label class="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  端
                  <select
                    v-model="kb.installEndpointKind"
                    class="text-[11px] text-zinc-700 dark:text-zinc-200 bg-white/60 dark:bg-zinc-900/50 px-1.5 py-1 rounded border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800"
                  >
                    <option value="auto">自动判断</option>
                    <option value="any">通用</option>
                    <option value="desktop">桌面端</option>
                    <option value="browser">浏览器端</option>
                  </select>
                </label>
                <button
                  type="button"
                  class="px-3 py-1.5 rounded bg-indigo-600 text-xs text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                  :disabled="kb.clawhubInstallingSlug === kb.clawhubSelected.slug"
                  @click.stop.prevent="kb.installSelectedClawHubSkill(kb.clawhubSelected.installed)"
                >
                  {{ kb.clawhubInstallingSlug === kb.clawhubSelected.slug ? '处理中…' : (kb.clawhubSelected.installed ? '更新快照' : '安装快照') }}
                </button>
              </div>
            </div>
            <div class="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
              <pre class="whitespace-pre-wrap font-mono text-xs leading-relaxed text-zinc-700 dark:text-zinc-200 bg-zinc-50/60 dark:bg-zinc-800/40 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800">{{ kb.clawhubSelected.skill_card || '（无内容）' }}</pre>
            </div>
          </div>
          <div v-else class="flex-1 flex items-center justify-center text-sm text-zinc-400">
            选择一个搜索结果查看 SKILL.md
          </div>
        </main>
      </div>
    </div>
  </div>
</template>
