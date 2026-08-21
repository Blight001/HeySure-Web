<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  importWorkflowCard,
  listWorkflowCards,
  type WorkflowCard,
} from '@/api/workflowCards'
import {
  cancelWorkflowRun,
  listWorkflowAiReviews,
  listWorkflowRuns,
  listWorkflowRunSteps,
  retryWorkflowRun,
  startWorkflowRun,
  type WorkflowAiReview,
  type WorkflowRun,
  type WorkflowStepRun,
} from '@/api/workflowRuns'
import { boundMcpDeviceIds, parseJson } from './automationDefinition'
import {
  accessScopeSummary,
  ACTIVE_RUN_STATUSES,
  cardRunSummary,
  runStatusLabel,
  statusClass,
  statusLabel,
  visibleCardTags,
} from './automationStatus'
import type { AiMemberLike, DeviceLike } from './automationTypes'
import AutomationEditorModal from './AutomationEditorModal.vue'
import AutomationRunLaunchModal from './AutomationRunLaunchModal.vue'

defineProps<{ devices: DeviceLike[]; agents: AiMemberLike[] }>()

const tab = ref<'cards' | 'runs'>('cards')
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const cards = ref<WorkflowCard[]>([])
const runs = ref<WorkflowRun[]>([])
const cardSearch = ref('')
const cardStatus = ref('')
const runModalCard = ref<WorkflowCard | null>(null)
const runDeviceId = ref('')
const runInputText = ref('{}')
const selectedRun = ref<WorkflowRun | null>(null)
const selectedSteps = ref<WorkflowStepRun[]>([])
const aiReviews = ref<WorkflowAiReview[]>([])
const editorRef = ref<{ openNew: () => void; openEdit: (card: WorkflowCard) => Promise<void> } | null>(null)
let timer: number | undefined

const filteredCards = computed(() => {
  const query = cardSearch.value.trim().toLowerCase()
  return cards.value.filter(card =>
    (!cardStatus.value || card.status === cardStatus.value)
    && (!query || `${card.name} ${card.description} ${card.tags.join(' ')}`.toLowerCase().includes(query)),
  )
})

const resetMessages = () => { error.value = ''; notice.value = '' }

const loadCards = async () => {
  loading.value = true
  try {
    cards.value = (await listWorkflowCards({ limit: 200 })).items
  } catch (cause: any) {
    error.value = cause?.message || '自动化卡片加载失败'
  } finally {
    loading.value = false
  }
}

const loadRunDetail = async (run: WorkflowRun) => {
  selectedRun.value = run
  const [stepRows, reviewRows] = await Promise.all([
    listWorkflowRunSteps(run.id), listWorkflowAiReviews(run.id),
  ])
  selectedSteps.value = stepRows.items
  aiReviews.value = reviewRows.items
}

const loadRuns = async () => {
  try {
    runs.value = (await listWorkflowRuns({ limit: 200 })).items
    if (!selectedRun.value) return
    selectedRun.value = runs.value.find(item => item.id === selectedRun.value?.id) || selectedRun.value
    await loadRunDetail(selectedRun.value)
  } catch (cause: any) {
    error.value = cause?.message || '运行历史加载失败'
  }
}

const openRun = (card: WorkflowCard) => {
  runModalCard.value = card
  const boundIds = card.definition.contractDeviceIds?.length
    ? card.definition.contractDeviceIds
    : boundMcpDeviceIds(card.definition)
  runDeviceId.value = card.default_device_id || card.definition.defaultDeviceId || boundIds[0] || ''
  const properties = card.definition.inputSchema?.properties || {}
  const sample: Record<string, any> = {}
  for (const [key, cfg] of Object.entries<any>(properties)) {
    sample[key] = cfg.default ?? (cfg.type === 'boolean' ? false : cfg.type === 'number' || cfg.type === 'integer' ? 0 : '')
  }
  runInputText.value = JSON.stringify(sample, null, 2)
}

const startRun = async () => {
  if (!runModalCard.value) return
  resetMessages()
  busy.value = true
  try {
    const run = await startWorkflowRun(runModalCard.value.id, {
      device_id: runDeviceId.value,
      input: parseJson(runInputText.value, '运行输入'),
      idempotency_key: `web:${crypto.randomUUID()}`,
    })
    runModalCard.value = null
    tab.value = 'runs'
    await loadRuns()
    await loadRunDetail(run)
  } catch (cause: any) {
    error.value = cause?.message || '启动失败'
  } finally {
    busy.value = false
  }
}

const cancelRun = async (run: WorkflowRun) => {
  await cancelWorkflowRun(run.id)
  await loadRuns()
}

const retryRun = async (run: WorkflowRun) => {
  await loadRunDetail(await retryWorkflowRun(run.id, `web-retry:${run.id}:${crypto.randomUUID()}`))
  await loadRuns()
}

