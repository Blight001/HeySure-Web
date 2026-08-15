<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MaintenanceArtifact, MaintenanceEvent, MaintenanceTaskDetail } from '@/api/maintenance'
import { artifactGroups, formatElapsed, PHASE_LABELS, STATUS_LABELS } from '@/utils/maintenanceFormat'
import MaintenanceArtifacts from './MaintenanceArtifacts.vue'
import MaintenanceTimeline from './MaintenanceTimeline.vue'

const props = defineProps<{ task: MaintenanceTaskDetail | null; events: MaintenanceEvent[]; loading: boolean }>()
const emit = defineEmits<{
  (e: 'steer', message: string): void
  (e: 'interrupt'): void
  (e: 'decide', approvalId: string, decision: 'accept' | 'decline'): void
}>()

const tabs = [
  ['overview', '概览'], ['timeline', '过程'], ['diff', '变更'], ['test', '测试'],
  ['commit', '提交'], ['release', '发布'], ['audit', '审计'],
] as const
const activeTab = ref<(typeof tabs)[number][0]>('timeline')
const steerText = ref('')
const submitting = ref(false)
const artifactKind = (kind: string) => {
  const value = kind.toLowerCase()
  if (value.includes('diff') || value.includes('file')) return 'diff'
  if (value.includes('test')) return 'test'
  if (value.includes('commit') || value.includes('push')) return 'commit'
  if (value.includes('release') || value.includes('deploy')) return 'release'
  if (value.includes('approval') || value.includes('audit')) return 'audit'
  return ''
}
const eventArtifacts = computed<MaintenanceArtifact[]>(() => props.events.flatMap((event) => {
  const kind = artifactKind(event.kind)
  if (!kind) return []
  return [{ id: `event-${event.id}`, kind, title: event.summary || event.kind, content: event.detail, metadata: event.metadata, created_at: event.created_at }]
}))
const groups = computed(() => artifactGroups([...(props.task?.artifacts || []), ...eventArtifacts.value]))
const pendingApprovals = computed(() => (props.task?.approvals || []).filter(item => item.status === 'pending'))
const canControl = computed(() => props.task && ['queued', 'running', 'waiting_user'].includes(props.task.status))

const sendSteer = async () => {
  const value = steerText.value.trim()
  if (!value || submitting.value) return
  submitting.value = true
  try {
    emit('steer', value)
    steerText.value = ''
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div v-if="loading" class="flex h-full items-center justify-center text-sm text-zinc-500">正在加载任务详情…</div>
  <div v-else-if="!task" class="flex h-full items-center justify-center p-8 text-center">
    <div><div class="text-base font-semibold">选择一个维护任务</div><p class="mt-1 text-sm text-zinc-500">查看 Codex 的实时过程、变更与审批</p></div>
  </div>
  <div v-else class="flex h-full min-h-0 flex-col">
    <header class="border-b border-zinc-200 p-4 dark:border-zinc-800">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0"><h2 class="text-lg font-bold">{{ task.title }}</h2><p class="mt-1 text-xs text-zinc-500">工单 {{ task.id }}</p></div>
        <button v-if="canControl" class="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30" @click="emit('interrupt')">中止执行</button>
      </div>
      <div class="mt-3 flex flex-wrap gap-2 text-xs">
        <span class="rounded-full bg-indigo-500/10 px-2.5 py-1 text-indigo-600">{{ STATUS_LABELS[task.status] || task.status }}</span>
        <span class="rounded-full bg-zinc-500/10 px-2.5 py-1">{{ PHASE_LABELS[task.phase] || task.phase }}</span>
        <span class="rounded-full bg-zinc-500/10 px-2.5 py-1">已用时 {{ formatElapsed(task.started_at || task.created_at, task.completed_at) }}</span>
        <span class="rounded-full px-2.5 py-1" :class="task.device_online ? 'bg-emerald-500/10 text-emerald-600' : 'bg-zinc-500/10 text-zinc-500'">设备{{ task.device_online ? '在线' : '离线' }}</span>
      </div>
    </header>

    <div v-if="pendingApprovals.length" class="space-y-2 border-b border-amber-200 bg-amber-50/80 p-3 dark:border-amber-900 dark:bg-amber-950/20">
      <div v-for="approval in pendingApprovals" :key="approval.id" class="flex flex-wrap items-center justify-between gap-3">
        <div><div class="text-sm font-semibold text-amber-800 dark:text-amber-300">{{ approval.title }}</div><p v-if="approval.description" class="text-xs text-amber-700/80 dark:text-amber-400">{{ approval.description }}</p></div>
        <div class="flex gap-2"><button class="rounded-lg border border-zinc-300 px-3 py-1 text-xs" @click="emit('decide', approval.id, 'decline')">拒绝</button><button class="rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-white" @click="emit('decide', approval.id, 'accept')">批准</button></div>
      </div>
    </div>

    <nav class="flex gap-1 overflow-x-auto border-b border-zinc-200 px-3 dark:border-zinc-800">
      <button v-for="tab in tabs" :key="tab[0]" class="shrink-0 border-b-2 px-3 py-2 text-xs font-medium" :class="activeTab === tab[0] ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-zinc-500'" @click="activeTab = tab[0]">{{ tab[1] }}</button>
    </nav>

    <main class="min-h-0 flex-1 overflow-y-auto p-4">
      <div v-if="activeTab === 'overview'" class="space-y-4 text-sm">
        <section><h3 class="font-semibold">问题描述</h3><p class="mt-2 whitespace-pre-wrap text-zinc-600 dark:text-zinc-300">{{ task.description || '未提供' }}</p></section>
        <section v-if="task.result_summary"><h3 class="font-semibold">结果摘要</h3><p class="mt-2 whitespace-pre-wrap text-zinc-600 dark:text-zinc-300">{{ task.result_summary }}</p></section>
        <dl class="grid gap-3 sm:grid-cols-2"><div><dt class="text-xs text-zinc-500">工作分支</dt><dd class="mt-1 font-mono text-xs">{{ task.branch_name || '尚未创建' }}</dd></div><div><dt class="text-xs text-zinc-500">基准提交</dt><dd class="mt-1 font-mono text-xs">{{ task.base_sha || '尚未记录' }}</dd></div></dl>
      </div>
      <MaintenanceTimeline v-else-if="activeTab === 'timeline'" :events="events" />
      <MaintenanceArtifacts v-else :items="groups[activeTab] || []" :kind="activeTab" />
    </main>

    <form v-if="canControl" class="flex gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800" @submit.prevent="sendSteer">
      <textarea v-model="steerText" rows="2" class="min-h-[42px] flex-1 resize-none rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900" placeholder="随时补充信息或调整 Codex 的执行方向…"></textarea>
      <button :disabled="!steerText.trim() || submitting" class="self-end rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">发送</button>
    </form>
  </div>
</template>
