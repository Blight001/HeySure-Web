<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { probeModelConfig } from '@/api/diagnostics'
import { useUiEffects } from '@/composables/useUiEffects'
import { usePopupZIndex } from '@/composables/usePopupZIndex'
import type { ModelPreset } from '@/types'

interface Props {
  show: boolean
  globalMcpCallMethod: string
  mcpNamespaceHints: string
  mcpDynamicRule: string
  globalMcpFormatErrorHint: string
  defaultStartTaskPrompt: string
  defaultResumeTaskPrompt: string
  defaultSupervisionPrompt: string
  defaultSupervisionIdleSeconds: number
  defaultCompressionPrompt: string
  promptAiMessageNotify: string
  promptAiMessageInquiry: string
  aiMessageInquiryReminderSeconds: number
  promptAiMessageInquiryReminder: string
  promptAiMessageReply: string
  promptAiMessageChitchat: string
  promptAiMessageReplySuccess: string
  promptUserMessageNotice: string
  themeMode: 'light' | 'dark'
  fontSize: 'sm' | 'md' | 'lg'
  tavilyApiKey: string
  modelPresets: ModelPreset[]
  mcpMaxSteps: number
  mcpHistoryResultMaxChars: number
  conversationAutoCompressEnabled: boolean
}

const props = defineProps<Props>()

const { effects, setParticles, setMouseGlow } = useUiEffects()
const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'update:globalMcpCallMethod', value: string): void
  (e: 'update:mcpNamespaceHints', value: string): void
  (e: 'update:mcpDynamicRule', value: string): void
  (e: 'update:globalMcpFormatErrorHint', value: string): void
  (e: 'update:defaultStartTaskPrompt', value: string): void
  (e: 'update:defaultResumeTaskPrompt', value: string): void
  (e: 'update:defaultSupervisionPrompt', value: string): void
  (e: 'update:defaultSupervisionIdleSeconds', value: number): void
  (e: 'update:defaultCompressionPrompt', value: string): void
  (e: 'update:promptAiMessageNotify', value: string): void
  (e: 'update:promptAiMessageInquiry', value: string): void
  (e: 'update:aiMessageInquiryReminderSeconds', value: number): void
  (e: 'update:promptAiMessageInquiryReminder', value: string): void
  (e: 'update:promptAiMessageReply', value: string): void
  (e: 'update:promptAiMessageChitchat', value: string): void
  (e: 'update:promptAiMessageReplySuccess', value: string): void
  (e: 'update:promptUserMessageNotice', value: string): void
  (e: 'update:themeMode', value: 'light' | 'dark'): void
  (e: 'update:fontSize', value: 'sm' | 'md' | 'lg'): void
  (e: 'update:tavilyApiKey', value: string): void
  (e: 'update:modelPresets', value: ModelPreset[]): void
  (e: 'update:mcpMaxSteps', value: number): void
  (e: 'update:mcpHistoryResultMaxChars', value: number): void
  (e: 'update:conversationAutoCompressEnabled', value: boolean): void
  (e: 'save'): void
}>()

const themeModeValue = computed({
  get: () => props.themeMode,
  set: value => emit('update:themeMode', value)
})

const fontSizeValue = computed({
  get: () => props.fontSize,
  set: value => emit('update:fontSize', value)
})

const tavilyApiKeyValue = computed({
  get: () => props.tavilyApiKey,
  set: value => emit('update:tavilyApiKey', value)
})

const modelPresetsValue = computed({
  get: () => props.modelPresets || [],
  set: value => emit('update:modelPresets', value)
})

const selectedModelPresetIndex = ref(0)
const isModelPresetComplete = (preset: ModelPreset) => {
  return !!String(preset.name || '').trim()
    && !!String(preset.model || '').trim()
    && !!String(preset.api_key || '').trim()
    && !!String(preset.base_url || '').trim()
}
const selectedModelPreset = computed(() => modelPresetsValue.value[selectedModelPresetIndex.value] || null)
type ModelTestStatus = 'idle' | 'testing' | 'success' | 'error'
const modelTestStatus = ref<ModelTestStatus>('idle')
const modelTestMessage = ref('')

