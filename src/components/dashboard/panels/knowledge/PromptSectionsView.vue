<script setup lang="ts">
import type { KnowledgePanelApi } from '@/composables/knowledge/types'

defineProps<{ kb: KnowledgePanelApi }>()
</script>

<template>
  <div class="space-y-4">
    <div v-if="kb.promptEditNotice" class="text-xs text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 rounded-lg px-3 py-2">
      {{ kb.promptEditNotice }}
    </div>
    <div v-if="kb.promptEditError" class="text-xs text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900 rounded-lg px-3 py-2">
      {{ kb.promptEditError }}
    </div>
    <div v-if="kb.filteredPromptSections.length" class="overflow-x-auto border-b border-zinc-200 custom-scrollbar dark:border-zinc-700" role="tablist" aria-label="固有思想栏目">
      <div class="flex min-w-max items-end gap-1 px-1">
        <button
          v-for="section in kb.filteredPromptSections"
          :key="section.key"
          type="button"
          role="tab"
          class="min-w-[10rem] whitespace-nowrap rounded-t-xl border border-b-0 px-5 py-3 text-sm font-semibold transition-colors"
          :class="kb.selectedPromptSection?.key === section.key
            ? 'border-indigo-200 bg-white text-indigo-600 dark:border-indigo-800 dark:bg-zinc-900 dark:text-indigo-300'
            : 'border-transparent bg-zinc-100/60 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'"
          :aria-selected="kb.selectedPromptSection?.key === section.key"
          @click="kb.selectPromptSection(section)"
        >
          {{ section.title }}
        </button>
      </div>
    </div>
    <section v-if="kb.selectedPromptSection" class="min-h-[28rem] overflow-hidden rounded-b-xl border border-t-0 border-zinc-200 bg-white/75 dark:border-zinc-700 dark:bg-zinc-900/40">
      <header class="flex items-center justify-end gap-3 border-b border-zinc-100 px-5 py-2.5 dark:border-zinc-800">
        <div class="flex shrink-0 items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span>{{ kb.selectedPromptSection.count }} 项</span>
          <button
            v-if="kb.editingPromptSection !== kb.selectedPromptSection.key"
            type="button"
            class="rounded-lg border border-indigo-200 bg-white/75 px-3 py-1.5 text-xs text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-zinc-900/60 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
            @click="kb.startEditPromptSection(kb.selectedPromptSection)"
          >
            编辑
          </button>
        </div>
      </header>
      <div v-if="kb.selectedPromptSection.items.length" class="overflow-x-auto border-b border-zinc-100 bg-zinc-50/70 custom-scrollbar dark:border-zinc-800 dark:bg-zinc-950/30" role="tablist" :aria-label="`${kb.selectedPromptSection.title}子设置`">
        <div class="flex min-w-max gap-1 px-4 pt-3">
          <button
            v-for="item in kb.selectedPromptSection.items"
            :key="item.key"
            type="button"
            role="tab"
            class="whitespace-nowrap rounded-t-lg border border-b-0 px-4 py-2 text-xs font-medium transition-colors"
            :class="kb.selectedPromptItem?.key === item.key
              ? 'border-indigo-200 bg-white text-indigo-600 dark:border-indigo-800 dark:bg-zinc-900 dark:text-indigo-300'
              : 'border-transparent text-zinc-500 hover:bg-white/70 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'"
            :aria-selected="kb.selectedPromptItem?.key === item.key"
            @click="kb.activePromptItemKey = item.key"
          >
            {{ item.label }}
          </button>
        </div>
      </div>
      <div class="divide-y divide-zinc-100 dark:divide-zinc-800">
        <div
          v-if="kb.selectedPromptItem"
          :key="kb.selectedPromptItem.key"
          class="min-h-[22rem] px-5 py-5"
        >
          <div class="flex items-center justify-between gap-3 mb-1">
            <div class="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{{ kb.selectedPromptItem.label }}</div>
            <code class="text-[10px] text-zinc-400 dark:text-zinc-500">{{ kb.selectedPromptItem.key }}</code>
          </div>
          <input
            v-if="kb.editingPromptSection === kb.selectedPromptSection.key && kb.selectedPromptItem.type === 'number'"
            :value="kb.promptDraftValue(kb.selectedPromptItem.key)"
            type="number"
            min="0"
            max="3600"
            class="w-full text-xs text-zinc-700 dark:text-zinc-200 bg-white/60 dark:bg-zinc-900/50 px-2 py-1.5 rounded border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800"
            @input="kb.updatePromptDraftValue(kb.selectedPromptItem.key, Number(($event.target as HTMLInputElement).value || 0))"
          />
          <textarea
            v-else-if="kb.editingPromptSection === kb.selectedPromptSection.key"
            :value="kb.promptDraftValue(kb.selectedPromptItem.key)"
            rows="16"
            class="mt-2 min-h-[20rem] w-full resize-y whitespace-pre-wrap rounded-xl border border-zinc-200 bg-white/60 p-4 font-mono text-xs leading-relaxed text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200 dark:focus:ring-indigo-800"
            @input="kb.updatePromptDraftValue(kb.selectedPromptItem.key, ($event.target as HTMLTextAreaElement).value)"
          />
          <pre v-else class="mt-2 min-h-[20rem] whitespace-pre-wrap rounded-xl border border-zinc-100 bg-white/60 p-4 font-mono text-xs leading-relaxed text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200">{{ kb.selectedPromptItem.content || '（空）' }}</pre>
        </div>
        <div v-if="kb.editingPromptSection === kb.selectedPromptSection.key" class="flex justify-end gap-2 px-5 py-4">
          <button
            type="button"
            class="px-3 py-1.5 rounded border border-zinc-200 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            :disabled="kb.savingPromptSection === kb.selectedPromptSection.key"
            @click="kb.cancelEditPromptSection"
          >
            取消
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded bg-indigo-600 text-xs text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="kb.savingPromptSection === kb.selectedPromptSection.key"
            @click="kb.savePromptSection(kb.selectedPromptSection)"
          >
            {{ kb.savingPromptSection === kb.selectedPromptSection.key ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>
    </section>
    <div v-if="kb.filteredPromptSections.length === 0" class="rounded-xl border border-dashed border-zinc-200 px-4 py-12 text-center dark:border-zinc-700">
      <div class="text-sm font-medium text-zinc-600 dark:text-zinc-300">没有匹配的配置项</div>
      <button type="button" class="mt-2 text-xs text-indigo-600 hover:underline dark:text-indigo-300" @click="kb.detailQuery = ''">清空搜索条件</button>
    </div>
  </div>
</template>
