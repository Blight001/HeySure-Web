import { computed, ref, watch, type Ref } from 'vue'
import {
  batchDeleteTaskJobsById,
  deleteTaskJobById,
  fetchTaskListAndJobs,
  pauseTaskJobById,
  resumeTaskJobById,
  triggerTaskForAgent,
  updateTaskJobById,
} from '@/api/task'
import {
  buildTaskCreateForm,
  buildTaskCreateFormFromJob,
  buildTaskSubmitPayload,
  parseAgentMcpTools,
  toolsMatch,
  validateTaskCreateForm,
} from './useTaskManagementHelpers'
import {
  canPauseTaskJob,
  canResumeTaskJob,
  isCompletedTaskJob,
  syncArrayByKey,
} from '@/utils/taskSystem'
import type {
  AITaskJobItem,
  AITaskListItem,
  TaskCreateForm,
} from '@/utils/taskSystem'
import { getAuthToken } from '@/api/http'
import type { Agent } from '@/types'

type MessageType = 'info' | 'success' | 'warning' | 'error'
type AlertFn = (options: string | { message: string; type?: MessageType }) => Promise<void>
type ConfirmFn = (options: string | { message: string; type?: MessageType }) => Promise<boolean>

interface UseTaskManagementOptions {
  availableMcpTools: Ref<string[]>
  defaultMcpTools: string[]
  alert: AlertFn
  confirm: ConfirmFn
  onReloadAgents: () => Promise<void>
}

