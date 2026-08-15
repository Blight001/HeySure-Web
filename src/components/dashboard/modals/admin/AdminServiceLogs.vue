<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import * as adminApi from '@/api/admin'
import type { LogLine, ServiceInfo } from '@/api/admin'
import { ADMIN_LOG_LEVELS } from '@/constants/admin'
import { formatLogTime } from '@/utils/adminFormat'

const props = defineProps<{
  serviceKey: string
  services: ServiceInfo[]
}>()

const logLines = ref<LogLine[]>([])
const logsLoading = ref(false)
const logsNote = ref('')
const logLevel = ref('')
const logSearch = ref('')
const logAutoScroll = ref(true)
const logContainer = ref<HTMLElement | null>(null)
const LOG_LEVELS = ADMIN_LOG_LEVELS
const fmtLogTime = formatLogTime

const selectedName = computed(() =>
  props.services.find(item => item.key === props.serviceKey)?.name || props.serviceKey,
)

const filteredLogLines = computed(() => {
  const q = logSearch.value.trim().toLowerCase()
  if (!q) return logLines.value
  return logLines.value.filter(line =>
    line.msg.toLowerCase().includes(q) || line.logger.toLowerCase().includes(q),
  )
})

const scrollLogsToBottom = () => {
  if (!logAutoScroll.value) return
  void nextTick(() => {
    const el = logContainer.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

const load = async (silent = false) => {
  const service = props.services.find(item => item.key === props.serviceKey)
  if (service && !service.logs_available) return
  if (!silent) logsLoading.value = true
  logsNote.value = ''
  try {
    const res = await adminApi.getServiceLogs(props.serviceKey, 300, logLevel.value || undefined)
    logLines.value = res.lines
    logsNote.value = res.note || ''
    scrollLogsToBottom()
  } catch (err) {
    logLines.value = []
    logsNote.value = (err as Error).message
  } finally {
    logsLoading.value = false
  }
}

watch(logLevel, () => { void load(true) })

defineExpose({ load })
</script>

<template>
  <section>
    <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        控制台输出 · {{ selectedName }}
      </h3>
      <div class="flex items-center gap-2">
        <select
          v-model="logLevel"
          class="text-xs acrylic-input rounded-lg px-2 py-1 text-zinc-600 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-300"
          title="按级别过滤"
        >
          <option v-for="lv in LOG_LEVELS" :key="lv" :value="lv">{{ lv || '全部级别' }}</option>
        </select>
        <input
          v-model="logSearch"
          type="text"
          placeholder="搜索关键字…"
          class="text-xs acrylic-input rounded-lg px-2 py-1 text-zinc-600 w-28 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-300"
        />
        <label class="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400 cursor-pointer select-none">
          <input type="checkbox" v-model="logAutoScroll" class="accent-indigo-500" /> 滚动到底
        </label>
        <button
          class="text-xs px-2 py-1 rounded-lg border border-zinc-200 text-zinc-500 hover:text-indigo-600 hover:border-indigo-200 dark:border-zinc-700 dark:text-zinc-400"
          :disabled="logsLoading"
          @click="load()"
        >{{ logsLoading ? '加载中…' : '↻' }}</button>
      </div>
    </div>
    <div ref="logContainer" class="bg-zinc-950 text-zinc-100 rounded-xl p-3 font-mono text-[11px] leading-relaxed h-56 overflow-y-auto">
      <div v-if="logsNote" class="text-amber-400 mb-1">{{ logsNote }}</div>
      <div v-if="!filteredLogLines.length && !logsLoading && !logsNote" class="text-zinc-500">暂无日志</div>
      <div v-for="line in filteredLogLines" :key="line.seq" class="whitespace-pre-wrap break-all">
        <span class="text-zinc-500">{{ fmtLogTime(line.ts) }}</span>
        <span
          class="mx-1 font-bold"
          :class="{
            'text-red-400': line.level === 'ERROR' || line.level === 'CRITICAL',
            'text-amber-400': line.level === 'WARNING',
            'text-sky-400': line.level === 'INFO',
            'text-zinc-500': line.level === 'DEBUG',
          }"
        >{{ line.level }}</span>
        <span class="text-zinc-400">{{ line.logger }}</span>
        <span class="text-zinc-100"> — {{ line.msg }}</span>
      </div>
    </div>
  </section>
</template>
