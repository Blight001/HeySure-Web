<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import * as rescueApi from '@/api/hostRescue'
import { useMessage } from '@/composables/useMessage'
import { usePopupZIndex } from '@/composables/usePopupZIndex'
import type { HostRescueService, HostRescueStatus } from '@/api/hostRescue'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'openAdmin'): void }>()
const { confirm } = useMessage()
const zIndex = usePopupZIndex(() => props.show)
const token = ref('')
const status = ref<HostRescueStatus | null>(null)
const serviceAvailable = ref<boolean | null>(null)
const autoRecover = ref(false)
const loading = ref(false)
const actionBusy = ref('')
const error = ref('')
let pollTimer: number | undefined

const rescueUrl = rescueApi.hostRescueBaseUrl()
const connected = computed(() => Boolean(status.value))
const serviceName = (service: string) => ({
  'api-gateway': 'API Gateway',
  'mcp-runtime': 'MCP Runtime',
  'connector-runtime': 'Connector Runtime',
  'ai-runtime': 'AI Runtime',
}[service] || service)
const stateClass = (service: HostRescueService) => {
  if (service.state === 'running' && (!service.health || service.health === 'healthy')) return 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20'
  if (service.state === 'running') return 'text-amber-300 bg-amber-400/10 border-amber-400/20'
  return 'text-rose-300 bg-rose-400/10 border-rose-400/20'
}

const stopPolling = () => {
  if (pollTimer !== undefined) window.clearInterval(pollTimer)
  pollTimer = undefined
}

const refreshStatus = async (silent = false) => {
  if (!token.value.trim()) return
  if (!silent) loading.value = true
  try {
    status.value = await rescueApi.getHostRescueStatus(token.value.trim())
    error.value = ''
  } catch (err) {
    if (!silent) error.value = (err as Error).message
  } finally {
    if (!silent) loading.value = false
  }
}

const connect = async () => {
  if (!token.value.trim()) {
    error.value = '请输入独立恢复密钥'
    return
  }
  await refreshStatus()
  if (status.value) {
    stopPolling()
    pollTimer = window.setInterval(() => void refreshStatus(true), 3000)
  }
}

const recover = async (action: 'restart_gateway' | 'restart_runtimes') => {
  const all = action === 'restart_runtimes'
  const approved = await confirm({
    type: 'warning',
    message: all
      ? '确认按 Gateway → MCP → Connector → AI 顺序强制重建四个 Runtime 容器？数据库和 Web 不会重启。'
      : '确认强制重建 API Gateway 容器？当前请求会短暂中断。',
  })
  if (!approved) return
  actionBusy.value = action
  error.value = ''
  try {
    await rescueApi.recoverHost(token.value.trim(), action)
    window.setTimeout(() => void refreshStatus(true), 1200)
  } catch (err) {
    error.value = (err as Error).message
  } finally {
    actionBusy.value = ''
  }
}

const openAdmin = () => {
  emit('close')
  emit('openAdmin')
}

watch(
  () => props.show,
  async (visible) => {
    if (!visible) {
      stopPolling()
      token.value = ''
      status.value = null
      error.value = ''
      return
    }
    serviceAvailable.value = null
    try {
      const health = await rescueApi.checkHostRescue()
      serviceAvailable.value = true
      autoRecover.value = health.auto_recover
    } catch {
      serviceAvailable.value = false
    }
  },
)

onBeforeUnmount(stopPolling)
</script>

<template>
  <Teleport to="body">
    <div v-if="show" :style="{ zIndex }" class="fixed inset-0 modal-overlay flex items-center justify-center p-4" @click="emit('close')">
      <div class="w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-950/95 shadow-2xl shadow-black/60 overflow-hidden" @click.stop>
        <header class="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <h2 class="font-semibold text-zinc-100">宿主恢复控制台</h2>
            <p class="mt-1 text-xs text-zinc-500">宿主端口 58152 · 当前入口 {{ rescueUrl }} · 不依赖 API Gateway</p>
          </div>
          <button class="h-8 w-8 rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-white" @click="emit('close')">✕</button>
        </header>

        <div class="max-h-[75vh] overflow-y-auto p-5 space-y-5">
          <div class="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3">
            <div>
              <div class="text-sm text-zinc-200">独立恢复服务</div>
              <div class="mt-0.5 text-xs text-zinc-500">systemd 常驻，进程退出后自动拉起</div>
            </div>
            <span class="rounded-full px-2.5 py-1 text-xs" :class="serviceAvailable === true ? 'bg-emerald-400/10 text-emerald-300' : serviceAvailable === false ? 'bg-rose-400/10 text-rose-300' : 'bg-zinc-800 text-zinc-400'">
              {{ serviceAvailable === true ? (autoRecover ? '在线 · 自动恢复已启用' : '在线') : serviceAvailable === false ? '不可达' : '检测中…' }}
            </span>
          </div>

          <div v-if="!connected" class="space-y-3">
            <label class="block text-sm text-zinc-300">独立恢复密钥</label>
            <div class="flex flex-col sm:flex-row gap-2">
              <input v-model="token" type="password" autocomplete="off" class="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-zinc-100 outline-none focus:border-amber-500" placeholder="HEYSURE_RESCUE_TOKEN" @keyup.enter="connect" />
              <button class="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50" :disabled="loading || serviceAvailable === false" @click="connect">
                {{ loading ? '验证中…' : '验证并连接' }}
              </button>
            </div>
            <p class="text-xs text-zinc-500">密钥仅保存在当前弹窗内存中，关闭后立即清除，不使用登录数据库。</p>
          </div>

          <template v-else>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div v-for="service in status?.services" :key="service.service" class="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <div class="flex items-center justify-between gap-3">
                  <span class="text-sm font-medium text-zinc-200">{{ serviceName(service.service) }}</span>
                  <span class="rounded-full border px-2 py-0.5 text-[11px]" :class="stateClass(service)">{{ service.health || service.state }}</span>
                </div>
                <p class="mt-2 truncate text-xs text-zinc-500" :title="service.status">{{ service.status }}</p>
              </div>
            </div>

            <div class="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div class="text-sm font-medium text-amber-200">恢复操作</div>
              <p class="mt-1 text-xs leading-relaxed text-zinc-400">操作只重建应用 Runtime，不执行数据库迁移、不删除数据，也不重启独立恢复服务自身。</p>
              <div class="mt-3 flex flex-col sm:flex-row gap-2">
                <button class="rounded-lg border border-amber-500/40 px-3 py-2 text-sm text-amber-200 hover:bg-amber-500/10 disabled:opacity-50" :disabled="Boolean(actionBusy)" @click="recover('restart_gateway')">
                  {{ actionBusy === 'restart_gateway' ? '恢复中…' : '重建 API Gateway' }}
                </button>
                <button class="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50" :disabled="Boolean(actionBusy)" @click="recover('restart_runtimes')">
                  {{ actionBusy === 'restart_runtimes' ? '恢复中…' : '重建全部 Runtime' }}
                </button>
                <button class="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800" :disabled="loading" @click="refreshStatus()">刷新状态</button>
              </div>
            </div>
          </template>

          <p v-if="error" class="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{{ error }}</p>

          <div class="flex items-center justify-between border-t border-zinc-800 pt-4">
            <span class="text-xs text-zinc-600">Gateway 正常时可使用完整管理员控制台</span>
            <button class="text-sm text-indigo-300 hover:text-indigo-200" @click="openAdmin">管理员登录 →</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
