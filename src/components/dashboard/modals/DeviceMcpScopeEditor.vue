<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getDeviceMcpScope, setDeviceMcpScope, type DeviceMcpScope } from '@/api/devices'
import { getMcpToolParamRows, getMcpToolZhLabel } from '@/utils/mcpTools'
import { useMcpScopeDraft } from '@/composables/useMcpScopeDraft'
import { usePopupZIndex } from '@/composables/usePopupZIndex'
import McpAiTestModal from './McpAiTestModal.vue'
import McpScopeToolTable from './McpScopeToolTable.vue'

const props = defineProps<{
  deviceId: string
  // Re-fetch whenever this changes (e.g. device:list refresh tick).
  refreshKey?: string | number
}>()

const scope = ref<DeviceMcpScope | null>(null)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const notice = ref('')
// Ignore stale scope loads that finish after a newer load or a save.
let loadRequestId = 0
const detailOpen = ref(false)
const detailZIndex = usePopupZIndex(detailOpen)
const capabilities = computed(() => scope.value?.capabilities || [])
const {
  selected,
  dirty,
  remoteUpdatePending,
  applyRemote,
  commit,
  beginEditing,
  endEditing,
  toggle,
  toggleAll: toggleSelectAll,
} = useMcpScopeDraft(capabilities)

// AI test modal trigger for details
const aiTestModalOpen = ref(false)
const aiTestModalToolName = ref('')
const aiTestModalDescription = ref('')
const aiTestModalInputSchema = ref<any>(null)

const load = async () => {
  if (!props.deviceId || saving.value) return
  const requestId = ++loadRequestId
  loading.value = true
  error.value = ''
  notice.value = ''
  try {
    const data = await getDeviceMcpScope(props.deviceId)
    if (requestId !== loadRequestId) return
    scope.value = data
    const caps = data.capabilities || []
    const allowedList = data.allowed || []
    applyRemote(data.hasRecord ? allowedList : caps)
  } catch (err: any) {
    if (requestId !== loadRequestId) return
    error.value = err?.message || 'Agent MCP 权限加载失败'
  } finally {
    if (requestId === loadRequestId) loading.value = false
  }
}

watch(() => [props.deviceId, props.refreshKey], load, { immediate: true })

// Scope is keyed per individual agent, so it can be configured even before the
// device is assigned an AI. Saving only needs a connected agent that reports
// tools.
const canSave = computed(() => capabilities.value.length > 0)

// 分类与扩展端 BROWSER_TOOL_CATEGORIES 保持一致。页面交互类已合并为 browser_action
// （点击/双击/右键/滚动/输入/按键），页面级导航（跳转 URL/前进后退/列出标签）并入
// browser_tab，状态管理类合并为 browser_cookie / browser_storage / browser_session /
// browser_profile（均带 action 参数）。下面同时兼容历史的按动词拆分旧名。
const browserIntro = (tool: string) => {
  if (['browser_tab', 'browser_navigate', 'browser_history'].includes(tool) || tool.startsWith('browser_history_') || tool.startsWith('browser_tab_')) {
    return '浏览器导航类工具，用于管理标签页、打开页面、跳转 URL、前进或后退。'
  }
  if (['browser_observe', 'browser_screenshot', 'browser_find_text', 'browser_performance', 'browser_network_log', 'browser_iframe_list'].includes(tool)) {
    return '浏览器观察类工具，用于观察可交互元素、截图、查看页面结构与状态。'
  }
  if (['browser_action', 'browser_click', 'browser_double_click', 'browser_right_click', 'browser_type', 'browser_press_key', 'browser_scroll', 'browser_wait', 'browser_drag'].includes(tool)) {
    return '浏览器交互类工具，用于点击、双击、右键、输入、滚动、按键与拖拽。'
  }
  if (['browser_evaluate', 'browser_extract', 'browser_clipboard_write', 'browser_file_upload', 'browser_download'].includes(tool)) {
    return '浏览器数据类工具，用于执行脚本、提取数据、读写剪贴板、上传或下载文件。'
  }
  if (['browser_cookie', 'browser_storage', 'browser_session', 'browser_profile'].includes(tool) || /^browser_(cookie|storage|session|profile)_/.test(tool)) {
    return '浏览器状态类工具，用于管理 Cookie、本地存储、会话快照与逻辑 profile。'
  }
  return '浏览器能力工具，用于当前页面或标签页相关的自动化操作。'
}

const basicToolIntro = (tool: string) => {
  const name = String(tool || '').trim()
  if (!name) return '未命名工具'
  if (name.startsWith('browser_')) return browserIntro(name)
  if (name.startsWith('desktop_')) return '桌面端工具，用于控制本机环境或桌面应用。'
  if (name.startsWith('fs_')) return '文件系统工具，用于查看、读取或写入工作区文件。'
  if (name.startsWith('shell_')) return '终端工具，用于执行命令行指令。'
  if (name.startsWith('git_')) return 'Git 工具，用于查看差异或处理版本库状态。'
  if (name.startsWith('keyboard_') || name.startsWith('mouse_')) return '键鼠输入工具，用于模拟键盘或鼠标操作。'
  if (name.startsWith('screen_')) return '屏幕工具，用于截屏或读取屏幕信息。'
  if (name.startsWith('clipboard_')) return '剪贴板工具，用于读取或写入系统剪贴板。'
  if (name.startsWith('window_')) return '窗口工具，用于列出、聚焦或关闭窗口。'
  if (name.startsWith('process_')) return '进程工具，用于列出或结束系统进程。'
  if (name.startsWith('touch.')) return '手机触控工具，用于点击、滑动、长按或返回/主屏/最近任务。'
  if (name.startsWith('screen.')) return '手机屏幕工具，用于截屏或录屏。'
  if (name === 'input.text') return '手机输入工具，用于向当前聚焦的输入框写入文本。'
  return '通用 MCP 工具。'
}

