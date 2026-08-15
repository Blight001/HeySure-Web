<script setup lang="ts">
import { endpointLabel } from '@/composables/knowledge/knowledgeFormat'
import type { ThoughtEndpointFilter } from '@/composables/knowledge/types'
import type { KnowledgePanelApi } from '@/composables/knowledge/types'

defineProps<{ kb: KnowledgePanelApi }>()

const THOUGHT_ENDPOINT_FILTERS: Array<{ v: ThoughtEndpointFilter; t: string }> = [
  { v: 'all', t: '全部' },
  { v: 'any', t: '通用' },
  { v: 'desktop', t: '桌面端' },
  { v: 'browser', t: '浏览器端' },
]
</script>

<template>
  <div v-if="kb.inheritanceThoughts" class="space-y-4">
    <div v-if="kb.clawhubNotice" class="text-xs text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 rounded-lg px-3 py-2">
      {{ kb.clawhubNotice }}
    </div>
    <div v-if="kb.clawhubError" class="text-xs text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900 rounded-lg px-3 py-2">
      {{ kb.clawhubError }}
    </div>

    <section class="rounded-lg border border-zinc-100 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-800/40 p-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="text-xs font-semibold text-zinc-700 dark:text-zinc-200">ClawHub</div>
          <div class="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 break-all">
            {{ kb.inheritanceThoughts.registry_url }} · 本地快照默认不自动启用
          </div>
        </div>
        <button
          type="button"
          class="px-3 py-2 rounded bg-indigo-600 text-xs text-white hover:bg-indigo-500"
          @click.stop.prevent="kb.openClawHubModal"
        >
          搜索 ClawHub
        </button>
      </div>
    </section>

    <section v-if="kb.inheritanceThoughts.installed.length" class="space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="text-xs font-semibold text-zinc-500 dark:text-zinc-400">已安装</div>
        <div class="flex items-center gap-1 text-[10px]">
          <button
            v-for="opt in THOUGHT_ENDPOINT_FILTERS"
            :key="opt.v"
            type="button"
            class="px-1.5 py-0.5 rounded border transition-colors"
            :class="kb.thoughtEndpointFilter === opt.v ? 'border-indigo-300 bg-indigo-50 text-indigo-600 dark:border-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300' : 'border-zinc-200 text-zinc-500 hover:border-indigo-200 dark:border-zinc-700 dark:text-zinc-400'"
            @click.stop.prevent="kb.thoughtEndpointFilter = opt.v"
          >{{ opt.t }}</button>
        </div>
      </div>
      <div v-if="kb.filteredInstalledThoughts.length === 0" class="rounded-xl border border-dashed border-zinc-200 px-4 py-10 text-center dark:border-zinc-700">
        <div class="text-sm font-medium text-zinc-600 dark:text-zinc-300">没有匹配的传承思想</div>
        <button
          type="button"
          class="mt-2 text-xs text-indigo-600 hover:underline dark:text-indigo-300"
          @click="kb.detailQuery = ''; kb.thoughtEndpointFilter = 'all'"
        >
          清空搜索与端筛选
        </button>
      </div>
      <button
        v-for="skill in kb.filteredInstalledThoughts"
        :key="skill.slug"
        type="button"
        class="w-full text-left rounded-lg border border-zinc-100 bg-zinc-50/60 hover:border-indigo-200 dark:border-zinc-800 dark:bg-zinc-800/40 dark:hover:border-indigo-700 px-3 py-2 transition-colors"
        @click.stop.prevent="kb.openInheritanceThoughtItem(skill)"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="text-xs font-semibold text-zinc-800 dark:text-zinc-100 truncate">{{ skill.displayName || skill.slug }}</div>
            <code class="text-[11px] text-indigo-600 dark:text-indigo-300 break-all">{{ skill.slug }}</code>
          </div>
          <div class="flex flex-wrap items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
            <span class="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">{{ endpointLabel(skill.endpoint_kind) }}</span>
            <span class="px-1.5 py-0.5 rounded bg-white/75 dark:bg-zinc-900/60">{{ skill.kind === 'knowledge' ? '知识' : (skill.version || 'latest') }}</span>
            <span class="px-1.5 py-0.5 rounded bg-white/75 dark:bg-zinc-900/60">{{ skill.present ? '文件可用' : '文件缺失' }}</span>
            <span class="px-1.5 py-0.5 rounded bg-white/75 dark:bg-zinc-900/60 text-indigo-600 dark:text-indigo-300">查看/编辑</span>
          </div>
        </div>
      </button>
    </section>
  </div>
</template>