const resetModelTest = () => {
  modelTestStatus.value = 'idle'
  modelTestMessage.value = ''
}

const testSelectedModel = async () => {
  const preset = selectedModelPreset.value
  if (!preset) return
  if (!isModelPresetComplete(preset)) {
    modelTestStatus.value = 'error'
    modelTestMessage.value = '请先填写显示名称、模型名、Base URL 和 API Key'
    return
  }
  modelTestStatus.value = 'testing'
  modelTestMessage.value = '正在请求模型…'
  try {
    const result = await probeModelConfig({
      name: String(preset.name || preset.model).trim(),
      model: String(preset.model).trim(),
      base_url: String(preset.base_url).trim(),
      api_key: String(preset.api_key).trim(),
      provider: preset.provider || 'auto',
    })
    const latency = result.latency_ms == null ? '' : ` · ${result.latency_ms} ms`
    const detail = result.reply || result.detail || (result.ok ? '响应正常' : '测试失败')
    modelTestStatus.value = result.ok ? 'success' : 'error'
    modelTestMessage.value = `${result.ok ? '连接成功' : '连接失败'}${latency} · ${detail}`
  } catch (err: any) {
    modelTestStatus.value = 'error'
    modelTestMessage.value = `测试失败：${err?.message || '未知错误'}`
  }
}

const addModelPreset = () => {
  const id = `model_${Date.now()}`
  const nextIndex = modelPresetsValue.value.length
  modelPresetsValue.value = [
    ...modelPresetsValue.value,
    { id, name: '新模型', api_key: '', base_url: '', model: '' },
  ]
  selectedModelPresetIndex.value = nextIndex
}

const updateModelPreset = (index: number, patch: Partial<ModelPreset>) => {
  if (index === selectedModelPresetIndex.value) resetModelTest()
  modelPresetsValue.value = modelPresetsValue.value.map((item, idx) => {
    if (idx !== index) return item
    const next = { ...item, ...patch }
    if (!next.id) next.id = next.model || `model_${index + 1}`
    return next
  })
}

const removeModelPreset = (index: number) => {
  resetModelTest()
  modelPresetsValue.value = modelPresetsValue.value.filter((_, idx) => idx !== index)
  selectedModelPresetIndex.value = Math.max(0, Math.min(index, modelPresetsValue.value.length - 1))
}

const mcpMaxStepsValue = computed({
  get: () => Number(props.mcpMaxSteps || 48),
  set: value => emit('update:mcpMaxSteps', Math.max(1, Math.min(999, Math.floor(Number(value) || 48))))
})

const mcpHistoryResultMaxCharsValue = computed({
  get: () => Number(props.mcpHistoryResultMaxChars || 8000),
  set: value => emit('update:mcpHistoryResultMaxChars', Math.max(20, Math.min(10000, Math.floor(Number(value) || 8000))))
})

const conversationAutoCompressEnabledValue = computed({
  get: () => props.conversationAutoCompressEnabled,
  set: value => emit('update:conversationAutoCompressEnabled', value)
})

type SettingsCategory = 'model_chat' | 'page' | 'device_test'
const activeSettingsCategory = ref<SettingsCategory>('model_chat')
const settingsCategories: Array<{ key: SettingsCategory; label: string }> = [
  { key: 'model_chat', label: '模型与对话' },
  { key: 'page', label: '页面设置' },
  { key: 'device_test', label: '设备端测试' },
]

// 系统设置弹窗自动置顶。
const mainZIndex = usePopupZIndex(() => props.show)

watch(() => props.show, visible => {
  if (!visible) {
    activeSettingsCategory.value = 'model_chat'
    selectedModelPresetIndex.value = 0
  }
})

watch(selectedModelPresetIndex, resetModelTest)

