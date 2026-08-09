<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatTokenCount } from '@/utils/formatTokenCount'
import { useDismissibleLayer } from '@/composables/useDismissibleLayer'

interface Session {
  id: string
  name: string
  totalTokens?: number
  forwardToBot?: boolean
  createdAt?: number | string | null
}

interface SessionMeta extends Session {
  isTask: boolean
  /** Display label for task rows (task title without the "任务:" prefix). */
  taskTitle: string
}

const props = defineProps<{
  currentSessionId: string
  sessionList: Session[]
}>()

const emit = defineEmits<{
  (e: 'change', sessionId: string): void
  (e: 'create'): void
  (e: 'delete', sessionId: string): void
  (e: 'batchDelete', sessionIds: string[]): void
  (e: 'rename', sessionId: string): void
  (e: 'toggleForward', payload: { sessionId: string; enabled: boolean }): void
}>()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const normalGroupOpen = ref(true)
const taskGroupOpen = ref(true)
const selectedSessionIds = ref<Set<string>>(new Set())
const contextMenu = ref({ visible: false, x: 0, y: 0 })
const editingSessionId = ref<string | null>(null)

// A session is a task conversation when its id uses the task-runtime prefix
// (the authoritative signal); fall back to the legacy "任务:" name prefix.
const parseSession = (session: Session): SessionMeta => {
  const id = String(session.id || '')
  const name = String(session.name || '').trim()
  const isTaskById = id.startsWith('session_task_')
  const nameMatch = name.match(/^任务[:：]\s*(.+)$/)
  const isTask = isTaskById || !!nameMatch
  let taskTitle = ''
  if (isTask) {
    taskTitle = String(nameMatch?.[1] || name || '').trim() || '未命名任务'
  }
  return { ...session, isTask, taskTitle }
}

const sessionMetaList = computed<SessionMeta[]>(() => props.sessionList.map(parseSession))
const normalSessions = computed<SessionMeta[]>(() => sessionMetaList.value.filter(item => !item.isTask))
const taskSessions = computed<SessionMeta[]>(() => sessionMetaList.value.filter(item => item.isTask))
const sumTokens = (rows: SessionMeta[]) => rows.reduce((sum, item) => sum + Number(item.totalTokens || 0), 0)
const normalSessionsTokenTotal = computed(() => sumTokens(normalSessions.value))
const taskSessionsTokenTotal = computed(() => sumTokens(taskSessions.value))

const currentSessionName = computed(() => {
  if (!props.currentSessionId) return '新对话'
  const row = props.sessionList.find(item => item.id === props.currentSessionId)
  return row?.name || '新对话'
})

