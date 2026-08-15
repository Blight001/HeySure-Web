import { computed, ref } from 'vue'
import { getMaintenanceTask, listMaintenanceEvents, listMaintenanceTasks, type MaintenanceEvent, type MaintenanceTask, type MaintenanceTaskDetail } from '@/api/maintenance'
import { mergeEvents } from '@/utils/maintenanceFormat'
import type { MaintenanceUpdatePayload } from './useMaintenanceStream'

export function useMaintenanceStore() {
  const tasks = ref<MaintenanceTask[]>([])
  const selected = ref<MaintenanceTaskDetail | null>(null)
  const events = ref<MaintenanceEvent[]>([])
  const loading = ref(false)
  const detailLoading = ref(false)
  const error = ref('')
  const lastEventId = computed(() => events.value.length ? Number(events.value[events.value.length - 1]?.id || 0) : 0)

  const refreshTasks = async () => {
    try {
      tasks.value = await listMaintenanceTasks()
      error.value = ''
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '维护任务加载失败'
    }
  }

  const refreshEvents = async () => {
    if (!selected.value) return
    const incoming = await listMaintenanceEvents(selected.value.id, lastEventId.value)
    events.value = mergeEvents(events.value, incoming)
  }

  const selectTask = async (task: MaintenanceTask) => {
    detailLoading.value = true
    error.value = ''
    try {
      selected.value = await getMaintenanceTask(task.id)
      events.value = []
      await refreshEvents()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '维护任务详情加载失败'
    } finally {
      detailLoading.value = false
    }
  }

  const reconcileUpdate = async (payload: MaintenanceUpdatePayload) => {
    const taskId = String(payload?.task_id || payload?.task?.id || '')
    if (!taskId) return
    if (payload.task) {
      const index = tasks.value.findIndex(item => item.id === taskId)
      if (index >= 0) tasks.value[index] = { ...tasks.value[index], ...payload.task }
      else tasks.value.unshift(payload.task)
    }
    if (selected.value?.id !== taskId) return
    const [detail] = await Promise.all([getMaintenanceTask(taskId), refreshEvents()])
    selected.value = detail
  }

  return { tasks, selected, events, loading, detailLoading, error, refreshTasks, refreshEvents, selectTask, reconcileUpdate }
}