const openExtensionTestPage = () => {
  window.open(`${window.location.origin}/extension-test/`, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <Transition name="fade">
    <div v-if="show" :style="{ zIndex: mainZIndex }" class="fixed inset-0 modal-overlay flex items-center justify-center p-4" @click="emit('update:show', false)">
      <div class="acrylic-modal rounded-2xl shadow-xl w-full max-w-[760px] max-h-[92vh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-5 md:p-6 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800" @click.stop>
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <AppIcon name="gear" class="w-5 h-5" /> 系统全能设置
          </h3>
          <button @click="emit('update:show', false)" class="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="mb-5 grid grid-cols-3 gap-1 rounded-xl border border-zinc-200 bg-zinc-100/70 p-1 dark:border-zinc-700 dark:bg-zinc-800/70">
          <button
            v-for="category in settingsCategories"
            :key="category.key"
            type="button"
            class="rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
            :class="activeSettingsCategory === category.key
              ? 'bg-white text-indigo-600 shadow-sm dark:bg-zinc-700 dark:text-indigo-300'
              : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100'"
            @click="activeSettingsCategory = category.key"
          >
            {{ category.label }}
          </button>
        </div>

        <div class="flex flex-col gap-6">
          <div v-show="activeSettingsCategory === 'page'" class="p-4 bg-zinc-50/60 rounded-xl dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
            <h4 class="text-sm font-semibold text-zinc-800 mb-3 dark:text-zinc-100 flex items-center gap-2"><AppIcon name="palette" class="w-4 h-4" /> 界面偏好</h4>
            <div class="grid grid-cols-2 gap-6">
              <div>
                <div class="text-xs text-zinc-500 mb-2 dark:text-zinc-400">主题模式</div>
                <div class="flex gap-2">
                  <button v-for="mode in (['light', 'dark'] as const)" :key="mode" @click="themeModeValue = mode" class="flex-1 px-3 py-1.5 rounded-lg border text-xs transition-all" :class="themeModeValue === mode ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-400'">
                    <span class="inline-flex items-center justify-center gap-1.5"><AppIcon :name="mode === 'light' ? 'sun' : 'moon'" class="w-3.5 h-3.5" />{{ mode === 'light' ? '亮色' : '暗色' }}</span>
                  </button>
                </div>
              </div>
              <div>
                <div class="text-xs text-zinc-500 mb-2 dark:text-zinc-400">文字大小</div>
                <div class="flex gap-1">
                  <button v-for="size in (['sm', 'md', 'lg'] as const)" :key="size" @click="fontSizeValue = size" class="flex-1 px-2 py-1.5 rounded-lg border text-xs transition-all" :class="fontSizeValue === size ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-400'">
                    {{ size === 'sm' ? '小' : size === 'md' ? '中' : '大' }}
                  </button>
                </div>
              </div>
            </div>
            <div class="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-700">
              <div class="text-xs text-zinc-500 mb-2 dark:text-zinc-400">动态效果</div>
              <div class="grid grid-cols-2 gap-2">
                <button
                  @click="setParticles(!effects.particles)"
                  class="px-3 py-2 rounded-lg border text-xs transition-all flex items-center justify-between gap-2"
                  :class="effects.particles ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-400'"
                >
                  <span class="inline-flex items-center gap-1.5"><AppIcon name="sparkles" class="w-3.5 h-3.5" />背景粒子</span>
                  <span class="text-[10px] font-semibold">{{ effects.particles ? '开' : '关' }}</span>
                </button>
                <button
                  @click="setMouseGlow(!effects.mouseGlow)"
                  class="px-3 py-2 rounded-lg border text-xs transition-all flex items-center justify-between gap-2"
                  :class="effects.mouseGlow ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-400'"
                >
                  <span class="inline-flex items-center gap-1.5"><AppIcon name="compass" class="w-3.5 h-3.5" />鼠标互动</span>
                  <span class="text-[10px] font-semibold">{{ effects.mouseGlow ? '开' : '关' }}</span>
                </button>
              </div>
              <p class="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">背景粒子星座与鼠标跟随光晕 / 粒子联动，全站即时生效。</p>
            </div>
          </div>

          <div v-show="activeSettingsCategory === 'model_chat'" class="p-4 bg-zinc-50/60 rounded-xl dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
            <h4 class="text-sm font-semibold text-zinc-800 mb-3 dark:text-zinc-100 flex items-center gap-2">对话与其它 MCP 设置</h4>
            <div class="space-y-3">
              <label class="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700">
                <span>
                  <span class="block text-xs font-medium text-zinc-700 dark:text-zinc-200">达到 Token 阈值后自动摘要压缩</span>
                  <span class="block mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">关闭后不再自动压缩较早对话；AI 主动请求压缩仍可执行。</span>
                </span>
                <input v-model="conversationAutoCompressEnabledValue" type="checkbox" class="h-4 w-4 shrink-0 accent-indigo-600" />
              </label>
              <div>
                <div class="text-xs text-zinc-500 mb-1 dark:text-zinc-400">Tavily API Key（联网搜索 MCP）</div>
                <input
                  v-model="tavilyApiKeyValue"
                  type="password"
                  autocomplete="off"
                  class="w-full px-3 py-2 rounded-xl acrylic-input focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:text-zinc-100 transition-all text-xs"
                  placeholder="tvly-..."
                />
                <p class="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">供 <code>workspace.search</code> 调用 Tavily 搜索；仍需在 MCP 权限中为对应 AI 勾选该工具。</p>
              </div>
              <div>
              <div class="text-xs text-zinc-500 mb-1 dark:text-zinc-400">单次运行最多步骤 / MCP 续跑次数</div>
              <input
                v-model.number="mcpMaxStepsValue"
                type="number"
                min="1"
                max="999"
                class="w-full px-3 py-2 rounded-xl acrylic-input focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:text-zinc-100 transition-all text-xs"
              />
              <p class="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">范围 1-999。连续调用 MCP 工具时，每次模型生成和工具返回后的继续执行都会消耗一步。</p>
              </div>
              <div>
                <div class="text-xs font-medium text-zinc-700 mb-1 dark:text-zinc-200">超大历史返回保护（每条最多字符）</div>
                <input
                  v-model.number="mcpHistoryResultMaxCharsValue"
                  type="number"
                  min="20"
                  max="10000"
                  class="w-full px-3 py-2 rounded-xl acrylic-input focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:text-zinc-100 transition-all text-xs"
                />
                <p class="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">范围 20-10000，默认 8000。新一轮始终携带工具名和完整参数；普通工具返回跨轮完整保留，仅当单条历史返回超过此上限才会被缩短，防止超大返回撑爆上下文。数据库和聊天界面的原始 MCP 记录不会被截断。</p>
              </div>
            </div>
          </div>

          <div v-show="activeSettingsCategory === 'device_test'" class="p-4 bg-zinc-50/60 rounded-xl dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
            <h4 class="text-sm font-semibold text-zinc-800 mb-3 dark:text-zinc-100 flex items-center gap-2">
              <AppIcon name="globe" class="w-4 h-4" /> 浏览器插件
            </h4>
            <button
              type="button"
              class="settings-entry"
              @click="openExtensionTestPage"
            >
              <span>
                <span class="settings-entry-title">打开插件测试页</span>
                <span class="settings-entry-desc">在新标签页打开静态测试页，覆盖 observe / 点击 / 输入 / 滚动 / 拖拽 / 等待 / 提取等 MCP 场景</span>
              </span>
              <span class="settings-entry-arrow">↗</span>
            </button>
          </div>

          <div v-show="activeSettingsCategory === 'model_chat'" class="order-first rounded-xl border border-zinc-100 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-800/50">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div>
                <h4 class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">服务器模型</h4>
                <p class="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">已配置 {{ modelPresetsValue.length }} 个模型，可在这里直接查看和编辑 API 配置。</p>
              </div>
              <button type="button" class="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500" @click="addModelPreset">
                + 添加模型
              </button>
            </div>

            <div v-if="modelPresetsValue.length" class="flex min-h-[430px] flex-col gap-4 md:flex-row">
              <aside class="flex shrink-0 flex-col rounded-xl border border-zinc-200 bg-white/70 p-2 dark:border-zinc-700 dark:bg-zinc-950/40 md:w-52">
                <div class="mb-2 flex items-center justify-between px-1">
                  <span class="text-xs font-semibold text-zinc-700 dark:text-zinc-200">模型栏目</span>
                  <span class="text-[10px] text-zinc-400">{{ modelPresetsValue.length }}</span>
                </div>
                <div class="max-h-48 flex-1 space-y-1 overflow-y-auto md:max-h-none">
                  <button
                    v-for="(preset, index) in modelPresetsValue"
                    :key="preset.id || index"
                    type="button"
                    class="w-full rounded-lg border px-2.5 py-2 text-left transition-colors"
                    :class="selectedModelPresetIndex === index
                      ? 'border-indigo-300 bg-white shadow-sm dark:border-indigo-500/50 dark:bg-zinc-800'
                      : 'border-transparent hover:border-zinc-200 hover:bg-white/70 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/70'"
                    @click="selectedModelPresetIndex = index"
                  >
                    <span class="block truncate text-xs font-semibold text-zinc-800 dark:text-zinc-100">{{ preset.name || preset.model || '未命名模型' }}</span>
                    <span class="mt-0.5 flex items-center gap-1 text-[10px]" :class="isModelPresetComplete(preset) ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-300'">
                      <span class="h-1.5 w-1.5 rounded-full" :class="isModelPresetComplete(preset) ? 'bg-emerald-500' : 'bg-amber-500'"></span>
                      {{ isModelPresetComplete(preset) ? '配置完整' : '待完善' }}
                    </span>
                  </button>
                </div>
              </aside>

              <div v-if="selectedModelPreset" class="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white/70 p-4 dark:border-zinc-700 dark:bg-zinc-950/40">
                <div class="mb-4 flex items-start justify-between gap-3 border-b border-zinc-100 pb-3 dark:border-zinc-800">
                  <div class="min-w-0">
                    <h4 class="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">{{ selectedModelPreset.name || selectedModelPreset.model || '新模型' }}</h4>
                    <p class="mt-0.5 text-[10px] text-zinc-400">填写后可在 AI 卡片设置中直接选择</p>
                  </div>
                  <button type="button" class="shrink-0 rounded-lg border border-rose-200 px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10" @click="removeModelPreset(selectedModelPresetIndex)">删除</button>
                </div>

                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label class="block">
                    <span class="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">显示名称</span>
                    <input :value="selectedModelPreset.name" @input="updateModelPreset(selectedModelPresetIndex, { name: ($event.target as HTMLInputElement).value })" class="w-full rounded-xl px-3 py-2 text-xs acrylic-input dark:text-zinc-100" placeholder="例如：主力模型" />
                  </label>
                  <label class="block">
                    <span class="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">模型名</span>
                    <input :value="selectedModelPreset.model" @input="updateModelPreset(selectedModelPresetIndex, { model: ($event.target as HTMLInputElement).value, id: selectedModelPreset.id || ($event.target as HTMLInputElement).value })" class="w-full rounded-xl px-3 py-2 text-xs acrylic-input dark:text-zinc-100" placeholder="例如：gpt-5" />
                  </label>
                  <label class="block md:col-span-2">
                    <span class="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Base URL</span>
                    <input :value="selectedModelPreset.base_url" @input="updateModelPreset(selectedModelPresetIndex, { base_url: ($event.target as HTMLInputElement).value })" class="w-full rounded-xl px-3 py-2 text-xs acrylic-input dark:text-zinc-100" placeholder="https://.../v1" />
                  </label>
                  <label class="block md:col-span-2">
                    <span class="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">API Key</span>
                    <input :value="selectedModelPreset.api_key" type="password" autocomplete="off" @input="updateModelPreset(selectedModelPresetIndex, { api_key: ($event.target as HTMLInputElement).value })" class="w-full rounded-xl px-3 py-2 text-xs acrylic-input dark:text-zinc-100" placeholder="输入 API Key" />
                  </label>
                  <label class="block">
                    <span class="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">接口协议</span>
                    <select :value="selectedModelPreset.provider || 'auto'" @change="updateModelPreset(selectedModelPresetIndex, { provider: ($event.target as HTMLSelectElement).value as ModelPreset['provider'] })" class="w-full rounded-xl px-3 py-2 text-xs acrylic-input dark:text-zinc-100">
                      <option value="auto">自动识别</option>
                      <option value="openai">OpenAI 兼容</option>
                      <option value="anthropic">Anthropic</option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">工具调用协议</span>
                    <select :value="selectedModelPreset.tool_protocol || 'auto'" @change="updateModelPreset(selectedModelPresetIndex, { tool_protocol: ($event.target as HTMLSelectElement).value as ModelPreset['tool_protocol'] })" class="w-full rounded-xl px-3 py-2 text-xs acrylic-input dark:text-zinc-100">
                      <option value="auto">自动</option>
                      <option value="native">原生 Function Calling</option>
                      <option value="text">文本 MCP Call</option>
                    </select>
                  </label>
                </div>

                <div class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p
                    v-if="modelTestStatus !== 'idle'"
                    role="status"
                    aria-live="polite"
                    class="min-w-0 text-[11px]"
                    :class="modelTestStatus === 'success'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : modelTestStatus === 'error'
                        ? 'text-rose-600 dark:text-rose-300'
                        : 'text-zinc-500 dark:text-zinc-400'"
                  >
                    {{ modelTestMessage }}
                  </p>
                  <span v-else></span>
                  <div class="flex shrink-0 justify-end gap-2">
                    <button
                      type="button"
                      :disabled="modelTestStatus === 'testing'"
                      class="rounded-lg border border-indigo-200 px-4 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 disabled:cursor-wait disabled:opacity-60 dark:border-indigo-500/40 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                      @click="testSelectedModel"
                    >
                      {{ modelTestStatus === 'testing' ? '测试中…' : '测试连接' }}
                    </button>
                    <button type="button" class="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:opacity-90 dark:bg-white dark:text-zinc-900" @click="emit('save')">保存模型配置</button>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 text-center dark:border-zinc-700">
              <div class="text-sm font-semibold text-zinc-600 dark:text-zinc-300">还没有服务器模型</div>
              <button type="button" class="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white" @click="addModelPreset">添加第一个模型</button>
            </div>
          </div>
        </div>

        <div class="mt-8 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
          <button @click="emit('save'); emit('update:show', false)" class="px-6 py-2 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 rounded-xl text-sm font-bold hover:opacity-90 active:scale-95 transition-all shadow-lg">完成</button>
        </div>
      </div>

    </div>
  </Transition>
</template>

<style scoped>
.settings-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border: 1px solid rgb(228 228 231);
  border-radius: 12px;
  background: rgb(250 250 250);
  text-align: left;
  transition: border-color 160ms ease, background-color 160ms ease, transform 160ms ease;
}

.settings-entry:hover {
  border-color: rgb(165 180 252);
  background: rgb(255 255 255);
  transform: translateY(-1px);
}

.dark .settings-entry {
  border-color: rgb(63 63 70);
  background: rgba(39, 39, 42, 0.5);
}

.dark .settings-entry:hover {
  border-color: rgba(129, 140, 248, 0.55);
  background: rgba(39, 39, 42, 0.85);
}

.settings-entry-title {
  display: block;
  color: rgb(39 39 42);
  font-size: 13px;
  font-weight: 700;
}

.dark .settings-entry-title {
  color: rgb(244 244 245);
}

.settings-entry-desc {
  display: block;
  margin-top: 4px;
  color: rgb(113 113 122);
  font-size: 11px;
}

.dark .settings-entry-desc {
  color: rgb(161 161 170);
}

.settings-entry-arrow {
  flex: 0 0 auto;
  color: rgb(113 113 122);
  font-size: 24px;
  line-height: 1;
}
</style>