const sessionDateLabel = (session: SessionMeta) => {
  const raw = session.createdAt
  let value = raw === null || raw === undefined || raw === '' ? NaN : (typeof raw === 'number' ? raw : Number(raw))
  if (!Number.isFinite(value)) {
    const idMatch = String(session.id || '').match(/(?:session[_-])(?:task[_-])?(\d{10,})/i)
    if (idMatch) value = Number(idMatch[1])
  }
  if (!Number.isFinite(value)) {
    const parsed = Date.parse(String(raw || ''))
    if (!Number.isFinite(parsed)) return ''
    value = parsed
  }
  if (value > 0 && value < 1_000_000_000_000) value *= 1000
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = String(date.getFullYear()).slice(-2)
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${day}`
}

const sessionLineLabel = (session: SessionMeta) => {
  if (session.isTask) return session.taskTitle || session.name || '未命名任务'
  return session.name || '未命名会话'
}

const isSessionSelected = (sessionId: string) => selectedSessionIds.value.has(sessionId)

const editingSession = computed(() =>
  editingSessionId.value
    ? props.sessionList.find(session => session.id === editingSessionId.value) || null
    : null,
)

const openSessionEditor = (sessionId: string) => {
  editingSessionId.value = sessionId
}

const closeSessionEditor = () => {
  editingSessionId.value = null
}

const deleteEditingSession = () => {
  const sessionId = editingSessionId.value
  if (!sessionId) return
  emit('delete', sessionId)
  closeSessionEditor()
}

const toggleSessionSelection = (sessionId: string) => {
  const next = new Set(selectedSessionIds.value)
  if (next.has(sessionId)) next.delete(sessionId)
  else next.add(sessionId)
  selectedSessionIds.value = next
  contextMenu.value.visible = false
}

const clearSessionSelection = () => {
  selectedSessionIds.value = new Set()
  contextMenu.value.visible = false
}

const onSessionClick = (sessionId: string, event: MouseEvent) => {
  if (event.ctrlKey || event.metaKey) {
    toggleSessionSelection(sessionId)
    return
  }
  emit('change', sessionId)
  clearSessionSelection()
  open.value = false
}

const onSessionContextMenu = (sessionId: string, event: MouseEvent) => {
  event.preventDefault()
  if (!selectedSessionIds.value.has(sessionId)) {
    selectedSessionIds.value = new Set([sessionId])
  }
  contextMenu.value = { visible: true, x: event.clientX, y: event.clientY }
}

const deleteSelectedSessions = () => {
  const ids = Array.from(selectedSessionIds.value)
  if (ids.length === 0) return
  emit('batchDelete', ids)
  clearSessionSelection()
  open.value = false
}

const applyDefaultExpansion = () => {
  // Show whichever sections have content; keep both open by default.
  normalGroupOpen.value = normalSessions.value.length > 0 || taskSessions.value.length === 0
  taskGroupOpen.value = taskSessions.value.length > 0
}

const toggleOpen = () => {
  open.value = !open.value
  if (open.value) applyDefaultExpansion()
  else clearSessionSelection()
}

const closeDropdown = () => {
  open.value = false
  clearSessionSelection()
}

useDismissibleLayer({
  open,
  roots: [rootRef],
  onDismiss: closeDropdown,
})
</script>

<template>
  <div ref="rootRef" class="relative flex items-center gap-2 min-w-0">
    <button
      class="min-w-[140px] sm:min-w-[200px] max-w-[260px] sm:max-w-[320px] px-2 sm:px-3 py-1.5 sm:py-2 text-xs rounded-lg border border-zinc-200 bg-white/90 text-zinc-700 dark:bg-zinc-800/80 dark:border-zinc-700 dark:text-zinc-200 flex items-center justify-between gap-2 overflow-hidden"
      @click="toggleOpen"
    >
      <span class="truncate text-left min-w-0">{{ currentSessionName }}</span>
      <span class="shrink-0 text-zinc-400">▾</span>
    </button>

    <div v-if="open" class="absolute left-0 top-[calc(100%+6px)] z-20 w-[320px] max-w-[88vw] sm:w-[420px] rounded-xl acrylic-modal shadow-lg p-2 overflow-hidden max-h-[70dvh]">
      <div class="max-h-[calc(70dvh-1rem)] overflow-y-auto overflow-x-hidden space-y-2">
        <!-- 普通对话：在此栏目下创建对话 -->
        <div class="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-800/40">
          <button
            class="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-left text-xs text-zinc-700 dark:text-zinc-200"
            @click="normalGroupOpen = !normalGroupOpen"
          >
            <span class="truncate">普通对话 ({{ normalSessions.length }})</span>
            <span class="shrink-0 text-[10px] text-zinc-500 dark:text-zinc-400">Token: {{ formatTokenCount(normalSessionsTokenTotal) }}</span>
          </button>
          <div v-if="normalGroupOpen" class="px-1 pb-1 space-y-1">
            <button
              class="w-full px-2 py-1.5 text-left text-xs rounded border border-dashed border-zinc-300 text-zinc-600 bg-white/60 hover:border-emerald-300 hover:text-emerald-600 dark:border-zinc-600 dark:bg-zinc-800/40 dark:text-zinc-300 dark:hover:text-emerald-300"
              @click="emit('create'); open = false"
            >
              + 新建对话
            </button>
            <div
              v-for="session in normalSessions"
              :key="session.id"
              class="flex items-center gap-1 px-2 py-1.5 rounded border min-w-0"
              :class="[
                session.id === currentSessionId
                  ? 'border-emerald-300/70 bg-emerald-50/45 dark:border-emerald-500/35 dark:bg-emerald-500/10'
                  : 'border-emerald-200/60 bg-emerald-50/25 dark:border-emerald-700/35 dark:bg-emerald-500/5',
                isSessionSelected(session.id) ? 'ring-2 ring-zinc-400/40 dark:ring-zinc-500/50' : ''
              ]"
              @contextmenu="onSessionContextMenu(session.id, $event)"
            >
              <button
                class="min-w-0 flex-1 flex items-center gap-1 text-left text-xs overflow-hidden text-emerald-900/85 dark:text-emerald-100/85"
                @click="onSessionClick(session.id, $event)"
              >
                <span v-if="sessionDateLabel(session)" class="shrink-0 w-[38px] text-[10px] tabular-nums text-emerald-700/70 dark:text-emerald-300/80">{{ sessionDateLabel(session) }}</span>
                <span class="truncate">{{ sessionLineLabel(session) }}</span>
              </button>
              <span class="shrink-0 text-[10px] text-emerald-700/60 dark:text-emerald-300/70">Token: {{ formatTokenCount(session.totalTokens) }}</span>
              <button
                class="shrink-0 text-[11px] px-2 py-0.5 rounded border border-emerald-300/60 text-emerald-700/80 hover:bg-emerald-50/50 dark:border-emerald-600/50 dark:text-emerald-300/80 dark:hover:bg-emerald-900/10"
                @click.stop="openSessionEditor(session.id)"
              >
                编辑
              </button>
            </div>
          </div>
        <div class="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-800/40">
          <button
            class="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-left text-xs text-zinc-700 dark:text-zinc-200"
            @click="taskGroupOpen = !taskGroupOpen"
          >
            <span class="truncate">任务 ({{ taskSessions.length }})</span>
            <span class="shrink-0 text-[10px] text-zinc-500 dark:text-zinc-400">Token: {{ formatTokenCount(taskSessionsTokenTotal) }}</span>
          </button>
          <div v-if="taskGroupOpen" class="px-1 pb-1 space-y-1">
            <div
              v-for="session in taskSessions"
              :key="session.id"
              class="flex items-center gap-1 px-2 py-1.5 rounded border min-w-0"
              :class="[
                session.id === currentSessionId
                  ? 'border-indigo-300/70 bg-indigo-50/45 dark:border-indigo-500/35 dark:bg-indigo-500/10'
                  : 'border-indigo-200/60 bg-indigo-50/25 dark:border-indigo-700/35 dark:bg-indigo-500/5',
                isSessionSelected(session.id) ? 'ring-2 ring-zinc-400/40 dark:ring-zinc-500/50' : ''
              ]"
              @contextmenu="onSessionContextMenu(session.id, $event)"
            >
              <span class="shrink-0 rounded bg-indigo-100 px-1 text-[10px] text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">任务</span>
              <button
                class="min-w-0 flex-1 flex items-center gap-1 text-left text-xs overflow-hidden text-indigo-900/85 dark:text-indigo-100/85"
                @click="onSessionClick(session.id, $event)"
              >
                <span v-if="sessionDateLabel(session)" class="shrink-0 w-[38px] text-[10px] tabular-nums text-indigo-700/70 dark:text-indigo-300/80">{{ sessionDateLabel(session) }}</span>
                <span class="truncate">{{ sessionLineLabel(session) }}</span>
              </button>
              <span class="shrink-0 text-[10px] text-indigo-700/60 dark:text-indigo-300/70">Token: {{ formatTokenCount(session.totalTokens) }}</span>
              <button
                class="shrink-0 text-[11px] px-2 py-0.5 rounded border border-indigo-300/60 text-indigo-700/80 hover:bg-indigo-50/50 dark:border-indigo-600/50 dark:text-indigo-300/80 dark:hover:bg-indigo-900/10"
                @click.stop="openSessionEditor(session.id)"
              >
                编辑
              </button>
            </div>
            <div
              v-if="taskSessions.length === 0"
              class="px-2 py-2 text-center text-[11px] text-zinc-400 dark:text-zinc-500"
            >
              暂无任务对话记录
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
    <div
      v-if="editingSession"
      class="fixed inset-0 z-[300] flex items-center justify-center bg-black/20 p-4 dark:bg-black/40"
      @click.self="closeSessionEditor"
    >
      <div
        class="w-full max-w-sm rounded-xl acrylic-modal p-4 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="编辑对话"
        @click.stop
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">编辑对话</h3>
            <p class="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
              {{ editingSession.name || '未命名会话' }}
            </p>
          </div>
          <button
            class="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
            aria-label="关闭"
            @click="closeSessionEditor"
          >
            ✕
          </button>
        </div>

        <div class="mt-4 space-y-2">
          <button
            class="w-full rounded-lg border border-emerald-300/60 px-3 py-2 text-left text-xs text-emerald-700/80 hover:bg-emerald-50/50 dark:border-emerald-600/50 dark:text-emerald-300/80 dark:hover:bg-emerald-900/10"
            @click="emit('rename', editingSession.id); closeSessionEditor()"
          >
            修改名称
          </button>

          <button
            class="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition"
            :class="editingSession.forwardToBot
              ? 'border-sky-300 bg-sky-50/70 text-sky-700 dark:border-sky-500/40 dark:bg-sky-900/20 dark:text-sky-300'
              : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'"
            @click="emit('toggleForward', { sessionId: editingSession.id, enabled: !editingSession.forwardToBot })"
          >
            <span>{{ editingSession.forwardToBot ? '机器人会回复此对话' : '机器人不回复此对话' }}</span>
            <span class="text-[11px]">{{ editingSession.forwardToBot ? '已开启' : '已关闭' }}</span>
          </button>

          <button
            class="w-full rounded-lg border border-red-200 px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-900/20"
            @click="deleteEditingSession"
          >
            删除此对话
          </button>
        </div>

        <div class="mt-4 flex justify-end">
          <button
            class="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            @click="closeSessionEditor"
          >
            完成
          </button>
        </div>
      </div>
    </div>
    <div
      v-if="contextMenu.visible"
      class="fixed z-[310] min-w-[150px] rounded-lg acrylic-modal py-1 text-xs text-zinc-700 shadow-lg dark:text-zinc-200"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
    >
      <button
        class="w-full px-3 py-2 text-left text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/20"
        @click="deleteSelectedSessions"
      >
        删除选中 {{ selectedSessionIds.size }} 项
      </button>
    </div>
  </div>
</template>
