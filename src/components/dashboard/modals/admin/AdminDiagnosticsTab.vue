<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMessage } from '@/composables/useMessage'
import * as adminApi from '@/api/admin'
import type { DiagnosticGroup, ModelProbe } from '@/api/admin'
import { listMcpTools, callMcpTool } from '@/api/mcp'
import type { AdminMcpParamRow } from '@/types/admin'
import { buildMcpParamRows, sampleMcpValueForType } from '@/utils/adminFormat'

const { alert, confirm } = useMessage()

const selfTestGroups = ref<DiagnosticGroup[]>([])
const selfTestSummary = ref<{ total: number; passed: number; failed: number } | null>(null)
const selfTestBusy = ref(false)
const selfTestLoaded = ref(false)

const runSelfTest = async () => {
  selfTestBusy.value = true
  try {
    const res = await adminApi.runSelfTest()
    selfTestGroups.value = res.groups || []
    selfTestSummary.value = res.summary || null
    selfTestLoaded.value = true
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  } finally {
    selfTestBusy.value = false
  }
}

const llmPrompt = ref('回复一个字：好')
const llmBusy = ref(false)
const modelResults = ref<ModelProbe[]>([])
const modelsTested = ref(false)

const runModelTest = async () => {
  llmBusy.value = true
  modelsTested.value = false
  try {
    const res = await adminApi.runModelTests({ prompt: llmPrompt.value })
    modelResults.value = res.models || []
    modelsTested.value = true
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  } finally {
    llmBusy.value = false
  }
}

const mcpTools = ref<any[]>([])
const mcpToolsLoaded = ref(false)
const selectedMcpTool = ref('')
const mcpArgsText = ref('{}')
const mcpBusy = ref(false)
const mcpResult = ref<{ ok: boolean; text: string } | null>(null)

const loadMcpToolNames = async () => {
  try {
    const res = await listMcpTools()
    mcpTools.value = (res.tools || [])
      .filter((t: any) => String(t?.name || '').trim())
      .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)))
    mcpToolsLoaded.value = true
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  }
}

const selectedToolInfo = computed(() => mcpTools.value.find((t: any) => t.name === selectedMcpTool.value) || null)
const selectedToolParams = computed<AdminMcpParamRow[]>(() => buildMcpParamRows(selectedToolInfo.value?.inputSchema))

const fillMcpArgsTemplate = (requiredOnly = false) => {
  const rows = selectedToolParams.value
  const skeleton: Record<string, unknown> = {}
  for (const p of rows) {
    if (requiredOnly && !p.required) continue
    skeleton[p.name] = sampleMcpValueForType(p.type)
  }
  mcpArgsText.value = JSON.stringify(skeleton, null, 2)
}

watch(selectedMcpTool, (name) => {
  mcpResult.value = null
  if (!name) {
    mcpArgsText.value = '{}'
    return
  }
  fillMcpArgsTemplate(true)
})

const parseMcpArgs = async (): Promise<Record<string, unknown> | null> => {
  const raw = mcpArgsText.value.trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    await alert({ message: '参数必须是 JSON 对象，例如 {"query":"天气"}', type: 'warning' })
    return null
  } catch {
    await alert({ message: '参数不是合法的 JSON', type: 'warning' })
    return null
  }
}

const runMcpTest = async () => {
  if (!selectedMcpTool.value) {
    await alert({ message: '请先选择一个 MCP 工具', type: 'warning' })
    return
  }
  const args = await parseMcpArgs()
  if (args === null) return
  mcpBusy.value = true
  mcpResult.value = null
  try {
    const res = await callMcpTool({ tool: selectedMcpTool.value, arguments: args })
    mcpResult.value = { ok: true, text: JSON.stringify(res, null, 2) }
  } catch (err) {
    mcpResult.value = { ok: false, text: (err as Error).message }
  } finally {
    mcpBusy.value = false
  }
}

