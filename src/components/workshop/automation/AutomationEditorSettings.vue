<script setup lang="ts">
import type { DeviceMcpScope } from '@/api/devices'
import type { DeviceLike, EditorDraft, StepEditor } from './automationTypes'

defineProps<{
  editor: EditorDraft
  editorSteps: StepEditor[]
  ownerIds: number[]
  accessMemberOptions: Array<{ id: number; name: string; role: string; enabled: boolean }>
  aiMemberOptions: Array<{ id: number; name: string }>
  onlineDevices: DeviceLike[]
  defaultDeviceId: string
  deviceScopes: Record<string, DeviceMcpScope>
  deviceToolsLoading: boolean
  deviceToolsError: string
  cardSettingsOpen: boolean
  deviceSettingsOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'update:defaultDeviceId', value: string): void
  (e: 'close-card-settings', save: boolean): void
  (e: 'close-device-settings', save: boolean): void
}>()
</script>

<template>
  <div v-if="cardSettingsOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/55 p-4" @click.self="emit('close-card-settings', false)">
    <section class="automation-editor-section max-h-[85vh] w-full max-w-5xl overflow-auto rounded-xl border p-4 shadow-2xl">
      <header class="flex items-center justify-between gap-3"><div class="text-sm font-semibold">卡片设置</div><button class="rounded border px-2 py-1 text-xs" @click="emit('close-card-settings', false)">✕</button></header>
      <div class="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-4">
        <label class="text-[10px] text-zinc-500">名称<input v-model="editor.name" class="mt-1 w-full rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950" /></label>
        <label class="text-[10px] text-zinc-500">标签（逗号分隔）<input v-model="editor.tags" class="mt-1 w-full rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950" /></label>
        <label class="text-[10px] text-zinc-500">风险等级<select v-model="editor.riskLevel" class="mt-1 w-full rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"><option value="read_only">只读</option><option value="normal_change">普通变更</option><option value="high_risk">高风险</option></select></label>
        <label class="text-[10px] text-zinc-500">入口步骤<select v-model="editor.startStepId" class="mt-1 w-full rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"><option v-for="step in editorSteps" :key="step.id" :value="step.id">{{ step.title || step.id }}</option></select></label>
        <label class="md:col-span-2 lg:col-span-4 text-[10px] text-zinc-500">说明<textarea v-model="editor.description" rows="2" class="mt-1 w-full rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950" /></label>
        <label class="text-[10px] text-zinc-500">总超时（秒）<input v-model.number="editor.timeoutSeconds" type="number" class="mt-1 w-full rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950" /></label>
        <label class="text-[10px] text-zinc-500">最大推进次数<input v-model.number="editor.maxTransitions" type="number" class="mt-1 w-full rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950" /></label>
        <label class="md:col-span-2 text-[10px] text-zinc-500">输入 JSON Schema<textarea v-model="editor.inputSchemaText" rows="6" class="mt-1 w-full rounded border p-2 font-mono text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label>
        <label class="md:col-span-2 text-[10px] text-zinc-500">输出映射<textarea v-model="editor.outputText" rows="6" class="mt-1 w-full rounded border p-2 font-mono text-[10px] dark:border-zinc-700 dark:bg-zinc-950" /></label>
      </div>
      <div class="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 dark:border-indigo-500/20 dark:bg-indigo-500/5">
        <div class="text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">允许调用的 AI 成员</div>
        <div class="mt-2 flex flex-wrap gap-3 text-[10px] text-zinc-600 dark:text-zinc-300">
          <label class="flex items-center gap-1"><input v-model="editor.accessScope" type="radio" value="all" /> 所有成员</label>
          <label class="flex items-center gap-1" :class="{ 'opacity-40': ownerIds.length === 0 }"><input v-model="editor.accessScope" type="radio" value="owner" :disabled="ownerIds.length === 0" /> 仅创建者</label>
          <label class="flex items-center gap-1"><input v-model="editor.accessScope" type="radio" value="selected" /> 指定成员</label>
        </div>
        <div v-if="editor.accessScope === 'selected'" class="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          <label v-for="member in accessMemberOptions" :key="member.id" class="flex items-center gap-2 rounded border bg-white/70 px-2 py-1.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-900/60">
            <input v-model="editor.allowedAiConfigIds" type="checkbox" :value="member.id" />
            <span class="min-w-0 flex-1 truncate">{{ member.name }}</span>
            <span class="shrink-0 text-[9px] text-zinc-400">{{ member.role }}{{ member.enabled ? '' : ' · 已停用' }}</span>
          </label>
          <div v-if="accessMemberOptions.length === 0" class="text-[10px] text-zinc-400">暂无可选 AI 成员。</div>
        </div>
        <div v-else-if="editor.accessScope === 'owner'" class="mt-2 text-[10px] text-zinc-400">创建者：{{ ownerIds.map(id => aiMemberOptions.find(member => member.id === id)?.name || `成员 ${id}`).join('、') }}</div>
        <div class="mt-2 text-[9px] text-zinc-400">管理员或辅助管理员创建时默认全员可调用；普通成员创建时默认仅自己可调用。</div>
      </div>
      <footer class="mt-4 flex justify-end gap-2"><button class="rounded border px-3 py-1.5 text-xs" @click="emit('close-card-settings', false)">取消</button><button class="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white" @click="emit('close-card-settings', true)">保存设置</button></footer>
    </section>
  </div>

  <div v-if="deviceSettingsOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/55 p-4" @click.self="emit('close-device-settings', false)">
    <section class="contract-device-select w-full max-w-3xl rounded-xl border shadow-2xl">
      <header class="flex items-center justify-between gap-3 px-3 py-2.5 text-xs"><span class="font-semibold">跨设备 MCP</span><button class="rounded border px-2 py-1" @click="emit('close-device-settings', false)">✕</button></header>
      <div class="contract-device-options border-t p-2.5">
        <div class="rounded border p-2 text-[10px] dark:border-zinc-700">所有当前可用设备都会自动提供给 MCP 节点；保存时只冻结节点实际引用的设备和工具。</div>
        <label class="mt-2 block text-[10px] text-zinc-500">可选默认设备<select :value="defaultDeviceId" class="mt-1 w-full rounded border px-2 py-1.5 font-mono text-[10px] dark:border-zinc-700 dark:bg-zinc-950" @change="emit('update:defaultDeviceId', ($event.target as HTMLSelectElement).value)"><option value="">由各节点决定</option><option v-for="device in onlineDevices" :key="device.id" :value="device.id">{{ device.name || '未命名设备' }} · {{ device.id }}</option></select></label>
        <div class="mt-2 text-[10px] leading-5 text-zinc-500">
          <span v-if="deviceToolsLoading">正在读取所选设备的 MCP 工具…</span>
          <span v-else-if="deviceToolsError" class="text-rose-500">{{ deviceToolsError }}</span>
          <span v-else>已读取 {{ Object.keys(deviceScopes).length }} 台可用设备的独立工具清单。</span>
          每个 MCP 节点可分别选择任意设备及其工具。
        </div>
      </div>
      <footer class="flex justify-end gap-2 border-t p-3"><button class="rounded border px-3 py-1.5 text-xs" @click="emit('close-device-settings', false)">取消</button><button class="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white" @click="emit('close-device-settings', true)">保存设置</button></footer>
    </section>
  </div>
</template>
