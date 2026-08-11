<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  confirmWorkflowRun,
  listPendingWorkflowConfirmations,
  type WorkflowConfirmationNotice,
} from '@/api/workflowRuns'
import {
  downloadUserNotificationAttachment,
  listUserNotifications,
  markAllUserNotificationsRead,
  markUserNotificationRead,
  type UserNotification,
} from '@/api/userNotifications'

const confirmations = ref<WorkflowConfirmationNotice[]>([])
const messages = ref<UserNotification[]>([])
const panelOpen = ref(false)
const loading = ref(false)
const error = ref('')
const busyId = ref('')
const snoozedRunId = ref('')
const approvalArmedId = ref('')
const clock = ref(Date.now())
const dismissedToastIds = ref(new Set<string>())
let pollTimer: number | undefined
let clockTimer: number | undefined
let armTimer: number | undefined

const currentConfirmation = computed(() =>
  confirmations.value.find(item => item.run_id !== snoozedRunId.value) || null,
)
const unreadCount = computed(() => messages.value.length)
const toastMessage = computed(() => messages.value.find(
  item => item.app_push_required && !dismissedToastIds.value.has(item.notification_id),
) || null)

const remaining = (expiresAt: number) => {
  const seconds = Math.max(0, Math.ceil((expiresAt * 1000 - clock.value) / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

const requiresDoubleApproval = (item: WorkflowConfirmationNotice) =>
  item.risk_level === 'high_risk' || item.type === 'forced'

const refresh = async () => {
  if (loading.value) return
  loading.value = true
  try {
    const [pending, inbox] = await Promise.all([
      listPendingWorkflowConfirmations(),
      listUserNotifications(true),
    ])
    confirmations.value = pending.items
    messages.value = inbox.items
    if (snoozedRunId.value && !pending.items.some(item => item.run_id === snoozedRunId.value)) {
      snoozedRunId.value = ''
    }
    error.value = ''
  } catch (cause: any) {
    error.value = cause?.message || '通知同步失败，稍后自动重试'
  } finally {
    loading.value = false
  }
}

const decide = async (item: WorkflowConfirmationNotice, approved: boolean) => {
  if (approved && requiresDoubleApproval(item) && approvalArmedId.value !== item.confirmation_id) {
    approvalArmedId.value = item.confirmation_id
    if (armTimer) window.clearTimeout(armTimer)
    armTimer = window.setTimeout(() => { approvalArmedId.value = '' }, 5000)
    return
  }
  busyId.value = item.confirmation_id
  try {
    await confirmWorkflowRun(item.run_id, approved)
    confirmations.value = confirmations.value.filter(row => row.confirmation_id !== item.confirmation_id)
    approvalArmedId.value = ''
    snoozedRunId.value = ''
  } catch (cause: any) {
    error.value = cause?.message || '提交确认失败'
  } finally {
    busyId.value = ''
  }
}

const openDetails = (item: WorkflowConfirmationNotice) => {
  snoozedRunId.value = item.run_id
  const url = new URL(window.location.href)
  url.searchParams.set('workflow_confirmation', item.run_id)
  window.history.replaceState({}, '', url)
  window.dispatchEvent(new CustomEvent('heysure:open-workflow-confirmation', { detail: { runId: item.run_id } }))
}

const markRead = async (item: UserNotification) => {
  busyId.value = item.notification_id
  try {
    await markUserNotificationRead(item.notification_id)
    messages.value = messages.value.filter(row => row.notification_id !== item.notification_id)
  } finally {
    busyId.value = ''
  }
}

const markAllRead = async () => {
  await markAllUserNotificationsRead()
  messages.value = []
  panelOpen.value = false
}

const dismissToast = (item: UserNotification) => {
  dismissedToastIds.value = new Set([...dismissedToastIds.value, item.notification_id])
}

const onVisibility = () => {
  if (document.visibilityState === 'visible') void refresh()
}

onMounted(() => {
  void refresh()
  pollTimer = window.setInterval(refresh, 4000)
  clockTimer = window.setInterval(() => { clock.value = Date.now() }, 1000)
  document.addEventListener('visibilitychange', onVisibility)
})

onBeforeUnmount(() => {
  if (pollTimer) window.clearInterval(pollTimer)
  if (clockTimer) window.clearInterval(clockTimer)
  if (armTimer) window.clearTimeout(armTimer)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="currentConfirmation" class="fixed inset-0 z-[220] flex items-center justify-center overflow-y-auto bg-zinc-950/80 p-3 backdrop-blur-sm sm:p-6">
      <article class="w-full max-w-xl rounded-3xl border border-amber-300/60 bg-white p-5 shadow-2xl dark:border-amber-500/40 dark:bg-zinc-900 sm:p-7">
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600 dark:text-amber-300">需要人工确认</div>
            <h2 class="mt-2 text-xl font-bold text-zinc-900 dark:text-zinc-50">是否批准继续执行？</h2>
          </div>
          <span class="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">剩余 {{ remaining(currentConfirmation.expires_at) }}</span>
        </div>
        <div class="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950/50">
          <div class="text-sm font-semibold">{{ currentConfirmation.card_name || '自动化卡片' }}</div>
          <div v-if="currentConfirmation.actor_name" class="mt-1 text-xs text-zinc-500">请求成员：{{ currentConfirmation.actor_name }}</div>
          <p class="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700 dark:text-zinc-200">{{ currentConfirmation.risk_summary || '请查看详情后决定是否继续。' }}</p>
        </div>
        <p class="mt-3 text-xs leading-5 text-zinc-500">原 AI 对话与自动化运行会保持等待，不会新建对话，也不会在未确认时继续执行。</p>
        <div v-if="error" class="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">{{ error }}</div>
        <div class="mt-5 grid gap-2 sm:grid-cols-3">
          <button class="rounded-xl border border-zinc-300 px-4 py-3 text-sm font-medium dark:border-zinc-700" @click="openDetails(currentConfirmation)">查看自动化详情</button>
          <button :disabled="Boolean(busyId)" class="rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50" @click="decide(currentConfirmation, false)">拒绝</button>
          <button :disabled="Boolean(busyId)" class="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50" @click="decide(currentConfirmation, true)">
            {{ busyId === currentConfirmation.confirmation_id ? '提交中…' : approvalArmedId === currentConfirmation.confirmation_id ? '再次点击确认批准' : '批准继续' }}
          </button>
        </div>
        <div v-if="confirmations.length > 1" class="mt-3 text-center text-xs text-zinc-400">还有 {{ confirmations.length - 1 }} 项确认正在排队</div>
      </article>
    </div>

    <div class="fixed right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[190] flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2">
      <button class="rounded-full border border-indigo-200 bg-white/95 px-3 py-2 text-xs font-semibold text-indigo-700 shadow-lg dark:border-indigo-500/30 dark:bg-zinc-900/95 dark:text-indigo-200" @click="panelOpen = !panelOpen">
        通知{{ unreadCount ? ` ${unreadCount}` : '' }}
      </button>
      <article v-if="toastMessage && !panelOpen" class="w-[min(23rem,calc(100vw-1.5rem))] rounded-2xl border border-indigo-200 bg-white p-4 shadow-2xl dark:border-indigo-500/30 dark:bg-zinc-900">
        <div class="text-sm font-semibold">{{ toastMessage.title }}</div>
        <p class="mt-1 line-clamp-4 whitespace-pre-wrap text-xs leading-5 text-zinc-600 dark:text-zinc-300">{{ toastMessage.body }}</p>
        <div class="mt-3 flex justify-end gap-2 text-xs">
          <button class="rounded-lg border px-3 py-1.5" @click="dismissToast(toastMessage)">稍后</button>
          <button class="rounded-lg bg-indigo-600 px-3 py-1.5 text-white" @click="markRead(toastMessage)">知道了</button>
        </div>
      </article>
      <section v-if="panelOpen" class="flex max-h-[min(72dvh,36rem)] w-[min(26rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <header class="flex shrink-0 items-center justify-between border-b px-4 py-3 dark:border-zinc-700">
          <div class="text-sm font-semibold">消息通知</div>
          <button v-if="messages.length" class="text-xs text-indigo-600 dark:text-indigo-300" @click="markAllRead">全部已读</button>
        </header>
        <div class="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3 touch-pan-y">
          <div v-if="!messages.length" class="py-8 text-center text-xs text-zinc-400">暂无未读消息</div>
          <article v-for="item in messages" :key="item.notification_id" class="rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
            <div class="text-xs font-semibold">{{ item.title }}</div>
            <p class="mt-1 whitespace-pre-wrap text-xs leading-5 text-zinc-600 dark:text-zinc-300">{{ item.body }}</p>
            <div v-if="item.attachments?.length" class="mt-2 space-y-1">
              <button v-for="(file, index) in item.attachments" :key="`${item.notification_id}-${index}`" :disabled="!file.available" class="block w-full truncate rounded-lg bg-zinc-100 px-2 py-1.5 text-left text-[11px] text-indigo-600 disabled:text-zinc-400 dark:bg-zinc-800 dark:text-indigo-300" @click="downloadUserNotificationAttachment(item.notification_id, index, file.file_name)">📎 {{ file.file_name }}</button>
            </div>
            <div class="mt-2 flex items-center justify-between text-[10px] text-zinc-400">
              <span>{{ new Date(item.created_at * 1000).toLocaleString() }}</span>
              <button class="text-indigo-600 dark:text-indigo-300" :disabled="busyId === item.notification_id" @click="markRead(item)">标为已读</button>
            </div>
          </article>
        </div>
      </section>
    </div>
  </Teleport>
</template>
