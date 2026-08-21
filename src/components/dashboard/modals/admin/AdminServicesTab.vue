<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useMessage } from '@/composables/useMessage'
import * as adminApi from '@/api/admin'
import type { ServiceInfo } from '@/api/admin'
import { ADMIN_STATUS_META } from '@/constants/admin'
import { serviceDetailRows } from '@/utils/adminServiceDetails'
import AdminHostInfo from './AdminHostInfo.vue'
import AdminServiceLogs from './AdminServiceLogs.vue'
import AdminServiceTasks from './AdminServiceTasks.vue'

const { alert, confirm } = useMessage()

const services = ref<ServiceInfo[]>([])
const servicesLoading = ref(false)
const selectedServiceKey = ref('gateway')
const busyService = ref('')
const busyAllServices = ref(false)
const rebuildingAll = ref(false)
const STATUS_META = ADMIN_STATUS_META

const logsPanel = ref<{ load: (silent?: boolean) => Promise<void> } | null>(null)
const tasksPanel = ref<{ load: () => Promise<void> } | null>(null)

const SERVICE_GROUPS: Array<{ key: ServiceInfo['group']; label: string }> = [
  { key: 'runtime', label: '核心 Runtime' },
  { key: 'infrastructure', label: '基础设施与入口' },
  { key: 'channel', label: '功能链路与调度' },
]

const groupedServices = computed(() => SERVICE_GROUPS.map(group => ({
  ...group,
  services: services.value.filter(service => service.group === group.key && service.key !== 'host'),
})).filter(group => group.services.length > 0))

const hostService = computed(() => services.value.find(service => service.key === 'host') || null)

const loadServices = async () => {
  servicesLoading.value = true
  try {
    const res = await adminApi.listServices()
    services.value = res.services
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  } finally {
    servicesLoading.value = false
  }
}

const loadLogs = (key: string) => {
  selectedServiceKey.value = key
  void logsPanel.value?.load()
}

const refreshServicesTab = async () => {
  const selected = services.value.find(item => item.key === selectedServiceKey.value)
  const requests: Promise<unknown>[] = [loadServices(), tasksPanel.value?.load() ?? Promise.resolve()]
  if (!selected || selected.logs_available) requests.push(logsPanel.value?.load() ?? Promise.resolve())
  await Promise.all(requests)
}

const restartService = async (svc: ServiceInfo) => {
  const isSelf = svc.key === 'gateway'
  const ok = await confirm({
    message: isSelf
      ? `确认重启「${svc.name}」？这是当前正在服务本页面的进程，重启期间面板会短暂断开，恢复后请刷新。`
      : `确认重启「${svc.name}」服务（端口 ${svc.url || svc.key}）？该服务会重启进程并在同一端口恢复。`,
    type: 'warning',
  })
  if (!ok) return
  busyService.value = svc.key
  try {
    await adminApi.restartService(svc.key)
    await alert({
      message: isSelf ? '网关正在重启，请稍候刷新页面。' : `${svc.name} 正在重启…`,
      type: 'success',
    })
    if (!isSelf) {
      setTimeout(() => void loadServices(), 2500)
    }
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  } finally {
    busyService.value = ''
  }
}

const restartAllServices = async () => {
  const ok = await confirm({
    message: '确认全部重启核心应用 Runtime？系统将依次重启 MCP、Connector、AI，最后重启 Gateway；设备和网页会短暂断开。PostgreSQL、Web 容器和宿主更新器不会被此操作重启。',
    type: 'warning',
  })
  if (!ok) return
  busyAllServices.value = true
  try {
    const result = await adminApi.restartAllServices()
    if (!result.ok) {
      const failed = Object.entries(result.errors).map(([key, message]) => `${key}: ${message}`).join('；')
      await alert({ message: `部分服务未能发起重启：${failed || '未知错误'}`, type: 'error' })
      return
    }
    await alert({ message: '全部核心 Runtime 已发起重启，Gateway 将最后重启。请稍候刷新页面。', type: 'success' })
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  } finally {
    busyAllServices.value = false
  }
}

const rebuildAllContainers = async () => {
  const ok = await confirm({
    message: '确认重构全部容器？系统将重新构建镜像并重建所有 Docker 容器，管理控制台会暂时断开，完成后请刷新页面。',
    type: 'warning',
  })
  if (!ok) return
  rebuildingAll.value = true
  try {
    await adminApi.rebuildAllContainers()
    await alert({ message: '全部容器已进入后台重构队列，控制台可能暂时断开。', type: 'success' })
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  } finally {
    rebuildingAll.value = false
  }
}