export const useTaskManagement = (options: UseTaskManagementOptions) => {
  const {
    availableMcpTools,
    defaultMcpTools,
    alert,
    confirm,
    onReloadAgents,
  } = options

  const taskListModalOpen = ref(false)
  const taskListTarget = ref<Agent | null>(null)
  const taskListItems = ref<AITaskListItem[]>([])
  const taskJobs = ref<AITaskJobItem[]>([])
  const selectedTaskJobIds = ref<string[]>([])
  const taskListLoading = ref(false)
  const taskCreatePanelOpen = ref(false)
  const taskCreateSubmitting = ref(false)
  const taskEditingJob = ref<AITaskJobItem | null>(null)
  const taskEditingJobId = computed(() => taskEditingJob.value?.job_id || '')

  const completedTaskJobs = computed(() => {
    return taskJobs.value.filter(isCompletedTaskJob)
  })

  const fetchAgentTaskList = async (agent: Agent, opts?: { silent?: boolean }) => {
    if (!agent.aiConfigId) return
    const token = getAuthToken()
    if (!token) return
    const silent = !!opts?.silent
    if (!silent) taskListLoading.value = true
    try {
      const { tasks, jobs } = await fetchTaskListAndJobs(agent.aiConfigId, token)
      syncArrayByKey(taskListItems.value, tasks, item => String((item as AITaskListItem).id))
      syncArrayByKey(taskJobs.value, jobs, item => String((item as AITaskJobItem).job_id))
    } catch (err: any) {
      if (!silent) {
        void alert({ message: err?.message || '任务列表加载失败', type: 'error' })
      }
    } finally {
      if (!silent) taskListLoading.value = false
    }
  }

  const openAgentTaskList = async (agent: Agent) => {
    if (!agent.aiConfigId) return
    taskListTarget.value = agent
    taskCreatePanelOpen.value = false
    selectedTaskJobIds.value = []
    taskListModalOpen.value = true
    await fetchAgentTaskList(agent)
  }

  const closeAgentTaskList = () => {
    taskListModalOpen.value = false
    taskCreatePanelOpen.value = false
    taskCreateSubmitting.value = false
    taskEditingJob.value = null
    selectedTaskJobIds.value = []
  }

  const fallbackTools = () => (availableMcpTools.value.length ? availableMcpTools.value : defaultMcpTools)
  const taskCreateForm = ref<TaskCreateForm>(buildTaskCreateForm(null, fallbackTools()))

  const openTaskCreatePanel = (agent?: Agent | null) => {
    if (!agent?.aiConfigId) return
    taskEditingJob.value = null
    taskCreateForm.value = buildTaskCreateForm(agent, fallbackTools())
    taskCreatePanelOpen.value = true
  }

  const openTaskCreatePanelFromJob = (agent?: Agent | null, job?: AITaskJobItem | null) => {
    if (!agent?.aiConfigId || !job?.job_id) return
    taskEditingJob.value = null
    taskCreateForm.value = buildTaskCreateFormFromJob(agent, job, fallbackTools())
    taskCreatePanelOpen.value = true
  }

  const openTaskEditPanel = (agent?: Agent | null, job?: AITaskJobItem | null) => {
    if (!agent?.aiConfigId || !job?.job_id) return
    taskEditingJob.value = job
    taskCreateForm.value = buildTaskCreateFormFromJob(agent, job, fallbackTools())
    taskCreatePanelOpen.value = true
  }

  const toggleTaskCreatePanel = (agent?: Agent | null) => {
    if (taskCreatePanelOpen.value) {
      closeTaskCreatePanel()
      return
    }
    openTaskCreatePanel(agent)
  }

  const closeTaskCreatePanel = () => {
    taskCreatePanelOpen.value = false
    taskCreateSubmitting.value = false
    taskEditingJob.value = null
  }

  const toggleTaskCreateTool = (tool: string, checked: boolean) => {
    const next = new Set(taskCreateForm.value.mcp_tools_override)
    if (checked) next.add(tool)
    else next.delete(tool)
    taskCreateForm.value.mcp_tools_override = Array.from(next)
  }

  const onTaskCreateToolChange = (tool: string, event: Event) => {
    const target = event.target as HTMLInputElement | null
    toggleTaskCreateTool(tool, !!target?.checked)
  }

  const submitTaskForAgent = async (agent?: Agent | null) => {
    if (!agent?.aiConfigId || taskCreateSubmitting.value) return
    const editingJob = taskEditingJob.value
    const invalid = validateTaskCreateForm(taskCreateForm.value)
    if (invalid) {
      void alert({ message: invalid, type: 'warning' })
      return
    }
    const token = getAuthToken()
    if (!token) return
    const defaultTools = parseAgentMcpTools(agent, fallbackTools())
    const selectedTools = [...taskCreateForm.value.mcp_tools_override].map(v => String(v || '').trim()).filter(Boolean)
    const autoEnableMcpOverride = !editingJob && !toolsMatch(selectedTools, defaultTools)
    const title = taskCreateForm.value.title.trim()
    taskCreateSubmitting.value = true
    try {
      const payload = buildTaskSubmitPayload(taskCreateForm.value, selectedTools, autoEnableMcpOverride)
      const data = editingJob
        ? await updateTaskJobById(agent.aiConfigId, editingJob.job_id, payload, token)
        : await triggerTaskForAgent(agent.aiConfigId, payload, token)
      void alert({
        message: editingJob
          ? `任务「${data.title || title}」已更新${String(editingJob.effective_status || editingJob.status).toLowerCase() === 'running' ? '，新规则将在下一次调度生效' : ''}`
          : `任务「${data.title || title}」已创建并入队`,
        type: 'success',
      })
      closeTaskCreatePanel()
      await fetchAgentTaskList(agent)
      await onReloadAgents()
    } catch (err: any) {
      void alert({ message: err?.message || (taskEditingJob.value ? '更新任务失败' : '创建任务失败'), type: 'error' })
    } finally {
      taskCreateSubmitting.value = false
    }
  }

  const pauseTaskJob = async (agent: Agent, job: AITaskJobItem) => {
    if (!agent.aiConfigId || !job.job_id || !canPauseTaskJob(job)) return
    const token = getAuthToken()
    if (!token) return
    try {
      await pauseTaskJobById(agent.aiConfigId, job.job_id, token)
    } catch (err: any) {
      void alert({ message: err?.message || '暂停任务失败', type: 'error' })
      return
    }
    void alert({ message: `任务「${job.title}」已暂停`, type: 'success' })
    await fetchAgentTaskList(agent, { silent: true })
  }

  const resumeTaskJob = async (agent: Agent, job: AITaskJobItem) => {
    if (!agent.aiConfigId || !job.job_id || !canResumeTaskJob(job)) return
    const token = getAuthToken()
    if (!token) return
    try {
      await resumeTaskJobById(agent.aiConfigId, job.job_id, token)
    } catch (err: any) {
      void alert({ message: err?.message || '开始任务失败', type: 'error' })
      return
    }
    void alert({ message: `任务「${job.title}」已进入执行队列`, type: 'success' })
    await fetchAgentTaskList(agent, { silent: true })
  }

  const deleteTaskJob = async (agent: Agent, job: AITaskJobItem) => {
    if (!agent.aiConfigId || !job.job_id) return
    const ok = await confirm({ message: `确认删除任务「${job.title}」？将强制停止当前思考并删除该任务对话记录。`, type: 'warning' })
    if (!ok) return
    const token = getAuthToken()
    if (!token) return
    try {
      await deleteTaskJobById(agent.aiConfigId, job.job_id, token)
    } catch (err: any) {
      void alert({ message: err?.message || '删除任务失败', type: 'error' })
      return
    }
    void alert({ message: `任务「${job.title}」已删除`, type: 'success' })
    await fetchAgentTaskList(agent, { silent: true })
    await onReloadAgents()
  }

  const toggleTaskJobSelection = (jobId: string, checked: boolean) => {
    const next = new Set(selectedTaskJobIds.value)
    if (checked) next.add(jobId)
    else next.delete(jobId)
    selectedTaskJobIds.value = Array.from(next)
  }

  const toggleAllTaskJobsSelection = (checked: boolean) => {
    if (!checked) {
      selectedTaskJobIds.value = []
      return
    }
    selectedTaskJobIds.value = completedTaskJobs.value.map(job => job.job_id)
  }

  const onTaskJobSelectChange = (jobId: string, event: Event) => {
    const target = event.target as HTMLInputElement | null
    toggleTaskJobSelection(jobId, !!target?.checked)
  }

  const onSelectAllTaskJobsChange = (event: Event) => {
    const target = event.target as HTMLInputElement | null
    toggleAllTaskJobsSelection(!!target?.checked)
  }

  const batchDeleteTaskJobs = async (agent?: Agent | null) => {
    if (!agent?.aiConfigId) return
    const selectedIds = [...selectedTaskJobIds.value]
    if (selectedIds.length === 0) {
      void alert({ message: '请先选择要删除的执行记录', type: 'warning' })
      return
    }
    const ok = await confirm({
      message: `确认批量删除 ${selectedIds.length} 条任务执行记录？将强制停止当前思考并删除相关对话记录。`,
      type: 'warning'
    })
    if (!ok) return
    const token = getAuthToken()
    if (!token) return

    const { successCount, failCount } = await batchDeleteTaskJobsById(agent.aiConfigId, selectedIds, token)
    selectedTaskJobIds.value = []
    await fetchAgentTaskList(agent, { silent: true })
    await onReloadAgents()
    if (failCount === 0) {
      void alert({ message: `已批量删除 ${successCount} 条任务执行记录`, type: 'success' })
    } else {
      void alert({ message: `批量删除完成：成功 ${successCount} 条，失败 ${failCount} 条`, type: 'warning' })
    }
  }

  const refreshOpenTaskPanel = async () => {
    if (!taskListModalOpen.value || !taskListTarget.value) return
    await fetchAgentTaskList(taskListTarget.value, { silent: true })
  }

  watch(taskJobs, (rows) => {
    const validIds = new Set(rows.filter(isCompletedTaskJob).map(row => row.job_id))
    selectedTaskJobIds.value = selectedTaskJobIds.value.filter(id => validIds.has(id))
  }, { deep: true })

  return {
    taskListModalOpen,
    taskListTarget,
    taskListItems,
    taskJobs,
    selectedTaskJobIds,
    taskListLoading,
    taskCreatePanelOpen,
    taskCreateSubmitting,
    taskEditingJobId,
    taskCreateForm,
    fetchAgentTaskList,
    openAgentTaskList,
    closeAgentTaskList,
    toggleTaskCreatePanel,
    openTaskCreatePanelFromJob,
    openTaskEditPanel,
    closeTaskCreatePanel,
    onTaskCreateToolChange,
    submitTaskForAgent,
    pauseTaskJob,
    resumeTaskJob,
    deleteTaskJob,
    onTaskJobSelectChange,
    onSelectAllTaskJobsChange,
    batchDeleteTaskJobs,
    refreshOpenTaskPanel,
  }
}