const toolDefinition = (tool: string) => scope.value?.toolDefs?.[tool] || {}

const toolDescription = (tool: string) => {
  return String(toolDefinition(tool).description || '').trim() || basicToolIntro(tool)
}

const toolParams = (tool: string) => getMcpToolParamRows({
  name: tool,
  description: toolDescription(tool),
  inputSchema: toolDefinition(tool).input_schema || {},
  destructive: !!toolDefinition(tool).destructive,
})

const toolListItems = computed(() => capabilities.value.map(tool => ({
  name: tool,
  label: label(tool),
  description: toolDescription(tool),
  params: toolParams(tool),
  destructive: !!toolDefinition(tool).destructive,
})))

const save = async () => {
  if (!props.deviceId || !canSave.value) return
  // Invalidate any earlier GET. A slow initial/refresh load must not overwrite
  // the authoritative PUT response and briefly show an incorrect 0 selection.
  ++loadRequestId
  loading.value = false
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    const data = await setDeviceMcpScope(props.deviceId, Array.from(selected.value))
    scope.value = data
    commit(data.allowed || [])
    notice.value = '已保存'
  } catch (err: any) {
    error.value = err?.message || 'Agent MCP 权限保存失败'
  } finally {
    saving.value = false
  }
}

const label = (tool: string) => getMcpToolZhLabel(tool)

const openDetail = () => {
  beginEditing()
  detailOpen.value = true
}

const closeDetail = () => {
  detailOpen.value = false
  aiTestModalOpen.value = false
  endEditing()
}

const startTestTool = (tool: string) => {
  aiTestModalToolName.value = tool
  const def = toolDefinition(tool)
  aiTestModalDescription.value = String(def.description || '').trim() || basicToolIntro(tool)
  aiTestModalInputSchema.value = def.input_schema || {}
  aiTestModalOpen.value = true
}


</script>

<template>
  <div class="flex">
    <button
      v-if="!loading && capabilities.length"
      type="button"
      class="flex-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
      @click="openDetail"
    >
      配置MCP权限范围 {{ selected.size }} / {{ capabilities.length }}
    </button>
    <div v-else-if="loading" class="text-[10px] text-zinc-400 text-center py-1">加载中…</div>
    <div v-else-if="error" class="text-[10px] text-rose-500">{{ error }}</div>
    <div v-else-if="capabilities.length === 0" class="text-[10px] text-zinc-400 text-center py-1">
      该设备未上报任何工具。
    </div>

    <div v-if="notice && !loading" class="mt-1.5 text-[10px] text-emerald-600 dark:text-emerald-300">{{ notice }}</div>

    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="detailOpen"
          :style="{ zIndex: detailZIndex }"
          class="fixed inset-0 modal-overlay flex items-center justify-center p-4"
          @click="closeDetail"
        >
          <div
            class="acrylic-modal rounded-xl border border-zinc-200 dark:border-zinc-700 w-full max-w-5xl max-h-[86vh] flex flex-col overflow-hidden"
            @click.stop
          >
            <div class="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3 dark:border-zinc-700">
              <div class="min-w-0">
                <div class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">设置 MCP 权限范围</div>
                <div class="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">
                  {{ scope?.agentName || deviceId }} · {{ capabilities.length }} 个工具 · 悬浮预览，点击固定详情
                </div>
              </div>
              <button
                type="button"
                class="rounded border border-zinc-200 px-2 py-1 text-[10px] text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                @click="closeDetail"
              >
                关闭
              </button>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto p-5">
              <McpScopeToolTable
                :tools="toolListItems"
                :selected="selected"
                @toggle="toggle"
                @toggle-all="toggleSelectAll"
                @test="startTestTool"
              />
            </div>

            <!-- Reusable AI test modal (matches inheritance skills display) -->
            <McpAiTestModal
              v-model:show="aiTestModalOpen"
              :tool-name="aiTestModalToolName"
              :device-id="deviceId"
              :device-type="scope?.deviceType ?? undefined"
              :description="aiTestModalDescription"
              :input-schema="aiTestModalInputSchema"
              @close="aiTestModalOpen = false"
            />

            <div class="border-t border-zinc-200 px-5 py-3 dark:border-zinc-700">
              <div v-if="remoteUpdatePending" class="mb-2 text-[10px] text-amber-600 dark:text-amber-300">
                设备状态已刷新，当前未保存的勾选已保留
              </div>
              <div class="flex items-center justify-end gap-2">
                <button
                  type="button"
                  :disabled="!canSave || saving || !dirty"
                  class="text-[10px] px-2 py-0.5 rounded bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-40"
                  @click="save"
                >
                  {{ saving ? '...' : '保存' }}
                </button>
              </div>
              <div v-if="notice" class="mt-2 text-[10px] text-emerald-600 dark:text-emerald-300">{{ notice }}</div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
