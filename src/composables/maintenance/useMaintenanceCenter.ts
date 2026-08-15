import { onBeforeUnmount } from 'vue'
import {
  createMaintenanceTask, decideMaintenanceApproval, interruptMaintenanceTask, steerMaintenanceTask,
  type CreateMaintenanceTaskInput,
} from '@/api/maintenance'
import { useMaintenanceStream } from './useMaintenanceStream'
import { useMaintenanceStore } from './useMaintenanceStore'

export function useMaintenanceCenter() {
  const store = useMaintenanceStore()
  let pollTimer: number | undefined

  const startPolling = (connected: boolean) => {
    stopPolling()
    pollTimer = window.setInterval(async () => {
      if (document.visibilityState !== 'visible') return
      await Promise.allSettled([store.refreshTasks(), store.refreshEvents()])
    }, connected ? 8000 : 2500)
  }

  const stopPolling = () => {
    if (pollTimer !== undefined) window.clearInterval(pollTimer)
    pollTimer = undefined
  }

  const stream = useMaintenanceStream(payload => { void store.reconcileUpdate(payload).catch(() => store.refreshTasks()) })
  const restartPolling = () => startPolling(stream.connected.value)

  const start = async () => {
    store.loading.value = true
    try {
      await store.refreshTasks()
      stream.connect(restartPolling)
      restartPolling()
    } finally {
      store.loading.value = false
    }
  }

  const createTask = async (input: CreateMaintenanceTaskInput) => {
    const task = await createMaintenanceTask(input)
    store.tasks.value.unshift(task)
    await store.selectTask(task)
  }

  const steer = async (message: string) => {
    if (!store.selected.value) return
    await steerMaintenanceTask(store.selected.value.id, message)
    await store.refreshEvents()
  }

  const interrupt = async () => {
    if (!store.selected.value) return
    await interruptMaintenanceTask(store.selected.value.id)
    await store.selectTask(store.selected.value)
  }

  const decide = async (approvalId: string, decision: 'accept' | 'decline') => {
    if (!store.selected.value) return
    await decideMaintenanceApproval(approvalId, decision)
    await store.selectTask(store.selected.value)
  }

  const disconnect = () => {
    stopPolling()
    stream.disconnect()
  }

  onBeforeUnmount(disconnect)
  return { ...store, connected: stream.connected, start, createTask, steer, interrupt, decide, disconnect }
}