const importFile = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const payload = JSON.parse(await file.text())
    await importWorkflowCard({
      name: String(payload.name || file.name.replace(/\.json$/i, '')),
      description: String(payload.description || ''),
      tags: Array.isArray(payload.tags) ? payload.tags : [],
      access_scope: ['all', 'owner', 'selected'].includes(payload.access_scope) ? payload.access_scope : 'all',
      allowed_ai_config_ids: Array.isArray(payload.allowed_ai_config_ids) ? payload.allowed_ai_config_ids : [],
      risk_level: String(payload.risk_level || 'read_only'),
      definition: payload.definition || {},
    })
    notice.value = '卡片已导入并创建第 1 版'
    await loadCards()
  } catch (cause: any) {
    error.value = cause?.message || '导入失败'
  } finally {
    input.value = ''
  }
}

const onEditorNotice = (message: string) => { notice.value = message }
const onEditorError = (message: string) => { error.value = message }

watch(tab, value => { if (value === 'runs') loadRuns() })

onMounted(async () => {
  await Promise.all([loadCards(), loadRuns()])
  timer = window.setInterval(() => {
    if (runs.value.some(run => ACTIVE_RUN_STATUSES.has(run.status))) loadRuns()
  }, 2500)
})
onBeforeUnmount(() => { if (timer) window.clearInterval(timer) })
</script>

