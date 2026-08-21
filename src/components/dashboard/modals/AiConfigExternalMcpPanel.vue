<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  createExternalMcpCredential,
  getExternalMcpSettings,
  revokeExternalMcpCredential,
  updateExternalMcpSettings,
} from '@/api/externalMcp'
import type { ExternalMcpCredential, ExternalMcpCredentialCreated, ExternalMcpSettings } from '@/api/externalMcp'
import { copyTextToClipboard } from '@/utils/clipboard'

const props = defineProps<{ editingConfigId: number; active: boolean }>()

const settings = ref<ExternalMcpSettings | null>(null)
const loading = ref(false)
const saving = ref(false)
const creating = ref(false)
const error = ref('')
const label = ref('Codex')
const expiresInDays = ref(90)
const created = ref<ExternalMcpCredentialCreated | null>(null)
const revokeTarget = ref<ExternalMcpCredential | null>(null)
const copiedKey = ref('')

const codexConfigText = computed(() => {
  const config = created.value?.codex_config
  return typeof config === 'string' ? config : config ? JSON.stringify(config, null, 2) : ''
})

const formatTime = (value: string | number | null | undefined) => {
  if (!value) return '—'
  const timestamp = typeof value === 'number' && value < 1e12 ? value * 1000 : value
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

const errorMessage = (reason: unknown, fallback: string) => reason instanceof Error ? reason.message : fallback
const credentialStateLabel = (credential: ExternalMcpCredential) => {
  if (credential.state === 'revoked' || credential.revoked_at) return '已吊销'
  if (credential.state === 'expired' || credential.active === false) return '已过期'
  return '有效'
}
const canRevoke = (credential: ExternalMcpCredential) => credentialStateLabel(credential) === '有效'

const loadSettings = async () => {
  if (!props.editingConfigId) return
  loading.value = true
  error.value = ''
  try {
    settings.value = await getExternalMcpSettings(props.editingConfigId)
  } catch (reason) {
    error.value = errorMessage(reason, '外部 MCP 配置加载失败')
  } finally {
    loading.value = false
  }
}

const toggleEnabled = async () => {
  if (!settings.value || saving.value) return
  const nextEnabled = !settings.value.enabled
  saving.value = true
  error.value = ''
  try {
    await updateExternalMcpSettings(props.editingConfigId, nextEnabled)
    await loadSettings()
  } catch (reason) {
    error.value = errorMessage(reason, '开放状态更新失败')
  } finally {
    saving.value = false
  }
}

const createCredential = async () => {
  if (creating.value || !label.value.trim()) return
  creating.value = true
  error.value = ''
  try {
    created.value = await createExternalMcpCredential(props.editingConfigId, {
      label: label.value.trim(),
      expires_in_days: expiresInDays.value,
    })
    await loadSettings()
  } catch (reason) {
    error.value = errorMessage(reason, '访问凭证生成失败')
  } finally {
    creating.value = false
  }
}

const confirmRevoke = async () => {
  if (!revokeTarget.value) return
  saving.value = true
  error.value = ''
  try {
    await revokeExternalMcpCredential(props.editingConfigId, revokeTarget.value.id)
    revokeTarget.value = null
    await loadSettings()
  } catch (reason) {
    error.value = errorMessage(reason, '访问凭证吊销失败')
  } finally {
    saving.value = false
  }
}

const copyValue = async (key: string, value: string, event: MouseEvent) => {
  const ok = await copyTextToClipboard(value, event.currentTarget as Element)
  copiedKey.value = ok ? key : ''
  if (!ok) error.value = '复制失败，请手动选择并复制'
  window.setTimeout(() => { if (copiedKey.value === key) copiedKey.value = '' }, 1800)
}

const closeOneTimeSecret = () => { created.value = null }

watch(
  () => [props.active, props.editingConfigId] as const,
  ([active, configId]) => {
    if (active && configId) void loadSettings()
    if (!active) {
      created.value = null
      revokeTarget.value = null
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="space-y-4 text-xs text-zinc-600 dark:text-zinc-300">
    <div class="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-200">
      对外开放后，持有访问密钥的客户端可调用该成员当前被授权且可用的全部 MCP 工具。请只把密钥交给可信客户端。
    </div>

    <div v-if="loading && !settings" class="py-10 text-center text-zinc-400">正在加载外部 MCP 配置…</div>
    <div v-else-if="settings" class="space-y-4">
      <section class="rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
        <div class="flex items-center justify-between gap-4">
          <div>
            <div class="font-medium text-zinc-800 dark:text-zinc-100">对外开放 MCP</div>
            <div class="mt-1 text-[11px] text-zinc-500">当前可对外提供 {{ settings.tool_count }} 个工具</div>
          </div>
          <button
            type="button"
            role="switch"
            :aria-checked="settings.enabled"
            :disabled="saving"
            class="relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50"
            :class="settings.enabled ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-600'"
            @click="toggleEnabled"
          >
            <span class="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" :class="settings.enabled ? 'left-[22px]' : 'left-0.5'"></span>
          </button>
        </div>
        <div v-if="settings.enabled" class="mt-3 rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800/60">
          <div class="mb-1 text-[10px] uppercase tracking-wide text-zinc-400">MCP 地址</div>
          <div class="flex items-center gap-2">
            <code class="min-w-0 flex-1 break-all text-[11px] text-zinc-700 dark:text-zinc-200">{{ settings.endpoint }}</code>
            <button type="button" class="shrink-0 rounded border border-zinc-200 px-2 py-1 dark:border-zinc-700" @click="copyValue('endpoint', settings.endpoint, $event)">{{ copiedKey === 'endpoint' ? '已复制' : '复制' }}</button>
          </div>
        </div>
      </section>

      <section class="rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
        <div class="font-medium text-zinc-800 dark:text-zinc-100">生成访问凭证</div>
        <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px_auto]">
          <input v-model="label" maxlength="80" placeholder="凭证名称，例如 Codex" class="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800" />
          <select v-model.number="expiresInDays" class="rounded-lg border border-zinc-200 px-2 py-2 dark:border-zinc-700 dark:bg-zinc-800">
            <option :value="7">7 天</option><option :value="30">30 天</option><option :value="90">90 天</option><option :value="365">365 天</option>
          </select>
          <button type="button" :disabled="creating || !label.trim()" class="rounded-lg bg-indigo-600 px-3 py-2 text-white disabled:opacity-50" @click="createCredential">{{ creating ? '生成中…' : '生成凭证' }}</button>
        </div>
        <p class="mt-2 text-[11px] text-zinc-500">密钥只在生成时显示一次；服务器不会再次返回明文。</p>
      </section>

      <section class="rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
        <div class="mb-2 font-medium text-zinc-800 dark:text-zinc-100">访问凭证（{{ settings.credentials.length }}）</div>
        <div v-if="!settings.credentials.length" class="rounded-lg bg-zinc-50 py-5 text-center text-zinc-400 dark:bg-zinc-800/40">尚未生成访问凭证</div>
        <div v-for="credential in settings.credentials" :key="credential.id" class="flex items-start justify-between gap-3 border-t border-zinc-100 py-2.5 first:border-t-0 dark:border-zinc-800">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="truncate font-medium text-zinc-700 dark:text-zinc-200">{{ credential.label }}</span>
              <span class="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] dark:bg-zinc-800">{{ credentialStateLabel(credential) }}</span>
              <code v-if="credential.token_prefix" class="text-[9px] text-zinc-400">{{ credential.token_prefix }}…</code>
            </div>
            <div class="mt-1 text-[10px] text-zinc-400">创建 {{ formatTime(credential.created_at) }} · 到期 {{ formatTime(credential.expires_at) }}</div>
            <div class="mt-0.5 text-[10px] text-zinc-400">最近使用 {{ formatTime(credential.last_used_at) }}</div>
          </div>
          <button v-if="canRevoke(credential)" type="button" class="shrink-0 rounded border border-red-200 px-2 py-1 text-red-600 dark:border-red-500/30 dark:text-red-300" @click="revokeTarget = credential">吊销</button>
        </div>
      </section>
    </div>

    <div v-if="error" class="rounded-lg border border-red-200 bg-red-50 p-2 text-red-600 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-300">{{ error }}</div>

    <div v-if="revokeTarget" class="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-200">
      <div>确认吊销“{{ revokeTarget.label }}”？使用该密钥的客户端会立即失去访问权限。</div>
      <div class="mt-3 flex justify-end gap-2">
        <button type="button" class="rounded border border-red-200 px-3 py-1.5 dark:border-red-500/30" @click="revokeTarget = null">取消</button>
        <button type="button" :disabled="saving" class="rounded bg-red-600 px-3 py-1.5 text-white disabled:opacity-50" @click="confirmRevoke">确认吊销</button>
      </div>
    </div>

    <div v-if="created" class="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-900/20 dark:text-emerald-100">
      <div class="font-medium">访问密钥已生成，请立即保存</div>
      <p class="mt-1 text-[11px]">关闭此提示后无法再次查看。请勿把密钥粘贴到聊天或日志中。</p>
      <code class="mt-3 block max-h-24 overflow-auto break-all rounded bg-white/80 p-2 text-[11px] text-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100">{{ created.token }}</code>
      <div class="mt-2 flex flex-wrap gap-2">
        <button type="button" class="rounded border border-emerald-300 px-2 py-1 dark:border-emerald-500/40" @click="copyValue('token', created.token, $event)">{{ copiedKey === 'token' ? '密钥已复制' : '复制密钥' }}</button>
        <button type="button" class="rounded border border-emerald-300 px-2 py-1 dark:border-emerald-500/40" @click="copyValue('created-endpoint', created.endpoint, $event)">{{ copiedKey === 'created-endpoint' ? '地址已复制' : '复制 MCP 地址' }}</button>
        <button v-if="codexConfigText" type="button" class="rounded border border-emerald-300 px-2 py-1 dark:border-emerald-500/40" @click="copyValue('codex', codexConfigText, $event)">{{ copiedKey === 'codex' ? '配置已复制' : '复制 Codex 配置' }}</button>
        <button type="button" class="rounded bg-emerald-700 px-2 py-1 text-white" @click="closeOneTimeSecret">我已保存，关闭</button>
      </div>
    </div>
  </div>
</template>
