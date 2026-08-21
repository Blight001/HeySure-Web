<script setup lang="ts">
import type { DeviceMcpScope } from '@/api/devices'
import type { WorkflowCard, WorkflowStepType } from '@/api/workflowCards'
import type { DeviceLike, StepEditor } from './automationTypes'

defineProps<{
  selectedStep: StepEditor | null
  startStepId: string
  inputSchemaText: string
  outputText: string
  terminal: boolean
  onlineDevices: DeviceLike[]
  deviceScopes: Record<string, DeviceMcpScope>
  deviceToolsLoading: boolean
  deviceToolsError: string
  cards: WorkflowCard[]
  currentCardId: string
}>()

const emit = defineEmits<{
  (e: 'set-start', id: string): void
  (e: 'update:input-schema-text', value: string): void
  (e: 'update:output-text', value: string): void
  (e: 'remove'): void
  (e: 'change-device', step: StepEditor): void
  (e: 'scaffold', step: StepEditor): void
  (e: 'set-argument', payload: { step: StepEditor; name: string; schema: any; event: Event }): void
}>()

const toolDefs = (row: StepEditor, scopes: Record<string, DeviceMcpScope>) => scopes[row.deviceId]?.toolDefs || {}
const toolNames = (row: StepEditor, scopes: Record<string, DeviceMcpScope>) => Object.keys(toolDefs(row, scopes)).sort()
const toolProperties = (row: StepEditor, scopes: Record<string, DeviceMcpScope>) => (
  Object.entries<any>(toolDefs(row, scopes)[row.tool]?.input_schema?.properties || {})
)
const argumentValue = (row: StepEditor, name: string) => {
  try {
    return JSON.parse(row.argumentsText || '{}')?.[name] ?? ''
  } catch {
    return ''
  }
}
const stepKinds = ['mcp', 'condition', 'delay', 'ai', 'card'] as WorkflowStepType[]
const selectCard = (row: StepEditor, event: Event, cards: WorkflowCard[]) => {
  const id = (event.target as HTMLSelectElement).value
  const card = cards.find(item => item.id === id)
  row.cardId = id
  row.cardVersionId = card?.latest_version_id || ''
  row.cardName = card?.name || ''
  if (card && (!row.title || row.title.startsWith('引用卡片'))) row.title = card.name
}
</script>