<template>
  <section class="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-indigo-200/80 bg-indigo-50/50 p-3 touch-pan-y custom-scrollbar dark:border-indigo-500/25 dark:bg-indigo-500/5">
    <header class="flex items-center justify-between gap-2">
      <div class="min-w-0 text-left">
        <div class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">自动化卡片</div>
        <div class="text-xs text-zinc-500">服务器确定性编排设备 MCP，不逐步调用模型</div>
      </div>
      <span class="rounded-full bg-white/70 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-900/50">{{ cards.length }} 张</span>
    </header>

    <div class="mt-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex rounded-lg bg-white/70 p-0.5 text-sm dark:bg-zinc-900/50">
          <button class="rounded-md px-3 py-1" :class="tab === 'cards' ? 'bg-indigo-600 text-white' : 'text-zinc-500'" @click="tab = 'cards'">卡片</button>
          <button class="rounded-md px-3 py-1" :class="tab === 'runs' ? 'bg-indigo-600 text-white' : 'text-zinc-500'" @click="tab = 'runs'">运行历史</button>
        </div>
        <div v-if="tab === 'cards'" class="flex gap-1">
          <input v-model="cardSearch" class="w-36 rounded-lg border border-zinc-200 bg-white/70 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900/60" placeholder="搜索名称或标签" />
          <select v-model="cardStatus" class="rounded-lg border border-zinc-200 bg-white/70 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900/60"><option value="">全部状态</option><option value="active">可执行</option><option value="deprecated">旧版本</option></select>
          <label class="cursor-pointer whitespace-nowrap rounded-lg border border-zinc-200 bg-white/70 px-2 py-1 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300">
            导入<input type="file" accept="application/json,.json" class="hidden" @change="importFile" />
          </label>
          <button class="whitespace-nowrap rounded-lg bg-indigo-600 px-2 py-1 text-sm text-white" @click="editorRef?.openNew()">新建卡片</button>
        </div>
      </div>

      <div v-if="error" class="mt-2 rounded-lg bg-rose-50 px-2 py-1.5 text-xs text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">{{ error }}</div>
      <div v-if="notice" class="mt-2 rounded-lg bg-emerald-50 px-2 py-1.5 text-xs text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">{{ notice }}</div>

      <div v-if="tab === 'cards'" class="mt-3 grid grid-cols-1 gap-2">
        <div v-if="!loading && filteredCards.length === 0" class="col-span-full py-6 text-center text-xs text-zinc-400">暂无匹配卡片。</div>
        <article v-for="card in filteredCards" :key="card.id" class="rounded-lg border border-zinc-200 bg-white/75 p-2.5 dark:border-zinc-700 dark:bg-zinc-900/55">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">{{ card.name }}</div>
              <div class="mt-0.5 line-clamp-2 text-xs leading-relaxed text-zinc-500">{{ card.description || '暂无说明' }}</div>
            </div>
            <span class="shrink-0 rounded px-1.5 py-0.5 text-xs" :class="statusClass(card.status)">{{ statusLabel(card.status) }}</span>
          </div>
          <div class="mt-2 flex flex-wrap gap-1">
            <span v-for="tag in visibleCardTags(card)" :key="tag" class="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">{{ tag }}</span>
            <span class="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">{{ card.risk_level }}</span>
            <span class="rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">{{ accessScopeSummary(card) }}</span>
          </div>
          <div class="mt-1 text-xs text-zinc-400">成功率 {{ cardRunSummary(runs, card.id).rate }} · 最近运行 {{ cardRunSummary(runs, card.id).latest }}</div>
          <div class="mt-2 flex flex-wrap gap-1 text-xs">
            <button class="rounded border px-2 py-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" @click="editorRef?.openEdit(card)">编辑</button>
            <button :disabled="!['active', 'published', 'deprecated'].includes(card.status)" class="rounded border border-indigo-200 px-2 py-0.5 text-indigo-600 disabled:opacity-40 dark:border-indigo-500/30 dark:text-indigo-300" @click="openRun(card)">运行</button>
          </div>
        </article>
      </div>

      <div v-else class="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
        <div class="space-y-1.5">
          <button v-for="run in runs" :key="run.id" class="w-full rounded-lg border border-zinc-200 bg-white/75 p-2 text-left dark:border-zinc-700 dark:bg-zinc-900/55" @click="loadRunDetail(run)">
            <div class="flex items-center justify-between gap-2">
              <span class="truncate text-sm font-medium">{{ cards.find(card => card.id === run.card_id)?.name || run.card_id }}</span>
              <span class="rounded px-1.5 py-0.5 text-xs" :class="statusClass(run.output?.status === 'manual_required' ? 'failed' : run.status)">{{ runStatusLabel(run) }}</span>
            </div>
            <div class="mt-1 text-xs text-zinc-400">{{ run.device_id }} · {{ run.current_step_id || '完成' }} · {{ new Date(run.created_at * 1000).toLocaleString() }}</div>
          </button>
          <div v-if="runs.length === 0" class="py-6 text-center text-xs text-zinc-400">暂无运行记录</div>
        </div>
        <div class="rounded-lg border border-zinc-200 bg-white/75 p-2.5 dark:border-zinc-700 dark:bg-zinc-900/55">
          <div v-if="!selectedRun" class="py-8 text-center text-xs text-zinc-400">选择一条运行查看详情</div>
          <template v-else>
            <div class="flex items-center justify-between">
              <div class="text-xs font-semibold">运行详情</div>
              <span class="rounded px-1.5 py-0.5 text-xs" :class="statusClass(selectedRun.output?.status === 'manual_required' ? 'failed' : selectedRun.status)">{{ runStatusLabel(selectedRun) }}</span>
            </div>
            <div class="mt-1 break-all text-xs text-zinc-400">{{ selectedRun.id }}</div>
            <div v-if="selectedRun.error" class="mt-2 rounded bg-rose-50 p-2 text-xs text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">{{ selectedRun.error.code }}：{{ selectedRun.error.message }}</div>
            <pre v-if="selectedRun.output" class="mt-2 max-h-36 overflow-auto rounded bg-zinc-950 p-2 text-xs text-emerald-300">{{ JSON.stringify(selectedRun.output, null, 2) }}</pre>
            <div class="mt-2 flex gap-1 text-xs">
              <button v-if="ACTIVE_RUN_STATUSES.has(selectedRun.status)" class="rounded border border-rose-200 px-2 py-1 text-rose-500" @click="cancelRun(selectedRun)">取消</button>
              <button v-if="['failed', 'timed_out', 'cancelled'].includes(selectedRun.status)" class="rounded border border-indigo-200 px-2 py-1 text-indigo-600" @click="retryRun(selectedRun)">新运行重试</button>
            </div>
            <div v-for="review in aiReviews.filter(item => item.status === 'pending')" :key="review.id" class="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 dark:border-amber-500/30 dark:bg-amber-500/10">
              <div class="text-xs font-medium text-amber-700 dark:text-amber-200">AI 节点任务：{{ review.risk_summary }}</div>
              <div class="mt-1 text-xs text-amber-600/80 dark:text-amber-200/70">{{ review.notified_at ? 'AI 已收到此前运行轨迹，正在处理' : '正在把此前完整运行过程交给负责本次运行的 AI' }}</div>
            </div>
            <div class="mt-3 text-xs font-semibold text-zinc-500">步骤</div>
            <div class="mt-1 space-y-1">
              <div v-for="step in selectedSteps" :key="step.id" class="rounded border border-zinc-200 p-1.5 text-xs dark:border-zinc-700">
                <div class="flex justify-between"><span>{{ step.step_id }} · {{ step.tool_name || '控制步骤' }} · #{{ step.attempt }}</span><span>{{ statusLabel(step.status) }}</span></div>
                <div v-if="step.error" class="mt-1 text-rose-500">{{ step.error.code }}：{{ step.error.message }}</div>
                <pre v-if="step.result" class="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-zinc-500">{{ JSON.stringify(step.result, null, 2) }}</pre>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <AutomationEditorModal
      ref="editorRef"
      :devices="devices"
      :agents="agents"
      :cards="cards"
      @changed="loadCards"
      @notice="onEditorNotice"
      @error="onEditorError"
    />

    <AutomationRunLaunchModal
      :card="runModalCard"
      :run-device-id="runDeviceId"
      :run-input-text="runInputText"
      :devices="devices"
      :busy="busy"
      @update:run-device-id="runDeviceId = $event"
      @update:run-input-text="runInputText = $event"
      @close="runModalCard = null"
      @start="startRun"
    />
  </section>
</template>