const tick = () => {
  void loadServices()
  void tasksPanel.value?.load()
  void logsPanel.value?.load(true)
}

onMounted(() => { void refreshServicesTab() })

defineExpose({ tick })
</script>

<template>
  <div class="flex-1 overflow-y-auto p-3 sm:p-5 space-y-5">
    <AdminHostInfo v-if="hostService" :service="hostService" />

    <section>
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-zinc-400">子服务运行状态</h3>
        <div class="flex items-center gap-2">
          <button
            class="text-xs px-2 py-1 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-900/20 disabled:opacity-50"
            :disabled="rebuildingAll || busyAllServices || servicesLoading"
            @click="rebuildAllContainers"
          >{{ rebuildingAll ? '重构中…' : '⟳ 重构全部容器' }}</button>
          <button
            class="text-xs px-2 py-1 rounded-lg border border-amber-200 text-amber-600 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-900/20 disabled:opacity-50"
            :disabled="busyAllServices || servicesLoading"
            @click="restartAllServices"
          >{{ busyAllServices ? '正在发起…' : '↻ 全部重启' }}</button>
          <button
            class="text-xs px-2 py-1 rounded-lg border border-zinc-200 text-zinc-500 hover:text-indigo-600 hover:border-indigo-200 dark:border-zinc-700 dark:text-zinc-400"
            :disabled="servicesLoading"
            @click="refreshServicesTab"
          >{{ servicesLoading ? '刷新中…' : '↻ 刷新' }}</button>
        </div>
      </div>
      <div v-for="group in groupedServices" :key="group.key" class="mb-4 last:mb-0">
        <div class="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-2">{{ group.label }}</div>
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <div
            v-for="svc in group.services"
            :key="svc.key"
            class="text-left p-3 rounded-xl border transition-colors"
            :class="[
              selectedServiceKey === svc.key && svc.logs_available
                ? 'border-indigo-300 bg-indigo-50/50 dark:border-indigo-700 dark:bg-indigo-900/10'
                : 'border-zinc-200 dark:border-zinc-800',
              svc.logs_available ? 'cursor-pointer hover:border-indigo-200 dark:hover:border-indigo-800' : '',
            ]"
            @click="svc.logs_available && loadLogs(svc.key)"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{{ svc.name }}</span>
              <span
                class="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
                :class="(STATUS_META[svc.status] || STATUS_META.unknown).cls"
              >{{ (STATUS_META[svc.status] || { label: svc.status }).label }}</span>
            </div>
            <div class="text-[11px] text-zinc-600 dark:text-zinc-300 mt-2 min-h-8">{{ svc.summary || '暂无摘要' }}</div>
            <div class="text-[10px] text-zinc-400 mt-1 truncate" :title="svc.url">{{ svc.url || svc.key }}</div>
            <details v-if="serviceDetailRows(svc).length" class="mt-2 text-[10px] text-zinc-500 dark:text-zinc-400">
              <summary class="cursor-pointer select-none hover:text-indigo-500">运行明细（{{ serviceDetailRows(svc).length }}）</summary>
              <dl class="mt-1.5 space-y-1 max-h-40 overflow-y-auto pr-1">
                <div v-for="row in serviceDetailRows(svc)" :key="row.key" class="flex justify-between gap-3">
                  <dt class="truncate" :title="row.key">{{ row.label }}</dt>
                  <dd class="text-right text-zinc-700 dark:text-zinc-200 break-all">{{ row.value }}</dd>
                </div>
              </dl>
            </details>
            <div class="mt-2 flex items-center justify-end min-h-6">
              <button
                v-if="svc.restartable"
                class="text-[11px] px-2 py-1 rounded-lg text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20 disabled:opacity-50"
                :disabled="busyService === svc.key || busyAllServices"
                @click.stop="restartService(svc)"
              >{{ busyService === svc.key ? '重启中…' : '↻ 重启服务' }}</button>
              <span v-else class="text-[10px] text-zinc-400">状态只读</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <AdminServiceLogs ref="logsPanel" :service-key="selectedServiceKey" :services="services" />
    <AdminServiceTasks ref="tasksPanel" />
  </div>
</template>
