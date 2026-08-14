<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  downloadUserNotificationAttachment,
  listUserNotifications,
  markAllUserNotificationsRead,
  markUserNotificationRead,
  type UserNotification,
} from '@/api/userNotifications'
import AppIcon from '@/components/common/AppIcon.vue'

const messages = ref<UserNotification[]>([])
const panelOpen = ref(false)
const loading = ref(false)
const error = ref('')
const busyId = ref('')
const triggerRoot = ref<HTMLElement | null>(null)
const messagePanel = ref<HTMLElement | null>(null)
let pollTimer: number | undefined
const unreadCount = computed(() => messages.value.length)

const refresh = async () => {
  if (loading.value) return
  loading.value = true
  try {
    messages.value = (await listUserNotifications(true)).items
    error.value = ''
  } catch (cause: any) {
    error.value = cause?.message || '通知同步失败，稍后自动重试'
  } finally {
    loading.value = false
  }
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

const onVisibility = () => {
  if (document.visibilityState === 'visible') {
    void refresh()
  } else {
    panelOpen.value = false
  }
}

const closeMessagePanel = () => { panelOpen.value = false }

const onDocumentPointerDown = (event: PointerEvent) => {
  if (!panelOpen.value) return
  const target = event.target
  if (!(target instanceof Node)) return
  if (triggerRoot.value?.contains(target) || messagePanel.value?.contains(target)) return
  closeMessagePanel()
}

const onDocumentKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') closeMessagePanel()
}

onMounted(() => {
  void refresh()
  pollTimer = window.setInterval(refresh, 4000)
  document.addEventListener('visibilitychange', onVisibility)
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  document.addEventListener('keydown', onDocumentKeydown)
  window.addEventListener('blur', closeMessagePanel)
})

onBeforeUnmount(() => {
  if (pollTimer) window.clearInterval(pollTimer)
  document.removeEventListener('visibilitychange', onVisibility)
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  document.removeEventListener('keydown', onDocumentKeydown)
  window.removeEventListener('blur', closeMessagePanel)
})
</script>

<template>
  <div ref="triggerRoot" class="relative ml-1 sm:ml-2">
    <button
      class="relative flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-800 shadow-sm transition-colors active:bg-zinc-100 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:border-indigo-500/50 dark:hover:bg-zinc-800 dark:hover:text-indigo-300 md:h-9 md:w-9"
      title="消息通知"
      :aria-label="unreadCount ? `消息通知，${unreadCount} 条未读` : '消息通知'"
      :aria-expanded="panelOpen"
      @click.stop="panelOpen = !panelOpen"
    >
      <AppIcon name="bell" class="h-4 w-4 md:h-[18px] md:w-[18px]" />
      <span
        v-if="unreadCount"
        class="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white dark:ring-zinc-900"
      >{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
    </button>
  </div>

  <Teleport to="body">
    <div v-if="panelOpen" class="fixed right-3 top-[calc(env(safe-area-inset-top)+4rem)] z-[190] max-w-[calc(100vw-1.5rem)] sm:top-[calc(env(safe-area-inset-top)+4.5rem)]">
      <section ref="messagePanel" class="flex max-h-[min(72dvh,36rem)] w-[min(26rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
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