<template>
  <aside class="automation-editor-inspector">
    <template v-if="selectedStep">
      <div class="flex items-center justify-between gap-2">
        <div class="automation-editor-subtitle text-xs font-semibold">节点属性</div>
        <div class="flex gap-1">
          <button class="rounded border px-2 py-1 text-[9px] text-indigo-600" @click="emit('set-start', selectedStep.id)">设为入口</button>
          <button class="rounded border border-rose-200 px-2 py-1 text-[9px] text-rose-500" @click="emit('remove')">删除</button>
        </div>
      </div>
      <div class="mt-3 grid gap-2">
        <label class="text-[9px] text-zinc-500">步骤标题<input v-model="selectedStep.title" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label>
        <label class="text-[9px] text-zinc-500">类型<select v-model="selectedStep.type" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950"><option v-for="kind in stepKinds" :key="kind">{{ kind }}</option></select></label>
        <label v-if="selectedStep.id === startStepId" class="text-[9px] text-zinc-500">
          流程输入 JSON Schema
          <textarea :value="inputSchemaText" rows="6" class="mt-1 w-full rounded border p-1.5 font-mono text-[10px] dark:border-zinc-700 dark:bg-zinc-950" @input="emit('update:input-schema-text', ($event.target as HTMLTextAreaElement).value)" />
        </label>
        <label v-if="terminal" class="text-[9px] text-zinc-500">
          流程输出映射
          <textarea :value="outputText" rows="6" class="mt-1 w-full rounded border p-1.5 font-mono text-[10px] dark:border-zinc-700 dark:bg-zinc-950" @input="emit('update:output-text', ($event.target as HTMLTextAreaElement).value)" />
        </label>

        <template v-if="selectedStep.type === 'mcp'">
          <label class="text-[9px] text-zinc-500">节点执行设备<select v-model="selectedStep.deviceId" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" @change="emit('change-device', selectedStep)"><option value="">选择任意可用设备</option><option v-for="device in onlineDevices" :key="device.id" :value="device.id">{{ device.name || '未命名设备' }} · {{ device.id }} · {{ device.deviceType || device.platform }}</option></select></label>
          <label class="text-[9px] text-zinc-500">设备工具<select v-model="selectedStep.tool" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" @change="emit('scaffold', selectedStep)"><option value="">{{ deviceToolsLoading ? '正在加载设备工具…' : deviceToolsError ? '设备工具加载失败' : !selectedStep.deviceId ? '请先选择节点绑定设备' : toolNames(selectedStep, deviceScopes).length ? '选择该设备的工具' : '该设备没有可用工具' }}</option><option v-if="selectedStep.tool && !toolNames(selectedStep, deviceScopes).includes(selectedStep.tool)" :value="selectedStep.tool" disabled>{{ selectedStep.tool }}（绑定设备当前未上报）</option><option v-for="tool in toolNames(selectedStep, deviceScopes)" :key="tool">{{ tool }}</option></select></label>
          <label class="text-[9px] text-zinc-500">结果保存为<input v-model="selectedStep.saveAs" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label>
          <label class="text-[9px] text-zinc-500">参数模板<textarea v-model="selectedStep.argumentsText" rows="6" class="mt-1 w-full rounded border p-1.5 font-mono text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label>
          <div v-if="toolProperties(selectedStep, deviceScopes).length" class="grid gap-1 rounded border border-dashed border-zinc-200 p-2 dark:border-zinc-700">
            <div class="text-[9px] font-medium text-zinc-500">Schema 参数</div>
            <label v-for="([name, schema]) in toolProperties(selectedStep, deviceScopes)" :key="name" class="text-[9px] text-zinc-500">
              {{ name }}<span v-if="(toolDefs(selectedStep, deviceScopes)[selectedStep.tool]?.input_schema?.required || []).includes(name)" class="text-rose-500"> *</span>
              <select v-if="schema.type === 'boolean'" :value="String(argumentValue(selectedStep, name))" class="mt-0.5 w-full rounded border p-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" @change="emit('set-argument', { step: selectedStep, name, schema, event: $event })"><option value="true">true</option><option value="false">false</option></select>
              <input v-else :type="schema.type === 'number' || schema.type === 'integer' ? 'number' : 'text'" :value="argumentValue(selectedStep, name)" :placeholder="schema.description || schema.type" class="mt-0.5 w-full rounded border p-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" @input="emit('set-argument', { step: selectedStep, name, schema, event: $event })" />
            </label>
          </div>
          <details class="rounded border border-zinc-200 p-2 dark:border-zinc-700">
            <summary class="cursor-pointer text-[9px] font-medium text-zinc-500">重试与结果设置</summary>
            <div class="mt-2 grid grid-cols-2 gap-1">
              <label class="text-[9px] text-zinc-500">超时<input v-model.number="selectedStep.timeoutSeconds" type="number" class="mt-0.5 w-full rounded border p-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label>
              <label class="text-[9px] text-zinc-500">最大尝试<input v-model.number="selectedStep.maxAttempts" type="number" min="1" max="10" class="mt-0.5 w-full rounded border p-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label>
              <label class="text-[9px] text-zinc-500">退避<select v-model="selectedStep.backoff" class="mt-0.5 w-full rounded border p-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-950"><option value="fixed">固定</option><option value="exponential">指数</option></select></label>
              <label class="text-[9px] text-zinc-500">重试等待<input v-model.number="selectedStep.retryDelay" type="number" class="mt-0.5 w-full rounded border p-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label>
              <label class="col-span-2 text-[9px] text-zinc-500">结果投影<input v-model="selectedStep.projection" class="mt-0.5 w-full rounded border p-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" placeholder="字段以逗号分隔" /></label>
            </div>
          </details>
        </template>

        <label v-else-if="selectedStep.type === 'condition'" class="text-[9px] text-zinc-500">条件表达式<textarea v-model="selectedStep.expressionText" rows="8" class="mt-1 w-full rounded border p-1.5 font-mono text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label>
        <label v-else-if="selectedStep.type === 'delay'" class="text-[9px] text-zinc-500">延迟秒数<input v-model.number="selectedStep.delaySeconds" type="number" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label>
        <template v-else-if="selectedStep.type === 'ai'">
          <label class="text-[9px] text-zinc-500">到达节点后 AI 要完成的任务<textarea v-model="selectedStep.message" rows="5" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label>
          <label class="text-[9px] text-zinc-500">AI 返回参数保存为<input v-model="selectedStep.saveAs" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" placeholder="ai_review" /></label>
          <label class="text-[9px] text-zinc-500">AI 处理超时<input v-model.number="selectedStep.timeoutSeconds" type="number" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label>
          <div class="rounded bg-sky-50 p-2 text-[9px] text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">运行到此节点会暂停，并把此前完整步骤轨迹和本节点任务交给 AI；AI 完成后返回的参数可在后续节点中用 ${steps.保存名.result.字段} 引用。</div>
        </template>
        <template v-else-if="selectedStep.type === 'card'">
          <label class="text-[9px] text-zinc-500">引用卡片
            <select :value="selectedStep.cardId" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" @change="selectCard(selectedStep, $event, cards)">
              <option value="">请选择卡片</option>
              <option v-for="card in cards.filter(item => item.id !== currentCardId)" :key="card.id" :value="card.id">{{ card.name }}</option>
            </select>
          </label>
          <label class="text-[9px] text-zinc-500">输入映射<textarea v-model="selectedStep.cardInputText" rows="5" class="mt-1 w-full rounded border p-1.5 font-mono text-[10px] dark:border-zinc-700 dark:bg-zinc-950" placeholder='{"value":"${input.value}"}' /></label>
          <label class="text-[9px] text-zinc-500">返回结果保存为<input v-model="selectedStep.saveAs" class="mt-1 w-full rounded border p-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-950" placeholder="child_result" /></label>
          <div class="rounded bg-indigo-50 p-2 text-[9px] text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">双击画布中的引用节点可进入该卡片；父卡片会固定当前所选版本。</div>
        </template>
      </div>
    </template>
  </aside>
</template>
