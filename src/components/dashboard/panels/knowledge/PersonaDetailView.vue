<script setup lang="ts">
import type { KnowledgePanelApi } from '@/composables/knowledge/types'

defineProps<{ kb: KnowledgePanelApi }>()
</script>

<template>
  <div class="space-y-3">
    <div v-if="kb.personaEditNotice" class="text-xs text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 rounded-lg px-3 py-2">
      {{ kb.personaEditNotice }}
    </div>
    <div v-if="kb.personaEditError" class="text-xs text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900 rounded-lg px-3 py-2">
      {{ kb.personaEditError }}
    </div>
    <div v-if="kb.filteredPersonaAgents.length" class="overflow-x-auto border-b border-zinc-200 custom-scrollbar dark:border-zinc-700" role="tablist" aria-label="AI 成员栏目">
      <div class="flex min-w-max items-end gap-1 px-1">
        <button
          v-for="agent in kb.filteredPersonaAgents"
          :key="agent.id || agent.name"
          type="button"
          role="tab"
          class="relative min-w-[8rem] whitespace-nowrap rounded-t-xl border border-b-0 px-5 py-3 text-sm font-semibold transition-colors"
          :class="kb.detailPersonaId === agent.id
            ? 'border-indigo-200 bg-white text-indigo-600 dark:border-indigo-800 dark:bg-zinc-900 dark:text-indigo-300'
            : 'border-transparent bg-zinc-100/60 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'"
          :aria-selected="kb.detailPersonaId === agent.id"
          @click="kb.selectPersonaSection(agent)"
        >
          {{ agent.name }}
        </button>
      </div>
    </div>
    <section v-if="kb.detailAgent" class="min-h-[28rem] rounded-b-xl border border-t-0 border-zinc-200 bg-white/75 p-5 dark:border-zinc-700 dark:bg-zinc-900/40">
      <header class="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 pb-4 dark:border-zinc-800">
        <div>
          <h3 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{{ kb.detailAgent.name }}</h3>
          <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ kb.detailAgent.platform }} · 第 {{ kb.detailAgent.generation }} 代 · {{ kb.detailAgent.model || '未设置模型' }}</p>
        </div>
        <div class="flex flex-wrap gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
          <span class="rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800">ID {{ kb.detailAgent.id }}</span>
          <span class="rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800">{{ kb.detailAgent.role }}</span>
          <span v-if="kb.detailAgent.is_librarian" class="rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800">图书管理员</span>
        </div>
      </header>
      <label class="block">
        <span class="mb-2 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">人格 Prompt</span>
        <textarea
          :value="kb.personaDraftPrompt"
          rows="18"
          class="min-h-[22rem] w-full resize-y whitespace-pre-wrap rounded-xl border border-zinc-200 bg-white/90 p-4 font-mono text-xs leading-relaxed text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-zinc-700 dark:bg-zinc-950/70 dark:text-zinc-200 dark:focus:ring-indigo-800"
          @input="kb.personaDraftPrompt = ($event.target as HTMLTextAreaElement).value"
        />
      </label>
      <div class="mt-4 flex justify-end">
        <button
          type="button"
          class="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="kb.savingPersonaId === kb.detailAgent.id || !kb.personaHasUnsavedChanges"
          @click="kb.savePersona(kb.detailAgent)"
        >
          {{ kb.savingPersonaId === kb.detailAgent.id ? '保存中…' : '保存人格 Prompt' }}
        </button>
      </div>
    </section>
    <div v-if="kb.filteredPersonaAgents.length === 0" class="rounded-xl border border-dashed border-zinc-200 px-4 py-12 text-center dark:border-zinc-700">
      <div class="text-sm font-medium text-zinc-600 dark:text-zinc-300">没有匹配的 AI</div>
      <button type="button" class="mt-2 text-xs text-indigo-600 hover:underline dark:text-indigo-300" @click="kb.detailQuery = ''">清空搜索条件</button>
    </div>
  </div>
</template>
