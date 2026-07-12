<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { callMcpTool } from '@/api/mcp'
import { runInheritanceMcpTest, type InheritanceMcpTestResult } from '@/api/mcp'
import { me } from '@/api/auth'
import { getMcpToolZhLabel } from '@/utils/mcpTools'
import { usePopupZIndex } from '@/composables/usePopupZIndex'

const props = defineProps<{
  show: boolean
  toolName: string
  deviceId: string
  deviceType?: string
  description?: string
  inputSchema?: Record<string, any>
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update:show', value: boolean): void
}>()

const zIndex = usePopupZIndex(() => props.show)

const aiTestPresetLoading = ref(false)
const aiTestPresets = ref<Array<{id: string; name: string; model: string; base_url?: string}>>([])
const aiTestSelectedPresetId = ref('')
const aiTestUserHint = ref('')
const aiTestResult = ref<InheritanceMcpTestResult | null>(null)
const aiTestLoading = ref(false)
const aiTestError = ref('')
const aiTestNotice = ref('')

// direct
const directArgs = ref('{}')
const directResult = ref<any>(null)
const directLoading = ref(false)
const directError = ref('')

const selectedPreset = computed(() => aiTestPresets.value.find(p => p.id === aiTestSelectedPresetId.value))

const deviceLabel = computed(() => {
  const t = (props.deviceType || 'desktop').toLowerCase()
  const map: Record<string, string> = {
    desktop: '桌面设备',
    browser: '浏览器设备',
    android: '安卓设备',
    workshop: '图书馆',
    server: '服务端（系统内置）',
  }
  return map[t] || '设备'
})

const normalizePresets = (raw: any) => {
  let parsed = raw
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw || '[]') } catch { parsed = [] }
  }
  if (!Array.isArray(parsed)) return []
  return parsed
    .map((item: any) => {
      // CLI 预设走本机命令行，无法用于 HTTP 直连的 AI 测试，直接排除。
      if (String(item?.provider || 'api').trim().toLowerCase() === 'cli') return null
      const id = String(item?.id || item?.model || '').trim()
      const model = String(item?.model || '').trim()
      const apiKey = String(item?.api_key || '').trim()
      const baseUrl = String(item?.base_url || '').trim()
      if (!id || !model || !apiKey || !baseUrl) return null
      return { id, name: String(item?.name || model), model, base_url: baseUrl }
    })
    .filter(Boolean) as Array<{id: string; name: string; model: string; base_url?: string}>
}

const loadPresets = async () => {
  if (aiTestPresets.value.length) return
  aiTestPresetLoading.value = true
  try {
    const user = await me()
    aiTestPresets.value = normalizePresets((user as any).model_presets)
    if (aiTestPresets.value.length && !aiTestSelectedPresetId.value) {
      aiTestSelectedPresetId.value = aiTestPresets.value[0].id
    }
  } catch {
    aiTestError.value = '加载模型预设失败'
  } finally {
    aiTestPresetLoading.value = false
  }
}

const runAiTest = async () => {
  if (!props.toolName) return
  const presetId = aiTestSelectedPresetId.value
  if (!presetId) {
    aiTestError.value = '请先选择一个模型'
    return
  }
  aiTestLoading.value = true
  aiTestError.value = ''
  aiTestNotice.value = ''
  aiTestResult.value = null
  try {
    const desc = props.description || ''
    const schema = props.inputSchema || {}
    // simple parameters from schema if possible
    const properties = (schema as any)?.properties || {}
    const required = (schema as any)?.required || []
    const parameters = Object.keys(properties).map((name: string) => ({
      name,
      type: properties[name]?.type || 'string',
      required: required.includes(name),
      description: properties[name]?.description || '',
    }))

    const result = await runInheritanceMcpTest({
      model_preset_id: presetId,
      tool: props.toolName,
      device_id: props.deviceId,
      device_type: props.deviceType || 'desktop',
      description: desc,
      parameters,
      input_schema: schema,
      implementation: null,
      user_hint: aiTestUserHint.value.trim(),
    })
    aiTestResult.value = result
    if (result.ok) {
      aiTestNotice.value = result.detail || '测试完成'
      if (result.tool_call?.arguments) {
        try { directArgs.value = JSON.stringify(result.tool_call.arguments, null, 2) } catch {}
      }
    } else {
      aiTestError.value = result.detail || '测试未成功'
    }
  } catch (err: any) {
    aiTestError.value = err?.message || 'AI 自动测试失败'
  } finally {
    aiTestLoading.value = false
  }
}

const runDirect = async () => {
  if (!props.toolName) return
  directLoading.value = true
  directError.value = ''
  directResult.value = null
  try {
    let args: Record<string, unknown> = {}
    try { args = JSON.parse(directArgs.value || '{}') } catch (e: any) {
      directError.value = 'JSON 错误: ' + (e.message || '')
      return
    }
    const res = await callMcpTool({ tool: props.toolName, arguments: args })
    directResult.value = res
  } catch (err: any) {
    directError.value = err?.message || '直接调用失败'
  } finally {
    directLoading.value = false
  }
}

const close = () => {
  emit('close')
  emit('update:show', false)
  // reset
  aiTestUserHint.value = ''
  aiTestResult.value = null
  aiTestError.value = ''
  aiTestNotice.value = ''
  directArgs.value = '{}'
  directResult.value = null
  directError.value = ''
}

