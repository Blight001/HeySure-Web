<script setup lang="ts">
import { ref, watch } from 'vue'
import { getExternalControlStatus, issueExternalControllerCredential, revokeExternalControllerCredential } from '@/api/ai'
import { copyTextToClipboard } from '@/utils/clipboard'

const props = defineProps<{
  editingConfigId: number
  executionMode?: string
}>()

const controllerBusy = ref(false)
const controllerError = ref('')
const controllerNotice = ref('')
const controllerHandoff = ref('')
const controllerCredentials = ref<Array<Record<string, any>>>([])

const loadControllerStatus = async () => {
  if (!props.editingConfigId || props.executionMode !== 'external_mcp') {
    controllerCredentials.value = []
    return
  }
  try {
    const status = await getExternalControlStatus(props.editingConfigId)
    controllerCredentials.value = Array.isArray(status.credentials) ? status.credentials : []
  } catch (err: any) {
    controllerError.value = err?.message || '外部控制状态加载失败'
  }
}

const generateControllerHandoff = async () => {
  if (!props.editingConfigId) return
  controllerBusy.value = true
  controllerError.value = ''
  controllerNotice.value = ''
  try {
    const result = await issueExternalControllerCredential(props.editingConfigId, { label: 'Codex', ttl_days: 30 })
    controllerHandoff.value = String(result.handoff_markdown || '')
    controllerNotice.value = '新凭证已生成；此前的活动凭证已自动吊销。'
    await loadControllerStatus()
  } catch (err: any) {
    controllerError.value = err?.message || '控制文档生成失败'
  } finally {
    controllerBusy.value = false
  }
}

const copyControllerHandoff = async (event: Event) => {
  const ok = await copyTextToClipboard(controllerHandoff.value, event.currentTarget as Element | null)
  controllerNotice.value = ok ? '控制文档已复制。' : '复制失败，请手动选择文本。'
}

const revokeControllerCredential = async (credentialId: number) => {
  if (!props.editingConfigId) return
  controllerBusy.value = true
  controllerError.value = ''
  try {
    await revokeExternalControllerCredential(props.editingConfigId, credentialId)
    controllerNotice.value = '控制凭证已吊销。'
    await loadControllerStatus()
  } catch (err: any) {
    controllerError.value = err?.message || '凭证吊销失败'
  } finally {
    controllerBusy.value = false
  }
}

watch(
  () => [props.editingConfigId, props.executionMode],
  () => { void loadControllerStatus() },
  { immediate: true },
)

defineExpose({ clearNotices: () => {
  controllerHandoff.value = ''
  controllerError.value = ''
  controllerNotice.value = ''
} })
</script>

<template>
  <div class="mt-4 rounded-lg border border-cyan-200 bg-cyan-50/60 p-3 dark:border-cyan-500/30 dark:bg-cyan-950/20">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <div class="text-xs font-semibold text-cyan-800 dark:text-cyan-200">远程 MCP 控制器</div>
        <div class="mt-1 text-[11px] text-cyan-700/80 dark:text-cyan-300/80">
          {{ editingConfigId ? `活动凭证 ${controllerCredentials.filter(item => item.state === 'active').length} 个` : '请先保存成员，再生成控制文档。' }}
        </div>
      </div>
      <button
        v-if="editingConfigId"
        type="button"
        :disabled="controllerBusy"
        class="rounded-lg bg-cyan-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
        @click="generateControllerHandoff"
      >{{ controllerBusy ? '处理中…' : '生成新的控制文档' }}</button>
    </div>
    <div v-if="controllerHandoff" class="mt-3 space-y-2">
      <textarea :value="controllerHandoff" readonly rows="10" class="w-full resize-y rounded-lg border border-cyan-200 bg-white/80 p-3 font-mono text-[11px] leading-5 text-zinc-700 dark:border-cyan-500/30 dark:bg-zinc-950/70 dark:text-zinc-200"></textarea>
      <div class="flex justify-end">
        <button type="button" class="rounded border border-cyan-300 px-3 py-1.5 text-xs text-cyan-700 dark:border-cyan-500/40 dark:text-cyan-200" @click="copyControllerHandoff">复制控制文档</button>
      </div>
    </div>
    <div v-if="controllerCredentials.some(item => item.state === 'active')" class="mt-3 space-y-1">
      <div v-for="credential in controllerCredentials.filter(item => item.state === 'active')" :key="credential.id" class="flex items-center justify-between rounded border border-cyan-100 bg-white/60 px-2 py-1.5 text-[11px] dark:border-cyan-500/20 dark:bg-zinc-900/50">
        <span>{{ credential.label }} · {{ credential.token_prefix }}… · 到期 {{ new Date(credential.expires_at * 1000).toLocaleString() }}</span>
        <button type="button" class="text-rose-600 dark:text-rose-300" :disabled="controllerBusy" @click="revokeControllerCredential(Number(credential.id))">吊销</button>
      </div>
    </div>
    <div v-if="controllerError" class="mt-2 text-xs text-rose-600 dark:text-rose-300">{{ controllerError }}</div>
    <div v-if="controllerNotice" class="mt-2 text-xs text-emerald-700 dark:text-emerald-300">{{ controllerNotice }}</div>
  </div>
</template>