const reseedBusy = ref(false)
const runReseedMcpDocs = async () => {
  const yes = await confirm({
    message: '将用系统内置（中文）说明覆盖重写当前用户的 MCP 工具说明文件，会覆盖对这些说明做过的手动修改。确定继续？',
    type: 'warning',
  })
  if (!yes) return
  reseedBusy.value = true
  try {
    const res = await adminApi.reseedMcpDocs()
    await alert({ message: res.detail || `已重新生成 ${res.regenerated} 个工具说明`, type: res.ok ? 'success' : 'warning' })
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  } finally {
    reseedBusy.value = false
  }
}

defineExpose({
  onSwitch: () => {
    if (!selfTestLoaded.value) void runSelfTest()
    if (!mcpToolsLoaded.value) void loadMcpToolNames()
  },
})
</script>

<template>
  <div class="flex-1 overflow-y-auto p-3 sm:p-5 space-y-5">
    <section class="border border-zinc-200 rounded-xl p-4 dark:border-zinc-800">
      <div class="flex items-center justify-between mb-3">
        <div>
          <div class="text-sm font-bold text-zinc-700 dark:text-zinc-200 flex items-center gap-2">
            一键自检
            <span v-if="selfTestSummary" class="text-xs font-normal" :class="selfTestSummary.failed ? 'text-red-500' : 'text-emerald-600'">
              {{ selfTestSummary.passed }}/{{ selfTestSummary.total }} 通过<span v-if="selfTestSummary.failed">，{{ selfTestSummary.failed }} 项异常</span>
            </span>
          </div>
          <div class="text-xs text-zinc-400 mt-0.5">逐项检查进程、数据库、MCP 与文件存储。</div>
        </div>
        <button
          class="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
          :disabled="selfTestBusy"
          @click="runSelfTest"
        >{{ selfTestBusy ? '检查中…' : '重新自检' }}</button>
      </div>
      <div v-if="!selfTestGroups.length && !selfTestBusy" class="text-xs text-zinc-400">尚未运行自检。</div>
      <div class="space-y-3">
        <div v-for="g in selfTestGroups" :key="g.module">
          <div class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">{{ g.label }}</div>
          <ul class="space-y-1.5">
            <li
              v-for="c in g.checks"
              :key="c.id"
              class="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-zinc-50/60 dark:bg-zinc-800/50"
            >
              <span class="flex items-center gap-2 min-w-0">
                <span
                  class="w-2 h-2 rounded-full shrink-0"
                  :class="c.skipped ? 'bg-zinc-300 dark:bg-zinc-600' : (c.ok ? 'bg-emerald-500' : 'bg-red-500')"
                ></span>
                <span class="text-sm text-zinc-700 dark:text-zinc-200 shrink-0">{{ c.label }}</span>
                <span class="text-xs truncate" :class="c.skipped ? 'text-zinc-400' : (c.ok ? 'text-zinc-400' : 'text-red-500')">
                  {{ c.skipped ? '已跳过' : '' }}{{ c.detail }}
                </span>
              </span>
              <span v-if="c.latency_ms != null && !c.skipped" class="text-xs text-zinc-400 whitespace-nowrap">{{ c.latency_ms }} ms</span>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <section class="border border-zinc-200 rounded-xl p-4 dark:border-zinc-800">
      <div class="text-sm font-bold text-zinc-700 dark:text-zinc-200 mb-1">模型（LLM）连通性</div>
      <div class="text-xs text-zinc-400 mb-3">对主脑模型与每个已配置的模型 Preset 各发一次极小补全请求，逐个确认可用。</div>
      <div class="flex gap-2">
        <input
          v-model="llmPrompt"
          class="flex-1 border border-zinc-200 rounded-lg px-3 py-2 text-sm dark:bg-zinc-800/60 dark:border-zinc-700"
          placeholder="测试提示词"
        />
        <button
          class="px-3 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
          :disabled="llmBusy"
          @click="runModelTest"
        >{{ llmBusy ? '测试中…' : '测试全部模型' }}</button>
      </div>
      <div v-if="modelsTested && !modelResults.length" class="mt-3 text-xs text-zinc-400">未发现已配置的模型。</div>
      <ul class="mt-3 space-y-2">
        <li
          v-for="(m, i) in modelResults"
          :key="m.model + '_' + i"
          class="text-xs rounded-lg p-3"
          :class="m.ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'"
        >
          <div class="font-medium flex items-center justify-between gap-2">
            <span>{{ m.name }}<span v-if="m.model && m.model !== m.name" class="text-zinc-400"> · {{ m.model }}</span></span>
            <span class="whitespace-nowrap">{{ m.ok ? '连通' : '失败' }}<span v-if="m.latency_ms != null"> · {{ m.latency_ms }} ms</span></span>
          </div>
          <div v-if="m.reply" class="mt-1 text-zinc-600 dark:text-zinc-300">回复：{{ m.reply }}</div>
          <div v-if="m.detail && !m.ok" class="mt-1 whitespace-pre-wrap">{{ m.detail }}</div>
        </li>
      </ul>
    </section>

    <section class="border border-zinc-200 rounded-xl p-4 dark:border-zinc-800">
      <div class="flex items-center justify-between gap-2 mb-1">
        <div class="text-sm font-bold text-zinc-700 dark:text-zinc-200">MCP 工具测试</div>
        <button
          class="px-2.5 py-1 text-xs rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 whitespace-nowrap"
          :disabled="reseedBusy"
          title="用系统内置中文说明覆盖重写本用户的 MCP 工具说明文件"
          @click="runReseedMcpDocs"
        >{{ reseedBusy ? '生成中…' : '重新生成中文说明' }}</button>
      </div>
      <div class="text-xs text-zinc-400 mb-3">选择一个工具、填入 JSON 参数并执行，直接查看返回结果（使用与 AI 相同的执行通道）。</div>
      <div class="flex flex-col gap-2 sm:flex-row">
        <select
          v-model="selectedMcpTool"
          class="sm:w-64 border border-zinc-200 rounded-lg px-3 py-2 text-sm dark:bg-zinc-800/60 dark:border-zinc-700"
        >
          <option value="">选择工具…</option>
          <option v-for="t in mcpTools" :key="t.name" :value="t.name">{{ t.name }}</option>
        </select>
        <button
          class="px-3 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
          :disabled="mcpBusy"
          @click="runMcpTest"
        >{{ mcpBusy ? '执行中…' : '执行工具' }}</button>
      </div>

      <div v-if="selectedToolInfo" class="mt-3 rounded-lg bg-zinc-50/60 dark:bg-zinc-800/50 p-3">
        <div v-if="selectedToolInfo.description" class="text-xs text-zinc-600 dark:text-zinc-300 mb-2">{{ selectedToolInfo.description }}</div>
        <div v-if="selectedToolParams.length" class="space-y-1">
          <div class="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">参数</div>
          <div
            v-for="p in selectedToolParams"
            :key="p.name"
            class="text-xs flex flex-wrap items-baseline gap-x-2"
          >
            <code class="text-indigo-600 dark:text-indigo-300">{{ p.name }}</code>
            <span class="text-zinc-400">{{ p.type }}</span>
            <span v-if="p.required" class="text-red-500">必填</span>
            <span v-else class="text-zinc-400">可选</span>
            <span class="text-zinc-500 dark:text-zinc-400 w-full sm:w-auto">{{ p.description }}</span>
          </div>
        </div>
        <div v-else class="text-xs text-zinc-400">该工具无参数，可直接执行。</div>
        <div v-if="selectedToolParams.length" class="mt-2 flex gap-2">
          <button class="px-2 py-1 text-[11px] rounded border border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700" @click="fillMcpArgsTemplate(true)">填必填模板</button>
          <button class="px-2 py-1 text-[11px] rounded border border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700" @click="fillMcpArgsTemplate(false)">填全部参数</button>
        </div>
      </div>

      <textarea
        v-model="mcpArgsText"
        rows="4"
        class="mt-2 w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm font-mono dark:bg-zinc-800/60 dark:border-zinc-700"
        placeholder='{"query": "示例参数"}'
      ></textarea>
      <pre
        v-if="mcpResult"
        class="mt-2 text-xs rounded-lg p-3 overflow-x-auto max-h-72 whitespace-pre-wrap"
        :class="mcpResult.ok ? 'bg-zinc-100/60 text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200' : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'"
      >{{ mcpResult.text }}</pre>
    </section>
  </div>
</template>