watch(() => props.show, (v) => {
  if (v) {
    loadPresets()
  } else {
    close()
  }
}, { immediate: true })
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="show"
        :style="{ zIndex }"
        class="fixed inset-0 flex items-center justify-center modal-overlay p-4"
        @click.self="close"
      >
        <div class="acrylic-modal rounded-xl border border-zinc-200 dark:border-zinc-700 w-full max-w-xl max-h-[88vh] flex flex-col overflow-hidden">
          <div class="flex items-center justify-between border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
            <div class="min-w-0">
              <div class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">测试当前 MCP</div>
              <div class="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                {{ getMcpToolZhLabel(toolName) }} · <code class="text-indigo-600 dark:text-indigo-300">{{ toolName }}</code>
              </div>
            </div>
            <button type="button" class="text-xl leading-none text-zinc-400 hover:text-zinc-600" @click="close">×</button>
          </div>

          <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            <div class="rounded-lg border border-zinc-100 bg-zinc-50/60 px-3 py-2 text-[11px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-300">
              设备：{{ deviceLabel }}（{{ deviceId || '未提供' }}）
            </div>

            <div v-if="aiTestError" class="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
              {{ aiTestError }}
            </div>
            <div v-if="aiTestNotice" class="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
              {{ aiTestNotice }}
            </div>

            <label class="block">
              <span class="mb-1 block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">选择测试模型</span>
              <select
                v-model="aiTestSelectedPresetId"
                class="w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                :disabled="aiTestPresetLoading || aiTestLoading"
              >
                <option v-if="aiTestPresetLoading" value="">加载中…</option>
                <option v-else-if="!aiTestPresets.length" value="">暂无可用模型</option>
                <option v-for="preset in aiTestPresets" :key="preset.id" :value="preset.id">
                  {{ preset.name }}（{{ preset.model }}）
                </option>
              </select>
            </label>
            <div v-if="selectedPreset" class="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
              {{ selectedPreset.base_url }}
            </div>

            <label class="block">
              <span class="mb-1 block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">补充说明（可选）</span>
              <textarea
                v-model="aiTestUserHint"
                rows="3"
                spellcheck="false"
                class="w-full resize-y rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-2 text-xs leading-relaxed text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-200 dark:focus:ring-indigo-800"
                placeholder="例如：请用当前桌面路径做一次轻量测试"
              />
            </label>

            <div class="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              将把工具描述、参数说明与底层实现填入提示词，由所选模型主动构造参数并调用
              <code>{{ toolName }}</code>，随后在下方展示调用结果。
            </div>

            <!-- direct as in inheritance scheme -->
            <div class="rounded-lg border border-zinc-200 bg-white/50 p-3 dark:border-zinc-700 dark:bg-zinc-900/40">
              <div class="text-[10px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">直接参数测试（不走模型，直接调用）</div>
              <textarea
                v-model="directArgs"
                rows="2"
                spellcheck="false"
                class="w-full text-[10px] font-mono rounded border border-zinc-200 bg-white/70 px-2 py-1 dark:bg-zinc-950/60 dark:border-zinc-700"
                placeholder='{"param": "value"}'
              />
              <div class="mt-1 flex gap-2">
                <button
                  type="button"
                  class="text-[10px] px-2 py-0.5 rounded bg-zinc-700 text-white hover:bg-zinc-600 disabled:opacity-60"
                  :disabled="directLoading"
                  @click="runDirect"
                >
                  {{ directLoading ? '调用中…' : '直接调用 MCP' }}
                </button>
                <button type="button" class="text-[10px] px-2 py-0.5 border rounded" @click="directArgs = '{}'">重置</button>
              </div>
              <div v-if="directError" class="mt-1 text-[9px] text-rose-600">{{ directError }}</div>
              <div v-if="directResult != null" class="mt-1">
                <div class="text-[9px] text-zinc-500">直接调用结果：</div>
                <pre class="text-[9px] max-h-24 overflow-auto bg-white/60 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-700 p-1 rounded">{{ JSON.stringify(directResult, null, 2) }}</pre>
              </div>
            </div>

            <!-- AI results -->
            <div v-if="aiTestResult" class="space-y-3 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-800/40">
              <div v-if="aiTestResult.model_reply" class="space-y-1">
                <div class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">模型说明</div>
                <pre class="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-zinc-700 dark:text-zinc-200">{{ aiTestResult.model_reply }}</pre>
              </div>
              <div v-if="aiTestResult.tool_call" class="space-y-1">
                <div class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">模型生成的参数</div>
                <pre class="overflow-x-auto rounded border border-zinc-200 bg-white/75 p-2 font-mono text-[11px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-200">{{ JSON.stringify(aiTestResult.tool_call.arguments || aiTestResult.tool_call, null, 2) }}</pre>
              </div>
              <div v-if="aiTestResult.tool_result" class="space-y-1">
                <div class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">工具返回</div>
                <pre class="max-h-48 overflow-auto rounded border border-zinc-200 bg-white/75 p-2 font-mono text-[11px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-200">{{ JSON.stringify(aiTestResult.tool_result, null, 2) }}</pre>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2 border-t border-zinc-100 px-5 py-3 dark:border-zinc-800">
            <button
              type="button"
              class="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              :disabled="aiTestLoading"
              @click="close"
            >
              取消
            </button>
            <button
              type="button"
              class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="aiTestLoading || aiTestPresetLoading || !aiTestSelectedPresetId"
              @click="runAiTest"
            >
              {{ aiTestLoading ? '测试中…' : '开始测试' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
