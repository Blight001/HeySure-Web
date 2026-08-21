<script setup lang="ts">
import { computed } from 'vue'
import type { ServiceInfo } from '@/api/admin'
import { ADMIN_STATUS_META } from '@/constants/admin'

const props = defineProps<{
  service: ServiceInfo
}>()

type DetailRecord = Record<string, unknown>

const asRecord = (value: unknown): DetailRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as DetailRecord : {}

const asNumber = (record: DetailRecord, ...keys: string[]): number | null => {
  for (const key of keys) {
    const raw = record[key]
    if (raw === null || raw === undefined || raw === '') continue
    const value = Number(raw)
    if (Number.isFinite(value)) return value
  }
  return null
}

const asText = (record: DetailRecord, key: string): string => {
  const value = record[key]
  return value === null || value === undefined ? '' : String(value).trim()
}

const formatBytes = (bytes: number | null): string => {
  if (bytes === null || bytes < 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

const formatPercent = (value: number | null): string =>
  value === null ? '—' : `${Math.max(0, Math.min(100, value)).toFixed(1)}%`

const formatUptime = (seconds: number | null): string => {
  if (seconds === null || seconds < 0) return '—'
  const totalMinutes = Math.floor(seconds / 60)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  return [days ? `${days} 天` : '', hours ? `${hours} 小时` : '', minutes || (!days && !hours) ? `${minutes} 分钟` : '']
    .filter(Boolean)
    .join(' ')
}

const detail = computed(() => asRecord(props.service.detail))
const cpu = computed(() => asRecord(detail.value.cpu))
const memory = computed(() => asRecord(detail.value.memory))
const disk = computed(() => asRecord(detail.value.disk))
const statusMeta = computed(() => ADMIN_STATUS_META[props.service.status] || ADMIN_STATUS_META.unknown)
const collectionErrors = computed(() => {
  const errors = detail.value.collection_errors
  return Array.isArray(errors) ? errors.map(String).filter(Boolean) : []
})

const identity = computed(() => ({
  hostname: asText(detail.value, 'hostname') || '—',
  system: [asText(detail.value, 'os'), asText(detail.value, 'os_release')].filter(Boolean).join(' ') || '—',
  architecture: asText(detail.value, 'architecture') || '—',
}))

const metrics = computed(() => {
  const cpuUsage = asNumber(cpu.value, 'usage_percent')
  const memoryUsage = asNumber(memory.value, 'usage_percent')
  const diskUsage = asNumber(disk.value, 'usage_percent')
  const logicalCount = asNumber(cpu.value, 'logical_count')
  const physicalCount = asNumber(cpu.value, 'physical_count')
  return [
    {
      key: 'cpu', label: 'CPU', value: formatPercent(cpuUsage), percent: cpuUsage,
      detail: `${logicalCount ?? '—'} 逻辑核 · ${physicalCount ?? '—'} 物理核`,
    },
    {
      key: 'memory', label: '内存', value: formatPercent(memoryUsage), percent: memoryUsage,
      detail: `${formatBytes(asNumber(memory.value, 'used_bytes', 'used'))} / ${formatBytes(asNumber(memory.value, 'total_bytes', 'total'))}`,
    },
    {
      key: 'disk', label: '磁盘', value: formatPercent(diskUsage), percent: diskUsage,
      detail: `${formatBytes(asNumber(disk.value, 'used_bytes', 'used'))} / ${formatBytes(asNumber(disk.value, 'total_bytes', 'total'))}`,
    },
    {
      key: 'uptime', label: '运行时间', value: formatUptime(asNumber(detail.value, 'uptime_seconds')),
      percent: null, detail: '自服务器启动以来',
    },
  ]
})

const progressWidth = (percent: number | null) => `${Math.max(0, Math.min(100, percent ?? 0))}%`
</script>

<template>
  <section class="rounded-xl border border-zinc-200 bg-zinc-50/40 p-4 dark:border-zinc-800 dark:bg-zinc-900/20">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">基础服务器信息</h3>
          <span class="rounded-full px-2 py-0.5 text-[10px] font-medium" :class="statusMeta.cls">{{ statusMeta.label }}</span>
        </div>
        <p class="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">{{ service.summary || '宿主机资源概览' }}</p>
      </div>
      <dl class="grid grid-cols-1 gap-x-5 gap-y-1 text-[11px] sm:grid-cols-3">
        <div><dt class="inline text-zinc-400">主机 </dt><dd class="inline text-zinc-700 dark:text-zinc-200">{{ identity.hostname }}</dd></div>
        <div><dt class="inline text-zinc-400">系统 </dt><dd class="inline text-zinc-700 dark:text-zinc-200">{{ identity.system }}</dd></div>
        <div><dt class="inline text-zinc-400">架构 </dt><dd class="inline text-zinc-700 dark:text-zinc-200">{{ identity.architecture }}</dd></div>
      </dl>
    </div>

    <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div v-for="metric in metrics" :key="metric.key" class="rounded-lg border border-zinc-200/80 bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/30">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs text-zinc-500 dark:text-zinc-400">{{ metric.label }}</span>
          <span class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{{ metric.value }}</span>
        </div>
        <div v-if="metric.percent !== null" class="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div class="h-full rounded-full bg-indigo-500 transition-[width]" :style="{ width: progressWidth(metric.percent) }"></div>
        </div>
        <div class="mt-2 truncate text-[10px] text-zinc-400" :title="metric.detail">{{ metric.detail }}</div>
      </div>
    </div>

    <div v-if="collectionErrors.length" class="mt-3 text-[11px] text-amber-600 dark:text-amber-400">
      部分信息采集失败：{{ collectionErrors.join('；') }}
    </div>
  </section>
</template>
