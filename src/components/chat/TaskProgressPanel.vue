<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { getAuthToken } from '@/api/http'
import { fetchTaskPlan, type TaskPlanPhase, type TaskPlanResponse } from '@/api/task'
import TaskProgressHeaderFlow from './task/TaskProgressHeaderFlow.vue'
import TaskProgressSidebar from './task/TaskProgressSidebar.vue'
import { computeProgressPercent } from '@/utils/taskProgressFormat'

const props = withDefaults(defineProps<{
  configId?: number
  sessionId?: string
  refreshSignal?: number
  compact?: boolean
  header?: boolean
}>(), {
  configId: undefined,
  sessionId: '',
  refreshSignal: 0,
  compact: false,
  header: false,
})

const emit = defineEmits<{
  (e: 'visibility-change', value: boolean): void
}>()

const data = ref<TaskPlanResponse | null>(null)
const loading = ref(false)
const visible = computed(() => !!data.value && data.value.stage !== 'none')

watch(visible, (v) => emit('visibility-change', v), { immediate: true })

const stage = computed(() => data.value?.stage ?? 'none')
const plan = computed(() => data.value?.plan ?? null)
const phases = computed<TaskPlanPhase[]>(() => plan.value?.phases ?? [])
const planningDone = computed(() => !!data.value?.has_plan)
const finished = computed(() => stage.value === 'finished')
const outcome = computed(() => data.value?.outcome ?? '')
const progressPercent = computed(() => computeProgressPercent(
  finished.value,
  stage.value,
  planningDone.value,
  phases.value,
))

let lastPayloadJson = ''

const refresh = async () => {
  const token = getAuthToken()
  const sid = String(props.sessionId || '').trim()
  if (!token || props.configId === undefined || props.configId === null || !sid) {
    data.value = null
    lastPayloadJson = ''
    return
  }
  loading.value = true
  try {
    const next = await fetchTaskPlan(props.configId, sid, token)
    const json = JSON.stringify(next)
    if (json !== lastPayloadJson) {
      lastPayloadJson = json
      data.value = next
    }
  } catch {
    data.value = null
    lastPayloadJson = ''
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.configId, props.sessionId, props.refreshSignal] as const,
  () => { void refresh() },
  { immediate: true },
)

let headerPollInterval: ReturnType<typeof setInterval> | null = null
const stopPolling = () => {
  if (headerPollInterval != null) {
    clearInterval(headerPollInterval)
    headerPollInterval = null
  }
}

const startPolling = () => {
  stopPolling()
  if (!props.header || props.configId == null || !props.sessionId) return
  headerPollInterval = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return
    void refresh()
  }, 2000)
}

watch(() => [props.header, props.configId, props.sessionId] as const, () => {
  if (props.header && props.configId != null && props.sessionId) startPolling()
  else stopPolling()
}, { immediate: true })

onBeforeUnmount(() => {
  stopPolling()
})
</script>

<template>
  <TaskProgressHeaderFlow
    v-if="visible && props.header"
    :plan="plan"
    :phases="phases"
    :stage="stage"
    :finished="finished"
    :outcome="outcome"
    :progress-percent="progressPercent"
  />
  <TaskProgressSidebar
    v-if="visible && !props.header"
    :compact="props.compact"
    :loading="loading"
    :plan="plan"
    :phases="phases"
    :stage="stage"
    :planning-done="planningDone"
    :finished="finished"
    :outcome="outcome"
    @refresh="refresh"
  />
</template>
