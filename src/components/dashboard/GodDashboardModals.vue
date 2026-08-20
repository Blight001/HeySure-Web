<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import type { ConnectedDevice } from '@/composables/dashboard/useDashboardData'
import type { ModelPreset, User } from '@/types'

const McpToolsModal = defineAsyncComponent(() => import('./modals/McpToolsModal.vue'))
const DeviceDynamicToolsModal = defineAsyncComponent(() => import('./modals/DeviceDynamicToolsModal.vue'))
const TaskManagementModal = defineAsyncComponent(() => import('./modals/TaskManagementModal.vue'))
const AiConfigModal = defineAsyncComponent(() => import('./modals/AiConfigModal.vue'))
const AdminModal = defineAsyncComponent(() => import('./modals/AdminModal.vue'))
const DeviceDevDocModal = defineAsyncComponent(() => import('./modals/DeviceDevDocModal.vue'))
const SystemSettingsPanel = defineAsyncComponent(() => import('./panels/SystemSettingsPanel.vue'))

defineProps<{
  mcp: Record<string, any>
  tasks: Record<string, any>
  ai: Record<string, any>
  system: Record<string, any>
  ui: Record<string, any>
  connectedDevices: ConnectedDevice[]
  defaultMcpTools: string[]
  adminOpen: boolean
  deviceDocOpen: boolean
  deviceToolsOpen: boolean
  deviceToolsInitialType?: 'desktop' | 'browser' | 'android'
  currentUser?: User | null
  modelPresets: ModelPreset[]
}>()

const emit = defineEmits<{
  (e: 'update:adminOpen', value: boolean): void
  (e: 'update:deviceDocOpen', value: boolean): void
  (e: 'close-device-tools'): void
  (e: 'save-ai'): void
  (e: 'delete-ai'): void
  (e: 'show-task-detail', job: { job_id: string; session_id?: string }): void
}>()
</script>

<template>
  <McpToolsModal
    :show="mcp.toolModalOpen"
    :title="mcp.toolModalTitle"
    :items="mcp.toolModalItems"
    @close="mcp.toolModalOpen = false"
  />

  <DeviceDynamicToolsModal
    :show="deviceToolsOpen"
    :initial-device-type="deviceToolsInitialType"
    @close="emit('close-device-tools')"
  />

  <TaskManagementModal
    :show="tasks.taskListModalOpen && !!tasks.taskListTarget"
    :target="tasks.taskListTarget"
    :task-list-items="tasks.taskListItems"
    :task-jobs="tasks.taskJobs"
    :selected-task-job-ids="tasks.selectedTaskJobIds"
    :task-list-loading="tasks.taskListLoading"
    :task-create-panel-open="tasks.taskCreatePanelOpen"
    :task-create-submitting="tasks.taskCreateSubmitting"
    :task-editing-job-id="tasks.taskEditingJobId"
    :task-create-form="tasks.taskCreateForm"
    :available-mcp-tools="ai.availableMcpTools"
    :default-mcp-tools="defaultMcpTools"
    :on-close="tasks.closeAgentTaskList"
    :on-refresh="() => tasks.taskListTarget && tasks.fetchAgentTaskList(tasks.taskListTarget)"
    :on-toggle-task-create-panel="() => tasks.taskListTarget && tasks.toggleTaskCreatePanel(tasks.taskListTarget)"
    :on-close-task-create-panel="tasks.closeTaskCreatePanel"
    :on-submit-task="() => tasks.submitTaskForAgent(tasks.taskListTarget)"
    :on-task-create-tool-change="tasks.onTaskCreateToolChange"
    :on-reuse-task-template="(job) => tasks.taskListTarget && tasks.openTaskCreatePanelFromJob(tasks.taskListTarget, job)"
    :on-edit-task-job="(job) => tasks.taskListTarget && tasks.openTaskEditPanel(tasks.taskListTarget, job)"
    :on-show-task-detail="(job) => emit('show-task-detail', job)"
    :on-pause-task-job="(job) => tasks.taskListTarget && tasks.pauseTaskJob(tasks.taskListTarget, job)"
    :on-resume-task-job="(job) => tasks.taskListTarget && tasks.resumeTaskJob(tasks.taskListTarget, job)"
    :on-delete-task-job="(job) => tasks.taskListTarget && tasks.deleteTaskJob(tasks.taskListTarget, job)"
    :on-toggle-all-task-jobs-selection="tasks.onSelectAllTaskJobsChange"
    :on-task-job-select-change="tasks.onTaskJobSelectChange"
    :on-batch-delete-task-jobs="() => tasks.batchDeleteTaskJobs(tasks.taskListTarget)"
  />

  <AiConfigModal
    :show="ai.aiConfigModalOpen"
    :mode="ai.aiConfigMode"
    :form="ai.aiConfigForm"
    :delete-confirm="ai.aiConfigDeleteConfirm"
    :settings-section="ai.aiConfigSettingsSection"
    :available-mcp-tools="ai.availableMcpTools"
    :connected-devices="connectedDevices"
    :model-presets="modelPresets"
    :on-close="() => ai.aiConfigModalOpen = false"
    :on-toggle-settings-section="ai.toggleAiConfigSettingsSection"
    :on-toggle-delete-confirm="() => ai.aiConfigDeleteConfirm = !ai.aiConfigDeleteConfirm"
    :on-save="() => emit('save-ai')"
    :on-delete="() => emit('delete-ai')"
  />

  <SystemSettingsPanel
    v-model:show="ui.settingsOpen"
    v-model:globalMcpCallMethod="system.globalMcpCallMethod"
    v-model:mcpNamespaceHints="system.mcpNamespaceHints"
    v-model:mcpDynamicRule="system.mcpDynamicRule"
    v-model:globalMcpFormatErrorHint="system.globalMcpFormatErrorHint"
    v-model:defaultStartTaskPrompt="system.defaultStartTaskPrompt"
    v-model:defaultResumeTaskPrompt="system.defaultResumeTaskPrompt"
    v-model:defaultSupervisionPrompt="system.defaultSupervisionPrompt"
    v-model:defaultSupervisionIdleSeconds="system.defaultSupervisionIdleSeconds"
    v-model:defaultCompressionPrompt="system.defaultCompressionPrompt"
    v-model:promptAiMessageNotify="system.promptAiMessageNotify"
    v-model:promptAiMessageInquiry="system.promptAiMessageInquiry"
    v-model:aiMessageInquiryReminderSeconds="system.aiMessageInquiryReminderSeconds"
    v-model:promptAiMessageInquiryReminder="system.promptAiMessageInquiryReminder"
    v-model:promptAiMessageReply="system.promptAiMessageReply"
    v-model:promptAiMessageReplySuccess="system.promptAiMessageReplySuccess"
    v-model:promptUserMessageNotice="system.promptUserMessageNotice"
    v-model:themeMode="system.themeMode"
    v-model:fontSize="system.fontSize"
    v-model:tavilyApiKey="system.tavilyApiKey"
    v-model:modelPresets="system.modelPresets"
    v-model:mcpMaxSteps="system.mcpMaxSteps"
    v-model:mcpHistoryResultMaxChars="system.mcpHistoryResultMaxChars"
    v-model:conversationAutoCompressEnabled="system.conversationAutoCompressEnabled"
    @save="system.saveSystemSettings"
  />

  <AdminModal
    :show="adminOpen"
    :current-user="currentUser"
    @close="emit('update:adminOpen', false)"
  />

  <DeviceDevDocModal
    :show="deviceDocOpen"
    @close="emit('update:deviceDocOpen', false)"
  />
</template>
