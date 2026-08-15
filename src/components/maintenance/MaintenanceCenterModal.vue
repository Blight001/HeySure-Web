<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { CreateMaintenanceTaskInput } from '@/api/maintenance'
import { listAiConfigs } from '@/api/ai'
import { listConnectedDevices } from '@/api/devices'
import { useMaintenanceCenter } from '@/composables/maintenance/useMaintenanceCenter'
import MaintenanceCreateForm from './MaintenanceCreateForm.vue'
import MaintenanceTaskDetail from './MaintenanceTaskDetail.vue'
import MaintenanceTaskList from './MaintenanceTaskList.vue'

defineProps<{ show: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const center = useMaintenanceCenter()
const { tasks, selected, events, loading, detailLoading, error, connected } = center
const creating = ref(false)
const actionError = ref('')
const members = ref<{ id: number; name: string }[]>([])
const devices = ref<{ id: string; name: string; boundAiConfigIds: number[] }[]>([])

const runAction = async (action: () => Promise<void>) => {
  actionError.value = ''
  try { await action() } catch (cause) { actionError.value = cause instanceof Error ? cause.message : '操作失败' }
}

const createTask = (input: CreateMaintenanceTaskInput) => runAction(async () => {
  await center.createTask(input)
  creating.value = false
})

const loadTargets = async () => {
  const [configs, connectedRows] = await Promise.all([listAiConfigs(), listConnectedDevices()])
  members.value = configs.map(item => ({ id: Number(item.id), name: String(item.name || `成员 ${item.id}`) })).filter(item => item.id > 0)
  devices.value = (connectedRows.agents || []).filter(item => String(item.platform || '').toLowerCase() === 'codex-maintainer').map(item => ({
    id: String(item.deviceId || item.id || ''), name: String(item.name || item.remark || item.deviceId || 'Codex 维护设备'),
    boundAiConfigIds: (item.boundAiConfigIds || [item.aiConfigId || item.ai_config_id]).map(Number).filter(Number.isFinite),
  })).filter(item => item.id)
}

onMounted(() => { void center.start(); void loadTargets().catch(() => undefined) })
</script>

<template>
  <Transition name="fade">
    <div v-if="show" class="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/55 p-2 backdrop-blur-sm sm:p-5" @click.self="emit('close')">
      <div class="flex h-[min(92dvh,920px)] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <header class="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div><div class="flex items-center gap-2"><h1 class="text-base font-bold">项目维护中心</h1><span class="h-2 w-2 rounded-full" :class="connected ? 'bg-emerald-500' : 'bg-amber-500'"></span><span class="text-[10px] text-zinc-500">{{ connected ? '实时连接' : '增量同步' }}</span></div><p class="mt-0.5 text-xs text-zinc-500">德克萨斯协调 · Codex 本地维护设备执行</p></div>
          <div class="flex gap-2"><button class="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white" @click="creating = true">新建工单</button><button class="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 text-lg dark:border-zinc-700" aria-label="关闭" @click="emit('close')">×</button></div>
        </header>
        <div v-if="error || actionError" class="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{{ actionError || error }}</div>
        <div class="grid min-h-0 flex-1 md:grid-cols-[320px_minmax(0,1fr)]">
          <aside class="max-h-56 overflow-y-auto border-b border-zinc-200 dark:border-zinc-800 md:max-h-none md:border-b-0 md:border-r"><MaintenanceTaskList :tasks="tasks" :selected-id="selected?.id" :loading="loading" @select="center.selectTask" /></aside>
          <section class="min-h-0"><MaintenanceCreateForm v-if="creating" :members="members" :devices="devices" @submit="createTask" @cancel="creating = false" /><MaintenanceTaskDetail v-else :task="selected" :events="events" :loading="detailLoading" @steer="message => runAction(() => center.steer(message))" @interrupt="runAction(center.interrupt)" @decide="(id, decision) => runAction(() => center.decide(id, decision))" /></section>
        </div>
      </div>
    </div>
  </Transition>
</template>
